/**
 * Daily spending cap. Uses Supabase (shared across all serverless instances)
 * when configured, else an in-memory per-instance counter. On any Supabase
 * error it **fails degraded** to the in-memory counter, so the site never goes
 * down — worst case the cap reverts to its old soft per-instance behavior.
 *
 * Last line of defense: if rate limiting is bypassed, this stops the financial
 * bleed. The authoritative check is `reserveSpend()`, which check-and-increments
 * ATOMICALLY (one locked Postgres call) so concurrent requests can't race past
 * the cap. `withinCap()` is a cheap read used only for an early, friendly reject
 * at the guard before any work is done.
 */
import { getSupabase } from "./supabase";

let dailySpend = { usd: 0, resetAt: getNextMidnightUTC() };

function getNextMidnightUTC(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function rollover() {
  if (Date.now() > dailySpend.resetAt) {
    dailySpend = { usd: 0, resetAt: getNextMidnightUTC() };
  }
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/** Configured cap (USD). Editable via Vercel env without a code change. */
export function spendCapUsd(): number {
  const v = Number(process.env.DAILY_SPEND_CAP_USD);
  return Number.isFinite(v) && v > 0 ? v : 40;
}

/** Cheap, non-authoritative read: would `costUsd` fit under today's cap right
 *  now? Used by the guard for an early 503 before doing any work. The real
 *  enforcement is the atomic `reserveSpend()`. */
export async function withinCap(costUsd: number): Promise<boolean> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("jobsitev2_daily_spend")
        .select("usd")
        .eq("day", todayUTC())
        .maybeSingle();
      if (error) throw error;
      return Number(data?.usd ?? 0) + costUsd <= spendCapUsd();
    } catch (err) {
      console.error("[spendCap] Supabase read failed, using in-memory:", err);
    }
  }
  rollover();
  return dailySpend.usd + costUsd <= spendCapUsd();
}

/**
 * Atomically reserve `costUsd` against today's cap. Returns true if it fit
 * under the cap (and was recorded), false if it would exceed it. The
 * check-and-increment is a single locked Postgres call, so N concurrent
 * requests can't all pass a stale "under cap" read and overshoot. Falls back to
 * the in-memory counter when Supabase isn't configured or errors.
 */
export async function reserveSpend(costUsd: number): Promise<boolean> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.rpc("jobsitev2_try_reserve_spend", {
        p_day: todayUTC(),
        p_cost: costUsd,
        p_cap: spendCapUsd(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return typeof row === "boolean" ? row : Boolean(row?.allowed ?? row);
    } catch (err) {
      console.error("[spendCap] Supabase reserve failed, using in-memory:", err);
    }
  }
  rollover();
  if (dailySpend.usd + costUsd > spendCapUsd()) return false;
  dailySpend.usd += costUsd;
  return true;
}

/** Next midnight UTC (when the cap resets). */
export function capResetAt(): number {
  rollover();
  return dailySpend.resetAt;
}
