import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { Collection, MintDestination } from "./types";
import { collectionHomeLedger, isEvmHomeLedger } from "./home-ledger";
import { collectionHomeEvmAddress } from "./collection-spoke";
import { mintDestinationToSpokeChain } from "./evm-spoke-chains";
import { getDirectRpcUrl, getSolanaNetwork } from "./solana-config";
import { getPlatformSecretKey } from "./platform-key";
import {
  estimateEvmGas,
  minterAccount,
  signUserDebitAuthorization,
  simulateEvmCall,
} from "./evm-collection";
import type { Address } from "viem";
import type { EvmSpokeChainId } from "./evm-spoke-chains";

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function tokenAlreadyIssued(collection: Collection, tokenId: number): boolean {
  const token = collection.tokens.find((t) => t.tokenId === tokenId);
  return Boolean(token?.owner || token?.location || token?.homeDebitTx);
}

export async function simulateHomeDebit(params: {
  collection: Collection;
  tokenId: number;
  destination: MintDestination;
  uri: string;
}): Promise<{ feeLamports?: number; feeWei?: string; ok: true }> {
  const home = collectionHomeLedger(params.collection);
  if (home === "solana") {
    const key = getPlatformSecretKey();
    if (!key) throw new Error("Platform Solana key missing for home debit dry-run");
    const feePayer = Keypair.fromSecretKey(key);
    const conn = new Connection(getDirectRpcUrl(getSolanaNetwork()), "confirmed");
    const { blockhash } = await conn.getLatestBlockhash("confirmed");
    const tx = buildSolanaDebitMemo(feePayer.publicKey, params.collection.id, params.tokenId, params.destination);
    tx.recentBlockhash = blockhash;
    tx.feePayer = feePayer.publicKey;
    const sim = await conn.simulateTransaction(tx);
    if (sim.value.err) {
      throw new Error(`Home debit simulation failed: ${JSON.stringify(sim.value.err)}`);
    }
    const fee = await conn.getFeeForMessage(tx.compileMessage(), "confirmed");
    return { ok: true, feeLamports: fee.value ?? 5000 };
  }

  const contract = collectionHomeEvmAddress(params.collection, home);
  if (!contract) throw new Error("Home EVM collection contract is not set");
  const spokeChain = mintDestinationToSpokeChain(home) as EvmSpokeChainId;
  const authz = await signUserDebitAuthorization({
    contract: contract as Address,
    tokenId: params.tokenId,
    uri: params.uri,
    destination: params.destination,
    home,
  });
  const account = minterAccount(spokeChain).address;
  await simulateEvmCall({ to: contract as Address, data: authz.data, account, spokeChain });
  const est = await estimateEvmGas({ to: contract as Address, data: authz.data, account, spokeChain });
  return { ok: true, feeWei: est.feeWei.toString() };
}

export async function buildCollectorSolanaDebitTx(params: {
  payer: string;
  collectionId: string;
  tokenId: number;
  destination: MintDestination;
}): Promise<{ txBase64: string }> {
  const payer = new PublicKey(params.payer);
  const conn = new Connection(getDirectRpcUrl(getSolanaNetwork()), "confirmed");
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const tx = buildSolanaDebitMemo(payer, params.collectionId, params.tokenId, params.destination);
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer;
  return {
    txBase64: Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString(
      "base64",
    ),
  };
}

/** @deprecated Use prepareEvmHomeDebit */
export async function prepareAvalancheHomeDebit(params: {
  collection: Collection;
  tokenId: number;
  destination: MintDestination;
  uri: string;
  simulateFrom: Address;
}): Promise<{ to: Address; data: `0x${string}`; deadline: string }> {
  return prepareEvmHomeDebit(params);
}

export async function prepareEvmHomeDebit(params: {
  collection: Collection;
  tokenId: number;
  destination: MintDestination;
  uri: string;
  simulateFrom: Address;
}): Promise<{ to: Address; data: `0x${string}`; deadline: string; spokeChain: EvmSpokeChainId }> {
  const home = collectionHomeLedger(params.collection);
  if (!isEvmHomeLedger(home)) throw new Error("Home is not an EVM ledger");
  const contract = collectionHomeEvmAddress(params.collection, home);
  if (!contract) throw new Error("Home EVM collection contract is not set");
  const spokeChain = mintDestinationToSpokeChain(home) as EvmSpokeChainId;
  const authz = await signUserDebitAuthorization({
    contract: contract as Address,
    tokenId: params.tokenId,
    uri: params.uri,
    destination: params.destination,
    home,
  });
  await simulateEvmCall({
    to: contract as Address,
    data: authz.data,
    account: params.simulateFrom,
    spokeChain,
  });
  return {
    to: contract as Address,
    data: authz.data,
    deadline: authz.deadline.toString(),
    spokeChain,
  };
}

function buildSolanaDebitMemo(
  feePayer: PublicKey,
  collectionId: string,
  tokenId: number,
  destination: MintDestination,
): Transaction {
  const memo = `ginger-debit:${collectionId}:${tokenId}:${destination}`;
  return new Transaction().add(
    new TransactionInstruction({
      keys: [{ pubkey: feePayer, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM,
      data: Buffer.from(memo, "utf8"),
    }),
    SystemProgram.transfer({
      fromPubkey: feePayer,
      toPubkey: feePayer,
      lamports: 0,
    }),
  );
}
