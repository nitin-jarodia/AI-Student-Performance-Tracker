import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

export const CHART_COLORS = [
  '#6366f1', // brand-500
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
]

export const COLORS = {
  primary: '#6366f1',
  secondary: '#06b6d4',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  accent: '#8b5cf6',
}

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-card backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/95">
      {label !== undefined && (
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: p.color || p.fill }}
            />
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {p.name}:
            </span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatter ? formatter(p.value) : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChartLegend({ payload }) {
  if (!payload?.length) return null
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 text-xs">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: p.color || p.payload?.fill }}
          />
          <span className="font-medium text-slate-600 dark:text-slate-300">
            {p.value}
          </span>
        </div>
      ))}
    </div>
  )
}

const AXIS_STYLE = { fontSize: 11, fill: '#64748b' }

export function SubjectBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="bar-brand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#4f46e5" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="subject" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <Tooltip
          content={<ChartTooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />}
          cursor={{ fill: 'rgba(99,102,241,0.08)' }}
        />
        <Bar
          dataKey="score"
          fill="url(#bar-brand)"
          radius={[10, 10, 0, 0]}
          maxBarSize={48}
          animationDuration={1000}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ScoreTrendChart({ data }) {
  if (!data?.length) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400 dark:border-slate-700">
        Add more dated scores to see a trend.
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="area-brand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={AXIS_STYLE} axisLine={false} tickLine={false} />
        <Tooltip
          content={<ChartTooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />}
        />
        <Legend content={<ChartLegend />} />
        <Area
          type="monotone"
          dataKey="avg"
          name="Avg %"
          stroke="#6366f1"
          strokeWidth={2.5}
          fill="url(#area-brand)"
          dot={{ r: 3, strokeWidth: 2, stroke: '#6366f1', fill: '#fff' }}
          activeDot={{ r: 5 }}
          animationDuration={1200}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function RiskPieChart({ high, medium, low }) {
  const data = [
    { name: 'High', value: high || 0, fill: COLORS.danger },
    { name: 'Medium', value: medium || 0, fill: COLORS.warning },
    { name: 'Low', value: low || 0, fill: COLORS.success },
  ].filter((d) => d.value > 0)

  if (!data.length) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">
        No risk data yet
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={4}
          dataKey="value"
          nameKey="name"
          stroke="none"
          animationDuration={1000}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend content={<ChartLegend />} verticalAlign="bottom" height={28} />
      </PieChart>
    </ResponsiveContainer>
  )
}

export function RiskChart(props) {
  return <RiskPieChart {...props} />
}

export function GradeDistributionBar({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
      >
        <defs>
          <linearGradient id="bar-cyan" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="grade"
          width={36}
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(6,182,212,0.08)' }} />
        <Bar
          dataKey="count"
          fill="url(#bar-cyan)"
          radius={[0, 10, 10, 0]}
          barSize={22}
          animationDuration={1000}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Tiny sparkline area chart for KPI cards. */
export function Sparkline({ data = [], color = '#6366f1', height = 40 }) {
  if (!data?.length) return <div className="h-10" />
  const id = `spark-${color.replace('#', '')}`
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export { ChartTooltip, ChartLegend }
