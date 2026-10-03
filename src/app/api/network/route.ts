/**
 * Runtime Solana cluster for the browser.
 *
 * NEXT_PUBLIC_* vars are baked in at build time on Vercel. This route reads
 * SOLANA_NETWORK from the server at request time so deploy env changes take
 * effect without a rebuild.
 */

import { NextResponse } from "next/server";
import { getMintPaymentRecipient } from "@/lib/platform-disbursement";
import { formatTreasuryFloorSol } from "@/lib/platform-treasury-reserve";
import { getSolanaNetwork } from "@/lib/solana-config";
import {
  getAvalancheFactoryAddress,
  getAvalancheL1RemoteAddress,
  getAvalancheNetwork,
  avalancheL1MintEnabled,
  getEvmMinterPrivateKey,
} from "@/lib/avalanche-config";

export async function GET() {
  return NextResponse.json({
    network: getSolanaNetwork(),
    avalancheNetwork: getAvalancheNetwork(),
    avalancheFactory: getAvalancheFactoryAddress() || null,
    avalancheL1Remote: avalancheL1MintEnabled() ? getAvalancheL1RemoteAddress() || null : null,
    avalancheL1Enabled: avalancheL1MintEnabled(),
    avalancheReady: Boolean(getAvalancheFactoryAddress() && getEvmMinterPrivateKey()),
    /** Primary mint SOL is paid here before creator payout + SPL buyback. */
    platformWallet: getMintPaymentRecipient(),
    /** Minimum SOL kept on the platform wallet (rent + accrual float). */
    platformTreasuryFloorSol: formatTreasuryFloorSol(),
  });
}
