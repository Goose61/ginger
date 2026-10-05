const THUMB_SELECTOR = "img[data-grid-thumb]";

/**
 * Stop collection thumbnails that have not finished, then start the full image.
 * In-flight thumbs hold the browser and the image server, so a high-priority
 * request still waits behind them until those requests are cancelled.
 */
export function promoteFullImage(src: string, loaded: Set<string>): HTMLImageElement {
  if (typeof document !== "undefined") {
    document.querySelectorAll<HTMLImageElement>(THUMB_SELECTOR).forEach((img) => {
      const current = img.getAttribute("src");
      if (!current) return;
      if (img.complete && img.naturalWidth > 0) {
        loaded.add(current);
        return;
      }
      img.removeAttribute("src");
    });
  }

  const pre = new Image();
  pre.decoding = "async";
  pre.setAttribute("fetchpriority", "high");
  pre.src = src;
  return pre;
}
