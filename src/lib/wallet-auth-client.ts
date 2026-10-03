"use client";

import { authMessageBytes, siweMessage } from "./wallet-auth";
import { getAvalancheChainId } from "./avalanche-config";
import { getActiveWallet } from "./wallet-session";
import { getActiveEvmWallet } from "./evm-wallet-session";

/** Must stay in sync with server AUTH_MAX_AGE_MS in wallet-auth.ts */
export const AUTH_TTL_MS = 2 * 60 * 60 * 1000;
const AUTH_CACHE_BUFFER_MS = 30_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

type CachedAuth = {
  headers: Record<string, string>;
  expiresAt: number;
};

const authCache = new Map<string, CachedAuth>();

export function clearAuthCache(wallet?: string): void {
  if (wallet) authCache.delete(wallet);
  else authCache.clear();
}

export type AuthHeaderOptions = {
  /** Skip cache and request a fresh wallet signature. */
  force?: boolean;
};

function evmSiweContext(wallet: string, timestamp: number): { message: string; domain: string; uri: string } {
  const domain = window.location.host;
  const uri = window.location.origin;
  return {
    domain,
    uri,
    message: siweMessage({
      domain,
      address: wallet,
      uri,
      chainId: getAvalancheChainId(),
      timestamp,
    }),
  };
}

async function signEvmAuth(wallet: string, message: string): Promise<string> {
  const evm = getActiveEvmWallet();
  if (evm && evm.address.toLowerCase() === wallet.toLowerCase()) {
    return evm.signMessage(message);
  }
  const eth = (window as unknown as { ethereum?: { request: (args: { method: string; params: string[] }) => Promise<string> } }).ethereum;
  if (!eth) throw new Error("Connect an EVM wallet first");
  return eth.request({
    method: "personal_sign",
    params: [message, wallet],
  });
}

/** Sign an auth challenge and return headers for authenticated API calls (cached ~5 min). */
export async function buildAuthHeaders(
  wallet: string,
  options?: AuthHeaderOptions,
): Promise<Record<string, string>> {
  const cached = authCache.get(wallet);
  if (!options?.force && cached && cached.expiresAt > Date.now()) {
    return cached.headers;
  }

  const timestamp = Date.now();
  let signature: string;
  let extra: Record<string, string> = {};

  if (wallet.startsWith("0x")) {
    const siwe = evmSiweContext(wallet, timestamp);
    signature = await signEvmAuth(wallet, siwe.message);
    extra = {
      "X-Auth-Domain": siwe.domain,
      "X-Auth-Uri": siwe.uri,
    };
  } else {
    const active = getActiveWallet();
    if (!active?.publicKey || active.publicKey.toBase58() !== wallet) {
      throw new Error("Connect the creator wallet first");
    }
    const signed = await active.signMessage(authMessageBytes(timestamp), "utf8");
    signature = bytesToBase64(signed.signature);
  }

  const headers = {
    "X-Wallet": wallet,
    "X-Signature": signature,
    "X-Timestamp": String(timestamp),
    ...extra,
  };
  authCache.set(wallet, {
    headers,
    expiresAt: timestamp + AUTH_TTL_MS - AUTH_CACHE_BUFFER_MS,
  });
  return headers;
}

/** Human-readable auth message shown in wallet UIs (for our notice copy). */
export const WALLET_AUTH_MESSAGE_PREFIX = "Dough Boi Auth:";
