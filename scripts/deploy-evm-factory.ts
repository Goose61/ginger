/**
 * Deploy GingerNft implementation + GingerCollectionFactory on any catalog EVM chain.
 *
 * Uses AVALANCHE_MINTER_KEY from .env.local (same platform minter address as C-Chain).
 * Optional override: EVM_MINTER_KEY_<ENV_SUFFIX> (e.g. EVM_MINTER_KEY_POLYGON).
 *
 *   npm run deploy:evm-factory -- polygon
 *   npm run deploy:polygon-factory
 *
 * After deploy, set on Vercel (Production):
 *   EVM_FACTORY_ADDRESS_<ENV_SUFFIX>=0x...
 * Fund the minter with native gas on that chain.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getEvmNftChainDefinition,
  isEvmNftChainId,
  resolvedChainId,
  resolvedRpcUrl,
  type EvmNftChainDefinition,
} from "../src/lib/evm-nft-chain-catalog";
import { viemChainForSpokeId } from "../src/lib/evm-spoke-chains";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();

const ROOT = path.resolve(process.cwd());
const SOL_PATH = path.resolve(ROOT, "../contracts/avalanche/GingerNft.sol");

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function compile(): Record<string, { abi: unknown; bin: string }> {
  if (!fs.existsSync(SOL_PATH)) fail(`Missing ${SOL_PATH}`);
  const source = fs.readFileSync(SOL_PATH, "utf8");
  const input = JSON.stringify({
    language: "Solidity",
    sources: { "GingerNft.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  });
  const r = spawnSync("npx", ["--yes", "solc@0.8.24", "--standard-json"], {
    encoding: "utf8",
    input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (!r.stdout?.trim()) {
    fail(`solc failed.\n${r.stderr || ""}`);
  }
  const jsonStart = r.stdout.indexOf("{");
  if (jsonStart < 0) fail(`solc did not return JSON.\n${r.stdout.slice(0, 400)}`);
  const json = JSON.parse(r.stdout.slice(jsonStart)) as {
    errors?: { severity: string; formattedMessage?: string; message?: string }[];
    contracts?: Record<
      string,
      Record<string, { abi: unknown; evm?: { bytecode?: { object?: string } } }>
    >;
  };
  const errors = (json.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) {
    fail(errors.map((e) => e.formattedMessage || e.message).join("\n"));
  }
  const out: Record<string, { abi: unknown; bin: string }> = {};
  for (const [file, contracts] of Object.entries(json.contracts ?? {})) {
    for (const [name, c] of Object.entries(contracts)) {
      const object = c.evm?.bytecode?.object ?? "";
      out[`${file}:${name}`] = { abi: c.abi, bin: object.replace(/^0x/i, "") };
    }
  }
  return out;
}

function findContract(
  contracts: Record<string, { abi: unknown; bin: string }>,
  name: string,
) {
  const key =
    Object.keys(contracts).find((k) => k.endsWith(`:${name}`)) ??
    Object.keys(contracts).find((k) => k.includes(name));
  if (!key) fail(`Compiled output missing ${name}`);
  const c = contracts[key];
  if (!c.bin || c.bin === "0x") fail(`${name} has empty bytecode`);
  return c;
}

function minterPrivateKeyHex(def: EvmNftChainDefinition): Hex {
  const suffix = def.envSuffix;
  const override = process.env[`EVM_MINTER_KEY_${suffix}`]?.trim();
  const raw = override || (process.env.AVALANCHE_MINTER_KEY ?? "").trim();
  if (!raw) {
    fail(
      `Set AVALANCHE_MINTER_KEY in .env.local (or EVM_MINTER_KEY_${suffix}): hex private key that pays deploy gas.`,
    );
  }
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
}

function resolveChainId(): string {
  const arg = process.argv[2]?.trim() || process.env.DEPLOY_EVM_CHAIN?.trim() || "";
  if (!arg) {
    fail("Usage: npm run deploy:evm-factory -- <chainId>\nExample: npm run deploy:evm-factory -- polygon");
  }
  if (arg === "avalanche") {
    fail("Use npm run deploy:avalanche-factory for Avalanche (includes optional L1 stub).");
  }
  if (!isEvmNftChainId(arg)) {
    fail(`Unknown EVM chain "${arg}". Use a catalog id (e.g. polygon, base).`);
  }
  return arg;
}

async function main() {
  const chainId = resolveChainId();
  const def = getEvmNftChainDefinition(chainId);
  if (!def) fail(`No catalog entry for ${chainId}`);

  const key = minterPrivateKeyHex(def);
  const account = privateKeyToAccount(key);
  const chain = viemChainForSpokeId(chainId);
  const rpc = resolvedRpcUrl(def);
  const networkChainId = resolvedChainId(def);

  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain, transport: http(rpc) });

  console.log(`Chain: ${def.label} (${chainId})`);
  console.log(`Chain ID: ${networkChainId}`);
  console.log(`RPC: ${rpc}`);
  console.log(`Factory minter (collections + auth signer): ${account.address}`);

  const bal = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${Number(bal) / 1e18} ${def.nativeSymbol}`);
  if (bal === 0n) {
    fail(`Minter wallet has 0 ${def.nativeSymbol}. Fund it on ${def.label} before deploy.`);
  }

  console.log("Compiling GingerNft.sol…");
  const compiled = compile();
  const nft = findContract(compiled, "GingerNft");
  const factory = findContract(compiled, "GingerCollectionFactory");

  console.log("Deploying GingerNft implementation…");
  const implHash = await wallet.deployContract({
    abi: nft.abi as never,
    bytecode: `0x${nft.bin}` as Hex,
    account,
    chain,
  });
  const implReceipt = await publicClient.waitForTransactionReceipt({ hash: implHash });
  const implementation = implReceipt.contractAddress as Address;
  if (!implementation) fail("Implementation deploy returned no address");
  console.log(`  implementation ${implementation}`);

  console.log("Deploying GingerCollectionFactory…");
  const factoryHash = await wallet.deployContract({
    abi: factory.abi as never,
    bytecode: `0x${factory.bin}` as Hex,
    args: [implementation, account.address],
    account,
    chain,
  });
  const factoryReceipt = await publicClient.waitForTransactionReceipt({ hash: factoryHash });
  const factoryAddr = factoryReceipt.contractAddress as Address;
  if (!factoryAddr) fail("Factory deploy returned no address");
  console.log(`  factory ${factoryAddr}`);

  const envFactoryKey = `EVM_FACTORY_ADDRESS_${def.envSuffix}`;
  console.log("\nPaste into Vercel Production (and .env.local for local tests):\n");
  console.log(`${envFactoryKey}=${factoryAddr}`);
  console.log(`# Optional dedicated RPC:`);
  console.log(`# EVM_RPC_URL_${def.envSuffix}=...`);
  console.log(`# Relayer kill switch (default on when factory set):`);
  console.log(`# EVM_RELAYER_ENABLED_${def.envSuffix}=false`);
  console.log("\nFund this address with POL on Polygon for relayer mints:");
  console.log(account.address);
  console.log("\nMinter private key stays in .env.local: do not commit or paste in chat.");
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
