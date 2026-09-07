import type { MessageTree } from '../../engine.ts'

export const commitment = {
  title: 'Sözler',
  subtitle: 'Yazışmalarda verilen sözler burada takip edilir.',

  direction: {
    user_owes: 'Senden bekleniyor',
    other_owes: 'Karşı taraftan bekleniyor',
  },
  directionShort: {
    user_owes: 'Sende',
    other_owes: 'Onlarda',
  },

  status: {
    open: 'Açık',
    done: 'Tamamlandı',
    snoozed: 'Ertelendi',
    cancelled: 'İptal edildi',
    overdue: 'Gecikti',
  },

  card: {
    youPromised: '{name} kişisine söz verdin.',
    theyPromised: '{name} sana söz verdi.',
    dueOn: 'Tarih: {date}',
    noDate: 'Tarih belirtilmedi.',
    overdueBy: { one: '1 gün gecikti', other: '{count} gün gecikti' },
    dueIn: { one: '1 gün kaldı', other: '{count} gün kaldı' },
    dueToday: 'Bugün',
    fromEmail: 'Şu mailden çıkarıldı',
    quote: '“{quote}”',
  },

  action: {
    markDone: 'Tamamlandı',
    reopen: 'Yeniden aç',
    cancel: 'İptal et',
    snooze: 'Ertele',
    setDate: 'Tarih belirle',
    changeDate: 'Tarihi değiştir',
    remind: 'Hatırlat',
    nudge: 'Hatırlatma gönder',
    openSource: 'Kaynağı aç',
    addManually: 'Elle söz ekle',
  },

  create: {
    title: 'Söz ekle',
    whatLabel: 'Ne sözü verildi?',
    whatPlaceholder: 'Örneğin: teklifi cuma gününe kadar göndereceğim',
    whoLabel: 'Kime / kimden',
    dueLabel: 'Ne zamana kadar',
    directionLabel: 'Yön',
    save: 'Kaydet',
  },

  detected: {
    title: 'Bir söz yakaladık',
    body: 'Bu maildeki cümleden bir taahhüt çıkardık. Doğru mu?',
    confirm: 'Evet, takip et',
    reject: 'Söz değil',
    rejected: 'Tamam, bunu takip etmeyeceğiz.',
  },

  count: {
    open: { zero: 'Açık söz yok', one: '1 açık söz', other: '{count} açık söz' },
    overdue: { one: '1 söz gecikti', other: '{count} söz gecikti' },
    dueToday: { zero: 'Bugün için söz yok', one: 'Bugün 1 söz var', other: 'Bugün {count} söz var' },
  },

  done: 'Söz kapatıldı.',
  cancelled: 'Söz iptal edildi.',
  snoozedTo: '{date} tarihine ertelendi.',
} satisfies MessageTree
