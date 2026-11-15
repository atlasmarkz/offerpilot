-- 招聘平台（Boss直聘、猎聘……）的投递记录：由浏览器扩展在本机记录，网页端打开投递看板时同步上来。
-- 官网投递仍在 board_item。平台记录量大，不占看板条数，单独设一个总量上限防滥用。可重复运行。

create table if not exists application (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('boss', 'liepin')),
  external_id text not null check (char_length(external_id) between 1 and 80),
  company text not null default '' check (char_length(company) <= 80),
  title text not null check (char_length(title) between 1 and 200),
  city text not null default '' check (char_length(city) <= 40),
  salary text not null default '' check (char_length(salary) <= 40),
  url text not null default '' check (char_length(url) <= 500),
  status text not null default 'greeted'
    check (status in ('greeted', 'replied', 'resume_sent', 'interview', 'offer', 'rejected')),
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel, external_id)
);
create index if not exists application_user_idx on application (user_id, applied_at desc);

alter table application enable row level security;
drop policy if exists application_select on application;
create policy application_select on application for select using (auth.uid() = user_id);
drop policy if exists application_insert on application;
create policy application_insert on application for insert with check (auth.uid() = user_id);
drop policy if exists application_update on application;
create policy application_update on application for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists application_delete on application;
create policy application_delete on application for delete using (auth.uid() = user_id);
grant select, insert, update, delete on application to authenticated;

-- 每人最多 5000 条（约等于每天 150 条投一个月），超过就拒绝新增；可用 enforce_limits 关闭
create or replace function enforce_application_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare cnt int;
begin
  if not limits_enforced() then return new; end if;
  select count(*) into cnt from application where user_id = new.user_id;
  if cnt >= 5000 then raise exception 'application_limit' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists application_limit_trg on application;
create trigger application_limit_trg before insert on application for each row execute function enforce_application_limit();
revoke all on function enforce_application_limit() from public, anon, authenticated;

notify pgrst, 'reload schema';
