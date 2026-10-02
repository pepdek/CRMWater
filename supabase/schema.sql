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
