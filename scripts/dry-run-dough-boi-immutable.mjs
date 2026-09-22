#!/usr/bin/env node
/**
 * Dry-run cost estimate to lock Dough Boi Core assets with ImmutableMetadata.
 *
 * Usage:
 *   npx tsx scripts/dry-run-dough-boi-immutable.mjs
 *   npx tsx scripts/dry-run-dough-boi-immutable.mjs --collection <core-collection-pubkey>
 */

import fs from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
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
    let result;
    try {
      result = await rpcCall(rpcUrl, "getAssetsByGroup", {
        groupKey: "collection",
        groupValue: collectionAddress,
        page,
        limit: 1000,
      });
    } catch (err) {
      if (page === 1) throw err;
      break;
    }
    const items = result?.items ?? [];
    if (!items.length) break;
    for (const item of items) {
      assets.push({
        id: item.id,
        name: item.content?.metadata?.name ?? item.id,
        mutable: item.mutable ?? null,
        interface: item.interface ?? null,
      });
    }
    if (items.length < 1000) break;
    page += 1;
  }
  return assets;
}

async function simulateAddImmutablePlugin(params) {
  const { umi, connection, platformSigner, collectionAddress, assetAddress } = params;
  const collection = await fetchCollection(umi, collectionAddress);

  const builder = transactionBuilder().add(
    addPlugin(umi, {
      asset: umiPublicKey(assetAddress),
      collection,
      payer: platformSigner,
      authority: platformSigner,
      plugin: { type: "ImmutableMetadata" },
    }),
  );

  const blockhash = await connection.getLatestBlockhash("confirmed");
  const tx = await builder
    .setBlockhash(blockhash.blockhash)
    .buildAndSign(umi);

  const serialized = umi.transactions.serialize(tx);
  const txBase64 = base64.deserialize(serialized)[0];
  const vtx = VersionedTransaction.deserialize(Buffer.from(txBase64, "base64"));

  const sim = await connection.simulateTransaction(vtx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
  });

  if (sim.value.err) {
    return {
      ok: false,
      error: JSON.stringify(sim.value.err),
      logs: sim.value.logs ?? [],
    };
  }

  const feeLamports = (sim.value.unitsConsumed ?? 0) > 0
    ? LAMPORTS_PER_SIG
    : LAMPORTS_PER_SIG;

  return {
    ok: true,
    unitsConsumed: sim.value.unitsConsumed ?? null,
    feeLamportsEstimate: feeLamports,
    logs: (sim.value.logs ?? []).slice(-4),
  };
}

