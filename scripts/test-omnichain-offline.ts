/**
 * Offline omnichain regression checks (no RPC, no keys).
 * Run: npm run test:omnichain
 */
import assert from "node:assert/strict";
import {
  collectionOmnichainEnabled,
  mintCheckoutUsd,
  quoteRelayerLineItems,
  relayerExecutionAvailable,
  supportsRelayerExecution,
} from "../src/lib/omnichain";
import { defaultPayments, type Collection } from "../src/lib/types";
import {
  collectionSpokeAddress,
  destinationMintContract,
  mergeSolanaSpokeAddress,
  mergeSpokeAddress,
} from "../src/lib/collection-spoke";
import {
  collectionHomeLedger,
  homeLedgerToMintDestination,
  parseHomeLedger,
} from "../src/lib/home-ledger";
import { mintIsOffHome } from "../src/lib/omnichain";
import {
  EVM_SPOKE_CHAIN_IDS,
  evmSpokeChainMeta,
  isEvmNftChainId,
  mintDestinationToSpokeChain,
  parseEvmSpokeChain,
  viemChainForSpokeId,
} from "../src/lib/evm-spoke-chains";
import { getEvmNftChainDefinition, resolvedChainId } from "../src/lib/evm-nft-chain-catalog";
import { estimateSpokeDeployRows } from "../src/lib/spoke-deploy-estimate";
import { resolveSpokeChainForEvm } from "../src/lib/evm-collection";
import { isMintDestination, explorerTxUrl } from "../src/lib/chain-registry";
import { collectionStubForSpokeEstimate } from "../src/lib/spoke-deploy-estimate";

