import { useState } from "preact/hooks";

// Small single-series SVG charts. One hue (--tt-chart), thin marks, recessive grid,
// and a readout line above the plot that follows hover/tap (touch has no hover).

export interface Datum {
  label: string;
  value: number;
  /** readout text for this datum */
  tip: string;
}

const W = 320;
const H = 140;
const PAD = { l: 34, r: 8, t: 8, b: 20 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function fmtTick(v: number): string {
  if (v >= 10000) return `${Math.round(v / 1000)}k`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(v * 10) / 10);
}

function Grid({ max, min = 0, integer }: { max: number; min?: number; integer?: boolean }) {
  const mid = (min + max) / 2;
  const ticks = integer && !Number.isInteger(mid) ? [min, max] : [min, mid, max];
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min || 1)) * (H - PAD.t - PAD.b);
  return (
    <g class="tt-chart-grid">
      {ticks.map((t) => (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
          <text x={PAD.l - 6} y={y(t)} text-anchor="end" dominant-baseline="middle">
            {fmtTick(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Show every n-th x label, counted back from the last one so the newest is always labelled. */
function showLabel(i: number, n: number): boolean {
  const step = Math.ceil(n / 6);
  return (n - 1 - i) % step === 0;
}

export function BarChart({ data, emptyText, integer }: { data: Datum[]; emptyText?: string; integer?: boolean }) {
  const [sel, setSel] = useState<number | undefined>();
  if (!data.some((d) => d.value > 0)) return <div class="tt-chart-empty">{emptyText ?? "Нет данных"}</div>;
  const peak = Math.max(...data.map((d) => d.value));
  const max = integer && peak <= 5 ? Math.max(2, Math.ceil(peak / 2) * 2) : niceMax(peak);
  const plotW = W - PAD.l - PAD.r;
  const slot = plotW / data.length;
  const gap = 2;
  const bw = Math.max(2, slot - gap);
  const base = H - PAD.b;
  const cur = sel ?? data.length - 1;
  return (
    <div class="tt-chart">
      <div class="tt-chart-readout">{data[cur].tip}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={data.map((d) => d.tip).join("; ")} onMouseLeave={() => setSel(undefined)}>
        <Grid max={max} integer={integer} />
        {data.map((d, i) => {
          const h = (d.value / max) * (base - PAD.t);
          const x = PAD.l + i * slot + gap / 2;
          const r = Math.min(4, bw / 2, h);
          // bar with 4px rounded top, square at the baseline
          const path =
            h > 0
              ? `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + bw - r} Q${x + bw},${base - h} ${x + bw},${base - h + r} V${base} Z`
              : "";
          return (
            <g>
              {path && <path d={path} class={`tt-chart-bar ${i === cur ? "is-selected" : ""}`} />}
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={base - PAD.t} fill="transparent" onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} />
            </g>
          );
        })}
        {data.map((d, i) =>
          showLabel(i, data.length) ? (
            <text class="tt-chart-x" x={PAD.l + i * slot + slot / 2} y={H - 4} text-anchor="middle">
              {d.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

export function LineChart({ data, emptyText }: { data: Datum[]; emptyText?: string }) {
  const [sel, setSel] = useState<number | undefined>();
  if (data.length < 2) return <div class="tt-chart-empty">{emptyText ?? "Нужно хотя бы две тренировки"}</div>;
  const vals = data.map((d) => d.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo || hi * 0.1 || 1) * 0.2;
  const min = Math.max(0, Math.floor(lo - pad));
  const max = Math.ceil(hi + pad);
  const x = (i: number) => PAD.l + (i / (data.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);
  const cur = sel ?? data.length - 1;
  const d = data.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const slot = (W - PAD.l - PAD.r) / (data.length - 1);
  return (
    <div class="tt-chart">
      <div class="tt-chart-readout">{data[cur].tip}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={data.map((p) => p.tip).join("; ")} onMouseLeave={() => setSel(undefined)}>
        <Grid max={max} min={min} />
        <line class="tt-chart-cross" x1={x(cur)} x2={x(cur)} y1={PAD.t} y2={H - PAD.b} />
        <path d={d} class="tt-chart-line" />
        <circle cx={x(cur)} cy={y(data[cur].value)} r={4.5} class="tt-chart-dot" />
        {data.map((p, i) => (
          <rect x={x(i) - slot / 2} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setSel(i)} onClick={() => setSel(i)} />
        ))}
        <text class="tt-chart-x" x={x(0)} y={H - 4} text-anchor="start">
          {data[0].label}
        </text>
        <text class="tt-chart-x" x={x(data.length - 1)} y={H - 4} text-anchor="end">
          {data[data.length - 1].label}
        </text>
      </svg>
    </div>
  );
}