async function countMongoAssets(slug) {
  try {
    const { getCollection } = await import("../src/lib/store.ts");
    const col = await getCollection(slug);
    if (!col) return null;
    const withAsset = col.tokens.filter((t) => t.assetAddress);
    return {
      slug: col.slug,
      name: col.name,
      mintedCount: col.mintedCount,
      supply: col.supply,
      coreCollectionAddress: col.coreCollectionAddress ?? null,
      tokensWithAssetAddress: withAsset.length,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

loadEnvLocal();

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
const platformKeypair = Keypair.fromSecretKey(secret);

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

console.log("Dough Boi immutability dry run");
console.log("RPC:", rpc);
console.log("Platform wallet:", platformKeypair.publicKey.toBase58());
console.log("Method: Metaplex Core addPlugin(ImmutableMetadata) per asset\n");

console.log("Mongo snapshot (may lag on-chain):");
for (const slug of ["dough-boi", "dough-boi-gifts"]) {
  const snap = await countMongoAssets(slug);
  console.log(`  ${slug}:`, snap);
}
console.log("");

let grandTotalAssets = 0;
let grandAlreadyImmutable = 0;
let grandNeedLock = 0;
let grandSimOk = 0;
let grandSimFail = 0;
const perAssetFees = [];

for (const { label, address } of collections) {
  console.log(`=== ${label} ===`);
  console.log(`Collection: ${address}`);

  let collectionMeta;
  try {
    collectionMeta = await fetchCollection(umi, address);
    console.log(`On-chain name: ${collectionMeta.name}`);
    console.log(`Update authority: ${collectionMeta.updateAuthority}`);
  } catch (err) {
    console.log(`Could not fetch collection account: ${err instanceof Error ? err.message : err}`);
    console.log("");
    continue;
  }

  let assets;
  try {
    assets = await fetchAssetsByDas(rpc, address);
    console.log(`Assets found (DAS getAssetsByGroup): ${assets.length}`);
  } catch (err) {
    console.log(`DAS listing failed: ${err instanceof Error ? err.message : err}`);
    console.log("(Try a DAS-enabled RPC such as Helius if this fails on public RPC.)");
    console.log("");
    continue;
  }

  if (!assets.length) {
    console.log("No assets to lock.\n");
    continue;
  }

  grandTotalAssets += assets.length;

  const sampleSize = Math.min(assets.length, 5);
  const sample = assets.slice(0, sampleSize);
  let collectionNeedLock = 0;
  let collectionAlready = 0;

  for (const asset of assets) {
    let detail;
    try {
      detail = await fetchAsset(umi, asset.id);
    } catch {
      collectionNeedLock += 1;
      continue;
    }
    if (detail.immutableMetadata) {
      collectionAlready += 1;
    } else {
      collectionNeedLock += 1;
    }
  }

  grandAlreadyImmutable += collectionAlready;
  grandNeedLock += collectionNeedLock;

  console.log(`Already immutable (ImmutableMetadata plugin): ${collectionAlready}`);
  console.log(`Need lock: ${collectionNeedLock}`);
  console.log(`Simulating ${sampleSize} sample tx(s)...`);

  for (const asset of sample) {
    const sim = await simulateAddImmutablePlugin({
      umi,
      connection,
      platformSigner,
      collectionAddress: address,
      assetAddress: asset.id,
    });
    if (sim.ok) {
      grandSimOk += 1;
      perAssetFees.push(sim.feeLamportsEstimate);
      console.log(
        `  ✓ ${asset.name} (${asset.id.slice(0, 8)}…): ~${(sim.feeLamportsEstimate / 1e9).toFixed(6)} SOL, ${sim.unitsConsumed ?? "?"} CU`,
      );
    } else {
      grandSimFail += 1;
      console.log(`  ✗ ${asset.name} (${asset.id.slice(0, 8)}…): ${sim.error}`);
      if (sim.logs?.length) console.log(`    logs: ${sim.logs.join(" | ")}`);
    }
  }

  const avgFee =
    perAssetFees.length > 0
      ? perAssetFees.reduce((a, b) => a + b, 0) / perAssetFees.length
      : LAMPORTS_PER_SIG;
  const estTotalSol = (collectionNeedLock * avgFee) / 1e9;

  console.log(`Estimated cost for ${collectionNeedLock} asset(s): ~${estTotalSol.toFixed(4)} SOL`);
  console.log(`  (avg ~${(avgFee / 1e9).toFixed(6)} SOL/tx at ${LAMPORTS_PER_SIG} lamports base fee + compute)`);
  console.log("");
}

console.log("=== Totals ===");
console.log(`Assets on-chain (listed collections): ${grandTotalAssets}`);
console.log(`Already immutable: ${grandAlreadyImmutable}`);
console.log(`Would need lock: ${grandNeedLock}`);
console.log(`Sample simulations OK / failed: ${grandSimOk} / ${grandSimFail}`);

if (perAssetFees.length && grandNeedLock > 0) {
  const avg = perAssetFees.reduce((a, b) => a + b, 0) / perAssetFees.length;
  const total = (grandNeedLock * avg) / 1e9;
  const buffer = total * 1.2;
  console.log(`\nEstimated total (all collections): ~${total.toFixed(4)} SOL`);
  console.log(`Recommended budget (+20% buffer): ~${buffer.toFixed(4)} SOL`);
}

if (grandSimFail > 0) {
  console.log("\nSome simulations failed — likely wrong update authority or asset already locked.");
  process.exitCode = 1;
}
