/** Hand-rolled inline SVG bar chart — same no-new-dependency approach as the
 *  donut chart in admin/page.tsx (this repo has no charting library). Renders
 *  one bar per day, optionally with a horizontal line marking a free-tier cap. */

const CHART_HEIGHT = 120;
const BAR_GAP = 3;
const BAR_MIN_WIDTH = 6;

export interface DailyBarChartProps {
  data: { date: string; value: number }[];
  /** Free-tier cap to draw as a horizontal reference line, if any. */
  capValue?: number;
  /** e.g. (v) => `$${v.toFixed(3)}` or (v) => `${v}`. */
  formatValue?: (v: number) => string;
  barColor?: string;
  capColor?: string;
  ariaLabel: string;
}

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function DailyBarChart({
  data,
  capValue,
  formatValue = (v) => String(v),
  barColor = "oklch(50% 0.16 25)",
  capColor = "oklch(60% 0.14 40)",
  ariaLabel,
}: DailyBarChartProps) {
  const barWidth = Math.max(BAR_MIN_WIDTH, Math.min(20, 480 / Math.max(1, data.length)));
  const width = data.length * (barWidth + BAR_GAP);
  const maxValue = Math.max(1, capValue ?? 0, ...data.map((d) => d.value));
  const capY = capValue !== undefined ? CHART_HEIGHT - (capValue / maxValue) * CHART_HEIGHT : null;

  const last = data[data.length - 1];
  const first = data[0];

  return (
    <div className="bar-chart">
      <svg
        viewBox={`0 0 ${width} ${CHART_HEIGHT + 20}`}
        width="100%"
        height={CHART_HEIGHT + 20}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="none"
      >
        {capY !== null && (
          <line x1={0} y1={capY} x2={width} y2={capY} stroke={capColor} strokeWidth={1} strokeDasharray="4 3" />
        )}
        {data.map((d, i) => {
          const barHeight = (d.value / maxValue) * CHART_HEIGHT;
          const x = i * (barWidth + BAR_GAP);
          const y = CHART_HEIGHT - barHeight;
          const overCap = capValue !== undefined && d.value > capValue;
          return (
            <rect
              key={d.date}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(0, barHeight)}
              fill={overCap ? capColor : barColor}
            >
              <title>
                {d.date}: {formatValue(d.value)}
              </title>
            </rect>
          );
        })}
      </svg>
      {first && last && (
        <div className="bar-chart-axis">
          <span>{formatShortDate(first.date)}</span>
          <span>{formatShortDate(last.date)}</span>
        </div>
      )}
    </div>
  );
}
