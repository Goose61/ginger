"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useMemo, useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { avalanche, avalancheFuji } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { getAvalancheNetwork, getAvalancheRpcUrl } from "@/lib/avalanche-config";
import { CORE_CONNECTOR_ID, getCoreProvider } from "@/lib/core-wallet";

/** Core via `window.avalanche`. MetaMask stays on its own connector so it cannot take Core's place. */
function evmConnectors() {
  return [
    injected({
      shimDisconnect: true,
      target: {
        id: CORE_CONNECTOR_ID,
        name: "Core",
        provider: () => getCoreProvider() as never,
      },
    }),
    injected({ shimDisconnect: true, target: "metaMask" }),
  ];
}

const fujiConfig = createConfig({
  chains: [avalancheFuji, avalanche],
  connectors: evmConnectors(),
  transports: {
    [avalancheFuji.id]: http(getAvalancheRpcUrl("fuji")),
    [avalanche.id]: http(getAvalancheRpcUrl("mainnet")),
  },
  ssr: true,
});

const mainnetConfig = createConfig({
  chains: [avalanche, avalancheFuji],
  connectors: evmConnectors(),
  transports: {
    [avalanche.id]: http(getAvalancheRpcUrl("mainnet")),
    [avalancheFuji.id]: http(getAvalancheRpcUrl("fuji")),
  },
  ssr: true,
});

export function getWagmiConfig() {
  return getAvalancheNetwork() === "mainnet" ? mainnetConfig : fujiConfig;
}

export function EvmWalletRoot({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const config = useMemo(() => getWagmiConfig(), []);
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
