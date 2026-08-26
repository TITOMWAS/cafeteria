import React, { useState } from 'react';

const CATEGORY_COLORS = {
  breakfast: { fill: 'var(--amber)', light: 'var(--amber-light)', color: 'var(--amber)' },
  lunch:     { fill: 'var(--green)', light: 'var(--green-light)', color: 'var(--green)' },
  supper:    { fill: 'var(--teal)',  light: 'var(--teal-light)',  color: 'var(--teal)' },
};

// Vertical bar chart — daily revenue trend
export const TrendChart = ({ data, height = 220 }) => {
  const [hovered, setHovered] = useState(null);
  if (!data?.length) return <p style={{ color: 'var(--text-muted)' }}>No trend data yet.</p>;

  const max = Math.max(...data.map((d) => d.revenue), 1);
  const W = 100; // viewBox width in "units", scaled by preserveAspectRatio
  const gap = 1.6;
  const barW = (W - gap * (data.length + 1)) / data.length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Peak day: <strong style={{ color: 'var(--text-primary)' }}>
            KES {Math.round(max).toLocaleString()}
          </strong>
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Last 7 days</span>
      </div>
      <svg viewBox={`0 0 ${W} 60`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }}>
        {[15, 30, 45].map((y) => (
          <line key={y} x1="0" y1={y} x2={W} y2={y} stroke="var(--border)" strokeWidth="0.25" />
        ))}
        {data.map((d, i) => {
          const h = Math.max((d.revenue / max) * 52, d.revenue > 0 ? 1.2 : 0.4);
          const x = gap + i * (barW + gap);
          const active = hovered === i;
          return (
            <g key={d.date} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              <rect x={x} y={54 - h} width={barW} height={h} rx="0.8"
                fill={active ? 'var(--accent)' : 'var(--accent-glow)'}
                opacity={active ? 1 : 0.85}
                style={{ transition: 'opacity 0.15s' }} />
              {active && (
                <>
                  <rect x={Math.max(x - 6, 0)} y="0" width="18" height="9" rx="1" fill="var(--bg-card)" stroke="var(--border)" strokeWidth="0.3" />
                  <text x={Math.max(x - 6, 0) + 9} y="5.6" textAnchor="middle" fontSize="4"
                    fill="var(--text-primary)" fontWeight="700">
                    {d.revenue >= 1000 ? `${(d.revenue / 1000).toFixed(1)}k` : Math.round(d.revenue)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', paddingLeft: `${gap}%` }}>
        {data.map((d, i) => (
          <div key={d.date}
            style={{
              flex: 1, textAlign: 'center', fontSize: '0.7rem',
              color: hovered === i ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: hovered === i ? 700 : 400,
            }}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
};

// Donut chart with center label + legend
export const DonutChart = ({ segments, centerLabel, centerValue, size = 190 }) => {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const R = 40;
  const CIRC = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--border)" strokeWidth="11" opacity="0.4" />
          {total > 0 && segments.map((seg) => {
            const frac = seg.value / total;
            const dash = frac * CIRC;
            const el = (
              <circle key={seg.label} cx="50" cy="50" r={R} fill="none"
                stroke={seg.color} strokeWidth="11"
                strokeDasharray={`${dash} ${CIRC - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt" />
            );
            offset += dash;
            return el;
          })}
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        }}>
          <span style={{ fontSize: '1.35rem', fontWeight: 800, fontFamily: 'var(--font-heading)', lineHeight: 1.1 }}>
            {centerValue}
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {centerLabel}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        {segments.map((seg) => (
          <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.85rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-secondary)', textTransform: 'capitalize', flex: 1 }}>{seg.label}</span>
            <strong style={{ color: 'var(--text-primary)' }}>{seg.value.toLocaleString()}</strong>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', minWidth: 38, textAlign: 'right' }}>
              {total ? Math.round((seg.value / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Horizontal bar list — e.g. top meals
export const HBarChart = ({ items }) => {
  if (!items?.length) return <p style={{ color: 'var(--text-muted)' }}>No sales recorded yet.</p>;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.25rem' }}>
            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
              {item.label}
            </span>
            <strong style={{ color: 'var(--text-primary)' }}>{item.value}</strong>
          </div>
          <div style={{ height: 8, borderRadius: 100, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 100,
              width: `${(item.value / max) * 100}%`,
              background: item.color || 'linear-gradient(90deg, var(--accent), var(--purple))',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
};

// Status pill distribution row
export const StatusBars = ({ statusBreakdown }) => {
  const entries = Object.entries(statusBreakdown || {}).filter(([, v]) => v > 0);
  if (!entries.length) return <p style={{ color: 'var(--text-muted)' }}>No orders this week.</p>;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div>
      <div style={{ display: 'flex', height: 14, borderRadius: 100, overflow: 'hidden', marginBottom: '0.75rem', border: '1px solid var(--border)' }}>
        {entries.map(([status, count]) => (
          <div key={status} title={`${status}: ${count}`} style={{
            width: `${(count / total) * 100}%`,
            background: `var(--${{ paid: 'accent', preparing: 'teal', ready: 'green', served: 'gray', pending: 'amber', expired: 'red' }[status] || 'purple'}-light)`,
            borderTop: `3px solid var(--${{ paid: 'accent', preparing: 'teal', ready: 'green', served: 'gray', pending: 'amber', expired: 'red' }[status] || 'purple'})`,
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
        {entries.map(([status, count]) => (
          <span key={status} className="badge" style={{ textTransform: 'capitalize' }}>
            {status}: <strong>{count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
};

export { CATEGORY_COLORS };
