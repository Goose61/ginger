"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Rocket, Gift, CircleHelp, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatUsd } from "@/lib/collection-ui";
import type { SearchItem, MarketStatus } from "@/lib/market-view";

/* ───────────────────────── context ───────────────────────── */

type SearchCtx = { open: () => void; close: () => void; isOpen: boolean };
const Ctx = createContext<SearchCtx>({ open: () => {}, close: () => {}, isOpen: false });

export function useGlobalSearch() {
  return useContext(Ctx);
}

const RECENT_KEY = "ginger:recent-search";
const MAX_RECENT = 4;

function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const next = [id, ...readRecents().filter((v) => v !== id)].slice(0, MAX_RECENT);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode / SSR — ignore */
  }
}

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  // ⌘K / Ctrl+K and "/" open the palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <SearchDialog open={isOpen} onOpenChange={setOpen} />
    </Ctx.Provider>
  );
}

/* ───────────────────────── trigger ───────────────────────── */

export function SearchTrigger({
  variant = "pill",
  className = "",
  placeholder = "Search collections",
}: {
  variant?: "pill" | "icon" | "hero";
  className?: string;
  placeholder?: string;
}) {
  const { open } = useGlobalSearch();

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="Search collections"
        className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-line text-ink-body transition hover:border-line-strong hover:text-ink ${className}`}
      >
        <Search className="h-4 w-4" aria-hidden />
      </button>
    );
  }

  if (variant === "hero") {
    return (
      <button
        type="button"
        onClick={open}
        className={`group flex h-14 w-full items-center gap-3 rounded-full border border-line bg-surface-1 pl-5 pr-2 text-left text-ink-muted shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)] transition hover:border-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] ${className}`}
      >
        <Search className="h-5 w-5 shrink-0 text-ink-subtle" aria-hidden />
        <span className="flex-1 truncate text-base">{placeholder}</span>
        <span className="hidden items-center gap-1 rounded-full border border-line px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] text-ink-subtle sm:inline-flex">
          <kbd>⌘</kbd>
          <kbd>K</kbd>
        </span>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white transition group-hover:bg-[#6d4ed4]">
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className={`flex h-10 w-full max-w-[30rem] items-center gap-2.5 rounded-full border border-line bg-surface-1 px-3.5 text-left text-sm text-ink-muted transition hover:border-line-strong hover:bg-surface-2 focus-visible:outline-none focus-visible:[box-shadow:var(--focus-ring)] ${className}`}
    >
      <Search className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
      <span className="flex-1 truncate">{placeholder}</span>
      <span className="hidden items-center gap-0.5 rounded-md border border-line px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-ink-subtle lg:inline-flex">
        ⌘K
      </span>
    </button>
  );
}

/* ───────────────────────── dialog ───────────────────────── */

type Row =
  | { kind: "collection"; item: SearchItem; href: string }
  | { kind: "action"; id: string; label: string; hint: string; href: string; icon: ReactNode };

const ACTIONS: Row[] = [
  {
    kind: "action",
    id: "launch",
    label: "Launch a collection",
    hint: "Upload art, set a price, go live",
    href: "/launch",
    icon: <Rocket className="h-4 w-4" aria-hidden />,
  },
  {
    kind: "action",
    id: "gift",
    label: "Send a gift NFT",
    hint: "Mint a 1/1 to any wallet",
    href: "/gift",
    icon: <Gift className="h-4 w-4" aria-hidden />,
  },
  {
    kind: "action",
    id: "faq",
    label: "How Ginger works",
    hint: "Fees, payments, secondary",
    href: "/faq",
    icon: <CircleHelp className="h-4 w-4" aria-hidden />,
  },
];

function matches(item: SearchItem, q: string) {
  if (!q) return true;
  const hay = `${item.name} ${item.slug}`.toLowerCase();
  // every whitespace-separated term must appear
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term));
}

function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [error, setError] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Load once per open session; the endpoint is edge-cached for 30s.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    setRecents(readRecents());
    if (items) return;
    let cancelled = false;
    fetch("/api/collections?view=search")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { collections?: SearchItem[] }) => {
        if (!cancelled) setItems(d.collections ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const q = query.trim().toLowerCase();

  const rows = useMemo<Row[]>(() => {
    const all = items ?? [];
    const toRow = (item: SearchItem): Row => ({
      kind: "collection",
      item,
      href: `/collection/${item.slug || item.id}`,
    });
    if (!q) {
      const recentRows = recents
        .map((id) => all.find((c) => c.id === id))
        .filter((c): c is SearchItem => Boolean(c))
        .map(toRow);
      const recentIds = new Set(recents);
      const top = all.filter((c) => !recentIds.has(c.id)).slice(0, 5).map(toRow);
      return [...recentRows, ...top, ...ACTIONS];
    }
    const hits = all.filter((c) => matches(c, q)).slice(0, 8).map(toRow);
    const actionHits = ACTIONS.filter(
      (a) => a.kind === "action" && `${a.label} ${a.hint}`.toLowerCase().includes(q),
    );
    return [...hits, ...actionHits];
  }, [items, q, recents]);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  const go = useCallback(
    (row: Row) => {
      if (row.kind === "collection") pushRecent(row.item.id);
      onOpenChange(false);
      router.push(row.href);
    },
    [onOpenChange, router],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(rows.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter") {
      const row = rows[cursor];
      if (row) {
        e.preventDefault();
        go(row);
      }
    }
  };

  // keep the active row in view
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const recentCount = q ? 0 : rows.filter((r) => r.kind === "collection" && recents.includes(r.item.id)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12vh] w-[min(40rem,calc(100%-1.5rem))] max-w-none translate-y-0 gap-0 overflow-hidden rounded-2xl border border-line-strong bg-surface-1 p-0 shadow-[0_32px_64px_-8px_rgba(0,0,0,0.7)] ring-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">Search Ginger</DialogTitle>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search collections, or jump to launch / gift / FAQ"
            role="combobox"
            aria-expanded
            aria-controls="global-search-list"
            aria-activedescendant={rows[cursor] ? `gs-row-${cursor}` : undefined}
            className="h-14 flex-1 bg-transparent text-base text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-ink-subtle sm:block">
            ESC
          </kbd>
        </div>

        <ul
          id="global-search-list"
          ref={listRef}
          role="listbox"
          className="max-h-[60vh] overflow-y-auto p-2"
        >
          {items === null && (
            <li className="px-3 py-6 text-center text-sm text-ink-muted">Loading collections…</li>
          )}
          {items !== null && rows.length === 0 && (
            <li className="px-3 py-8 text-center">
              <p className="text-lg text-ink">Nothing here yet</p>
              <p className="mt-1 text-sm text-ink-muted">
                {error ? "Search is unavailable right now." : `No collections match “${query}”.`}
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-4 rounded-full border border-line px-4 py-1.5 text-sm text-ink-body hover:border-line-strong"
              >
                Clear search
              </button>
            </li>
          )}
          {rows.map((row, i) => {
            const active = i === cursor;
            const isRecent = row.kind === "collection" && !q && recents.includes(row.item.id);
            const showRecentHead = isRecent && i === 0;
            const showTopHead = !q && row.kind === "collection" && !isRecent && i === recentCount;
            const showActionHead = row.kind === "action" && (i === 0 || rows[i - 1].kind !== "action");
            return (
              <li key={row.kind === "collection" ? row.item.id : row.id} data-index={i}>
                {showRecentHead && <GroupLabel>Recent</GroupLabel>}
                {showTopHead && <GroupLabel>Top collections</GroupLabel>}
                {showActionHead && <GroupLabel>Go to</GroupLabel>}
                <Link
                  id={`gs-row-${i}`}
                  role="option"
                  aria-selected={active}
                  href={row.href}
                  onClick={(e) => {
                    e.preventDefault();
                    go(row);
                  }}
                  onMouseMove={() => setCursor(i)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${
                    active ? "bg-surface-2" : "hover:bg-surface-2/60"
                  }`}
                >
                  {row.kind === "collection" ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={row.item.coverSrc}
                        alt={`${row.item.name} cover`}
                        loading="lazy"
                        className="h-10 w-10 shrink-0 rounded-lg border border-line bg-surface-2 object-contain"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-ink">{row.item.name}</span>
                          <StatusPill status={row.item.status} />
                        </span>
                        <span className="num mt-0.5 block font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
                          Floor {formatUsd(row.item.floorUsd)} · {row.item.mintedPct}% minted
                        </span>
                      </span>
                      {isRecent && <Clock className="h-3.5 w-3.5 text-ink-subtle" aria-hidden />}
                    </>
                  ) : (
                    <>
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-body">
                        {row.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{row.label}</span>
                        <span className="block text-[12px] text-ink-muted">{row.hint}</span>
                      </span>
                    </>
                  )}
                  <ArrowRight
                    className={`h-4 w-4 shrink-0 transition ${active ? "text-primary" : "text-transparent"}`}
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-ink-subtle">
          <span className="hidden sm:inline">
            <kbd className="font-[family-name:var(--font-mono)]">↑↓</kbd> navigate ·{" "}
            <kbd className="font-[family-name:var(--font-mono)]">↵</kbd> open
          </span>
          <Link
            href="/explore"
            onClick={() => onOpenChange(false)}
            className="ml-auto text-ink-muted hover:text-ink"
          >
            Browse the market →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="eyebrow px-3 pb-1 pt-3 first:pt-1">{children}</p>;
}

export function StatusPill({ status, className = "" }: { status: MarketStatus; className?: string }) {
  const map: Record<MarketStatus, { label: string; cls: string }> = {
    minting: { label: "Minting", cls: "bg-up/15 text-up" },
    listed: { label: "Listed", cls: "bg-gold/15 text-gold" },
    sold_out: { label: "Sold out", cls: "bg-surface-3 text-ink-muted" },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.02em] ${cls} ${className}`}
    >
      {label}
    </span>
  );
}
