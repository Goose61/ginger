/**
 * Buyback spends SOL to buy a token. The configured address has to be an SPL
 * mint. A normal wallet is a valid Solana address and used to be accepted.
 */

import { getMint, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { getDirectRpcUrl, type SolanaNetwork } from "./solana-config";

function tokenProgram(owner: PublicKey) {
  if (owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  if (owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  return null;
}

/** Null when `address` is an SPL Token or Token-2022 mint on `network`. */
export async function splMintRejectionReason(
  address: string,
  network: SolanaNetwork,
): Promise<string | null> {
  let mint: PublicKey;
  try {
    mint = new PublicKey(address.trim());
  } catch {
    return "Buyback token CA is not a Solana address.";
  }

  const cluster = network === "mainnet" ? "mainnet" : "devnet";
  const connection = new Connection(getDirectRpcUrl(network), "confirmed");
  let info;
  try {
    info = await connection.getAccountInfo(mint, "confirmed");
  } catch {
    return `Could not verify the buyback mint on ${cluster}. Check the mint address and try again.`;
  }
  if (!info) {
    return `No SPL mint exists at that address on ${cluster}. Paste the token mint, not a wallet.`;
  }
  const program = tokenProgram(info.owner);
  if (!program) {
    return "That address is a wallet, not an SPL token mint. Paste the mint address of the token buyback should purchase.";
  }
  try {
    await getMint(connection, mint, "confirmed", program);
  } catch {
    return "That address is not an SPL token mint. Paste the mint address, not a wallet.";
  }
  return null;
}
