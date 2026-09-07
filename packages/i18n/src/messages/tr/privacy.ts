import type { MessageTree } from '../../engine.ts'

export const privacy = {
  title: 'Gizlilik ve Güvenlik',
  subtitle: 'Verinle ne yaptığımız, sade bir dille.',

  encryption: 'Veriler aktarım sırasında ve saklanırken şifrelenir.',
  noAdSale: 'Verilerin reklamverenlere satılmaz.',

  principle: {
    yourData: 'Verilerin senindir.',
    yourDataBody: 'Hesabını sildiğinde her şey silinir. Dilediğin an dışa aktarabilirsin.',
    minimal: 'Yalnızca gerekeni okuruz.',
    minimalBody: 'Kapattığın klasörlere ve takvimlere hiç bakmayız.',
    noTraining: 'Maillerin genel model eğitiminde kullanılmaz.',
    noTrainingBody: 'Analiz yalnızca senin hesabın için yapılır.',
    approval: 'Dışarıya giden hiçbir şey onaysız gitmez.',
    approvalBody: 'Mail gönderme ve takvim yazma her seferinde sana sorulur.',
    tokens: 'Bağlantı anahtarların cihazına inmez.',
    tokensBody: 'Sağlayıcı anahtarları sunucuda şifreli tutulur.',
  },

  analytics: {
    title: 'Kullanım ölçümü',
    body: 'Hangi ekranın kullanıldığını sayarız. Mail içeriği, kişi adı veya adres asla gönderilmez.',
    toggle: 'Anonim kullanım ölçümüne izin ver',
    crashToggle: 'Çökme raporlarını gönder',
    crashHint: 'Hata ayıklamak için teknik bilgi gönderilir.',
  },

  dataExport: {
    title: 'Verilerini indir',
    body: 'Hesabındaki tüm kayıtları makine tarafından okunabilir bir dosya olarak alabilirsin.',
    request: 'Dışa aktarım talep et',
    status: {
      requested: 'Talep alındı',
      processing: 'Hazırlanıyor',
      ready: 'İndirmeye hazır',
      failed: 'Hazırlanamadı',
      expired: 'Bağlantının süresi doldu',
    },
    ready: 'Dosyan hazır. Bağlantı {date} tarihine kadar geçerli.',
    download: 'İndir',
    requestAgain: 'Yeniden talep et',
    hint: 'Hazır olunca sana bildirim göndeririz.',
  },

  deleteHistory: {
    title: 'Geçmişi sil',
    body: 'Belirli bir tarihten eski analizleri kaldırabilirsin.',
    olderThan: 'Şundan eski:',
    confirm: 'Sil',
    confirmTitle: 'Seçilen geçmiş silinsin mi?',
    confirmBody: 'Bu işlem geri alınamaz. Sağlayıcıdaki asıl maillerin etkilenmez.',
    done: 'Geçmiş silindi.',
  },

  deleteAccount: {
    title: 'Hesabı sil',
    body: 'Hesabın ve tüm analizlerin kalıcı olarak silinir.',
    warning: 'Bu işlem geri alınamaz.',
    keepsProviderData: 'Mail sağlayıcındaki asıl mailler silinmez.',
    confirmLabel: 'Onaylamak için “SİL” yaz',
    confirmWord: 'SİL',
    confirm: 'Hesabımı kalıcı olarak sil',
    cancelSubscriptionNote: 'Aboneliğini ayrıca mağaza hesabından iptal etmen gerekir.',
    done: 'Hesabın silindi. Seni burada ağırladığımız için teşekkürler.',
  },

  audit: {
    title: 'İşlem kaydı',
    body: 'Senin adına yapılan her dış işlem burada kayıtlı.',
    empty: 'Henüz dış işlem yapılmadı.',
    entry: '{time} · {action}',
  },

  permissions: {
    title: 'Cihaz izinleri',
    notifications: 'Bildirimler',
    microphone: 'Mikrofon',
    camera: 'Kamera',
    photos: 'Fotoğraflar',
    contacts: 'Kişiler',
    granted: 'Verildi',
    denied: 'Verilmedi',
    manage: 'Cihaz ayarlarından yönet',
  },

  policyLink: 'Gizlilik Politikası’nı oku',
  termsLink: 'Kullanım Koşulları’nı oku',
  contact: 'Gizlilikle ilgili sorularını bize yazabilirsin.',
} satisfies MessageTree
