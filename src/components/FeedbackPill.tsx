"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";

const CATEGORIES = [
  { id: "bug", label: "Bug" },
  { id: "launch", label: "Launch" },
  { id: "rewards", label: "Rewards" },
  { id: "idea", label: "Idea" },
  { id: "other", label: "Other" },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

export function FeedbackPill() {
  const pathname = usePathname();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CategoryId>("idea");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    setError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          message,
          contact,
          page: pathname,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not send feedback");
      setSent(true);
      setMessage("");
      setContact("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send feedback");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSent(false);
          setOpen(true);
        }}
        className="fixed z-40 inline-flex max-w-[calc(100vw-5.5rem)] items-center gap-2 rounded-full border border-white/20 bg-[#161311]/95 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md hover:border-primary/70 hover:text-primary"
        style={{
          right: "max(1rem, env(safe-area-inset-right))",
          bottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-secondary" aria-hidden />
        <span className="truncate">Beta feedback</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close feedback"
            className="absolute inset-0 bg-black/60"
            onClick={close}
          />
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onSubmit={(event) => void submit(event)}
            className="absolute inset-x-0 bottom-0 flex max-h-[min(92dvh,40rem)] flex-col overflow-hidden rounded-t-3xl border border-white/15 bg-[#161311] pb-[max(1rem,env(safe-area-inset-bottom))] text-white shadow-2xl sm:inset-x-auto sm:right-[max(1rem,env(safe-area-inset-right))] sm:bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4.25rem))] sm:w-[min(24rem,calc(100vw-2rem))] sm:rounded-3xl"
          >
            <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.18em] text-secondary">
                  PUBLIC BETA
                </p>
                <h2 id={titleId} className="mt-1 text-xl font-semibold">
                  Send feedback
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/70 hover:text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
              {sent ? (
                <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm leading-6 text-white/80">
                  Thanks — we got it. Ginger is in public beta, so this goes straight to the team.
                </p>
              ) : (
                <div className="space-y-4">
                  <fieldset>
                    <legend className="text-xs text-white/50">Topic</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {CATEGORIES.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setCategory(item.id)}
                          className={`rounded-full px-3 py-1.5 text-sm ${
                            category === item.id
                              ? "bg-primary text-white"
                              : "border border-white/15 text-white/70 hover:border-white/35"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <label className="block">
                    <span className="text-xs text-white/50">What should we know?</span>
                    <textarea
                      required
                      minLength={8}
                      maxLength={2000}
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      rows={5}
                      placeholder="A bug, a launch idea, or something that felt confusing…"
                      className="input mt-2 min-h-28 resize-y text-base"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs text-white/50">How can we reply? (optional)</span>
                    <input
                      value={contact}
                      onChange={(event) => setContact(event.target.value)}
                      maxLength={200}
                      autoComplete="email"
                      inputMode="email"
                      placeholder="Email, Telegram, or X handle"
                      className="input mt-2 h-11 text-base"
                    />
                  </label>

                  {error && <p className="text-sm text-primary">{error}</p>}

                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-white hover:bg-primary/85 disabled:opacity-60"
                  >
                    {busy ? "Sending…" : "Send feedback"}
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
