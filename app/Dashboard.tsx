'use client';
import { useMemo, useState } from 'react';
import { type Lead, FUNNEL, SHORT, DAY, days, money, stale, overdue, doneAt } from '@/lib/crm';
import { SERVICES } from '@/lib/services';

// ponytail: hardcoded targets/assumptions; move to a settings row when they need editing in-app.
const WEEKLY_TARGET = 10000, WEEK_HOURS = 40, DEFAULT_JOB_HOURS = 3;
const BLUE = '#0066cc', GREEN = '#10B981', RED = '#EF4444', YELLOW = '#F59E0B', GRAY = '#6B7280';
const SVC = Object.fromEntries(SERVICES.map((s) => [s.slug, s.name]));

type Period = { from: number; to: number };
type Go = (patch: { stage?: string; plumber?: string; source?: string; flag?: 'stuck' | 'unpaid' }) => void;

const RANGES = { '7': 'Last 7 days', '30': 'Last 30 days', month: 'This month', ytd: 'Year to date', custom: 'Custom range' };
const prevOf = (p: Period): Period => ({ from: p.from - (p.to - p.from), to: p.from });
const jan1 = (t: number) => new Date(new Date(t).getFullYear(), 0, 1).getTime();

// Every metric is a function of (leads, period): the same function feeds the pill, sparkline, trend, and per-plumber/job-type drill-down.
const inP = (t: string | number | null, p: Period) => { if (!t) return false; const x = new Date(t).getTime(); return x >= p.from && x < p.to; };
const doneIn = (ls: Lead[], p: Period) => ls.filter((l) => l.stage === 'completed' && inP(doneAt(l), p));
const createdIn = (ls: Lead[], p: Period) => ls.filter((l) => inP(l.created_at, p));
const sum = (ls: Lead[], f: (l: Lead) => number) => ls.reduce((a, l) => a + f(l), 0);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rev = (ls: Lead[]) => sum(ls, (l) => l.final_amount ?? 0);
const openPipe = (ls: Lead[], p: Period) => ls.filter((l) => (l.stage === 'proposal_sent' || l.stage === 'job_scheduled') && new Date(l.created_at).getTime() < p.to);
const ytd = (p: Period): Period => ({ from: jan1(p.to), to: p.to });
const key = (l: Lead) => l.phone || l.email || l.id;
const repeatCount = (ls: Lead[], p: Period) => {
  const all = ls.filter((l) => l.stage === 'completed');
  return doneIn(ls, p).filter((l) => all.some((o) => o.id !== l.id && key(o) === key(l) && doneAt(o) < doneAt(l))).length;
};

