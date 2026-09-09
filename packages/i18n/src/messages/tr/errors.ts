import type { MessageTree } from '../../engine.ts'

/**
 * One entry per `ERROR_CODES` member — the error surface looks these up as
 * `errors.<code>`, so the keys stay snake_case to match the codes exactly.
 * Wording is plain and non-technical: it says what happened and what to do.
 */
export const errors = {
  network_offline: 'İnternet bağlantısı yok. Bağlandığında kaldığın yerden devam edeceğiz.',
  network_timeout: 'Bağlantı çok uzun sürdü. Tekrar denemek ister misin?',
  server_unavailable: 'Şu an bize ulaşılamıyor. Birazdan tekrar deneyelim.',
  rate_limited: 'Çok hızlı gittik. Birkaç dakika sonra tekrar dene.',
  unauthorized: 'Oturumun sona ermiş. Tekrar giriş yapman gerekiyor.',
  forbidden: 'Bu içeriğe erişim iznin yok.',
  not_found: 'Aradığın şey bulunamadı. Silinmiş olabilir.',
  validation_failed: 'Girilen bilgilerde bir sorun var. Alanları kontrol eder misin?',
  oauth_failed: 'Hesap bağlanamadı. Bir kez daha denemeni öneririz.',
  oauth_denied: 'Bağlantı izni verilmedi. Devam etmek için izin vermen gerekiyor.',
  oauth_expired: 'Hesabının bağlantısı zaman aşımına uğradı. Yeniden bağlanman yeterli.',
  oauth_scope_missing: 'Bu özellik için gereken izin verilmemiş. Hesabı yeniden bağlayabilirsin.',
  oauth_revoked: 'Hesabın erişimi iptal edilmiş. Yeniden bağlamadan veri alamıyoruz.',
  provider_unavailable: 'Bağlı servis şu an yanıt vermiyor. Bağlantı kurulunca eşitleyeceğiz.',
  mail_provider_unavailable:
    'Mail sağlayıcına şu an ulaşılamıyor. Var olan mailleri görmeye devam edebilirsin.',
  calendar_provider_unavailable:
    'Takvim sağlayıcına şu an ulaşılamıyor. Programın son eşitlemedeki hâliyle görünüyor.',
  sync_delayed: 'Eşitleme beklenenden uzun sürüyor. Yeni gelenler biraz gecikebilir.',
  sync_conflict: 'Bu kayıt başka bir yerde de değişmiş. En güncel hâlini alıp tekrar deneyelim.',
  ai_unavailable: 'Asistan şu an cevap veremiyor. Birazdan tekrar dene.',
  ai_invalid_output:
    'Bu sonuçtan emin olamadık, o yüzden göstermiyoruz. Tekrar denemek ister misin?',
  ai_quota_exceeded: 'Bugünlük asistan kullanım sınırına ulaştın. Yarın sıfırlanacak.',
  capture_failed: 'İçerik işlenemedi. Daha net bir fotoğraf ya da farklı bir dosya deneyebilirsin.',
  upload_failed: 'Dosya yüklenemedi. Bağlantını kontrol edip tekrar dene.',
  file_too_large: 'Bu dosya çok büyük. En fazla {limit} yükleyebilirsin.',
  unsupported_file_type:
    'Bu dosya türünü okuyamıyoruz. Fotoğraf, PDF veya metin dosyası deneyebilirsin.',
  url_not_allowed:
    'Bu bağlantıyı açamıyoruz. Güvenlik nedeniyle yalnızca herkese açık adresleri okuyoruz.',
  approval_expired: 'Bu onayın süresi doldu. Güvenlik için yeniden hazırlaman gerekiyor.',
  approval_already_executed: 'Bu işlem zaten gerçekleşti. İkinci kez göndermedik.',
  approval_illegal_edit: 'Bu alan onay aşamasında değiştirilemez. Baştan hazırlamayı dene.',
  approval_execution_failed: 'İşlem tamamlanamadı. Hiçbir şey gönderilmedi, tekrar deneyebilirsin.',
  subscription_error:
    'Abonelik bilgisi okunamadı. Satın alımların kaybolmaz, birazdan tekrar bakacağız.',
  entitlement_required: 'Bu özellik Pro planında. Detaylara göz atmak ister misin?',
  plan_limit_reached: 'Bu plandaki sınıra ulaştın. Pro ile sınır kalkıyor.',
  referral_invalid: 'Bu davet kodu geçerli değil. Kodu tekrar kontrol eder misin?',
  referral_self: 'Kendi davet kodunu kullanamazsın.',
  referral_already_used: 'Bu davet kodunu daha önce kullandın.',
  referral_not_eligible: 'Davet ödülü yalnızca yeni hesaplarda geçerli.',
  export_failed: 'Veri dışa aktarımı tamamlanamadı. Yeniden talep edebilirsin.',
  permission_denied: 'Bu işlem için cihaz izni gerekiyor. Ayarlardan açabilirsin.',
  unknown: 'Beklenmedik bir şey oldu. Tekrar denemek genelde çözüyor.',

  title: {
    generic: 'Bir aksilik oldu',
    offline: 'Bağlantı yok',
    permission: 'İzin gerekiyor',
    limit: 'Sınıra ulaşıldı',
  },

  action: {
    retry: 'Tekrar dene',
    reconnect: 'Yeniden bağlan',
    openSettings: 'Ayarları aç',
    signIn: 'Giriş yap',
    seePlans: 'Planları gör',
    dismiss: 'Kapat',
    report: 'Bildir',
  },

  toast: {
    saved: 'Kaydedildi',
    saveFailed: 'Kaydedilemedi',
    deleted: 'Silindi',
    deleteFailed: 'Silinemedi',
    queuedOffline: 'Çevrimdışısın. Bağlanınca göndereceğiz.',
  },

  bootDetail: {
    label: 'Teknik ayrıntı',
    copy: 'Ayrıntıyı kopyala',
    copied: 'Kopyalandı',
  },

  boundary: {
    title: 'Bir şeyler ters gitti',
    description: 'Bu ekranı açarken beklenmedik bir hata oldu. Verilerin yerinde duruyor.',
    action: 'Ekranı yeniden yükle',
  },

  offlineBanner: 'Çevrimdışısın. Elimizdeki son bilgileri gösteriyoruz.',
  staleBanner: 'Bu bilgiler {time} tarihinden. Yenilemek için aşağı çek.',
  supportHint: 'Sorun sürerse Yardım bölümünden bize yazabilirsin.',
} satisfies MessageTree
