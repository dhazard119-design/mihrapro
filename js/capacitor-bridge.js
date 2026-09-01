/* =====================================================================
   MİHRAP — CAPACITOR KÖPRÜSÜ (Native ↔ Web uyarlayıcı)
   ---------------------------------------------------------------------
   Bu dosya, uygulamanın hem tarayıcıda (PWA) hem de Android APK'da
   (Capacitor/WebView) sorunsuz çalışmasını sağlar.

   Kural: Her fonksiyon "zarifçe geri düşer".
   - APK'da (Capacitor yüklü)  → native eklenti kullanılır.
   - Tarayıcıda (Capacitor yok) → Web API kullanılır (eski davranış).
   - Hiçbiri yoksa              → sessizce null/false döner (asla hata fırlatmaz).

   Kapsanan native eklentiler:
   - @capacitor/local-notifications  → ezan/hatırlatıcı bildirimleri (APK'da)
   - @capacitor/geolocation          → konum (kıble, cami, şehir)
   - @capacitor/app                  → Android geri butonu
   - @capacitor/status-bar           → durum çubuğu rengi (çentik uyumu)
===================================================================== */

(function (global) {
  "use strict";

  /* — Capacitor var mı ve native platformda mıyız? — */
  function cap() {
    try {
      return global.Capacitor || null;
    } catch (e) { return null; }
  }

  function isNative() {
    const c = cap();
    if (!c) return false;
    try {
      if (typeof c.isNativePlatform === "function") return c.isNativePlatform();
      return !!(c.platform && c.platform !== "web");
    } catch (e) { return false; }
  }

  /* — Bir native eklentiyi güvenle al (yoksa null) — */
  function plugin(name) {
    try {
      const c = cap();
      if (!c || !c.Plugins || !c.Plugins[name]) return null;
      return c.Plugins[name];
    } catch (e) { return null; }
  }

  const LN = plugin("LocalNotifications");
  const Geo = plugin("Geolocation");
  const App = plugin("App");
  const SB = plugin("StatusBar");

  /* — Sabitler — */
  // Bildirim sesi: android/app/src/main/res/raw/ezan.mp3 dosyasına denk gelir.
  // Dosya yoksa Android varsayılan bildirim sesini kullanır (hata vermez).
  const NOTIFICATION_SOUND = "ezan";

  // Profesyonel kanal ayrımı: kullanıcı Android ayarlarından her türü ayrı yönetebilir.
  const CHANNELS = [
    { id: "ezan",        name: "Ezan Vakitleri", description: "Namaz vakti ve ezan bildirimleri", sound: NOTIFICATION_SOUND },
    { id: "hatirlatma",  name: "Hatırlatmalar",  description: "Önemli günler, dini günler ve kişisel hatırlatmalar", sound: NOTIFICATION_SOUND },
    { id: "genel",       name: "Genel",          description: "Test, bilgilendirme ve diğer bildirimler", sound: NOTIFICATION_SOUND },
  ];
  const NOTIFICATION_CHANNEL = "ezan"; // geriye dönük uyumluluk için varsayılan

  // Her vakit için sabit bildirim kimliği (aynı vakit tekrar tekrar planlanmasın)
  const PRAYER_IDS = { Imsak: 1001, Dhuhr: 1002, Asr: 1003, Maghrib: 1004, Isha: 1005 };

  // Yeniden başlatma sonrası native tarafın okuyacağı kalıcı plan anahtarı
  const SCHEDULE_PREFS_KEY = "mihrap:prayer-schedule";

  const M = {};

  /* =====================================================================
     0) BİLDİRİM KANALLARI — Android 8+ (API 26+) kanal olmadan bildirim
        GÖSTERMEZ. schedule/notify öncesi mutlaka bir kez oluşturulmalı.
        Kullanıcı Android ayarlarından her kanalın sesini/titreşimini ayrı
        yönetebilir (profesyonel ayrım).
  ===================================================================== */
  let channelsCreated = false;
  async function ensureChannels() {
    try {
      if (channelsCreated) return;
      if (!isNative() || !LN) return;
      if (typeof LN.createChannel === "function") {
        for (const ch of CHANNELS) {
          try {
            await LN.createChannel({
              id: ch.id,
              name: ch.name,
              description: ch.description,
              importance: 5,          // MAX → sesli + başlıkla görünür
              visibility: 1,          // PUBLIC
              sound: ch.sound,
              vibration: true,
              lights: true,
              lightColor: "#D4AF37",
            });
          } catch (e) { /* tek kanal hatası diğerlerini engellemesin */ }
        }
      }
      channelsCreated = true;
    } catch (e) { /* kanallar oluşturulamadı → bildirimler yine de denenir */ }
  }

  function ensureChannel() { ensureChannels(); } // geriye dönük uyumluluk
  M.ensureChannels = ensureChannels;
  M.ensureChannel = ensureChannel;

  /* =====================================================================
     1) BİLDİRİM İZNİ
  ===================================================================== */
  M.isNative = isNative;

  M.notifySupported = function () {
    if (isNative()) return !!LN;
    return typeof global.Notification !== "undefined";
  };

  M.requestNotifyPermission = async function () {
    try {
      if (isNative() && LN) {
        if (typeof LN.requestPermissions !== "function") return true;
        const res = await LN.requestPermissions();
        return !res || res.display === "granted";
      }
      // Web yolu
      if (typeof global.Notification === "undefined") return false;
      if (global.Notification.permission === "granted") return true;
      if (global.Notification.permission === "denied") return false;
      const p = await global.Notification.requestPermission();
      return p === "granted";
    } catch (e) {
      return false;
    }
  };

  /* =====================================================================
     2) ANINDA BİLDİRİM (uygulama açıkken)
  ===================================================================== */
  M.notifyNow = function (title, body, opts) {
    opts = opts || {};
    try {
      if (isNative() && LN) {
        ensureChannels();
        const id = opts.id || (Date.now() % 100000);
        const n = {
          id: id,
          title: title,
          body: body,
          schedule: { at: new Date(Date.now() + 800) },
          channelId: opts.channelId || "genel",
        };
        if (opts.sound !== false) n.sound = opts.sound || NOTIFICATION_SOUND;
        LN.schedule({ notifications: [n] });
        return;
      }
      if (typeof global.Notification !== "undefined" &&
          global.Notification.permission === "granted") {
        const n = new global.Notification(title, {
          body: body,
          tag: opts.tag,
        });
        return;
      }
    } catch (e) { /* sessiz */ }
  };

  /* =====================================================================
     2b) TEST BİLDİRİMİ — "Bildirimleri test et" butonu için.
         Şimdiden `delayMs` milisaniye sonra bildirim planlar.
         Kullanıcı butona basar, birkaç saniye sonra bildirim gelir.
  ===================================================================== */
  M.scheduleTestNotification = function (delayMs) {
    try {
      if (!isNative() || !LN) return false;
      ensureChannels();
      const id = 99001; // sabit test kimliği (tekrarlanınca öncekini ezer)
      LN.schedule({
        notifications: [{
          id: id,
          title: "Mihrap — Test Bildirimi 🕌",
          body: "Bildirimler çalışıyor! Vakit geldiğinde bu şekilde haber alacaksınız.",
          schedule: { at: new Date(Date.now() + (delayMs || 10000)) },
          channelId: "genel",
          sound: NOTIFICATION_SOUND,
        }],
      });
      return true;
    } catch (e) { return false; }
  };

  /* =====================================================================
     3) VAKİT BİLDİRİMLERİNİ PLANLA (uygulama kapalıyken de çalışır — APK)
        times  : { Imsak:"04:12", Dhuhr:"12:18", ... }
        prayers: [{ key, tr, enabled }]
  ===================================================================== */
  M.schedulePrayerTimes = function (times, prayers) {
    try {
      if (!isNative() || !LN) return;
      if (!times) return;
      ensureChannels();

      // Önce aynı kimlikli eski planları temizle (tekrarı önler — atomik zincir)
      const ids = Object.values(PRAYER_IDS);
      if (typeof LN.cancel === "function") {
        LN.cancel({ notifications: ids.map((id) => ({ id })) });
      }

      const now = new Date();
      const notifs = [];

      prayers.forEach((p) => {
        if (p.enabled === false) return;
        const t = times[p.key];
        if (!t) return;
        const parts = t.split(":").map(Number);
        if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return;
        const at = new Date();
        at.setHours(parts[0], parts[1], 0, 0);
        if (at <= now) at.setDate(at.getDate() + 1); // geçtiyse yarına al

        notifs.push({
          id: PRAYER_IDS[p.key],
          title: `${p.tr} ezanı vakti geldi 🕌`,
          body: `${p.tr} ezan vakti (${t}) — namazınızı kılmayı unutmayın.`,
          schedule: { at, allowWhileIdle: true }, // Doze modunda da tetiklenir
          sound: NOTIFICATION_SOUND,
          channelId: "ezan",
        });
      });

      if (notifs.length && typeof LN.schedule === "function") {
        LN.schedule({ notifications: notifs });
      }

      // Yeniden başlatma sonrası native BootReceiver'ın okuyacağı kalıcı planı yaz
      persistSchedule(notifs);
    } catch (e) { /* sessiz */ }
  };

  /* Planlanmış tüm vakit bildirimlerini temizle */
  M.clearPrayerSchedule = function () {
    try {
      if (!isNative() || !LN || typeof LN.cancel !== "function") return;
      const ids = Object.values(PRAYER_IDS);
      LN.cancel({ notifications: ids.map((id) => ({ id })) });
    } catch (e) { /* sessiz */ }
    // Kalıcı planı da temizle (yeniden başlatmada eski vakitler canlanmasın)
    try { if (isNative() && plugin("Preferences")) plugin("Preferences").remove({ key: SCHEDULE_PREFS_KEY }); } catch (e) {}
  };

  /* Planlanan vakitleri SharedPreferences'a yaz → BootReceiver okur */
  function persistSchedule(notifs) {
    try {
      if (!isNative()) return;
      const Prefs = plugin("Preferences");
      if (!Prefs) return;
      const data = notifs.map((n) => ({
        id: n.id, title: n.title, body: n.body,
        atMillis: n.schedule && n.schedule.at ? new Date(n.schedule.at).getTime() : 0,
        channelId: n.channelId || "ezan",
      }));
      Prefs.set({ key: SCHEDULE_PREFS_KEY, value: JSON.stringify(data) });
    } catch (e) { /* sessiz */ }
  }

  /* Exact alarm (Android 12+) durumunu bildir — manifest izni ile birlikte çalışır */
  M.exactAlarmSupported = function () {
    // Capacitor local-notifications, Android 12+ üzerinde exact alarm için
    // SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM iznini gerektirir (manifest'te).
    // Bu değer yalnızca bilgi amaçlıdır; izin gerçekte manifest + sistem ayarına bağlıdır.
    return isNative() && !!LN;
  };

  /* =====================================================================
     4) KONUM (kıble, cami, "konumumu kullan")
     opts: { enableHighAccuracy, timeout }
     döner: { lat, lng } veya null
  ===================================================================== */
  M.getPosition = async function (opts) {
    opts = opts || {};
    try {
      if (isNative() && Geo) {
        if (typeof Geo.requestPermissions === "function") {
          try { await Geo.requestPermissions(); } catch (e) { /* devam */ }
        }
        if (typeof Geo.getCurrentPosition !== "function") return null;
        const pos = await Geo.getCurrentPosition({
          enableHighAccuracy: opts.enableHighAccuracy !== false,
          timeout: opts.timeout || 10000,
        });
        if (pos && pos.coords) {
          return { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
        return null;
      }
      // Web yolu
      if (!global.navigator || !global.navigator.geolocation) return null;
      const p = await new Promise((resolve, reject) => {
        global.navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: opts.enableHighAccuracy !== false,
          timeout: opts.timeout || 10000,
        });
      });
      return { lat: p.coords.latitude, lng: p.coords.longitude };
    } catch (e) {
      return null;
    }
  };

  /* =====================================================================
     5) ANDROID GERİ BUTONU
     handler(done) — done() çağrılırsa native varsayılan davranışa bırakır.
     Döner: fonksiyon dinleyiciyi kaldırır (unsubscribe) veya null.
  ===================================================================== */
  M.onBackButton = function (handler) {
    try {
      if (isNative() && App && typeof App.addListener === "function") {
        const sub = App.addListener("backButton", (info) => {
          const done = () => {
            if (typeof App.exitApp === "function" && !(info && info.canGoBack)) {
              // WebView geçmişi yoksa uygulamayı arka plana al (varsayılan)
              try { App.minimizeApp && App.minimizeApp(); } catch (e) { /* yok */ }
            }
          };
          handler(done);
        });
        return typeof sub.remove === "function" ? () => sub.remove() : null;
      }
      // Tarayıcıda geri butonu yok → hiçbir şey
      return null;
    } catch (e) { return null; }
  };

  /* =====================================================================
     6) DURUM ÇUBUĞU (çentik/üst boşluk uyumu)
  ===================================================================== */
  M.setupStatusBar = function (bgColor) {
    try {
      if (!isNative() || !SB) return;
      if (typeof SB.setBackgroundColor === "function") {
        SB.setBackgroundColor({ color: bgColor || "#0a1220" });
      }
      if (typeof SB.setStyle === "function") {
        SB.setStyle({ style: "DARK" });
      }
    } catch (e) { /* sessiz */ }
  };

  /* =====================================================================
     7) KALICI TERCHİ (localStorage ↔ native Preferences)
        APK'da WebView verisi bazen silinebilir; native tercih daha güvenli.
        Ama localStorage APK'da da çoğunlukla korunur — bu yardımcıdır.
  ===================================================================== */
  M.prefGet = async function (key) {
    try {
      if (isNative() && plugin("Preferences")) {
        const r = await plugin("Preferences").get({ key: key });
        return r && r.value != null ? r.value : null;
      }
      return null;
    } catch (e) { return null; }
  };

  M.prefSet = async function (key, value) {
    try {
      if (isNative() && plugin("Preferences")) {
        await plugin("Preferences").set({ key: key, value: String(value) });
        return true;
      }
      return false;
    } catch (e) { return false; }
  };

  /* =====================================================================
     8) UYGULAMA ÇIKIŞI / ARKA PLANA AL
  ===================================================================== */
  M.minimizeApp = function () {
    try {
      if (isNative() && App) {
        if (typeof App.minimizeApp === "function") { App.minimizeApp(); return; }
        if (typeof App.exitApp === "function") { App.exitApp(); }
      }
    } catch (e) { /* sessiz */ }
  };

  /* =====================================================================
     9) ANDROID WIDGET KONUM SENKRONU
        Uygulamada konum değişince ana ekran widget'ı da aynı şehri göstersin.
        Native taraf: android-widget köprüsü Capacitor'a "MihrapWidget"
        adlı özel eklenti olarak kaydolur ve setLocation(name, lat, lng)
        sunar; buradan TimesFetcher.setLocation() çağrılır.
        Eklenti yoksa sessizce false döner (PWA/tarayıcıda hiçbir şey olmaz).
  ===================================================================== */
  M.setWidgetLocation = function (name, lat, lng) {
    try {
      const p = plugin("MihrapWidget");
      if (!p) return false;
      const args = { name: String(name || ""), lat: Number(lat), lng: Number(lng) };
      if (p && typeof p.setLocation === "function") { p.setLocation(args); return true; }
      if (typeof p === "function") { p(args); return true; }
      return false;
    } catch (e) { return false; }
  };

  /* Global olarak dışa aç — hem window hem globalThis (uyumluluk için) */
  try { global.MihrapNative = M; } catch (e) {}
  try { if (typeof globalThis !== "undefined") globalThis.MihrapNative = M; } catch (e) {}

})(typeof window !== "undefined" ? window : globalThis);
