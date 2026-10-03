/**
 * Avalanche Core (browser extension) connection.
 *
 * Core documents `eth_requestAccounts` before any other RPC, and exposes its
 * EIP-1193 provider on `window.avalanche` (also announced as EIP-6963 rdns
 * `app.core`). `window.ethereum` is often MetaMask when both extensions are
 * installed, so Avalanche connects through the Core provider directly.
 *
 * @see https://docs.core.app/docs/reference/eth_requestaccounts/
 * @see https://build.avax.network/docs/tooling/avalanche-sdk/client/clients-transports
 */

export const CORE_CONNECTOR_ID = "core";
export const CORE_RDNS = "app.core";
export const CORE_INSTALL_URL = "https://core.app/";

type CoreProvider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  isAvalanche?: boolean;
  isMetaMask?: boolean;
  providers?: CoreProvider[];
};

function isCoreProvider(provider: CoreProvider | undefined): provider is CoreProvider {
  return Boolean(provider?.request && provider.isAvalanche && !provider.isMetaMask);
}

/** Core's own provider, not whichever wallet last wrote `window.ethereum`. */
export function getCoreProvider(): CoreProvider | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & {
    avalanche?: CoreProvider;
    ethereum?: CoreProvider;
  };
  if (w.avalanche?.request) return w.avalanche;
  const nested = w.ethereum?.providers?.find((provider: CoreProvider) => isCoreProvider(provider));
  if (nested) return nested;
  if (isCoreProvider(w.ethereum)) return w.ethereum;
  return undefined;
}

export function coreConnectMessage(err: unknown): string {
  const code = typeof err === "object" && err && "code" in err ? Number((err as { code: number }).code) : NaN;
  const name = err instanceof Error ? err.name : "";
  if (code === 4001 || name === "UserRejectedRequestError") {
    return "Connection cancelled in the wallet.";
  }
  if (code === -32002) {
    return "A connection request is already open in the wallet.";
  }
  if (name === "ProviderNotFoundError") {
    return "Install Core or MetaMask, then refresh this page.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Could not connect the Avalanche wallet.";
}
