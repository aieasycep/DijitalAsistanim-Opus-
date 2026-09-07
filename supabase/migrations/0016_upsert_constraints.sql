-- Uniqueness the edge functions upsert on.
--
-- Each of these turns an "insert if absent" into a single atomic statement.
-- Without them a retry after a partial failure — which is the normal case for
-- a sync that timed out mid-page — would duplicate rows rather than converge.

-- A sent message is watched for a reply exactly once.
create unique index if not exists follow_ups_user_thread_message_key
  on public.follow_ups (user_id, thread_id, message_id);

-- One connection per provider account, so reconnecting updates rather than
-- stacking a second row for the same mailbox.
create unique index if not exists connected_accounts_user_provider_external_key
  on public.connected_accounts (user_id, provider, external_account_id);

-- One VIP entry per address.
create unique index if not exists vip_people_user_email_key
  on public.vip_people (user_id, lower(email));

-- One insight per source per day: regenerating a day's feed must replace, not
-- append.
create unique index if not exists insights_user_source_date_key
  on public.insights (user_id, source_type, source_id, for_date)
  where source_id is not null;

-- One life event per source record.
create unique index if not exists life_events_user_source_key
  on public.life_events (user_id, source_type, source_id, type);

-- One reminder per (entity, time), so a double tap does not schedule twice.
create unique index if not exists reminders_user_entity_time_key
  on public.reminders (user_id, related_entity_type, related_entity_id, remind_at)
  where related_entity_id is not null;

-- One commitment per quoted sentence per source: the extractor re-reads the
-- same message on a resync and must not clone what it already found.
create unique index if not exists commitments_user_source_quote_key
  on public.commitments (user_id, source_type, source_id, md5(source_quote));
