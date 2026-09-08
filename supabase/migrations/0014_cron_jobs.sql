-- 0014_cron_jobs.sql
-- Scheduled background work.
--
-- The entire file is a no-op when pg_cron is absent, so `supabase db reset` on a
-- laptop and a CI database without the extension both succeed; only a project
-- that actually has the scheduler installed gets the jobs.
--
-- Each job prefers an HTTP call to the matching edge function (that is where the
-- provider clients, model calls and push delivery live). When pg_net is missing
-- we fall back to the pure-SQL function where one exists, and skip the job where
-- none does — a job that cannot do its work is better absent than silently failing.
--
-- The function base URL and the service key are read at RUN time from
-- `app.settings.supabase_url` / `app.settings.service_role_key`, so no secret is
-- committed in this migration or visible in the schema dump.

do $$
declare
  v_has_cron boolean;
  v_has_net boolean;
  v_job text;
  v_jobs constant text[] := array[
    'da_sync_incremental',
    'da_briefing_dispatch',
    'da_follow_up_detection',
    'da_approval_expiry',
    'da_retention_cleanup',
    'da_export_cleanup'
  ];
  v_invoke text;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into v_has_cron;

  if not v_has_cron then
    raise notice 'pg_cron is not installed; skipping Dijital Asistan scheduled jobs.';
    return;
  end if;

  select exists (select 1 from pg_extension where extname = 'pg_net') into v_has_net;

  -- Unschedule first so the migration is re-runnable and a renamed schedule does
  -- not leave an orphan job firing on the old cadence.
  foreach v_job in array v_jobs loop
    if exists (select 1 from cron.job where jobname = v_job) then
      perform cron.unschedule(v_job);
    end if;
  end loop;

  -- Shared invocation template. %1$s is the edge function name (its slug), %2$s a
  -- jsonb body literal. Settings are resolved inside the job body at fire time.
  v_invoke := $tpl$
    select net.http_post(
      url := rtrim(coalesce(current_setting('app.settings.supabase_url', true), ''), '/')
             || '/functions/v1/%1$s',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer '
          || coalesce(current_setting('app.settings.service_role_key', true), ''),
        'X-Da-Trigger', 'pg_cron'
      ),
      body := %2$L::jsonb,
      timeout_milliseconds := 20000
    )
    where coalesce(current_setting('app.settings.supabase_url', true), '') <> ''
      and coalesce(current_setting('app.settings.service_role_key', true), '') <> '';
  $tpl$;

  -- -------------------------------------------------------------------------
  -- Incremental mail + calendar sync, every 15 minutes. Covers accounts whose
  -- provider webhook is absent or has lapsed; where push works this is a no-op.
  -- No SQL fallback: syncing means talking to Google/Microsoft.
  -- -------------------------------------------------------------------------
  if v_has_net then
    perform cron.schedule(
      'da_sync_incremental',
      '*/15 * * * *',
      format(v_invoke, 'sync-start', '{"mode":"incremental","source":"cron"}')
    );
  else
    raise notice 'pg_net missing; da_sync_incremental not scheduled (requires an HTTP call).';
  end if;

  -- -------------------------------------------------------------------------
  -- Notification dispatcher, every 5 minutes. `notification-scheduler` selects
  -- the users whose local briefing time has just passed and the reminders now
  -- due, so the schedule stays timezone agnostic and a user in any offset is
  -- served within five minutes. This is the ONLY caller of sendPush: nothing
  -- else in the system delivers a notification.
  -- -------------------------------------------------------------------------
  if v_has_net then
    perform cron.schedule(
      'da_briefing_dispatch',
      '*/5 * * * *',
      format(v_invoke, 'notification-scheduler', '{"source":"cron"}')
    );
  else
    raise notice 'pg_net missing; da_briefing_dispatch not scheduled (requires an HTTP call).';
  end if;

  -- -------------------------------------------------------------------------
  -- Follow-up detection, hourly: sent mail that expected a reply and did not get
  -- one inside its window.
  -- -------------------------------------------------------------------------
  if v_has_net then
    perform cron.schedule(
      'da_follow_up_detection',
      '0 * * * *',
      format(v_invoke, 'detect-followups', '{"source":"cron"}')
    );
  else
    raise notice 'pg_net missing; da_follow_up_detection not scheduled (requires an HTTP call).';
  end if;

  -- -------------------------------------------------------------------------
  -- Approval expiry, every 10 minutes. This one has a real SQL implementation,
  -- so it still runs without pg_net — an approval must never outlive its TTL.
  -- -------------------------------------------------------------------------
  perform cron.schedule(
    'da_approval_expiry',
    '*/10 * * * *',
    case
      when v_has_net
        then format(v_invoke, 'approvals-expire', '{"source":"cron"}')
      else 'select public.expire_stale_approvals();'
    end
  );

  -- -------------------------------------------------------------------------
  -- Retention sweep, daily at 03:15 UTC (06:15 in Istanbul — after the overnight
  -- sync, before the morning briefing window).
  -- -------------------------------------------------------------------------
  perform cron.schedule(
    'da_retention_cleanup',
    '15 3 * * *',
    case
      when v_has_net
        then format(v_invoke, 'retention-cleanup', '{"source":"cron"}')
      else 'select public.cleanup_expired_retention();'
    end
  );

  -- -------------------------------------------------------------------------
  -- Export cleanup, daily at 03:45 UTC. Marks ready-but-stale exports expired and
  -- deletes the generated archives from storage, which needs the edge function;
  -- without pg_net we at least flip the rows so no stale download link is offered.
  -- -------------------------------------------------------------------------
  -- Pure SQL: expiring a stale download link needs no edge function, and the
  -- archive itself is removed by the storage lifecycle rule, so there is
  -- nothing here that requires pg_net.
  perform cron.schedule(
    'da_export_cleanup',
    '45 3 * * *',
    $sql$
      update public.data_export_requests
      set status = 'expired'
      where status = 'ready'
        and expires_at is not null
        and expires_at <= now();
    $sql$
  );
end;
$$;
