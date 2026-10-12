import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import type { Address, Hex } from "viem";
import type { Collection, MintDestination } from "./types";
import { collectionHomeLedger, homeLedgerToMintDestination, isEvmHomeLedger } from "./home-ledger";
import { collectionHomeEvmAddress } from "./collection-spoke";
import { explorerTxUrl } from "./chain-registry";
import { getPlatformSecretKey } from "./platform-key";
import { getDirectRpcUrl, getSolanaNetwork } from "./solana-config";
import { buildCollectorSolanaDebitTx } from "./home-debit";
import {
  collectionEvmAddress,
  encodeDebit,
  encodeL1MintFromHome,
  encodeMintTo,
  l1RemoteOrThrow,
  sendMinterTx,
} from "./evm-collection";
import { getAvalancheL1RpcUrl } from "./avalanche-config";
import { isAllowedL1Remote } from "./l1-allowlist";
import { mintDestinationToSpokeChain } from "./evm-spoke-chains";
import type { EvmSpokeChainId } from "./evm-spoke-chains";
import { executeSolanaSpokeMint } from "./solana-spoke-mint";

export type RelayerMintResult = {
  homeDebitTx?: string;
  mintTxHash: Hex | string;
  explorerUrl: string;
  contract: Address | string;
};

export async function executeOmnichainRelayerMint(params: {
  collection: Collection;
  dryRun: import("./mint-dry-run-store").MintDryRunRecord;
  uri: string;
}): Promise<RelayerMintResult> {
  const { collection, dryRun, uri } = params;
  const tokenId = dryRun.tokenId;
  const destination = dryRun.destination;
  const recipient = dryRun.recipient;
  const home = collectionHomeLedger(collection);

  let homeDebitTx = params.collection.tokens.find((t) => t.tokenId === tokenId)?.homeDebitTx ?? undefined;

  if (dryRun.offHome && !homeDebitTx) {
    if (isEvmHomeLedger(home)) {
      const contract = collectionHomeEvmAddress(collection, home);
      if (!contract) throw new Error("EVM home contract is not set");
      const spokeChain = mintDestinationToSpokeChain(home) as EvmSpokeChainId;
      const data = encodeDebit({
        tokenId,
        uri,
        destination,
        home,
      });
      const sent = await sendMinterTx({
        to: contract as Address,
        data,
        destination: home,
        spokeChain,
      });
      homeDebitTx = sent.txHash;
    } else if (home === "solana") {
      const key = getPlatformSecretKey();
      if (!key) throw new Error("Platform Solana key missing for omnichain home debit");
      const payer = Keypair.fromSecretKey(key);
      const built = await buildCollectorSolanaDebitTx({
        payer: payer.publicKey.toBase58(),
        collectionId: collection.id,
        tokenId,
        destination,
      });
      const conn = new Connection(getDirectRpcUrl(getSolanaNetwork()), "confirmed");
      const transaction = Transaction.from(Buffer.from(built.txBase64, "base64"));
      transaction.sign(payer);
      homeDebitTx = await sendAndConfirmTransaction(conn, transaction, [payer], {
        commitment: "confirmed",
      });
    } else {
      throw new Error("Unsupported home ledger for relayer debit");
    }
  }

  if (destination === "solana") {
    const token = collection.tokens.find((t) => t.tokenId === tokenId);
    const name = `${collection.name} #${tokenId}`;
    const minted = await executeSolanaSpokeMint({
      collection,
      tokenId,
      name,
      metadataUri: uri,
      recipient,
    });
    return {
      homeDebitTx,
      mintTxHash: minted.txSignature,
      explorerUrl: explorerTxUrl("solana", minted.txSignature),
      contract: minted.assetAddress,
    };
  }

  const contract = resolveSpokeContract(collection, destination);
  const homeForEncode = home;
  const mintData =
    destination === "avalanche_l1"
      ? encodeL1MintFromHome({
          to: recipient as Address,
          tokenId,
          uri,
        })
      : encodeMintTo({
          to: recipient as Address,
          tokenId,
          uri,
          destination,
          home: homeForEncode,
        });

  const rpcUrl = destination === "avalanche_l1" ? getAvalancheL1RpcUrl() || undefined : undefined;
  const spokeChain =
    destination === "avalanche_l1" ? "avalanche" : mintDestinationToSpokeChain(destination);
  const sent = await sendMinterTx({
    to: contract,
    data: mintData,
    rpcUrl,
    destination,
    spokeChain: spokeChain ?? "avalanche",
  });

  return {
    homeDebitTx,
    mintTxHash: sent.txHash,
    explorerUrl: relayerMintExplorerUrl(destination, sent.txHash),
    contract,
  };
}

function resolveSpokeContract(collection: Collection, destination: MintDestination): Address {
  if (destination === "avalanche_l1") {
    const remote = l1RemoteOrThrow(collection);
    if (!isAllowedL1Remote(collection, remote)) {
      throw new Error("L1 remote is not on the Ginger allowlist");
    }
    return remote;
  }
  const spoke = collectionEvmAddress(collection, destination);
  if (!spoke) throw new Error("EVM spoke collection is not deployed for this destination");
  return spoke;
}

export function relayerMintExplorerUrl(destination: MintDestination, txHash: string): string {
  return explorerTxUrl(destination, txHash);
}

/** @internal test helper */
export function relayerHomeDest(collection: Collection): MintDestination {
  return homeLedgerToMintDestination(collectionHomeLedger(collection));
}
