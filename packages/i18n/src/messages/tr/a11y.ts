import type { MessageTree } from '../../engine.ts'

/** Screen-reader labels and hints. Every one describes the action, not the icon. */
export const a11y = {
  tab: {
    today: 'Bugün sekmesi',
    flow: 'Akış sekmesi',
    plan: 'Planla sekmesi',
    assistant: 'Asistan sekmesi',
    settings: 'Ayarlar sekmesi',
    selected: 'Seçili',
  },

  button: {
    back: 'Geri git',
    close: 'Kapat',
    menu: 'Menüyü aç',
    more: 'Daha fazla seçenek',
    refresh: 'Yenile',
    search: 'Ara',
    filter: 'Filtreleri aç',
    capture: 'Yeni içerik yakala',
    voice: 'Sesle sor',
    send: 'Gönder',
    approve: 'İşlemi onayla',
    reject: 'İşlemi reddet',
    edit: 'Düzenle',
    delete: 'Sil',
    snooze: 'Ertele',
    markDone: 'Tamamlandı olarak işaretle',
    play: 'Sesli anlatımı başlat',
    pause: 'Sesli anlatımı duraklat',
    expand: 'Genişlet',
    collapse: 'Daralt',
    addVip: 'VIP listesine ekle',
    openSource: 'Kaynağı aç',
  },

  hint: {
    swipeActions: 'Seçenekler için sağa veya sola kaydır',
    doubleTapToOpen: 'Açmak için iki kez dokun',
    longPressForOptions: 'Seçenekler için basılı tut',
    pullToRefresh: 'Yenilemek için aşağı çek',
    adjustsValue: 'Değeri değiştirmek için yukarı veya aşağı kaydır',
  },

  state: {
    loading: 'Yükleniyor',
    loaded: 'Yüklendi',
    empty: 'Liste boş',
    error: 'Hata oluştu',
    selected: 'Seçili',
    notSelected: 'Seçili değil',
    expanded: 'Genişletildi',
    collapsed: 'Daraltıldı',
    unread: 'Okunmadı',
    critical: 'Kritik önem',
    vip: 'VIP kişi',
    proposed: 'Öneri, henüz gerçek değil',
  },

  item: {
    email: '{sender} kişisinden mail: {subject}',
    emailWithTime: '{sender} kişisinden mail: {subject}, {time}',
    event: 'Etkinlik: {title}, {time}',
    task: 'Görev: {title}',
    commitment: 'Söz: {title}',
    reminder: 'Hatırlatma: {title}, {time}',
    approval: 'Onay bekliyor: {title}',
    person: 'Kişi: {name}',
    capture: 'Yakalanan içerik: {title}',
    briefingSection: '{section} bölümü, {count} madde',
  },

  progress: {
    label: 'İlerleme',
    value: 'yüzde {percent}',
    step: '{total} adımdan {current}. adım',
  },

  announcement: {
    saved: 'Kaydedildi',
    deleted: 'Silindi',
    sent: 'Gönderildi',
    approved: 'Onaylandı',
    rejected: 'Reddedildi',
    newItems: '{count} yeni öğe geldi',
    briefingReady: 'Brifingin hazır',
    syncComplete: 'Eşitleme tamamlandı',
  },

  image: {
    avatar: '{name} profil fotoğrafı',
    avatarInitials: '{name} baş harfleri',
    capturePreview: 'Yakalanan görselin önizlemesi',
    decorative: '',
  },

  chart: {
    dayLoad: 'Günün doluluk grafiği: {percent} dolu',
    weekLoad: 'Haftanın toplantı dağılımı',
    timeSaved: 'Kazandığın zaman grafiği',
  },

  form: {
    required: 'Zorunlu alan',
    optional: 'İsteğe bağlı alan',
    invalid: 'Geçersiz değer: {reason}',
    characterCount: '{current} / {max} karakter',
  },
} satisfies MessageTree
