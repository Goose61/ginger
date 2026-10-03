/**
 * Create a Bubblegum V2 merkle tree + MPL-Core collection with the BubblegumV2 plugin.
 *
 * Official docs:
 *   https://www.metaplex.com/docs/smart-contracts/bubblegum-v2/create-trees
 *   https://www.metaplex.com/docs/smart-contracts/bubblegum-v2/mint-cnfts
 *   https://www.metaplex.com/docs/smart-contracts/core/plugins/bubblegum
 *
 * Depth 14 + buffer 64 + canopy 8 holds 16,384 cNFTs (~0.34 SOL tree rent).
 *
 *   npx tsx scripts/setup-bubblegum-tree.ts
 *   npx tsx scripts/setup-bubblegum-tree.ts --mainnet
 *
 * Pays from ARWEAVE_SOLANA_KEY. Prints env lines for .env.local / Vercel.
 */

import fs from "node:fs";
import path from "node:path";
import {
  generateSigner,
  keypairIdentity,
  createSignerFromKeypair,
} from "@metaplex-foundation/umi";
import { createTreeV2 } from "@metaplex-foundation/mpl-bubblegum";
import { createCollection, ruleSet } from "@metaplex-foundation/mpl-core";
import { base64 } from "@metaplex-foundation/umi/serializers";
import { createMintUmi, fetchLatestBlockhash } from "../src/lib/mint-umi";
import { getDirectRpcUrl, type SolanaNetwork } from "../src/lib/solana-config";
import { GIFT_COLLECTION_DISPLAY_NAME, GIFT_EXTERNAL_URL } from "../src/lib/gift-metadata";

const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const MIN_BALANCE_LAMPORTS = 400_000_000; // ~0.4 SOL for depth-14 tree + collection
const MAX_DEPTH = 14;
const MAX_BUFFER_SIZE = 64;
const CANOPY_DEPTH = 8;

function b58decode(s: string): Uint8Array {
  const bytes: number[] = [];
  for (const c of s.trim()) {
    let carry = ALPHA.indexOf(c);
    if (carry < 0) throw new Error("Invalid base58 in ARWEAVE_SOLANA_KEY");
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes.reverse());
}

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

async function sendTx(rpcUrl: string, txBase64: string): Promise<string> {
  return rpcCall<string>(rpcUrl, "sendTransaction", [
    txBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]);
}

async function confirmSig(rpcUrl: string, signature: string) {
  await rpcCall(rpcUrl, "confirmTransaction", [
    { signature, commitment: "confirmed" },
  ]).catch(() => undefined);
}

loadEnvLocal();

const mainnet = process.argv.includes("--mainnet");
const network: SolanaNetwork = mainnet ? "mainnet" : "devnet";
const dryRun = process.argv.includes("--dry-run");
const rawKey = process.env.ARWEAVE_SOLANA_KEY?.trim();
if (!rawKey) {
  console.error("ARWEAVE_SOLANA_KEY missing from .env.local");
  process.exit(1);
}

const secret = rawKey.startsWith("[") ? new Uint8Array(JSON.parse(rawKey) as number[]) : b58decode(rawKey);
const rpc = getDirectRpcUrl(network);
const umi = createMintUmi(network);
const authorityKeypair = umi.eddsa.createKeypairFromSecretKey(secret);
const authoritySigner = createSignerFromKeypair(umi, authorityKeypair);
umi.use(keypairIdentity(authorityKeypair));

const pubkey = authoritySigner.publicKey.toString();
console.log("=== Dough Boi — Bubblegum V2 gift tree ===\n");
console.log(`Network: ${network}`);
console.log(`Platform (tree creator / collection authority): ${pubkey}`);
console.log(`RPC: ${rpc}\n`);

const balance = await rpcCall<{ value: number }>(rpc, "getBalance", [pubkey]);
console.log(`Balance: ${(balance.value / 1e9).toFixed(6)} SOL`);
if (balance.value < MIN_BALANCE_LAMPORTS) {
  console.error(`\nNeed ~0.4 SOL on ${pubkey} for a depth-${MAX_DEPTH} tree.`);
  process.exit(1);
}

if (dryRun) {
  console.log("\n✓ Dry run OK — wallet funded.");
  process.exit(0);
}

const metadataUri =
  process.env.BUBBLEGUM_COLLECTION_URI?.trim() ||
  process.env.CORE_COLLECTION_URI?.trim() ||
  GIFT_EXTERNAL_URL;

console.log("\n1/2 Creating MPL-Core collection with BubblegumV2 + Royalties plugins…");
const collectionSigner = generateSigner(umi);
const blockhash1 = await fetchLatestBlockhash(rpc);
const collectionTx = await createCollection(umi, {
  collection: collectionSigner,
  name: GIFT_COLLECTION_DISPLAY_NAME.slice(0, 32),
  uri: metadataUri,
  plugins: [
    { type: "BubblegumV2" },
    {
      type: "Royalties",
      basisPoints: 0,
      creators: [{ address: authoritySigner.publicKey, percentage: 100 }],
      ruleSet: ruleSet("None"),
    },
  ],
})
  .useV0()
  .setBlockhash(blockhash1)
  .buildAndSign(umi);
const collectionSig = await sendTx(rpc, base64.deserialize(umi.transactions.serialize(collectionTx))[0]);
await confirmSig(rpc, collectionSig);
const collectionAddress = collectionSigner.publicKey.toString();
console.log(`   Collection: ${collectionAddress}`);
console.log(`   Tx: ${collectionSig}`);

console.log(`\n2/2 Creating Bubblegum V2 tree (depth ${MAX_DEPTH}, buffer ${MAX_BUFFER_SIZE}, canopy ${CANOPY_DEPTH})…`);
const merkleTree = generateSigner(umi);
const treeBuilder = await createTreeV2(umi, {
  merkleTree,
  maxDepth: MAX_DEPTH,
  maxBufferSize: MAX_BUFFER_SIZE,
  canopyDepth: CANOPY_DEPTH,
  public: false,
});
const blockhash2 = await fetchLatestBlockhash(rpc);
const treeTx = await treeBuilder.useV0().setBlockhash(blockhash2).buildAndSign(umi);
const treeSig = await sendTx(rpc, base64.deserialize(umi.transactions.serialize(treeTx))[0]);
const treeAddress = merkleTree.publicKey.toString();
console.log(`   Tree: ${treeAddress}`);
console.log(`   Tx: ${treeSig}`);

const suffix = network.toUpperCase();
console.log("\nPaste into .env.local and Vercel:\n");
console.log(`BUBBLEGUM_TREE_ADDRESS=${treeAddress}`);
console.log(`BUBBLEGUM_TREE_ADDRESS_${suffix}=${treeAddress}`);
console.log(`BUBBLEGUM_COLLECTION_ADDRESS=${collectionAddress}`);
console.log(`BUBBLEGUM_COLLECTION_ADDRESS_${suffix}=${collectionAddress}`);
console.log("\nGift mints will use mintV2 (no per-NFT rent). Paid collections stay Metaplex Core.");
