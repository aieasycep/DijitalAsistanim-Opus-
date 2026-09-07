import type { MessageTree } from '../../engine.ts'

export const reminder = {
  title: 'Hatırlatmalar',
  subtitle: 'Unutmak istemediklerin.',

  /** Chip labels shown in the "remind me" sheet. */
  options: {
    in30Minutes: '30 dakika önce',
    in1Hour: '1 saat önce',
    thisEvening: 'Bu akşam',
    tomorrowMorning: 'Yarın sabah',
    smart: 'Uygun zamanda',
    custom: 'Kendin seç',
  },

  /** Resolved-time explanations returned by `resolveReminderTime`. */
  preset: {
    in30Minutes: '30 dakika sonra hatırlatılacak.',
    in1Hour: '1 saat sonra hatırlatılacak.',
    thisEvening: 'Bu akşam {time} saatinde hatırlatılacak.',
    eveningPassed: 'Akşam saati geçtiği için yarın sabaha alındı.',
    tomorrowMorning: 'Yarın sabah {time} saatinde hatırlatılacak.',
    custom: '{date} {time} için kuruldu.',
  },

  smart: {
    freeSlotToday: 'Bugün {time} saatinde boşsun, o zaman hatırlatalım.',
    freeSlotTomorrow: 'Yarın {time} saatinde boşsun, o zaman hatırlatalım.',
    nextFreeMorning: 'İlk müsait sabahın {date}, o gün hatırlatalım.',
    explain: 'Programına bakıp seni bölmeyecek bir an seçiyoruz.',
  },

  quietHoursShifted: 'Sessiz saatlerine denk geldiği için {time} saatine alındı.',
  beforeDeadline: 'Son tarihten {hours} saat önce hatırlatılacak.',

  create: {
    title: 'Hatırlatma kur',
    whatLabel: 'Ne hatırlatalım?',
    whatPlaceholder: 'Örneğin: teklifi gönder',
    whenLabel: 'Ne zaman',
    customDate: 'Tarih',
    customTime: 'Saat',
    save: 'Kur',
    saved: 'Hatırlatma kuruldu.',
  },

  card: {
    at: '{date} {time}',
    fires: '{time} hatırlatılacak',
    fired: '{time} hatırlatıldı',
    linkedTo: 'Şununla bağlantılı',
    snoozedTo: '{time} saatine ertelendi',
  },

  action: {
    edit: 'Düzenle',
    reschedule: 'Zamanı değiştir',
    cancel: 'İptal et',
    done: 'Tamamlandı',
    snooze15: '15 dakika ertele',
    snooze1h: '1 saat ertele',
    snoozeTomorrow: 'Yarına ertele',
  },

  cancelled: 'Hatırlatma iptal edildi.',
  updated: 'Hatırlatma güncellendi.',
  pastTime: 'Geçmiş bir zamana hatırlatma kuramayız.',
  count: { zero: 'Kurulu hatırlatma yok', one: '1 hatırlatma', other: '{count} hatırlatma' },
} satisfies MessageTree
