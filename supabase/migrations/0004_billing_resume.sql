-- 额度 / 订阅 / 用量流水 / 简历。可重复运行。
-- 原则：用户只能【读】自己的余额；扣减、退还、发放只能由服务端用 service_role 密钥调用下面的函数完成，
-- 这样用户即使拿着自己的令牌直接访问数据库，也改不了自己的额度。

-- ---------- 按次购买 / 管理员赠送的次数（不过期）----------
create table if not exists wallet (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits int not null default 0 check (credits >= 0),
  updated_at timestamptz not null default now()
);

-- ---------- 订阅（每个周期一份额度，到期不结转）----------
create table if not exists subscription (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free',
  quota int not null default 0 check (quota >= 0),
  used int not null default 0 check (used >= 0),
  period_start timestamptz,
  period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------- 用量流水：只记谁、何时、什么功能、扣了几次，不记简历内容 ----------
create table if not exists usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id text not null unique, -- 幂等：同一个请求不会重复扣
  feature text not null,
  units int not null check (units > 0),
  source text not null check (source in ('subscription', 'credits')),
  status text not null default 'ok' check (status in ('ok', 'refunded')),
  created_at timestamptz not null default now()
);
create index if not exists usage_log_user_idx on usage_log (user_id, created_at desc);

-- ---------- 简历：每人只保存【最新一份】解析后的结构化数据 ----------
-- 不保存原始 PDF / Word，也不保存简历全文；每次保存都是覆盖。
create table if not exists resume (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table wallet enable row level security;
alter table subscription enable row level security;
alter table usage_log enable row level security;
alter table resume enable row level security;

drop policy if exists wallet_select on wallet;
create policy wallet_select on wallet for select using (auth.uid() = user_id);
drop policy if exists subscription_select on subscription;
create policy subscription_select on subscription for select using (auth.uid() = user_id);
drop policy if exists usage_log_select on usage_log;
create policy usage_log_select on usage_log for select using (auth.uid() = user_id);
drop policy if exists resume_select on resume;
create policy resume_select on resume for select using (auth.uid() = user_id);
drop policy if exists resume_insert on resume;
create policy resume_insert on resume for insert with check (auth.uid() = user_id);
drop policy if exists resume_update on resume;
create policy resume_update on resume for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 关闭了“自动开放新表”，所以要显式授权。额度相关表：用户只读；写入只给 service_role。
grant select on wallet, subscription, usage_log to authenticated;
grant select, insert, update on resume to authenticated;
grant select, insert, update, delete on wallet, subscription, usage_log, resume to service_role;

-- ---------- 扣减：先用订阅额度，不够再用次数包；一次完成，不会并发超扣 ----------
create or replace function consume_units(p_user uuid, p_feature text, p_units int, p_request text)
returns text language plpgsql security definer set search_path = public as $$
declare
  s subscription%rowtype;
  prev text;
begin
  select source into prev from usage_log where request_id = p_request;
  if found then return prev; end if; -- 同一个请求重试：直接返回上次结果，不重复扣

  select * into s from subscription where user_id = p_user for update;
  if found and s.plan <> 'free' and s.period_end is not null and s.period_end > now()
     and s.used + p_units <= s.quota then
    update subscription set used = used + p_units, updated_at = now() where user_id = p_user;
    insert into usage_log (user_id, request_id, feature, units, source) values (p_user, p_request, p_feature, p_units, 'subscription');
    return 'subscription';
  end if;

  update wallet set credits = credits - p_units, updated_at = now() where user_id = p_user and credits >= p_units;
  if found then
    insert into usage_log (user_id, request_id, feature, units, source) values (p_user, p_request, p_feature, p_units, 'credits');
    return 'credits';
  end if;

  raise exception 'insufficient_quota' using errcode = 'P0001';
end $$;

-- ---------- 退还：大模型调用失败时把刚扣的还回去（只能退一次）----------
create or replace function refund_units(p_request text)
returns boolean language plpgsql security definer set search_path = public as $$
declare l usage_log%rowtype;
begin
  select * into l from usage_log where request_id = p_request and status = 'ok' for update;
  if not found then return false; end if;
  if l.source = 'subscription' then
    update subscription set used = greatest(used - l.units, 0), updated_at = now() where user_id = l.user_id;
  else
    insert into wallet (user_id, credits) values (l.user_id, l.units)
      on conflict (user_id) do update set credits = wallet.credits + l.units, updated_at = now();
  end if;
  update usage_log set status = 'refunded' where id = l.id;
  return true;
end $$;

-- ---------- 发放（支付回调和管理员命令用）----------
create or replace function grant_credits(p_user uuid, p_amount int)
returns int language plpgsql security definer set search_path = public as $$
declare total int;
begin
  insert into wallet (user_id, credits) values (p_user, greatest(p_amount, 0))
    on conflict (user_id) do update set credits = wallet.credits + greatest(p_amount, 0), updated_at = now()
    returning credits into total;
  return total;
end $$;

create or replace function set_subscription(p_user uuid, p_plan text, p_quota int, p_period_end timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into subscription (user_id, plan, quota, used, period_start, period_end)
    values (p_user, p_plan, p_quota, 0, now(), p_period_end)
    on conflict (user_id) do update
      set plan = p_plan, quota = p_quota, used = 0, period_start = now(), period_end = p_period_end, updated_at = now();
end $$;

create or replace function admin_user_id(p_email text)
returns uuid language sql security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- 这些函数只给 service_role：登录用户即使直接调用也会被拒绝
revoke all on function consume_units(uuid, text, int, text) from public, anon, authenticated;
revoke all on function refund_units(text) from public, anon, authenticated;
revoke all on function grant_credits(uuid, int) from public, anon, authenticated;
revoke all on function set_subscription(uuid, text, int, timestamptz) from public, anon, authenticated;
revoke all on function admin_user_id(text) from public, anon, authenticated;
grant execute on function consume_units(uuid, text, int, text) to service_role;
grant execute on function refund_units(text) to service_role;
grant execute on function grant_credits(uuid, int) to service_role;
grant execute on function set_subscription(uuid, text, int, timestamptz) to service_role;
grant execute on function admin_user_id(text) to service_role;

notify pgrst, 'reload schema';
