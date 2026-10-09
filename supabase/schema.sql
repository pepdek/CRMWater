-- US Water Pros: one flat leads table drives the site forms and the CRM.
create table leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),          -- "Date Opted In"
  name varchar(255) not null check (char_length(name) >= 2),
  email varchar(255),
  phone varchar(20),
  address text,                                            -- "Home Address"
  zip_code varchar(10),
  service_type varchar(255) not null,
  page_source varchar(255),
  ip_address inet,
  user_agent text,
  stage varchar(30) not null default 'new'
    check (stage in ('new','contacted','consult_booked','proposal_sent','job_scheduled','completed','lost')),
  stage_changed_at timestamptz not null default now(),
  last_contact_at timestamptz,                             -- drives "Days Since Contact"
  notes text,                                              -- "Customer Notes"
  plumber_assigned varchar(255),
  job_date date,
  quote_amount numeric(10,2),
  final_amount numeric(10,2),
  paid boolean not null default false,
  completed_at timestamptz
);
create index idx_leads_created_at on leads(created_at);
create index idx_leads_stage on leads(stage);
create index idx_leads_plumber on leads(plumber_assigned);

-- Admins: only these emails can read or edit leads, even if someone signs up in Supabase Auth.
create table admins (email text primary key);
alter table admins enable row level security;  -- no policies: invisible to API clients
create function is_admin() returns boolean language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.admins where email = (select auth.jwt() ->> 'email')) $$;

alter table leads enable row level security;
-- The public site may insert new leads (and nothing else). Constrained so it can't be abused to set CRM fields.
create policy "site insert" on leads for insert to anon
  with check (stage = 'new' and paid = false and final_amount is null and quote_amount is null and plumber_assigned is null
              and char_length(name) between 2 and 255 and service_type is not null);
create policy "admin all" on leads for all to authenticated using (is_admin()) with check (is_admin());

insert into admins (email) values ('dekpep@gmail.com');

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Quiz answers from the public /quiz page (full response object).
alter table leads add column quiz jsonb;

-- Step-by-step quiz answers from /quiz (anonymous, no contact details). The CRM Quiz tab groups these by session_id.
create table quiz_events (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  screen varchar(20) not null,
  answers jsonb not null default '{}',
  recommendation jsonb
);
create index idx_quiz_events_session on quiz_events(session_id);
create index idx_quiz_events_created on quiz_events(created_at);
alter table quiz_events enable row level security;
create policy "site insert" on quiz_events for insert to anon
  with check (char_length(screen) <= 20 and pg_column_size(answers) < 4000 and (recommendation is null or pg_column_size(recommendation) < 2000));
create policy "admin all" on quiz_events for all to authenticated using (is_admin()) with check (is_admin());

-- Dashboard v2: source attribution, review, utilization hours, per-lead acquisition cost.
alter table leads
  add column lead_source varchar(50),          -- Google Ads | Referral | Website | Facebook | Direct | Other
  add column review_rating smallint check (review_rating between 1 and 5),
  add column job_hours numeric(4,1),           -- hours booked for the job (utilization); blank = assume 3
  add column lead_cost numeric(10,2);          -- what this lead cost to acquire (CPL / ROI)

-- Lead source and site activity (added with the GA4/GTM tracking work).
-- leads.lead_source already existed as a free-text column; the public site now fills it automatically ("google / cpc / campaign").
alter table leads add column if not exists attribution jsonb;
alter table quiz_events add column if not exists attribution jsonb;
create table if not exists site_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event varchar(40) not null,
  page varchar(200),
  source varchar(60),
  device_type varchar(10),
  traffic_source varchar(20),
  lead_source varchar(120),
  city varchar(30),
  session_id uuid,
  params jsonb
);
create index if not exists idx_site_events_created on site_events(created_at);
create index if not exists idx_site_events_event on site_events(event);
alter table site_events enable row level security;
create policy "site insert" on site_events for insert to anon
  with check (char_length(event) <= 40 and (params is null or pg_column_size(params) < 2000));
create policy "admin all" on site_events for all to authenticated using (is_admin()) with check (is_admin());
