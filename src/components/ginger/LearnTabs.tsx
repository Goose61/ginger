"use client";

import { useEffect, useState, type ReactNode } from "react";

const PANELS = [
  { key: "faq", label: "FAQ" },
  { key: "security", label: "Security" },
  { key: "about", label: "About" },
] as const;

type PanelKey = (typeof PANELS)[number]["key"];

function isPanel(value: string): value is PanelKey {
  return value === "faq" || value === "security" || value === "about";
}

export function LearnTabs({
  faq,
  security,
  about,
}: {
  faq: ReactNode;
  security: ReactNode;
  about: ReactNode;
}) {
  const content: Record<PanelKey, ReactNode> = { faq, security, about };
  const [panel, setPanel] = useState<PanelKey>("faq");

  useEffect(() => {
    const read = () => {
      const key = window.location.hash.slice(1);
      if (isPanel(key)) setPanel(key);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  function select(key: PanelKey, focus = false) {
    setPanel(key);
    const next = `${window.location.pathname}${window.location.search}#${key}`;
    window.history.replaceState(null, "", next);
    if (focus) document.getElementById(`tab-${key}`)?.focus();
  }

  return (
    <>
      <div className="learn-tabs" role="tablist" aria-label="Learn">
        {PANELS.map((item, index) => {
          const selected = panel === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`tab-${item.key}`}
              aria-controls={`panel-${item.key}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(item.key)}
              onKeyDown={(event) => {
                let next = -1;
                if (event.key === "ArrowRight") next = (index + 1) % PANELS.length;
                if (event.key === "ArrowLeft") next = (index + PANELS.length - 1) % PANELS.length;
                if (event.key === "Home") next = 0;
                if (event.key === "End") next = PANELS.length - 1;
                if (next === -1) return;
                event.preventDefault();
                select(PANELS[next].key, true);
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {PANELS.map((item) => (
        <section
          key={item.key}
          className="content-surface"
          role="tabpanel"
          id={`panel-${item.key}`}
          aria-labelledby={`tab-${item.key}`}
          tabIndex={0}
          hidden={panel !== item.key}
        >
          {content[item.key]}
        </section>
      ))}
    </>
  );
}
