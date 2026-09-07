-- seed/demo-fixtures.sql
-- The deterministic Turkish demo dataset used by the local stack, the simulator
-- build and the App Store review account.
--
-- Two guards keep it out of production:
--   1. the whole file is a no-op unless app.settings.environment is 'local' or 'demo';
--   2. every row hangs off one fixed demo user id, and the run starts by deleting
--      that user, so replaying the seed is idempotent and never touches real data.
--
-- Timestamps are relative to `demo_now` (app.settings.demo_now, falling back to
-- now()), so screenshots taken a year apart still show "yarın 14:00" rather than a
-- calendar full of past events.
--
-- ANTI-HALLUCINATION INVARIANT: every AI-derived row here — commitments, life
-- events, thread deadlines, briefing items — carries a source_quote that is a
-- literal substring of the email body it came from. The quotes are built by
-- concatenating the very same variables the bodies are built from, so the demo
-- data cannot drift out of that rule even as the dates move.

do $demo$
declare
  v_env text := coalesce(current_setting('app.settings.environment', true), '');

  v_now timestamptz;
  v_tz constant text := 'Europe/Istanbul';
  v_today date;

  -- Fixed identifiers, so a screenshot, a deep link and an integration test all
  -- refer to the same rows across resets.
  u_user constant uuid := '11111111-1111-4111-8111-111111111111';
  u_account constant uuid := '22222222-2222-4222-8222-222222222201';
  u_sync_mail constant uuid := '22222222-2222-4222-8222-222222222211';
  u_sync_cal constant uuid := '22222222-2222-4222-8222-222222222212';

  u_contact_ahmet constant uuid := '33333333-3333-4333-8333-333333333301';
  u_contact_mehmet constant uuid := '33333333-3333-4333-8333-333333333302';
  u_vip_mehmet constant uuid := '33333333-3333-4333-8333-333333333312';

  u_thread_teklif constant uuid := '44444444-4444-4444-8444-444444444401';
  u_thread_butce constant uuid := '44444444-4444-4444-8444-444444444402';
  u_thread_kargo constant uuid := '44444444-4444-4444-8444-444444444403';
  u_thread_ucus constant uuid := '44444444-4444-4444-8444-444444444404';
  u_thread_odeme constant uuid := '44444444-4444-4444-8444-444444444405';
  u_thread_abonelik constant uuid := '44444444-4444-4444-8444-444444444406';
  u_thread_guvenlik constant uuid := '44444444-4444-4444-8444-444444444407';

  u_msg_teklif_in constant uuid := '55555555-5555-4555-8555-555555555501';
  u_msg_teklif_out constant uuid := '55555555-5555-4555-8555-555555555502';
  u_msg_butce_out constant uuid := '55555555-5555-4555-8555-555555555503';
  u_msg_kargo constant uuid := '55555555-5555-4555-8555-555555555504';
  u_msg_ucus constant uuid := '55555555-5555-4555-8555-555555555505';
  u_msg_odeme constant uuid := '55555555-5555-4555-8555-555555555506';
  u_msg_abonelik constant uuid := '55555555-5555-4555-8555-555555555507';
  u_msg_guvenlik constant uuid := '55555555-5555-4555-8555-555555555508';

  u_event_strateji constant uuid := '66666666-6666-4666-8666-666666666601';

  u_life_kargo constant uuid := '77777777-7777-4777-8777-777777777701';
  u_life_ucus constant uuid := '77777777-7777-4777-8777-777777777702';
  u_life_odeme constant uuid := '77777777-7777-4777-8777-777777777703';
  u_life_abonelik constant uuid := '77777777-7777-4777-8777-777777777704';
  u_life_guvenlik constant uuid := '77777777-7777-4777-8777-777777777705';

  u_briefing constant uuid := '88888888-8888-4888-8888-888888888801';
  u_approval_mail constant uuid := '99999999-9999-4999-8999-999999999901';
  u_approval_event constant uuid := '99999999-9999-4999-8999-999999999902';
  u_commitment constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
  u_follow_up constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
  u_task constant uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc01';

  -- Derived moments.
  v_deadline timestamptz;
  v_meet_start timestamptz;
  v_meet_end timestamptz;
  v_kargo_teslim timestamptz;
  v_ucus_kalkis timestamptz;
  v_odeme_son timestamptz;
  v_abonelik_yenileme timestamptz;
  v_guvenlik_giris timestamptz;
  v_butce_sent timestamptz;
  v_block_start timestamptz;
  v_block_end timestamptz;
  v_password_hash text;
  v_pgcrypto_schema text;

  -- Quotes. Each one is spliced into the body below, so it is a literal substring
  -- by construction rather than by careful copy-paste.
  q_teklif text;
  q_taahhut constant text :=
    'Cuma günü revize teklifi göndereceğim.';
  q_kargo text;
  q_ucus text;
  q_odeme text;
  q_abonelik text;
  q_guvenlik text;

  b_teklif_in text;
  b_teklif_out text;
  b_butce_out text;
  b_kargo text;
  b_ucus text;
  b_odeme text;
  b_abonelik text;
  b_guvenlik text;
