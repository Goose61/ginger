/**
 * Optional Fuji e2e: Base home + off-home mint (env-gated).
 * Run: OMNICHAIN_E2E_BASE=1 npm run e2e:omnichain-base
 */
if (process.env.OMNICHAIN_E2E_BASE !== "1") {
  console.log("Skip e2e-omnichain-home-base (set OMNICHAIN_E2E_BASE=1)");
  process.exit(0);
}

console.log("e2e-omnichain-home-base: not implemented — use e2e-avalanche-destinations for on-chain omnichain flows today.");
