import type { MessageTree } from '../../engine.ts'

export const voice = {
  title: 'Sesle sor',
  tapToSpeak: 'Konuşmak için dokun',
  listening: 'Dinliyorum',
  listeningHint: 'Bitirdiğinde tekrar dokun.',
  processing: 'Yazıya çeviriyorum',
  transcribing: 'Ses yazıya çevriliyor',
  holdToTalk: 'Basılı tut ve konuş',
  releaseToSend: 'Göndermek için bırak',
  cancelHint: 'İptal etmek için yukarı kaydır',
  cancelled: 'İptal edildi.',
  tooShort: 'Çok kısa oldu. Biraz daha uzun konuşmayı dene.',
  tooLong: 'Kayıt en fazla {seconds} saniye olabilir.',
  silence: 'Ses algılamadık.',
  noise: 'Ortam gürültülü, kelimeleri tam ayıramadım.',

  transcript: {
    label: 'Duyduğum',
    edit: 'Düzelt',
    confirm: 'Doğru',
    rerecord: 'Yeniden kaydet',
  },

  permission: {
    title: 'Mikrofon izni gerekiyor',
    body: 'Sesle soru sorabilmek için mikrofona erişmemiz gerekiyor.',
    allow: 'İzin ver',
    openSettings: 'Ayarları aç',
    denied: 'Mikrofon izni kapalı.',
  },

  playback: {
    play: 'Oynat',
    pause: 'Duraklat',
    replay: 'Baştan dinle',
    speed: 'Hız {value}x',
  },

  privacy: 'Ses kaydın yazıya çevrildikten sonra saklanmaz.',
  error: 'Ses işlenemedi. Tekrar dener misin?',
  offline: 'Sesli soru için internet bağlantısı gerekiyor.',
} satisfies MessageTree
