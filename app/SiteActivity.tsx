'use client';
import { useMemo, useState } from 'react';

export type SiteEvent = { created_at: string; event: string; page: string | null; source: string | null; device_type: string | null; traffic_source: string | null; lead_source: string | null; city: string | null };

const DAY = 86400000;
const CARDS: [string, string][] = [
  ['phone_click', 'Call button clicks'], ['sms_click', 'Text button clicks'], ['schedule_cta_click', 'Schedule Consultation clicks'], ['water_report_submit', 'Water report requests'],
  ['quiz_cta_click', 'Quiz link clicks'], ['form_start', 'Forms started'], ['form_abandon', 'Forms abandoned'], ['exit_intent_shown', 'Exit-intent popups shown'],
];

export default function SiteActivity({ events }: { events: SiteEvent[] }) {
  const [range, setRange] = useState<'7' | '14' | '30' | 'all'>('30');
  const rows = useMemo(() => events.filter((e) => range === 'all' || Date.now() - new Date(e.created_at).getTime() < Number(range) * DAY), [events, range]);
  const count = (ev: string) => rows.filter((e) => e.event === ev).length;
  const tally = (list: SiteEvent[], pick: (e: SiteEvent) => string | null) => {
    const c: Record<string, number> = {};
    for (const e of list) { const k = pick(e) || 'unknown'; c[k] = (c[k] ?? 0) + 1; }
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8);
  };
  const contact = rows.filter((e) => e.event === 'phone_click' || e.event === 'sms_click');
  const Bars = ({ title, data }: { title: string; data: [string, number][] }) => {
    const max = Math.max(1, ...data.map((d) => d[1]));
    return (
      <section className="card p-5 !transform-none">
        <h2 className="text-xl">{title}</h2>
        <div className="mt-3 flex flex-col gap-2">
          {data.map(([k, n]) => (<div key={k}><div className="flex justify-between text-sm"><span>{k}</span><b>{n}</b></div><div className="h-2 bg-ice rounded"><div className="h-2 bg-navy rounded" style={{ width: `${(n / max) * 100}%` }} /></div></div>))}
          {!data.length && <p className="text-sm">No data yet.</p>}
        </div>
      </section>
    );
  };
  // Daily calls + texts + consultation clicks for the last 14 days.
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * DAY); return d.toISOString().slice(0, 10); });
  const key = new Set(['phone_click', 'sms_click', 'schedule_cta_click']);
  const perDay = days.map((d) => events.filter((e) => key.has(e.event) && e.created_at.slice(0, 10) === d).length);
  const maxDay = Math.max(1, ...perDay);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2 items-center">
        <select className="field !w-auto" value={range} onChange={(e) => setRange(e.target.value as typeof range)}><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="all">All time</option></select>
        <p className="text-sm">Counts clicks, not completed calls. Add call tracking (CallRail or similar) to see answered calls.</p>
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {CARDS.map(([ev, label]) => <div key={ev} className="card p-4 !transform-none"><div className="text-3xl font-bold text-navy">{count(ev)}</div><div className="text-sm">{label}</div></div>)}
      </div>
      <section className="card p-5 !transform-none">
        <h2 className="text-xl">Calls, texts and consultation clicks, last 14 days</h2>
        <div className="mt-4 flex items-end gap-1 h-32">
          {perDay.map((n, i) => (<div key={days[i]} className="flex-1 flex flex-col items-center justify-end h-full" title={`${days[i]}: ${n}`}><div className="w-full bg-[var(--cyan)] border border-[var(--aqua)] rounded-t" style={{ height: `${(n / maxDay) * 100}%`, minHeight: n ? 4 : 0 }} /><span className="text-[10px] mt-1">{days[i].slice(8)}</span></div>))}
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Bars title="Where calls and texts come from (button location)" data={tally(contact, (e) => e.source)} />
        <Bars title="Calls and texts by traffic source" data={tally(contact, (e) => e.traffic_source)} />
        <Bars title="Calls and texts by campaign / lead source" data={tally(contact, (e) => e.lead_source)} />
        <Bars title="Calls and texts by device" data={tally(contact, (e) => e.device_type)} />
        <Bars title="Pages with the most calls and texts" data={tally(contact, (e) => e.page)} />
        <Bars title="Where Schedule Consultation is clicked" data={tally(rows.filter((e) => e.event === 'schedule_cta_click'), (e) => e.source)} />
        <Bars title="Quiz link clicks by location" data={tally(rows.filter((e) => e.event === 'quiz_cta_click'), (e) => e.source)} />
        <Bars title="Forms abandoned by page" data={tally(rows.filter((e) => e.event === 'form_abandon'), (e) => e.page)} />
      </div>
    </div>
  );
}
