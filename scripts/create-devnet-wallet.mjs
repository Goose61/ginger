#!/usr/bin/env node
/**
 * Generate a Solana **devnet** keypair for airdrops and test mints.
 *
 *   node scripts/create-devnet-wallet.mjs
 *
 * Writes .devnet-wallet.json (gitignored). Do not use this key on mainnet.
 */

import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58encode(bytes) {
  if (bytes.length === 0) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let zeros = 0;
  for (const byte of bytes) {
    if (byte !== 0) break;
    zeros++;
  }
  return "1".repeat(zeros) + digits.reverse().map((d) => ALPHA[d]).join("");
}

const outPath = path.resolve(process.cwd(), ".devnet-wallet.json");
if (fs.existsSync(outPath) && process.argv[2] !== "--force") {
  const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
  console.log("Wallet already exists (pass --force to replace):\n");
  printWallet(existing);
  process.exit(0);
}

const kp = Keypair.generate();
const wallet = {
  network: "devnet",
  publicKey: kp.publicKey.toBase58(),
  secretKeyBase58: b58encode(kp.secretKey),
  secretKeyJson: Array.from(kp.secretKey),
  createdAt: new Date().toISOString(),
};
fs.writeFileSync(outPath, JSON.stringify(wallet, null, 2) + "\n", { mode: 0o600 });

console.log("Created DEVNET-ONLY wallet. Never use this key on mainnet.\n");
printWallet(wallet);
console.log(`Saved to ${outPath} (gitignored)\n`);

function printWallet(wallet) {
  console.log("Public key (airdrop to this):\n  " + wallet.publicKey);
  console.log("\nPrivate key (Phantom → Import private key):\n  " + wallet.secretKeyBase58);
  console.log("\nAirdrop ~2 SOL:");
  console.log(`  solana airdrop 2 ${wallet.publicKey} --url https://api.devnet.solana.com`);
  console.log("  or https://faucet.solana.com  (select Devnet, paste the public key)");
}
