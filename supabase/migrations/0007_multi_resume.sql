-- 多份在线简历：免费 1 份，付费订阅最多 3 份；扩展里可选择用哪一份填表。可重复运行，要在 0005 之后。
-- 每份只保存解析/编辑后的结构化数据，不保存原始文件。
-- 份数上限要和 packages/shared/src/plans.ts 的 resumes 保持一致。

create table if not exists resume_doc (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '我的简历' check (char_length(name) between 1 and 40),
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists resume_doc_user_idx on resume_doc (user_id, created_at);

alter table resume_doc enable row level security;
drop policy if exists resume_doc_select on resume_doc;
create policy resume_doc_select on resume_doc for select using (auth.uid() = user_id);
drop policy if exists resume_doc_insert on resume_doc;
create policy resume_doc_insert on resume_doc for insert with check (auth.uid() = user_id);
drop policy if exists resume_doc_update on resume_doc;
create policy resume_doc_update on resume_doc for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists resume_doc_delete on resume_doc;
create policy resume_doc_delete on resume_doc for delete using (auth.uid() = user_id);
grant select, insert, update, delete on resume_doc to authenticated;
grant select, insert, update, delete on resume_doc to service_role;

-- 旧版每人一份的 resume 表：搬到新表（只搬还没有新简历的人）
insert into resume_doc (user_id, name, data, updated_at)
select r.user_id, '我的简历', r.data, r.updated_at from resume r
where not exists (select 1 from resume_doc d where d.user_id = r.user_id);

-- 份数上限（数据库层兜底，应用层也会先检查）。active_plan / limits_enforced 来自 0005。
create or replace function enforce_resume_doc_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; cnt int;
begin
  if not limits_enforced() then return new; end if;
  lim := case when active_plan(new.user_id) = 'free' then 1 else 3 end;
  select count(*) into cnt from resume_doc where user_id = new.user_id;
  if cnt >= lim then raise exception 'resume_limit' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists resume_doc_limit_trg on resume_doc;
create trigger resume_doc_limit_trg before insert on resume_doc for each row execute function enforce_resume_doc_limit();
revoke all on function enforce_resume_doc_limit() from public, anon, authenticated;

notify pgrst, 'reload schema';
