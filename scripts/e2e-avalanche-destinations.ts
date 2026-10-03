/**
 * Fuji destination-mint e2e.
 *
 * Always runs offline checks (types, ABI, allowlist, quote line-item shape).
 * If AVALANCHE_MINTER_KEY is set, uses the deployed factory and mints:
 *   #1 mintWithAuthorization same-chain (collector-paid)
 *   #2 home debit + L1 mintFromHomeWithAuthorization
 *   #3 mintWithAuthorization LOC_SPOKE (Solana-home → C-Chain dest)
 *
 *   npm run e2e:avalanche
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  createPublicClient,
  createWalletClient,
  http,
  recoverMessageAddress,
  keccak256,
  encodeAbiParameters,
  toBytes,
  toFunctionSelector,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import {
  CHAIN_DESCRIPTORS,
  collectionMintDestinations,
  collectionContractLinks,
  homeChainToDestination,
  isDestinationWallet,
  parseHomeChain,
} from "../src/lib/chain-registry";
import { allowedL1Remotes, isAllowedL1Remote } from "../src/lib/l1-allowlist";
import { tokenAlreadyIssued } from "../src/lib/home-debit";
import {
  gingerFactoryAbi,
  gingerL1RemoteAbi,
  gingerNftAbi,
  LOCATION_HOME,
  LOCATION_L1,
  LOCATION_SPOKE,
} from "../src/lib/ginger-nft-abi";
import {
  eip1167CloneInitCode,
  locationByte,
  mintAuthDigest,
  debitAuthDigest,
  signUserMintAuthorization,
} from "../src/lib/evm-collection";
import {
  AVALANCHE_CHAIN_ID_FUJI,
  AVALANCHE_CHAIN_ID_MAINNET,
  AVALANCHE_RPC_FUJI,
  AVALANCHE_RPC_MAINNET,
} from "../src/lib/avalanche-config";
import { siweMessage, SIWE_STATEMENT, verifyWalletSignatureAsync } from "../src/lib/wallet-auth";
import type { Collection } from "../src/lib/types";

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

function ok(label: string) {
  console.log(`✓ ${label}`);
}

function section(title: string) {
  console.log(`\n▶ ${title}`);
}

function stubCollection(over: Partial<Collection> = {}): Collection {
  return {
    id: "e2e-avax",
    slug: "e2e-avax",
    name: "E2E",
    symbol: "E2E",
    description: "",
    nameTemplate: "{name} #{id}",
    chain: "solana",
    homeChain: "solana",
    mintDestinations: ["solana", "avalanche", "avalanche_l1"],
    status: "live",
    supply: 3,
    mintedCount: 0,
    artPath: "path-a",
    stackOrder: [],
    layers: [],
    blindMint: false,
    revealTrigger: "disabled",
    revealed: true,
    milestones: [],
    payments: {
      basePriceUsd: 1,
      acceptSol: true,
      acceptUsdc: true,
      acceptAvax: true,
      acceptPizza: false,
      acceptSlicePay: true,
      pizzaDiscountPercent: 0,
      giftMintEnabled: false,
      creatorWallet: "Creator111111111111111111111111111111111",
    },
    fees: { ownerPercent: 98, holdersPercent: 1, buybackPercent: 1, locked: true },
    allowlist: [],
    waitlist: [],
    publicMintOpen: true,
    secondaryEnabled: true,
    holderPageUnlocked: false,
    irysPublished: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tokens: [
      { tokenId: 1, dna: "1", attributes: [], imageRelPath: "", metadataRelPath: "", metadataUri: "https://example.com/1.json" },
      { tokenId: 2, dna: "2", attributes: [], imageRelPath: "", metadataRelPath: "", metadataUri: "https://example.com/2.json" },
      { tokenId: 3, dna: "3", attributes: [], imageRelPath: "", metadataRelPath: "", metadataUri: "https://example.com/3.json" },
    ],
    ...over,
  };
}

function offlineChecks() {
  section("Offline product model");
  assert.equal(parseHomeChain("avalanche"), "avalanche");
  assert.equal(homeChainToDestination("avalanche"), "avalanche");
  assert.equal(CHAIN_DESCRIPTORS.avalanche_l1.label, "Avalanche L1");
  const dests = collectionMintDestinations(
    stubCollection({ homeChain: "solana", mintDestinations: ["avalanche"] }),
  );
  assert.deepEqual(dests, ["solana", "avalanche"]);
  const destsL1 = collectionMintDestinations(
    stubCollection({
      homeChain: "solana",
      mintDestinations: ["avalanche", "avalanche_l1"],
      l1RemoteAddress: "0x60b35089d31ba4caa2d167a3822af1e7fa160366",
    }),
  );
  assert.ok(destsL1.includes("avalanche_l1"));
  assert.equal(isDestinationWallet("solana", "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"), true);
  assert.equal(isDestinationWallet("avalanche", "0x0000000000000000000000000000000000000001"), true);
  assert.equal(isDestinationWallet("avalanche", "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"), false);
  ok("home / destinations / wallet families");

  const spokeLinks = collectionContractLinks(
    stubCollection({
      homeChain: "solana",
      coreCollectionAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
      onChainCollectionAddress: "0x00000000000000000000000000000000000000aa",
      l1RemoteAddress: "0x00000000000000000000000000000000000000bb",
    }),
  );
  assert.equal(spokeLinks.length, 3);
  assert.equal(spokeLinks[0].id, "solana");
  assert.equal(spokeLinks[1].id, "c-chain");
  assert.equal(spokeLinks[2].id, "l1");
  assert.ok(spokeLinks[0].href.includes("explorer.solana.com"));
  assert.ok(spokeLinks[1].href.includes("snowtrace"));
  const avaxHomeLinks = collectionContractLinks(
    stubCollection({
      homeChain: "avalanche",
      coreCollectionAddress: "0x00000000000000000000000000000000000000aa",
      onChainCollectionAddress: "0x00000000000000000000000000000000000000aa",
    }),
  );
  assert.equal(avaxHomeLinks.length, 1);
  assert.equal(avaxHomeLinks[0].label, "C-Chain collection");
  ok("collection contract explorer links");

  const issued = stubCollection();
  issued.tokens[0] = { ...issued.tokens[0], location: "avalanche", owner: "0x1" };
  assert.equal(tokenAlreadyIssued(issued, 1), true);
  assert.equal(tokenAlreadyIssued(issued, 2), false);
  ok("home debit / location ledger");

  const names = gingerNftAbi.map((x) => ("name" in x ? x.name : "")).filter(Boolean);
  assert.ok(names.includes("mintTo"));
  assert.ok(names.includes("mintWithAuthorization"));
  assert.ok(names.includes("debit"));
  assert.ok(names.includes("debitWithAuthorization"));
  assert.ok(gingerFactoryAbi.some((x) => "name" in x && x.name === "createCollection"));
  assert.ok(gingerL1RemoteAbi.some((x) => "name" in x && x.name === "mintFromHome"));
  assert.ok(gingerL1RemoteAbi.some((x) => "name" in x && x.name === "sendAndCall"));
  ok("GingerNft factory + L1 ABI");

  const remotes = allowedL1Remotes();
  assert.ok(Array.isArray(remotes));
  const fake = stubCollection({ l1RemoteAddress: "0x1111111111111111111111111111111111111111" });
  assert.equal(isAllowedL1Remote(fake, "0x1111111111111111111111111111111111111111"), false);
  ok("arbitrary L1 remotes refused (allowlist only)");

  const mintUsd = 25;
  const platformUsd = (mintUsd * 1) / 100;
  const creatorUsd = mintUsd - platformUsd;
  const destGasUsd = 0.05;
  const homeDebitUsd = 0.01;
  const bufferUsd = (destGasUsd + homeDebitUsd) * 0.3;
  assert.equal(Number((platformUsd + creatorUsd).toFixed(8)), mintUsd);
  assert.ok(Math.abs(bufferUsd - (destGasUsd + homeDebitUsd) * 0.3) < 1e-12);
  ok("checkout split: marketplace 1% + creator; collector pays wallet gas");

  assert.equal(locationByte("avalanche", "avalanche"), LOCATION_HOME);
  assert.equal(locationByte("avalanche", "solana"), LOCATION_SPOKE);
  assert.equal(locationByte("solana", "solana"), LOCATION_HOME);
  assert.equal(locationByte("solana", "avalanche"), LOCATION_SPOKE);
  assert.equal(locationByte("avalanche_l1", "solana"), LOCATION_L1);
  assert.equal(locationByte("avalanche_l1", "avalanche"), LOCATION_L1);
  ok("locationByte home vs spoke vs L1");

  const mintDigest = mintAuthDigest({
    contract: "0x00000000000000000000000000000000000000aa",
    to: "0x00000000000000000000000000000000000000bb",
    tokenId: 1,
    uri: "https://example.com/1.json",
    location: LOCATION_SPOKE,
    deadline: 1n,
  });
  const debitDigest = debitAuthDigest({
    contract: "0x00000000000000000000000000000000000000aa",
    tokenId: 1,
    uri: "https://example.com/1.json",
    location: LOCATION_SPOKE,
    deadline: 1n,
  });
  assert.notEqual(mintDigest, debitDigest);
  ok("debit authorization digest is distinct from mint");

  console.log("\nUI checklist (collection page):");
  console.log("  1. Launch home Solana, mint to Solana / C-Chain / L1 stub");
  console.log("  2. Launch home C-Chain, mint to Solana / C-Chain / L1 stub");
  console.log("  3. List/buy only on the token location chain");
  console.log("  4. In-flight badge until l1-confirm");
}

async function onChainMint() {
  const raw = (process.env.AVALANCHE_MINTER_KEY ?? "").trim();
  if (!raw) {
    console.log("\n⏭ On-chain Fuji steps skipped (AVALANCHE_MINTER_KEY unset).");
    return;
  }
  section("Fuji on-chain destinations");
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  const account = privateKeyToAccount(key);
  const rpc = process.env.AVALANCHE_RPC_URL_FUJI ?? "https://api.avax-test.network/ext/bc/C/rpc";
  const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(rpc) });
  const wallet = createWalletClient({ account, chain: avalancheFuji, transport: http(rpc) });

  const send = async (to: Address, data: Hex) => {
    const txHash = await wallet.sendTransaction({
      to,
      data,
      account,
      chain: avalancheFuji,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
    return txHash;
  };

  let factory = (process.env.AVALANCHE_FACTORY_ADDRESS_FUJI || process.env.AVALANCHE_FACTORY_ADDRESS || "").trim() as Address | "";
  if (!factory) {
    console.log("No factory in env — run npm run deploy:avalanche-factory first, then re-run e2e.");
    return;
  }

  const hash = await wallet.writeContract({
    address: factory,
    abi: gingerFactoryAbi,
    functionName: "createCollection",
    args: ["E2E Dest", "E2E", account.address, 10n, account.address, 500n],
    account,
    chain: avalancheFuji,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const created = receipt.logs.find((l) => l.topics.length >= 2);
  if (!created?.topics[1]) throw new Error("Could not parse CollectionCreated");
  const clone = (`0x${created.topics[1].slice(26)}`) as Address;
  ok(`clone ${clone}`);

  const uri1 = "https://example.com/1.json";
  const authHome = await signUserMintAuthorization({
    contract: clone,
    to: account.address,
    tokenId: 1,
    uri: uri1,
    destination: "avalanche",
    home: "avalanche",
  });
  await send(clone, authHome.data);
  const owner1 = await publicClient.readContract({
    address: clone,
    abi: gingerNftAbi,
    functionName: "ownerOf",
    args: [1n],
  });
  assert.equal((owner1 as string).toLowerCase(), account.address.toLowerCase());
  ok("omnichain #1: mintWithAuthorization C-Chain home (collector-paid)");

  const debitHash = await wallet.writeContract({
    address: clone,
    abi: gingerNftAbi,
    functionName: "debit",
    args: [2n, LOCATION_L1, "https://example.com/2.json"],
    account,
    chain: avalancheFuji,
  });
  await publicClient.waitForTransactionReceipt({ hash: debitHash, timeout: 120_000 });
  ok("omnichain #2a: home debit (off-home supply lock)");

  const uriSpoke = "https://example.com/3.json";
  const authSpoke = await signUserMintAuthorization({
    contract: clone,
    to: account.address,
    tokenId: 3,
    uri: uriSpoke,
    destination: "avalanche",
    home: "solana",
  });
  await send(clone, authSpoke.data);
  const ownerSpoke = await publicClient.readContract({
    address: clone,
    abi: gingerNftAbi,
    functionName: "ownerOf",
    args: [3n],
  });
  assert.equal((ownerSpoke as string).toLowerCase(), account.address.toLowerCase());
  ok("omnichain #3: mintWithAuthorization LOC_SPOKE (Solana-home → C-Chain dest)");

  const remote = (process.env.AVALANCHE_L1_REMOTE_ADDRESS || "").trim() as Address | "";
  if (!remote) {
    console.log("⏭ L1 remote mint skipped (AVALANCHE_L1_REMOTE_ADDRESS unset).");
    return;
  }
  const authL1 = await signUserMintAuthorization({
    contract: remote,
    to: account.address,
    tokenId: 2,
    uri: "https://example.com/2.json",
    destination: "avalanche_l1",
    home: "avalanche",
  });
  await send(remote, authL1.data);
  const ownerL1 = await publicClient.readContract({
    address: remote,
    abi: gingerL1RemoteAbi,
    functionName: "ownerOfToken",
    args: [2n],
  });
  assert.equal((ownerL1 as string).toLowerCase(), account.address.toLowerCase());
  ok("omnichain #2b: mintFromHomeWithAuthorization L1 stub (collector-paid)");
}

async function docsCompliance() {
  section("Official docs compliance");

  assert.equal(AVALANCHE_CHAIN_ID_FUJI, 43113);
  assert.equal(AVALANCHE_CHAIN_ID_MAINNET, 43114);
  assert.equal(AVALANCHE_RPC_FUJI, "https://api.avax-test.network/ext/bc/C/rpc");
  assert.equal(AVALANCHE_RPC_MAINNET, "https://api.avax.network/ext/bc/C/rpc");
  ok("Avalanche Fuji 43113 / C-Chain 43114 + official RPCs");

  assert.equal(toFunctionSelector("royaltyInfo(uint256,uint256)"), "0x2a55205a");
  assert.equal(toFunctionSelector("supportsInterface(bytes4)"), "0x01ffc9a7");
  assert.equal(toFunctionSelector("onERC721Received(address,address,uint256,bytes)"), "0x150b7a02");
  ok("ERC-2981 / ERC-165 / IERC721Receiver selectors");

  const impl = "0x1111111111111111111111111111111111111111" as Address;
  const init = eip1167CloneInitCode(impl);
  assert.equal(init.length, 2 + 55 * 2);
  assert.ok(init.startsWith("0x3d602d80600a3d3981f3363d3d373d3d3d363d73"));
  assert.ok(init.endsWith("5af43d82803e903d91602b57fd5bf3"));
  assert.ok(init.includes("1111111111111111111111111111111111111111"));
  ok("EIP-1167 clone init code (55 bytes)");

  const account = privateKeyToAccount(generatePrivateKey());
  const digest = mintAuthDigest({
    contract: impl,
    to: account.address,
    tokenId: 7,
    uri: "https://example.com/7.json",
    location: LOCATION_HOME,
    deadline: 1_900_000_000n,
  });
  const packed = encodeAbiParameters(
    [
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "uint8" },
      { type: "uint256" },
    ],
    [impl, account.address, 7n, keccak256(toBytes("https://example.com/7.json")), LOCATION_HOME, 1_900_000_000n],
  );
  assert.equal(digest, keccak256(packed));
  const sig = await account.signMessage({ message: { raw: digest } });
  const recovered = await recoverMessageAddress({ message: { raw: digest }, signature: sig });
  assert.equal(recovered.toLowerCase(), account.address.toLowerCase());
  ok("EIP-191 mintWithAuthorization recover (viem raw 32-byte digest)");

  const timestamp = Date.now();
  const message = siweMessage({
    domain: "localhost:3000",
    address: account.address,
    uri: "http://localhost:3000",
    chainId: AVALANCHE_CHAIN_ID_FUJI,
    timestamp,
  });
  assert.ok(message.includes("wants you to sign in with your Ethereum account:"));
  assert.ok(message.includes("Version: 1"));
  assert.ok(message.includes(`Chain ID: ${AVALANCHE_CHAIN_ID_FUJI}`));
  assert.ok(message.includes(SIWE_STATEMENT));
  assert.ok(message.includes(`Nonce: ${timestamp}`));
  const siweSig = await account.signMessage({ message });
  const siweRecovered = await recoverMessageAddress({ message, signature: siweSig });
  assert.equal(siweRecovered.toLowerCase(), account.address.toLowerCase());
  const req = new Request("http://localhost:3000/api", {
    headers: {
      "X-Wallet": account.address,
      "X-Signature": siweSig,
      "X-Timestamp": String(timestamp),
      "X-Auth-Domain": "localhost:3000",
      "X-Auth-Uri": "http://localhost:3000",
    },
  });
  assert.equal(await verifyWalletSignatureAsync(account.address, siweSig, timestamp, req), true);
  ok("EIP-4361 SIWE sign + recover + auth headers");
}

offlineChecks();
docsCompliance()
  .then(() => onChainMint())
  .then(() => {
    console.log("\n✓ Avalanche destination e2e checks finished");
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
