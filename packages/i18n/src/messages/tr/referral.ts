import type { MessageTree } from '../../engine.ts'

export const referral = {
  title: 'Arkadaşını davet et',
  subtitle: 'İkiniz de {days} gün Pro kazanın.',
  explain: 'Kodunu paylaş. Arkadaşın hesabını açtığında ikinize de {days} gün Pro tanımlanır.',

  code: {
    label: 'Davet kodun',
    copy: 'Kodu kopyala',
    copied: 'Kod kopyalandı.',
    share: 'Paylaş',
    shareMessage:
      'Dijital Asistan’ı dene: mailini ve takvimini senin yerine takip ediyor. {code} koduyla ikimiz de {days} gün Pro kazanıyoruz.',
    regenerate: 'Yeni kod oluştur',
  },

  redeem: {
    title: 'Davet kodu gir',
    label: 'Kod',
    placeholder: '8 haneli kod',
    action: 'Kullan',
    success: 'Kod kabul edildi. {days} gün Pro hesabına tanımlandı.',
    invalid: 'Bu kod geçerli değil.',
    self: 'Kendi kodunu kullanamazsın.',
    alreadyUsed: 'Bu kodu daha önce kullandın.',
    notEligible: 'Davet ödülü yalnızca yeni hesaplarda geçerli.',
  },

  stats: {
    title: 'Davetlerin',
    invited: {
      zero: 'Henüz kimse katılmadı',
      one: '1 kişi katıldı',
      other: '{count} kişi katıldı',
    },
    earned: {
      zero: 'Henüz gün kazanmadın',
      one: '1 gün Pro kazandın',
      other: '{count} gün Pro kazandın',
    },
    pending: { one: '1 davet onay bekliyor', other: '{count} davet onay bekliyor' },
    remaining: { one: '1 davet hakkın kaldı', other: '{count} davet hakkın kaldı' },
    limitReached: 'Davet sınırına ulaştın.',
  },

  list: {
    title: 'Katılanlar',
    joinedOn: '{date} tarihinde katıldı',
    creditGranted: '{days} gün eklendi',
    creditPending: 'Onay bekliyor',
    empty: 'Henüz kimseyi davet etmedin.',
  },

  banner: {
    title: '{days} gün Pro hediye',
    body: 'Bir arkadaşını davet et, ikiniz de kazanın.',
    action: 'Davet et',
  },

  terms: 'Ödül yalnızca yeni hesaplar için geçerlidir ve bir hesap bir kez ödül alabilir.',
} satisfies MessageTree
