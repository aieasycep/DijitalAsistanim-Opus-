-- 0021_align_role_labels.sql
-- One label and one description per role, in Turkish that is actually Turkish.
--
-- `admin_roles` is a readable relation in the console's registry, so its `label`
-- and `description` can reach a screen; `permissions.ts` carries copies for the
-- rendering paths with no database round trip. The two had drifted, in two
-- different ways.
--
-- ---------------------------------------------------------------------------
-- 1. THE SEED WAS WRITTEN WITHOUT TURKISH CHARACTERS
-- ---------------------------------------------------------------------------
--
-- Every one of the seven descriptions, and one label:
--
--   Yalnizca gorüntüleme. Hicbir islem yapamaz.   →  Yalnızca görüntüleme…
--   rol degistirir, hesap kapatir                 →  rol değiştirir, hesap kapatır
--   Destek Erisimi talep eder                     →  Destek Erişimi talep eder
--   gecici Pro tanimlar                           →  geçici Pro tanımlar
--   model ayarlari                                →  model ayarları
--   Platform saglik                               →  Platform sağlığı
--   Yapay Zeka Ops                                →  Yapay Zekâ Operasyonları
--
-- These are misspellings, not a style choice: Turkish suffix vowels follow the
-- stem, so `ayar` takes `ı`. The strings read as though typed on a keyboard
-- that could not produce the letters — which is not an impression a
-- Turkish-first product should give on the screen its own operators work from.
--
-- ---------------------------------------------------------------------------
-- 2. THE ANALYST DESCRIPTION SAID SOMETHING WEAKER THAN THE TRUTH
-- ---------------------------------------------------------------------------
--
-- The seed said "reads metrics, reports and the audit log; cannot change
-- anything". True, and it leaves out the part that matters: `redact.ts` puts
-- `analyst` alone at the `aggregate` level, so `canSeeIndividuals()` is false
-- for it and every address and user id comes back null. The role does not
-- merely refrain from changing things — it cannot see who a row is about.
--
-- That is a privacy property the product enforces in code, and the roles screen
-- is exactly where somebody decides which role to hand a new colleague. The
-- TypeScript copy states it; the seed did not. So the TypeScript wins here, and
-- the seed is brought to it.
--
-- Idempotent: updates by primary key, touches no permission, rank or enum.

update public.admin_roles set label_tr = 'Süper Yönetici',
  description_tr = 'Tam yetki. Yönetici davet eder, rol değiştirir, hesap kapatır.'
  where role = 'super_admin';

update public.admin_roles set label_tr = 'Operasyon',
  description_tr = 'Platform sağlığı, entegrasyon, bayrak ve duyuru yönetimi.'
  where role = 'operations';

update public.admin_roles set label_tr = 'Yapay Zekâ Operasyonları',
  description_tr = 'Prompt sürümleri, model ayarları ve kalite izleme.'
  where role = 'ai_ops';

update public.admin_roles set label_tr = 'Finans',
  description_tr = 'Abonelik, iade ve mutabakat; geçici Pro tanımlar.'
  where role = 'finance';

update public.admin_roles set label_tr = 'Destek',
  description_tr = 'Talepleri yönetir, senkronizasyon tetikler, Destek Erişimi talep eder.'
  where role = 'support';

update public.admin_roles set label_tr = 'Analist',
  description_tr = 'Yalnızca toplulaştırılmış metrikler. Kişisel veri görmez.'
  where role = 'analyst';

update public.admin_roles set label_tr = 'Salt Okunur',
  description_tr = 'Yalnızca görüntüleme. Hiçbir işlem yapamaz.'
  where role = 'readonly';

-- There is deliberately no guard block here. One was written and removed: any
-- check placed after these updates is unreachable, because the updates repair
-- exactly what it would test. The real check lives in
-- `scripts/validate-supabase.mjs`, which runs after every migration has been
-- applied and compares these rows against `ROLE_LABELS_TR` and
-- `ROLE_DESCRIPTIONS_TR` — the only place drift introduced by a *later*
-- migration could still be seen.
