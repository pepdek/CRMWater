'use client';
import { useEffect } from 'react';
import { type Lead, STAGES, days } from '@/lib/crm';
import Cell from './Cell';

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="text-xs text-[var(--muted)]">{label}</span>{children}</label>;
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="flex flex-col gap-3"><h2 className="!text-xl">{title}</h2>{children}</section>;

export default function LeadPanel({ lead: l, update, setStage, onClose }: { lead: Lead; update: (id: string, p: Record<string, unknown>) => void; setStage: (l: Lead, s: string) => void; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  const u = (k: string) => (v: string) => update(l.id, { [k]: v || null });
  const n = (k: string) => (v: string) => update(l.id, { [k]: v === '' ? null : Number(v) });
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/20 noprint" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-[30rem] overflow-auto bg-[var(--ripple)] border-l border-[var(--line)] shadow-2xl p-6 flex flex-col gap-8 noprint">
        <div className="flex items-start justify-between gap-2">
          <div><h1 className="!text-3xl">{l.name}</h1><div className="text-xs text-[var(--muted)]">Opted in {new Date(l.created_at).toLocaleDateString()} · {days(l.last_contact_at ?? l.created_at)} days since contact</div></div>
          <button className="btn btn-outline !min-h-10" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <button className="btn btn-navy !min-h-10" onClick={() => update(l.id, { last_contact_at: new Date().toISOString() })}>Log contact today</button>
        <Section title="Contact">
          <Field label="Name"><Cell value={l.name} onCommit={(v) => update(l.id, { name: v })} /></Field>
          <Field label="Phone"><Cell value={l.phone} onCommit={u('phone')} />{l.phone && <a className="text-xs" href={`tel:${l.phone}`}>Call {l.phone}</a>}</Field>
          <Field label="Email"><Cell value={l.email} onCommit={u('email')} /></Field>
          <Field label="Home address"><Cell value={l.address} onCommit={u('address')} /></Field>
          <Field label="Customer notes"><Cell area value={l.notes} onCommit={u('notes')} /></Field>
        </Section>
        <Section title="Job">
          <Field label="Stage"><select className="field !min-h-10" value={l.stage} onChange={(e) => setStage(l, e.target.value)}>{STAGES.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</select></Field>
          <Field label="Plumber assigned"><Cell value={l.plumber_assigned} list="plumbers" onCommit={u('plumber_assigned')} /></Field>
          <Field label="Job date"><Cell type="date" value={l.job_date} onCommit={u('job_date')} /></Field>
          <Field label="Hours booked"><Cell type="number" value={l.job_hours} onCommit={n('job_hours')} /></Field>
          <Field label="Review rating (1-5)"><Cell type="number" value={l.review_rating} onCommit={n('review_rating')} /></Field>
        </Section>
        <Section title="Money">
          <Field label="Quote $"><Cell type="number" value={l.quote_amount} onCommit={n('quote_amount')} /></Field>
          <Field label="Final $"><Cell type="number" value={l.final_amount} onCommit={n('final_amount')} /></Field>
          <label className="flex items-center gap-2"><input type="checkbox" checked={l.paid} onChange={(e) => update(l.id, { paid: e.target.checked })} className="w-5 h-5 accent-[#00a0bf]" /> Paid</label>
        </Section>
        <Section title="Source">
          <Field label="Lead source"><Cell value={l.lead_source} list="sources" onCommit={u('lead_source')} /></Field>
          <Field label="Cost to acquire $"><Cell type="number" value={l.lead_cost} onCommit={n('lead_cost')} /></Field>
          <div className="text-xs text-[var(--muted)]">Service: {l.service_type} · Page: {l.page_source ?? '—'}</div>
        </Section>
      </aside>
    </>
  );
}
