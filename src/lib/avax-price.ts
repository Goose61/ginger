const AVAX_USD_FALLBACK = 25;

async function readJson(url: string, timeoutMs = 3500): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function asPositive(n: unknown): number | null {
  const v = typeof n === "string" ? Number(n) : typeof n === "number" ? n : NaN;
  return Number.isFinite(v) && v > 0.1 && v < 100_000 ? v : null;
}

export async function fetchAvaxUsd(): Promise<number> {
  const sources: Array<() => Promise<number | null>> = [
    async () => {
      const json = (await readJson(
        "https://api.binance.com/api/v3/ticker/price?symbol=AVAXUSDT",
      )) as { price?: string };
      return asPositive(json.price);
    },
    async () => {
      const json = (await readJson(
        "https://api.coingecko.com/api/v3/simple/price?ids=avalanche-2&vs_currencies=usd",
      )) as { "avalanche-2"?: { usd?: number } };
      return asPositive(json["avalanche-2"]?.usd);
    },
  ];
  for (const src of sources) {
    try {
      const n = await src();
      if (n) return n;
    } catch {
      /* next */
    }
  }
  return AVAX_USD_FALLBACK;
}

export { AVAX_USD_FALLBACK };