type Kpi = {
  id: string; label: string; fmt: (v: number) => string; good: 'up' | 'down';
  calc: (ls: Lead[], p: Period) => number; rows: (ls: Lead[], p: Period) => Lead[];
  prev?: (p: Period) => Period; extra?: (ls: Lead[], p: Period) => string;
};
const n0 = (v: number) => String(Math.round(v));
const KPIS: Kpi[] = [
  { id: 'rev', label: 'Revenue', fmt: money, good: 'up', calc: (ls, p) => rev(doneIn(ls, p)), rows: doneIn },
  { id: 'ytd', label: 'Revenue (YTD)', fmt: money, good: 'up', calc: (ls, p) => rev(doneIn(ls, ytd(p))), rows: (ls, p) => doneIn(ls, ytd(p)),
    prev: (p) => ({ from: 0, to: p.to - 365 * DAY }) },
  { id: 'jobs', label: 'Jobs Completed', fmt: n0, good: 'up', calc: (ls, p) => doneIn(ls, p).length, rows: doneIn },
  { id: 'conv', label: 'Conversion Rate', fmt: (v) => `${v.toFixed(1)}%`, good: 'up',
    calc: (ls, p) => { const c = createdIn(ls, p); return c.length ? (c.filter((l) => l.stage === 'completed').length / c.length) * 100 : 0; }, rows: createdIn },
  { id: 'avg', label: 'Avg Job Value', fmt: money, good: 'up', calc: (ls, p) => { const d = doneIn(ls, p); return d.length ? rev(d) / d.length : 0; }, rows: doneIn },
  { id: 'cpl', label: 'Cost Per Lead', fmt: money, good: 'down', calc: (ls, p) => { const c = createdIn(ls, p); return c.length ? sum(c, (l) => l.lead_cost ?? 0) / c.length : 0; }, rows: createdIn },
  { id: 'pipe', label: 'Pipeline Value', fmt: money, good: 'up', calc: (ls, p) => sum(openPipe(ls, p), (l) => l.quote_amount ?? 0), rows: openPipe },
  { id: 'close', label: 'Days to Close', fmt: (v) => `${v.toFixed(1)} days`, good: 'down',
    calc: (ls, p) => mean(doneIn(ls, p).map((l) => (new Date(doneAt(l)).getTime() - new Date(l.created_at).getTime()) / DAY)), rows: doneIn },
  { id: 'resp', label: 'Lead Response Time', fmt: (v) => `${v.toFixed(1)} hrs`, good: 'down',
    calc: (ls, p) => mean(createdIn(ls, p).filter((l) => l.last_contact_at).map((l) => (new Date(l.last_contact_at!).getTime() - new Date(l.created_at).getTime()) / 3600000)),
    rows: (ls, p) => createdIn(ls, p).filter((l) => l.last_contact_at) },
  { id: 'rate', label: 'Rating / Repeat', fmt: (v) => (v ? `${v.toFixed(1)}★` : '—'), good: 'up',
    calc: (ls, p) => mean(doneIn(ls, p).map((l) => l.review_rating ?? 0).filter(Boolean)), rows: doneIn,
    extra: (ls, p) => { const d = doneIn(ls, p).length; return `${d ? Math.round((repeatCount(ls, p) / d) * 100) : 0}% repeat`; } },
];

const group = (ls: Lead[], k: (l: Lead) => string) => ls.reduce<Record<string, Lead[]>>((a, l) => { (a[k(l)] ??= []).push(l); return a; }, {});
const plumberOf = (l: Lead) => l.plumber_assigned ?? 'Unassigned';
const typeOf = (l: Lead) => SVC[l.service_type] ?? l.service_type;

