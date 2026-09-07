import type { MessageTree } from '../../engine.ts'

export const vip = {
  title: 'VIP Kişiler',
  subtitle: 'Mesajını kaçırmak istemediğin insanlar.',
  explain: 'VIP listendekilerden gelen her şey öne çıkar ve sessiz saatlerde bile bildirilir.',

  add: 'VIP ekle',
  addPlaceholder: 'İsim ya da e-posta ara',
  remove: 'VIP’ten çıkar',
  removeConfirm: '{name} VIP listenden çıkarılsın mı?',

  list: {
    title: 'Listen',
    count: { zero: 'VIP kişin yok', one: '1 VIP kişi', other: '{count} VIP kişi' },
    limit: 'Bu planda en fazla {limit} VIP tanımlayabilirsin.',
    limitReached: 'VIP sınırına ulaştın. Pro ile sınır kalkıyor.',
  },

  suggestion: {
    title: 'Önerilenler',
    hint: 'En sık ve en hızlı yazıştığın kişiler.',
    reasonFrequent: 'Onunla sık yazışıyorsun.',
    reasonFast: 'Ona genelde çok hızlı dönüyorsun.',
    reasonManager: 'Yazışma düzeni bir yöneticiye işaret ediyor.',
    reasonMeeting: 'Sık sık toplantı yapıyorsunuz.',
    accept: 'Ekle',
    dismiss: 'Gerek yok',
  },

  behaviour: {
    title: 'VIP davranışı',
    alwaysNotify: 'Her zaman bildir',
    alwaysNotifyHint: 'Sessiz saatlerde bile.',
    alwaysTop: 'Akışta en üstte göster',
    fastReplyReminder: 'Cevaplamazsan hatırlat',
    fastReplyHint: '{hours} saat içinde dönmezsen sana söyleriz.',
  },

  added: '{name} VIP listene eklendi.',
  removed: '{name} listeden çıkarıldı.',
  empty: 'VIP listende kimse yok.',
  emptyHint: 'Patronun, en yakın müşterin ya da ailen olabilir.',
} satisfies MessageTree
