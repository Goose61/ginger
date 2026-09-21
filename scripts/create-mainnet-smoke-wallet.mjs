#!/usr/bin/env node
/**
 * Generate a **mainnet-only** keypair for smoke tests (real SOL).
 *
 *   node scripts/create-mainnet-smoke-wallet.mjs
 *
 * Writes .mainnet-smoke-wallet.json (gitignored). Never reuse a devnet wallet here.
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

const outPath = path.resolve(process.cwd(), ".mainnet-smoke-wallet.json");
if (fs.existsSync(outPath) && process.argv[2] !== "--force") {
  const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
  console.log("Wallet already exists (pass --force to replace):\n");
  printWallet(existing);
  process.exit(0);
}

const kp = Keypair.generate();
const wallet = {
  network: "mainnet",
  publicKey: kp.publicKey.toBase58(),
  secretKeyBase58: b58encode(kp.secretKey),
  secretKeyJson: Array.from(kp.secretKey),
  createdAt: new Date().toISOString(),
};
fs.writeFileSync(outPath, JSON.stringify(wallet, null, 2) + "\n", { mode: 0o600 });

console.log("Created MAINNET smoke-test wallet.\n");
printWallet(wallet);
console.log(`Saved to ${outPath} (gitignored)\n`);

function printWallet(wallet) {
  console.log("Public key (send a tiny amount of SOL here):\n  " + wallet.publicKey);
  console.log("\nPrivate key (keep secret):\n  " + wallet.secretKeyBase58);
}
