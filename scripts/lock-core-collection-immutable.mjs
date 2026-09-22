#!/usr/bin/env node
/**
 * Lock Metaplex Core assets with ImmutableMetadata (platform update authority).
 *
 * Usage:
 *   npx tsx scripts/lock-core-collection-immutable.mjs --dry-run
 *   npx tsx scripts/lock-core-collection-immutable.mjs --execute --i-understand-mainnet
 *   npx tsx scripts/lock-core-collection-immutable.mjs --execute --collection <pubkey>
 */

import fs from "node:fs";
import path from "node:path";
import { Connection } from "@solana/web3.js";
import {
  createBaseUmi,
  createSignerFromKeypair,
  keypairIdentity,
  publicKey as umiPublicKey,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { dataViewSerializer } from "@metaplex-foundation/umi-serializer-data-view";
import { defaultProgramRepository } from "@metaplex-foundation/umi-program-repository";
import { web3JsEddsa } from "@metaplex-foundation/umi-eddsa-web3js";
import { web3JsTransactionFactory } from "@metaplex-foundation/umi-transaction-factory-web3js";
import {
  addPlugin,
  fetchAsset,
  fetchCollection,
  mplCore,
} from "@metaplex-foundation/mpl-core";
import { base64 } from "@metaplex-foundation/umi/serializers";

const ROOT = path.resolve(process.cwd());
const LAMPORTS_PER_SIG = 5000;
const DEFAULT_COLLECTIONS = [
  {
    label: "Dough Boi marketplace drop",
    address:
      process.env.DOUGH_BOI_CORE_COLLECTION?.trim() ||
      "3mQfmg9PkMzKU6HnLkQThcckNrvRtd7qx6YRdrDX7S25",
  },
  {
    label: "Dough Boi shared gift Core collection",
    address:
      process.env.CORE_COLLECTION_ADDRESS_MAINNET?.trim() ||
      process.env.CORE_COLLECTION_ADDRESS?.trim() ||
      "hRiamu3d97ujzHZGCkSjwLNj5GQ5nVnMsmfJqgxB9v7",
  },
];

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

function b58decode(s) {
  const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const bytes = [];
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

function attachMinimalFetchRpc(umi, rpcUrl, cluster = "mainnet-beta") {
  umi.rpc = {
    getEndpoint: () => rpcUrl,
    getCluster: () => cluster,
    async getAccount(pubkey) {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAccountInfo",
          params: [pubkey.toString(), { encoding: "base64", commitment: "confirmed" }],
        }),
      });
      const json = await res.json();
      const value = json.result?.value;
      if (!value) return { exists: false, publicKey: pubkey };
      return {
        exists: true,
        publicKey: pubkey,
        lamports: { basisPoints: BigInt(value.lamports ?? 0), identifier: "SOL", decimals: 9 },
        owner: value.owner,
        executable: value.executable ?? false,
        data: Buffer.from(value.data[0], "base64"),
      };
    },
    async getAccounts(pubkeys) {
      return Promise.all(pubkeys.map((pk) => this.getAccount(pk)));
    },
  };
}

async function rpcCall(rpcUrl, method, params) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

async function fetchAssetsByDas(rpcUrl, collectionAddress) {
  const assets = [];
  let page = 1;
  while (true) {
    const result = await rpcCall(rpcUrl, "getAssetsByGroup", {
      groupKey: "collection",
      groupValue: collectionAddress,
      page,
      limit: 1000,
    });
    const items = result?.items ?? [];
    if (!items.length) break;
    for (const item of items) {
      assets.push({
        id: item.id,
        name: item.content?.metadata?.name ?? item.id,
      });
    }
    if (items.length < 1000) break;
    page += 1;
  }
  return assets;
}

