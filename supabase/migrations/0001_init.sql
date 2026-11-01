-- OfferPilot 初始表结构
create extension if not exists vector;

create table company (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('internet', 'finance', 'soe')),
  website text,
  careers_url text,
  created_at timestamptz not null default now()
);

create table job (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  title text not null,
  kind text not null check (kind in ('fulltime', 'intern')),
  cities text[] not null default '{}',
  description text not null default '',
  requirements jsonb not null default '{}',
  deadline timestamptz,
  apply_url text not null,
  source_url text not null,
  -- 原文快照，便于核对与追责
  source_snapshot text,
  embedding vector(1024),
  -- 自动抽取的岗位先 pending，人工审核后才对用户可见
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (apply_url)
);
create index job_review_idx on job (review_status, kind, deadline);

create table user_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null,
  embedding vector(1024),
  updated_at timestamptz not null default now()
);

create table match (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references job(id) on delete cascade,
  score int not null check (score between 0 and 100),
  reasons jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

create table application (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references job(id),
  status text not null default 'queued'
    check (status in ('queued', 'filled', 'submitted', 'written_test', 'interview', 'offer', 'rejected', 'failed')),
  submit_mode text not null default 'manual' check (submit_mode in ('manual', 'auto')),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create table site_adapter (
  id text primary key,
  version int not null default 1,
  url_patterns text[] not null,
  field_map jsonb not null default '{}',
  enabled boolean not null default true
);

-- 行级安全：用户只能访问自己的数据，岗位仅展示已审核的
alter table user_profile enable row level security;
alter table match enable row level security;
alter table application enable row level security;
alter table job enable row level security;

create policy own_profile on user_profile for all using (auth.uid() = user_id);
create policy own_match on match for select using (auth.uid() = user_id);
create policy own_application on application for all using (auth.uid() = user_id);
create policy approved_jobs on job for select using (review_status = 'approved');
