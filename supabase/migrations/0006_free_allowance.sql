-- 免费版每月小额度：每个自然月（UTC）可用站点模型 3 次（简历解析 / 修改建议共用）。可重复运行。
-- 3 这个数要和 packages/shared/src/plans.ts 里 free.monthlyQuota 保持一致。
-- 扣减顺序：付费订阅额度 → 免费月额度 → 次数包（先用不花钱的，次数包留到最后）。

alter table usage_log drop constraint if exists usage_log_source_check;
alter table usage_log add constraint usage_log_source_check check (source in ('subscription', 'credits', 'free'));
create index if not exists usage_log_free_idx on usage_log (user_id, created_at) where source = 'free';

create or replace function consume_units(p_user uuid, p_feature text, p_units int, p_request text)
returns text language plpgsql security definer set search_path = public as $$
declare
  s subscription%rowtype;
  prev text;
  free_quota constant int := 3;
  free_used int;
begin
  -- 同一个用户的扣减排队执行，避免并发时多扣或超发免费额度
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select source into prev from usage_log where request_id = p_request;
  if found then return prev; end if;

  select * into s from subscription where user_id = p_user for update;
  if found and s.plan <> 'free' and s.period_end is not null and s.period_end > now()
     and s.used + p_units <= s.quota then
    update subscription set used = used + p_units, updated_at = now() where user_id = p_user;
    insert into usage_log (user_id, request_id, feature, units, source) values (p_user, p_request, p_feature, p_units, 'subscription');
    return 'subscription';
  end if;

  select coalesce(sum(units), 0) into free_used from usage_log
    where user_id = p_user and source = 'free' and status = 'ok'
      and created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  if free_used + p_units <= free_quota then
    insert into usage_log (user_id, request_id, feature, units, source) values (p_user, p_request, p_feature, p_units, 'free');
    return 'free';
  end if;

  update wallet set credits = credits - p_units, updated_at = now() where user_id = p_user and credits >= p_units;
  if found then
    insert into usage_log (user_id, request_id, feature, units, source) values (p_user, p_request, p_feature, p_units, 'credits');
    return 'credits';
  end if;

  raise exception 'insufficient_quota' using errcode = 'P0001';
end $$;

create or replace function refund_units(p_request text)
returns boolean language plpgsql security definer set search_path = public as $$
declare l usage_log%rowtype;
begin
  select * into l from usage_log where request_id = p_request and status = 'ok' for update;
  if not found then return false; end if;
  if l.source = 'subscription' then
    update subscription set used = greatest(used - l.units, 0), updated_at = now() where user_id = l.user_id;
  elsif l.source = 'credits' then
    insert into wallet (user_id, credits) values (l.user_id, l.units)
      on conflict (user_id) do update set credits = wallet.credits + l.units, updated_at = now();
  end if; -- source = 'free'：标记为已退还后不再计入本月已用
  update usage_log set status = 'refunded' where id = l.id;
  return true;
end $$;

revoke all on function consume_units(uuid, text, int, text) from public, anon, authenticated;
revoke all on function refund_units(text) from public, anon, authenticated;
grant execute on function consume_units(uuid, text, int, text) to service_role;
grant execute on function refund_units(text) to service_role;

notify pgrst, 'reload schema';
