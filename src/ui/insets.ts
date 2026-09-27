// Obsidian mobile draws its navigation bar (and some plugins their floating buttons) on top of
// the view instead of beside it, so the bottom of our UI would be hidden. We look at what is
// actually painted over the bottom strip of the view and expose its height as
// --tt-inset-bottom; the layout stops above it.

const SCAN_HEIGHT = 200;
const MAX_INSET = 180;

export function measureBottomInset(root: HTMLElement): number {
  const r = root.getBoundingClientRect();
  if (r.height < 100 || r.width < 50) return 0;
  let limit = r.bottom;
  for (const fx of [0.5, 0.2, 0.8]) {
    const x = r.left + r.width * fx;
    for (let y = r.bottom - 2; y > r.bottom - SCAN_HEIGHT; y -= 6) {
      const stack = document.elementsFromPoint(x, y);
      const ours = stack.findIndex((el) => root.contains(el));
      // elements before our first element in the stack are painted above us
      const above = (ours === -1 ? stack : stack.slice(0, ours)).filter((el) => !el.contains(root));
      // keep scanning upwards: a floating bar leaves a gap below itself
      if (!above.length) continue;
      const top = Math.min(...above.map((el) => el.getBoundingClientRect()).filter((b) => b.height < window.innerHeight * 0.5).map((b) => b.top));
      if (!Number.isFinite(top)) continue; // only something screen-sized (a modal) — ignore
      limit = Math.min(limit, top);
      y = Math.min(y, top);
    }
  }
  return Math.max(0, Math.min(MAX_INSET, Math.round(r.bottom - limit)));
}

/** Keeps --tt-inset-bottom on `root` up to date. Returns a disposer. */
export function watchBottomInset(root: HTMLElement): () => void {
  let last = -1;
  const update = () => {
    const inset = measureBottomInset(root);
    if (inset !== last) {
      last = inset;
      root.style.setProperty("--tt-inset-bottom", `${inset}px`);
    }
  };
  const raf = () => window.requestAnimationFrame(update);
  raf();
  window.addEventListener("resize", raf);
  // the navbar can appear/disappear (keyboard, orientation, settings) without a resize event
  const timer = window.setInterval(update, 1500);
  return () => {
    window.removeEventListener("resize", raf);
    window.clearInterval(timer);
  };
}
