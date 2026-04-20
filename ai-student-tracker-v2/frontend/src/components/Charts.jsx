import {
  BarChart,
  Bar,
  LineChart,
  Line,
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

const COLORS = {
  primary: '#4F46E5',
  secondary: '#0EA5E9',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
}

const tooltipStyle = {
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 10px 15px -3px rgb(15 23 42 / 0.08)',
}

export function SubjectBarChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="subject" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} />
        <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Score']} contentStyle={tooltipStyle} />
        <Bar dataKey="score" fill={COLORS.primary} radius={[8, 8, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ScoreTrendChart({ data }) {
  if (!data?.length) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400">
        Add more dated scores to see a trend.
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
        <Line type="monotone" dataKey="avg" name="Avg %" stroke={COLORS.primary} strokeWidth={2.5} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Donut-style risk split */
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
          innerRadius={58}
          outerRadius={88}
          paddingAngle={4}
          dataKey="value"
          nameKey="name"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.fill} stroke="transparent" />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend verticalAlign="bottom" height={28} />
      </PieChart>
    </ResponsiveContainer>
  )
}

/** Backwards compatibility */
export function RiskChart(props) {
  return <RiskPieChart {...props} />
}

export function GradeDistributionBar({ data }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
        <YAxis type="category" dataKey="grade" width={36} tick={{ fontSize: 11, fill: '#64748b' }} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" fill={COLORS.secondary} radius={[0, 8, 8, 0]} barSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}
