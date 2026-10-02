# US Water Pros CRM

Private CRM and dashboard for USWaterPros.com leads. The public marketing site lives in `pepdek/USWaterPros` and writes new leads into the same Supabase project.

- Next.js 14, TypeScript, Tailwind, Supabase (email/password auth, RLS).
- `supabase/schema.sql`: leads table, admin allow-list, policies. Add admins with `insert into admins (email) values ('you@example.com');`
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`).
- Deploy as its own Netlify site on `crm.uswaterpros.com`.
- Not built yet: Stripe invoicing/payments, sending quotes, SMS automation, booking calendar.
