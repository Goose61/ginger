import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { Collection, MintDestination } from "./types";
import { collectionHomeChain } from "./chain-registry";
import { getDirectRpcUrl, getSolanaNetwork } from "./solana-config";
import { getPlatformSecretKey } from "./platform-key";
import {
  collectionEvmAddress,
  estimateEvmGas,
  minterAccount,
  signUserDebitAuthorization,
  simulateEvmCall,
} from "./evm-collection";
import type { Address } from "viem";

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
  const home = collectionHomeChain(params.collection);
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

  const contract = collectionEvmAddress(params.collection);
  if (!contract) throw new Error("Avalanche collection contract is not set");
  const authz = await signUserDebitAuthorization({
    contract,
    tokenId: params.tokenId,
    uri: params.uri,
    destination: params.destination,
    home,
  });
  const account = minterAccount().address;
  await simulateEvmCall({ to: contract, data: authz.data, account });
  const est = await estimateEvmGas({ to: contract, data: authz.data, account });
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

export async function prepareAvalancheHomeDebit(params: {
  collection: Collection;
  tokenId: number;
  destination: MintDestination;
  uri: string;
  simulateFrom: Address;
}): Promise<{ to: Address; data: `0x${string}`; deadline: string }> {
  const contract = collectionEvmAddress(params.collection);
  if (!contract) throw new Error("Avalanche collection contract is not set");
  const authz = await signUserDebitAuthorization({
    contract,
    tokenId: params.tokenId,
    uri: params.uri,
    destination: params.destination,
    home: collectionHomeChain(params.collection),
  });
  await simulateEvmCall({ to: contract, data: authz.data, account: params.simulateFrom });
  return { to: contract, data: authz.data, deadline: authz.deadline.toString() };
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
