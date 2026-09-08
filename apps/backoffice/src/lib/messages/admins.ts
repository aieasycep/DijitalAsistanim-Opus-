import type { ErrorCode } from '@da/domain'
import type { AdminOutcome, MfaFilter } from '@/components/admins/contract'
import type { AdminStatus } from '@/lib/permissions'

/**
 * Every Turkish string the admin-management area renders.
 *
 * ---------------------------------------------------------------------------
 * WHY THE WORDING IS SO EXPLICIT ABOUT CONSEQUENCE
 * ---------------------------------------------------------------------------
 *
 * These four screens are the ones that decide who may open this console at all.
 * A role change is not a preference — it is the difference between a colleague
 * who can read aggregate metrics and one who can approve somebody's access to a
 * stranger's mailbox. So every confirmation below names the effect in full
 * rather than asking "emin misiniz?", and the roster labels say what a status
 * actually means for signing in.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------
 *
 * No role labels and no permission labels: `ROLE_LABELS_TR`,
 * `ROLE_DESCRIPTIONS_TR` and `PERMISSION_LABELS_TR` are in `@/lib/permissions`,
 * mirroring `admin_roles.label_tr`, and a second Turkish name for `super_admin`
 * is exactly the drift the roles page exists to detect. No tone mapping either
 * — that lives beside the components, in `@/components/admins/presentation`.
 */

// ===========================================================================
// Statuses
// ===========================================================================

export const adminStatusLabels: Readonly<Record<AdminStatus, string>> = Object.freeze({
  invited: 'Davetli',
  active: 'Etkin',
  disabled: 'Kapalı',
})

/** What each status means for signing in, in one sentence. */
export const adminStatusHints: Readonly<Record<AdminStatus, string>> = Object.freeze({
  invited:
    'Kayıt açıldı, kimlik hesabı henüz bağlanmadı. Bu hesapla konsola giriş yapılamaz; davet bağlantısı kullanıldığında etkinleşir.',
  active: 'Konsola girebilir. Yetkileri, rolünün veritabanındaki izin listesiyle sınırlıdır.',
  disabled:
    'Erişimi kaldırıldı. Oturumları geçersiz, izni yok. Kayıt silinmez: denetim kaydındaki satırlar hâlâ bu kişiyi adlandırabilmelidir.',
})

export const mfaFilterLabels: Readonly<Record<MfaFilter, string>> = Object.freeze({
  var: 'MFA kayıtlı',
  yok: 'MFA kayıtsız',
})

// ===========================================================================
// Failures
//
// A screen never quotes a database message. These are the sentences that stand
// in for one, chosen by the typed `ErrorCode` the action came back with.
// ===========================================================================

export const GENERIC_ADMIN_FAILURE_TR = 'İşlem tamamlanamadı. Sayfayı yenileyip tekrar deneyin.'

const FAILURE_MESSAGES_TR: Readonly<Partial<Record<ErrorCode, string>>> = Object.freeze({
  not_found: 'Bu yönetici kaydı bulunamadı. Başka bir yönetici değiştirmiş olabilir.',
  forbidden: 'Bu işlem için gereken yetkiye sahip değilsiniz.',
  unauthorized: 'Oturumunuzun süresi dolmuş görünüyor. Tekrar giriş yapın.',
  validation_failed: 'Girilen değerler veritabanının kabul ettiği biçimde değil.',
  sync_conflict: 'Kayıt siz bu ekranı açtıktan sonra değişti. Yenileyip tekrar bakın.',
  rate_limited: 'Çok fazla deneme yapıldı. Bir süre bekleyip tekrar deneyin.',
  server_unavailable: 'Veritabanına ulaşılamadı. Kısa süre sonra tekrar deneyin.',
})

export function adminFailureMessage(code: ErrorCode): string {
  return FAILURE_MESSAGES_TR[code] ?? GENERIC_ADMIN_FAILURE_TR
}

