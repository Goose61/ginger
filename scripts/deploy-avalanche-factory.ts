/**
 * Deploy GingerNft implementation + EIP-1167 factory + Fuji L1 remote stub.
 *
 * Reads AVALANCHE_MINTER_KEY from .env.local (do not paste the key on the CLI).
 *
 *   npm run deploy:avalanche-factory
 *
 * Prints env lines to paste into .env.local. Defaults to Fuji (43113).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalanche, avalancheFuji } from "viem/chains";

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
const NETWORK = (process.env.AVALANCHE_NETWORK ?? process.env.NEXT_PUBLIC_AVALANCHE_NETWORK ?? "fuji") === "mainnet"
  ? "mainnet"
  : "fuji";
const RPC =
  NETWORK === "mainnet"
    ? (process.env.AVALANCHE_RPC_URL_MAINNET ?? "https://api.avax.network/ext/bc/C/rpc")
    : (process.env.AVALANCHE_RPC_URL_FUJI ?? "https://api.avax-test.network/ext/bc/C/rpc");
const L1_RPC = process.env.AVALANCHE_L1_RPC_URL?.trim() || RPC;

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

async function main() {
  const raw = (process.env.AVALANCHE_MINTER_KEY ?? "").trim();
  if (!raw) fail("Set AVALANCHE_MINTER_KEY in .env.local (hex private key that pays deploy gas).");
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  const account = privateKeyToAccount(key);
  const chain = NETWORK === "mainnet" ? avalanche : avalancheFuji;
  const publicClient = createPublicClient({ chain, transport: http(RPC) });
  const wallet = createWalletClient({ account, chain, transport: http(RPC) });
  const deployL1 =
    NETWORK === "fuji" ||
    Boolean(process.env.AVALANCHE_L1_RPC_URL?.trim() && process.env.AVALANCHE_L1_RPC_URL.trim() !== RPC);

  console.log(`Network: ${NETWORK} (${chain.id})`);
  console.log(`Minter (authorization signer): ${account.address}`);
  const bal = await publicClient.getBalance({ address: account.address });
  console.log(`Balance: ${Number(bal) / 1e18} AVAX`);
  if (bal === 0n) fail(`Minter wallet has 0 AVAX. Fund it on ${NETWORK} before deploy.`);
  if (!deployL1) {
    console.log("Skipping L1 remote (mainnet C-Chain only; set AVALANCHE_L1_RPC_URL for a real L1).");
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

  let remoteAddr: Address | null = null;
  if (deployL1) {
    const remote = findContract(compiled, "GingerL1Remote");
    console.log("Deploying GingerL1Remote stub…");
    const l1Wallet = createWalletClient({
      account,
      chain,
      transport: http(L1_RPC),
    });
    const l1Public = createPublicClient({ chain, transport: http(L1_RPC) });
    const remoteHash = await l1Wallet.deployContract({
      abi: remote.abi as never,
      bytecode: `0x${remote.bin}` as Hex,
      args: [account.address, factoryAddr, "Ginger L1", "GL1"],
      account,
      chain,
    });
    const remoteReceipt = await l1Public.waitForTransactionReceipt({ hash: remoteHash });
    remoteAddr = remoteReceipt.contractAddress as Address;
    if (!remoteAddr) fail("L1 remote deploy returned no address");
    console.log(`  l1 remote ${remoteAddr}`);
  }

  const envKey = NETWORK === "mainnet" ? "AVALANCHE_FACTORY_ADDRESS_MAINNET" : "AVALANCHE_FACTORY_ADDRESS_FUJI";
  console.log("\nPaste into .env.local:\n");
  console.log(`AVALANCHE_NETWORK=${NETWORK}`);
  console.log(`NEXT_PUBLIC_AVALANCHE_NETWORK=${NETWORK}`);
  console.log(`${envKey}=${factoryAddr}`);
  console.log(`AVALANCHE_FACTORY_ADDRESS=${factoryAddr}`);
  if (remoteAddr) console.log(`AVALANCHE_L1_REMOTE_ADDRESS=${remoteAddr}`);
  console.log(`AVALANCHE_PLATFORM_WALLET=${account.address}`);
  console.log("\nAVALANCHE_MINTER_KEY is already in .env.local — leave it there, do not paste it in the shell.");
}

main().catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
});
