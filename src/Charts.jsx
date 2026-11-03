import React, { useState } from 'react';

/* ─────────────────────────────────────────────────────────────
   VYRO POS — Pure SVG / CSS Chart Components
   No external library — works offline
───────────────────────────────────────────────────────────── */

const fmt = n => `KSh ${Number(n||0).toLocaleString('en-KE', {minimumFractionDigits:0, maximumFractionDigits:0})}`;
const fmtShort = n => {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n/1_000).toFixed(1)}K`;
  return String(Math.round(n));
};

/* ── Tiny sparkline ─────────────────────────────────────────── */
export function Sparkline({ data, color = '#7c3aed', height = 40, width = 120 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${height - (v / max) * height}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{overflow:'visible'}}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length-1)*step} cy={height-(data[data.length-1]/max)*height} r="3" fill={color} />
    </svg>
  );
}

/* ── Bar chart ──────────────────────────────────────────────── */
export function BarChart({ data, height = 180, color = '#7c3aed', onHover }) {
  const [hovered, setHovered] = useState(null);
  if (!data || !data.length) return <div className="chart-empty">No data</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    // Outer div: height = chart height + 24px for labels below
    <div className="bi-bar-chart" style={{ height: height + 24 }}>
      <div className="bi-bar-axis-y">
        {[1, 0.75, 0.5, 0.25, 0].map(p => (
          <span key={p} style={{ bottom: `${p * 100}%` }}>{fmtShort(max * p)}</span>
        ))}
      </div>
      <div className="bi-bar-area">
        {data.map((d, i) => {
          const pct = Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0);
          return (
            <div
              key={i}
              className={`bi-bar-col${hovered === i ? ' hovered' : ''}`}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {hovered === i && (
                <div className="bi-tooltip">
                  <b>{d.label}</b>
                  <span>{fmt(d.value)}</span>
                  {d.sublabel && <small>{d.sublabel}</small>}
                </div>
              )}
              <div className="bi-bar" style={{ height: `${pct}%`, background: d.color || color }} />
              <span className="bi-bar-label">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Multi-line chart ────────────────────────────────────────── */
export function LineChart({ series, labels, height = 180 }) {
  const [hovered, setHovered] = useState(null);
  if (!series?.length || !labels?.length) return <div className="chart-empty">No data</div>;
  const allVals = series.flatMap(s => s.data || []);
  const max = allVals.length > 0 ? Math.max(...allVals, 1) : 1;
  const W = 100, H = 100;
  const xs = labels.map((_, i) => (i / Math.max(labels.length - 1, 1)) * W);
  const y  = v => H - (v / max) * H * 0.9 - H * 0.05;

  return (
    <div className="bi-line-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="bi-line-svg"
        style={{ height }}
      >
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(p => (
          <line key={p} x1="0" y1={y(max*p)} x2={W} y2={y(max*p)}
            stroke="var(--line)" strokeWidth="0.3" />
        ))}
        {/* Lines + areas */}
        {series.map(s => {
          const pts = s.data.map((v, i) => `${xs[i]},${y(v)}`).join(' ');
          const areaPts = `0,${H} ${s.data.map((v,i)=>`${xs[i]},${y(v)}`).join(' ')} ${W},${H}`;
          return (
            <g key={s.name}>
              <polygon points={areaPts} fill={s.color} opacity={0.08} />
              <polyline points={pts} fill="none" stroke={s.color} strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {/* Hover dots */}
        {hovered !== null && series.map(s => (
          <circle key={s.name} cx={xs[hovered]} cy={y(s.data[hovered])} r="1.5"
            fill={s.color} stroke="#fff" strokeWidth="0.5" />
        ))}
        {/* Invisible hit targets */}
        {labels.map((_, i) => (
          <rect key={i} x={xs[i] - W/(labels.length*2)} y="0"
            width={W/labels.length} height={H}
            fill="transparent"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
      </svg>
      {/* X axis labels */}
      <div className="bi-line-labels">
        {labels.map((l, i) => (
          <span key={i} className={hovered === i ? 'active' : ''}>{l}</span>
        ))}
      </div>
      {/* Tooltip */}
      {hovered !== null && (
        <div className="bi-line-tooltip" style={{ left: `${(xs[hovered] / W) * 100}%` }}>
          <b>{labels[hovered]}</b>
          {series.map(s => (
            <span key={s.name} style={{ color: s.color }}>
              {s.name}: {fmt(s.data[hovered])}
            </span>
          ))}
        </div>
      )}
      {/* Legend */}
      {series.length > 1 && (
        <div className="bi-legend">
          {series.map(s => (
            <span key={s.name} className="bi-legend-item">
              <span className="bi-legend-dot" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Donut chart ─────────────────────────────────────────────── */
export function DonutChart({ data, size = 140 }) {
  // data: [{label, value, color}]
  const [hovered, setHovered] = useState(null);
  if (!data?.length) return <div className="chart-empty">No data</div>;
  const total = data.reduce((s, d) => s + (d.value || 0), 0) || 1;
  const r = 40, cx = 50, cy = 50, stroke = 26;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="bi-donut-wrap">
      <svg viewBox="0 0 100 100" width={size} height={size} style={{overflow:'visible'}}>
        {data.map((d, i) => {
          const dash = (d.value / total) * circ;
          const gap  = circ - dash;
          const el = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={hovered === i ? stroke + 3 : stroke}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-offset}
              style={{ transform:'rotate(-90deg)', transformOrigin:'50% 50%', cursor:'pointer', transition:'stroke-width .15s' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          );
          offset += dash;
          return el;
        })}
        {/* Centre label */}
        <text x="50" y="47" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--ink)">
          {hovered !== null ? fmtShort(data[hovered].value) : fmtShort(total)}
        </text>
        <text x="50" y="56" textAnchor="middle" fontSize="5" fill="var(--muted)">
          {hovered !== null ? data[hovered].label : 'Total'}
        </text>
      </svg>
      <div className="bi-donut-legend">
        {data.map((d, i) => (
          <div
            key={i}
            className={`bi-donut-row${hovered === i ? ' hovered' : ''}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="bi-donut-dot" style={{ background: d.color }} />
            <span className="bi-donut-label">{d.label}</span>
            <span className="bi-donut-pct">{Math.round(d.value/total*100)}%</span>
            <span className="bi-donut-val">{fmt(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Horizontal bar (top products / expenses) ──────────────── */
export function HBarChart({ data, color = '#7c3aed' }) {
  // data: [{label, value, icon?}]
  if (!data?.length) return <div className="chart-empty">No data</div>;
  const max = Math.max(...data.map(d => d.value || 0), 1);
  return (
    <div className="bi-hbar-list">
      {data.map((d, i) => (
        <div key={i} className="bi-hbar-row">
          <span className="bi-hbar-rank">{i + 1}</span>
          {d.icon && <span className="bi-hbar-icon">{d.icon}</span>}
          <span className="bi-hbar-name" title={d.label}>{d.label}</span>
          <div className="bi-hbar-track">
            <div className="bi-hbar-fill"
              style={{ width: `${(d.value/max)*100}%`, background: d.color || color }} />
          </div>
          <span className="bi-hbar-val">{d.sublabel || fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ── KPI card with sparkline ─────────────────────────────────── */
export function KpiCard({ label, value, note, change, sparkData, color = '#7c3aed', accent }) {
  const up = change >= 0;
  return (
    <article className="bi-kpi-card" data-accent={accent}>
      <div className="bi-kpi-top">
        <div>
          <small className="bi-kpi-label">{label}</small>
          <strong className="bi-kpi-value">{value}</strong>
          <em className="bi-kpi-note">{note}</em>
        </div>
        {sparkData && <Sparkline data={sparkData} color={color} width={80} height={36} />}
      </div>
      {change !== undefined && (
        <div className={`bi-kpi-change ${up ? 'up' : 'down'}`}>
          {up ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs last period
        </div>
      )}
    </article>
  );
}