// ===========================================================================
// What an action reports back
// ===========================================================================

export interface AdminOutcomeMessage {
  readonly title: string
  readonly body: string
}

export const adminOutcomeMessages: Readonly<Record<AdminOutcome, AdminOutcomeMessage>> =
  Object.freeze({
    roleChanged: {
      title: 'Rol değiştirildi',
      body: 'Yeni rol geçerli. Bu yöneticinin izinleri bir sonraki isteğinde veritabanından yeniden okunur; beklemesi gereken bir oturum yenilemesi yok. Eski ve yeni rol, kimliğiniz ve gerekçenizle denetim kaydına yazıldı.',
    },
    disabled: {
      title: 'Yönetici hesabı kapatıldı',
      body: 'Hesap kapatıldı, açık oturumları sonlandırıldı ve izinleri düştü. Kayıt silinmedi: denetim kaydındaki geçmiş satırlar hâlâ bu kişiyi adlandırıyor.',
    },
    reenabled: {
      title: 'Yönetici hesabı yeniden açıldı',
      body: 'Hesap yeniden açıldı ve rolünün izinleri geri geldi. Yeniden giriş yapması gerekir; kapatılırken sonlandırılan oturumlar geri gelmez.',
    },
    sessionsRevoked: {
      title: 'Oturumlar sonlandırıldı',
      body: 'Bu yöneticinin açık oturumları veritabanında geçersiz kılındı. Oturum doğrulaması her istekte sunucuda yapıldığı için etki anında geçerlidir.',
    },
    noSessions: {
      title: 'Sonlandırılacak oturum yoktu',
      body: 'Bu yöneticinin açık oturumu bulunmuyordu. Denetim kaydına deneme, sıfır sonucuyla birlikte yazıldı.',
    },
    invited: {
      title: 'Davet oluşturuldu',
      body: 'Davet kaydı açıldı. Bağlantıdaki anahtarı şimdi kopyalayın: veritabanında yalnızca özeti saklanıyor ve bu ekrandan sonra hiçbir yerde tekrar görüntülenemez.',
    },
    inviteRevoked: {
      title: 'Davet iptal edildi',
      body: 'Davet geçersiz kılındı. Bağlantı daha önce paylaşıldıysa artık işe yaramaz; aynı adrese yeni bir davet oluşturabilirsiniz.',
    },
    noop: {
      title: 'Değişen bir şey yok',
      body: 'Gönderilen değer kayıttakiyle aynı. Denetim kaydına gereksiz bir satır yazılmadı.',
    },
    lastSuperAdmin: {
      title: 'Son süper yönetici korunuyor',
      body: 'Veritabanı bu işlemi reddetti: platformda etkin süper yönetici kalmayacaktı. Önce başka bir yöneticiyi süper yönetici yapın, sonra bu kaydı değiştirin.',
    },
    selfDisable: {
      title: 'Kendi hesabınızı kapatamazsınız',
      body: 'Kendi erişiminizi bu ekrandan kaldırmak, geri alacak kimse kalmadan konsolun dışında kalmanız anlamına gelir. Bunu başka bir süper yöneticiden isteyin.',
    },
    selfRole: {
      title: 'Kendi rolünüzü değiştiremezsiniz',
      body: 'Kendi rolünüzü düşürmek, düzeltmeye yetkiniz kalmadan konsolun dışında kalmanız anlamına gelebilir. Veritabanı yalnızca son süper yöneticiyi korur; bunun dışındaki kendini düşürme işlemlerini konsol reddeder. Değişikliği başka bir süper yöneticiden isteyin.',
    },
    duplicate: {
      title: 'Bu adres için açık bir kayıt var',
      body: 'Bu adrese ait bekleyen bir davet ya da var olan bir yönetici kaydı bulunuyor. Önceki daveti iptal edin ya da var olan kaydı düzenleyin.',
    },
    notfound: {
      title: 'Kayıt bulunamadı',
      body: 'Aradığınız yönetici ya da davet kaydı yok. Bağlantı eski olabilir.',
    },
    conflict: {
      title: 'Kayıt bu arada değişti',
      body: 'Siz bu ekranı açtıktan sonra başka bir yönetici aynı kaydı değiştirdi. Sayfayı yenileyip son durumu görün.',
    },
    forbidden: {
      title: 'Yetkiniz yok',
      body: 'Bu işlem için gereken izne sahip değilsiniz. Deneme, kimliğinizle birlikte denetim kaydına yazıldı.',
    },
    invalid: {
      title: 'Form eksik ya da hatalı',
      body: 'Alanları kontrol edip tekrar gönderin. Gerekçe alanı zorunludur ve boş bırakılamaz.',
    },
    ratelimited: {
      title: 'Çok fazla deneme',
      body: 'Bu işlem için ayrılan sınıra ulaşıldı. Kısa bir süre bekleyip tekrar deneyin.',
    },
    auditMissing: {
      title: 'İşlem yapıldı, denetim kaydı yazılamadı',
      body: 'Değişiklik uygulandı ama denetim satırı yazılamadı. Bu bir kayıt boşluğudur: durumu altyapı ekibine bildirin ve ne yaptığınızı not edin.',
    },
    failed: {
      title: 'İşlem tamamlanamadı',
      body: GENERIC_ADMIN_FAILURE_TR,
    },
  })

