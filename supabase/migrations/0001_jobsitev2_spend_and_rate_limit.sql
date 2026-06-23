-- jobsite-v2 — shared spend cap + rate limiter (Level 2).
-- Run this once in the Supabase SQL editor. Then set SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY in Vercel (and .env.local). Until then the app
-- falls back to per-instance in-memory counters.
--
-- All objects are prefixed `jobsitev2_` so this project can be SHARED with the
-- other Orthogonal demos (rolodex, job-intel, jobenrich, …) in one Supabase
-- project without colliding — separate tables → separate cap + limits, no
-- function-name clobbering. This migration ONLY creates `jobsitev2_*` objects
-- and is idempotent (IF NOT EXISTS / CREATE OR REPLACE); it never touches
-- another app's objects (e.g. the older `jobenrich_*` tables stay intact).

-- ── Daily spend (one row per UTC day) ────────────────────────────────
create table if not exists jobsitev2_daily_spend (
  day  date primary key,
  usd  numeric not null default 0
);

-- RLS ON with NO policies: the public anon key cannot read/tamper with these
-- tables via the REST API, while the server-side service_role key bypasses RLS
-- and does all the work. This is the secure default and silences the linter.
alter table jobsitev2_daily_spend enable row level security;

-- Atomically RESERVE cost against today's cap: check-and-increment in one
-- locked transaction so concurrent serverless requests can't race past the cap
-- (the TOCTOU that a separate read-then-write spendCap had). Returns true and
-- records the spend if it fits under p_cap, false (and records nothing) if not.
create or replace function jobsitev2_try_reserve_spend(p_day date, p_cost numeric, p_cap numeric)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare cur numeric;
begin
  -- Ensure today's row exists, then lock it so the check + increment are atomic.
  insert into jobsitev2_daily_spend (day, usd) values (p_day, 0)
    on conflict (day) do nothing;
  select usd into cur from jobsitev2_daily_spend where day = p_day for update;
  if cur + p_cost > p_cap then
    return false;
  end if;
  update jobsitev2_daily_spend set usd = usd + p_cost where day = p_day;
  return true;
end;
$$;

-- ── Per-visitor, per-step rate limit (sliding daily window) ──────────
create table if not exists jobsitev2_rate_limits (
  key       text primary key,
  count     int not null default 0,
  reset_at  timestamptz not null
);

-- Same as above: anon blocked, service_role bypasses.
alter table jobsitev2_rate_limits enable row level security;

-- Atomically check-and-increment. Returns whether the call is allowed,
-- how many remain, and when the window resets.
create or replace function jobsitev2_check_rate_limit(p_key text, p_limit int, p_window_secs int)
returns table(allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
set search_path = public, pg_temp
as $$
declare r jobsitev2_rate_limits%rowtype;
begin
  select * into r from jobsitev2_rate_limits where key = p_key for update;
  if not found or r.reset_at < now() then
    insert into jobsitev2_rate_limits (key, count, reset_at)
      values (p_key, 1, now() + make_interval(secs => p_window_secs))
      on conflict (key) do update
        set count = 1, reset_at = now() + make_interval(secs => p_window_secs)
      returning * into r;
    return query select true, p_limit - 1, r.reset_at;
  elsif r.count >= p_limit then
    return query select false, 0, r.reset_at;
  else
    update jobsitev2_rate_limits set count = count + 1 where key = p_key returning * into r;
    return query select true, p_limit - r.count, r.reset_at;
  end if;
end;
$$;

-- Optional housekeeping: drop expired rate-limit rows. Safe to run on a cron.
create or replace function jobsitev2_prune_rate_limits()
returns void
language sql
set search_path = public, pg_temp
as $$
  delete from jobsitev2_rate_limits where reset_at < now();
$$;
