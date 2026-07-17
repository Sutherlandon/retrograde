// app/components/TrendChart.tsx
// Single-series weekly trend chart (SVG line + area) for the admin dashboard.
// Shows anonymous aggregate counts only. Ships a hover crosshair + tooltip,
// keyboard navigation, and a data-table fallback so no value is hover-gated.

import { useRef, useState } from "react";

export interface TrendChartPoint {
  label: string; // ISO week-start date, e.g. "2026-06-29"
  value: number;
}

interface TrendChartProps {
  title: string;
  description: string;
  points: TrendChartPoint[];
}

// SVG geometry — the chart scales to its container via viewBox.
const W = 600;
const H = 220;
const M = { top: 18, right: 42, bottom: 26, left: 44 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-06-29" → "Jun 29" (parsed manually to avoid timezone day-shifts)
function formatWeek(label: string): string {
  const [, m, d] = label.split("-").map(Number);
  if (!m || !d) return label;
  return `${MONTHS[m - 1]} ${d}`;
}

// Smallest of 1/2/5 × 10^k that is >= x, for clean axis maxima.
function niceCeil(x: number): number {
  if (x <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= x) return m * pow;
  }
  return 10 * pow;
}

export default function TrendChart({ title, description, points }: TrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const n = points.length;
  const yMax = niceCeil(Math.max(...points.map((p) => p.value), 0));
  const mid = yMax / 2;
  const ticks = Number.isInteger(mid) ? [0, mid, yMax] : [0, yMax];

  const x = (i: number) => M.left + (n <= 1 ? PLOT_W / 2 : (i * PLOT_W) / (n - 1));
  const y = (v: number) => M.top + PLOT_H - (v / yMax) * PLOT_H;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`)
    .join(" ");
  const areaPath = n > 1
    ? `${linePath} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`
    : "";

  // Sparse x labels: first, two interior, last (deduped)
  const xLabelIndexes = [...new Set([0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1])];

  function indexFromClientX(clientX: number): number {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || n <= 1) return n - 1;
    const viewX = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((viewX - M.left) / PLOT_W) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const current = active ?? n - 1;
    if (e.key === "ArrowLeft") setActive(Math.max(0, current - 1));
    else if (e.key === "ArrowRight") setActive(Math.min(n - 1, current + 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else return;
    e.preventDefault();
  }

  if (n === 0) {
    return (
      <div className="border rounded-lg p-6 bg-white dark:bg-gray-900">
        <ChartHeader title={title} description={description} />
        <p className="text-sm text-gray-400 dark:text-gray-600 py-10 text-center">No data yet.</p>
      </div>
    );
  }

  const last = points[n - 1];
  const activePoint = active !== null ? points[active] : null;

  return (
    <div className="border rounded-lg p-6 bg-white dark:bg-gray-900">
      <ChartHeader title={title} description={description} />

      <div
        className="relative outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        data-testid="trend-hotspot"
        tabIndex={0}
        onFocus={() => setActive((a) => a ?? n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKeyDown}
        onPointerMove={(e) => setActive(indexFromClientX(e.clientX))}
        onPointerLeave={() => setActive(null)}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label={`${title} — trend chart, latest value ${last.value.toLocaleString()}`}
        >
          {/* horizontal hairline gridlines + y ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)}
                className="stroke-gray-200 dark:stroke-gray-700" strokeWidth={1}
              />
              <text
                x={M.left - 8} y={y(t) + 3} textAnchor="end" fontSize={10}
                style={{ fontVariantNumeric: "tabular-nums" }}
                className="fill-gray-500 dark:fill-gray-400"
              >
                {t.toLocaleString()}
              </text>
            </g>
          ))}

          {/* x labels */}
          {xLabelIndexes.map((i) => (
            <text
              key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10}
              className="fill-gray-500 dark:fill-gray-400"
            >
              {formatWeek(points[i].label)}
            </text>
          ))}

          {/* area wash + 2px line */}
          {areaPath && (
            <path d={areaPath} className="fill-blue-600 dark:fill-blue-500" fillOpacity={0.1} />
          )}
          <path
            d={linePath} fill="none" strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round"
            className="stroke-blue-600 dark:stroke-blue-500"
          />

          {/* crosshair + active marker */}
          {activePoint && active !== null && (
            <g>
              <line
                x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + PLOT_H}
                className="stroke-gray-400 dark:stroke-gray-500" strokeWidth={1}
              />
              <circle
                cx={x(active)} cy={y(activePoint.value)} r={4} strokeWidth={2}
                className="fill-blue-600 dark:fill-blue-500 stroke-white dark:stroke-gray-900"
              />
            </g>
          )}

          {/* end marker with surface ring + direct label of the latest value */}
          <circle
            cx={x(n - 1)} cy={y(last.value)} r={4} strokeWidth={2}
            className="fill-blue-600 dark:fill-blue-500 stroke-white dark:stroke-gray-900"
          />
          {/* right of the dot: the line never extends there, so no collision */}
          <text
            x={x(n - 1) + 8} y={y(last.value) + 4}
            textAnchor="start" fontSize={11} fontWeight={600}
            className="fill-gray-700 dark:fill-gray-200"
          >
            {last.value.toLocaleString()}
          </text>
        </svg>

        {/* tooltip / focus readout — value leads, week follows */}
        {activePoint && active !== null && (
          <div
            role="status"
            className="absolute top-0 -translate-x-1/2 -translate-y-1 pointer-events-none whitespace-nowrap
                       border rounded bg-white dark:bg-gray-800 shadow-sm px-2 py-1 flex items-center gap-1.5"
            style={{ left: `${(x(active) / W) * 100}%` }}
          >
            <span className="inline-block w-3 h-0.5 bg-blue-600 dark:bg-blue-500" aria-hidden="true" />
            <span className="text-sm font-semibold">{activePoint.value.toLocaleString()}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              week of {formatWeek(activePoint.label)}
            </span>
          </div>
        )}
      </div>

      <DataTable title={title} points={points} />
    </div>
  );
}

function ChartHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
    </div>
  );
}

// Every charted value is reachable without hovering.
function DataTable({ title, points }: { title: string; points: TrendChartPoint[] }) {
  return (
    <details className="mt-3">
      <summary className="text-xs text-gray-400 dark:text-gray-600 cursor-pointer select-none">
        Data table
      </summary>
      <table className="table-auto w-full mt-2 text-sm">
        <thead>
          <tr>
            <th className="text-left px-2 py-1 border-b-2">Week of</th>
            <th className="text-right px-2 py-1 border-b-2">{title}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.label}>
              <td className="px-2 py-1 border-b dark:border-gray-700">{p.label}</td>
              <td
                className="px-2 py-1 border-b dark:border-gray-700 text-right"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {p.value.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
