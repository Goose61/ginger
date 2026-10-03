/**
 * Offline asserts for compressed gift mint fees vs Core rent.
 *   npx tsx scripts/test-cnft-gift-fees.ts
 */
import assert from "node:assert/strict";
import {
  getCnftMintStepMinLamports,
  getMintStepMinLamports,
  lamportsToSol,
} from "../src/lib/gift-fees";
import { bubblegumGiftConfigured } from "../src/lib/bubblegum-config";

assert.ok(getCnftMintStepMinLamports() < getMintStepMinLamports());
assert.ok(lamportsToSol(getCnftMintStepMinLamports()) < 0.002);
assert.ok(lamportsToSol(getMintStepMinLamports()) > 0.005);
assert.equal(typeof bubblegumGiftConfigured(), "boolean");
console.log(
  `✓ cNFT mint step ${lamportsToSol(getCnftMintStepMinLamports())} SOL vs Core ${lamportsToSol(getMintStepMinLamports())} SOL`,
);
console.log(
  bubblegumGiftConfigured()
    ? "✓ BUBBLEGUM_TREE_ADDRESS is set"
    : "ℹ BUBBLEGUM_TREE_ADDRESS unset — run npm run setup:bubblegum-tree before live gifts",
);
