import type { MessageTree } from '../../engine.ts'

export const loading = {
  generic: 'Yükleniyor',
  preparing: 'Hazırlanıyor',
  almostDone: 'Neredeyse bitti',
  thisMayTakeAMoment: 'Bu birkaç saniye sürebilir.',

  today: 'Günün hazırlanıyor',
  flow: 'Akış toplanıyor',
  mail: 'Mailler okunuyor',
  email: 'Mail açılıyor',
  calendar: 'Takvim getiriliyor',
  briefing: 'Brifingin yazılıyor',
  briefingAudio: 'Sesli anlatım hazırlanıyor',
  meetingPrep: 'Toplantı özeti çıkarılıyor',
  reply: 'Yanıt hazırlanıyor',
  assistant: 'Düşünüyorum',
  assistantSearching: 'Kayıtların taranıyor',
  search: 'Aranıyor',
  capture: 'İçerik inceleniyor',
  captureUpload: 'Yükleniyor',
  transcribing: 'Ses yazıya çevriliyor',
  approval: 'İşlem gönderiliyor',
  sync: 'Hesapların eşitleniyor',
  backfill: 'Geçmiş mailler taranıyor',
  connecting: 'Bağlanılıyor',
  disconnecting: 'Bağlantı kaldırılıyor',
  signingIn: 'Giriş yapılıyor',
  signingOut: 'Çıkış yapılıyor',
  purchasing: 'Satın alma tamamlanıyor',
  restoring: 'Satın alımlar geri yükleniyor',
  exporting: 'Verilerin hazırlanıyor',
  deleting: 'Siliniyor',
  saving: 'Kaydediliyor',

  progress: {
    step: '{current} / {total}',
    percent: '%{percent}',
    itemsProcessed: { one: '1 öğe işlendi', other: '{count} öğe işlendi' },
    remaining: { one: '1 öğe kaldı', other: '{count} öğe kaldı' },
  },

  slow: {
    title: 'Beklenenden uzun sürüyor',
    hint: 'İstersen arka planda devam edelim, hazır olunca haber veririz.',
    action: 'Arka planda devam et',
  },
} satisfies MessageTree
