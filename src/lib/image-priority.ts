const THUMB_SELECTOR = "img[data-grid-thumb]";

/** Begin the full image on its own connection. Does not touch the grid. */
export function startFullImage(src: string): HTMLImageElement {
  if (typeof document !== "undefined") {
    document.querySelectorAll("link[data-full-image]").forEach((el) => {
      if (el.getAttribute("href") !== src) el.remove();
    });
    if (!document.querySelector(`link[data-full-image="${CSS.escape(src)}"]`)) {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = src;
      link.setAttribute("fetchpriority", "high");
      link.setAttribute("data-full-image", src);
      document.head.appendChild(link);
    }
  }

  const pre = new Image();
  pre.decoding = "async";
  pre.setAttribute("fetchpriority", "high");
  pre.src = src;
  return pre;
}

/**
 * Cancel thumbnails that have not finished, then start the full image.
 * Removing the src attribute does not cancel an in-flight image request.
 * Replacing it with a data URL does.
 */
export function promoteFullImage(src: string, loaded: Set<string>): HTMLImageElement {
  if (typeof document !== "undefined") {
    document.querySelectorAll<HTMLImageElement>(THUMB_SELECTOR).forEach((img) => {
      const current = img.getAttribute("src");
      if (!current || current.startsWith("data:")) return;
      if (img.complete && img.naturalWidth > 0) {
        loaded.add(current);
        return;
      }
      img.src = "data:,";
    });
  }
  return startFullImage(src);
}
