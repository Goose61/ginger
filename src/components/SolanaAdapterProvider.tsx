"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider as AdapterWalletProvider,
} from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { WalletError, WalletReadyState } from "@solana/wallet-adapter-base";
import { createSolanaClient } from "@metamask/connect-solana";
import { BackpackWalletAdapter } from "@/lib/backpack-wallet-adapter";
import {
  getClientNetwork,
  getRpcUrl,
  SOLANA_RPC_DEVNET,
  SOLANA_RPC_MAINNET,
} from "@/lib/solana-config";

/**
 * Solana Wallet Adapter + MetaMask Connect Solana (Wallet Standard).
 * @see https://docs.metamask.io/metamask-connect/solana/guides/use-wallet-adapter/
 * @see https://docs.solflare.com/solflare/technical/integrate-solflare
 */
export function SolanaAdapterProvider({ children }: { children: ReactNode }) {
  /** Wait for /api/network before mounting ConnectionProvider (avoids devnet default vs mainnet pay txs). */
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [metamaskReady, setMetamaskReady] = useState(false);

  useEffect(() => {
    void getClientNetwork().then((network) => setEndpoint(getRpcUrl(network)));
  }, []);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new BackpackWalletAdapter()],
    [],
  );

  useEffect(() => {
    void createSolanaClient({
      dapp: {
        name: "Ginger",
        url: window.location.origin,
      },
      api: {
        supportedNetworks: {
          mainnet:
            process.env.NEXT_PUBLIC_SOLANA_RPC_URL_MAINNET ?? SOLANA_RPC_MAINNET,
          devnet:
            process.env.NEXT_PUBLIC_SOLANA_RPC_URL_DEVNET ?? SOLANA_RPC_DEVNET,
        },
      },
    })
      .catch((err) => {
        console.warn("[wallet] MetaMask Solana client failed to register", err);
      })
      .finally(() => setMetamaskReady(true));
  }, []);

  if (!metamaskReady || !endpoint) {
    return null;
  }

  return (
    <ConnectionProvider endpoint={endpoint}>
      <AdapterWalletProvider
        wallets={wallets}
        autoConnect={async (adapter) =>
          adapter.readyState === WalletReadyState.Installed
        }
        onError={(error: WalletError) => {
          if (error.name === "WalletNotReadyError" || error.name === "WalletNotConnectedError") {
            return;
          }
          console.warn("[wallet]", error.message);
        }}
      >
        {children}
      </AdapterWalletProvider>
    </ConnectionProvider>
  );
}
