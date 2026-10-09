'use client';
import { useMemo, useState } from 'react';

export type QuizEvent = {
  session_id: string; created_at: string; screen: string;
  answers: { location?: string; currentSituation?: string; waterConcerns?: string[]; waterSourceType?: string; servicePathA?: string; householdSize?: string; budgetComfort?: string; timeline?: string; communicationPreference?: string };
  recommendation: { path?: string; label?: string } | null;
  attribution?: { source?: string; medium?: string; campaign?: string; traffic_source?: string } | null;
};

// Furthest-step index per screen. Interstitials share the step of the question before them; qwell and q4a share a step.
const STEP: Record<string, number> = { q1: 0, q2: 1, i1: 1, q3: 2, i2: 2, qwell: 3, q4a: 3, q5: 4, q6: 5, i3: 5, q7: 6, q8: 7, result: 8, submitted: 9 };
const STEPS = ['Location', 'Situation', 'Concerns', 'Path / well question', 'Household', 'Budget style', 'Timeline', 'Contact preference', 'Saw result', 'Submitted contact info'];
const DAY = 86400000;

type Session = { id: string; start: string; furthest: number; answers: QuizEvent['answers']; rec: QuizEvent['recommendation']; at: QuizEvent['attribution'] };

export default function QuizInsights({ events }: { events: QuizEvent[] }) {
  const [range, setRange] = useState<'7' | '30' | 'all'>('30');
  const [who, setWho] = useState<'all' | 'submitted' | 'abandoned'>('all');

  const sessions = useMemo(() => {
    const m = new Map<string, Session>();
    for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const s = m.get(e.session_id) ?? { id: e.session_id, start: e.created_at, furthest: -1, answers: {}, rec: null, at: null };
      s.furthest = Math.max(s.furthest, STEP[e.screen] ?? -1);
      s.answers = e.answers; if (e.recommendation) s.rec = e.recommendation; if (e.attribution) s.at = e.attribution;
      m.set(e.session_id, s);
    }
    return [...m.values()];
  }, [events]);

  const inRange = sessions.filter((s) => range === 'all' || Date.now() - new Date(s.start).getTime() < Number(range) * DAY);
  const shown = inRange.filter((s) => who === 'all' || (who === 'submitted' ? s.furthest === 9 : s.furthest < 9));
  const reached = (k: number) => inRange.filter((s) => s.furthest >= k).length;

  const tally = (pick: (s: Session) => (string | undefined)[]) => {
    const c: Record<string, number> = {}; let base = 0;
    for (const s of shown) { const v = pick(s).filter(Boolean) as string[]; if (v.length) base++; v.forEach((x) => (c[x] = (c[x] ?? 0) + 1)); }
    return { rows: Object.entries(c).sort((a, b) => b[1] - a[1]), base };
  };
  const FIELDS: [string, (s: Session) => (string | undefined)[]][] = [
    ['Location', (s) => [s.answers.location]], ['Where they are in the buying process', (s) => [s.answers.currentSituation]],
    ['Water concerns (multi-select)', (s) => s.answers.waterConcerns ?? []], ['Water source', (s) => [s.answers.waterSourceType === 'private_well' ? 'Private well' : s.answers.waterSourceType === 'municipal' ? 'Municipal' : undefined]],
    ['What matters most (softness / purity)', (s) => [s.answers.servicePathA]], ['Household size', (s) => [s.answers.householdSize]],
    ['How they decide on purchases', (s) => [s.answers.budgetComfort]], ['Install timeline', (s) => [s.answers.timeline]],
    ['Contact preference', (s) => [s.answers.communicationPreference]], ['Recommended path', (s) => [s.rec?.label]],
    ['Traffic source', (s) => [s.at?.traffic_source]], ['Source / medium / campaign', (s) => [s.at ? [s.at.source, s.at.medium, s.at.campaign].filter((x) => x && x !== 'none').join(' / ') || 'direct' : undefined]],
  ];
  const top = (pick: (s: Session) => (string | undefined)[]) => tally(pick).rows[0]?.[0];
  const persona = shown.length
    ? `A typical visitor lives in ${top(FIELDS[0][1]) ?? '—'}, is “${top(FIELDS[1][1]) ?? '—'}”, mostly mentions ${tally(FIELDS[2][1]).rows.slice(0, 2).map((r) => r[0].toLowerCase()).join(' and ') || '—'}, has a household of ${top(FIELDS[5][1]) ?? '—'}, decides by ${top(FIELDS[6][1])?.toLowerCase() ?? '—'}, wants install ${top(FIELDS[7][1]) ?? '—'}, and prefers ${top(FIELDS[8][1]) ?? '—'}.`
    : '';
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
  const started = inRange.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <select className="field !w-auto" value={range} onChange={(e) => setRange(e.target.value as typeof range)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="all">All time</option></select>
        <select className="field !w-auto" value={who} onChange={(e) => setWho(e.target.value as typeof who)}><option value="all">All quiz takers</option><option value="submitted">Only people who submitted contact info</option><option value="abandoned">Only people who left before submitting</option></select>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[['Quizzes started', String(started)], ['Saw a result', pct(reached(8), started)], ['Submitted contact info', pct(reached(9), started)], ['Showing in persona below', String(shown.length)]].map(([l, v]) => (
          <div key={l} className="card p-4 !transform-none"><div className="text-3xl font-bold text-navy">{v}</div><div className="text-sm">{l}</div></div>
        ))}
      </div>

      {persona && <p className="card p-4 !transform-none border-l-4 border-aqua"><b className="text-navy">Persona snapshot.</b> {persona}</p>}

      <section className="card p-5 !transform-none">
        <h2 className="text-xl">Where people drop off</h2>
        <div className="mt-3 flex flex-col gap-2">
          {STEPS.map((l, k) => (
            <div key={l}><div className="flex justify-between text-sm"><span>{k + 1}. {l}</span><b>{reached(k)} <span className="font-normal">({pct(reached(k), started)})</span></b></div>
              <div className="h-2 bg-ice rounded"><div className="h-2 bg-aqua rounded" style={{ width: `${started ? (reached(k) / started) * 100 : 0}%` }} /></div></div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {FIELDS.map(([title, pick]) => {
          const { rows, base } = tally(pick);
          return (
            <section key={title} className="card p-5 !transform-none">
              <h2 className="text-xl">{title}</h2>
              <div className="mt-3 flex flex-col gap-2">
                {rows.map(([label, n]) => (
                  <div key={label}><div className="flex justify-between text-sm"><span>{label}</span><b>{n} <span className="font-normal">({pct(n, base)})</span></b></div>
                    <div className="h-2 bg-ice rounded"><div className="h-2 bg-aqua rounded" style={{ width: `${base ? (n / base) * 100 : 0}%` }} /></div></div>
                ))}
                {!rows.length && <p className="text-sm">No answers yet.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
