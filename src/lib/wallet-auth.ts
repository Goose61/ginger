import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import { getAddress, hexToBytes, isAddress, recoverMessageAddress } from "viem";
import { getAvalancheChainId } from "./avalanche-config";

const AUTH_PREFIX = "Dough Boi Auth: ";
/** Long uploads (600+ Arweave files) can run 60–90+ minutes — keep auth valid for the session. */
export const AUTH_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const MAX_AGE_MS = AUTH_MAX_AGE_MS;

export const SIWE_STATEMENT = "Sign in to Ginger to prove you control this wallet.";

export function authMessage(timestamp: number): string {
  return `${AUTH_PREFIX}${timestamp}`;
}

export function authMessageBytes(timestamp: number): Uint8Array {
  return new TextEncoder().encode(authMessage(timestamp));
}

/** EIP-4361 SIWE message. Address is EIP-55 checksummed. */
export function siweMessage(params: {
  domain: string;
  address: string;
  uri: string;
  chainId: number;
  timestamp: number;
}): string {
  const address = getAddress(params.address);
  const issuedAt = new Date(params.timestamp).toISOString();
  const expiration = new Date(params.timestamp + MAX_AGE_MS).toISOString();
  const nonce = String(params.timestamp);
  return [
    `${params.domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    SIWE_STATEMENT,
    "",
    `URI: ${params.uri}`,
    `Version: 1`,
    `Chain ID: ${params.chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiration}`,
  ].join("\n");
}

function hostFromOrigin(origin: string | null): string {
  if (!origin) return "";
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}

export function siweMessageFromRequest(req: Request, wallet: string, timestamp: number): string | null {
  const domain =
    req.headers.get("x-auth-domain")?.trim() ||
    hostFromOrigin(req.headers.get("origin")) ||
    req.headers.get("host")?.trim() ||
    "";
  const uri =
    req.headers.get("x-auth-uri")?.trim() ||
    req.headers.get("origin")?.trim() ||
    (domain ? `https://${domain}` : "");
  if (!domain || !uri || !isAddress(wallet, { strict: false })) return null;
  return siweMessage({
    domain,
    address: wallet,
    uri,
    chainId: getAvalancheChainId(),
    timestamp,
  });
}

function normalizeEvm(addr: string): string {
  return addr.trim().toLowerCase();
}

function verifySolanaSignature(wallet: string, signatureB64: string, timestamp: number): boolean {
  try {
    const pubkey = new PublicKey(wallet);
    const sig = Buffer.from(signatureB64, "base64");
    if (sig.length !== 64) return false;
    return nacl.sign.detached.verify(authMessageBytes(timestamp), sig, pubkey.toBytes());
  } catch {
    return false;
  }
}

function normalizeEvmSignature(signature: string): `0x${string}` {
  let sig = signature.trim();
  if (!sig.startsWith("0x")) {
    sig = `0x${Buffer.from(sig, "base64").toString("hex")}`;
  }
  return sig as `0x${string}`;
}

async function recoverMatches(wallet: string, message: string, signature: `0x${string}`): Promise<boolean> {
  const recovered = await recoverMessageAddress({ message, signature });
  return normalizeEvm(recovered) === normalizeEvm(wallet);
}

async function verifyEvmSignature(
  wallet: string,
  signature: string,
  timestamp: number,
  req?: Request,
): Promise<boolean> {
  if (!isAddress(wallet, { strict: false })) return false;
  try {
    const sig = normalizeEvmSignature(signature);
    if (req) {
      const siwe = siweMessageFromRequest(req, wallet, timestamp);
      if (siwe && (await recoverMatches(wallet, siwe, sig))) return true;
    }
    return recoverMatches(wallet, authMessage(timestamp), sig);
  } catch {
    try {
      hexToBytes(signature as `0x${string}`);
    } catch {
      /* ignore */
    }
    return false;
  }
}

export function verifyWalletSignature(
  wallet: string,
  signatureB64: string,
  timestamp: number,
): boolean {
  if (!wallet || !signatureB64 || !Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > MAX_AGE_MS) return false;
  if (wallet.startsWith("0x")) return false;
  return verifySolanaSignature(wallet, signatureB64, timestamp);
}

export async function verifyWalletSignatureAsync(
  wallet: string,
  signatureB64: string,
  timestamp: number,
  req?: Request,
): Promise<boolean> {
  if (!wallet || !signatureB64 || !Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > MAX_AGE_MS) return false;
  if (wallet.startsWith("0x")) {
    return verifyEvmSignature(wallet, signatureB64, timestamp, req);
  }
  return verifySolanaSignature(wallet, signatureB64, timestamp);
}

export type AuthHeaders = {
  wallet: string;
  signature: string;
  timestamp: number;
};

export function readAuthHeaders(req: Request): AuthHeaders | null {
  const wallet = req.headers.get("x-wallet")?.trim() ?? "";
  const signature = req.headers.get("x-signature")?.trim() ?? "";
  const tsRaw = req.headers.get("x-timestamp")?.trim() ?? "";
  const timestamp = Number(tsRaw);
  if (!wallet || !signature || !Number.isFinite(timestamp)) return null;
  if (wallet.startsWith("0x")) return null;
  if (!verifyWalletSignature(wallet, signature, timestamp)) return null;
  return { wallet, signature, timestamp };
}

export async function readAuthHeadersAsync(req: Request): Promise<AuthHeaders | null> {
  const wallet = req.headers.get("x-wallet")?.trim() ?? "";
  const signature = req.headers.get("x-signature")?.trim() ?? "";
  const tsRaw = req.headers.get("x-timestamp")?.trim() ?? "";
  const timestamp = Number(tsRaw);
  if (!wallet || !signature || !Number.isFinite(timestamp)) return null;
  if (!(await verifyWalletSignatureAsync(wallet, signature, timestamp, req))) return null;
  return { wallet, signature, timestamp };
}

export function requireWalletAuth(req: Request): AuthHeaders {
  const auth = readAuthHeaders(req);
  if (!auth) throw new Error("Wallet signature required");
  return auth;
}

export async function requireWalletAuthAsync(req: Request): Promise<AuthHeaders> {
  const auth = await readAuthHeadersAsync(req);
  if (!auth) throw new Error("Wallet signature required");
  return auth;
}

export function assertPayerAuth(auth: AuthHeaders | null, payerWallet: string): void {
  if (!auth) throw new Error("Wallet signature required");
  const a = auth.wallet.startsWith("0x") ? normalizeEvm(auth.wallet) : auth.wallet;
  const p = payerWallet.startsWith("0x") ? normalizeEvm(payerWallet) : payerWallet;
  if (a !== p) {
    throw new Error("Payer must match connected wallet");
  }
}

export function authHeadersForKeypair(keypair: {
  publicKey: { toBase58(): string };
  secretKey: Uint8Array;
}): Record<string, string> {
  const timestamp = Date.now();
  const sig = nacl.sign.detached(authMessageBytes(timestamp), keypair.secretKey);
  return {
    "X-Wallet": keypair.publicKey.toBase58(),
    "X-Signature": Buffer.from(sig).toString("base64"),
    "X-Timestamp": String(timestamp),
  };
}

export function assertCreatorAuth(
  auth: AuthHeaders | null,
  creatorWallet: string,
): void {
  if (!auth) throw new Error("Wallet signature required");
  if (!creatorWallet) {
    throw new Error("Creator wallet not set");
  }
  const a = auth.wallet.startsWith("0x") ? normalizeEvm(auth.wallet) : auth.wallet;
  const c = creatorWallet.startsWith("0x") ? normalizeEvm(creatorWallet) : creatorWallet;
  if (a !== c) {
    throw new Error("Only the creator wallet can perform this action");
  }
}
