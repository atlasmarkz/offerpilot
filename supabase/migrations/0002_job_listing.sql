-- 采集器同步用的扁平岗位表，字段与 @offerpilot/shared 的 Job 一一对应。
-- 先用它让线上 Web 端能读到岗位；0001 里带 company 外键的 job 表留给后续账号体系。
create table job_listing (
  id text primary key,
  company_id text not null,
  company_type text not null check (company_type in ('internet', 'finance', 'soe')),
  title text not null,
  kind text not null check (kind in ('fulltime', 'intern')),
  cities text[] not null default '{}',
  -- 只存预览，正文留在官网
  description text not null default '',
  requirements jsonb not null default '{}',
  deadline timestamptz,
  apply_url text not null,
  source_url text not null,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  updated_at timestamptz not null default now()
);
create index job_listing_review_idx on job_listing (review_status, kind);

alter table job_listing enable row level security;
-- 匿名访问者（网页端）只能读已审核的岗位；写入只能用 service_role 密钥，它绕过 RLS。
create policy listing_public_read on job_listing for select using (review_status = 'approved');

-- 新建项目时关闭了“自动开放新表”，所以要显式授权：匿名访客只读（再受上面的行级安全限制，只看到已审核岗位）。
-- 写入用 service_role 密钥，它自带权限，不需要在这里授权。
grant select on job_listing to anon;
