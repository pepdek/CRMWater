'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SERVICES } from '@/lib/services';
import QuizInsights, { type QuizEvent } from './QuizInsights';

type Lead = {
  id: string; created_at: string; name: string; email: string | null; phone: string | null; address: string | null;
  service_type: string; stage: string; stage_changed_at: string; last_contact_at: string | null; notes: string | null;
  plumber_assigned: string | null; job_date: string | null; quote_amount: number | null; final_amount: number | null;
  paid: boolean; completed_at: string | null;
};

const STAGES: [string, string][] = [
  ['new', 'New Lead Captured'], ['contacted', 'Contacted / Qualifying'], ['consult_booked', 'Water Test / Consultation Booked'],
  ['proposal_sent', 'Proposal / Estimate Sent'], ['job_scheduled', 'Job Booked & Scheduled'], ['completed', 'Completed & Review Requested'], ['lost', 'Lost'],
];
const LABEL = Object.fromEntries(STAGES);
const DAY = 86400000;
const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : 0);
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// Conditional-format rules.
const stale = (l: Lead) => (l.stage === 'new' || l.stage === 'contacted') && days(l.stage_changed_at) > 10;
const overdue = (l: Lead) => l.stage === 'completed' && !l.paid && days(l.completed_at ?? l.stage_changed_at) > 30;

function Cell({ value, onCommit, type = 'text', className = '', list }: { value: string | number | null; onCommit: (v: string) => void; type?: string; className?: string; list?: string }) {
  return (
    <input key={String(value)} defaultValue={value ?? ''} type={type} list={list} step={type === 'number' ? '0.01' : undefined}
      onBlur={(e) => e.target.value !== String(value ?? '') && onCommit(e.target.value)}
      className={`bg-transparent border-b border-transparent hover:border-black/20 focus:border-aqua outline-none min-h-9 w-full ${className}`} />
  );
}

