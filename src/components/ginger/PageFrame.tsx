import Link from "next/link";

export function PageFrame({
  title,
  children,
  bare = false,
  surfaceId,
  surfaceLabel,
}: {
  title: string;
  children: React.ReactNode;
  bare?: boolean;
  surfaceId?: string;
  surfaceLabel?: string;
}) {
  return (
    <main className="page-shell">
      <div className="page-heading">
        <h1>{title}</h1>
        <Link href="/">Ginger / Home</Link>
      </div>
      {bare ? (
        children
      ) : (
        <section className="content-surface" id={surfaceId} aria-label={surfaceLabel ?? `${title} content`}>
          {children}
        </section>
      )}
    </main>
  );
}
