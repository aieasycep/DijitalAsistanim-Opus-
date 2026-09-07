import type { MessageTree } from '../../engine.ts'

export const assistant = {
  title: 'Asistan',
  subtitle: 'Kendi verilerin üzerinden sor.',
  inputPlaceholder: 'Bir şey sor',
  send: 'Gönder',
  stop: 'Durdur',
  thinking: 'Düşünüyorum',
  searching: 'Kayıtların taranıyor',
  newThread: 'Yeni konuşma',
  threads: 'Konuşmalar',
  renameThread: 'Konuşmayı adlandır',
  deleteThread: 'Konuşmayı sil',
  deleteThreadConfirm: 'Bu konuşma silinsin mi?',

  suggested: {
    title: 'Şunu sorabilirsin',
    focus: 'Bugün neye odaklanmalıyım?',
    replies: 'Kimlere cevap vermem gerekiyor?',
    tomorrow: 'Yarın yoğun muyum?',
    person: 'Mehmet ile en son ne konuştuk?',
  },

  sources: {
    title: 'Kaynaklar',
    count: { one: '1 kaynak', other: '{count} kaynak' },
    show: 'Kaynakları göster',
    hide: 'Kaynakları gizle',
    open: 'Kaynağı aç',
    hint: 'Cevap yalnızca bu kayıtlara dayanıyor.',
  },

  answer: {
    noData: 'Bu soruya cevap verecek bir kayıt bulamadım.',
    partial: 'Elimdeki kayıtlar bu soruyu tam karşılamıyor. Bulabildiğim kadarı şu:',
    uncertain: 'Kaynakta kesinleşmiyor.',
    outOfScope: 'Bu konu senin verilerinin dışında kalıyor, o yüzden tahmin yürütmüyorum.',
    copy: 'Cevabı kopyala',
    good: 'İşe yaradı',
    bad: 'İşe yaramadı',
    thanks: 'Teşekkürler, bunu öğrendik.',
  },

  action: {
    title: 'Önerilen işlem',
    hint: 'Onaylarsan yapılır.',
    draftReply: 'Yanıt hazırla',
    createEvent: 'Etkinlik oluştur',
    createTask: 'Görev oluştur',
    createReminder: 'Hatırlatma kur',
    createCommitment: 'Söz olarak takip et',
  },

  memory: {
    title: 'Hatırladıklarım',
    learned: 'Bunu senin hakkında öğrendim: {fact}',
    forget: 'Bunu unut',
    forgotten: 'Unutuldu.',
    manage: 'Öğrenilenleri yönet',
  },

  limits: {
    dailyLeft: { zero: 'Bugünlük soru hakkın bitti.', one: 'Bugün 1 soru hakkın kaldı.', other: 'Bugün {count} soru hakkın kaldı.' },
    upgrade: 'Sınırsız sorma Pro planında.',
  },

  disclaimer: 'Asistan yalnızca senin bağlı hesaplarındaki bilgileri kullanır.',
  privacyNote: 'Sorduğun sorular reklam için kullanılmaz.',
  error: 'Cevap hazırlanamadı. Tekrar sormayı dene.',
} satisfies MessageTree