export default function Crm() {
  const sb = useMemo(() => supabase(), []);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState<'dashboard' | 'crm' | 'quiz'>('dashboard');
  const [events, setEvents] = useState<QuizEvent[]>([]);
  const [f, setF] = useState({ q: '', stage: '', plumber: '' });
  const [login, setLogin] = useState({ email: '', password: '', err: '' });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false }).limit(2000);
    if (error) setMsg(error.message); else setLeads((data as Lead[]) ?? []);
    const ev = await sb.from('quiz_events').select('session_id,created_at,screen,answers,recommendation').order('created_at', { ascending: false }).limit(10000);
    if (!ev.error) setEvents((ev.data as QuizEvent[]) ?? []);
  }, [sb]);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setAuthed(!!s));
    return () => data.subscription.unsubscribe();
  }, [sb]);
  useEffect(() => {
    if (!authed) return;
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [authed, load]);

  if (authed === null) return null;
  if (!authed) {
    return (
      <main className="mx-auto max-w-sm p-6">
        <form className="card p-6 flex flex-col gap-3 !transform-none" onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await sb.auth.signInWithPassword({ email: login.email, password: login.password });
          if (error) setLogin({ ...login, err: error.message });
        }}>
          <h2>CRM sign in</h2>
          <input className="field" type="email" placeholder="Email" autoComplete="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} />
          <input className="field" type="password" placeholder="Password" autoComplete="current-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
          {login.err && <p className="text-coral text-sm">{login.err}</p>}
          <button className="btn btn-navy">Sign in</button>
        </form>
      </main>
    );
  }

  const update = async (id: string, patch: Record<string, unknown>) => {
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } as Lead : l)));
    const { error } = await sb.from('leads').update(patch).eq('id', id);
    if (error) { setMsg(error.message); load(); }
  };
  const setStage = (l: Lead, stage: string) => {
    const now = new Date().toISOString();
    update(l.id, { stage, stage_changed_at: now, ...(stage === 'completed' && !l.completed_at && { completed_at: now }), ...(stage !== 'new' && !l.last_contact_at && { last_contact_at: now }) });
  };
  const num = (v: string) => (v === '' ? null : Number(v));

  const plumbers = [...new Set(leads.map((l) => l.plumber_assigned).filter(Boolean))] as string[];
  const rows = leads.filter((l) =>
    (!f.stage || l.stage === f.stage) && (!f.plumber || l.plumber_assigned === f.plumber) &&
    (!f.q || [l.name, l.email, l.phone, l.address, l.notes].some((v) => v?.toLowerCase().includes(f.q.toLowerCase()))));

  // Dashboard numbers
  const done = leads.filter((l) => l.stage === 'completed');
  const closeDays = done.map((l) => (new Date(l.completed_at ?? l.stage_changed_at).getTime() - new Date(l.created_at).getTime()) / DAY);
  const avgClose = closeDays.length ? closeDays.reduce((a, b) => a + b, 0) / closeDays.length : 0;
  const revenue = done.reduce((a, l) => a + (l.final_amount ?? 0), 0);
  const collected = done.filter((l) => l.paid).reduce((a, l) => a + (l.final_amount ?? 0), 0);
  const conv = leads.length ? (done.length / leads.length) * 100 : 0;
  const byStage = STAGES.map(([k, label]) => [label, leads.filter((l) => l.stage === k).length] as [string, number]);
  const maxStage = Math.max(1, ...byStage.map((s) => s[1]));
  const byPlumber = Object.values(leads.filter((l) => l.plumber_assigned).reduce<Record<string, { name: string; jobs: number; quoted: number; revenue: number }>>((a, l) => {
    const k = l.plumber_assigned!; a[k] ??= { name: k, jobs: 0, quoted: 0, revenue: 0 };
    a[k].jobs += l.stage === 'job_scheduled' || l.stage === 'completed' ? 1 : 0; a[k].quoted += l.quote_amount ?? 0;
    a[k].revenue += l.stage === 'completed' ? l.final_amount ?? 0 : 0; return a;
  }, {})).sort((a, b) => b.revenue - a.revenue);
  const staleList = leads.filter(stale), overdueList = leads.filter(overdue);

  const exportCsv = () => {
    const cols = ['name', 'phone', 'email', 'address', 'created_at', 'stage', 'notes', 'plumber_assigned', 'job_date', 'quote_amount', 'final_amount', 'paid'] as const;
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[cols.join(','), ...rows.map((l) => cols.map((c) => q(l[c])).join(','))].join('\n')], { type: 'text/csv' }));
    a.download = 'leads.csv'; a.click();
  };

  const Kpi = ({ label, value }: { label: string; value: string }) => <div className="card p-4 !transform-none"><div className="text-3xl font-bold text-navy">{value}</div><div className="text-sm">{label}</div></div>;
  const TH = ['Name', 'Phone', 'Email', 'Home Address', 'Date Opted In', 'Stage', 'Customer Notes', 'Plumber Assigned', 'Job Date', 'Quote $', 'Final $', 'Paid?', 'Days Since Contact'];

  return (
    <main className="mx-auto max-w-[1400px] p-4 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="!text-3xl">CRM</h1>
        <div className="flex gap-2">
          {(['dashboard', 'crm', 'quiz'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`btn !min-h-10 ${tab === t ? 'btn-navy' : 'bg-white border border-black/10 text-navy'}`}>{t === 'crm' ? 'CRM' : t === 'quiz' ? 'Quiz' : 'Dashboard'}</button>)}
          <button className="btn !min-h-10 bg-white border border-black/10 text-navy" onClick={() => sb.auth.signOut()}>Sign out</button>
        </div>
      </div>
      {msg && <p className="text-coral text-sm font-semibold">{msg}</p>}

      {tab === 'dashboard' && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
            <Kpi label="Total leads" value={String(leads.length)} />
            <Kpi label="Jobs completed" value={String(done.length)} />
            <Kpi label="Conversion (lead → completed)" value={`${conv.toFixed(1)}%`} />
            <Kpi label="Avg days to close" value={closeDays.length ? avgClose.toFixed(1) : '—'} />
            <Kpi label="Revenue (completed)" value={money(revenue)} />
            <Kpi label="Collected" value={money(collected)} />
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card p-5 !transform-none">
              <h2 className="text-xl">Jobs by stage</h2>
              <div className="mt-3 flex flex-col gap-2">
                {byStage.map(([label, n]) => (
                  <div key={label}><div className="flex justify-between text-sm"><span>{label}</span><b>{n}</b></div><div className="h-2 bg-ice rounded"><div className="h-2 bg-aqua rounded" style={{ width: `${(n / maxStage) * 100}%` }} /></div></div>
                ))}
              </div>
            </section>
            <section className="card p-5 !transform-none overflow-x-auto">
              <h2 className="text-xl">Revenue by plumber</h2>
              {byPlumber.length ? (
                <table className="w-full text-sm mt-3 text-left"><thead><tr className="text-navy"><th className="py-1">Plumber</th><th>Jobs booked/done</th><th>Quoted</th><th>Revenue</th></tr></thead>
                  <tbody>{byPlumber.map((p) => <tr key={p.name} className="border-t border-black/10"><td className="py-2 font-semibold">{p.name}</td><td>{p.jobs}</td><td>{money(p.quoted)}</td><td>{money(p.revenue)}</td></tr>)}</tbody></table>
              ) : <p className="mt-3 text-sm">Assign plumbers in the CRM tab to see this.</p>}
            </section>
            <section className="card p-5 !transform-none border-l-4 border-coral">
              <h2 className="text-xl">Needs attention: stuck over 10 days ({staleList.length})</h2>
              <ul className="mt-2 text-sm flex flex-col gap-1">{staleList.slice(0, 10).map((l) => <li key={l.id}><b>{l.name}</b> · {LABEL[l.stage]} · {days(l.stage_changed_at)} days</li>)}{!staleList.length && <li>Nothing stuck. 🎉</li>}</ul>
            </section>
            <section className="card p-5 !transform-none border-l-4 border-amber-400">
              <h2 className="text-xl">Unpaid over 30 days ({overdueList.length})</h2>
              <ul className="mt-2 text-sm flex flex-col gap-1">{overdueList.slice(0, 10).map((l) => <li key={l.id}><b>{l.name}</b> · {l.final_amount ? money(l.final_amount) : 'no amount'} · {days(l.completed_at ?? l.stage_changed_at)} days</li>)}{!overdueList.length && <li>No overdue invoices.</li>}</ul>
            </section>
          </div>
        </>
      )}

      {tab === 'quiz' && <QuizInsights events={events} />}

      {tab === 'crm' && (
        <>
          <div className="flex flex-wrap gap-2">
            <input className="field !w-56" placeholder="Search name, phone, email…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            <select className="field !w-auto" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">All stages</option>{STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select className="field !w-auto" value={f.plumber} onChange={(e) => setF({ ...f, plumber: e.target.value })}><option value="">All plumbers</option>{plumbers.map((p) => <option key={p}>{p}</option>)}</select>
            <button className="btn btn-aqua !min-h-12" onClick={() => setAdding(!adding)}>+ Add lead</button>
            <button className="btn !min-h-12 bg-white border border-black/10 text-navy" onClick={exportCsv}>Export CSV</button>
          </div>
          {adding && (
            <form className="card p-4 !transform-none grid gap-2 sm:grid-cols-3 lg:grid-cols-6" onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget); const d = (k: string) => String(fd.get(k) ?? '');
              const { error } = await sb.from('leads').insert({ name: d('name'), phone: d('phone') || null, email: d('email') || null, address: d('address') || null, service_type: d('service'), page_source: 'manual', stage: d('stage') });
              if (error) return setMsg(error.message);
              setAdding(false); setMsg(''); load();
            }}>
              <input name="name" required minLength={2} placeholder="Name" className="field" />
              <input name="phone" placeholder="Phone" className="field" />
              <input name="email" type="email" placeholder="Email" className="field" />
              <input name="address" placeholder="Home address" className="field" />
              <select name="service" className="field">{SERVICES.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}</select>
              <select name="stage" className="field">{STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <button className="btn btn-navy sm:col-span-3 lg:col-span-6">Save lead</button>
            </form>
          )}
          <p className="text-xs">Edit any cell, it saves when you click away. <span className="bg-red-100 px-1">Red</span> = stuck in New/Contacted over 10 days. <span className="bg-amber-100 px-1">Amber</span> = unpaid over 30 days.</p>
          <datalist id="plumbers">{plumbers.map((p) => <option key={p} value={p} />)}</datalist>
          <div className="card overflow-x-auto !transform-none">
            <table className="w-full text-left text-sm min-w-[1500px]">
              <thead><tr className="text-navy">{TH.map((h) => <th key={h} className="p-2 whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{rows.map((l) => (
                <tr key={l.id} className={`border-t border-black/10 ${stale(l) ? 'bg-red-100' : overdue(l) ? 'bg-amber-100' : ''}`}>
                  <td className="p-2 min-w-36"><Cell value={l.name} onCommit={(v) => update(l.id, { name: v })} className="font-semibold" /></td>
                  <td className="p-2 min-w-32"><Cell value={l.phone} onCommit={(v) => update(l.id, { phone: v || null })} /></td>
                  <td className="p-2 min-w-48"><Cell value={l.email} onCommit={(v) => update(l.id, { email: v || null })} /></td>
                  <td className="p-2 min-w-48"><Cell value={l.address} onCommit={(v) => update(l.id, { address: v || null })} /></td>
                  <td className="p-2 whitespace-nowrap">{new Date(l.created_at).toLocaleDateString()}</td>
                  <td className="p-2"><select className="field !min-h-9 !w-52" value={l.stage} onChange={(e) => setStage(l, e.target.value)}>{STAGES.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></td>
                  <td className="p-2 min-w-56"><Cell value={l.notes} onCommit={(v) => update(l.id, { notes: v || null })} /></td>
                  <td className="p-2 min-w-36"><Cell value={l.plumber_assigned} list="plumbers" onCommit={(v) => update(l.id, { plumber_assigned: v || null })} /></td>
                  <td className="p-2"><Cell type="date" value={l.job_date} onCommit={(v) => update(l.id, { job_date: v || null })} /></td>
                  <td className="p-2 w-24"><Cell type="number" value={l.quote_amount} onCommit={(v) => update(l.id, { quote_amount: num(v) })} /></td>
                  <td className="p-2 w-24"><Cell type="number" value={l.final_amount} onCommit={(v) => update(l.id, { final_amount: num(v) })} /></td>
                  <td className="p-2"><input type="checkbox" checked={l.paid} onChange={(e) => update(l.id, { paid: e.target.checked })} className="w-5 h-5 accent-[var(--aqua)]" aria-label="Paid" /></td>
                  <td className="p-2 whitespace-nowrap"><b>{days(l.last_contact_at ?? l.created_at)}</b> <button className="ml-1 text-xs underline" onClick={() => update(l.id, { last_contact_at: new Date().toISOString() })}>log contact</button></td>
                </tr>
              ))}</tbody>
            </table>
            {!rows.length && <p className="p-4">No leads match.</p>}
          </div>
        </>
      )}
    </main>
  );
}
