/**
 * Dry-run Jupiter quote + swap build for mainnet buyback (no keys, no broadcast).
 *
 *   npx tsx scripts/validate-mainnet-jupiter.ts
 *   npx tsx scripts/validate-mainnet-jupiter.ts --mint <SPL_MINT>
 */

const WSOL = "So11111111111111111111111111111111111111112";
const DEFAULT_OUT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC
const PLATFORM = "7XMYnfFKXY9XyHhLfjFeYb88qWea4N9W5gwFF91TGJ3y";
const LAMPORTS = 10_000_000; // 0.01 SOL

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const outputMint = arg("--mint") ?? DEFAULT_OUT;
  console.log(`Jupiter mainnet dry-run  WSOL → ${outputMint}  ${LAMPORTS} lamports`);

  const quoteUrl =
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${WSOL}` +
    `&outputMint=${outputMint}&amount=${LAMPORTS}&slippageBps=100`;
  const quoteRes = await fetch(quoteUrl);
  if (!quoteRes.ok) {
    console.error(`✗ quote HTTP ${quoteRes.status}`);
    process.exit(1);
  }
  const quote = await quoteRes.json();
  if (!quote.outAmount) {
    console.error(`✗ no route: ${JSON.stringify(quote)}`);
    process.exit(1);
  }
  console.log(`✓ quote outAmount ${quote.outAmount}`);

  const swapRes = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: PLATFORM,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });
  if (!swapRes.ok) {
    console.error(`✗ swap HTTP ${swapRes.status}`);
    process.exit(1);
  }
  const swap = (await swapRes.json()) as { swapTransaction?: string; error?: string };
  if (!swap.swapTransaction) {
    console.error(`✗ swap build failed: ${swap.error ?? "no transaction"}`);
    process.exit(1);
  }
  console.log(`✓ swap transaction built (${swap.swapTransaction.length} bytes b64)`);
  console.log("\nMainnet Jupiter path is reachable. Live swap still needs platform SOL + broadcast.");
}

void main();
