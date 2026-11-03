-- 附件简历、投递看板。可重复运行。
-- 注意：简历“解析”不保存原始文件；这里的“附件简历”是用户主动上传、用于投递时作为附件的文件，
-- 存在私有存储桶里，只有本人能读写，用户可随时删除。

-- ---------- 附件简历 ----------
create table if not exists attachment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  size int not null check (size > 0),
  path text not null unique, -- 存储桶里的路径：<user_id>/<uuid>.<扩展名>
  created_at timestamptz not null default now()
);
create index if not exists attachment_user_idx on attachment (user_id, created_at);

-- ---------- 投递看板 ----------
create table if not exists board_item (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text, -- 来自岗位库时记下岗位 id，手动添加的为空
  company text not null default '' check (char_length(company) <= 80),
  title text not null check (char_length(title) between 1 and 200),
  url text not null default '' check (char_length(url) <= 500),
  status text not null default 'todo'
    check (status in ('todo', 'applied', 'written_test', 'interview', 'offer', 'rejected')),
  note text not null default '' check (char_length(note) <= 2000),
  applied_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists board_item_user_idx on board_item (user_id, status, updated_at desc);

alter table attachment enable row level security;
alter table board_item enable row level security;

drop policy if exists attachment_select on attachment;
create policy attachment_select on attachment for select using (auth.uid() = user_id);
drop policy if exists attachment_insert on attachment;
create policy attachment_insert on attachment for insert with check (auth.uid() = user_id);
drop policy if exists attachment_delete on attachment;
create policy attachment_delete on attachment for delete using (auth.uid() = user_id);

drop policy if exists board_select on board_item;
create policy board_select on board_item for select using (auth.uid() = user_id);
drop policy if exists board_insert on board_item;
create policy board_insert on board_item for insert with check (auth.uid() = user_id);
drop policy if exists board_update on board_item;
create policy board_update on board_item for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists board_delete on board_item;
create policy board_delete on board_item for delete using (auth.uid() = user_id);

grant select, insert, delete on attachment to authenticated;
grant select, insert, update, delete on board_item to authenticated;

-- ---------- 数量上限（数据库层兜底，应用层也会先检查）----------
-- 自托管（不收费）时可以关掉：update app_settings set value = 'false' where key = 'enforce_limits';
create table if not exists app_settings (key text primary key, value text not null);
insert into app_settings (key, value) values ('enforce_limits', 'true') on conflict (key) do nothing;
alter table app_settings enable row level security; -- 不开放任何策略：只有 service_role / 数据库管理员能读写
create or replace function limits_enforced() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_settings where key = 'enforce_limits'), 'true') <> 'false';
$$;
revoke all on function limits_enforced() from public, anon, authenticated;

-- 数字要和 packages/shared/src/plans.ts 保持一致：免费 1 份附件，会员 3 份；看板免费 20 条，基础 100、Plus 300、Pro 1000。
create or replace function active_plan(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select plan from subscription
      where user_id = p_user and plan <> 'free' and period_end is not null and period_end > now()),
    'free');
$$;

create or replace function enforce_attachment_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; cnt int;
begin
  if not limits_enforced() then return new; end if;
  lim := case when active_plan(new.user_id) = 'free' then 1 else 3 end;
  select count(*) into cnt from attachment where user_id = new.user_id;
  if cnt >= lim then raise exception 'attachment_limit' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists attachment_limit_trg on attachment;
create trigger attachment_limit_trg before insert on attachment for each row execute function enforce_attachment_limit();

create or replace function enforce_board_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; cnt int;
begin
  if not limits_enforced() then return new; end if;
  lim := case active_plan(new.user_id) when 'basic' then 100 when 'plus' then 300 when 'pro' then 1000 else 20 end;
  select count(*) into cnt from board_item where user_id = new.user_id;
  if cnt >= lim then raise exception 'board_limit' using errcode = 'P0001'; end if;
  return new;
end $$;
drop trigger if exists board_limit_trg on board_item;
create trigger board_limit_trg before insert on board_item for each row execute function enforce_board_limit();

revoke all on function active_plan(uuid) from public, anon, authenticated;
revoke all on function enforce_attachment_limit() from public, anon, authenticated;
revoke all on function enforce_board_limit() from public, anon, authenticated;

-- ---------- 私有存储桶：每人只能碰自己目录下的文件 ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists resumes_select on storage.objects;
create policy resumes_select on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists resumes_insert on storage.objects;
create policy resumes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists resumes_delete on storage.objects;
create policy resumes_delete on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
