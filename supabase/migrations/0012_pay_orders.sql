-- 支付订单 + 支付成功后的履约（开通 / 续期会员、发放次数包）。可重复运行，要在 0004 之后。
-- 原则：用户只能读自己的订单；建单、标记已支付、发放权益只能由服务端用 service_role 完成。
-- 金额和权益由服务端按商品目录（packages/shared/src/plans.ts）算好传进来，函数再核对订单上的商品和金额。

create table if not exists pay_order (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  amount_fen int not null check (amount_fen > 0),
  channel text not null check (channel in ('alipay', 'wechat')),
  status text not null default 'pending' check (status in ('pending', 'paid', 'closed', 'refunded')),
  trade_no text,                -- 支付平台的交易号
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists pay_order_user_idx on pay_order (user_id, created_at desc);
create unique index if not exists pay_order_trade_idx on pay_order (channel, trade_no) where trade_no is not null;

alter table pay_order enable row level security;
drop policy if exists pay_order_select on pay_order;
create policy pay_order_select on pay_order for select using (auth.uid() = user_id);
grant select on pay_order to authenticated;
grant select, insert, update on pay_order to service_role;

-- 履约：在一个事务里把订单从 pending 改成 paid 并发放权益，保证“付了钱一定到账、同一单只发一次”。
-- 返回：ok 本次发放成功；already 之前已发放（支付平台重复通知）；not_found / bad_status / mismatch 异常。
create or replace function fulfill_order(
  p_order uuid, p_trade_no text, p_amount_fen int,
  p_product text, p_kind text, p_plan text, p_days int, p_units int
) returns text
language plpgsql security definer set search_path = public as $$
declare
  o pay_order;
  s subscription;
  carry int := 0;
begin
  select * into o from pay_order where id = p_order for update;
  if not found then return 'not_found'; end if;
  if o.status = 'paid' then return 'already'; end if;
  if o.status <> 'pending' then return 'bad_status'; end if;
  if o.amount_fen <> p_amount_fen or o.product_id <> p_product then return 'mismatch'; end if;

  update pay_order set status = 'paid', trade_no = p_trade_no, paid_at = now(), updated_at = now() where id = p_order;

  if p_kind = 'credits' then
    insert into wallet (user_id, credits) values (o.user_id, p_units)
      on conflict (user_id) do update set credits = wallet.credits + p_units, updated_at = now();
  elsif p_kind = 'subscription' then
    select * into s from subscription where user_id = o.user_id for update;
    if found and s.plan = p_plan and s.period_end is not null and s.period_end > now() then
      -- 同等级续期：到期日顺延，额度累加，已用的不清零
      update subscription set period_end = s.period_end + make_interval(days => p_days), quota = s.quota + p_units, updated_at = now()
        where user_id = o.user_id;
    else
      -- 新开通或升级：从现在起算；升级时把旧等级没用完的额度带过来
      if found and s.period_end is not null and s.period_end > now() then carry := greatest(s.quota - s.used, 0); end if;
      insert into subscription (user_id, plan, quota, used, period_start, period_end)
        values (o.user_id, p_plan, p_units + carry, 0, now(), now() + make_interval(days => p_days))
        on conflict (user_id) do update
          set plan = p_plan, quota = p_units + carry, used = 0, period_start = now(),
              period_end = now() + make_interval(days => p_days), updated_at = now();
    end if;
  else
    raise exception 'unknown kind %', p_kind;
  end if;
  return 'ok';
end $$;

revoke all on function fulfill_order(uuid, text, int, text, text, text, int, int) from public, anon, authenticated;
grant execute on function fulfill_order(uuid, text, int, text, text, text, int, int) to service_role;

notify pgrst, 'reload schema';
