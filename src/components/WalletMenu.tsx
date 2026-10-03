"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, LayoutDashboard, LogOut, ChevronDown } from "lucide-react";
import { useWallet } from "@/components/WalletProvider";
import { useEvmWallet } from "@/components/EvmWalletProvider";
import { isLaunchedCreatorCollection } from "@/lib/creator-access";

function shortAddress(pk: string) {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

/** Deterministic two-stop gradient from the address so the chip is recognisable at a glance. */
function avatarGradient(pk: string) {
  let h = 0;
  for (let i = 0; i < pk.length; i++) h = (h * 31 + pk.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 40 + (h >> 8) % 80) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 75% 45%))`;
}

export function WalletAvatar({ publicKey, size = 22 }: { publicKey: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full ring-1 ring-black/40"
      style={{ width: size, height: size, background: avatarGradient(publicKey) }}
    />
  );
}

export function WalletMenu({
  className = "",
  fullWidth = false,
  compact = false,
  onNavigate,
}: {
  className?: string;
  /** Mobile sheet: stack the menu inline instead of floating. */
  fullWidth?: boolean;
  /** Header: one Wallet control that opens the same connect actions. */
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { publicKey, connecting, connect, disconnect } = useWallet();
  const { address: evmAddress, connecting: evmConnecting, connectEvm, disconnectEvm } = useEvmWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [evmError, setEvmError] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    const wallet = publicKey || evmAddress;
    if (!wallet) {
      setIsCreator(false);
      return;
    }
    let cancelled = false;
    fetch("/api/collections?view=nav")
      .then((r) => r.json())
      .then((d: { collections?: { status?: string; payments?: { creatorWallet?: string } }[] }) => {
        if (cancelled) return;
        setIsCreator(
          (d.collections ?? []).some(
            (c) =>
              isLaunchedCreatorCollection(c, publicKey) ||
              isLaunchedCreatorCollection(c, evmAddress),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setIsCreator(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, evmAddress]);

  async function connectAvalanche() {
    setEvmError(null);
    try {
      await connectEvm();
    } catch (err) {
      setEvmError(err instanceof Error ? err.message : "Could not connect the Avalanche wallet.");
    }
  }

  const baseBtn =
    "inline-flex h-10 items-center justify-center gap-2 rounded-full border text-sm font-medium transition focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]";

  if (!publicKey && !evmAddress) {
    if (compact && !fullWidth) {
      return (
        <div ref={rootRef} className={`relative ${className}`}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={`${baseBtn} h-[38px] rounded-[10px] border-white/90 bg-transparent px-3 text-[13px] text-white hover:bg-white/10`}
          >
            {connecting || evmConnecting ? "Connecting…" : "Wallet"}
          </button>
          {open && (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] z-50 flex w-52 flex-col gap-2 rounded-[14px] border border-white/15 bg-[rgba(18,18,20,0.92)] p-2 shadow-[0_18px_44px_rgba(0,0,0,0.55)]"
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (connecting) disconnect();
                  else void connect();
                }}
                className={`${baseBtn} w-full border-white/20 bg-transparent px-3 text-white hover:bg-white/10`}
              >
                {connecting ? "Cancel" : "Connect Solana"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void connectAvalanche();
                }}
                className={`${baseBtn} w-full border-0 bg-white px-3 text-black hover:bg-[#e9e9ea]`}
              >
                {evmConnecting ? "Connecting…" : "Connect Avalanche"}
              </button>
            </div>
          )}
          {evmError && <p className="mt-2 max-w-52 text-[11px] leading-4 text-red-300">{evmError}</p>}
        </div>
      );
    }
    return (
      <div className={`flex flex-wrap items-center gap-2 ${fullWidth ? "w-full flex-col" : ""} ${className}`}>
        <button
          type="button"
          onClick={() => (connecting ? disconnect() : void connect())}
          className={`${baseBtn} border-line-strong bg-transparent px-4 text-ink hover:border-primary hover:text-primary ${
            fullWidth ? "w-full" : ""
          }`}
        >
          {connecting ? "Cancel" : "Connect Solana"}
        </button>
        <button
          type="button"
          onClick={() => void connectAvalanche()}
          className={`${baseBtn} border-line-strong bg-transparent px-4 text-ink hover:border-primary hover:text-primary ${
            fullWidth ? "w-full" : ""
          }`}
        >
          {evmConnecting ? "Connecting…" : "Connect Avalanche"}
        </button>
        {evmError && <p className={`${fullWidth ? "w-full" : ""} text-[11px] leading-4 text-red-300`}>{evmError}</p>}
      </div>
    );
  }

  const displayAddress = publicKey || evmAddress!;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(displayAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  const items = (
    <>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <WalletAvatar publicKey={displayAddress} size={32} />
        <div className="min-w-0">
          <p className="eyebrow !text-[10px]">{publicKey ? "Solana" : "Avalanche"}</p>
          <p className="num truncate font-[family-name:var(--font-mono)] text-sm text-ink">
            {shortAddress(displayAddress)}
          </p>
          {publicKey && evmAddress && (
            <p className="num mt-1 truncate font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
              AVAX {shortAddress(evmAddress)}
            </p>
          )}
        </div>
      </div>
      <div className="my-1 h-px bg-line" />
      <MenuItem onClick={copy} icon={copied ? <Check className="h-4 w-4 text-up" /> : <Copy className="h-4 w-4" />}>
        {copied ? "Copied" : "Copy address"}
      </MenuItem>
      {!publicKey && (
        <MenuItem onClick={() => void connect()} icon={<WalletAvatar publicKey="solana" size={16} />}>
          Connect Solana
        </MenuItem>
      )}
      {!evmAddress && (
        <MenuItem onClick={() => void connectAvalanche()} icon={<WalletAvatar publicKey="0xavax" size={16} />}>
          Connect Avalanche
        </MenuItem>
      )}
      {isCreator && (
        <MenuItem
          href="/dashboard"
          onClick={() => {
            setOpen(false);
            onNavigate?.();
          }}
          icon={<LayoutDashboard className="h-4 w-4" />}
        >
          Creator dashboard
        </MenuItem>
      )}
      <div className="my-1 h-px bg-line" />
      <MenuItem
        onClick={() => {
          setOpen(false);
          onNavigate?.();
          if (publicKey) disconnect();
          if (evmAddress) disconnectEvm();
        }}
        icon={<LogOut className="h-4 w-4" />}
        tone="danger"
      >
        Disconnect
      </MenuItem>
    </>
  );

  if (fullWidth) {
    return (
      <div className={`rounded-2xl border border-line bg-surface-1 p-1 ${className}`}>{items}</div>
    );
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`${baseBtn} border-line bg-surface-1 pl-1.5 pr-3 hover:border-line-strong hover:bg-surface-2`}
      >
        <WalletAvatar publicKey={displayAddress} />
        <span className="num font-[family-name:var(--font-mono)] text-[13px] text-ink">
          {shortAddress(displayAddress)}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-ink-muted transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 rounded-2xl border border-line-strong bg-surface-3 p-1 shadow-[0_24px_48px_-8px_rgba(0,0,0,0.7)]"
        >
          {items}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  icon,
  onClick,
  href,
  tone = "default",
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  tone?: "default" | "danger";
}) {
  const cls = `flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition ${
    tone === "danger"
      ? "text-ink-body hover:bg-primary/10 hover:text-primary"
      : "text-ink-body hover:bg-surface-2 hover:text-ink"
  }`;
  if (href) {
    return (
      <Link role="menuitem" href={href} onClick={onClick} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button role="menuitem" type="button" onClick={onClick} className={cls}>
      {icon}
      {children}
    </button>
  );
}
