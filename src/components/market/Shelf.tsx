import type { ReactNode } from "react";

/** Section wrapper: eyebrow + title on the left, hint / actions on the right. */
export function Shelf({
  id,
  eyebrow,
  title,
  hint,
  aside,
  children,
  className = "",
}: {
  id?: string;
  eyebrow: string;
  title: string;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-28 bg-transparent ${className}`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 sm:mb-6">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="mt-1.5 font-[family-name:var(--font-display)] text-[1.75rem] leading-none tracking-tight text-ink sm:text-[2.1rem]">
            {title}
          </h2>
          {hint && <p className="mt-2 max-w-md text-sm text-ink-muted">{hint}</p>}
        </div>
        {aside && <div className="flex items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