function download(name: string, head: string[], rows: (string | number | null)[][]) {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[head, ...rows].map((r) => r.map(q).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = name; a.click();
}

function Line({ v, color = BLUE, className = 'h-7' }: { v: number[]; color?: string; className?: string }) {
  const max = Math.max(...v), min = Math.min(...v), r = max - min || 1;
  const pts = v.map((y, i) => `${(i / Math.max(1, v.length - 1)) * 100},${96 - ((y - min) / r) * 88}`).join(' ');
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={`w-full ${className}`}><polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" /></svg>;
}
const Bar = ({ pct, color = BLUE }: { pct: number; color?: string }) => <div className="h-2 rounded bg-[var(--track)]"><div className="h-2 rounded" style={{ width: `${Math.min(100, pct)}%`, background: color }} /></div>;
const Card = ({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={`gcard p-6 md:p-10 ${className}`}><h2 className="!text-xl mb-4">{title}</h2>{children}</section>
);

export default function Dashboard({ leads, go }: { leads: Lead[]; go: Go }) {
  const [range, setRange] = useState<keyof typeof RANGES>('30');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [plumber, setPlumber] = useState('');
  const [jobType, setJobType] = useState('');
  const [open, setOpen] = useState<Kpi | null>(null);
  const [tab, setTab] = useState<'plumber' | 'time' | 'type'>('plumber');
  const [stage, setStage] = useState<string | null>(null);
  const [sort, setSort] = useState<{ k: number; dir: 1 | -1 }>({ k: 3, dir: -1 });

  const p = useMemo<Period>(() => {
    const now = Date.now(), d = new Date();
    if (range === '7' || range === '30') return { from: now - Number(range) * DAY, to: now };
    if (range === 'month') return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: now };
    if (range === 'ytd') return { from: jan1(now), to: now };
    return { from: custom.from ? new Date(custom.from).getTime() : now - 30 * DAY, to: custom.to ? new Date(custom.to).getTime() + DAY : now };
  }, [range, custom]);
  const plumbers = [...new Set(leads.map((l) => l.plumber_assigned).filter(Boolean))] as string[];
  const fl = leads.filter((l) => (!plumber || l.plumber_assigned === plumber) && (!jobType || l.service_type === jobType));

  const slices = (k: Kpi, ls: Lead[]) => Array.from({ length: 8 }, (_, i) => { const step = (p.to - p.from) / 8; return k.calc(ls, { from: p.from + i * step, to: p.from + (i + 1) * step }); });

  const filters = (
    <div className="flex flex-wrap gap-2 noprint">
      <select className="field !w-auto !min-h-10" value={range} onChange={(e) => setRange(e.target.value as keyof typeof RANGES)}>{Object.entries(RANGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {range === 'custom' && <>
        <input type="date" className="field !w-auto !min-h-10" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
        <input type="date" className="field !w-auto !min-h-10" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
      </>}
      <select className="field !w-auto !min-h-10" value={plumber} onChange={(e) => setPlumber(e.target.value)}><option value="">All plumbers</option>{plumbers.map((x) => <option key={x}>{x}</option>)}</select>
      <select className="field !w-auto !min-h-10" value={jobType} onChange={(e) => setJobType(e.target.value)}><option value="">All job types</option>{SERVICES.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}</select>
    </div>
  );

  // Funnel: leads created in range that reached at least each stage.
  const base = createdIn(fl, p).filter((l) => l.stage !== 'lost');
  const reached = FUNNEL.map((_, i) => base.filter((l) => FUNNEL.indexOf(l.stage) >= i).length);
  const stuckBy = (s: string) => fl.filter((l) => l.stage === s && stale(l)).length;

  // Revenue panel
  const done = doneIn(fl, p);
  const byPlumber = Object.entries(group(done, plumberOf)).map(([n, ls]) => [n, rev(ls)] as [string, number]).sort((a, b) => b[1] - a[1]);
  const byType = Object.entries(group(done, typeOf)).map(([n, ls]) => [n, rev(ls)] as [string, number]).sort((a, b) => b[1] - a[1]);
  const typeTotal = sum(done, (l) => l.final_amount ?? 0);
  const palette = [BLUE, GREEN, YELLOW, RED, GRAY, '#8B5CF6'];
  let acc = 0;
  const donut = byType.map(([, v], i) => { const s = acc; acc += typeTotal ? (v / typeTotal) * 100 : 0; return `${palette[i % 6]} ${s}% ${acc}%`; }).join(',');
  const timeSeries = Array.from({ length: 12 }, (_, i) => { const step = (p.to - p.from) / 12; return rev(doneIn(fl, { from: p.from + i * step, to: p.from + (i + 1) * step })); });

  // Alerts
  const weekAgo = { from: Date.now() - 7 * DAY, to: Date.now() + 1 };
  const weekRev = rev(doneIn(fl, weekAgo)), weekJobs = doneIn(fl, weekAgo).length;
  const soon = { from: new Date().setHours(0, 0, 0, 0), to: Date.now() + 7 * DAY };
  const alerts: { tone: string; text: string; go: Parameters<Go>[0] }[] = [];
  FUNNEL.slice(0, 5).forEach((s, i) => { const n = stuckBy(s); if (n) alerts.push({ tone: RED, text: `${n} lead${n > 1 ? 's' : ''} stuck in ${SHORT[i]} over 10 days`, go: { stage: s, flag: 'stuck' } }); });
  fl.filter(overdue).slice(0, 5).forEach((l) => alerts.push({ tone: RED, text: `${l.name} unpaid ${days(l.completed_at ?? l.stage_changed_at)} days – ${money(l.final_amount ?? 0)}`, go: { flag: 'unpaid' } }));
  if (weekRev < WEEKLY_TARGET) alerts.push({ tone: YELLOW, text: `This week: ${money(weekRev)} vs. target ${money(WEEKLY_TARGET)} (${Math.round((1 - weekRev / WEEKLY_TARGET) * 100)}% below goal)`, go: {} });
  else alerts.push({ tone: GREEN, text: `This week: ${money(weekRev)}, target ${money(WEEKLY_TARGET)} hit`, go: {} });
  (plumber ? [plumber] : plumbers).filter((n) => !leads.some((l) => l.plumber_assigned === n && l.stage === 'job_scheduled' && inP(l.job_date, soon)))
    .forEach((n) => alerts.push({ tone: YELLOW, text: `${n} has no bookings in the next 7 days`, go: { plumber: n } }));
  if (weekJobs >= 5) alerts.push({ tone: GREEN, text: `Completed ${weekJobs} jobs this week!`, go: {} });

  // Lead sources
  const srcRows = Object.entries(group(createdIn(fl, p), (l) => l.lead_source ?? 'Unknown')).map(([name, ls]) => {
    const wins = ls.filter((l) => l.stage === 'completed'), cost = sum(ls, (l) => l.lead_cost ?? 0), r = rev(wins);
    return { name, cells: [ls.length, ls.length ? (wins.length / ls.length) * 100 : 0, r, cost / ls.length, cost ? r / cost : r ? Infinity : 0] };
  }).sort((a, b) => (a.cells[sort.k] - b.cells[sort.k]) * sort.dir);
  const SRC_HEAD = ['Count', 'Conv Rate', 'Revenue', 'Cost/Lead', 'ROI'];
  const srcFmt = [n0, (v: number) => `${v.toFixed(1)}%`, money, money, (v: number) => (v === Infinity ? '∞' : `${v.toFixed(1)}x`)];

  // Utilization (current Mon–Sun week)
  const mon = new Date(); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  const week = { from: mon.getTime(), to: mon.getTime() + 7 * DAY };
  const util = (plumber ? [plumber] : plumbers).map((n) => {
    const mine = leads.filter((l) => l.plumber_assigned === n), jobs = mine.filter((l) => (l.stage === 'job_scheduled' || l.stage === 'completed') && inP(l.job_date, week));
    const hrs = sum(jobs, (l) => l.job_hours ?? DEFAULT_JOB_HOURS), rated = mine.map((l) => l.review_rating ?? 0).filter(Boolean);
    return { n, hrs, jobs: jobs.length, pct: (hrs / WEEK_HOURS) * 100, rating: mean(rated) };
  });

  const pills = KPIS.map((k) => {
    const v = k.calc(fl, p), pv = k.calc(fl, (k.prev ?? prevOf)(p));
    const ch = pv ? ((v - pv) / Math.abs(pv)) * 100 : null;
    const color = ch === null || Math.abs(ch) < 0.05 ? GRAY : (ch > 0) === (k.good === 'up') ? GREEN : RED;
    return { k, v, ch, color };
  });

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {filters}
        <button className="btn btn-outline !min-h-10 noprint" onClick={() => window.print()}>Export PDF</button>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {pills.map(({ k, v, ch, color }) => (
          <button key={k.id} onClick={() => setOpen(k)} className="gcard p-3 text-left hover:border-[#00a0bf] transition-colors">
            <div className="text-xs text-[var(--muted)]">{k.label}</div>
            <div className="text-2xl font-bold text-[#0066cc] leading-8">{k.fmt(v)}</div>
            <div className="text-xs font-semibold" style={{ color }}>{ch === null ? '—' : `${ch > 0 ? '↑' : ch < 0 ? '↓' : ''}${Math.abs(ch).toFixed(0)}%`}{k.extra && <span className="ml-2 font-normal text-[var(--muted)]">{k.extra(fl, p)}</span>}</div>
            <Line v={slices(k, fl)} color={color} />
          </button>
        ))}
      </div>

      <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[2fr_1.75fr_1.25fr]">
        <Card title="Pipeline funnel">
          <div className="flex flex-col gap-3">
            {FUNNEL.map((s, i) => {
              const conv = i < 5 && reached[i] ? (reached[i + 1] / reached[i]) * 100 : null;
              const c = conv === null ? GREEN : conv > 80 ? GREEN : conv >= 60 ? YELLOW : RED, stuck = stuckBy(s);
              return (
                <button key={s} onClick={() => setStage(stage === s ? null : s)} className={`text-left rounded p-1 -m-1 ${stage === s ? 'bg-[#0066cc]/10' : ''}`}>
                  <div className="flex justify-between text-sm"><span>{SHORT[i]} <b>({reached[i]})</b>{stuck > 0 && <span className="ml-2 text-xs font-semibold text-white rounded px-1.5" style={{ background: RED }}>{stuck} stuck</span>}</span>
                    <span className="font-semibold" style={{ color: c }}>{conv === null ? '' : `${conv.toFixed(0)}% ↓`}</span></div>
                  <Bar pct={reached[0] ? (reached[i] / reached[0]) * 100 : 0} color={c} />
                </button>
              );
            })}
          </div>
          {stage && (
            <ul className="mt-3 border-t border-[var(--line)] pt-2 text-sm flex flex-col gap-1 max-h-48 overflow-auto">
              {fl.filter((l) => l.stage === stage).map((l) => <li key={l.id} className="flex justify-between"><span><b>{l.name}</b> · {plumberOf(l)}</span><span className={stale(l) ? 'text-[#EF4444] font-semibold' : ''}>{days(l.stage_changed_at)}d</span></li>)}
              {!fl.some((l) => l.stage === stage) && <li>No leads in this stage.</li>}
            </ul>
          )}
        </Card>

        <Card title="Revenue">
          <div className="flex gap-1 mb-3 text-sm">{([['plumber', 'By plumber'], ['time', 'Over time'], ['type', 'By job type']] as const).map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} className={`px-2 py-1 rounded ${tab === t ? 'bg-[#0066cc] text-white' : 'bg-[var(--track)]'}`}>{l}</button>))}</div>
          {tab === 'plumber' && <div className="flex flex-col gap-3">{byPlumber.map(([n, v]) => (
            <button key={n} className="text-left" onClick={() => go({ plumber: n })}><div className="flex justify-between text-sm"><span>{n}</span><b>{money(v)}</b></div><Bar pct={(v / byPlumber[0][1]) * 100} /></button>))}
            {!byPlumber.length && <p className="text-sm text-[var(--muted)]">No completed jobs in this range.</p>}</div>}
          {tab === 'time' && <><Line v={timeSeries} className="h-40" /><div className="flex justify-between text-xs text-[var(--muted)]"><span>{new Date(p.from).toLocaleDateString()}</span><span>{new Date(p.to).toLocaleDateString()}</span></div></>}
          {tab === 'type' && (typeTotal ? <div className="flex items-center gap-4"><div className="w-28 h-28 rounded-full shrink-0" style={{ background: `conic-gradient(${donut})`, WebkitMask: 'radial-gradient(circle 32px, transparent 98%, #000)' , mask: 'radial-gradient(circle 32px, transparent 98%, #000)' }} />
            <ul className="text-sm flex flex-col gap-1">{byType.map(([n, v], i) => <li key={n}><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: palette[i % 6] }} />{n} <b>{money(v)}</b></li>)}</ul></div>
            : <p className="text-sm text-[var(--muted)]">No completed jobs in this range.</p>)}
        </Card>

        <Card title="Alerts" className="md:col-span-2 lg:col-span-1">
          <ul className="flex flex-col gap-2 text-sm">{alerts.map((a, i) => (
            <li key={i}><button className="text-left w-full flex gap-2 hover:underline" onClick={() => go(a.go)}><span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: a.tone }} />{a.text}</button></li>))}</ul>
        </Card>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <Card title="Lead source attribution" className="overflow-x-auto">
          <table className="w-full text-sm text-left"><thead><tr className="text-[var(--muted)]"><th className="py-1">Source</th>{SRC_HEAD.map((h, i) => (
            <th key={h} className="cursor-pointer" onClick={() => setSort({ k: i, dir: sort.k === i && sort.dir === -1 ? 1 : -1 })}>{h}{sort.k === i ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}</th>))}</tr></thead>
            <tbody>{srcRows.map((r) => <tr key={r.name} className="border-t border-[var(--line)] cursor-pointer hover:bg-[var(--track)]" onClick={() => go({ source: r.name })}>
              <td className="py-2 font-semibold">{r.name}</td>{r.cells.map((c, i) => <td key={i}>{srcFmt[i](c)}</td>)}</tr>)}</tbody></table>
          {!srcRows.length && <p className="text-sm text-[var(--muted)] mt-2">No leads in this range. Set Lead Source in the CRM tab.</p>}
        </Card>

        <Card title="Plumber utilization (this week)" className="overflow-x-auto">
          <div className="flex flex-col gap-3 mb-3">{util.map((u) => (
            <div key={u.n}><div className="flex justify-between text-sm"><span>{u.n}</span><b>{u.pct.toFixed(0)}%{u.pct >= 95 && <span style={{ color: YELLOW }}> ⚠ At capacity</span>}</b></div><Bar pct={u.pct} color={u.pct >= 95 ? YELLOW : BLUE} /></div>))}</div>
          <table className="w-full text-sm text-left"><thead><tr className="text-[var(--muted)]"><th>Plumber</th><th>Booked Hrs</th><th>Available</th><th>Jobs</th><th>Rating</th></tr></thead>
            <tbody>{util.map((u) => <tr key={u.n} className="border-t border-[var(--line)]"><td className="py-2 font-semibold">{u.n}</td><td>{u.hrs.toFixed(1)}</td><td>{WEEK_HOURS}</td><td>{u.jobs}</td><td>{u.rating ? `${u.rating.toFixed(1)}★` : '—'}</td></tr>)}</tbody></table>
          {!util.length && <p className="text-sm text-[var(--muted)]">Assign plumbers in the CRM tab.</p>}
        </Card>
      </div>

      {open && <Drill k={open} ls={fl} p={p} filters={filters} slices={slices(open, fl)} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Drill({ k, ls, p, filters, slices, onClose }: { k: Kpi; ls: Lead[]; p: Period; filters: React.ReactNode; slices: number[]; onClose: () => void }) {
  const v = k.calc(ls, p), rows = k.rows(ls, p);
  const split = (by: (l: Lead) => string) => Object.entries(group(ls, by)).map(([n, xs]) => [n, k.calc(xs, p)] as [string, number]).filter(([, x]) => x).sort((a, b) => b[1] - a[1]);
  const cols = ['Name', 'Plumber', 'Job type', 'Source', 'Stage', 'Amount', 'Date'];
  const table = rows.map((l) => [l.name, plumberOf(l), typeOf(l), l.lead_source, l.stage, l.final_amount ?? l.quote_amount, new Date(l.created_at).toLocaleDateString()]);
  return (
    <div className="fixed inset-0 z-50 bg-[var(--ripple)] overflow-auto p-4 md:p-8 noprint">
      <div className="mx-auto max-w-5xl flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <div><div className="text-[var(--muted)]">{k.label}</div><div className="text-4xl font-bold text-[#0066cc]">{k.fmt(v)}</div></div>
          <div className="flex gap-2"><button className="btn btn-outline !min-h-10" onClick={() => download(`${k.id}.csv`, cols, table)}>Export CSV</button>
            <button className="btn !min-h-10 btn-navy" onClick={onClose}>Close</button></div>
        </div>
        {filters}
        <Card title="Trend"><Line v={slices} className="h-32" /></Card>
        <div className="grid gap-4 md:grid-cols-2">{([['By plumber', plumberOf], ['By job type', typeOf]] as const).map(([t, by]) => (
          <Card key={t} title={t}><ul className="text-sm flex flex-col gap-1">{split(by).map(([n, x]) => <li key={n} className="flex justify-between"><span>{n}</span><b>{k.fmt(x)}</b></li>)}</ul></Card>))}</div>
        <Card title={`Underlying data (${rows.length})`} className="overflow-x-auto">
          <table className="w-full text-sm text-left"><thead><tr className="text-[var(--muted)]">{cols.map((c) => <th key={c} className="pr-3">{c}</th>)}</tr></thead>
            <tbody>{table.slice(0, 200).map((r, i) => <tr key={i} className="border-t border-[var(--line)]">{r.map((c, j) => <td key={j} className="py-1.5 pr-3">{j === 5 && c ? money(Number(c)) : c ?? '—'}</td>)}</tr>)}</tbody></table>
        </Card>
      </div>
    </div>
  );
}
