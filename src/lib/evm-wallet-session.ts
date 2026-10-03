export type ActiveEvmWallet = {
  address: string;
  signMessage: (message: string) => Promise<string>;
};

let active: ActiveEvmWallet | null = null;

export function setActiveEvmWallet(wallet: ActiveEvmWallet | null) {
  active = wallet;
}

export function getActiveEvmWallet(): ActiveEvmWallet | null {
  return active;
}
