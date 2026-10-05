/** Shared Irys constants used by both server and client code. */

export const IRYS_NODE_MAINNET = "https://uploader.irys.xyz";
export const IRYS_NODE_DEVNET = "https://devnet.irys.xyz";
export const IRYS_GATEWAY = "https://gateway.irys.xyz";

/** Irys transaction ids are base58, 32 bytes encoded (43 or 44 characters). */
const IRYS_TX_ID = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isIrysGatewayUri(uri: string | undefined | null): uri is string {
  if (!uri) return false;
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:" || url.hostname !== "gateway.irys.xyz") return false;
    const id = url.pathname.replace(/^\/+|\/+$/g, "");
    return IRYS_TX_ID.test(id);
  } catch {
    return false;
  }
}

/** A saved file URL that can actually be fetched. Broken gateway ids do not count. */
export function isPublishedFileUri(uri: string | undefined | null): uri is string {
  if (!uri || !/^https?:\/\//.test(uri)) return false;
  if (/gateway\.irys\.xyz/i.test(uri)) return isIrysGatewayUri(uri);
  return true;
}

export function irysNodeFromRpc(rpcUrl: string): string {
  return rpcUrl.includes("devnet") ? IRYS_NODE_DEVNET : IRYS_NODE_MAINNET;
}

/**
 * Irys REST responses may be plain text ("12345") or JSON
 * ({ "balance": "…" }, { "amount": "…" }, etc.).
 */
export function parseIrysAmountResponse(body: string, label = "amount"): bigint {
  const trimmed = body.trim();
  if (!trimmed) return 0n;
  if (trimmed.startsWith("{")) {
    let parsed: Record<string, string | number | undefined>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, string | number | undefined>;
    } catch {
      throw new SyntaxError(`Cannot parse storage ${label} JSON: ${trimmed.slice(0, 120)}`);
    }
    const value =
      parsed.balance ?? parsed.amount ?? parsed.price ?? parsed.lamports ?? parsed.value;
    if (value == null) return 0n;
    return BigInt(String(value));
  }
  try {
    return BigInt(trimmed);
  } catch {
    throw new SyntaxError(`Cannot parse storage ${label}: ${trimmed.slice(0, 120)}`);
  }
}

/** @deprecated Use parseIrysAmountResponse */
export function parseIrysBalanceResponse(body: string): bigint {
  return parseIrysAmountResponse(body, "balance");
}

export async function fetchIrysAccountBalanceLamports(
  address: string,
  devnet = false,
): Promise<bigint> {
  const node = devnet ? IRYS_NODE_DEVNET : IRYS_NODE_MAINNET;
  const res = await fetch(`${node}/account/balance/solana?address=${address}`, {
    signal: AbortSignal.timeout(4_000),
  });
  if (!res.ok) {
    throw new Error(`Could not read storage balance (${res.status})`);
  }
  return parseIrysAmountResponse(await res.text(), "balance");
}

/** Fetch upload price in lamports from the Irys REST API. */
export async function fetchIrysPriceLamports(
  bytes: number,
  devnet = false,
): Promise<bigint> {
  const node = devnet ? IRYS_NODE_DEVNET : IRYS_NODE_MAINNET;
  try {
    const res = await fetch(`${node}/price/solana/${bytes}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return 0n;
    return parseIrysAmountResponse(await res.text(), "price");
  } catch {
    return 0n;
  }
}
