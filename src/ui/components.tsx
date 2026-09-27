import { setIcon } from "obsidian";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { fmtClock, fmtNum, parseClock, parseNum } from "../format";
import type { Exercise } from "../types";
import { useCtx } from "./context";

export function Icon({ name, size }: { name: string; size?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.empty();
    setIcon(ref.current, name);
  }, [name]);
  return <span ref={ref} class="tt-icon" style={size ? { "--icon-size": `${size}px` } : undefined} />;
}

export function IconButton(props: { icon: string; label: string; onClick: (e: MouseEvent) => void; class?: string }) {
  return (
    <button
      class={`tt-icon-btn clickable-icon ${props.class ?? ""}`}
      aria-label={props.label}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick(e);
      }}
    >
      <Icon name={props.icon} />
    </button>
  );
}

/** Resolve an image reference asynchronously (library cache / vault / URL). */
export function useImage(ref: string | undefined, sourcePath?: string): string | undefined {
  const { store } = useCtx();
  const [url, setUrl] = useState<string | undefined>(ref ? store.images.cached(ref) : undefined);
  useEffect(() => {
    if (!ref) {
      setUrl(undefined);
      return;
    }
    let alive = true;
    const hit = store.images.cached(ref);
    if (hit) setUrl(hit);
    else void store.images.resolve(ref, sourcePath).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [ref, sourcePath]);
  return url;
}

/** Becomes true once the element scrolls into view (and stays true) — avoids downloading 800 thumbnails. */
function useVisible(ref: { current: HTMLElement | null }): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);
  return visible;
}

/**
 * Exercise picture. Library exercises have two frames (start / end position); with `animate`
 * they alternate, which reads like a slow GIF. Real GIFs from the vault just play.
 */
export function ExImage({ exercise, animate, class: cls }: { exercise?: Exercise; animate?: boolean; class?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const visible = useVisible(box);
  const refs = visible ? exercise?.images ?? [] : [];
  const [frame, setFrame] = useState(0);
  const multi = animate && refs.length > 1;
  useEffect(() => {
    if (!multi) return;
    const t = window.setInterval(() => setFrame((f) => (f + 1) % refs.length), 900);
    return () => window.clearInterval(t);
  }, [multi, refs.length]);
  const url0 = useImage(refs[0], exercise?.file);
  const url1 = useImage(multi ? refs[1] : undefined, exercise?.file);
  const url = frame === 1 && url1 ? url1 : url0;
  return (
    <div class={`tt-img ${cls ?? ""}`} ref={box}>
      {url ? <img src={url} alt="" loading="lazy" draggable={false} /> : <Icon name="dumbbell" />}
    </div>
  );
}

export function ExThumb({ exercise, onInfo }: { exercise?: Exercise; onInfo?: () => void }) {
  return (
    <div class="tt-thumb">
      <ExImage exercise={exercise} />
      {onInfo && (
        <button
          class="tt-thumb-info"
          aria-label="Об упражнении"
          onClick={(e) => {
            e.stopPropagation();
            onInfo();
          }}
        >
          ?
        </button>
      )}
    </div>
  );
}

/** Pill-shaped numeric field (kg, reps, km). Commits on blur / Enter. */
export function NumField(props: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; decimal?: boolean }) {
  const [text, setText] = useState(fmtNum(props.value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmtNum(props.value));
  }, [props.value]);
  const commit = () => {
    const v = parseNum(text);
    if (v !== props.value) props.onChange(v);
    setText(fmtNum(v));
  };
  return (
    <input
      class="tt-pill-input"
      type="text"
      inputMode={props.decimal ? "decimal" : "numeric"}
      value={text}
      placeholder={props.placeholder ?? "0"}
      onFocus={(e) => {
        focused.current = true;
        (e.currentTarget as HTMLInputElement).select();
      }}
      onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** mm:ss field. Accepts "90", "1:30", "1:02:00". */
export function TimeField(props: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(fmtClock(props.value ?? 0));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmtClock(props.value ?? 0));
  }, [props.value]);
  const commit = () => {
    const v = parseClock(text);
    if (v !== undefined && v !== props.value) props.onChange(v);
    setText(fmtClock(v ?? props.value ?? 0));
  };
  return (
    <input
      class="tt-pill-input tt-time-input"
      type="text"
      inputMode="numeric"
      value={text}
      onFocus={(e) => {
        focused.current = true;
        (e.currentTarget as HTMLInputElement).select();
      }}
      onInput={(e) => setText((e.currentTarget as HTMLInputElement).value)}
      onBlur={() => {
        focused.current = false;
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function Screen(props: { children: ComponentChildren; class?: string }) {
  return <div class={`tt-screen ${props.class ?? ""}`}>{props.children}</div>;
}

export function TopBar(props: { onBack?: () => void; title?: ComponentChildren; subtitle?: ComponentChildren; right?: ComponentChildren; accent?: boolean }) {
  return (
    <div class={`tt-topbar ${props.accent ? "is-accent" : ""}`}>
      {props.onBack && <IconButton icon="chevron-left" label="Назад" onClick={props.onBack} class="tt-back" />}
      <div class="tt-topbar-titles">
        {props.title !== undefined && <div class="tt-topbar-title">{props.title}</div>}
        {props.subtitle !== undefined && <div class="tt-topbar-sub">{props.subtitle}</div>}
      </div>
      {props.right && <div class="tt-topbar-right">{props.right}</div>}
    </div>
  );
}

export function BigButton(props: { children: ComponentChildren; onClick: () => void; kind?: "primary" | "outline" | "danger" | "dark"; icon?: string; disabled?: boolean; class?: string }) {
  return (
    <button class={`tt-big-btn is-${props.kind ?? "primary"} ${props.class ?? ""}`} onClick={props.onClick} disabled={props.disabled}>
      {props.icon && <Icon name={props.icon} />}
      <span>{props.children}</span>
    </button>
  );
}

export function Empty(props: { icon: string; title: string; text?: string; children?: ComponentChildren }) {
  return (
    <div class="tt-empty">
      <Icon name={props.icon} size={40} />
      <div class="tt-empty-title">{props.title}</div>
      {props.text && <div class="tt-empty-text">{props.text}</div>}
      {props.children}
    </div>
  );
}

export function Chips<T extends string>(props: { options: { value: T; label: string }[]; value: T | undefined; onChange: (v: T | undefined) => void }) {
  return (
    <div class="tt-chips">
      {props.options.map((o) => (
        <button class={`tt-chip ${props.value === o.value ? "is-active" : ""}`} onClick={() => props.onChange(props.value === o.value ? undefined : o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat(props: { label: string; value: string; unit?: string }) {
  return (
    <div class="tt-stat">
      <div class="tt-stat-value">
        {props.value}
        {props.unit && <span class="tt-stat-unit"> {props.unit}</span>}
      </div>
      <div class="tt-stat-label">{props.label}</div>
    </div>
  );
}

export type Style = JSX.CSSProperties;
