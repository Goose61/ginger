"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Copy, LayoutDashboard, LogOut, ChevronDown } from "lucide-react";
import { useWallet } from "@/components/WalletProvider";
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
  onNavigate,
}: {
  className?: string;
  /** Mobile sheet: stack the menu inline instead of floating. */
  fullWidth?: boolean;
  onNavigate?: () => void;
}) {
  const { publicKey, connecting, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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
    if (!publicKey) {
      setIsCreator(false);
      return;
    }
    let cancelled = false;
    fetch("/api/collections?view=nav")
      .then((r) => r.json())
      .then((d: { collections?: { status?: string; payments?: { creatorWallet?: string } }[] }) => {
        if (cancelled) return;
        setIsCreator((d.collections ?? []).some((c) => isLaunchedCreatorCollection(c, publicKey)));
      })
      .catch(() => {
        if (!cancelled) setIsCreator(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  const baseBtn =
    "inline-flex h-10 items-center justify-center gap-2 rounded-full border text-sm font-medium transition focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)]";

  if (!publicKey) {
    return (
      <button
        type="button"
        onClick={() => (connecting ? disconnect() : void connect())}
        className={`${baseBtn} border-line-strong bg-transparent px-4 text-ink hover:border-primary hover:text-primary ${
          fullWidth ? "w-full" : ""
        } ${className}`}
      >
        {connecting ? "Cancel" : "Connect wallet"}
      </button>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  const items = (
    <>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <WalletAvatar publicKey={publicKey} size={32} />
        <div className="min-w-0">
          <p className="eyebrow !text-[10px]">Connected</p>
          <p className="num truncate font-[family-name:var(--font-mono)] text-sm text-ink">
            {shortAddress(publicKey)}
          </p>
        </div>
      </div>
      <div className="my-1 h-px bg-line" />
      <MenuItem onClick={copy} icon={copied ? <Check className="h-4 w-4 text-up" /> : <Copy className="h-4 w-4" />}>
        {copied ? "Copied" : "Copy address"}
      </MenuItem>
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
          disconnect();
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
        <WalletAvatar publicKey={publicKey} />
        <span className="num font-[family-name:var(--font-mono)] text-[13px] text-ink">
          {shortAddress(publicKey)}
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