begin
  if v_env not in ('local', 'demo') then
    raise notice
      'demo fixtures skipped: app.settings.environment is %, expected local or demo',
      coalesce(nullif(v_env, ''), '(unset)');
    return;
  end if;

  v_now := coalesce(
    nullif(current_setting('app.settings.demo_now', true), '')::timestamptz,
    now()
  );
  v_today := (v_now at time zone v_tz)::date;

  v_deadline := ((v_today + 2) + time '17:00') at time zone v_tz;
  v_meet_start := ((v_today + 1) + time '14:00') at time zone v_tz;
  v_meet_end := v_meet_start + interval '1 hour';
  v_kargo_teslim := ((v_today + 1) + time '18:00') at time zone v_tz;
  v_ucus_kalkis := ((v_today + 9) + time '08:45') at time zone v_tz;
  v_odeme_son := ((v_today + 4) + time '23:59') at time zone v_tz;
  v_abonelik_yenileme := ((v_today + 6) + time '09:00') at time zone v_tz;
  v_guvenlik_giris := v_now - interval '3 hours';
  v_butce_sent := v_now - interval '4 days';
  v_block_start := (v_today + time '15:00') at time zone v_tz;
  v_block_end := v_block_start + interval '2 hours';

  -- Fixed bcrypt salt so the demo credentials are byte-identical on every reset.
  -- Dynamic and schema-resolved, because pgcrypto lives in `extensions` on Supabase
  -- and may be absent entirely elsewhere. The password is a local fixture, never a
  -- production secret: this user only exists where environment is local or demo.
  select n.nspname
  into v_pgcrypto_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_pgcrypto_schema is not null then
    execute format(
      'select %I.crypt(''demo1234'', ''$2a$10$demoseeddemoseeddemose'')',
      v_pgcrypto_schema
    )
    into v_password_hash;
  else
    v_password_hash := '';
    raise notice 'pgcrypto missing: demo user created without a usable password.';
  end if;

  -- ---------------------------------------------------------------------
  -- Bodies and the quotes drawn from them.
  -- ---------------------------------------------------------------------

  q_teklif := format(
    'Revize teklifi %s tarihinde saat 17:00 itibarıyla bekliyoruz.',
    to_char(v_deadline at time zone v_tz, 'DD.MM.YYYY')
  );

  b_teklif_in :=
    'Merhaba,' || chr(10) || chr(10)
    || 'Görüşmemizin ardından teklifi ekibimizle değerlendirdik. Genel çerçeveyi '
    || 'beğendik, yalnızca fiyat kalemlerinde bir güncelleme rica edeceğiz.'
    || chr(10) || chr(10)
    || q_teklif
    || chr(10) || chr(10)
    || 'Bir değişiklik olursa lütfen bize de not düş.' || chr(10) || chr(10)
    || 'Teşekkürler,' || chr(10) || 'Ahmet Yılmaz' || chr(10) || 'Örnek Firma';

  b_teklif_out :=
    'Merhaba Ahmet,' || chr(10) || chr(10)
    || q_taahhut || ' Fiyat kalemlerini bugün ekiple netleştiriyoruz.'
    || chr(10) || chr(10)
    || 'İyi çalışmalar.';

  b_butce_out :=
    'Merhaba Mehmet,' || chr(10) || chr(10)
    || 'Yeni dönem bütçesi için onayını bekliyorum. Uygun olduğunda dönebilir misin?'
    || chr(10) || chr(10)
    || 'Teşekkürler.';

  q_kargo := format(
    'Gönderinizin takip numarası 7391045526, tahmini teslim tarihi %s.',
    to_char(v_kargo_teslim at time zone v_tz, 'DD.MM.YYYY')
  );

  b_kargo :=
    'Sayın müşterimiz,' || chr(10) || chr(10)
    || 'Siparişiniz kargoya verildi. ' || q_kargo
    || chr(10) || chr(10)
    || 'Gönderinizi takip numarası ile izleyebilirsiniz.' || chr(10) || chr(10)
    || 'Hızlı Kargo';

  q_ucus := format(
    'TK2012 sefer numaralı uçuşunuz %s tarihinde saat 08:45 kalkışlıdır, rezervasyon kodunuz JHKR4M.',
    to_char(v_ucus_kalkis at time zone v_tz, 'DD.MM.YYYY')
  );

  b_ucus :=
    'Sayın yolcumuz,' || chr(10) || chr(10)
    || 'Biletiniz düzenlenmiştir. ' || q_ucus
    || chr(10) || chr(10)
    || 'Online check-in kalkıştan 24 saat önce açılır.' || chr(10) || chr(10)
    || 'Uçuş Rezervasyon';

  q_odeme := format(
    'Son ödeme tarihi %s olan 1480,00 TL tutarındaki faturanız hazırlanmıştır.',
    to_char(v_odeme_son at time zone v_tz, 'DD.MM.YYYY')
  );

  b_odeme :=
    'Sayın müşterimiz,' || chr(10) || chr(10)
    || q_odeme
    || chr(10) || chr(10)
    || 'Fatura detayına hesabınızdan ulaşabilirsiniz.' || chr(10) || chr(10)
    || 'Elektrik Dağıtım';

  q_abonelik := format(
    'Aboneliğiniz %s tarihinde 229,00 TL olarak yenilenecektir.',
    to_char(v_abonelik_yenileme at time zone v_tz, 'DD.MM.YYYY')
  );

  b_abonelik :=
    'Merhaba,' || chr(10) || chr(10)
    || q_abonelik
    || chr(10) || chr(10)
    || 'Planını hesap ayarlarından değiştirebilirsin.' || chr(10) || chr(10)
    || 'Bulut Depolama';

  q_guvenlik := format(
    'Hesabınıza %s tarihinde saat %s civarında yeni bir cihazdan giriş yapıldı.',
    to_char(v_guvenlik_giris at time zone v_tz, 'DD.MM.YYYY'),
    to_char(v_guvenlik_giris at time zone v_tz, 'HH24:MI')
  );

  b_guvenlik :=
    'Merhaba,' || chr(10) || chr(10)
    || q_guvenlik
    || chr(10) || chr(10)
    || 'Bu giriş sana ait değilse şifreni hemen değiştir.' || chr(10) || chr(10)
    || 'Hesap Güvenliği';

  -- ---------------------------------------------------------------------
  -- Reset. Deleting the auth user cascades through every public table, so the
  -- seed is replayable without accumulating stale rows.
  -- ---------------------------------------------------------------------

  delete from auth.users where id = u_user;

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    created_at,
    updated_at
  )
  values (
    u_user,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'demo@dijitalasistan.app',
    v_password_hash,
    v_now - interval '30 days',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Demo Kullanıcı"}'::jsonb,
    '',
    '',
    '',
    '',
    v_now - interval '30 days',
    v_now
  );

  -- handle_new_user() has already created the profile, preferences, notification
  -- preferences, subscription and referral code. Shape them into the demo state.

  update public.profiles
  set display_name = 'Demo Kullanıcı',
      given_name = 'Demo',
      time_zone = v_tz,
      locale = 'tr',
      onboarding_completed_at = v_now - interval '29 days'
  where id = u_user;

  update public.user_preferences
  set morning_briefing_time = '07:30',
      midday_pulse_time = '13:00',
      evening_close_time = '20:30',
      weekly_review_weekday = 0,
      retention_window = '90d',
      history_days = 90
  where user_id = u_user;

  update public.notification_preferences
  set categories = jsonb_build_object(
        'morning_briefing', true,
        'critical_email', true,
        'meeting', true,
        'deadline', true,
        'approval', true,
        'life_event', true
      ),
      lock_screen_privacy = 'title_only'
  where user_id = u_user;

  update public.subscriptions
  set status = 'trialing',
      entitlement = 'pro',
      product_id = 'da_pro_monthly',
      store = 'promotional',
      trial_ends_at = v_now + interval '7 days',
      current_period_end = v_now + interval '7 days'
  where user_id = u_user;

  -- ---------------------------------------------------------------------
  -- Connection and sync state. Provider is 'demo': nothing here ever calls out.
  -- ---------------------------------------------------------------------

  insert into public.connected_accounts (
    id, user_id, provider, kinds, external_account_id, display_name, email,
    status, granted_scopes, last_synced_at, is_primary, created_at, updated_at
  )
  values (
    u_account, u_user, 'demo', array['mail', 'calendar']::account_kind[],
    'demo-account-1', 'Demo Posta', 'demo@dijitalasistan.app',
    'connected', array['demo.mail.read', 'demo.calendar.read'],
    v_now - interval '12 minutes', true, v_now - interval '29 days', v_now
  );

  insert into public.sync_states (
    id, user_id, connected_account_id, resource, status, cursor,
    backfill_completed_at, last_run_at, next_run_at, created_at, updated_at
  )
  values
    (
      u_sync_mail, u_user, u_account, 'mail', 'idle', 'demo-cursor-mail-42',
      v_now - interval '28 days', v_now - interval '12 minutes',
      v_now + interval '3 minutes', v_now - interval '29 days', v_now
    ),
    (
      u_sync_cal, u_user, u_account, 'calendar', 'idle', 'demo-cursor-cal-17',
      v_now - interval '28 days', v_now - interval '12 minutes',
      v_now + interval '3 minutes', v_now - interval '29 days', v_now
    );

  -- ---------------------------------------------------------------------
  -- People. Mehmet is the VIP; Ahmet is the counterparty on the open deadline.
  -- ---------------------------------------------------------------------

  insert into public.contacts (
    id, user_id, email, name, company, role, last_contact_at,
    interaction_count, is_vip, vip_set_at, created_at, updated_at
  )
  values
    (
      u_contact_ahmet, u_user, 'ahmet.yilmaz@ornekfirma.com', 'Ahmet Yılmaz',
      'Örnek Firma', 'Satın Alma Müdürü', v_now - interval '5 hours',
      18, false, null, v_now - interval '200 days', v_now
    ),
    (
      u_contact_mehmet, u_user, 'mehmet@baskafirma.com', 'Mehmet Yılmaz',
      'Başka Firma', 'Genel Müdür', v_butce_sent,
      64, true, v_now - interval '120 days', v_now - interval '400 days', v_now
    );

  insert into public.vip_people (
    id, user_id, contact_id, email, name, added_at, created_at, updated_at
  )
  values (
    u_vip_mehmet, u_user, u_contact_mehmet, 'mehmet@baskafirma.com',
    'Mehmet Yılmaz', v_now - interval '120 days', v_now - interval '120 days', v_now
  );

  -- ---------------------------------------------------------------------
  -- Mail. deadline_quote / life event quotes are all substrings of the bodies.
  -- ---------------------------------------------------------------------

  insert into public.email_threads (
    id, user_id, connected_account_id, external_thread_id, subject,
    participant_emails, last_message_at, message_count, is_read, importance,
    category, summary, reason_important, requires_user_action, deadline,
    deadline_quote, confidence, priority_score, created_at, updated_at
  )
  values
    (
      u_thread_teklif, u_user, u_account, 'demo-thread-teklif', 'Revize teklif',
      array['ahmet.yilmaz@ornekfirma.com', 'demo@dijitalasistan.app'],
      v_now - interval '5 hours', 2, true, 'high', 'deadline',
      'Ahmet Yılmaz fiyat kalemleri güncellenmiş teklifi bekliyor.',
      'Tarihli bir iş taahhüdü var ve süre iki gün.',
      true, v_deadline, q_teklif, 0.92, 86.5,
      v_now - interval '1 day', v_now
    ),
    (
      u_thread_butce, u_user, u_account, 'demo-thread-butce', 'Bütçe onayı',
      array['mehmet@baskafirma.com', 'demo@dijitalasistan.app'],
      v_butce_sent, 1, true, 'high', 'waiting_for_other',
      'Mehmet Yılmaz''a gönderdiğin bütçe onayı isteği yanıtsız.',
      'VIP listendeki bir kişiden dört gündür yanıt yok.',
      false, null, null, 0.88, 72.0,
      v_butce_sent, v_now
    ),
    (
      u_thread_kargo, u_user, u_account, 'demo-thread-kargo', 'Kargonuz yola çıktı',
      array['bildirim@hizlikargo.com', 'demo@dijitalasistan.app'],
      v_now - interval '8 hours', 1, false, 'normal', 'shipment',
      'Siparişin kargoya verildi.', null, false, null, null, 0.95, 41.0,
      v_now - interval '8 hours', v_now
    ),
    (
      u_thread_ucus, u_user, u_account, 'demo-thread-ucus', 'Bilet onayı TK2012',
      array['bilet@ucusrezervasyon.com', 'demo@dijitalasistan.app'],
      v_now - interval '2 days', 1, true, 'normal', 'travel',
      'İstanbul çıkışlı uçuş bileti onaylandı.', null, false, null, null, 0.94, 38.0,
      v_now - interval '2 days', v_now
    ),
    (
      u_thread_odeme, u_user, u_account, 'demo-thread-odeme', 'Faturanız hazır',
      array['fatura@elektrikdagitim.com', 'demo@dijitalasistan.app'],
      v_now - interval '1 day', 1, false, 'high', 'payment',
      'Elektrik faturasının son ödeme tarihi yaklaşıyor.',
      'Son ödeme tarihi dört gün içinde.', false, null, null, 0.93, 64.0,
      v_now - interval '1 day', v_now
    ),
    (
      u_thread_abonelik, u_user, u_account, 'demo-thread-abonelik',
      'Abonelik yenileme bilgisi',
      array['destek@bulutdepolama.com', 'demo@dijitalasistan.app'],
      v_now - interval '18 hours', 1, false, 'low', 'subscription',
      'Bulut depolama aboneliğin yenilenecek.', null, false, null, null, 0.91, 22.0,
      v_now - interval '18 hours', v_now
    ),
    (
      u_thread_guvenlik, u_user, u_account, 'demo-thread-guvenlik',
      'Yeni cihaz girişi',
      array['guvenlik@hesapguvenligi.com', 'demo@dijitalasistan.app'],
      v_guvenlik_giris, 1, false, 'critical', 'security',
      'Hesabına tanımadığın bir cihazdan giriş yapıldı.',
      'Güvenlik uyarıları her zaman kritik olarak işaretlenir.',
      true, null, null, 0.97, 98.0,
      v_guvenlik_giris, v_now
    );

  insert into public.email_messages (
    id, user_id, thread_id, connected_account_id, external_message_id,
    from_email, from_name, to_emails, subject, snippet, body_text, sent_at,
    is_from_user, content_hash, created_at, updated_at
  )
  values
    (
      u_msg_teklif_in, u_user, u_thread_teklif, u_account, 'demo-msg-teklif-1',
      'ahmet.yilmaz@ornekfirma.com', 'Ahmet Yılmaz',
      array['demo@dijitalasistan.app'], 'Revize teklif',
      left(q_teklif, 120), b_teklif_in, v_now - interval '1 day',
      false, md5(b_teklif_in), v_now - interval '1 day', v_now
    ),
    (
      u_msg_teklif_out, u_user, u_thread_teklif, u_account, 'demo-msg-teklif-2',
      'demo@dijitalasistan.app', 'Demo Kullanıcı',
      array['ahmet.yilmaz@ornekfirma.com'], 'Re: Revize teklif',
      left(q_taahhut, 120), b_teklif_out, v_now - interval '5 hours',
      true, md5(b_teklif_out), v_now - interval '5 hours', v_now
    ),
    (
      u_msg_butce_out, u_user, u_thread_butce, u_account, 'demo-msg-butce-1',
      'demo@dijitalasistan.app', 'Demo Kullanıcı',
      array['mehmet@baskafirma.com'], 'Bütçe onayı',
      'Yeni dönem bütçesi için onayını bekliyorum.', b_butce_out, v_butce_sent,
      true, md5(b_butce_out), v_butce_sent, v_now
    ),
    (
      u_msg_kargo, u_user, u_thread_kargo, u_account, 'demo-msg-kargo-1',
      'bildirim@hizlikargo.com', 'Hızlı Kargo',
      array['demo@dijitalasistan.app'], 'Kargonuz yola çıktı',
      left(q_kargo, 120), b_kargo, v_now - interval '8 hours',
      false, md5(b_kargo), v_now - interval '8 hours', v_now
    ),
    (
      u_msg_ucus, u_user, u_thread_ucus, u_account, 'demo-msg-ucus-1',
      'bilet@ucusrezervasyon.com', 'Uçuş Rezervasyon',
      array['demo@dijitalasistan.app'], 'Bilet onayı TK2012',
      left(q_ucus, 120), b_ucus, v_now - interval '2 days',
      false, md5(b_ucus), v_now - interval '2 days', v_now
    ),
    (
      u_msg_odeme, u_user, u_thread_odeme, u_account, 'demo-msg-odeme-1',
      'fatura@elektrikdagitim.com', 'Elektrik Dağıtım',
      array['demo@dijitalasistan.app'], 'Faturanız hazır',
      left(q_odeme, 120), b_odeme, v_now - interval '1 day',
      false, md5(b_odeme), v_now - interval '1 day', v_now
    ),
    (
      u_msg_abonelik, u_user, u_thread_abonelik, u_account, 'demo-msg-abonelik-1',
      'destek@bulutdepolama.com', 'Bulut Depolama',
      array['demo@dijitalasistan.app'], 'Abonelik yenileme bilgisi',
      left(q_abonelik, 120), b_abonelik, v_now - interval '18 hours',
      false, md5(b_abonelik), v_now - interval '18 hours', v_now
    ),
    (
      u_msg_guvenlik, u_user, u_thread_guvenlik, u_account, 'demo-msg-guvenlik-1',
      'guvenlik@hesapguvenligi.com', 'Hesap Güvenliği',
      array['demo@dijitalasistan.app'], 'Yeni cihaz girişi',
      left(q_guvenlik, 120), b_guvenlik, v_guvenlik_giris,
      false, md5(b_guvenlik), v_guvenlik_giris, v_now
    );

  -- ---------------------------------------------------------------------
  -- Calendar: tomorrow 14:00 Europe/Istanbul with a Meet link.
  -- ---------------------------------------------------------------------

  insert into public.calendar_events (
    id, user_id, connected_account_id, external_event_id, provider, title,
    description, location, starts_at, ends_at, is_all_day, time_zone, attendees,
    organizer_email, conference_url, status, provider_updated_at,
    created_at, updated_at
  )
  values (
    u_event_strateji, u_user, u_account, 'demo-event-strateji', 'demo',
    'Ürün stratejisi',
    'Çeyrek planı ve fiyat kalemleri.',
    'Google Meet',
    v_meet_start, v_meet_end, false, v_tz,
    jsonb_build_array(
      jsonb_build_object(
        'email', 'demo@dijitalasistan.app',
        'name', 'Demo Kullanıcı',
        'responseStatus', 'accepted',
        'isOrganizer', true
      ),
      jsonb_build_object(
        'email', 'ahmet.yilmaz@ornekfirma.com',
        'name', 'Ahmet Yılmaz',
        'responseStatus', 'accepted',
        'isOrganizer', false
      ),
      jsonb_build_object(
        'email', 'mehmet@baskafirma.com',
        'name', 'Mehmet Yılmaz',
        'responseStatus', 'tentative',
        'isOrganizer', false
      )
    ),
    'demo@dijitalasistan.app',
    'https://meet.google.com/qtn-mvbs-ryp',
    'confirmed', v_now - interval '1 day', v_now - interval '6 days', v_now
  );

  -- ---------------------------------------------------------------------
  -- Life events. Amounts and references are copied verbatim from the quote.
  -- ---------------------------------------------------------------------

  insert into public.life_events (
    id, user_id, type, title, detail, occurs_at, amount_value, amount_currency,
    reference, tracking_url, source_type, source_id, source_quote, confidence,
    status, created_at, updated_at
  )
  values
    (
      u_life_kargo, u_user, 'shipment', 'Kargon yolda',
      'Hızlı Kargo gönderisi teslimata çıktı.', v_kargo_teslim,
      null, null, '7391045526', 'https://demo.hizlikargo.com/takip/7391045526',
      'email', u_msg_kargo::text, q_kargo, 0.95, 'active',
      v_now - interval '8 hours', v_now
    ),
    (
      u_life_ucus, u_user, 'flight', 'TK2012 uçuşu',
      'Rezervasyon onaylandı.', v_ucus_kalkis,
      null, null, 'JHKR4M', null,
      'email', u_msg_ucus::text, q_ucus, 0.94, 'active',
      v_now - interval '2 days', v_now
    ),
    (
      u_life_odeme, u_user, 'payment', 'Elektrik faturası',
      'Son ödeme tarihi yaklaşıyor.', v_odeme_son,
      1480.00, 'TRY', null, null,
      'email', u_msg_odeme::text, q_odeme, 0.93, 'active',
      v_now - interval '1 day', v_now
    ),
    (
      u_life_abonelik, u_user, 'subscription', 'Bulut depolama yenilemesi',
      'Abonelik otomatik yenilenecek.', v_abonelik_yenileme,
      229.00, 'TRY', null, null,
      'email', u_msg_abonelik::text, q_abonelik, 0.91, 'active',
      v_now - interval '18 hours', v_now
    ),
    (
      u_life_guvenlik, u_user, 'security', 'Yeni cihaz girişi',
      'Tanımadığın bir cihazdan giriş yapıldı.', v_guvenlik_giris,
      null, null, null, null,
      'email', u_msg_guvenlik::text, q_guvenlik, 0.97, 'active',
      v_guvenlik_giris, v_now
    );

  -- ---------------------------------------------------------------------
  -- Commitment and follow-up.
  -- ---------------------------------------------------------------------

  insert into public.commitments (
    id, user_id, "text", direction, person_id, person_name, due_at, status,
    source_type, source_id, source_quote, confidence, confirmed_by_user,
    created_at, updated_at
  )
  values (
    u_commitment, u_user, 'Cuma günü revize teklifi göndereceğim', 'user_owes',
    u_contact_ahmet, 'Ahmet Yılmaz', v_deadline, 'open',
    'email', u_msg_teklif_out::text, q_taahhut, 0.9, false,
    v_now - interval '5 hours', v_now
  );

  insert into public.follow_ups (
    id, user_id, thread_id, message_id, recipient_email, recipient_name,
    sent_at, due_at, status, dismiss_count, created_at, updated_at
  )
  values (
    u_follow_up, u_user, u_thread_butce, u_msg_butce_out::text,
    'mehmet@baskafirma.com', 'Mehmet Yılmaz',
    v_butce_sent, v_butce_sent + interval '2 days', 'waiting', 0,
    v_butce_sent, v_now
  );

  insert into public.tasks (
    id, user_id, provider, title, notes, due_at, status,
    source_type, source_id, created_at, updated_at
  )
  values (
    u_task, u_user, 'device', 'Revize teklifi hazırla',
    'Fiyat kalemlerini güncelle ve Ahmet Yılmaz''a gönder.',
    v_deadline - interval '4 hours', 'open',
    'email', u_thread_teklif::text, v_now - interval '5 hours', v_now
  );

  -- ---------------------------------------------------------------------
  -- Rules the user set, and one inference they can revoke.
  -- ---------------------------------------------------------------------

  insert into public.priority_rules (
    id, user_id, kind, match_value, enabled, note, created_at, updated_at
  )
  values
    (
      'dddddddd-dddd-4ddd-8ddd-dddddddddd01', u_user, 'domain_always_important',
      'ornekfirma.com', true, 'Aktif müşteri.', v_now - interval '40 days', v_now
    ),
    (
      'dddddddd-dddd-4ddd-8ddd-dddddddddd02', u_user, 'vip_always_notify',
      'mehmet@baskafirma.com', true, null, v_now - interval '120 days', v_now
    );

  insert into public.learned_preferences (
    id, user_id, statement, kind, match_value, strength, observation_count,
    enabled, last_observed_at, created_at, updated_at
  )
  values (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd11', u_user,
    'Örnek Firma''dan gelen teklif e-postalarını hep aynı gün yanıtlıyorsun.',
    'domain_always_important', 'ornekfirma.com', 0.78, 11, true,
    v_now - interval '5 hours', v_now - interval '60 days', v_now
  );

  -- ---------------------------------------------------------------------
  -- Today's cards.
  -- ---------------------------------------------------------------------

  insert into public.insights (
    id, user_id, title, detail, importance, category, source_type, source_id,
    source_label, reason_important, actions, due_at, priority_score, for_date,
    confidence, created_at, updated_at
  )
  values
    (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01', u_user,
      'Revize teklif iki gün içinde',
      'Ahmet Yılmaz güncellenmiş fiyat kalemlerini bekliyor.',
      'high', 'deadline', 'email', u_thread_teklif::text, 'Revize teklif',
      'Verdiğin sözün süresi doluyor.',
      jsonb_build_array(
        jsonb_build_object('kind', 'draft_reply', 'label', 'Yanıt taslağı hazırla'),
        jsonb_build_object('kind', 'snooze', 'label', 'Yarın sabah hatırlat')
      ),
      v_deadline, 86.5, v_today, 0.92, v_now - interval '1 day', v_now
    ),
    (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02', u_user,
      'Mehmet Yılmaz dört gündür yanıt vermedi',
      'Bütçe onayı isteğin yanıtsız duruyor.',
      'high', 'follow_up', 'email', u_thread_butce::text, 'Bütçe onayı',
      'VIP listendeki bir kişiden bekliyorsun.',
      jsonb_build_array(
        jsonb_build_object('kind', 'draft_nudge', 'label', 'Nazik hatırlatma yaz')
      ),
      null, 72.0, v_today, 0.88, v_butce_sent, v_now
    ),
    (
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeee03', u_user,
      'Yeni cihaz girişi',
      'Tanımadığın bir cihazdan hesabına giriş yapıldı.',
      'critical', 'security', 'email', u_thread_guvenlik::text, 'Yeni cihaz girişi',
      'Güvenlik uyarıları her zaman öne çıkar.',
      '[]'::jsonb, null, 98.0, v_today, 0.97, v_guvenlik_giris, v_now
    );

  -- ---------------------------------------------------------------------
  -- Morning briefing, one item per section. The narrative is written only from
  -- these items, so every sentence in it traces back to a stored source.
  -- ---------------------------------------------------------------------

  insert into public.briefings (
    id, user_id, kind, status, for_date, headline, narrative, duration_seconds,
    generated_at, content_hash, stats, created_at, updated_at
  )
  values (
    u_briefing, u_user, 'morning', 'ready', v_today,
    'Günün tek gerçek işi: revize teklif.',
    'Günaydın. Bugün seni bekleyen tek ağır iş var: Ahmet Yılmaz''ın istediği revize '
    || 'teklif. Süre iki gün, ama sen Cuma dedin; bu yüzden bugün başlaman rahat eder. '
    || chr(10) || chr(10)
    || 'Takvimde yarın saat 14:00''te Ürün stratejisi toplantısı görünüyor, bugün '
    || 'boşsun. Fiyat kalemlerini o toplantıdan önce netleştirirsen ikisi birbirini '
    || 'besler.' || chr(10) || chr(10)
    || 'Mehmet Yılmaz dört gündür bütçe onayına dönmedi. İstersen kısa bir hatırlatma '
    || 'hazırlayayım, göndermeden önce sana gösteririm.' || chr(10) || chr(10)
    || 'Bir de dün gece hesabına tanımadığın bir cihazdan giriş yapılmış. Önce ona bak.',
    96,
    v_now - interval '2 hours',
    md5('demo-briefing-' || v_today::text),
    jsonb_build_object(
      'emailsScanned', 42,
      'importantCount', 3,
      'meetingsCount', 1,
      'commitmentsDue', 1,
      'minutesSaved', 24
    ),
    v_now - interval '2 hours', v_now
  );

  insert into public.briefing_items (
    id, user_id, briefing_id, section, "position", title, detail,
    source_type, source_id, source_label, related_entity_type, related_entity_id,
    importance, created_at, updated_at
  )
  values
    (
      'ffffffff-ffff-4fff-8fff-ffffffffff01', u_user, u_briefing, 'priorities', 0,
      'Revize teklif', 'Ahmet Yılmaz güncellenmiş fiyat kalemlerini bekliyor.',
      'email', u_thread_teklif::text, 'Revize teklif',
      'email', u_thread_teklif::text, 'high', v_now - interval '2 hours', v_now
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffffff02', u_user, u_briefing, 'schedule', 0,
      'Ürün stratejisi', 'Yarın 14:00, Google Meet üzerinden.',
      'calendar_event', u_event_strateji::text, 'Ürün stratejisi',
      'calendar_event', u_event_strateji::text, 'normal',
      v_now - interval '2 hours', v_now
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffffff03', u_user, u_briefing,
      'expected_from_you', 0,
      'Cuma günü revize teklifi göndereceğim', 'Ahmet Yılmaz''a verdiğin söz.',
      'commitment', u_commitment::text, 'Revize teklif taahhüdü',
      'commitment', u_commitment::text, 'high', v_now - interval '2 hours', v_now
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffffff04', u_user, u_briefing,
      'waiting_on_others', 0,
      'Mehmet Yılmaz', 'Bütçe onayı dört gündür yanıtsız.',
      'email', u_thread_butce::text, 'Bütçe onayı',
      'email', u_thread_butce::text, 'high', v_now - interval '2 hours', v_now
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffffff05', u_user, u_briefing, 'deadlines', 0,
      'Elektrik faturası', 'Son ödeme tarihi dört gün sonra.',
      'email', u_thread_odeme::text, 'Faturanız hazır',
      'email', u_thread_odeme::text, 'high', v_now - interval '2 hours', v_now
    ),
    (
      'ffffffff-ffff-4fff-8fff-ffffffffff06', u_user, u_briefing, 'personal', 0,
      'Kargon yolda', 'Yarın akşam teslim edilmesi bekleniyor.',
      'email', u_thread_kargo::text, 'Kargonuz yola çıktı',
      'email', u_thread_kargo::text, 'normal', v_now - interval '2 hours', v_now
    );

  -- ---------------------------------------------------------------------
  -- Two proposals waiting for approval. Nothing leaves the account until the
  -- user taps approve; both rows stay 'pending' in the fixture on purpose.
  -- ---------------------------------------------------------------------

  insert into public.approval_actions (
    id, user_id, type, status, what, why, source_type, source_id, source_label,
    payload, original_payload, idempotency_key, expires_at, attempt_count,
    created_at, updated_at
  )
  values
    (
      u_approval_mail, u_user, 'email_send', 'pending',
      'Mehmet Yılmaz''a bütçe onayı hatırlatması gönder',
      'Dört gündür yanıt yok ve Mehmet VIP listende.',
      'email', u_thread_butce::text, 'Bütçe onayı',
      jsonb_build_object(
        'to', jsonb_build_array('mehmet@baskafirma.com'),
        'cc', jsonb_build_array(),
        'subject', 'Re: Bütçe onayı',
        'body', 'Merhaba Mehmet,' || chr(10) || chr(10)
          || 'Bütçe onayını hatırlatmak istedim. Uygun olduğunda dönebilirsen sevinirim.'
          || chr(10) || chr(10) || 'Teşekkürler.',
        'threadId', u_thread_butce::text,
        'tone', 'friendly'
      ),
      jsonb_build_object(
        'to', jsonb_build_array('mehmet@baskafirma.com'),
        'cc', jsonb_build_array(),
        'subject', 'Re: Bütçe onayı',
        'body', 'Merhaba Mehmet,' || chr(10) || chr(10)
          || 'Bütçe onayını hatırlatmak istedim. Uygun olduğunda dönebilirsen sevinirim.'
          || chr(10) || chr(10) || 'Teşekkürler.',
        'threadId', u_thread_butce::text,
        'tone', 'friendly'
      ),
      'demo:email_send:' || u_thread_butce::text,
      v_now + interval '24 hours', 0,
      v_now - interval '90 minutes', v_now
    ),
    (
      u_approval_event, u_user, 'calendar_create', 'pending',
      'Teklif hazırlığı için bugün 2 saatlik blok aç',
      'Yarınki toplantıdan önce boş bulduğun tek uygun aralık.',
      'commitment', u_commitment::text, 'Revize teklif taahhüdü',
      jsonb_build_object(
        'title', 'Teklif hazırlığı',
        'startsAt', to_char(v_block_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'endsAt', to_char(v_block_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'timeZone', v_tz,
        'attendees', jsonb_build_array(),
        'description', 'Fiyat kalemlerini güncelle.'
      ),
      jsonb_build_object(
        'title', 'Teklif hazırlığı',
        'startsAt', to_char(v_block_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'endsAt', to_char(v_block_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'timeZone', v_tz,
        'attendees', jsonb_build_array(),
        'description', 'Fiyat kalemlerini güncelle.'
      ),
      'demo:calendar_create:' || u_commitment::text,
      v_now + interval '24 hours', 0,
      v_now - interval '90 minutes', v_now
    );

  -- ---------------------------------------------------------------------
  -- Retrieval memory. Chunks are slices of stored content, never summaries the
  -- model made up, so each one repeats a quote verbatim.
  -- ---------------------------------------------------------------------

  insert into public.memory_chunks (
    id, user_id, content, source_type, source_id, source_label, person_ids,
    topic, occurred_at, token_count, created_at, updated_at
  )
  values
    (
      '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a01', u_user,
      q_teklif, 'email', u_msg_teklif_in::text, 'Revize teklif',
      array[u_contact_ahmet], 'teklif', v_now - interval '1 day', 24,
      v_now - interval '1 day', v_now
    ),
    (
      '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a02', u_user,
      q_taahhut, 'email', u_msg_teklif_out::text, 'Revize teklif',
      array[u_contact_ahmet], 'teklif', v_now - interval '5 hours', 12,
      v_now - interval '5 hours', v_now
    ),
    (
      '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a03', u_user,
      q_ucus, 'email', u_msg_ucus::text, 'Bilet onayı TK2012',
      '{}'::uuid[], 'seyahat', v_now - interval '2 days', 28,
      v_now - interval '2 days', v_now
    );

  -- ---------------------------------------------------------------------
  -- One mirrored Android notification, to show the cargo signal arriving from
  -- outside mail. Nothing from this table is ever sent to analytics.
  -- ---------------------------------------------------------------------

  insert into public.device_notifications (
    id, user_id, package_name, app_name, title, "text", posted_at,
    importance, category, processed_at, created_at, updated_at
  )
  values (
    '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b01', u_user,
    'com.hizlikargo.app', 'Hızlı Kargo', 'Gönderiniz dağıtıma çıktı',
    'Takip numarası 7391045526', v_now - interval '90 minutes',
    'normal', 'shipment', v_now - interval '85 minutes',
    v_now - interval '90 minutes', v_now
  );

  raise notice 'demo fixtures loaded for % (demo_now = %)', 'demo@dijitalasistan.app', v_now;
end;
$demo$;
