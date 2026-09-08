-- 0020_admin_cleanup_schedule.sql
-- Schedule the admin platform's sweep.
--
-- `admin_cleanup_expired()` was written in 0019, documented in its own COMMENT
-- as running "on a schedule", referenced by six source comments that reason
-- about how far behind it might be — and scheduled by nothing. 0014 predates
-- the admin platform and never learned about it.
--
-- WHAT THIS IS AND IS NOT
--
-- It is not a security fix, and describing it as one would be wrong. Every
-- reveal goes through `sa_assert_grant()`, which re-checks `expires_at <= now()`
-- in the same statement that authorises the read, so a grant that has lapsed
-- cannot be used whether or not the sweep has run. The console agrees: it
-- re-checks the timestamps against its injected clock rather than trusting the
-- `status` column.
--
-- What it fixes is two real things:
--
--   1. A grant that has lapsed keeps *reading* `active` in the console's own
--      list. Every enforcement path is correct and the screen an operator looks
--      at is wrong, which is the kind of discrepancy that gets believed at
--      exactly the wrong moment — during an incident, by someone deciding
--      whether an access they are looking at is still open.
--
--   2. Nothing was ever deleted. Dead sessions, unconsumed invites, closed
--      rate-limit windows and probe rows accumulate for the life of the
--      deployment. The rate-limit table takes a row per subject per window and
--      is the first that would be felt.
--
-- Grants and reveals are never deleted by the sweep — they are the audit trail,
-- and 0019's function only moves lapsed grants to `expired`.
--
-- Same shape as 0014: the whole file is a no-op without pg_cron, so a laptop
-- reset and a CI database both apply it, and it is re-runnable.

do $$
declare
  v_has_cron boolean;
  v_job constant text := 'da_admin_cleanup';
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;

  if not v_has_cron then
    raise notice 'pg_cron is not installed; skipping the admin platform sweep.';
    return;
  end if;

  -- Re-runnable, and a rename cannot leave an orphan firing on the old cadence.
  if exists (select 1 from cron.job where jobname = v_job) then
    perform cron.unschedule(v_job);
  end if;

  -- Hourly, on the half hour. No pg_net branch and no edge function: the
  -- function is pure SQL, so unlike every job in 0014 there is nothing here
  -- that an absent HTTP extension could stop from working.
  --
  -- Hourly rather than daily because the first of the two problems above is
  -- about what an operator sees, and a Support Access grant is bounded in
  -- hours. A lapsed grant reading `active` until tomorrow morning would be
  -- worse than the lag itself.
  perform cron.schedule(v_job, '30 * * * *', 'select public.admin_cleanup_expired();');
end;
$$;