// ===========================================================================
// The screens
// ===========================================================================

export const adminMessages = Object.freeze({
  banner: {
    dismiss: 'Kapat',
  },

  list: {
    title: 'Yöneticiler',
    description:
      'Bu konsolu kimin açabildiği, hangi rolle açtığı ve son ne zaman girdiği. Adresler burada da maskelenir: bir yönetici de bir kişidir.',
    meta: 'Kaynak: bo_admin_users görünümü. Sayfalama ve sayımlar Postgres tarafında yapılır.',
    invite: 'Yönetici davet et',
    rolesLink: 'Rol izin matrisi',
    empty: 'Kayıtlı yönetici yok.',
    emptyFiltered: 'Bu filtrelerle eşleşen yönetici yok.',
    searchInvalidAddress:
      'Tam e-posta adresiyle arama yapılmıyor. Alan adını (örneğin sirket.com), yönetici kimliğini ya da adın bir parçasını yazın.',
    searchTooShort: 'Arama için en az iki karakter yazın ya da bir alan adı girin.',
    noInvitePermission:
      'Yönetici davet etme yetkiniz yok; bu sayfayı yalnızca görüntüleyebiliyorsunuz.',
    privacyNote:
      'Bu sayfa yalnızca hesap ve yetki bilgisi gösterir. Hiçbir yöneticinin adına oturum açılamaz, kimliğine bürünülemez.',
  },

  columns: {
    admin: 'Yönetici',
    role: 'Rol',
    status: 'Durum',
    mfa: 'MFA',
    lastLogin: 'Son giriş',
    sessions: 'Açık oturum',
    activity: '30 günlük işlem',
    invitedBy: 'Davet eden',
    permissions: 'İzin',
  },

  tiles: {
    total: 'Toplam yönetici',
    totalHint: 'Kapatılmış kayıtlar dâhil; kayıtlar silinmez.',
    active: 'Etkin',
    activeHint: 'Şu anda konsola girebilen hesap sayısı.',
    disabled: 'Kapalı',
    disabledHint: 'Erişimi kaldırılmış, kaydı korunan hesaplar.',
    mfaMissing: 'MFA kayıtsız',
    mfaMissingHint: 'Etkin olduğu hâlde ikinci faktör tanımlamamış hesaplar.',
    superAdmin: 'Etkin süper yönetici',
    superAdminHint: 'Veritabanı sonuncusunun kaldırılmasını reddeder.',
    pendingInvites: 'Bekleyen davet',
    pendingInvitesHint: 'Kullanılmamış, iptal edilmemiş ve süresi dolmamış davetler.',
  },

  filters: {
    role: 'Rol',
    status: 'Durum',
    mfa: 'MFA',
    search: 'Ara',
    searchPlaceholder: 'Alan adı, ad ya da yönetici kimliği',
  },

  invites: {
    section: 'Bekleyen davetler',
    description:
      'Henüz kullanılmamış davetler. Anahtarın kendisi burada yok: veritabanında yalnızca SHA-256 özeti saklanır.',
    empty: 'Bekleyen davet yok.',
    columnEmail: 'Adres',
    columnRole: 'Rol',
    columnInvitedBy: 'Davet eden',
    columnCreated: 'Oluşturuldu',
    columnExpires: 'Geçerlilik',
    columnAction: 'İşlem',
    expired: 'Süresi doldu',
    expiresIn: (text: string) => `${text} sonra dolar`,
    revoke: 'İptal et',
    revokeTitle: 'Daveti iptal et',
    revokeBody:
      'Davet bağlantısı bundan sonra kabul edilmez. Bağlantı paylaşıldıysa artık işe yaramaz; aynı adrese yeni bir davet oluşturabilirsiniz.',
    revokeConfirm: 'Daveti iptal et',
    revokeReasonLabel: 'İptal gerekçesi',
    revokeReasonPlaceholder: 'Örneğin: yanlış adrese gönderildi, kişi işe başlamadı.',
  },

  detail: {
    backToList: 'Yönetici listesine dön',
    kicker: 'Yönetici kaydı',
    notFoundTitle: 'Yönetici bulunamadı',
    notFoundBody:
      'Bu kimlikle bir yönetici kaydı yok. Bağlantı eski olabilir ya da kayıt hiç var olmamış olabilir.',
    factsSection: 'Hesap',
    factsDescription: 'Kaynak: bo_admin_users. Adres maskelenmiş hâliyle gösterilir.',
    permissionsSection: 'Etkin izinler',
    permissionsDescription:
      'Veritabanının bu hesap için gerçekten döndürdüğü izinler (bo_admin_permissions). Bir TypeScript listesinden değil, rolün veritabanındaki satırlarından okunur.',
    permissionsEmptyDisabled:
      'Bu hesap kapalı olduğu için hiçbir izni yok. Görünüm kapalı yöneticiler için satır döndürmez; varsayılan reddetmedir.',
    permissionsEmpty: 'Bu rol için izin satırı bulunamadı.',
    roleSection: 'Rol',
    roleDescription:
      'Rol değiştirmek, bu kişinin konsolda yapabileceklerinin tamamını değiştirir. Ürünün en hassas işlemlerinden biridir ve gerekçesiyle birlikte kaydedilir.',
    accessSection: 'Erişim',
    accessDescription:
      'Hesabı kapatmak erişimi hemen keser ve açık oturumları sonlandırır. Kayıt silinmez.',
    sessionsSection: 'Oturumlar',
    sessionsDescription:
      'Sunucu tarafında tutulan oturumlar. Süre ve iptal her istekte veritabanında değerlendirilir; tarayıcıdaki çerez tek başına bir şey ifade etmez.',
    sessionsEmpty: 'Bu yöneticiye ait oturum kaydı yok.',
    sessionsNote:
      'Oturum listesinde belirteç özeti, IP özeti ve tarayıcı bilgisi yer almaz: özetini gösteren bir liste, çevrimdışı denenebilecek bir listedir.',
    trailSection: 'Bu kayıt üzerindeki işlemler',
    trailDescription:
      'Bu yönetici kaydı hakkında yapılmış her işlem — reddedilen denemeler dâhil. Kaynak: bo_audit.',
    trailEmpty: 'Bu kayıt üzerinde henüz bir işlem yapılmamış.',
    trailLink: 'Denetim kaydının tamamı',
    ownAccountNote:
      'Bu sizin kendi hesabınız. Kendi rolünüzü değiştiremez ve kendi erişiminizi kapatamazsınız.',
    disabledReasonLabel: 'Kapatma gerekçesi',
    noAuthUser:
      'Bu kayda bağlı bir kimlik hesabı yok. Davet bağlantısı kullanılana kadar giriş yapamaz.',
  },

  facts: {
    email: 'Adres',
    name: 'Ad',
    role: 'Rol',
    status: 'Durum',
    mfa: 'İkinci faktör (MFA)',
    mfaEnrolled: 'Kayıtlı',
    mfaMissing: 'Kayıtlı değil',
    mfaSince: (text: string) => `${text} tarihinde kaydedildi`,
    lastLogin: 'Son giriş',
    never: 'Hiç',
    invitedBy: 'Davet eden',
    invitedAt: 'Davet tarihi',
    disabledAt: 'Kapatılma tarihi',
    permissionCount: 'İzin sayısı',
    activeSessions: 'Açık oturum',
    actions30d: '30 günlük işlem',
    sensitive30d: 'Bunun hassas olanı',
    lastAction: 'Son işlemi',
    supportAccess: 'Açık Destek Erişimi',
    adminUserId: 'Yönetici kimliği',
    authUserId: 'Kimlik hesabı',
    authBound: 'Bağlı',
    authUnknown: 'Okunamadı',
    unknownAdmin: 'Bilinmiyor',
    systemInvited: 'Sistem (ilk kurulum)',
  },

  sessionColumns: {
    issued: 'Açıldı',
    lastSeen: 'Son görülme',
    expires: 'Sona erer',
    state: 'Durum',
    idle: 'Boşta',
  },

  sessionState: {
    active: 'Açık',
    revoked: 'İptal edildi',
    expired: 'Süresi doldu',
  },

  trailColumns: {
    when: 'Zaman',
    action: 'İşlem',
    actor: 'Yapan',
    outcome: 'Sonuç',
    reason: 'Gerekçe',
  },

  trailActions: {
    roleChanged: 'Rol değiştirildi',
    disabled: 'Hesap kapatıldı',
    reenabled: 'Hesap yeniden açıldı',
    sessionsRevoked: 'Oturumlar sonlandırıldı',
    invited: 'Davet edildi',
    inviteRevoked: 'Davet iptal edildi',
  },

  trailOutcome: {
    success: 'Başarılı',
    failure: 'Reddedildi',
    unknown: 'Bilinmiyor',
  },

  actions: {
    noRolePermission: 'Rol değiştirme yetkiniz yok.',
    noDisablePermission: 'Yönetici hesabı kapatma yetkiniz yok.',
    reasonLabel: 'Gerekçe',
    reasonPlaceholder:
      'Örneğin: ekip değişikliği sonrası operasyon rolüne geçiriliyor (ticket #482).',

    changeRole: 'Rolü değiştir',
    changeRoleTitle: 'Rolü değiştir',
    changeRoleBody:
      'Bu kişinin konsolda yapabildiği her şey değişir. Yeni rolün izinleri anında geçerli olur; eski rolün izinleri anında düşer.',
    changeRoleConfirm: 'Rolü değiştir',
    roleSelectLabel: 'Yeni rol',
    roleUnchanged: 'Seçilen rol zaten geçerli olan rol.',
    roleNotAssignable: 'Bu rol artık atanamıyor.',

    disable: 'Hesabı kapat',
    disableTitle: 'Yönetici hesabını kapat',
    disableBody:
      'Bu kişi konsola bir daha giremez, açık oturumları sonlandırılır ve bütün izinleri düşer. Kayıt silinmez; denetim kaydındaki satırlar bu kişiyi adlandırmaya devam eder.',
    disableConfirm: 'Hesabı kapat',

    enable: 'Hesabı yeniden aç',
    enableTitle: 'Yönetici hesabını yeniden aç',
    enableBody:
      'Hesap yeniden açılır ve rolünün izinleri geri gelir. Kimlik hesabı bağlı değilse kayıt "davetli" durumuna döner ve giriş yapabilmesi için davetin kullanılması gerekir.',
    enableConfirm: 'Hesabı yeniden aç',

    revokeSessions: 'Tüm oturumları sonlandır',
    revokeSessionsTitle: 'Tüm oturumları sonlandır',
    revokeSessionsBody:
      'Bu yöneticinin sunucudaki bütün oturumları geçersiz kılınır. Tanımadığı bir oturum gördüyseniz ya da cihazı kaybolduysa doğru işlem budur. Hesabı kapatmaz.',
    revokeSessionsConfirm: 'Oturumları sonlandır',
    revokeOwnSessionsNote:
      'Kendi hesabınız için bu işlem, şu anki oturumunuz dışındaki oturumları sonlandırır.',
    noSessionsToRevoke: 'Açık oturum yok.',
  },

  invite: {
    title: 'Yönetici davet et',
    description:
      'Yeni bir yönetici kaydı için tek kullanımlık davet oluşturur. Anahtar yalnızca bir kez, oluşturulduğu anda görüntülenir.',
    breadcrumb: 'Davet',
    emailLabel: 'İş e-posta adresi',
    emailHint:
      'Adres, davet kullanıldığında kimlik hesabıyla eşleştirilir. Listelerde maskelenmiş hâliyle görünür.',
    emailPlaceholder: 'ad.soyad@sirket.com',
    emailRequired: 'E-posta adresi zorunludur.',
    emailInvalid: 'Geçerli bir e-posta adresi girin.',
    emailTooLong: 'E-posta adresi en fazla 320 karakter olabilir.',
    roleLabel: 'Rol',
    roleHint:
      'Rolün izinleri veritabanındaki matristen gelir. Ne verdiğinizi görmek için rol izin matrisine bakın.',
    roleRequired: 'Bir rol seçin.',
    ttlLabel: 'Davet süresi',
    ttlHint: 'Süre dolduğunda bağlantı kabul edilmez. Süre sunucu saatinden hesaplanır.',
    ttlRequired: 'Bir süre seçin.',
    ttlOption: (days: number) => `${days} gün`,
    reasonLabel: 'Gerekçe',
    reasonHint:
      'Denetim kaydına kimliğinizle birlikte yazılır. Altı ay sonra bunu okuyan kişi neden davet edildiğini anlayabilmelidir.',
    reasonPlaceholder: 'Örneğin: destek ekibine yeni katılan takım arkadaşı (ticket #513).',
    submit: 'Daveti oluştur',
    submitting: 'Oluşturuluyor…',
    cancel: 'Vazgeç',
    noPermission: 'Yönetici davet etme yetkiniz yok.',

    tokenTitle: 'Davet anahtarı — yalnızca şimdi görünür',
    tokenBody:
      'Bu anahtarın yalnızca SHA-256 özeti veritabanına yazıldı. Anahtarın kendisi hiçbir tabloda, hiçbir kayıtta ve hiçbir ekranda saklanmıyor: bu kutuyu kapattığınızda geri getirilemez. Veritabanının tamamı sızsa bile bu anahtar elde edilemez.',
    tokenFor: (email: string) => `Alıcı: ${email}`,
    tokenExpires: (text: string) => `Geçerlilik: ${text}`,
    tokenLost:
      'Anahtarı kaybederseniz kurtarma yolu yoktur; daveti iptal edip yenisini oluşturmanız gerekir.',
    tokenLabel: 'Anahtar',
    backToList: 'Yönetici listesine dön',
  },

  roles: {
    title: 'Rol izin matrisi',
    description:
      'Hangi rolün hangi izni taşıdığı. Satırlar bir TypeScript sabitinden değil, veritabanının kendi kayıtlarından okunur.',
    meta: 'Kaynak: bo_admin_permissions görünümü (admin_role_permissions üzerinden) ve admin_roles tablosu.',
    backToAdmins: 'Yönetici listesine dön',

    tileRoles: 'Rol',
    tileRolesHint: 'admin_roles tablosundaki satır sayısı.',
    tileAssignable: 'Atanabilir rol',
    tileAssignableHint: 'Davet ve rol değiştirme listelerinde çıkan roller.',
    tileObservable: 'Okunabilen rol',
    tileObservableHint:
      'İzin listesi veritabanından doğrudan okunabilen roller. Bir rolün okunabilmesi için o rolde etkin bir yönetici bulunmalıdır.',
    tileDrift: 'Uyuşmazlık',
    tileDriftHint:
      'Veritabanının verdiği ile konsolun gözden geçirilmiş matrisinin kabul ettiği izinler arasındaki fark.',

    matrixSection: 'İzin matrisi',
    matrixDescription:
      'Her hücre, o rolün o izni veritabanında taşıyıp taşımadığını gösterir. Konsol, veritabanından gelen izinleri gözden geçirilmiş matrisle kesiştirir; bu yüzden yalnızca bir tarafta bulunan bir izin fiilen geçerli değildir.',
    permissionColumn: 'İzin',

    legendTitle: 'Gösterim',
    legendGranted: 'Veritabanı veriyor, konsol kabul ediyor — izin geçerli.',
    legendDbOnly:
      'Yalnızca veritabanında var. Konsol kesişim aldığı için bu izin fiilen geçerli değil; matris gözden geçirilene kadar hiçbir şey açmaz.',
    legendMirrorOnly:
      'Yalnızca konsolun matrisinde var. Veritabanı vermiyor, dolayısıyla izin yok.',
    legendNone: 'Bu rolde bu izin yok.',
    legendUnknown: 'Okunamadı: bu rolde etkin yönetici olmadığı için görünüm satır döndürmüyor.',

    unobservableTitle: 'Okunamayan roller',
    unobservableBody:
      'Aşağıdaki rollerde etkin bir yönetici bulunmadığı için bo_admin_permissions görünümü bu roller için satır döndürmüyor. Konsol bu boşluğu bir TypeScript listesiyle doldurmuyor; olduğu gibi bildiriyor.',
    unobservableCount: (count: number) =>
      `Veritabanı bu rol için ${count} izin sayıyor, ancak izinlerin adları okunamıyor.`,
    unobservableNoAdmin: 'Bu rolde hiç yönetici kaydı yok; izin sayısı da okunamıyor.',

    holders: (total: number, active: number) => `${total} kayıt · ${active} etkin`,
    countMismatch: (expected: number, observed: number) =>
      `Veritabanı bu rol için ${expected} izin sayıyor, listede ${observed} izin göründü.`,
    driftNote:
      'Bir uyuşmazlık, veritabanına gözden geçirilmiş bir göç dışında satır eklendiği ya da kaldırıldığı anlamına gelir. Konsol kesişim aldığı için tek taraflı bir satır kimseye yetki açmaz, ama incelenmesi gerekir.',
    noDrift:
      'Okunabilen her rol için veritabanı ile konsolun gözden geçirilmiş matrisi birebir aynı.',
  },

  errors: {
    matrixFailed: 'İzin matrisi okunamadı.',
    rosterFailed: 'Yönetici listesi getirilemedi.',
    invitesFailed: 'Davet listesi getirilemedi.',
    sessionsFailed: 'Oturum listesi getirilemedi.',
    permissionsFailed: 'İzin listesi getirilemedi.',
    trailFailed: 'İşlem geçmişi getirilemedi.',
    summaryFailed: 'Özet sayılar hesaplanamadı.',
  },
} as const)
