import type { MessageTree } from '../../engine.ts'

export const empty = {
  noImportantEmail: 'Her şey kontrol altında.',
  noImportantEmailHint: 'Bugün senden bir şey bekleyen mail yok.',
  noMeeting: 'Bugün takvimin oldukça sakin.',
  noMeetingHint: 'Derin çalışma için iyi bir gün.',
  noFollowUp: 'Bekleyen takip yok.',
  noFollowUpHint: 'Gönderdiğin maillerin hepsine dönüş gelmiş.',

  today: {
    allClear: 'Bugün için hazırsın.',
    allClearHint: 'Yeni bir şey olursa haber vereceğiz.',
  },
  flow: {
    title: 'Akışta gösterecek bir şey yok.',
    hint: 'Filtreyi değiştirmeyi ya da hesaplarını eşitlemeyi deneyebilirsin.',
    filtered: 'Bu filtreye uyan bir şey bulamadık.',
  },
  mail: {
    title: 'Bu kategoride mail yok.',
    hint: 'Yeni mailler geldikçe burada toplanacak.',
    inboxZero: 'Okunacak yeni bir şey kalmadı.',
  },
  calendar: {
    title: 'Bu gün için etkinlik yok.',
    hint: 'Takvimin boş görünüyor.',
    week: 'Bu hafta planlanmış toplantın yok.',
  },
  commitment: {
    title: 'Açık sözün yok.',
    hint: 'Bir maile "hallediyorum" dediğinde burada takip ederiz.',
    othersOwe: 'Senin beklediğin bir şey yok.',
  },
  task: {
    title: 'Görev listen boş.',
    hint: 'Bir mailden ya da nottan görev oluşturabilirsin.',
  },
  reminder: {
    title: 'Kurulu hatırlatma yok.',
    hint: 'Önemli bir şeyi unutmamak için hatırlatma kur.',
  },
  search: {
    title: 'Sonuç bulunamadı.',
    hint: 'Farklı bir kelime ya da kişi adı deneyebilirsin.',
    start: 'Mail, toplantı, kişi veya not ara.',
  },
  capture: {
    title: 'Henüz bir şey yakalamadın.',
    hint: 'Fotoğraf, PDF, bağlantı ya da not ekle; gerisini biz hallederiz.',
  },
  approval: {
    title: 'Onay bekleyen işlem yok.',
    hint: 'Bir işlem hazırlandığında önce sana sorulur.',
    history: 'Geçmişte tamamlanmış işlem yok.',
  },
  assistant: {
    title: 'Bugün ne öğrenmek istersin?',
    hint: 'Aşağıdaki sorulardan biriyle başlayabilirsin.',
  },
  briefing: {
    title: 'Henüz brifing yok.',
    hint: 'İlk brifingin sabah hazır olacak.',
    skipped: 'Bu brifing atlandı: paylaşacak yeni bir şey yoktu.',
  },
  person: {
    title: 'Bu kişiyle geçmiş bir yazışman yok.',
    hint: 'Yazıştıkça burada birikecek.',
  },
  vip: {
    title: 'VIP listende kimse yok.',
    hint: 'Mesajını kaçırmak istemediğin kişileri ekle.',
  },
  rules: {
    title: 'Henüz öncelik kuralın yok.',
    hint: 'Bir gönderene ya da anahtar kelimeye kural tanımlayabilirsin.',
  },
  notifications: {
    title: 'Bildirim yok.',
    hint: 'Önemli bir şey olduğunda buradan haber vereceğiz.',
  },
  insight: {
    title: 'Henüz çıkarılacak bir örüntü yok.',
    hint: 'Birkaç gün kullandıktan sonra burası dolmaya başlar.',
  },
  lifeEvent: {
    title: 'Takip edilen bir kargo, uçuş veya ödeme yok.',
    hint: 'Mailinde geçtiği anda otomatik olarak buraya düşer.',
  },
  referral: {
    title: 'Henüz kimseyi davet etmedin.',
    hint: 'Kodunu paylaş, ikiniz de kazanın.',
  },
  offline: {
    title: 'Çevrimdışısın.',
    hint: 'Bağlantı gelince bu bölüm kendiliğinden dolacak.',
  },
  error: {
    title: 'Bu bölüm yüklenemedi.',
    hint: 'Tekrar denemek genelde yeterli oluyor.',
  },
} satisfies MessageTree