async function sendLockTx(params) {
  const { umi, rpcUrl, connection, platformSigner, collectionAddress, assetAddress } = params;
  const collection = await fetchCollection(umi, collectionAddress);
  const blockhash = await connection.getLatestBlockhash("confirmed");

  const tx = await transactionBuilder()
    .add(
      addPlugin(umi, {
        asset: umiPublicKey(assetAddress),
        collection,
        payer: platformSigner,
        authority: platformSigner,
        plugin: { type: "ImmutableMetadata" },
      }),
    )
    .setBlockhash(blockhash.blockhash)
    .buildAndSign(umi);

  const txBase64 = base64.deserialize(umi.transactions.serialize(tx))[0];
  const sig = await rpcCall(rpcUrl, "sendTransaction", [
    txBase64,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]);
  await connection.confirmTransaction(
    { signature: sig, blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}

loadEnvLocal();

const dryRun = process.argv.includes("--dry-run");
const execute = process.argv.includes("--execute");
const mainnetOk = process.argv.includes("--i-understand-mainnet");

if (!dryRun && !execute) {
  console.error("Pass --dry-run or --execute --i-understand-mainnet");
  process.exit(1);
}

if (execute && !mainnetOk) {
  console.error("Live lock requires --i-understand-mainnet");
  process.exit(1);
}

const rpc =
  process.env.SOLANA_RPC_URL_MAINNET?.trim() ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET?.trim() ||
  "https://api.mainnet-beta.solana.com";

const rawKey = process.env.ARWEAVE_SOLANA_KEY?.trim();
if (!rawKey) {
  console.error("ARWEAVE_SOLANA_KEY missing from .env.local");
  process.exit(1);
}

const secret = rawKey.startsWith("[") ? new Uint8Array(JSON.parse(rawKey)) : b58decode(rawKey);

const umi = createBaseUmi();
umi.use(dataViewSerializer());
umi.use(defaultProgramRepository());
umi.use(web3JsEddsa());
umi.use(web3JsTransactionFactory());
umi.use(mplCore());
attachMinimalFetchRpc(umi, rpc);
umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(secret)));

const platformSigner = createSignerFromKeypair(
  umi,
  umi.eddsa.createKeypairFromSecretKey(secret),
);

const connection = new Connection(rpc, "confirmed");

const customIdx = process.argv.indexOf("--collection");
const collections =
  customIdx >= 0 && process.argv[customIdx + 1]
    ? [{ label: "Custom collection", address: process.argv[customIdx + 1].trim() }]
    : DEFAULT_COLLECTIONS;

console.log(`${dryRun ? "DRY RUN" : "EXECUTE"} — lock Core assets with ImmutableMetadata`);
console.log("Platform:", platformSigner.publicKey);
console.log("RPC:", rpc);
console.log("");

let locked = 0;
let skipped = 0;
let failed = 0;
let feeLamports = 0;

for (const { label, address } of collections) {
  console.log(`=== ${label} (${address}) ===`);
  let assets;
  try {
    assets = await fetchAssetsByDas(rpc, address);
  } catch (err) {
    console.error(`DAS fetch failed: ${err instanceof Error ? err.message : err}`);
    continue;
  }
  console.log(`Assets: ${assets.length}`);

  for (const asset of assets) {
    let detail;
    try {
      detail = await fetchAsset(umi, asset.id);
    } catch (err) {
      console.log(`  ? ${asset.name}: fetch failed — ${err instanceof Error ? err.message : err}`);
      failed += 1;
      continue;
    }

    if (detail.immutableMetadata) {
      console.log(`  — ${asset.name}: already immutable`);
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`  → ${asset.name} (${asset.id}): would lock`);
      locked += 1;
      feeLamports += LAMPORTS_PER_SIG;
      continue;
    }

    try {
      const sig = await sendLockTx({
        umi,
        rpcUrl: rpc,
        connection,
        platformSigner,
        collectionAddress: address,
        assetAddress: asset.id,
      });
      console.log(`  ✓ ${asset.name}: https://explorer.solana.com/tx/${sig}`);
      locked += 1;
      feeLamports += LAMPORTS_PER_SIG;
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      console.log(`  ✗ ${asset.name}: ${err instanceof Error ? err.message : err}`);
      failed += 1;
    }
  }
  console.log("");
}

console.log("=== Summary ===");
console.log(`Locked: ${locked}`);
console.log(`Skipped (already immutable): ${skipped}`);
console.log(`Failed: ${failed}`);
console.log(`Est. fees: ~${(feeLamports / 1e9).toFixed(6)} SOL`);

if (failed > 0) process.exitCode = 1;
