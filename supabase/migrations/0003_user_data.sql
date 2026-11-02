-- 账号体系：登录用户的云端数据。可重复运行。
-- 只存画像和已选岗位；简历文件、大模型密钥永远不上云。
create table if not exists user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}',
  selected text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table user_data enable row level security;

-- 每个人只能读写自己的那一行（auth.uid() 来自登录用户的令牌）
drop policy if exists user_data_select on user_data;
create policy user_data_select on user_data for select using (auth.uid() = user_id);
drop policy if exists user_data_insert on user_data;
create policy user_data_insert on user_data for insert with check (auth.uid() = user_id);
drop policy if exists user_data_update on user_data;
create policy user_data_update on user_data for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 关闭了“自动开放新表”，所以要显式授权；匿名访客没有任何权限
grant select, insert, update on user_data to authenticated;

-- 用户自助删除账号：连同云端数据一起删（user_data 通过外键级联删除）。
-- security definer 以函数所有者身份删除 auth.users，不需要把 service_role 密钥放到网页服务器上。
create or replace function delete_my_account() returns void
language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function delete_my_account() from public;
revoke all on function delete_my_account() from anon;
grant execute on function delete_my_account() to authenticated;

notify pgrst, 'reload schema';
