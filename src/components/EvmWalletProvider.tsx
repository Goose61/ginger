"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain, useWalletClient } from "wagmi";
import { avalanche, avalancheFuji } from "wagmi/chains";
import { getAvalancheChainId, getAvalancheNetwork } from "@/lib/avalanche-config";
import { CORE_CONNECTOR_ID, CORE_RDNS, coreConnectMessage, getCoreProvider } from "@/lib/core-wallet";
import { setActiveEvmWallet } from "@/lib/evm-wallet-session";
import { clearAuthCache } from "@/lib/wallet-auth-client";

type EvmWalletCtx = {
  address: string | null;
  connecting: boolean;
  chainId: number | null;
  connectEvm: () => Promise<void>;
  disconnectEvm: () => void;
  ensureAvalancheChain: () => Promise<void>;
  signMessage: (message: string) => Promise<string>;
  sendContractTx: (to: `0x${string}`, data: `0x${string}`) => Promise<`0x${string}`>;
};

const Ctx = createContext<EvmWalletCtx>({
  address: null,
  connecting: false,
  chainId: null,
  connectEvm: async () => {},
  disconnectEvm: () => {},
  ensureAvalancheChain: async () => {},
  signMessage: async () => {
    throw new Error("EVM wallet not connected");
  },
  sendContractTx: async () => {
    throw new Error("EVM wallet not connected");
  },
});

export function useEvmWallet() {
  return useContext(Ctx);
}

export function EvmWalletProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnecting, chainId } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { data: walletClient } = useWalletClient();
  const [busy, setBusy] = useState(false);

  const sendContractTx = useCallback(
    async (to: `0x${string}`, data: `0x${string}`) => {
      if (!walletClient) throw new Error("EVM wallet not connected");
      return walletClient.sendTransaction({ to, data });
    },
    [walletClient],
  );

  const signMessage = useCallback(
    async (message: string) => signMessageAsync({ message }),
    [signMessageAsync],
  );

  useEffect(() => {
    if (!address || !walletClient) {
      setActiveEvmWallet(null);
      return;
    }
    setActiveEvmWallet({
      address,
      signMessage: async (message: string) => walletClient.signMessage({ message }),
    });
    return () => setActiveEvmWallet(null);
  }, [address, walletClient]);

  const connectEvm = useCallback(async () => {
    setBusy(true);
    try {
      const coreInjected = connectors.find((c) => c.id === CORE_CONNECTOR_ID);
      const coreAnnounced = connectors.find((c) => c.id === CORE_RDNS);
      const metamask = connectors.find((c) => c.id === "metaMask" || c.id === "io.metamask");
      // Prefer Core's window.avalanche provider. EIP-6963 `app.core` covers a Core install that has not
      // set that global yet. MetaMask is only used when Core is not installed.
      const connector = (getCoreProvider() ? coreInjected : undefined) ?? coreAnnounced ?? metamask;
      if (!connector) {
        throw new Error("Install Core or MetaMask, then refresh this page.");
      }
      await connectAsync({ connector, chainId: getAvalancheChainId() });
    } catch (err) {
      throw new Error(coreConnectMessage(err));
    } finally {
      setBusy(false);
    }
  }, [connectAsync, connectors]);

  const ensureAvalancheChain = useCallback(async () => {
    const wanted = getAvalancheChainId();
    if (chainId === wanted) return;
    const chain = getAvalancheNetwork() === "mainnet" ? avalanche : avalancheFuji;
    await switchChainAsync({ chainId: chain.id });
  }, [chainId, switchChainAsync]);

  const disconnectEvm = useCallback(() => {
    if (address) clearAuthCache(address);
    disconnect();
    setActiveEvmWallet(null);
  }, [address, disconnect]);

  const value = useMemo(
    () => ({
      address: address ?? null,
      connecting: isConnecting || busy,
      chainId: chainId ?? null,
      connectEvm,
      disconnectEvm,
      ensureAvalancheChain,
      signMessage,
      sendContractTx,
    }),
    [address, isConnecting, busy, chainId, connectEvm, disconnectEvm, ensureAvalancheChain, signMessage, sendContractTx],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