function stubCollection(over: Partial<Collection> = {}): Collection {
  return {
    id: "omni-test",
    slug: "omni-test",
    name: "Omni Test",
    symbol: "OMNI",
    description: "",
    nameTemplate: "#{{id}}",
    chain: "solana",
    homeChain: "solana",
    mintDestinations: ["solana", "base"],
    omnichainMintEnabled: true,
    status: "live",
    supply: 100,
    mintedCount: 0,
    artPath: "path-b",
    stackOrder: [],
    layers: [],
    blindMint: false,
    revealTrigger: "disabled",
    revealed: false,
    milestones: [],
    payments: defaultPayments({ creatorWallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU" }),
    fees: { ownerPercent: 100, holdersPercent: 0, buybackPercent: 0, locked: true },
    allowlist: [],
    waitlist: [],
    publicMintOpen: true,
    secondaryEnabled: false,
    holderPageUnlocked: false,
    irysPublished: true,
    onChainCollectionAddress: "0x00000000000000000000000000000000000000aa",
    evmSpokeAddresses: {
      base: "0x00000000000000000000000000000000000000bb",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tokens: [],
    ...over,
  };
}

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

async function main() {
console.log("Omnichain offline tests\n");

// Catalog
assert.ok(EVM_SPOKE_CHAIN_IDS.length >= 25);
assert.ok(isEvmNftChainId("base"));
assert.ok(isMintDestination("base"));
assert.ok(isMintDestination("avalanche_l1"));
assert.equal(mintDestinationToSpokeChain("base"), "base");
assert.equal(parseEvmSpokeChain("polygon"), "polygon");
assert.equal(parseEvmSpokeChain("invalid"), "avalanche");
ok("chain catalog + parse spoke");

const baseDef = getEvmNftChainDefinition("base")!;
assert.equal(resolvedChainId(baseDef), 8453);
assert.equal(viemChainForSpokeId("base").id, 8453);
assert.equal(resolveSpokeChainForEvm({ destination: "polygon" }), "polygon");
ok("viem chain ids (Base 8453, Polygon 137)");

const rh = getEvmNftChainDefinition("robinhood")!;
assert.equal(rh.chainId, 4663);
assert.equal(rh.testnetChainId, 46630);
ok("Robinhood mainnet/testnet ids in catalog");

// Spoke addresses
const col = stubCollection();
assert.equal(collectionSpokeAddress(col, "avalanche")?.toLowerCase(), "0x00000000000000000000000000000000000000aa");
assert.equal(collectionSpokeAddress(col, "base")?.toLowerCase(), "0x00000000000000000000000000000000000000bb");
const merged = mergeSpokeAddress(col, "polygon", "0x00000000000000000000000000000000000000cc");
assert.equal(merged.evmSpokeAddresses?.polygon?.toLowerCase(), "0x00000000000000000000000000000000000000cc");
ok("collection spoke address merge");

// Omnichain flags
assert.equal(collectionOmnichainEnabled(stubCollection({ omnichainMintEnabled: false, mintDestinations: ["solana", "base"] })), false);
assert.equal(
  collectionOmnichainEnabled(
    stubCollection({ mintDestinations: ["solana"], omnichainMintEnabled: undefined }),
  ),
  false,
);
assert.equal(collectionOmnichainEnabled(stubCollection()), true);
ok("collectionOmnichainEnabled");

// Relayer eligibility (needs deployed spoke + server mintReady)
const withBaseSpoke = stubCollection();
assert.equal(
  supportsRelayerExecution(withBaseSpoke, "base"),
  evmSpokeChainMeta("base").mintReady,
);
assert.equal(supportsRelayerExecution(withBaseSpoke, "solana"), false);

const baseHome = stubCollection({
  homeLedger: "base",
  homeChain: "base",
  chain: "base",
  onChainCollectionAddress: "0x00000000000000000000000000000000000000aa",
  evmSpokeAddresses: { base: "0x00000000000000000000000000000000000000aa" },
  mintDestinations: ["base", "solana"],
  solanaSpokeCoreAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
});
assert.equal(collectionHomeLedger(baseHome), "base");
assert.equal(homeLedgerToMintDestination("base"), "base");
assert.equal(parseHomeLedger("base"), "base");
assert.equal(mintIsOffHome(baseHome, "solana"), true);
assert.equal(mintIsOffHome(baseHome, "base"), false);
assert.equal(
  destinationMintContract(baseHome, "solana"),
  "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
);
const withSpoke = mergeSolanaSpokeAddress(baseHome, "So11111111111111111111111111111111111111112");
assert.equal(withSpoke.solanaSpokeCoreAddress, "So11111111111111111111111111111111111111112");
ok("homeLedger + Base home → Solana dest spoke resolution");
assert.equal(
  supportsRelayerExecution(stubCollection({ evmSpokeAddresses: {} }), "base"),
  false,
);
assert.equal(relayerExecutionAvailable(withBaseSpoke, "base"), evmSpokeChainMeta("base").mintReady);
ok("supportsRelayerExecution requires spoke contract");

// Quote math
const relayerLines = quoteRelayerLineItems({
  mintUsd: 100,
  destGasUsd: 2,
  homeDebitUsd: 0.5,
  executionMode: "relayer",
  relayerAvailable: true,
});
assert.ok(relayerLines.omnichainFeeUsd > 0);
assert.ok(relayerLines.relayerUsd > 2);
const total = mintCheckoutUsd({
  mintUsd: 100,
  executionMode: "relayer",
  relayerUsd: relayerLines.relayerUsd,
  omnichainFeeUsd: relayerLines.omnichainFeeUsd,
});
assert.ok(total > 100 + relayerLines.relayerUsd);
const selfTotal = mintCheckoutUsd({
  mintUsd: 100,
  executionMode: "self",
  relayerUsd: 0,
  omnichainFeeUsd: 0,
});
assert.equal(selfTotal, 100);
ok("relayer vs self checkout USD");

// Explorer URLs (non-Snowtrace for Base)
const baseTx = explorerTxUrl("base", "0x" + "ab".repeat(32));
assert.ok(baseTx.includes("basescan") || baseTx.includes("/tx/0x"));
ok("per-chain explorer tx URL");

// Stub for deploy estimate
const stub = collectionStubForSpokeEstimate({ name: "X", supply: 50 });
assert.equal(stub.supply, 50);
assert.equal(stub.name, "X");
ok("spoke deploy estimate stub collection");

// Deploy estimate rows (no RPC when factory unset)
const rows = await estimateSpokeDeployRows({
  spokeChainIds: ["base", "avalanche"],
  stub: { name: "Estimate", supply: 10, creatorWallet: "0x0000000000000000000000000000000000000001" },
});
assert.equal(rows.length, 2);
for (const row of rows) {
  assert.ok(row.label);
  assert.ok(row.chainId > 0);
  if (!row.deployReady) assert.ok(row.note);
}
ok("spoke deploy estimate rows (factory-gated)");

console.log("\n✓ All omnichain offline tests passed");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
