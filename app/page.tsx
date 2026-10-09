'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { SERVICES } from '@/lib/services';
import { type Lead, STAGES, SOURCES, days, money, stale, overdue } from '@/lib/crm';
import Dashboard from './Dashboard';
import QuizInsights, { type QuizEvent } from './QuizInsights';
import SiteActivity, { type SiteEvent } from './SiteActivity';

function Cell({ value, onCommit, type = 'text', className = '', list }: { value: string | number | null; onCommit: (v: string) => void; type?: string; className?: string; list?: string }) {
  return (
    <input key={String(value)} defaultValue={value ?? ''} type={type} list={list} step={type === 'number' ? '0.01' : undefined}
      onBlur={(e) => e.target.value !== String(value ?? '') && onCommit(e.target.value)}
      className={`bg-transparent border-b border-transparent hover:border-black/20 focus:border-[#00a0bf] outline-none min-h-9 w-full ${className}`} />
  );
}

export default function Crm() {
  const sb = useMemo(() => supabase(), []);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tab, setTab] = useState<'dashboard' | 'crm' | 'quiz' | 'activity'>('dashboard');
  const [siteEvents, setSiteEvents] = useState<SiteEvent[]>([]);
  const [events, setEvents] = useState<QuizEvent[]>([]);
  const [f, setF] = useState<{ q: string; stage: string; plumber: string; source: string; flag: '' | 'stuck' | 'unpaid' }>({ q: '', stage: '', plumber: '', source: '', flag: '' });
  const [login, setLogin] = useState({ email: '', password: '', err: '' });
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false }).limit(2000);
    if (error) setMsg(error.message); else setLeads((data as Lead[]) ?? []);
    const ev = await sb.from('quiz_events').select('session_id,created_at,screen,answers,recommendation,attribution').order('created_at', { ascending: false }).limit(10000);
    if (!ev.error) setEvents((ev.data as QuizEvent[]) ?? []);
    const se = await sb.from('site_events').select('created_at,event,page,source,device_type,traffic_source,lead_source,city').order('created_at', { ascending: false }).limit(10000);
    if (!se.error) setSiteEvents((se.data as SiteEvent[]) ?? []);
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
    (!f.stage || l.stage === f.stage) && (!f.plumber || l.plumber_assigned === f.plumber) && (!f.source || (l.lead_source ?? 'Unknown') === f.source) &&
    (!f.flag || (f.flag === 'stuck' ? stale(l) : overdue(l))) &&
    (!f.q || [l.name, l.email, l.phone, l.address, l.notes].some((v) => v?.toLowerCase().includes(f.q.toLowerCase()))));

  const exportCsv = () => {
    const cols = ['name', 'phone', 'email', 'address', 'created_at', 'stage', 'notes', 'plumber_assigned', 'job_date', 'quote_amount', 'final_amount', 'paid'] as const;
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[cols.join(','), ...rows.map((l) => cols.map((c) => q(l[c])).join(','))].join('\n')], { type: 'text/csv' }));
    a.download = 'leads.csv'; a.click();
  };

  const TH = ['Name', 'Phone', 'Email', 'Home Address', 'Date Opted In', 'Stage', 'Customer Notes', 'Plumber Assigned', 'Job Date', 'Quote $', 'Final $', 'Paid?', 'Days Since Contact', 'Lead Source', 'Hours', 'Cost $', 'Rating'];

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="noprint md:w-52 shrink-0 gcard !rounded-none p-3 flex md:flex-col gap-1 items-center md:items-stretch overflow-x-auto">
        <div className="hidden md:block font-bold text-navy px-3 py-2">US Water Pros</div>
        {(['dashboard', 'crm', 'quiz', 'activity'] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`text-left rounded-lg px-3 py-2 font-semibold whitespace-nowrap ${tab === t ? 'bg-[#0066cc]/10 text-[#0066cc]' : 'text-navy hover:bg-black/5'}`}>{t === 'crm' ? 'CRM' : t === 'quiz' ? 'Quiz' : t === 'activity' ? 'Site activity' : 'Dashboard'}</button>)}
        <button className="md:mt-auto text-left rounded-lg px-3 py-2 text-navy hover:bg-black/5 whitespace-nowrap" onClick={() => sb.auth.signOut()}>Sign out</button>
      </aside>
      <main className="flex-1 min-w-0 p-4 md:p-10 flex flex-col gap-10">
      <h1 className="!text-3xl">{{ dashboard: 'Dashboard', crm: 'CRM', quiz: 'Quiz', activity: 'Site activity' }[tab]}</h1>
      {msg && <p className="text-coral text-sm font-semibold">{msg}</p>}
      {tab === 'dashboard' && <Dashboard leads={leads} go={(p) => { setF({ q: '', stage: '', plumber: '', source: '', flag: '', ...p }); if (Object.keys(p).length) setTab('crm'); }} />}
      {tab === 'quiz' && <QuizInsights events={events} />}
      {tab === 'activity' && <SiteActivity events={siteEvents} />}

      {tab === 'crm' && (
        <>
          <div className="flex flex-wrap gap-2">
            {(f.source || f.flag) && <button className="btn !min-h-12 btn-outline" onClick={() => setF({ ...f, source: '', flag: '' })}>Clear: {f.source || (f.flag === 'stuck' ? 'stuck leads' : 'unpaid')} ✕</button>}
            <input className="field !w-56" placeholder="Search name, phone, email…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            <select className="field !w-auto" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">All stages</option>{STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select className="field !w-auto" value={f.plumber} onChange={(e) => setF({ ...f, plumber: e.target.value })}><option value="">All plumbers</option>{plumbers.map((p) => <option key={p}>{p}</option>)}</select>
            <button className="btn btn-orange !min-h-12" onClick={() => setAdding(!adding)}>+ Add lead</button>
            <button className="btn !min-h-12 btn-outline" onClick={exportCsv}>Export CSV</button>
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
          <p className="text-xs">Edit any cell, it saves when you click away. <span className="bg-red-100 px-1">Red</span> = stuck in the same stage over 10 days. <span className="bg-amber-100 px-1">Amber</span> = unpaid over 30 days.</p>
          <datalist id="sources">{SOURCES.map((p) => <option key={p} value={p} />)}</datalist>
          <datalist id="plumbers">{plumbers.map((p) => <option key={p} value={p} />)}</datalist>
          <div className="card overflow-x-auto !transform-none">
            <table className="w-full text-left text-sm min-w-[1900px]">
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
                  <td className="p-2"><input type="checkbox" checked={l.paid} onChange={(e) => update(l.id, { paid: e.target.checked })} className="w-5 h-5 accent-[#00a0bf]" aria-label="Paid" /></td>
                  <td className="p-2 whitespace-nowrap"><b>{days(l.last_contact_at ?? l.created_at)}</b> <button className="ml-1 text-xs link" onClick={() => update(l.id, { last_contact_at: new Date().toISOString() })}>log contact</button></td>
                  <td className="p-2 min-w-32"><Cell value={l.lead_source} list="sources" onCommit={(v) => update(l.id, { lead_source: v || null })} /></td>
                  <td className="p-2 w-20"><Cell type="number" value={l.job_hours} onCommit={(v) => update(l.id, { job_hours: num(v) })} /></td>
                  <td className="p-2 w-24"><Cell type="number" value={l.lead_cost} onCommit={(v) => update(l.id, { lead_cost: num(v) })} /></td>
                  <td className="p-2 w-20"><Cell type="number" value={l.review_rating} onCommit={(v) => update(l.id, { review_rating: num(v) })} /></td>
                </tr>
              ))}</tbody>
            </table>
            {!rows.length && <p className="p-4">No leads match.</p>}
          </div>
        </>
      )}
    </main>
    </div>
  );
}
