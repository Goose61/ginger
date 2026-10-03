export default function PagesLoading() {
  return (
    <main className="page-shell" aria-busy="true" aria-live="polite">
      <div className="page-heading">
        <p className="ginger-loading-kicker">Opening</p>
        <h1>
          <span className="ginger-sr">Loading</span>
          <span className="ginger-loading-title" />
        </h1>
      </div>
      <section className="content-surface ginger-loading-surface" aria-label="Loading page">
        <span className="ginger-loading-line" />
        <span className="ginger-loading-line short" />
        <span className="ginger-loading-grid" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </section>
    </main>
  );
}
