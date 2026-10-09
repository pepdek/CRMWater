export type Lead = {
  id: string; created_at: string; name: string; email: string | null; phone: string | null; address: string | null;
  service_type: string; stage: string; stage_changed_at: string; last_contact_at: string | null; notes: string | null;
  plumber_assigned: string | null; job_date: string | null; quote_amount: number | null; final_amount: number | null;
  paid: boolean; completed_at: string | null;
  lead_source: string | null; review_rating: number | null; job_hours: number | null; lead_cost: number | null;
};

export const STAGES: [string, string][] = [
  ['new', 'New Lead Captured'], ['contacted', 'Contacted / Qualifying'], ['consult_booked', 'Water Test / Consultation Booked'],
  ['proposal_sent', 'Proposal / Estimate Sent'], ['job_scheduled', 'Job Booked & Scheduled'], ['completed', 'Completed & Review Requested'], ['lost', 'Lost'],
];
export const LABEL: Record<string, string> = Object.fromEntries(STAGES);
// Funnel order (excludes 'lost') and its short labels.
export const FUNNEL = ['new', 'contacted', 'consult_booked', 'proposal_sent', 'job_scheduled', 'completed'];
export const SHORT = ['New Lead', 'Contacted', 'Test Booked', 'Proposal Sent', 'Job Booked', 'Completed'];
export const SOURCES = ['Google Ads', 'Referral', 'Website', 'Facebook', 'Direct', 'Other'];

export const DAY = 86400000;
export const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : 0);
export const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// Conditional-format rules.
export const stale = (l: Lead) => l.stage !== 'completed' && l.stage !== 'lost' && days(l.stage_changed_at) > 10;
export const overdue = (l: Lead) => l.stage === 'completed' && !l.paid && days(l.completed_at ?? l.stage_changed_at) > 30;
export const doneAt = (l: Lead) => l.completed_at ?? l.stage_changed_at;
