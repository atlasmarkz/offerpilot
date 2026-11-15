-- 岗位来源、发布日期、在招 / 下架状态。每天的定时采集据此判断哪些岗位已下架。可重复运行。
alter table job_listing add column if not exists source text;               -- 数据源 id（采集器 sources.json），如 meituan-campus
alter table job_listing add column if not exists posted_at date;            -- 官网上的发布日期；官网没给就为空
alter table job_listing add column if not exists first_seen_at timestamptz; -- 第一次采集到
alter table job_listing add column if not exists last_seen_at timestamptz;  -- 最近一次确认在招
alter table job_listing add column if not exists status text not null default 'open';
alter table job_listing add column if not exists closed_at timestamptz;
alter table job_listing add column if not exists miss_count int not null default 0;

do $$ begin
  alter table job_listing add constraint job_listing_status_chk check (status in ('open', 'closed'));
exception when duplicate_object then null; end $$;

-- 旧数据：没有收录时间的，用最后更新时间近似
update job_listing set first_seen_at = coalesce(first_seen_at, updated_at), last_seen_at = coalesce(last_seen_at, updated_at)
  where first_seen_at is null or last_seen_at is null;
alter table job_listing alter column first_seen_at set default now();
alter table job_listing alter column last_seen_at set default now();

create index if not exists job_listing_source_idx on job_listing (source, status);
create index if not exists job_listing_fresh_idx on job_listing (status, review_status, kind);

notify pgrst, 'reload schema';
