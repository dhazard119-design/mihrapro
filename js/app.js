/* ===================================================================
   MİHRAP — Ezan Vakti & İslami Yaşam
   Adım 4: Çok Ekranlı Uygulama (Vanilla JS, modülsüz)
   -------------------------------------------------------------------
   1. Vakit verisi   → Aladhan API (method=13, Diyanet uyumlu) + yedek
   2. Tema motoru    → cihaz saatine göre arka plan / palet (crossfade)
   3. Geri sayım     → SVG halkası + kalan süre (her saniye)
   4. İçerik         → window.MIHRAP_CONTENT (data/content.js) → DOM
   5. Ekran router   → bottom nav ile ekran geçişleri
   6. Aylık takvim   → Aladhan calendar endpoint
   7. Kıble pusulası → geolocation + deviceorientation + bearing
   8. Esma & Kıssa   → tam listeler, arama, detay modal
   =================================================================== */

"use strict";

/* -------------------------------------------------------------------
   1) SABİTLER & YAPILANDIRMA
------------------------------------------------------------------- */
const PRAYERS = [
  { key: "Imsak",   tr: "İmsak",   ar: "الفجر",   fard: true  },
  { key: "Sunrise", tr: "Güneş",   ar: "الشروق",  fard: false },
  { key: "Dhuhr",   tr: "Öğle",    ar: "الظهر",   fard: true  },
  { key: "Asr",     tr: "İkindi",  ar: "العصر",   fard: true  },
  { key: "Maghrib", tr: "Akşam",   ar: "المغرب",  fard: true  },
  { key: "Isha",    tr: "Yatsı",   ar: "العشاء",  fard: true  },
];

const FARD_KEYS = ["Imsak", "Dhuhr", "Asr", "Maghrib", "Isha"];
const RING_CIRCUMFERENCE = 2 * Math.PI * 88; // ≈ 552.92
const KAABA = { lat: 21.4225, lng: 39.8262 };

const FALLBACK_TIMES = {
  Imsak: "04:12", Sunrise: "05:42", Dhuhr: "12:18",
  Asr: "15:42", Maghrib: "18:35", Isha: "20:02",
};

const LOCATIONS = window.MIHRAP_LOCATIONS || [];

/* Varsayılan konum: Ağrı (plaka 4) — Merkez ilçe */
function defaultLocation() {
  const prov = LOCATIONS.find((p) => p.p === 4) || LOCATIONS[0];
  if (!prov) return { name: "Ağrı", lat: 39.7191, lng: 43.0503 };
  const dist = prov.d[0];
  return { name: `${prov.n} · ${dist.n}`, lat: dist.lat, lng: dist.lng, province: prov.n, district: dist.n };
}

const THEMES = {
  dawn:    { bg: ["#1c2f45", "#3d5a78", "#7d93ad", "#b9c8d6"], accent: "#9cc0e4", tint: "rgba(150,190,235,.20)", twinkle: 0    },
  day:     { bg: ["#16324f", "#25608c", "#4f92c4", "#a8d1ec"], accent: "#8ecdf0", tint: "rgba(120,190,255,.22)", twinkle: 0    },
  asr:     { bg: ["#4a2a14", "#9a5b1f", "#d99a3c", "#f2c879"], accent: "#f0c060", tint: "rgba(255,190,90,.24)",  twinkle: 0    },
  maghrib: { bg: ["#2a1333", "#7a2d3f", "#b95a2e", "#f0a24a"], accent: "#f0a24a", tint: "rgba(255,120,50,.18)",  twinkle: 0    },
  isha:    { bg: ["#060a16", "#0b1e33", "#14304a", "#254a6b"], accent: "#3f6fb0", tint: "rgba(60,110,190,.20)",  twinkle: 0.55 },
  emerald: { bg: ["#04170f", "#0a3a26", "#156b45", "#2aa06a"], accent: "#3ddc97", tint: "rgba(58,220,150,.22)",  twinkle: 0    }, // İslami Yeşil (reklamla açılır)
};

/* İçerik: data/content.js gömülüyse onu kullan; yoksa minimal yedek */
const CONTENT = window.MIHRAP_CONTENT || {
  hadisler: [], sunnetler: [], esmaulHusna: [], kissalar: [],
};

/* ===================================================================
   YAYIN YAPILANDIRMASI — yayınlamadan önce bu bloğu güncelle
   =================================================================== */
const APP_NAME = "Mihrap";
const APP_URL = "https://mihrap.app"; // ← Gerçek yayın linkin (paylaşım kartında "İndir:" olarak görünür)
const ADHAN_URL = ""; // ← Gerçek bir ezan MP3 linki koy (telifsiz/izinli). Boş kalırsa Web Audio ile nağme çalınır.

/* — Ezan sesi seçenekleri (gerçek ezan + 2 sentez nağme) — */
const ADHAN_STYLES = [
  { id: "gercek", name: "Gerçek Ezân (Ayasofya)", desc: "Ayasofya'da okunan hakiki ezan kaydı (Diyanet TV)" },
  { id: "hicaz", name: "Hicaz (Klasik)", desc: "Geleneksel, hürmetli hicaz makamı nağmesi" },
  { id: "rast", name: "Rast (Tok)", desc: "Daha tok ve geniş rast makamı nağmesi" },
];
const ADHAN_STYLE_KEY = "mihrap:adhan-style";
const ADHAN_CUSTOM_KEY = "mihrap:adhan-custom-url";
const SPECIAL_REMINDER_KEY = "mihrap:special-reminder";
let adhanStyle = "gercek";      // seçili ezan stili (varsayılan: gerçek ezan)
let adhanCustomUrl = "";        // kullanıcının kendi ezan MP3 linki (opsiyonel, önceliklidir)

/* — Tek çalma yönetimi: aynı anda yalnızca BİR ses çalar — */
let activeAudio = null;         // şu an çalan HTMLAudioElement (ezan/özel ses)
let adhanSynthStop = null;      // sentez nağmeyi durduran fonksiyon (master gain disconnect)
let stopBtnVisible = false;     // küçük durdurma butonunun görünürlüğü
let adhanPreviewActive = false; // ayarlar ekranındaki önizleme sesi aktif mi (çıkınca durdur)
const NOTIFY_STORAGE_KEY = "mihrap:notify";
const NOTIFY_SAHUR_KEY = "mihrap:notify-sahur";
const NOTIFY_IFTAR_KEY = "mihrap:notify-iftar";
const TIMES_CACHE_KEY = "mihrap:times-cache"; // son alınan vakitler (offline yedek)
const BIG_TEXT_KEY = "mihrap:big-text"; // büyük yazı modu (erişilebilirlik)
const NOTIFY_PRAYERS_KEY = "mihrap:notify-prayers"; // her vakit için ayrı bildirim tercihi
const METAL_PRICES_KEY = "mihrap:metal-prices"; // son bilinen altın/gümüş fiyatı (offline yedek)
const ONESIGNAL_APP_ID = ""; // ← OneSignal App ID'ni buraya koyunca push bildirim etkinleşir (uygulama kapalıyken ezan bildirimi)

/* — AI Asistan (Google Gemini) — */
const AI_KEY_STORAGE_KEY = "mihrap:gemini-key";
const AI_HISTORY_KEY = "mihrap:ai-history";
// Google modelleri sık emekliye ayırır; sırayla dener, çalışanı kullanırız.
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.5-flash"];
const AI_SYSTEM_PROMPT = [
  "Sen, 'Mihrap' adlı İslami yaşam uygulamasının dini soru-cevap asistanısın.",
  "YALNIZCA ve YALNIZCA İslam dini ile ilgili sorulara cevap verirsin. Kapsam: Kur'an-ı Kerim, tefsir, hadis, sünnet, siyer (Peygamber hayatı), fıkıh, itikat (inanç), ibadetler (namaz, oruç, zekât, hac, umre, abdest, gusül, tesettür), dua, zikir, ahlak, aile ve evlilik hayatı, helal-haram, faiz, ticaret ahlakı, kandil ve bayramlar, mezhepler arası farklar gibi konular.",
  "Dini OLMAYAN herhangi bir soru gelirse (spor, siyaset, teknoloji, matematik, programlama, hava durumu, tıbbi teşhis, yemek tarifi, kişisel/finansal tavsiye vb.) kibarca ama net biçimde reddet ve soruyu İslam ile ilgili bir konuya yönlendir. Örneğin: 'Ben yalnızca dini sorulara cevap veriyorum. Namaz, oruç, zekât, Kur'an veya günlük hayata dair dini bir konu sormak ister misiniz?'",
  "Cevaplarında Kur'an ayetlerine ve sahih hadislere dayan; Diyanet İşleri Başkanlığı'nın genel görüşüne uygun ol; varsa mezhep farklılıklarını saygılı şekilde belirt.",
  "Emin olmadığın veya ihtilaflı bir konuda kesin hüküm verme; 'Kesin bilgi için bir din âlimine veya Diyanet'e danışmanız doğru olur.' şeklinde uyar.",
  "Kısa, anlaşılır, saygılı ve nazik bir dille Türkçe cevap ver. Gerektiğinde ayet/hadis numarasını kaynağıyla belirt.",
].join("\n");
const AI_DISCLAIMER = "Bu bir yapay zekâ yanıtıdır; kesin hüküm için bir din âlimine danışınız.";
const AI_PROXY_URL = "/api/gemini"; // Netlify (redirect) + Vercel'de aynı yol — anahtarsız kullanım
// APK'da "/api/gemini" (göreli) çalışmaz; aşağıya Netlify/Vercel adresinizi
// yazarsanız (ör. "https://mihrap.netlify.app/api/gemini") APK'da da anahtarsız çalışır.
// Boş bırakılırsa APK'da Ayarlar → kendi Gemini anahtarınız (BYOK) kullanılır.
const AI_PROXY_ABS_URL = "https://mihrapro.vercel.app/api/gemini"; // canlı deploy adresi (Vercel)

/* — Tema kilidi (reklamla açılan İslami Yeşil) — */
const THEME_OVERRIDE_KEY = "mihrap:theme-override";
const THEMES_UNLOCKED_KEY = "mihrap:themes-unlocked";

/* — İkonlar (paylaşım + seslendirme butonları) — */
const ICON_SHARE = '<svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/></svg>';
const ICON_SPEAK = '<svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>';

/* — Hicri takvim & özel günler — */
const HIJRI_MONTHS_TR = ["Muharrem","Safer","Rebiülevvel","Rebiülahir","Cemaziyelevvel","Cemaziyelahir","Recep","Şaban","Ramazan","Şevval","Zilkade","Zilhicce"];
const GREG_MONTHS_TR = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

/* -------------------------------------------------------------------
   2) DURUM
------------------------------------------------------------------- */
const state = {
  times: null,
  location: null,
  currentTheme: null,
  daily: {},   // bugünün hadis/sünnet/esma verileri (paylaşım için)
  notifyEnabled: false, // ezan bildirimi açık mı
  audioCtx: null,       // Web Audio bağlamı (ezan sesi)
  firedId: null,        // aynı vakit için çift tetiklemeyi önler
  heading: 0,             // cihaz pusulası (derece, kuzeyden saat yönü)
  qiblaBearing: null,     // kıble açısı
  hasCompass: false,
  calendar: { month: null, year: null, data: {} }, // "YYYY-MM-DD" -> timings
  selectedDay: null,                               // { y, m, d }
  hijri: null,            // bugünün hicri tarihi { day, month, year, weekday, monthName }
  specialDay: null,       // özel gün bilgisi (cuma/kandil/bayram/ramazan)
  imsakiyeLoaded: false,  // imsakiye tablosu yüklendi mi
  hatim: null,            // okunan cüzler (Set)
  aiKey: "",              // Google Gemini API anahtarı
  aiHistory: [],          // [{ role: "user"|"model", text }]
  aiBusy: false,          // cevap bekleniyor mu
  themeOverride: null,    // manuel tema seçimi (ör. "emerald"); null = otomatik
  unlockedThemes: [],     // reklamla açılan temalar (ör. ["emerald"])
  ramadanActive: false,   // Ramazan modu aktif mi (Ramazan'dan 2 gün önce başlar)
  ramadanPreview: false,  // Önizleme modu (test için kartı şimdi gösterir)
  notifySahur: false,     // Sahur bildirimi açık mı (ayrı toggle)
  notifyIftar: false,     // İftar bildirimi açık mı (ayrı toggle)
  goldPrice: null,        // canlı gram altın (TL)
  silverPrice: null,      // canlı gram gümüş (TL)
  metalUpdatedAt: null,   // fiyatların son güncellenme zamanı
  notifyPrayers: { Imsak: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true }, // vakit bazında bildirim
  bigText: false,         // büyük yazı modu (erişilebilirlik)
  lastDailyKey: null,     // günlük içeriğin son üretildiği gün (00:00 yenileme için)
  specialReminder: true,  // önemli gün hatırlatması bildirimi (1 gün önceden)
  lastSpecialCheck: null, // önemli gün kontrolünün son yapıldığı gün (günde bir kez)
};

/* -------------------------------------------------------------------
   3) YARDIMCILAR
------------------------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);

/* — Native (Capacitor) köprüsü — APK'da native, tarayıcıda web API kullanır — */
function native() {
  if (typeof MihrapNative !== "undefined") return MihrapNative;
  if (typeof window !== "undefined" && window.MihrapNative) return window.MihrapNative;
  return null;
}

/* Tek yönlü bildirim yardımcısı (web + native uyumlu) */
function notifyUser(title, body, opts) {
  const N = native();
  if (N && N.notifyNow) { N.notifyNow(title, body, opts); return; }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(title, { body: body, tag: opts && opts.tag }); } catch (e) {}
  }
}

/* Tek yönlü konum yardımcısı → { lat, lng } veya null */
function getDevicePosition(opts) {
  const N = native();
  if (N && N.getPosition) return N.getPosition(opts);
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      Object.assign({ enableHighAccuracy: true, timeout: 10000 }, opts)
    );
  });
}
const pad = (n) => String(n).padStart(2, "0");

function timeToDate(hhmm, base = new Date()) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}
function dayOfYear(d = new Date()) {
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
}
function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map(pad).join(":");
}
function gradientOf(c) { return `linear-gradient(180deg, ${c[0]}, ${c[1]} 40%, ${c[2]} 75%, ${c[3]} 115%)`; }
function validTimes(t) { return !!t && PRAYERS.every((p) => /^\d{2}:\d{2}$/.test(t[p.key])); }

/* -------------------------------------------------------------------
   4) TEMA MOTORU — yumuşak crossfade
------------------------------------------------------------------- */
function applyTheme(theme) {
  if (!THEMES[theme] || theme === state.currentTheme) return;
  const next = THEMES[theme];
  const old = state.currentTheme ? THEMES[state.currentTheme] : next;

  const fade = document.createElement("div");
  fade.className = "bg-fade";
  fade.style.background = gradientOf(old.bg);
  $(".bg-scene").appendChild(fade);

  const st = document.body.style;
  st.setProperty("--bg-a", next.bg[0]);
  st.setProperty("--bg-b", next.bg[1]);
  st.setProperty("--bg-c", next.bg[2]);
  st.setProperty("--bg-d", next.bg[3]);
  st.setProperty("--accent", next.accent);
  st.setProperty("--scene-tint", next.tint);
  st.setProperty("--twinkle", next.twinkle);
  document.body.dataset.time = theme;
  state.currentTheme = theme;

  requestAnimationFrame(() => (fade.style.opacity = "0"));
  fade.addEventListener("transitionend", () => fade.remove(), { once: true });
  setTimeout(() => fade.remove(), 1600);
}

function getThemeFor(times) {
  const now = new Date();
  if (now < timeToDate(times.Imsak))   return "isha";
  if (now < timeToDate(times.Sunrise)) return "dawn";
  if (now < timeToDate(times.Asr))     return "day";
  if (now < timeToDate(times.Maghrib)) return "asr";
  if (now < timeToDate(times.Isha))    return "maghrib";
  return "isha";
}

/* Manuel tema override — reklamla açılan temalar */
function isThemeUnlocked(theme) { return state.unlockedThemes.includes(theme); }

function resolveTheme() {
  if (state.themeOverride && isThemeUnlocked(state.themeOverride)) {
    return state.themeOverride;
  }
  if (!state.times) return null;
  return getThemeFor(state.times);
}

function persistThemeState() {
  try {
    localStorage.setItem(THEME_OVERRIDE_KEY, state.themeOverride || "");
    localStorage.setItem(THEMES_UNLOCKED_KEY, JSON.stringify(state.unlockedThemes));
  } catch (e) {}
}

function setThemeOverride(theme) {
  state.themeOverride = theme;
  persistThemeState();
  applyTheme(resolveTheme());
}

function clearThemeOverride() {
  state.themeOverride = null;
  persistThemeState();
  applyTheme(resolveTheme());
}

function unlockTheme(theme) {
  if (!isThemeUnlocked(theme)) {
    state.unlockedThemes.push(theme);
    persistThemeState();
  }
}

/* -------------------------------------------------------------------
   5) GERİ SAYIM, HALKALAR, VAKİT LİSTESİ
------------------------------------------------------------------- */
function getSchedule(times) {
  const now = new Date();
  const fard = FARD_KEYS.map((k) => ({ key: k, date: timeToDate(times[k]) }));
  let next = fard.find((p) => p.date > now);
  if (!next) {
    const t = timeToDate(times.Imsak);
    t.setDate(t.getDate() + 1);
    next = { key: "Imsak", date: t };
  }
  const idx = FARD_KEYS.indexOf(next.key);
  const prev = fard.find((p) => p.key === FARD_KEYS[(idx - 1 + FARD_KEYS.length) % FARD_KEYS.length]);
  if (prev.date > now) prev.date.setDate(prev.date.getDate() - 1);
  return { next, prev };
}

function renderTimesList(times, containerId, { isToday = false } = {}) {
  const now = new Date();
  const { next } = isToday ? getSchedule(times) : { next: null };
  document.getElementById(containerId).innerHTML = PRAYERS.map((p) => {
    const d = timeToDate(times[p.key]);
    let cls = "time-row";
    if (isToday && p.key === next.key) cls += " time-row--active";
    else if (isToday && d < now) cls += " time-row--done";
    const badge = (isToday && p.key === next.key) ? '<span class="time-row__badge">Sıradaki</span>' : "";
    return `<li class="${cls}">
      <span class="time-row__name"><span class="time-row__ar">${p.ar}</span>${p.tr}</span>
      <span class="time-row__right"><span class="time-row__time">${times[p.key]}</span>${badge}</span>
    </li>`;
  }).join("");
}

function updateHero(times) {
  const { next } = getSchedule(times);
  const p = PRAYERS.find((x) => x.key === next.key);
  $("#nextPrayerName").textContent = p.tr;
  $("#nextPrayerArabic").textContent = p.ar;
  $("#nextPrayerTime").textContent = `${times[next.key]}'e kalan`;
}

function tick() {
  // Gün değişti mi? (00:00'da günlük hadis/sünnet/kıssa + tarih + vakitleri yenile)
  try { checkDayRollover(); } catch (e) {}
  try { checkReminders(); } catch (e) {}
  try { checkSpecialDayReminders(); } catch (e) {}
  if (!state.times) return;
  const { next, prev } = getSchedule(state.times);
  const now = new Date();
  $("#countdown").textContent = fmtCountdown(next.date - now);
  const period = next.date - prev.date;
  const progress = period > 0 ? Math.min(1, Math.max(0, (now - prev.date) / period)) : 0;
  $("#ringProgress").style.strokeDashoffset = (RING_CIRCUMFERENCE * (1 - progress)).toFixed(2);
  applyTheme(resolveTheme());
  updateRamadanCountdown();
  if (next.date - now <= 0) {
    // Vakit geldi → ezan bildirimi (opsiyonel)
    const fireId = `${next.key}-${next.date.toDateString()}`;
    if (state.firedId !== fireId) {
      state.firedId = fireId;
      fireAdhan(next.key);
      fireRamadanAlert(next.key);
    }
    renderTimesList(state.times, "prayerTimesList", { isToday: true });
    updateHero(state.times);
  }
}

/* -------------------------------------------------------------------
   6) TARİH & HİCRİ & ÖZEL GÜNLER
------------------------------------------------------------------- */
function updateDate() {
  const now = new Date();
  $("#greetingDate").textContent = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(now);
  let hijri = "Hicri takvim desteklenmiyor";
  try {
    hijri = new Intl.DateTimeFormat("tr-TR-u-ca-islamic-umalqura", {
      day: "numeric", month: "long", year: "numeric",
    }).format(now);
  } catch (e) {}
  $("#greetingHijri").textContent = hijri;
}

/* Aladhan gToH ile belirli bir günün hicri tarihini çek (daha doğru + ay adı Türkçe) */
async function fetchHijriFor(dateStr) {
  try {
    const res = await fetch(`https://api.aladhan.com/v1/gToH/${dateStr}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const h = (await res.json()).data.hijri;
    const m = Number(h.month.number);
    return {
      day: Number(h.day),
      month: m,
      year: Number(h.year),
      weekday: h.weekday.en || "",
      monthName: HIJRI_MONTHS_TR[m - 1] || h.month.en,
    };
  } catch (e) {
    console.warn("[Mihrap] Hicri tarih alınamadı:", e.message);
    return null;
  }
}

async function fetchHijriToday() {
  const d = new Date();
  const dd = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  return fetchHijriFor(dd);
}

/* Özel gün tespiti: bayram > kadir > kandil > ramazan > aşure > cuma */
function detectSpecialDay(h) {
  if (!h) return null;
  const m = h.month, day = h.day;
  const isFriday = /juma/i.test(h.weekday);
  const k = (name) => (CONTENT.kandiller || []).find((x) => x.isim === name);

  if (m === 10 && day >= 1 && day <= 3)
    return { type: "bayram", icon: "🌙", title: "Ramazan Bayramınız Mübarek Olsun", text: "Şevval 1-3 · Ramazan Bayramı" };
  if (m === 12 && day >= 10 && day <= 13)
    return { type: "bayram", icon: "🕋", title: "Kurban Bayramınız Mübarek Olsun", text: "Zilhicce 10-13 · Kurban Bayramı" };
  if (m === 9 && day === 27) {
    const kd = k("Kadir Gecesi");
    return { type: "kandil", icon: "✨", title: "Kadir Geceniz Mübarek Olsun", text: kd ? kd.mesaj : "Ramazan 27 · Kadir Gecesi" };
  }
  if (m === 7 && day === 27) {
    const kd = k("Miraç Kandili");
    return { type: "kandil", icon: "🕌", title: "Miraç Kandiliniz Mübarek Olsun", text: kd ? kd.mesaj : "Recep 27 · Miraç Kandili" };
  }
  if (m === 8 && day === 15) {
    const kd = k("Berat Kandili");
    return { type: "kandil", icon: "🌙", title: "Berat Kandiliniz Mübarek Olsun", text: kd ? kd.mesaj : "Şaban 15 · Berat Kandili" };
  }
  if (m === 3 && day === 12) {
    const kd = k("Mevlid Kandili");
    return { type: "kandil", icon: "💚", title: "Mevlid Kandiliniz Mübarek Olsun", text: kd ? kd.mesaj : "Rebiülevvel 12 · Mevlid Kandili" };
  }
  if (m === 7 && isFriday && day <= 7) {
    const kd = k("Regaib Kandili");
    return { type: "kandil", icon: "🌟", title: "Regaib Kandiliniz Mübarek Olsun", text: kd ? kd.mesaj : "Recep ayının ilk Cuma gecesi · Regaib Kandili" };
  }
  if (m === 9)
    return { type: "ramadan", icon: "🌙", title: "Ramazan-ı Şerif", text: `Ramazan ayındayız · ${day}. gün` };
  if (m === 1 && day === 10)
    return { type: "asure", icon: "🥣", title: "Aşure Gününüz Mübarek Olsun", text: "Muharrem 10 · Aşure Günü" };
  if (isFriday)
    return { type: "cuma", icon: "🕌", title: "Mübarek Cumalar", text: "Cuma gününüz mübarek olsun — bugünün faziletli amellerine gayret edelim." };
  return null;
}

function renderSpecialBanner(sp) {
  const banner = $("#specialBanner");
  if (!banner) return;
  if (!sp) { banner.hidden = true; return; }
  banner.hidden = false;
  $("#specialBannerIcon").textContent = sp.icon;
  $("#specialBannerTitle").textContent = sp.title;
  $("#specialBannerText").textContent = sp.text;
  banner.className = "special-banner card special-banner--" + sp.type;
}

async function updateSpecialDay() {
  const h = await fetchHijriToday();
  if (h) {
    state.hijri = h;
    // Hicri tarihi daha doğru sürümle güncelle
    const el = $("#greetingHijri");
    if (el) el.textContent = `${h.day} ${h.monthName} ${h.year}`;
  }
  const sp = detectSpecialDay(h);
  state.specialDay = sp;
  renderSpecialBanner(sp);
  await updateRamadanMode(h); // bugünün hicri verisini geçir (tekrar fetch etme)
}

/* — Ramazan modu: Ramazan'dan 2 gün önce başlar, Ramazan boyunca sürer — */
function hijriDateStr(date) {
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

async function updateRamadanMode(hToday) {
  // Bugün + sonraki 2 gün içinde Ramazan (ay 9) başlıyor mu?
  let daysUntil = -1; // -1 = yakın değil
  for (let off = 0; off <= 2; off++) {
    let h;
    if (off === 0 && hToday) {
      h = hToday; // bugünün hicri verisi zaten elimizde
    } else {
      const d = new Date();
      d.setDate(d.getDate() + off);
      h = await fetchHijriFor(hijriDateStr(d));
    }
    if (h && h.month === 9) { daysUntil = off; break; } // 0 = bugün Ramazan, 1/2 = yaklaşıyor
  }
  const active = daysUntil >= 0 && daysUntil <= 2;
  state.ramadanActive = active;
  renderRamadanHomeCard();
}

function renderRamadanHomeCard() {
  const card = $("#ramadanHomeCard");
  if (!card) return;
  const show = state.ramadanActive || state.ramadanPreview;
  if (!show) { card.hidden = true; return; }
  card.hidden = false;
  const inRamadan = state.hijri && state.hijri.month === 9;
  const sub = $("#ramadanHomeSub");
  if (state.ramadanPreview && !state.ramadanActive) {
    sub.textContent = "Önizleme · Ramazan yaklaşıyor · Sahur ve iftar vakitleri";
  } else if (inRamadan && state.hijri) {
    sub.textContent = `Ramazan ${state.hijri.day}. gün · Sahur ve iftar vakitleri`;
  } else {
    sub.textContent = "Ramazan yaklaşıyor · Sahur ve iftar vakitleri";
  }
}

/* -------------------------------------------------------------------
   7) GÜNLÜK İÇERİK (Hadis / Sünnet / Esma teaser)
------------------------------------------------------------------- */
function renderDailyContent() {
  const doy = dayOfYear();
  const pick = (arr) => (arr && arr.length ? arr[(doy - 1) % arr.length] : null);
  const hadith = pick(CONTENT.hadisler);
  const sunnah = pick(CONTENT.sunnetler);
  const kissa = pick(CONTENT.kissalar);
  state.daily = { hadith, sunnah, kissa };

  if (hadith) {
    $("#hadithArabic").textContent = hadith.arapca;
    $("#hadithText").textContent = `"${hadith.turkce}"`;
    $("#hadithSource").textContent = hadith.kaynak;
  }
  if (sunnah) {
    $("#sunnahTitle").textContent = sunnah.baslik;
    $("#sunnahText").textContent = sunnah.aciklama;
    $("#sunnahSource").textContent = sunnah.kaynak;
  }
  if (kissa) {
    $("#kissaTitle").textContent = kissa.baslik;
    $("#kissaText").textContent = kissa.ozet;
    $("#kissaSource").textContent = kissa.referans;
  }
}

/* — 00:00'da günlük içeriği otomatik yenile (sayfa yenilenmeden) — */
let currentLiving = null; // o an açık olan "İslamı Yaşamak" modülü
let livingBackHandler = null; // "Geri" butonu için özel dönüş adresi (örn. sure okuyucudan sure listesine)

function checkDayRollover() {
  const key = todayKey();
  if (!state.lastDailyKey) { state.lastDailyKey = key; return; }
  if (key === state.lastDailyKey) return;
  state.lastDailyKey = key;

  // 1) Günün hadis / sünnet / kıssa / esma'sını yenile
  try { renderDailyContent(); } catch (e) { console.warn("[Mihrap] Günlük içerik yenilenemedi:", e && e.message); }
  // 2) Tarih + hicri + özel gün banner'ı
  try { updateDate(); } catch (e) {}
  try { updateSpecialDay(); } catch (e) {}
  // 2b) Günlük hatırlatıcıları yeni güne hazırla (fired bayraklarını sıfırla)
  try { resetRemindersFired(); } catch (e) {}
  // 3) Yeni günün namaz vakitleri
  try { if (state.location) loadTimes(state.location); } catch (e) {}
  // 4) Tarihe bağlı açık modül varsa yenile (Namaz Takibi "bugün"ü gösterir)
  try {
    if (currentLiving === "tracker") renderNamazTakip();
  } catch (e) {}
}

/* -------------------------------------------------------------------
   8) VAKİT VERİSİ — Aladhan API
------------------------------------------------------------------- */
function mapTimings(t) {
  return {
    Imsak:   (t.Imsak || t.Fajr || "").slice(0, 5),
    Sunrise: (t.Sunrise || "").slice(0, 5),
    Dhuhr:   (t.Dhuhr || "").slice(0, 5),
    Asr:     (t.Asr || "").slice(0, 5),
    Maghrib: (t.Maghrib || "").slice(0, 5),
    Isha:    (t.Isha || "").slice(0, 5),
  };
}

async function fetchTimes(lat, lng) {
  try {
    const url = `https://api.aladhan.com/v1/timings?latitude=${lat}&longitude=${lng}&method=13`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return mapTimings((await res.json()).data.timings);
  } catch (e) {
    console.warn("[Mihrap] Vakit API hatası:", e.message);
    return null;
  }
}

/* Son alınan vakitleri sakla (offline yedek) */
function saveTimesCache(location, times) {
  try {
    const now = new Date();
    localStorage.setItem(TIMES_CACHE_KEY, JSON.stringify({
      lat: location.lat, lng: location.lng, name: location.name,
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      times,
    }));
  } catch (e) {}
}
function loadTimesCache() {
  try {
    const c = JSON.parse(localStorage.getItem(TIMES_CACHE_KEY) || "null");
    if (c && c.times && validTimes(c.times)) {
      // Tarih bilgisi varsa ve bugün değilse "eski" olarak işaretle
      const now = new Date();
      const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      c.stale = c.date && c.date !== today;
      return c;
    }
  } catch (e) {}
  return null;
}

async function loadTimes(location) {
  state.location = location;
  state.imsakiyeLoaded = false; // konum değişince imsakiye yeniden çekilsin
  $("#locationLabel").textContent = location.name;
  $("#timesSubtitle").textContent = location.name;

  let times = await fetchTimes(location.lat, location.lng);
  let offline = false;
  if (validTimes(times)) {
    saveTimesCache(location, times);
  } else {
    // Çevrimdışı: son bilinen vakitleri kullan
    const cached = loadTimesCache();
    if (cached && cached.times) {
      times = cached.times;
      offline = true;
      // Eski günün vakitleri gösteriliyorsa kullanıcıyı bilgilendir
      if (cached.stale) {
        showToast("⚠️ Vakitler güncel değil — internet bağlanınca yenilenecek");
      }
    } else {
      times = FALLBACK_TIMES;
    }
  }
  state.times = times;

  syncNativePrayerSchedule(); // APK: vakit bildirimlerini cihazda planla

  renderTimesList(times, "prayerTimesList", { isToday: true });
  updateHero(times);
  applyTheme(resolveTheme());
  tick();
  if (offline) showToast("Çevrimdışı — son bilinen vakitler gösteriliyor 📴");

  // Takvimi yeni konuma göre tazele
  refreshCalendarForLocation(location.lat, location.lng);
}

/* Konum değişince mevcut ayın takvim verisini yeniden çeker */
function refreshCalendarForLocation(lat, lng) {
  const c = state.calendar;
  if (c.month == null) return;
  fetchMonthCalendar(c.year, c.month + 1, lat, lng).then((data) => {
    if (!data) return;
    state.calendar.data = data;
    if (state.selectedDay) {
      const key = `${c.year}-${pad(c.month + 1)}-${pad(state.selectedDay.d)}`;
      renderTimesList(data[key] || state.times, "dayTimesList", { isToday: false });
    }
  });
}

/* -------------------------------------------------------------------
   9) AYLIK TAKVİM
------------------------------------------------------------------- */
async function fetchMonthCalendar(year, month, lat, lng) {
  try {
    const url = `https://api.aladhan.com/v1/calendar?latitude=${lat}&longitude=${lng}&method=13&month=${month}&year=${year}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = (await res.json()).data;
    const map = {};
    data.forEach((day) => {
      const g = day.date.gregorian;
      const key = `${g.year}-${pad(Number(g.month.number))}-${pad(Number(g.day))}`;
      map[key] = mapTimings(day.timings);
    });
    return map;
  } catch (e) {
    console.warn("[Mihrap] Takvim API hatası:", e.message);
    return null;
  }
}

function renderCalendar() {
  const { month, year } = state.calendar;
  const now = new Date();
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Pazartesi = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthName = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" })
    .format(first);
  $("#calSubtitle").textContent = monthName;

  let cells = "";
  for (let i = 0; i < startWeekday; i++) cells += '<div class="calendar__day calendar__day--empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
    const isSelected = state.selectedDay &&
      d === state.selectedDay.d && month === state.selectedDay.m && year === state.selectedDay.y;
    let cls = "calendar__day";
    if (isToday) cls += " calendar__day--today";
    if (isSelected) cls += " calendar__day--selected";
    cells += `<button class="${cls}" data-day="${d}">${d}</button>`;
  }

  $("#calendar").innerHTML = `
    <div class="calendar__head">
      <span class="calendar__month">${monthName}</span>
      <div class="calendar__nav">
        <button id="calPrev" aria-label="Önceki ay"><svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <button id="calNext" aria-label="Sonraki ay"><svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
      </div>
    </div>
    <div class="calendar__weekdays">
      <span>Pt</span><span>Sa</span><span>Ça</span><span>Pe</span><span>Cu</span><span>Ct</span><span>Pz</span>
    </div>
    <div class="calendar__days">${cells}</div>`;

  $("#calendar").querySelectorAll(".calendar__day[data-day]").forEach((btn) => {
    btn.addEventListener("click", () => selectDay(Number(btn.dataset.day)));
  });
  $("#calPrev").addEventListener("click", () => changeMonth(-1));
  $("#calNext").addEventListener("click", () => changeMonth(1));
}

async function selectDay(day) {
  state.selectedDay = { d: day, m: state.calendar.month, y: state.calendar.year };
  renderCalendar();

  const key = `${state.calendar.year}-${pad(state.calendar.month + 1)}-${pad(day)}`;
  let times = state.calendar.data[key];

  if (!times) {
    // tek gün çekmeyi dene
    const loc = state.location;
    times = await fetchDayTimes(loc.lat, loc.lng, state.calendar.year, state.calendar.month + 1, day);
    if (times) state.calendar.data[key] = times;
  }
  if (!times) times = state.times; // yedek

  const d = new Date(state.calendar.year, state.calendar.month, day);
  const isToday = d.toDateString() === new Date().toDateString();
  $("#selectedDayLabel").textContent = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long", day: "numeric", month: "long",
  }).format(d);
  renderTimesList(times, "dayTimesList", { isToday });
}

async function fetchDayTimes(lat, lng, year, month, day) {
  try {
    const url = `https://api.aladhan.com/v1/timings/${pad(day)}-${pad(month)}-${year}?latitude=${lat}&longitude=${lng}&method=13`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return mapTimings((await res.json()).data.timings);
  } catch (e) { return null; }
}

async function changeMonth(delta) {
  let { month, year } = state.calendar;
  month += delta;
  if (month < 0) { month = 11; year--; }
  if (month > 11) { month = 0; year++; }
  state.calendar.month = month;
  state.calendar.year = year;
  state.selectedDay = null;
  renderCalendar();

  const loc = state.location;
  const data = await fetchMonthCalendar(year, month + 1, loc.lat, loc.lng);
  if (data) state.calendar.data = data;
  else state.calendar.data = {};
}

function initCalendar() {
  const now = new Date();
  state.calendar.month = now.getMonth();
  state.calendar.year = now.getFullYear();
  state.selectedDay = { d: now.getDate(), m: now.getMonth(), y: now.getFullYear() };
  renderCalendar();
  renderTimesList(state.times || FALLBACK_TIMES, "dayTimesList", { isToday: true });
  const loc = state.location || defaultLocation();
  fetchMonthCalendar(now.getFullYear(), now.getMonth() + 1, loc.lat, loc.lng)
    .then((data) => { if (data) state.calendar.data = data; })
    .catch(() => {});
}

/* -------------------------------------------------------------------
   9b) İMSAKİYE — Hicri ay takvimi (İmsak + İftar)
------------------------------------------------------------------- */
async function loadImsakiye() {
  if (state.imsakiyeLoaded) return; // zaten yüklendiyse tekrar API çağırma
  let m = state.hijri ? state.hijri.month : null;
  let y = state.hijri ? state.hijri.year : null;
  if (!m || !y) {
    const h = await fetchHijriToday();
    if (h) { m = h.month; y = h.year; state.hijri = h; }
  }
  if (!m || !y) {
    $("#imsakiye").innerHTML = '<p class="imsakiye__empty">İmsakiye yüklenemedi.</p>';
    return;
  }
  try {
    const loc = state.location;
    const res = await fetch(`https://api.aladhan.com/v1/hijriCalendar?latitude=${loc.lat}&longitude=${loc.lng}&method=13&month=${m}&year=${y}`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = (await res.json()).data;
    renderImsakiyeTable(data, m, y);
    state.imsakiyeLoaded = true;
  } catch (e) {
    console.warn("[Mihrap] İmsakiye alınamadı:", e.message);
    $("#imsakiye").innerHTML = '<p class="imsakiye__empty">İmsakiye yüklenemedi (çevrimdışı?).</p>';
  }
}

function renderImsakiyeTable(data, m, y) {
  const monthName = HIJRI_MONTHS_TR[m - 1] || ("Ay " + m);
  const isRamadan = m === 9;
  const now = new Date();
  // API: g.day = "02" (padded), g.month.number = 9 (sayı) → ayı pad'leme!
  const todayGKey = `${pad(now.getDate())}-${now.getMonth() + 1}-${now.getFullYear()}`;

  const rows = data.map((d) => {
    const hday = Number(d.date.hijri.day);
    const g = d.date.gregorian;
    const gKey = `${g.day}-${g.month.number}-${g.year}`;
    const imsak = (d.timings.Imsak || "").slice(0, 5);
    const iftar = (d.timings.Maghrib || "").slice(0, 5);
    const isToday = gKey === todayGKey;
    return `<div class="imsakiye__row ${isToday ? "imsakiye__row--today" : ""}">
      <span class="imsakiye__hday">${hday}</span>
      <span class="imsakiye__gday">${g.day} ${GREG_MONTHS_TR[Number(g.month.number) - 1] || ""}</span>
      <span class="imsakiye__time imsakiye__time--imsak">${imsak}</span>
      <span class="imsakiye__time imsakiye__time--iftar">${iftar}</span>
    </div>`;
  }).join("");

  $("#imsakiye").innerHTML = `
    <div class="imsakiye__head">
      <span class="imsakiye__title">${isRamadan ? "İmsakiye" : "Hicri Ay"} · ${monthName} ${y}</span>
      <span class="imsakiye__loc">${state.location ? state.location.name : ""}</span>
    </div>
    <div class="imsakiye__cols">
      <span>Gün</span><span>Tarih</span><span>İmsak</span><span>İftar</span>
    </div>
    <div class="imsakiye__body">${rows}</div>`;
}

function initTimesToggle() {
  const seg = $("#timesSegmented");
  if (!seg) return;
  seg.querySelectorAll(".segmented__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      seg.querySelectorAll(".segmented__btn").forEach((b) =>
        b.classList.toggle("segmented__btn--active", b === btn));
      $("#viewCalendar").classList.toggle("times-view--hidden", view !== "calendar");
      $("#viewImsakiye").classList.toggle("times-view--hidden", view !== "imsakiye");
      if (view === "imsakiye") loadImsakiye();
    });
  });
}

/* -------------------------------------------------------------------
   9c) RAMAZAN MODU — sahur/iftar geri sayımı, hatim takibi, dualar
------------------------------------------------------------------- */
function loadHatim() {
  try { return new Set(JSON.parse(localStorage.getItem(HATIM_STORAGE_KEY) || "[]")); }
  catch (e) { return new Set(); }
}
function saveHatim() {
  try { localStorage.setItem(HATIM_STORAGE_KEY, JSON.stringify([...state.hatim])); } catch (e) {}
}

function renderHatim() {
  const grid = $("#hatimGrid");
  if (!grid) return;
  const total = 30;
  grid.innerHTML = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const done = state.hatim.has(n);
    return `<button class="hatim__cuz ${done ? "hatim__cuz--done" : ""}" data-cuz="${n}">
      <span class="hatim__cuz-num">${n}</span>
      <span class="hatim__cuz-label">Cüz</span>
    </button>`;
  }).join("");

  grid.querySelectorAll(".hatim__cuz").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.cuz);
      if (state.hatim.has(n)) state.hatim.delete(n);
      else state.hatim.add(n);
      saveHatim();
      renderHatim();
    });
  });

  $("#hatimProgress").textContent = `${state.hatim.size}/${total}`;
  $("#hatimBarFill").style.width = `${(state.hatim.size / total) * 100}%`;
}

/* Ramazan günleri için kısa, sahih dualar (günlük döner) */
const RAMADAN_DUAS = [
  { ar: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", tr: "Rabbimiz! Bize dünyada da iyilik ver, ahirette de iyilik ver ve bizi ateş azabından koru.", kaynak: "Bakara, 201" },
  { ar: "رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِنْ لَدُنْكَ رَحْمَةً", tr: "Rabbimiz! Bizi hidayete erdirdikten sonra kalplerimizi eğriltme. Bize katından bir rahmet bağışla.", kaynak: "Âl-i İmrân, 8" },
  { ar: "رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي", tr: "Rabbim! Göğsümü genişlet ve işimi kolaylaştır.", kaynak: "Tâhâ, 25-26" },
  { ar: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى وَالْعَفَافَ وَالْغِنَى", tr: "Allah'ım! Senden hidayet, takva, iffet ve gönül zenginliği dilerim.", kaynak: "Müslim" },
  { ar: "اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي", tr: "Allah'ım! Sen çok affedicisin, affı seversin; beni affet.", kaynak: "Tirmizî" },
  { ar: "رَبَّنَا اغْفِرْ لَنَا ذُنُوبَنَا وَإِسْرَافَنَا فِي أَمْرِنَا وَثَبِّتْ أَقْدَامَنَا", tr: "Rabbimiz! Günahlarımızı ve işimizdeki taşkınlığımızı bağışla, ayaklarımızı sabit kıl.", kaynak: "Âl-i İmrân, 147" },
  { ar: "رَبِّ زِدْنِي عِلْمًا", tr: "Rabbim! Benim ilmimi artır.", kaynak: "Tâhâ, 114" },
  { ar: "حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ", tr: "Allah bize yeter; O ne güzel vekildir.", kaynak: "Âl-i İmrân, 173" },
  { ar: "اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ", tr: "Allah'ım! Seni anmak, sana şükretmek ve sana güzelce ibadet etmek için bana yardım et.", kaynak: "Ebû Dâvûd" },
  { ar: "رَبِّ اغْفِرْ لِي وَلِوَالِدَيَّ وَلِلْمُؤْمِنِينَ يَوْمَ يَقُومُ الْحِسَابُ", tr: "Rabbim! Beni, anne-babamı ve müminleri hesap günü bağışla.", kaynak: "İbrâhîm, 41" },
  { ar: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْجَنَّةَ وَأَعُوذُ بِكَ مِنَ النَّارِ", tr: "Allah'ım! Senden cenneti diler, cehennemden sana sığınırım.", kaynak: "Ebû Dâvûd" },
  { ar: "رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا", tr: "Rabbimiz! Eşlerimizi ve çocuklarımızı bize göz aydınlığı kıl; bizi takva sahiplerine önder yap.", kaynak: "Furkân, 74" },
  { ar: "اللَّهُمَّ اغْفِرْ لِي ذَنْبِي كُلَّهُ دِقَّهُ وَجِلَّهُ", tr: "Allah'ım! Günahlarımın hepsini, küçüğünü ve büyüğünü bağışla.", kaynak: "Müslim" },
  { ar: "لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ", tr: "Senden başka ilah yoktur. Seni her türlü eksiklikten tenzih ederim; doğrusu ben zalimlerden oldum.", kaynak: "Enbiyâ, 87" },
  { ar: "رَبَّنَا أَفْرِغْ عَلَيْنَا صَبْرًا وَتَوَفَّنَا مُسْلِمِينَ", tr: "Rabbimiz! Üzerimize sabır yağdır ve canımızı Müslüman olarak al.", kaynak: "A'râf, 126" },
  { ar: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عِلْمٍ لَا يَنْفَعُ وَقَلْبٍ لَا يَخْشَعُ", tr: "Allah'ım! Faydasız ilimden ve huşû duymayan kalpten sana sığınırım.", kaynak: "Müslim" },
  { ar: "رَبِّ أَوْزِعْنِي أَنْ أَشْكُرَ نِعْمَتَكَ الَّتِي أَنْعَمْتَ عَلَيَّ", tr: "Rabbim! Bana lütfettiğin nimetlere şükretmemi bana ilham et.", kaynak: "Ahkâf, 15" },
  { ar: "اللَّهُمَّ إِنِّي أَسْأَلُكَ حُبَّكَ وَحُبَّ مَنْ يُحِبُّكَ", tr: "Allah'ım! Senden sevgini ve seni sevenlerin sevgisini dilerim.", kaynak: "Tirmizî" },
  { ar: "رَبَّنَا تَقَبَّلْ مِنَّا إِنَّكَ أَنْتَ السَّمِيعُ الْعَلِيمُ", tr: "Rabbimiz! Bizden kabul buyur; şüphesiz sen işitensin, bilensin.", kaynak: "Bakara, 127" },
  { ar: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ", tr: "Allah'ım! Senden af ve âfiyet dilerim.", kaynak: "İbn Mâce" },
  { ar: "رَبِّ هَبْ لِي حُكْمًا وَأَلْحِقْنِي بِالصَّالِحِينَ", tr: "Rabbim! Bana hikmet ver ve beni salihler arasına kat.", kaynak: "Şuarâ, 83" },
  { ar: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالسَّدَادَ", tr: "Allah'ım! Senden hidayet ve doğruluk dilerim.", kaynak: "Müslim" },
  { ar: "رَبَّنَا لَا تُؤَاخِذْنَا إِنْ نَسِينَا أَوْ أَخْطَأْنَا", tr: "Rabbimiz! Unutur veya yanılırsak bizi sorumlu tutma.", kaynak: "Bakara, 286" },
  { ar: "اللَّهُمَّ اجْعَلْنِي مِنَ التَّوَّابِينَ وَاجْعَلْنِي مِنَ الْمُتَطَهِّرِينَ", tr: "Allah'ım! Beni tövbe edenlerden ve temizlenenlerden eyle.", kaynak: "Tirmizî" },
  { ar: "رَبَّنَا آتِنَا مِنْ لَدُنْكَ رَحْمَةً وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا", tr: "Rabbimiz! Bize katından rahmet ver ve işimizde doğru yolu göster.", kaynak: "Kehf, 10" },
  { ar: "اللَّهُمَّ أَصْلِحْ لِي دِينِي وَدُنْيَايَ وَآخِرَتِي", tr: "Allah'ım! Dinimi, dünyamı ve ahiretimi ıslah et.", kaynak: "Müslim" },
  { ar: "رَبَّنَا وَسِعْتَ كُلَّ شَيْءٍ رَحْمَةً وَعِلْمًا فَاغْفِرْ لِلَّذِينَ تَابُوا", tr: "Rabbimiz! Rahmetin ve ilmin her şeyi kuşatmıştır; tövbe edenleri bağışla.", kaynak: "Mü'min, 7" },
  { ar: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْجَنَّةَ وَمَا قَرَّبَ إِلَيْهَا مِنْ قَوْلٍ أَوْ عَمَلٍ", tr: "Allah'ım! Senden cenneti ve ona yaklaştıran her söz ve ameli dilerim.", kaynak: "İbn Mâce" },
  { ar: "رَبِّ اجْعَلْنِي مُقِيمَ الصَّلَاةِ وَمِنْ ذُرِّيَّتِي", tr: "Rabbim! Beni namazı dosdoğru kılanlardan eyle; soyumdan da.", kaynak: "İbrâhîm, 40" },
  { ar: "اللَّهُمَّ إِنَّا نَسْأَلُكَ رِضَاكَ وَالْجَنَّةَ وَنَعُوذُ بِكَ مِنْ سَخَطِكَ وَالنَّارِ", tr: "Allah'ım! Senden rızanı ve cenneti diler, gazabından ve cehennemden sana sığınırız.", kaynak: "İbn Mâce" },
];

function renderRamadanDua() {
  const doy = dayOfYear();
  const dua = RAMADAN_DUAS[(doy - 1) % RAMADAN_DUAS.length];
  if (dua) {
    $("#duaArabic").textContent = dua.ar;
    $("#duaText").textContent = `"${dua.tr}"`;
    $("#duaSource").textContent = dua.kaynak;
  }
}

/* Sıradaki vakit oluşumu (bugün geçtiyse yarın) */
function nextOccurrence(hhmm) {
  const d = timeToDate(hhmm);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d;
}

function updateRamadanCountdown() {
  if (!state.times) return;
  const sahur = nextOccurrence(state.times.Imsak);
  const iftar = nextOccurrence(state.times.Maghrib);
  const now = new Date();

  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set("#sahurTime", state.times.Imsak);
  set("#iftarTime", state.times.Maghrib);
  set("#sahurLeft", fmtCountdown(sahur - now));
  set("#iftarLeft", fmtCountdown(iftar - now));
  // Ana ekran kartı (Ramazan modu)
  set("#homeSahurTime", state.times.Imsak);
  set("#homeIftarTime", state.times.Maghrib);
  set("#homeSahurLeft", fmtCountdown(sahur - now));
  set("#homeIftarLeft", fmtCountdown(iftar - now));
}

function initRamadan() {
  state.hatim = loadHatim();
  renderHatim();
  renderRamadanDua();
  $("#hatimReset").addEventListener("click", () => {
    state.hatim = new Set();
    saveHatim();
    renderHatim();
    showToast("Hatim sıfırlandı");
  });
}

/* -------------------------------------------------------------------
   10) KIBLE PUSULASI
------------------------------------------------------------------- */
function qiblaBearing(lat, lng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const φ1 = toRad(lat), φ2 = toRad(KAABA.lat), Δλ = toRad(KAABA.lng - lng);
  const y = Math.sin(Δλ);
  const x = Math.cos(φ1) * Math.tan(φ2) - Math.sin(φ1) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180, R = 6371;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function updateCompass() {
  const dial = $("#compassDial");
  if (!dial) return;
  const bearing = state.qiblaBearing ?? 0;
  dial.style.transform = `rotate(${-state.heading}deg)`;
  $("#needle").style.transform = `rotate(${bearing}deg)`;
}

function onOrientation(e) {
  let h;
  if (typeof e.webkitCompassHeading !== "undefined") h = e.webkitCompassHeading;
  else if (e.alpha != null) h = e.alpha;
  else return;
  state.heading = h;
  state.hasCompass = true;
  updateCompass();
}

function disableCompass() {
  window.removeEventListener("deviceorientation", onOrientation, true);
}

async function enableCompass() {
  try {
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm !== "granted") throw new Error("izin reddedildi");
    }
    disableCompass();
    window.addEventListener("deviceorientation", onOrientation, true);
    showToast("Pusula aktif 🧭");
  } catch (e) {
    showToast("Pusula izni alınamadı");
  }
}

async function initQibla() {
  let coords = state.location ? { lat: state.location.lat, lng: state.location.lng } : null;
  const pos = await getDevicePosition({ enableHighAccuracy: true, timeout: 8000 });
  if (pos) coords = { lat: pos.lat, lng: pos.lng };

  if (coords) {
    const bearing = qiblaBearing(coords.lat, coords.lng);
    const dist = haversineKm(coords.lat, coords.lng, KAABA.lat, KAABA.lng);
    state.qiblaBearing = bearing;
    $("#qiblaBearing").textContent = `${Math.round(bearing)}°`;
    $("#qiblaDistance").textContent = `${Math.round(dist).toLocaleString("tr-TR")} km`;
    updateCompass();
  } else {
    $("#qiblaHint").textContent = "Konum alınamadı. Lütfen bir şehir seçin.";
  }
}

/* -------------------------------------------------------------------
   11) ESMA & KISSALAR
------------------------------------------------------------------- */
function openModal(html, shareData, speakItems) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal">
    <div class="modal__bar">
      ${speakItems ? `<button class="modal__speak" aria-label="Dinle">${ICON_SPEAK}</button>` : ""}
      ${shareData ? `<button class="modal__share" aria-label="Paylaş">${ICON_SHARE}</button>` : ""}
      <button class="modal__close" aria-label="Kapat">✕</button>
    </div>
    ${html}
  </div>`;
  const close = () => {
    stopSpeaking();
    overlay.classList.remove("open");
    setTimeout(() => overlay.remove(), 300);
  };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector(".modal__close").addEventListener("click", close);
  if (shareData) overlay.querySelector(".modal__share").addEventListener("click", () => shareCard(shareData));
  if (speakItems) overlay.querySelector(".modal__speak").addEventListener("click", (e) => speakSeq(speakItems, e.currentTarget));
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));
}

/* -------------------------------------------------------------------
   12) EKRAN ROUTER + BOTTOM NAV
------------------------------------------------------------------- */
function showScreen(name) {
  // Ayarlar ekranından çıkıyorsak önizleme ezan sesini kes (ses arkada çalmaya devam etmesin)
  if (name !== "settings") stopSettingsSound();
  // Ayarlar ekranına geçiyorsak içeriği hazırla (alt menüden açılışta da)
  if (name === "settings") renderSettings();
  document.querySelectorAll(".screen").forEach((s) =>
    s.classList.toggle("screen--active", s.dataset.screen === name));
  document.querySelectorAll(".nav-item").forEach((n) =>
    n.classList.toggle("nav-item--active", n.dataset.tab === name));
  if (name === "living") resetLiving();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

let toastTimer = null;
function showToast(msg) {
  let toast = $(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function initNav() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => showScreen(item.dataset.tab));
  });
  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => showScreen(el.dataset.goto));
  });
}

/* Ana ekrandaki paylaşım butonlarını bağlar */
function initShares() {
  document.querySelectorAll("[data-share]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.share;
      const d = state.daily;
      if (kind === "hadith" && d.hadith) {
        shareCard({
          type: "hadis", label: "GÜNÜN HADİSİ",
          arabic: d.hadith.arapca, text: `"${d.hadith.turkce}"`,
          source: d.hadith.kaynak, caption: "Günün Hadisi",
        });
      } else if (kind === "sunnah" && d.sunnah) {
        shareCard({
          type: "sunnet", label: "GÜNÜN SÜNNETİ", chip: "emerald",
          title: d.sunnah.baslik, text: d.sunnah.aciklama,
          source: d.sunnah.kaynak, caption: `Günün Sünneti — ${d.sunnah.baslik}`,
        });
      } else if (kind === "kissa" && d.kissa) {
        shareCard({
          type: "kissa", label: "GÜNÜN KISSASI",
          title: d.kissa.baslik, text: d.kissa.ozet, source: d.kissa.referans,
          caption: d.kissa.baslik,
        });
      }
    });
  });
}

/* -------------------------------------------------------------------
   16) SESLİ OKUMA — Web Speech API (Arapça + Türkçe)
------------------------------------------------------------------- */
let speechVoices = [];

function loadVoices() {
  const refresh = () => {
    if (window.speechSynthesis) speechVoices = window.speechSynthesis.getVoices();
  };
  refresh();
  if (window.speechSynthesis && typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
    window.speechSynthesis.onvoiceschanged = refresh;
  }
}

/* Erkek sesi tercihi — Web Speech API cinsiyeti doğrudan vermez,
   ses adı üzerinden sezgisel olarak erkek sesini seçeriz. */
const MALE_VOICE_HINTS = [
  "male", "erkek", "david", "daniel", "alex", "fred", "thomas", "james",
  "guy", "mark", "george", "oliver", "jack", "william", "tolga", "naayf",
  "hassan", "youssef", "maged", "sergey", "mikhail", "diego", "jorge",
  "carlos", "miguel", "gabriel", "bruno", "luciano", "mehmet", "ahmet"
];
const FEMALE_VOICE_HINTS = [
  "female", "kadın", "kadin", "woman", "girl", "zira", "emel", "yelda",
  "selin", "elif", "susan", "heather", "karen", "moira", "tessa",
  "samantha", "victoria", "allison", "ava", "linda", "jenny", "aria",
  "catherine", "laura", "maria", "anna", "paulina", "monica", "helena",
  "sonia", "laila", "aisha", "hoda", "nayla", "asma", "amira", "salma",
  "federica", "eliska", "sara", "sonya", "katya"
];

function isMaleVoice(name) {
  const n = (name || "").toLowerCase();
  return MALE_VOICE_HINTS.some((h) => n.includes(h));
}
function isFemaleVoice(name) {
  const n = (name || "").toLowerCase();
  return FEMALE_VOICE_HINTS.some((h) => n.includes(h));
}

function voiceFor(lang) {
  if (!speechVoices.length && window.speechSynthesis) {
    speechVoices = window.speechSynthesis.getVoices();
  }
  const norm = (s) => s.replace("_", "-").toLowerCase();
  const exact = speechVoices.filter((v) => norm(v.lang) === norm(lang));
  const prefix = norm(lang).split("-")[0];
  const candidates = exact.length ? exact : speechVoices.filter((v) => norm(v.lang).startsWith(prefix));

  if (!candidates.length) return null;

  // 1) Açıkça erkek belirten sesi tercih et
  let v = candidates.find((x) => isMaleVoice(x.name));
  if (v) return v;
  // 2) Kadın olmayan (nötr) ilk sesi kullan
  v = candidates.find((x) => !isFemaleVoice(x.name));
  if (v) return v;
  // 3) Hepsi kadınsa yine de bir ses döndür (yapacak bir şey yok)
  return candidates[0];
}

let activeSpeakBtn = null;

function setSpeakUI(btn, on) {
  if (btn) btn.classList.toggle("speaking", on);
}

function stopSpeaking() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  if (activeSpeakBtn) { setSpeakUI(activeSpeakBtn, false); activeSpeakBtn = null; }
}

/* Sıralı seslendirme: [{text, lang}, ...] */
function speakSeq(items, btn) {
  if (!("speechSynthesis" in window)) {
    showToast("Seslendirme bu tarayıcıda desteklenmiyor");
    return;
  }
  // Aynı butona tekrar basınca durdur (toggle)
  if (activeSpeakBtn === btn && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
    stopSpeaking();
    return;
  }
  stopSpeaking();
  activeSpeakBtn = btn;
  setSpeakUI(btn, true);

  let i = 0;
  const next = () => {
    if (i >= items.length) { setSpeakUI(btn, false); activeSpeakBtn = null; return; }
    const { text, lang } = items[i++];
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = voiceFor(lang);
    if (v) u.voice = v;
    u.rate = 0.9;
    u.pitch = 1;
    u.onend = next;
    u.onerror = next;
    window.speechSynthesis.speak(u);
  };
  next();
}

/* Ana ekrandaki seslendirme butonlarını bağlar */
function initSpeech() {
  document.querySelectorAll("[data-speak]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.speak;
      const d = state.daily;
      if (kind === "hadith" && d.hadith) {
        speakSeq([
          { text: d.hadith.arapca, lang: "ar-SA" },
          { text: `Anlamı: ${d.hadith.turkce}`, lang: "tr-TR" },
        ], btn);
      } else if (kind === "sunnah" && d.sunnah) {
        speakSeq([{ text: `${d.sunnah.baslik}. ${d.sunnah.aciklama}`, lang: "tr-TR" }], btn);
      } else if (kind === "kissa" && d.kissa) {
        speakSeq([{ text: `${d.kissa.baslik}. ${d.kissa.ozet}`, lang: "tr-TR" }], btn);
      }
    });
  });
}

/* -------------------------------------------------------------------
   13) KONUM SEÇİMİ — İl → İlçe → Köy/Mahalle (3 seviyeli)
------------------------------------------------------------------- */

/* Serbest metinle köy/mahalle koordinatı bul (Nominatim, ücretsiz) */
async function geocodeVillage(query, provinceName, districtName) {
  const q = `${query}, ${districtName}, ${provinceName}, Türkiye`;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tr&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } });
    const data = await res.json();
    if (data && data[0]) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        name: (data[0].display_name || "").split(",")[0].trim(),
      };
    }
  } catch (e) { /* sessiz geç */ }
  return null;
}

/* Koordinattan adres çöz (geolocation için) */
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`,
      { headers: { Accept: "application/json" } });
    const d = await res.json();
    if (d && d.address) {
      const a = d.address;
      const parts = [a.city || a.town || a.village || a.county || a.state_district, a.state];
      const name = parts.filter(Boolean).join(" · ");
      if (name) return name;
    }
  } catch (e) { /* sessiz geç */ }
  return "Bulunduğum Konum";
}

function openLocationSheet() {
  const overlay = document.createElement("div");
  overlay.className = "sheet-overlay";
  overlay.innerHTML = '<div class="sheet sheet--picker" id="locationPicker"></div>';
  const sheet = overlay.querySelector("#locationPicker");

  let province = null, district = null;

  const close = () => { overlay.classList.remove("open"); setTimeout(() => overlay.remove(), 350); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  function backBtn() {
    return `<button class="picker__back" aria-label="Geri"><svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>`;
  }

  /* — 1. SEVİYE: İL — */
  function showProvinces() {
    province = district = null;
    sheet.innerHTML = `
      <div class="picker__head">
        ${backBtn()}
        <h2 class="picker__title">İl Seç</h2>
      </div>
      <button class="picker__geo" id="useGeo">
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z"/><circle cx="12" cy="10" r="3"/></svg>
        Konumumu Kullan
      </button>
      <div class="picker__search">
        <svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" id="provinceSearch" placeholder="İl ara..." autocomplete="off" />
      </div>
      <ul class="picker__list" id="provinceList"></ul>`;

    const list = sheet.querySelector("#provinceList");
    const input = sheet.querySelector("#provinceSearch");

    function renderProvinceList(q = "") {
      const query = q.trim().toLocaleLowerCase("tr");
      const items = LOCATIONS.filter((p) => !query || p.n.toLocaleLowerCase("tr").includes(query));
      list.innerHTML = items.map((p) => `
        <li><button class="picker__item" data-plaka="${p.p}">
          <span>${p.n}</span>
          <span class="picker__plaka">${pad(p.p)}</span>
        </button></li>`).join("");
      list.querySelectorAll(".picker__item").forEach((btn) => {
        btn.addEventListener("click", () => showDistricts(LOCATIONS.find((p) => p.p === Number(btn.dataset.plaka))));
      });
    }
    input.addEventListener("input", (e) => renderProvinceList(e.target.value));
    renderProvinceList();

    sheet.querySelector("#useGeo").addEventListener("click", useGeolocation);
  }

  /* — 2. SEVİYE: İLÇE — */
  function showDistricts(prov) {
    province = prov;
    sheet.innerHTML = `
      <div class="picker__head">
        ${backBtn()}
        <h2 class="picker__title">${prov.n}<small>İlçe seçin</small></h2>
      </div>
      <ul class="picker__list">${prov.d.map((d) => `
        <li><button class="picker__item" data-name="${d.n}">
          <span>${d.n}</span>
          <svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button></li>`).join("")}</ul>`;

    sheet.querySelector(".picker__back").addEventListener("click", showProvinces);
    sheet.querySelectorAll(".picker__item").forEach((btn) => {
      btn.addEventListener("click", () => showConfirm(prov.d.find((d) => d.n === btn.dataset.name)));
    });
  }

  /* — 3. SEVİYE: KÖY/MAHALLE (isteğe bağlı) + ONAY — */
  function showConfirm(dist) {
    district = dist;
    sheet.innerHTML = `
      <div class="picker__head">
        ${backBtn()}
        <h2 class="picker__title">${province.n} · ${dist.n}<small>Köy/mahalle (isteğe bağlı)</small></h2>
      </div>
      <p class="picker__hint">Boş bırakırsanız ilçe merkezine göre vakit hesaplanır. Köy adı yazarsanız tam koordinat bulunur.</p>
      <div class="picker__search">
        <svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" id="villageInput" placeholder="Örn: köy adı..." autocomplete="off" />
      </div>
      <button class="btn-gold" id="confirmLocation">Vakitleri Getir</button>`;

    sheet.querySelector(".picker__back").addEventListener("click", () => showDistricts(province));

    sheet.querySelector("#confirmLocation").addEventListener("click", async () => {
      const vq = sheet.querySelector("#villageInput").value.trim();
      const btn = sheet.querySelector("#confirmLocation");
      if (vq) {
        btn.disabled = true;
        btn.textContent = "Aranıyor...";
        const geo = await geocodeVillage(vq, province.n, dist.n);
        if (geo) {
          selectLocation({
            name: `${geo.name}, ${dist.n}`,
            lat: geo.lat, lng: geo.lng,
            province: province.n, district: dist.n, village: vq,
          });
          close();
          return;
        }
        btn.disabled = false;
        btn.textContent = "Vakitleri Getir";
        showToast("Köy bulunamadı, ilçe merkezi kullanılıyor");
      }
      selectLocation({ name: `${province.n} · ${dist.n}`, lat: dist.lat, lng: dist.lng, province: province.n, district: dist.n });
      close();
    });
  }

  /* — Konum seçilince ortak işlem — */
  function selectLocation(loc) {
    try { localStorage.setItem("mihrap:location", JSON.stringify(loc)); } catch (e) {}
    // Android widget'ı da senkronla (native köprü mevcutsa)
    try {
      if (window.MihrapNative && typeof window.MihrapNative.setWidgetLocation === "function") {
        window.MihrapNative.setWidgetLocation(loc.name || "", loc.lat, loc.lng);
      }
    } catch (e) { console.warn("[Mihrap] Widget konum sync hatası:", e && e.message); }
    loadTimes(loc);
  }

  async function useGeolocation() {
    try {
      const pos = await getDevicePosition({ enableHighAccuracy: true, timeout: 10000 });
      if (!pos) throw new Error("konum alınamadı");
      const name = await reverseGeocode(pos.lat, pos.lng);
      selectLocation({ name, lat: pos.lat, lng: pos.lng, province: "", district: "", village: "" });
      close();
    } catch (e) {
      showToast("Konum alınamadı");
    }
  }

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));
  showProvinces();
}

/* -------------------------------------------------------------------
   14) BAŞLAT
------------------------------------------------------------------- */
async function init() {
  // Kayıtlı tema seçimini ve açılmış temaları yükle
  try {
    const ov = localStorage.getItem(THEME_OVERRIDE_KEY);
    if (ov) state.themeOverride = ov;
    const ul = localStorage.getItem(THEMES_UNLOCKED_KEY);
    if (ul) state.unlockedThemes = JSON.parse(ul);
    if (!Array.isArray(state.unlockedThemes)) state.unlockedThemes = [];
  } catch (e) {}

  // Konumu erkenden ayarla (takvim/kıble/cami buna bağımlı)
  let location = defaultLocation();
  try {
    const saved = localStorage.getItem("mihrap:location");
    if (saved) location = JSON.parse(saved);
  } catch (e) {}
  if (location && location.lat != null) state.location = location;

  // Her özelliği izole et: biri hata verirse diğerleri (menü, kartlar, AI) yine çalışsın
  const safeInit = (fn) => { try { fn(); } catch (e) { console.warn("[Mihrap] Başlatma hatası:", e && e.message); } };

  safeInit(updateDate);
  safeInit(renderDailyContent);
  safeInit(initNav);
  safeInit(initShares);
  safeInit(initSpeech);
  safeInit(loadVoices);

  safeInit(initCalendar);
  safeInit(initTimesToggle);
  safeInit(initRamadan);
  safeInit(initLiving);
  safeInit(initAI);
  safeInit(updateSpecialDay); // hicri tarih + özel gün banner'ı

  const btnLoc = $("#btnLocation");
  if (btnLoc) btnLoc.addEventListener("click", openLocationSheet);

  // Küçük "sesi durdur" butonu
  const stopBtn = $("#stopSoundBtn");
  if (stopBtn) stopBtn.addEventListener("click", stopActiveAudio);

  const donateCard = $("#donateCard");
  if (donateCard) donateCard.addEventListener("click", openDonateSheet);

  // Kayıtlı ezan bildirimi tercihini yükle
  try {
    const savedNotify = localStorage.getItem(NOTIFY_STORAGE_KEY);
    if (savedNotify) state.notifyEnabled = JSON.parse(savedNotify);
  } catch (e) {}
  // Vakit bazında bildirim tercihleri
  try {
    const savedPrayers = localStorage.getItem(NOTIFY_PRAYERS_KEY);
    if (savedPrayers) {
      const np = JSON.parse(savedPrayers);
      if (np && typeof np === "object") state.notifyPrayers = Object.assign(state.notifyPrayers, np);
    }
  } catch (e) {}
  // Büyük yazı modu (erişilebilirlik)
  try {
    const bt = localStorage.getItem(BIG_TEXT_KEY);
    if (bt != null) state.bigText = JSON.parse(bt);
    if (state.bigText) document.body.classList.add("big-text");
  } catch (e) {}

  // Kur'an otomatik âyet takibi tercihi
  try {
    const as = localStorage.getItem(QURAN_AUTOSCROLL_KEY);
    if (as != null) quranAutoScroll = JSON.parse(as);
  } catch (e) {}
  // Kur'an tefsir gösterimi tercihi
  try {
    const tf = localStorage.getItem(QURAN_TAFSIR_KEY);
    if (tf != null) quranShowTafsir = JSON.parse(tf);
  } catch (e) {}
  // Ezan sesi tercihleri
  try {
    const s = localStorage.getItem(ADHAN_STYLE_KEY);
    if (s) adhanStyle = s;
  } catch (e) {}
  try {
    const c = localStorage.getItem(ADHAN_CUSTOM_KEY);
    if (c) adhanCustomUrl = c;
  } catch (e) {}
  // Önemli gün hatırlatması tercihi
  try {
    const sr = localStorage.getItem(SPECIAL_REMINDER_KEY);
    if (sr != null) state.specialReminder = JSON.parse(sr);
  } catch (e) {}

  // Sahur / iftar bildirim tercihleri (Ramazan modu)
  try {
    const s = localStorage.getItem(NOTIFY_SAHUR_KEY);
    if (s != null) state.notifySahur = JSON.parse(s);
  } catch (e) {}
  try {
    const i = localStorage.getItem(NOTIFY_IFTAR_KEY);
    if (i != null) state.notifyIftar = JSON.parse(i);
  } catch (e) {}

  try { await loadTimes(location); } catch (e) { console.warn("[Mihrap] Vakit yükleme hatası:", e && e.message); }

  setInterval(tick, 1000);

  // Derin bağlantı (manifest kısayolları: ?screen=times vb.)
  const params = new URLSearchParams(window.location.search);
  const screen = params.get("screen");
  if (screen && ["home", "times", "ai", "living", "settings"].includes(screen)) {
    showScreen(screen);
  }

  // Native (APK) kurulumu: durum çubuğu + donanım geri butonu
  try {
    const N = native();
    if (N && N.setupStatusBar) N.setupStatusBar("#0a1220");
  } catch (e) {}
  initNativeBackButton();
  initScheduleRefreshTriggers();

  registerServiceWorker();
  initOfflineDetection();
}

/* — Android donanım geri butonu (APK) — */
/* Saat/dil/zaman dilimi değişimi + ön plana dönüşte bildirimleri yeniden planla.
   Yanlış zamana bildirim gitmemesi için zamanla ilgili her değişiklikte
   native planı yeniden kurar. */
function initScheduleRefreshTriggers() {
  // Sistem zaman dilimi değişirse (tarayıcı/WebView destekliyorsa)
  try {
    if (typeof window !== "undefined") {
      window.addEventListener("timezonechange", () => syncNativePrayerSchedule());
    }
  } catch (e) {}
  // Uygulama ön plana dönünce (sekme görünür olunca) yeniden planla — saat değişimi/uyku sonrası güvence
  try {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") syncNativePrayerSchedule();
      });
    }
  } catch (e) {}
  // WebView'de resume/pause (Capacitor app plugin) — native ön plana dönüş
  const N = native();
  if (N && N.isNative) {
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
        const App = window.Capacitor.Plugins.App;
        if (App.addListener) {
          App.addListener("appStateChange", (st) => {
            if (st && st.isActive) syncNativePrayerSchedule();
          });
        }
      }
    } catch (e) {}
  }
}

function initNativeBackButton() {
  const N = native();
  if (!N || typeof N.onBackButton !== "function") return;
  N.onBackButton(function (done) {
    // 1) Kur'an tam ekran modundan çık
    if (document.fullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { try { exit.call(document); } catch (e) {} return; }
    }
    // 2) Açık modal/sheet varsa kapat
    const overlays = document.querySelectorAll(".modal-overlay.open, .sheet-overlay.open");
    if (overlays.length) {
      const ov = overlays[overlays.length - 1];
      const closeBtn = ov.querySelector(".modal__close, .ad-modal__close");
      if (closeBtn) closeBtn.click();
      else ov.click(); // arka plan tıklaması → sheet kapanır
      return;
    }
    // 3) İslamı Yaşamak alt görünümü açıksa geri dön
    const sub = $("#livingSub");
    if (sub && !sub.hidden) {
      const back = $("#livingBack");
      if (back) back.click();
      return;
    }
    // 4) Ana ekran dışında bir sekmedeysen ana ekrana dön
    const active = document.querySelector(".screen--active");
    if (active && active.dataset.screen && active.dataset.screen !== "home") {
      showScreen("home");
      return;
    }
    // 5) Varsayılan: uygulamayı arka plana al
    done();
  });
}

/* — Çevrimdışı/çevrimiçi durum göstergesi — */
function initOfflineDetection() {
  const show = (offline) => {
    let bar = $("#offlineBar");
    if (offline) {
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "offlineBar";
        bar.className = "offline-bar";
        bar.textContent = "📴 Çevrimdışısınız — son bilinen içerik gösteriliyor";
        document.body.appendChild(bar);
      }
      bar.classList.add("offline-bar--show");
    } else if (bar) {
      bar.classList.remove("offline-bar--show");
      setTimeout(() => { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 400);
    }
  };
  window.addEventListener("offline", () => show(true));
  window.addEventListener("online", () => {
    show(false);
    // Yeniden bağlanınca vakitleri tazele
    try {
      if (state.location) loadTimes(state.location);
    } catch (e) {}
  });
  if (navigator.onLine === false) show(true);
}

/* — Service Worker kaydı (PWA kurulumu + çevrimdışı) — */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // SW yalnızca güvenli bağlamlarda çalışır (https / localhost)
  if (!window.isSecureContext) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js")
      .then((reg) => {
        console.log("[Mihrap] Service Worker kayıtlı:", reg.scope);
        // Güncelleme akışı: yeni sürüm bekliyorsa kullanıcıya haber ver
        if (reg.waiting) notifySWUpdate(reg);
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener("statechange", () => {
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              notifySWUpdate(reg);
            }
          });
        });
        // Arka plan senkronunu kaydet (destekleyen tarayıcılar)
        registerPeriodicSync(reg);
      })
      .catch((e) => console.warn("[Mihrap] SW kaydı başarısız:", e.message));
  });

  // SW'den gelen mesajlar (günlük içerik yenileme)
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "DAILY_REFRESH") {
      try { renderDailyContent(); updateDate(); } catch (e) {}
    }
  });
}

/* — SW güncelleme bildirimi — */
let swUpdateNotified = false;
function notifySWUpdate(reg) {
  if (swUpdateNotified) return;
  swUpdateNotified = true;
  showToast("Yeni sürüm hazır — yenilemek için tıklayın 🔄");
  // Yer tutucu yerine basit bir yenileme daveti
  setTimeout(() => {
    const refresh = confirm("Mihrap'ın yeni sürümü hazır. Şimdi yenilensin mi?");
    if (refresh && reg.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
      setTimeout(() => location.reload(), 300);
    }
  }, 1200);
}

/* — Periodic Background Sync kaydı (arka planda günlük tazeleme) — */
async function registerPeriodicSync(reg) {
  try {
    if ("periodicSync" in reg) {
      const status = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (status.state === "granted") {
        await reg.periodicSync.register("mihrap-daily", { minInterval: 24 * 60 * 60 * 1000 });
        console.log("[Mihrap] Arka plan senkron kayıtlı");
      }
    }
  } catch (e) { /* desteklenmiyor — sessizce geç */ }
}

document.addEventListener("DOMContentLoaded", init);

/* -------------------------------------------------------------------
   15) PAYLAŞIM — Canvas ile premium görsel kart + Web Share API
------------------------------------------------------------------- */

/* — Yardımcı çizim fonksiyonları — */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function drawSpacedText(ctx, text, cx, y, spacing) {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  ctx.textAlign = "left";
  chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + spacing; });
}

function goldGradient(ctx, y0, y1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "#f6e7b0");
  g.addColorStop(0.5, "#d4af37");
  g.addColorStop(1, "#a8811a");
  return g;
}

function drawCrescent(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.38, cy - r * 0.16, r * 0.8, 0, Math.PI * 2);
  ctx.fill("evenodd");
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function drawChip(ctx, text, cx, cy, color) {
  ctx.font = '700 28px "Manrope", sans-serif';
  const w = ctx.measureText(text).width + 66, h = 58;
  ctx.fillStyle = color.bg;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = color.border;
  ctx.lineWidth = 1.5;
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.stroke();
  ctx.fillStyle = color.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 2);
}

/* — İçerik bloklarını ölçer ve dikey ortalayarak çizer — */
function buildContentBlocks(ctx, opts) {
  const maxW = 820, CX = 540;
  const blocks = [];

  if (opts.arabic) {
    const size = opts.arabic.length > 40 ? 62 : 90;
    const lh = Math.round(size * 1.55);
    ctx.font = `700 ${size}px "Amiri", "Reem Kufi", serif`;
    const lines = wrapText(ctx, opts.arabic, maxW);
    blocks.push({
      h: lines.length * lh + 10,
      draw: (top) => {
        ctx.font = `700 ${size}px "Amiri", "Reem Kufi", serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = goldGradient(ctx, top - size, top + 12);
        lines.forEach((ln, i) => ctx.fillText(ln, CX, top + size + i * lh));
      },
    });
  }

  if (opts.title) {
    const size = 58, lh = 70;
    ctx.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
    const lines = wrapText(ctx, opts.title, maxW);
    blocks.push({
      h: 36 + lines.length * lh,
      draw: (top) => {
        ctx.font = `600 ${size}px "Cormorant Garamond", Georgia, serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#f7f3e8";
        lines.forEach((ln, i) => ctx.fillText(ln, CX, top + 36 + size + i * lh));
      },
    });
  }

  if (opts.text) {
    const size = 38, lh = 56;
    ctx.font = `400 ${size}px "Manrope", sans-serif`;
    const lines = wrapText(ctx, opts.text, maxW);
    blocks.push({
      h: 30 + lines.length * lh,
      draw: (top) => {
        ctx.font = `400 ${size}px "Manrope", sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(247,243,232,0.84)";
        lines.forEach((ln, i) => ctx.fillText(ln, CX, top + 30 + size + i * lh));
      },
    });
  }

  if (opts.source) {
    ctx.font = '600 27px "Manrope", sans-serif';
    blocks.push({
      h: 70,
      draw: (top) => {
        ctx.font = '600 27px "Manrope", sans-serif';
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(240,217,140,0.85)";
        ctx.fillText("— " + opts.source + " —", CX, top + 42);
      },
    });
  }

  return blocks;
}

/* — Premium paylaşım kartını canvas'a çizer — */
function renderShareCard(opts) {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Arka plan gradyanı
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a1220");
  bg.addColorStop(0.45, "#0d241f");
  bg.addColorStop(1, "#14130d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Üst altın parlama
  const glow = ctx.createRadialGradient(W / 2, 100, 0, W / 2, 100, 720);
  glow.addColorStop(0, "rgba(212,175,55,0.30)");
  glow.addColorStop(1, "rgba(212,175,55,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Yıldızlar (belirlenmiş rastgele)
  const rng = mulberry32(20260830);
  for (let i = 0; i < 110; i++) {
    const x = rng() * W, y = rng() * H * 0.85, r = 0.7 + rng() * 2.1;
    ctx.fillStyle = `rgba(255,255,255,${(0.15 + rng() * 0.45).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Çift altın çerçeve
  ctx.strokeStyle = "rgba(212,175,55,0.75)";
  ctx.lineWidth = 3;
  roundRect(ctx, 44, 44, W - 88, H - 88, 42);
  ctx.stroke();
  ctx.strokeStyle = "rgba(212,175,55,0.22)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, 66, 66, W - 132, H - 132, 34);
  ctx.stroke();

  ctx.textBaseline = "alphabetic";

  // Hilal + yıldız süsü
  drawCrescent(ctx, W / 2 - 14, 176, 30, "rgba(212,175,55,0.9)");
  drawStar(ctx, W / 2 + 22, 150, 16, "rgba(212,175,55,0.9)");

  // Bismillah
  ctx.font = '400 44px "Amiri", "Reem Kufi", serif';
  ctx.textAlign = "center";
  ctx.fillStyle = "#d4af37";
  ctx.fillText("بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", W / 2, 268);

  // Uygulama adı
  ctx.font = '600 60px "Reem Kufi", "Amiri", serif';
  ctx.fillStyle = goldGradient(ctx, 300, 370);
  drawSpacedText(ctx, APP_NAME.toUpperCase(), W / 2, 360, 14);

  // Alt başlık
  ctx.font = '600 24px "Manrope", sans-serif';
  ctx.fillStyle = "rgba(247,243,232,0.55)";
  drawSpacedText(ctx, "EZAN VAKTİ & İSLAMİ YAŞAM", W / 2, 408, 4);

  // Etiket çipi
  const chipColor = opts.chip === "emerald"
    ? { bg: "rgba(18,185,129,0.16)", border: "rgba(18,185,129,0.5)", fg: "#34d399" }
    : { bg: "rgba(212,175,55,0.16)", border: "rgba(212,175,55,0.55)", fg: "#f0d98c" };
  drawChip(ctx, opts.label || "MİHRAP", W / 2, 470, chipColor);

  // İçerik (dikey ortalı)
  const blocks = buildContentBlocks(ctx, opts);
  const totalH = blocks.reduce((s, b) => s + b.h, 0);
  const areaTop = 540, areaBottom = 1130;
  let topY = areaTop + Math.max(0, (areaBottom - areaTop - totalH) / 2);
  for (const b of blocks) { b.draw(topY); topY += b.h; }

  // Alt ayraç + yıldız
  ctx.strokeStyle = "rgba(212,175,55,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 90, 1192);
  ctx.lineTo(W / 2 + 90, 1192);
  ctx.stroke();
  drawStar(ctx, W / 2, 1192, 9, "rgba(212,175,55,0.9)");

  // Alt bilgi: uygulama adı + indirme linki
  ctx.textAlign = "center";
  ctx.font = '600 32px "Manrope", sans-serif';
  ctx.fillStyle = "rgba(247,243,232,0.9)";
  ctx.fillText("Mihrap — Ezan Vakti & İslami Yaşam", W / 2, 1248);
  ctx.font = '600 30px "Manrope", sans-serif';
  ctx.fillStyle = "#d4af37";
  ctx.fillText("İndir: " + APP_URL.replace(/^https?:\/\//, ""), W / 2, 1296);

  return canvas;
}

/* — Kartı üret, paylaş (yoksa indir) — */
/* Paylaşım metnini oluşturur (başlık + içerik + kaynak) */
function buildShareText(opts) {
  const parts = [];
  if (opts.label) parts.push(opts.label);
  if (opts.title) parts.push(opts.title);
  if (opts.arabic) parts.push(opts.arabic);
  if (opts.text) parts.push(opts.text);
  if (opts.source) parts.push(`(${opts.source})`);
  parts.push("— Mihrap 📿 " + APP_URL);
  return parts.filter(Boolean).join("\n");
}

async function shareCard(opts) {
  const nav = navigator;

  // 1) DOĞRUDAN PAYLAŞIM — tıklar tıklamaz WhatsApp/Instagram/Facebook paneli açılır
  if (nav.share) {
    try {
      await nav.share({ title: APP_NAME, text: buildShareText(opts), url: APP_URL });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // kullanıcı iptal etti
      // desteklenmiyorsa görsel kart akışına devam
    }
  }

  // 2) Görsel kart paylaşımı (dosya paylaşımı destekleyen ortamlar)
  try { await document.fonts.ready; } catch (e) {}
  await new Promise((r) => setTimeout(r, 80));

  const canvas = renderShareCard(opts);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) { showToast("Görsel oluşturulamadı"); return; }

  const file = new File([blob], `mihrap-${opts.type || "paylasim"}.png`, { type: "image/png" });

  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: APP_NAME, text: opts.caption || "" });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }

  // 3) Yedek: PNG olarak indir
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast("Görsel indirildi 📥 — dilediğin yerden paylaşabilirsin");
}

/* -------------------------------------------------------------------
   16) EZAN BİLDİRİMİ (opsiyonel) — ses + Notification API
------------------------------------------------------------------- */

function ensureAudio() {
  if (!state.audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) state.audioCtx = new AC();
  }
  if (state.audioCtx && state.audioCtx.state === "suspended") {
    state.audioCtx.resume();
  }
}

function setNotifyEnabled(on) {
  state.notifyEnabled = on;
  try { localStorage.setItem(NOTIFY_STORAGE_KEY, JSON.stringify(on)); } catch (e) {}
  syncNativePrayerSchedule(); // native (APK) planını güncelle
}

/* Her vakit için ayrı bildirim tercihini sakla */
function setNotifyPrayer(key, on) {
  state.notifyPrayers[key] = on;
  try { localStorage.setItem(NOTIFY_PRAYERS_KEY, JSON.stringify(state.notifyPrayers)); } catch (e) {}
  syncNativePrayerSchedule(); // native (APK) planını güncelle
}

/* Native (APK) vakit bildirimlerini planla/temizle.
   Uygulama kapalıyken bile ezan bildirimi gelsin diye vakitler
   cihazda zamanlanmış bildirim olarak planlanır. */
function syncNativePrayerSchedule() {
  const N = native();
  if (!N) return;
  try {
    if (!state.notifyEnabled || !state.times) { N.clearPrayerSchedule(); return; }
    const prayers = PRAYERS.filter((p) => p.fard).map((p) => ({
      key: p.key, tr: p.tr, enabled: state.notifyPrayers[p.key] !== false,
    }));
    N.schedulePrayerTimes(state.times, prayers);
  } catch (e) { /* sessiz */ }
}

function setBigText(on) {
  state.bigText = on;
  document.body.classList.toggle("big-text", on);
  try { localStorage.setItem(BIG_TEXT_KEY, JSON.stringify(on)); } catch (e) {}
}

/* Sahur/İftar bildirim tercihlerini ayrı ayrı sakla */
function setNotifyFlag(kind, on) {
  if (kind === "sahur") {
    state.notifySahur = on;
    try { localStorage.setItem(NOTIFY_SAHUR_KEY, JSON.stringify(on)); } catch (e) {}
  } else if (kind === "iftar") {
    state.notifyIftar = on;
    try { localStorage.setItem(NOTIFY_IFTAR_KEY, JSON.stringify(on)); } catch (e) {}
  }
}

/* -------------------------------------------------------------------
   16b) ONESIGNAL PUSH — uygulama kapalıyken bile bildirim
   -------------------------------------------------------------------
   OneSignal hesabı oluşturup App ID'yi ONESIGNAL_APP_ID sabitine
   yazdığında bu fonksiyon devreye girer. SDK'yı yükler, kullanıcıyı
   abone yapar ve dış kimliği (userId) kaydeder.
------------------------------------------------------------------- */
function initOneSignal() {
  if (!ONESIGNAL_APP_ID || typeof window.OneSignal === "undefined") return;

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(function (OneSignal) {
    OneSignal.init({ appId: ONESIGNAL_APP_ID });
    OneSignal.Notifications.requestPermission().then((accepted) => {
      if (accepted) console.log("[Mihrap] OneSignal: bildirim izni verildi");
    });
  });
}

/* Ezan bildirimi açılınca OneSignal'a da abone ol (varsa) */
function subscribePush() {
  if (!ONESIGNAL_APP_ID) return;
  if (typeof window.OneSignal !== "undefined" && window.OneSignal.Notifications) {
    window.OneSignal.Notifications.requestPermission().catch(() => {});
  }
}

async function requestNotifyPermission() {
  const N = native();
  if (N) {
    // Native (APK) veya web — köprü her ikisini de yönetir
    if (!N.notifySupported()) {
      showToast("Bu cihaz bildirim gönderimini desteklemiyor");
      return false;
    }
    const ok = await N.requestNotifyPermission();
    if (!ok) showToast("Bildirim izni alınamadı — cihaz ayarlarından açabilirsin");
    return ok;
  }
  // Köprü yüklenmediyse (nadir) eski web davranışı
  if (!("Notification" in window)) {
    showToast("Tarayıcın bildirimi desteklemiyor");
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") {
    showToast("Bildirim izni reddedilmiş — tarayıcı ayarlarından açabilirsin");
    return false;
  }
  try {
    const p = await Notification.requestPermission();
    return p === "granted";
  } catch (e) {
    return false;
  }
}

/* — Tek çalma: ne kadar basılırsa basılsın tek sefer çalar — */
function stopAdhanOnly() {
  if (activeAudio) {
    try { activeAudio.pause(); activeAudio.currentTime = 0; } catch (e) {}
    activeAudio = null;
  }
  if (typeof adhanSynthStop === "function") {
    try { adhanSynthStop(); } catch (e) {}
    adhanSynthStop = null;
  }
  showStopSoundBtn(false);
}

function stopActiveAudio() {
  stopAdhanOnly();
  stopQuranAudio();
}

/* Ayarlar ekranından çıkarken önizleme ezan sesini durdur */
function stopSettingsSound() {
  if (adhanPreviewActive) {
    stopAdhanOnly();
    adhanPreviewActive = false;
  }
}

/* Küçük "sessize al / durdur" butonunu göster/gizle */
function showStopSoundBtn(show) {
  stopBtnVisible = show;
  const btn = document.getElementById("stopSoundBtn");
  if (btn) btn.classList.toggle("visible", show);
}

/* Gerçek ezan kaydı varsa onu, yoksa Web Audio ile nağme çalar */
function playAdhanTone() {
  stopActiveAudio(); // önce çalan ne varsa durdur — asla üst üste binmesin

  // 1) Kullanıcının özel MP3 linki (en öncelikli)
  const custom = adhanCustomUrl || ADHAN_URL;
  if (custom) {
    try {
      const a = new Audio(custom);
      activeAudio = a;
      a.onended = () => { if (activeAudio === a) { activeAudio = null; showStopSoundBtn(false); } };
      a.play().then(() => showStopSoundBtn(true)).catch(() => { activeAudio = null; playSynthAdhan(adhanStyle); });
      return;
    } catch (e) { activeAudio = null; /* aşağı düş */ }
  }
  // 2) Gerçek ezan (Ayasofya) — gömülü kayıt
  if (adhanStyle === "gercek") {
    const data = (typeof window !== "undefined" && window.MIHRAP_ADHAN_DATA) || "";
    if (data) {
      try {
        const a = new Audio(data);
        activeAudio = a;
        a.onended = () => { if (activeAudio === a) { activeAudio = null; showStopSoundBtn(false); } };
        a.play().then(() => showStopSoundBtn(true)).catch(() => { activeAudio = null; playSynthAdhan("hicaz"); });
        return;
      } catch (e) { activeAudio = null; playSynthAdhan("hicaz"); return; }
    }
    // Kayıt yoksa (örn. test ortamı) senteze düş
    playSynthAdhan("hicaz");
    return;
  }
  // 3) Sentez nağme (hicaz/rast)
  playSynthAdhan(adhanStyle);
}

/* İki farklı ezan nağmesi (makam) — hicaz ve rast */
const ADHAN_SEQ_HICAZ = [
  [293.66, 0.00], [392.00, 0.55], [369.99, 1.10], [293.66, 1.65],
  [440.00, 2.25], [392.00, 2.80], [369.99, 3.35], [293.66, 3.90],
  [311.13, 4.50], [293.66, 5.05],
];
const ADHAN_SEQ_RAST = [
  [261.63, 0.00], [329.63, 0.55], [293.66, 1.10], [261.63, 1.65],
  [349.23, 2.25], [329.63, 2.80], [293.66, 3.35], [261.63, 3.90],
  [293.66, 4.50], [261.63, 5.05],
];

/* Web Audio ile ezan esintili, hürmetli bir nağme (durdurulabilir) */
function playSynthAdhan(style) {
  try {
    ensureAudio();
    const ctx = state.audioCtx;
    if (!ctx) return;

    // Master gain: durdurma butonu bunu keserek nağmeyi susturur
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    let stopped = false;
    adhanSynthStop = () => {
      if (stopped) return;
      stopped = true;
      try { master.disconnect(); } catch (e) {}
      adhanSynthStop = null;
      showStopSoundBtn(false);
    };

    const note = (freq, t, dur, amp) => {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      o1.type = "triangle";
      o1.frequency.value = freq;
      o2.type = "sine";
      o2.frequency.value = freq * 2; // bir oktav üstü (parlaklık)
      const g2 = ctx.createGain();
      g2.gain.value = 0.22;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.09);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o1.connect(g);
      o2.connect(g2);
      g2.connect(g);
      g.connect(master);
      o1.start(t);
      o2.start(t);
      o1.stop(t + dur + 0.05);
      o2.stop(t + dur + 0.05);
    };

    const t0 = ctx.currentTime + 0.06;
    const seq = (style === "rast") ? ADHAN_SEQ_RAST : ADHAN_SEQ_HICAZ;
    seq.forEach(([f, t]) => note(f, t0 + t, 0.52, 0.30));

    // Nağme bitince (yaklaşık 6 sn) butonu gizle
    const totalDur = 6.2;
    setTimeout(() => { adhanSynthStop && adhanSynthStop(); }, totalDur * 1000);
    showStopSoundBtn(true);
  } catch (e) { /* ses çalınamadı (tarayıcı engeli) */ }
}

/* Vakit geldiğinde: ses + bildirim (yalnızca açıksa) */
function fireAdhan(prayerKey) {
  if (!state.notifyEnabled) return;
  if (state.notifyPrayers && state.notifyPrayers[prayerKey] === false) return;
  const p = PRAYERS.find((x) => x.key === prayerKey);
  if (!p) return;

  adhanPreviewActive = false; // gerçek vakit ezanı — önizleme değil
  playAdhanTone();

  notifyUser(`${p.tr} ezanı vakti geldi 🕌`,
    `${p.tr} ezan vakti (${state.times[p.key]}) — namazınızı kılmayı unutmayın.`,
    { tag: `mihrap-${p.key}-${new Date().toDateString()}`, channelId: "ezan" });
}

/* Ramazan modu: sahur (İmsak) ve iftar (Akşam) bildirimleri — ayrı toggle'lı */
function fireRamadanAlert(prayerKey) {
  if (!state.ramadanActive) return;
  const isSahur = prayerKey === "Imsak";
  const isIftar = prayerKey === "Maghrib";
  if (!isSahur && !isIftar) return;
  if (isSahur && !state.notifySahur) return;
  if (isIftar && !state.notifyIftar) return;
  if (!state.times) return;

  const title = isSahur ? "Sahur vakti 🌅" : "İftar vakti 🌇";
  const body = isSahur
    ? `İmsak saati ${state.times.Imsak} — sahurunuzu yapın, orucunuza niyet edin.`
    : `Akşam ezanı ${state.times.Maghrib} — iftarınızı açabilirsiniz.`;

  notifyUser(title, body, {
    tag: `mihrap-${isSahur ? "sahur" : "iftar"}-${new Date().toDateString()}`,
    channelId: "ezan",
  });
}

/* — Ödüllü reklam (tema kilidi açma) — */
function showRewardedAd(onReward) {
  const DURATION = 5; // saniye
  const overlay = document.createElement("div");
  overlay.className = "sheet-overlay ad-overlay";
  overlay.innerHTML = `
    <div class="ad-modal">
      <div class="ad-modal__badge">REKLAM</div>
      <div class="ad-modal__video">
        <div class="ad-modal__video-inner">
          <span class="ad-modal__play">▶</span>
          <span class="ad-modal__video-text">Reklam oynatılıyor…</span>
          <span class="ad-modal__video-sub">Mihrap — Premium Tema</span>
        </div>
        <div class="ad-modal__progress"><span id="adProgress"></span></div>
      </div>
      <p class="ad-modal__count" id="adCount">Ödülü almak için reklamı sonuna kadar izleyin · ${DURATION} sn</p>
      <button class="btn-gold" id="adClaim" hidden>Ödülü Al ✓</button>
      <button class="ad-modal__close" id="adClose">Kapat</button>
    </div>`;

  let remaining = DURATION;
  let done = false;
  let timer = null;

  const close = () => {
    if (timer) clearInterval(timer);
    overlay.classList.remove("open");
    setTimeout(() => overlay.remove(), 300);
  };

  const finish = () => {
    if (done) return;
    done = true;
    if (timer) clearInterval(timer);
    $("#adCount").textContent = "Reklam tamamlandı! 🎉 Ödülünüz hazır.";
    $("#adClaim").hidden = false;
  };

  overlay.querySelector("#adClose").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  overlay.querySelector("#adClaim").addEventListener("click", () => {
    close();
    onReward();
  });

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));

  timer = setInterval(() => {
    remaining--;
    const pct = Math.round(((DURATION - remaining) / DURATION) * 100);
    overlay.querySelector("#adProgress").style.width = pct + "%";
    if (remaining > 0) {
      overlay.querySelector("#adCount").textContent = `Reklam izleniyor… ${remaining} sn`;
    } else {
      finish();
    }
  }, 1000);
}

/* — Bağış / Destek (Google Play satın alım) — */
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.mihrap.app"; // ← Uygulama yayına alınınca gerçek paket adınızı yazın
const DONATION_PRESETS = [10, 20, 50, 100, 250, 500, 1000];
const DONATION_MIN = 1;
const DONATION_MAX = 1000;

function buyDonation(amount) {
  const tl = Math.round(amount);
  // 1) Native Google Play Billing — Capacitor/cordova-plugin-purchase kuruluysa (yayınlanmış APK'da)
  if (typeof window.store !== "undefined" && window.store && window.store.ready) {
    try {
      const pid = "donation_" + tl; // Play Console'da tanımlı tüketilebilir ürün kimliği
      window.store.order(pid);
      showToast("Google Play ödeme penceresi açılıyor…");
      return;
    } catch (e) { /* native akış yoksa web'e düş */ }
  }
  // 2) Web / önizleme → kullanıcıyı Google Play sayfasına yönlendir
  try { window.open(PLAY_STORE_URL, "_blank", "noopener"); } catch (e) {}
  showToast("Google Play'e yönlendiriliyorsunuz…");
}

function openDonateSheet() {
  const overlay = document.createElement("div");
  overlay.className = "sheet-overlay";
  overlay.innerHTML = `
    <div class="sheet">
      <h2 class="sheet__title">💚 Bize Destek Ol</h2>
      <p class="sheet__sub">Mihrap'ı ücretsiz ve reklamsız tutmamıza yardımcı olun. Desteğiniz Google Play üzerinden güvenli satın alımla gerçekleşir.</p>

      <div class="donate-presets" id="donatePresets">
        ${DONATION_PRESETS.map((a) => `<button class="donate-preset" data-amount="${a}">${a.toLocaleString("tr-TR")} ₺</button>`).join("")}
      </div>

      <div class="donate-custom">
        <span class="donate-custom__label">Özel tutar</span>
        <input class="donate-input" id="donateCustom" type="number" inputmode="numeric" min="${DONATION_MIN}" max="${DONATION_MAX}" step="1" placeholder="1 – 1000" autocomplete="off" />
        <span class="donate-custom__label">₺</span>
      </div>
      <p class="donate-range">Bağış aralığı: ${DONATION_MIN} ₺ – ${DONATION_MAX} ₺</p>

      <div class="donate-total">Seçilen: <span id="donateTotal">50</span> ₺</div>
      <div class="donate-error" id="donateError"></div>

      <button class="btn-gold" id="donateBuy">
        <svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
        Google Play'de Satın Al
      </button>
      <p class="donate-note">Allah rızası için yapılan her hayır, kat kat ecir kazanmaya vesiledir. Desteğiniz için şimdiden teşekkür ederiz. ❤️</p>
    </div>`;

  const close = () => { overlay.classList.remove("open"); setTimeout(() => overlay.remove(), 350); };
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  let amount = 50;
  const totalEl = overlay.querySelector("#donateTotal");
  const errorEl = overlay.querySelector("#donateError");
  const customEl = overlay.querySelector("#donateCustom");
  const presetEls = overlay.querySelectorAll(".donate-preset");

  const setAmount = (v) => {
    amount = v;
    totalEl.textContent = v.toLocaleString("tr-TR");
    presetEls.forEach((b) => b.classList.toggle("donate-preset--active", Number(b.dataset.amount) === v));
    if (customEl && Number(customEl.value) !== v) customEl.value = "";
    errorEl.textContent = "";
  };

  presetEls.forEach((b) => b.addEventListener("click", () => {
    setAmount(Number(b.dataset.amount));
  }));

  customEl.addEventListener("input", () => {
    const v = Number(customEl.value);
    presetEls.forEach((b) => b.classList.remove("donate-preset--active"));
    if (customEl.value === "") { totalEl.textContent = "—"; errorEl.textContent = ""; return; }
    if (Number.isNaN(v)) { totalEl.textContent = "—"; return; }
    totalEl.textContent = v.toLocaleString("tr-TR");
    if (v < DONATION_MIN || v > DONATION_MAX) {
      customEl.classList.add("donate-input--error");
      errorEl.textContent = `Lütfen ${DONATION_MIN} ₺ ile ${DONATION_MAX} ₺ arasında bir tutar girin.`;
    } else {
      customEl.classList.remove("donate-input--error");
      errorEl.textContent = "";
      amount = v;
    }
  });

  overlay.querySelector("#donateBuy").addEventListener("click", () => {
    const v = customEl.value !== "" ? Number(customEl.value) : amount;
    if (Number.isNaN(v) || v < DONATION_MIN || v > DONATION_MAX) {
      customEl.classList.add("donate-input--error");
      errorEl.textContent = `Lütfen ${DONATION_MIN} ₺ ile ${DONATION_MAX} ₺ arasında bir tutar girin.`;
      customEl.focus();
      return;
    }
    amount = Math.round(v);
    buyDonation(amount);
  });

  // İlk seçimi vurgula (50 ₺)
  setAmount(50);

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));
}

/* — Ayarlar ekranı (ayrı tam ekran) — */
function renderSettings() {
  const c = $("#settingsContent");
  if (!c) return;
  c.innerHTML = `
      <div class="setting">
        <div class="setting__text">
          <span class="setting__title">Ezan Bildirimi</span>
          <span class="setting__desc">Vakit geldiğinde ezan sesi çal ve bildirim gönder.</span>
        </div>
        <label class="switch">
          <input type="checkbox" id="notifyToggle" ${state.notifyEnabled ? "checked" : ""}>
          <span class="switch__track"><span class="switch__thumb"></span></span>
        </label>
      </div>

      <div class="setting setting--stack">
        <div class="setting__text">
          <span class="setting__title">🕐 Her Vakit İçin Bildirim</span>
          <span class="setting__desc">Hangi vakitlerde bildirim almak istediğinizi seçin.</span>
        </div>
        <div class="prayer-toggle-list">
          ${FARD_KEYS.map((key) => {
            const p = PRAYERS.find((x) => x.key === key);
            const on = state.notifyPrayers[key] !== false;
            return `<div class="prayer-toggle ${state.notifyEnabled ? "" : "prayer-toggle--off"}">
              <span class="prayer-toggle__label">${p ? p.tr : key}</span>
              <label class="switch">
                <input type="checkbox" class="prayer-toggle__input" data-prayer="${key}" ${on ? "checked" : ""} ${state.notifyEnabled ? "" : "disabled"}>
                <span class="switch__track"><span class="switch__thumb"></span></span>
              </label>
            </div>`;
          }).join("")}
        </div>
      </div>

      <div class="setting">
        <div class="setting__text">
          <span class="setting__title">🔠 Büyük Yazı</span>
          <span class="setting__desc">Metinleri büyütür; yaşlılar ve az görenler için kolaylık.</span>
        </div>
        <label class="switch">
          <input type="checkbox" id="bigTextToggle" ${state.bigText ? "checked" : ""}>
          <span class="switch__track"><span class="switch__thumb"></span></span>
        </label>
      </div>

      <div class="setting">
        <div class="setting__text">
          <span class="setting__title">🌅 Sahur Bildirimi</span>
          <span class="setting__desc">Ramazan'da imsak vaktinde sahur bildirimi gönder.</span>
        </div>
        <label class="switch">
          <input type="checkbox" id="notifySahurToggle" ${state.notifySahur ? "checked" : ""}>
          <span class="switch__track"><span class="switch__thumb"></span></span>
        </label>
      </div>

      <div class="setting">
        <div class="setting__text">
          <span class="setting__title">🌇 İftar Bildirimi</span>
          <span class="setting__desc">Ramazan'da akşam ezanında iftar bildirimi gönder.</span>
        </div>
        <label class="switch">
          <input type="checkbox" id="notifyIftarToggle" ${state.notifyIftar ? "checked" : ""}>
          <span class="switch__track"><span class="switch__thumb"></span></span>
        </label>
      </div>

      <button class="btn-ghost" id="btnPreviewRamadan">
        <svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
        ${state.ramadanPreview ? "Ramazan önizlemeyi kapat" : "🌙 Ramazan modunu önizle"}
      </button>

      <div class="setting setting--stack">
        <div class="setting__text">
          <span class="setting__title">🎨 Tema</span>
          <span class="setting__desc">İslami Yeşil tema, reklam izleyerek açılır ve kalıcı olur.</span>
        </div>
        <button class="theme-option ${!state.themeOverride ? "theme-option--active" : ""}" id="themeAuto">
          <span class="theme-option__swatch theme-option__swatch--auto">🌗</span>
          <span class="theme-option__label">Otomatik (saate göre)</span>
        </button>
        <button class="theme-option ${state.themeOverride === "emerald" ? "theme-option--active" : ""}" id="themeEmerald">
          <span class="theme-option__swatch theme-option__swatch--emerald"></span>
          <span class="theme-option__label">İslami Yeşil</span>
          ${isThemeUnlocked("emerald") ? "" : '<span class="theme-option__lock">🔒 Reklamla Aç</span>'}
        </button>
      </div>

      <div class="setting setting--stack">
        <div class="setting__text">
          <span class="setting__title">✨ AI Asistan (opsiyonel)</span>
          <span class="setting__desc">AI normalde sunucuda anahtarsız çalışır. Kendi Google Gemini anahtarınızı kullanmak isterseniz buraya girin (boş bırakırsanız sunucu kullanılır).</span>
        </div>
        <input class="setting-input" type="password" id="aiKeyInput" placeholder="Gemini API anahtarı (opsiyonel)..." value="${state.aiKey}" autocomplete="off" />
        <button class="btn-ghost" id="btnSaveAiKey">Anahtarı Kaydet</button>
      </div>

      <div class="setting">
        <div class="setting__text">
          <span class="setting__title">🌙 Önemli Gün Hatırlatması</span>
          <span class="setting__desc">Kandil, bayram gibi özel günlerden 1 gün önce bildirim gönder (ör. "Yarın Kadir Gecesi").</span>
        </div>
        <label class="switch">
          <input type="checkbox" id="specialReminderToggle" ${state.specialReminder ? "checked" : ""}>
          <span class="switch__track"><span class="switch__thumb"></span></span>
        </label>
      </div>

      <div class="setting setting--stack">
        <div class="setting__text">
          <span class="setting__title">🔊 Ezan Sesini Seç</span>
          <span class="setting__desc">Bildirimde çalacak ezan sesini seçin; seçtiğiniz nağme hemen önizlenir.</span>
        </div>
        <div class="adhan-options">
          ${ADHAN_STYLES.map((s) => `
            <button class="adhan-option ${adhanStyle === s.id ? "adhan-option--active" : ""}" data-adhan="${s.id}">
              <span class="adhan-option__radio"></span>
              <span class="adhan-option__body">
                <span class="adhan-option__name">${s.name}</span>
                <span class="adhan-option__desc">${s.desc}</span>
              </span>
              <span class="adhan-option__preview">▶</span>
            </button>`).join("")}
        </div>
        <input class="setting-input" type="url" id="adhanCustomInput" placeholder="Özel ezan MP3 linki (opsiyonel)..." value="${adhanCustomUrl}" autocomplete="off" />
        <span class="sheet__note">Özel link girerseniz, hazır nağmeler yerine o ses çalınır. Link boş bırakılırsa seçili nağme kullanılır.</span>
      </div>

      <button class="btn-ghost" id="btnTestAdhan">
        <svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>
        Ezan sesini test et
      </button>

      <button class="btn-ghost" id="btnTestNotification">
        <svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        Bildirimi test et (10 sn)
      </button>

      <p class="sheet__note">Bildirim için izin gerekir. APK'da vakit bildirimleri uygulama kapalıyken de gelir.</p>
      <p class="sheet__note sheet__note--warn">⚠️ Bazı cihazlarda (Xiaomi, Huawei, Samsung vb.) agresif pil yönetimi bildirimleri geciktirebilir. Bildirimlerin zamanında gelmesi için telefonun pil ayarlarından "Mihrap" için pil kısıtlamasını kaldırın (Sınırsız/İzin ver).</p>
`;

  const goHome = () => { stopSettingsSound(); showScreen("home"); };

  c.querySelector("#notifyToggle").addEventListener("change", async (e) => {
    const on = e.target.checked;
    if (on) {
      const ok = await requestNotifyPermission();
      if (!ok) {
        e.target.checked = false;
        setNotifyEnabled(false);
        return;
      }
      ensureAudio(); // kullanıcı jesti → ses bağlamını aç
      subscribePush(); // OneSignal aboneliği (yapılandırıldıysa)
    }
    setNotifyEnabled(on);
    // Vakit toggle'larını etkinleştir/devre dışı bırak
    c.querySelectorAll(".prayer-toggle__input").forEach((inp) => {
      inp.disabled = !on;
      inp.closest(".prayer-toggle")?.classList.toggle("prayer-toggle--off", !on);
    });
    showToast(on ? "Ezan bildirimi açık 🔔" : "Ezan bildirimi kapalı");
  });

  c.querySelectorAll(".prayer-toggle__input").forEach((inp) => {
    inp.addEventListener("change", (e) => {
      setNotifyPrayer(inp.dataset.prayer, e.target.checked);
    });
  });

  c.querySelector("#bigTextToggle").addEventListener("change", (e) => {
    setBigText(e.target.checked);
    showToast(e.target.checked ? "Büyük yazı açık 🔠" : "Büyük yazı kapalı");
  });

  const bindRamadanToggle = (sel, key, label) => {
    c.querySelector(sel).addEventListener("change", async (e) => {
      const on = e.target.checked;
      if (on) {
        const ok = await requestNotifyPermission();
        if (!ok) { e.target.checked = false; setNotifyFlag(key, false); return; }
      }
      setNotifyFlag(key, on);
      showToast(on ? `${label} bildirimi açık 🔔` : `${label} bildirimi kapalı`);
    });
  };
  bindRamadanToggle("#notifySahurToggle", "sahur", "Sahur");
  bindRamadanToggle("#notifyIftarToggle", "iftar", "İftar");

  c.querySelector("#specialReminderToggle").addEventListener("change", (e) => {
    state.specialReminder = e.target.checked;
    try { localStorage.setItem(SPECIAL_REMINDER_KEY, JSON.stringify(state.specialReminder)); } catch (err) {}
    showToast(state.specialReminder ? "Önemli gün hatırlatması açık 🌙" : "Önemli gün hatırlatması kapalı");
  });

  c.querySelector("#btnPreviewRamadan").addEventListener("click", () => {
    state.ramadanPreview = !state.ramadanPreview;
    if (state.ramadanPreview && !state.times) {
      // Önizleme için örnek vakitler (yalnızca gerçek vakit yokken)
      state.times = { Imsak: "04:52", Sunrise: "06:24", Dhuhr: "13:02", Asr: "16:47", Maghrib: "19:34", Isha: "21:12" };
      renderTimesList(state.times, "prayerTimesList", { isToday: true });
      updateHero(state.times);
    }
    renderRamadanHomeCard();
    updateRamadanCountdown();
    showToast(state.ramadanPreview ? "Ramazan modu önizlemede 🌙" : "Önizleme kapatıldı");
    goHome();
  });

  c.querySelector("#themeAuto").addEventListener("click", () => {
    clearThemeOverride();
    showToast("Otomatik tema aktif 🌗");
    goHome();
  });

  c.querySelector("#themeEmerald").addEventListener("click", () => {
    if (isThemeUnlocked("emerald")) {
      setThemeOverride("emerald");
      showToast("İslami Yeşil tema aktif 🟢");
      goHome();
    } else {
      goHome();
      showRewardedAd(() => {
        unlockTheme("emerald");
        setThemeOverride("emerald");
        showToast("İslami Yeşil tema açıldı! 🟢");
      });
    }
  });

  c.querySelector("#btnSaveAiKey").addEventListener("click", () => {
    const v = c.querySelector("#aiKeyInput").value.trim();
    state.aiKey = v;
    try { localStorage.setItem(AI_KEY_STORAGE_KEY, v); } catch (e) {}
    renderAIChat();
    showToast(v ? "AI anahtarı kaydedildi ✨" : "Anahtar temizlendi");
    goHome();
  });

  c.querySelector("#btnTestAdhan").addEventListener("click", () => {
    ensureAudio();
    adhanPreviewActive = true;
    playAdhanTone();
    notifyUser("Mihrap — test bildirimi 🕌", "Ezan bildirimi başarıyla çalışıyor.", { channelId: "genel" });
    showToast("Ezan sesi çalınıyor 🔊");
  });

  // "Bildirimi test et" → 10 saniye sonra bildirim (kapalıyken bile gelir mi görülür)
  c.querySelector("#btnTestNotification").addEventListener("click", async () => {
    const N = native();
    if (N && N.scheduleTestNotification) {
      // Native: cihazda zamanlanmış bildirim (uygulama kapanırsa da gelir)
      const ok = N.scheduleTestNotification(10000);
      showToast(ok ? "Test bildirimi 10 sn sonra gelecek 🔔 (uygulamayı kapatabilirsin)" : "Bildirim planlanamadı");
      return;
    }
    // Web: 10 saniye sonra bildirim
    showToast("Test bildirimi 10 sn sonra gelecek 🔔");
    setTimeout(() => {
      notifyUser("Mihrap — Test Bildirimi 🕌", "Bildirimler çalışıyor!", { channelId: "genel" });
    }, 10000);
  });

  // Ezan sesi seçimi
  c.querySelectorAll(".adhan-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      adhanStyle = btn.dataset.adhan;
      try { localStorage.setItem(ADHAN_STYLE_KEY, adhanStyle); } catch (e) {}
      c.querySelectorAll(".adhan-option").forEach((b) =>
        b.classList.toggle("adhan-option--active", b.dataset.adhan === adhanStyle));
      ensureAudio();
      adhanPreviewActive = true;
      playAdhanTone();
      const name = ADHAN_STYLES.find((s) => s.id === adhanStyle).name;
      showToast(`Ezan sesi: ${name} 🔊`);
    });
  });

  // Özel ezan MP3 linki
  c.querySelector("#adhanCustomInput").addEventListener("change", (e) => {
    adhanCustomUrl = e.target.value.trim();
    try { localStorage.setItem(ADHAN_CUSTOM_KEY, adhanCustomUrl); } catch (err) {}
    if (adhanCustomUrl) {
      ensureAudio();
      adhanPreviewActive = true;
      playAdhanTone();
      showToast("Özel ezan sesi kaydedildi 🔊");
    } else {
      showToast("Özel ses kaldırıldı; hazır nağme kullanılacak");
    }
  });

}

/* -------------------------------------------------------------------
   17) İSLAMI YAŞAMAK — Kur'an, cami, namaz, zikirmatik, zekât
------------------------------------------------------------------- */

/* — Kur'an: Türkçe sure adları (1..114) — */
const SURAH_NAMES_TR = ["", "Fâtiha", "Bakara", "Âl-i İmrân", "Nisâ", "Mâide", "En'âm", "A'râf", "Enfâl", "Tevbe", "Yûnus", "Hûd", "Yûsuf", "Ra'd", "İbrâhîm", "Hicr", "Nahl", "İsrâ", "Kehf", "Meryem", "Tâhâ", "Enbiyâ", "Hac", "Mü'minûn", "Nûr", "Furkân", "Şuarâ", "Neml", "Kasas", "Ankebût", "Rûm", "Lokmân", "Secde", "Ahzâb", "Sebe'", "Fâtır", "Yâsîn", "Sâffât", "Sâd", "Zümer", "Mü'min", "Fussilet", "Şûrâ", "Zuhruf", "Duhân", "Câsiye", "Ahkâf", "Muhammed", "Fetih", "Hucurât", "Kâf", "Zâriyât", "Tûr", "Necm", "Kamer", "Rahmân", "Vâkıa", "Hadîd", "Mücâdele", "Haşr", "Mümtehine", "Saf", "Cum'a", "Münâfikûn", "Tegâbün", "Talâk", "Tahrîm", "Mülk", "Kalem", "Hâkka", "Meâric", "Nûh", "Cin", "Müzzemmil", "Müddessir", "Kıyâme", "İnsân", "Mürselât", "Nebe'", "Nâziât", "Abese", "Tekvîr", "İnfitâr", "Mutaffifîn", "İnşikâk", "Bürûc", "Târık", "A'lâ", "Gâşiye", "Fecr", "Beled", "Şems", "Leyl", "Duhâ", "İnşirâh", "Tîn", "Alak", "Kadir", "Beyyine", "Zilzâl", "Âdiyât", "Kâria", "Tekâsür", "Asr", "Hümeze", "Fîl", "Kureyş", "Mâûn", "Kevser", "Kâfirûn", "Nasr", "Tebbet", "İhlâs", "Felak", "Nâs"];

/* Her surenin âyet sayısı (1..114) — âyet bazlı ses + otomatik takip için */
const SURAH_AYAH_COUNTS = [0, 7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6];

/* Surenin bir âyetinin global (1..6236) numarası */
function globalAyahNumber(surah, ayah) {
  let offset = 0;
  for (let i = 1; i < surah; i++) offset += SURAH_AYAH_COUNTS[i] || 0;
  return offset + ayah;
}

/* Çevrimdışı yedek: Fâtiha */
const FALLBACK_QURAN = [
  { number: 1, name: "سُورَةُ ٱلْفَاتِحَةِ", ayahCount: 7, ayahs: [
    { ar: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", la: "Bismillâhirrahmânirrahîm", tr: "Rahman ve Rahim olan Allah'ın adıyla." },
    { ar: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ", la: "Elhamdü lillâhi rabbil âlemîn", tr: "Hamd, âlemlerin Rabbi Allah'a mahsustur." },
    { ar: "الرَّحْمَٰنِ الرَّحِيمِ", la: "Errahmânirrahîm", tr: "O, Rahman'dır, Rahim'dir." },
    { ar: "مَالِكِ يَوْمِ الدِّينِ", la: "Mâliki yevmiddîn", tr: "Din (hesap) gününün sahibidir." },
    { ar: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ", la: "İyyâke na'büdü ve iyyâke nesteîn", tr: "Yalnız sana ibadet eder, yalnız senden yardım dileriz." },
    { ar: "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ", la: "İhdinas-sırâtal müstakîm", tr: "Bizi dosdoğru yola ilet." },
    { ar: "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ", la: "Sırâtallezîne en'amte aleyhim gayril mağdûbi aleyhim ve led-dâllîn", tr: "Kendilerine nimet verdiklerinin yoluna; gazaba uğrayanların ve sapıkların yoluna değil." },
  ] },
];

/* — Namaz rehberi — */
const PRAYER_GUIDE = [
  { name: "Sabah", icon: "🌅", rekat: "2 sünnet + 2 farz", total: 4, detail: "Güneş doğmadan önceki vakitte kılınır. Önce 2 rekât sünnet, ardından 2 rekât farz eda edilir.", rekatlar: [
    { ad: "2 rekât Sünnet", detay: "Müekked (kuvvetli) sünnettir. Hz. Peygamber'in hiç terk etmediği sünnetlerdendir." },
    { ad: "2 rekât Farz", detay: "Sabah namazının farzıdır. 2 rekâtın ikisinde de kıraat cehridir (açıktan okunur)." },
  ] },
  { name: "Öğle", icon: "☀️", rekat: "4 sünnet + 4 farz + 2 son sünnet", total: 10, detail: "Güneşin tepe noktasını geçmesinden sonra kılınır. Önce 4 rekât ilk sünnet, sonra 4 rekât farz, ardından 2 rekât son sünnet.", rekatlar: [
    { ad: "4 rekât İlk Sünnet", detay: "Müekked sünnettir. İki rekâtta bir oturulur; kıraat gizlidir." },
    { ad: "4 rekât Farz", detay: "Kıraat gizli (sirri) okunur. İlk iki rekâtta Fatiha + zamm-ı sûre, son iki rekâtta yalnız Fatiha." },
    { ad: "2 rekât Son Sünnet", detay: "Müekked sünnettir." },
  ] },
  { name: "İkindi", icon: "🌤️", rekat: "4 sünnet + 4 farz", total: 8, detail: "Öğle vaktinin çıkmasından güneş batana kadar kılınır. 4 rekât sünnet, ardından 4 rekât farz eda edilir.", rekatlar: [
    { ad: "4 rekât Sünnet", detay: "Gayr-i müekked sünnettir. İki rekâtta bir selam verilerek de kılınabilir." },
    { ad: "4 rekât Farz", detay: "Kıraat gizlidir. İlk iki rekâtta Fatiha + sûre, son iki rekâtta yalnız Fatiha." },
  ] },
  { name: "Akşam", icon: "🌇", rekat: "3 farz + 2 sünnet", total: 5, detail: "Güneş battıktan hemen sonra kılınır. Önce 3 rekât farz, ardından 2 rekât sünnet.", rekatlar: [
    { ad: "3 rekât Farz", detay: "İlk iki rekât kıraat cehri (açıktan) okunur; üçüncü rekâtta gizli okunur ve sonunda selam verilir." },
    { ad: "2 rekât Sünnet", detay: "Müekked sünnettir. Farzdan hemen sonra kılınır." },
  ] },
  { name: "Yatsı", icon: "🌙", rekat: "4 sünnet + 4 farz + 2 son sünnet + 3 vitir", total: 13, detail: "Akşam namazının vakti çıktıktan sonra kılınır. İlk iki rekât farzı cehridir. Ardından vitir (vacip) ile tamamlanır.", rekatlar: [
    { ad: "4 rekât İlk Sünnet", detay: "Gayr-i müekked sünnettir." },
    { ad: "4 rekât Farz", detay: "İlk iki rekât cehri, son iki rekât gizli okunur." },
    { ad: "2 rekât Son Sünnet", detay: "Müekked sünnettir." },
    { ad: "3 rekât Vitir", detay: "Vaciptir. Üçüncü rekâtta Kunut duaları okunur." },
  ] },
  { name: "Cuma", icon: "🕌", rekat: "4 + 2 + 4 + 2", total: 12, detail: "Cuma günü öğle vaktinde cemaatle kılınır ve öğle namazının yerine geçer. Hutbeden sonra 2 rekât farz cemaatle eda edilir.", rekatlar: [
    { ad: "4 rekât İlk Sünnet", detay: "Müekked sünnettir. Hutbeden önce kılınır." },
    { ad: "2 rekât Farz", detay: "Hutbe dinlendikten sonra imamla cemaatle kılınır. Kıraat cehridir." },
    { ad: "4 rekât Son Sünnet", detay: "Farzdan sonra kılınır." },
    { ad: "2 rekât Vakit Sünneti", detay: "Zuhr-i âhir (son öğle) niyetiyle kılınır." },
  ] },
  { name: "Teravih", icon: "🌙", rekat: "20 rekât", total: 20, detail: "Ramazan ayında yatsı namazından sonra kılınan sünnet namazdır. 2'şer veya 4'er rekât hâlinde kılınır; her 4 rekâtta bir kısa istirahat (terviha) yapılır.", rekatlar: [
    { ad: "20 rekât (2'şer selamlı)", detay: "Her iki rekâtta bir selam verilir. İmam açıktan okur, cemaat dinler." },
    { ad: "Terviha", detay: "Her 4 rekâtta bir; salavât, tesbih veya kısa bir istirahat yapılır." },
  ] },
  { name: "Cenaze", icon: "🕊️", rekat: "4 tekbir", total: 4, detail: "Cenaze namazı farz-ı kifâyedir. Ayakta kılınır; rükû ve secde yoktur. Dört tekbir alınır ve selam verilir.", rekatlar: [
    { ad: "1. Tekbir", detay: "İftitah tekbiri alınır, Sübhaneke okunur." },
    { ad: "2. Tekbir", detay: "Salavât (Salli-Bârik) okunur." },
    { ad: "3. Tekbir", detay: "Ölü için dua edilir." },
    { ad: "4. Tekbir + Selam", detay: "Dördüncü tekbirden sonra sağa ve sola selam verilir." },
  ] },
  { name: "Bayram", icon: "🎉", rekat: "2 rekât (ek tekbirler)", total: 2, detail: "Bayram namazı vaciptir. Güneş doğduktan yaklaşık 45 dakika sonra kılınır. Cemaatle eda edilir; namazdan sonra hutbe okunur.", rekatlar: [
    { ad: "1. Rekât", detay: "İftitah tekbirinden sonra 3 fazladan tekbir alınır, ardından Fatiha + sûre okunur." },
    { ad: "2. Rekât", detay: "Fatiha + sûreden sonra rükûya gitmeden 3 fazladan tekbir alınır." },
    { ad: "Teşrik Tekbiri", detay: "Kurban bayramı arefe ve bayram günlerinde farz namazlardan sonra teşrik tekbiri getirilir." },
  ] },
];

/* — Namaz duruşları (stilize silüet çizimler) — */
const POSTURE_ART = {
  tekbir: `<svg viewBox="0 0 120 120" class="posture-fig"><ellipse cx="60" cy="107" rx="28" ry="4.5" class="posture-ground"/><circle cx="60" cy="27" r="11"/><rect x="52" y="40" width="16" height="66" rx="8"/><path d="M56 46 L46 31" fill="none" stroke-width="8" stroke-linecap="round"/><path d="M64 46 L74 31" fill="none" stroke-width="8" stroke-linecap="round"/><circle cx="46" cy="29" r="4.5"/><circle cx="74" cy="29" r="4.5"/></svg>`,
  kiyam: `<svg viewBox="0 0 120 120" class="posture-fig"><ellipse cx="60" cy="107" rx="28" ry="4.5" class="posture-ground"/><circle cx="60" cy="27" r="11"/><rect x="52" y="40" width="16" height="66" rx="8"/><path d="M47 60 L73 60" fill="none" stroke-width="8" stroke-linecap="round"/></svg>`,
  ruku: `<svg viewBox="0 0 120 120" class="posture-fig"><ellipse cx="60" cy="107" rx="28" ry="4.5" class="posture-ground"/><circle cx="32" cy="56" r="10"/><path d="M40 60 L62 66" fill="none" stroke-width="9" stroke-linecap="round"/><path d="M60 66 L62 104" fill="none" stroke-width="9" stroke-linecap="round"/><path d="M45 63 L62 90" fill="none" stroke-width="8" stroke-linecap="round"/></svg>`,
  secde: `<svg viewBox="0 0 120 120" class="posture-fig"><ellipse cx="60" cy="107" rx="30" ry="4.5" class="posture-ground"/><circle cx="42" cy="98" r="10"/><path d="M50 92 L63 64" fill="none" stroke-width="9" stroke-linecap="round"/><path d="M63 68 L78 100" fill="none" stroke-width="9" stroke-linecap="round"/><path d="M51 95 L44 102" fill="none" stroke-width="7" stroke-linecap="round"/></svg>`,
  oturus: `<svg viewBox="0 0 120 120" class="posture-fig"><ellipse cx="60" cy="107" rx="28" ry="4.5" class="posture-ground"/><circle cx="60" cy="38" r="11"/><rect x="52" y="50" width="16" height="28" rx="8"/><rect x="42" y="86" width="36" height="16" rx="8"/><path d="M50 58 L46 74" fill="none" stroke-width="7" stroke-linecap="round"/><path d="M70 58 L74 74" fill="none" stroke-width="7" stroke-linecap="round"/></svg>`,
  selam: `<svg viewBox="0 0 120 120" class="posture-fig"><ellipse cx="60" cy="107" rx="28" ry="4.5" class="posture-ground"/><circle cx="68" cy="38" r="11"/><path d="M77 35 L83 31" fill="none" stroke-width="5" stroke-linecap="round"/><rect x="52" y="50" width="16" height="28" rx="8"/><rect x="42" y="86" width="36" height="16" rx="8"/><path d="M50 58 L46 74" fill="none" stroke-width="7" stroke-linecap="round"/><path d="M70 58 L74 74" fill="none" stroke-width="7" stroke-linecap="round"/></svg>`,
};

const POSTURES = [
  { id: "tekbir", no: "1", title: "Niyet & İftitah Tekbiri", desc: "Niyet edilir; eller kulak hizasına kaldırılıp «Allâhu Ekber» denir." },
  { id: "kiyam", no: "2", title: "Kıyam (Ayakta)", desc: "Eller göbek altında bağlanır; Sübhaneke, Fâtiha ve zamm-ı sûre okunur." },
  { id: "ruku", no: "3", title: "Rükû (Eğilme)", desc: "«Allâhu Ekber» diyerek eğilinir; üç kez «Sübhâne rabbiye'l-azîm» denir." },
  { id: "secde", no: "4", title: "Secde", desc: "Alın, burun, eller, dizler ve ayak parmakları yere değer; üç kez «Sübhâne rabbiye'l-a'lâ» denir." },
  { id: "oturus", no: "5", title: "Oturuş (Tahiyyat)", desc: "İki secde arasında ve son oturuşta Ettehiyyâtü, Salli-Bârik, Rabbenâ okunur." },
  { id: "selam", no: "6", title: "Selam", desc: "Baş önce sağa, sonra sola çevrilerek «Esselâmü aleyküm ve rahmetullâh» denir." },
];

/* — Namazda okunan başlıca dualar — */
const PRAYER_DUAS = [
  { ad: "Sübhaneke", okunus: "Sübhânekellâhümme ve bi hamdik ve tebârakesmük ve teâlâ ceddük ve lâ ilâhe gayruk", ar: "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ وَتَبَارَكَ اسْمُكَ وَتَعَالَى جَدُّكَ وَلَا إِلَهَ غَيْرُكَ", tr: "Allah'ım! Seni her türlü eksiklikten tenzih eder, sana hamdederim. Senin adın mübarektir, şanın yücedir ve senden başka ilah yoktur." },
  { ad: "Fâtiha Sûresi", okunus: "Bismillâhirrahmânirrahîm. Elhamdü lillâhi rabbil âlemîn. Errahmânirrahîm. Mâliki yevmiddîn. İyyâke na'büdü ve iyyâke nesteîn. İhdinas-sırâtal müstakîm. Sırâtallezîne en'amte aleyhim gayril mağdûbi aleyhim ve led-dâllîn.", ar: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ الرَّحْمَٰنِ الرَّحِيمِ مَالِكِ يَوْمِ الدِّينِ إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ", tr: "Rahman ve Rahim olan Allah'ın adıyla. Hamd, âlemlerin Rabbi Allah'a mahsustur. O Rahman'dır, Rahim'dir. Hesap gününün sahibidir. Yalnız sana ibadet eder, yalnız senden yardım dileriz. Bizi dosdoğru yola ilet. Kendilerine nimet verdiklerinin yoluna; gazaba uğrayanların ve sapıtanların yoluna değil." },
  { ad: "İhlâs Sûresi", okunus: "Kul hüvallâhü ehad. Allâhüs-samed. Lem yelid ve lem yûled. Ve lem yekün lehû küfüven ehad.", ar: "قُلْ هُوَ اللَّهُ أَحَدٌ اللَّهُ الصَّمَدُ لَمْ يَلِدْ وَلَمْ يُولَدْ وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ", tr: "De ki: O Allah birdir. Allah Samed'dir (her şey O'na muhtaçtır, O hiçbir şeye muhtaç değildir). O doğurmamış ve doğmamıştır. Hiçbir şey O'na denk ve eşit değildir." },
  { ad: "Felak Sûresi", okunus: "Kul eûzü birabbil-felak. Min şerri mâ halak. Ve min şerri gâsikın izâ vekab. Ve min şerrin-neffâsâti fil-ukad. Ve min şerri hâsidin izâ hased.", ar: "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ مِنْ شَرِّ مَا خَلَقَ وَمِنْ شَرِّ غَاسِقٍ إِذَا وَقَبَ وَمِنْ شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ وَمِنْ شَرِّ حَاسِدٍ إِذَا حَسَدَ", tr: "De ki: Sabahın Rabbine sığınırım. Yarattığı şeylerin şerrinden. Karanlığı çöktüğü zaman gecenin şerrinden. Düğümlere üfleyenlerin şerrinden. Haset ettiği zaman hasetçinin şerrinden." },
  { ad: "Nâs Sûresi", okunus: "Kul eûzü birabbin-nâs. Melikin-nâs. İlâhin-nâs. Min şerril-vesvâsil-hannâs. Ellezî yüvesvisü fî sudûrin-nâs. Minel-cinneti ven-nâs.", ar: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ مَلِكِ النَّاسِ إِلَٰهِ النَّاسِ مِنْ شَرِّ الْوَسْوَاسِ الْخَنَّاسِ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ مِنَ الْجِنَّةِ وَالنَّاسِ", tr: "De ki: İnsanların Rabbine sığınırım. İnsanların Melik'ine. İnsanların İlahına. Sinsi vesvesecinin şerrinden. O ki insanların göğüslerine vesvese verir. Gerek cinlerden, gerek insanlardan." },
  { ad: "Kevser Sûresi", okunus: "İnnâ a'taynâkel-kevser. Fesalli lirabbike venhar. İnne şânieke hüvel-ebter.", ar: "إِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ فَصَلِّ لِرَبِّكَ وَانْحَرْ إِنَّ شَانِئَكَ هُوَ الْأَبْتَرُ", tr: "Şüphesiz biz sana Kevser'i verdik. Öyleyse Rabbin için namaz kıl ve kurban kes. Doğrusu sana kin besleyen asıl soyu kesik olandır." },
  { ad: "Asr Sûresi", okunus: "Vel-asr. İnnel-insâne lefî husr. İllellezîne âmenû ve amilüs-sâlihâti ve tevâsav bil-hakkı ve tevâsav bis-sabr.", ar: "وَالْعَصْرِ إِنَّ الْإِنْسَانَ لَفِي خُسْرٍ إِلَّا الَّذِينَ آمَنُوا وَعَمِلُوا الصَّالِحَاتِ وَتَوَاصَوْا بِالْحَقِّ وَتَوَاصَوْا بِالصَّبْرِ", tr: "Asra (zamana) yemin olsun ki, insan gerçekten ziyandadır. Ancak iman edip salih amel işleyenler, birbirine hakkı ve sabrı tavsiye edenler müstesna." },
  { ad: "Rükû Tesbihi", okunus: "Sübhâne rabbiye'l-azîm", ar: "سُبْحَانَ رَبِّيَ الْعَظِيمِ", tr: "Büyük Rabbim her türlü eksiklikten uzaktır. (En az 3 kez)" },
  { ad: "Secde Tesbihi", okunus: "Sübhâne rabbiye'l-a'lâ", ar: "سُبْحَانَ رَبِّيَ الْأَعْلَى", tr: "Yüce Rabbim her türlü eksiklikten uzaktır. (En az 3 kez)" },
  { ad: "Ettehiyyâtü", okunus: "Ettehiyyâtü lillâhi ves-salavâtü vet-tayyibât. Esselâmü aleyke eyyühen-nebiyyü ve rahmetullâhi ve berakâtüh. Esselâmü aleynâ ve alâ ibâdillâhis-sâlihîn. Eşhedü en lâ ilâhe illallâh ve eşhedü enne Muhammeden abdühû ve rasûlüh.", ar: "التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ السَّلَامُ عَلَيْكَ أَيُّهَا النَّبِيُّ وَرَحْمَةُ اللَّهِ وَبَرَكَاتُهُ السَّلَامُ عَلَيْنَا وَعَلَى عِبَادِ اللَّهِ الصَّالِحِينَ أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللَّهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ", tr: "Her türlü kavli, bedeni ve mali ibadetler Allah'a mahsustur. Ey Peygamber! Allah'ın selamı, rahmeti ve bereketi senin üzerine olsun. Selam, bizim ve Allah'ın salih kullarının üzerine olsun. Şehadet ederim ki Allah'tan başka ilah yoktur ve yine şehadet ederim ki Muhammed O'nun kulu ve elçisidir." },
  { ad: "Salli & Bârik", okunus: "Allâhümme salli alâ Muhammedin ve alâ âli Muhammed, kemâ salleyte alâ İbrâhîme ve alâ âli İbrâhîm, inneke hamîdün mecîd. Allâhümme bârik alâ Muhammedin ve alâ âli Muhammed, kemâ bârekte alâ İbrâhîme ve alâ âli İbrâhîm, inneke hamîdün mecîd.", ar: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ اللَّهُمَّ بَارِكْ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا بَارَكْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ", tr: "Allah'ım! Muhammed'e ve Muhammed'in ailesine, İbrahim'e ve İbrahim'in ailesine salât (rahmet) ettiğin gibi salât et. Şüphesiz sen övülmeye layık ve yücesin. Allah'ım! Muhammed'e ve ailesine, İbrahim'e ve ailesine bereket ihsan ettiğin gibi bereket ihsan et. Şüphesiz sen övülmeye layık ve yücesin." },
  { ad: "Rabbenâ Âtinâ", okunus: "Rabbenâ âtinâ fid-dünyâ haseneten ve fil-âhireti haseneten ve kınâ azâben-nâr", ar: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", tr: "Rabbimiz! Bize dünyada da iyilik ver, ahirette de iyilik ver ve bizi ateş azabından koru." },
  { ad: "Kunut Duaları (Vitir)", okunus: "Allâhümme innâ nesteînüke ve nestağfiruke ve nestehdîk. Ve nü'minü bike ve netûbü ileyk. Ve netevekkelü aleyke ve nüsnî aleykel-hayra küllehû neşküruke ve lâ nekfuruk. Ve nahleu ve netrukü men yefcüruk. Allâhümme iyyâke na'büdü ve leke nüsallî ve nescüdü ve ileyke nes'â ve nahfid. Nercû rahmeteke ve nahşâ azâbeke inne azâbeke bil-küffâri mülhık.", ar: "اللَّهُمَّ إِنَّا نَسْتَعِينُكَ وَنَسْتَغْفِرُكَ وَنَسْتَهْدِيكَ وَنُؤْمِنُ بِكَ وَنَتُوبُ إِلَيْكَ وَنَتَوَكَّلُ عَلَيْكَ وَنُثْنِي عَلَيْكَ الْخَيْرَ كُلَّهُ نَشْكُرُكَ وَلَا نَكْفُرُكَ وَنَخْلَعُ وَنَتْرُكُ مَنْ يَفْجُرُكَ اللَّهُمَّ إِيَّاكَ نَعْبُدُ وَلَكَ نُصَلِّي وَنَسْجُدُ وَإِلَيْكَ نَسْعَى وَنَحْفِدُ نَرْجُو رَحْمَتَكَ وَنَخْشَى عَذَابَكَ إِنَّ عَذَابَكَ بِالْكُفَّارِ مُلْحِقٌ", tr: "Allah'ım! Senden yardım diler, senden bağışlanma ister, senden hidayet dileriz. Sana inanır, sana tövbe eder, sana tevekkül ederiz. Sana olan bütün övgülerle seni över, sana şükreder, nankörlük etmeyiz. Sana isyan edeni bırakır ve terk ederiz. Allah'ım! Yalnız sana ibadet eder, yalnız sana namaz kılar ve secde ederiz. Sana koşar, hizmet eder, rahmetini umar, azabından korkarız. Şüphesiz senin azabın kafirlere ulaşır." },
];

const ABDEST_STEPS = [
  { baslik: "Niyet", text: "Abdest almaya kalben niyet edilir ve «Bismillâhirrahmânirrahîm» denir.", dua: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ" },
  { baslik: "Ellerin Yıkanması", text: "Eller parmak araları dahil bileklere kadar üç kez yıkanır.", dua: "" },
  { baslik: "Ağıza Su Verme (Mazmaza)", text: "Sağ elle ağza üç kez su verilir, her seferinde ağız çalkalanır.", dua: "" },
  { baslik: "Buruna Su Verme (İstinşak)", text: "Sağ elle buruna üç kez su çekilir, sol elle sümkürülür.", dua: "" },
  { baslik: "Yüzün Yıkanması", text: "Alından çene altına, kulak yumuşaklarına kadar yüz üç kez yıkanır.", dua: "" },
  { baslik: "Kolların Yıkanması", text: "Önce sağ kol, sonra sol kol dirseklerle birlikte üç kez yıkanır.", dua: "" },
  { baslik: "Başın Mesh Edilmesi", text: "Islak ellerle başın dörtte biri (veya tamamı) mesh edilir.", dua: "" },
  { baslik: "Kulak ve Boynun Mesh Edilmesi", text: "Şehadet parmaklarıyla kulakların içi, başparmaklarla dışı mesh edilir; ardından boyun mesh edilir.", dua: "" },
  { baslik: "Ayakların Yıkanması", text: "Önce sağ ayak, sonra sol ayak topuklarla birlikte üç kez yıkanır; parmak araları hilallenir.", dua: "" },
];

/* — Zikirmatik — */
const DHIKR_PHRASES = [
  { ar: "سُبْحَانَ اللهِ", tr: "Sübhânallah", meaning: "Allah'ı her türlü eksiklikten tenzih ederim" },
  { ar: "الْحَمْدُ لِلَّهِ", tr: "Elhamdülillâh", meaning: "Hamd Allah'a mahsustur" },
  { ar: "اللهُ أَكْبَرُ", tr: "Allâhu Ekber", meaning: "Allah en büyüktür" },
  { ar: "لَا إِلٰهَ إِلَّا اللهُ", tr: "Lâ ilâhe illallâh", meaning: "Allah'tan başka ilah yoktur" },
  { ar: "أَسْتَغْفِرُ اللهَ", tr: "Estağfirullah", meaning: "Allah'tan bağışlanma dilerim" },
  { ar: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ", tr: "Salavât", meaning: "Allah'ım, Muhammed'e rahmet eyle" },
];

const QURAN_STORAGE_KEY = "mihrap:quran-last";
const QURAN_FAV_KEY = "mihrap:quran-favs";
const QURAN_AUDIO_BASE = "https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy"; // Mishary Alafasy tilaveti
const QURAN_AUDIO_AYAH_BASE = "https://cdn.islamic.network/quran/audio/128/ar.alafasy"; // âyet bazlı (global numara)
const QURAN_AUTOSCROLL_KEY = "mihrap:quran-autoscroll";
const QURAN_TAFSIR_KEY = "mihrap:quran-tafsir";

function getQuranLast() {
  try { return JSON.parse(localStorage.getItem(QURAN_STORAGE_KEY) || "null"); }
  catch (e) { return null; }
}
function setQuranLast(pos) {
  try { localStorage.setItem(QURAN_STORAGE_KEY, JSON.stringify(pos)); } catch (e) {}
}

/* Favoriler: { type: "surah"|"ayah", surah, ayah? } listesi */
function getQuranFavs() {
  try {
    const f = JSON.parse(localStorage.getItem(QURAN_FAV_KEY) || "[]");
    return Array.isArray(f) ? f : [];
  } catch (e) { return []; }
}
function setQuranFavs(favs) {
  try { localStorage.setItem(QURAN_FAV_KEY, JSON.stringify(favs)); } catch (e) {}
}
function favKey(type, surah, ayah) {
  return type === "ayah" ? `ayah:${surah}:${ayah}` : `surah:${surah}`;
}
function isQuranFav(type, surah, ayah) {
  return getQuranFavs().some((f) => favKey(f.type, f.surah, f.ayah) === favKey(type, surah, ayah));
}
function toggleQuranFav(type, surah, ayah) {
  const favs = getQuranFavs();
  const k = favKey(type, surah, ayah);
  const idx = favs.findIndex((f) => favKey(f.type, f.surah, f.ayah) === k);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(type === "ayah" ? { type, surah, ayah } : { type, surah });
  setQuranFavs(favs);
  return idx < 0; // true = eklendi, false = çıkarıldı
}

let quranScrollHandler = null;
function clearQuranTracking() {
  if (quranScrollHandler) {
    window.removeEventListener("scroll", quranScrollHandler);
    quranScrollHandler = null;
  }
}

let quranSurahList = null;
let quranAudio = null;   // aktif ses çalar (sure tilaveti)
let quranAyahPlayer = null; // âyet bazlı oynatıcı durumu { surah, idx, total }
let quranAutoScroll = true; // tilavet sırasında sayfayı otomatik kaydır
let quranShowTafsir = false; // âyet tefsiri (Elmalılı) göster
let tasbihCount = 0;
let tasbihTarget = 33;
let tasbihPhraseIdx = 0;

/* — Ekran/hub yönetimi — */
function resetLiving() {
  const hub = $("#livingHub"), sub = $("#livingSub"), content = $("#livingContent");
  if (!hub) return;
  currentLiving = null;
  livingBackHandler = null;
  hub.hidden = false; sub.hidden = true; content.innerHTML = "";
  clearQuranTracking();
  stopQuranAudio();
  disableCompass();
  // Esma zikri + hicri gezinmeyi sıfırla
  esmaZikirPlaying = false;
  try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
  hicriMonthOffset = 0;
}

function initLiving() {
  const hub = $("#livingHub");
  if (!hub) return;
  const sub = $("#livingSub"), content = $("#livingContent");

  hub.querySelectorAll("[data-living]").forEach((card) => {
    card.addEventListener("click", () => {
      const kind = card.dataset.living;
      currentLiving = kind;
      livingBackHandler = null; // yeni modül açıldı; "Geri" artık İslamı Yaşamak'a döner
      hub.hidden = true; sub.hidden = false;
      if (kind === "quran") renderQuran();
      else if (kind === "mosque") renderMosque();
      else if (kind === "prayer") renderPrayer();
      else if (kind === "abdest") renderAbdest();
      else if (kind === "tracker") renderNamazTakip();
      else if (kind === "worship") renderWorship();
      else if (kind === "zikir") renderZikir();
      else if (kind === "dua") renderDua();
      else if (kind === "tasbih") renderTasbih();
      else if (kind === "zakat") renderZakat();
      else if (kind === "qibla") renderQibla();
      else if (kind === "hatim") renderHatimFull();
      else if (kind === "kaza") renderKaza();
      else if (kind === "quiz") renderQuiz();
      else if (kind === "adab") renderAdab();
      else if (kind === "hicri") renderHicriTakvim();
      else if (kind === "gunler") renderDiniGunler();
      else if (kind === "esmazikir") renderEsmaZikir();
      else if (kind === "hatirlatici") renderHatirlaticilar();
    });
  });

  $("#livingBack").addEventListener("click", () => {
    if (livingBackHandler) { const h = livingBackHandler; livingBackHandler = null; h(); }
    else resetLiving();
  });
}

/* — Kur'an-ı Kerim — */
function renderQuran() {
  const c = $("#livingContent");
  livingBackHandler = null; // sure listesindeyken "Geri" → İslamı Yaşamak
  stopQuranAudio();
  const last = getQuranLast();
  const favCount = getQuranFavs().length;
  const continueHtml = (last && last.surah)
    ? `<button class="quran-continue" id="quranContinue">
         <span class="quran-continue__icon">📖</span>
         <span class="quran-continue__body">
           <span class="quran-continue__label">Kaldığın yerden devam et</span>
           <span class="quran-continue__pos">${SURAH_NAMES_TR[last.surah] || ""} Sûresi · ${last.ayah || 1}. âyet</span>
         </span>
         <svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
       </button>`
    : "";

  c.innerHTML = `
    <div class="quran">
      ${continueHtml}
      <button class="quran-favbtn" id="quranShowFavs">⭐ Favoriler (${favCount})</button>
      <div class="picker__search"><svg class="icon icon--xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" id="surahSearch" placeholder="Sure ara... (örn: Yâsîn, Fâtiha)" autocomplete="off" /></div>
      <div class="quran__list" id="surahList"><div class="quran__loading">Sureler yükleniyor...</div></div>
    </div>`;
  $("#surahSearch").addEventListener("input", (e) => renderSurahList(e.target.value));
  const contBtn = $("#quranContinue");
  if (contBtn) contBtn.addEventListener("click", () => openSurah(last.surah, last.ayah));
  const favBtn = $("#quranShowFavs");
  if (favBtn) favBtn.addEventListener("click", renderQuranFavorites);
  loadSurahList();
}

async function loadSurahList() {
  try {
    const res = await fetch("https://api.alquran.cloud/v1/surah");
    if (!res.ok) throw new Error("HTTP " + res.status);
    quranSurahList = (await res.json()).data;
  } catch (e) {
    quranSurahList = FALLBACK_QURAN;
  }
  renderSurahList("");
}

function renderSurahList(filter = "") {
  if (!quranSurahList) return;
  const q = filter.trim().toLocaleLowerCase("tr");
  const list = quranSurahList.filter((s) => {
    const trName = SURAH_NAMES_TR[s.number] || "";
    return !q || trName.toLocaleLowerCase("tr").includes(q) ||
      (s.englishNameTranslation || "").toLocaleLowerCase("tr").includes(q) ||
      String(s.number) === q;
  });

  const el = $("#surahList");
  if (!el) return;
  if (!list.length) { el.innerHTML = '<div class="quran__loading">Sonuç bulunamadı</div>'; return; }

  let lastRead = 0;
  const saved = getQuranLast();
  if (saved && saved.surah) lastRead = saved.surah;

  el.innerHTML = list.map((s) => {
    const trName = SURAH_NAMES_TR[s.number] || "";
    const isLast = s.number === lastRead;
    const isFav = isQuranFav("surah", s.number);
    return `<div class="surah-row ${isLast ? "surah-row--last" : ""}" data-n="${s.number}">
      <span class="surah-row__num">${s.number}</span>
      <span class="surah-row__names">
        <span class="surah-row__tr">${trName}</span>
        <span class="surah-row__ar">${s.name}</span>
      </span>
      <span class="surah-row__count">${s.numberOfAyahs} âyet</span>
      <button class="surah-row__fav ${isFav ? "surah-row__fav--on" : ""}" data-fav="${s.number}" aria-label="${isFav ? "Favorilerden çıkar" : "Favorilere ekle"}">${isFav ? "⭐" : "☆"}</button>
    </div>`;
  }).join("");

  el.querySelectorAll(".surah-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".surah-row__fav")) return;
      openSurah(Number(row.dataset.n));
    });
  });
  el.querySelectorAll(".surah-row__fav").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const n = Number(btn.dataset.fav);
      const added = toggleQuranFav("surah", n);
      btn.classList.toggle("surah-row__fav--on", added);
      btn.textContent = added ? "⭐" : "☆";
      btn.setAttribute("aria-label", added ? "Favorilerden çıkar" : "Favorilere ekle");
      showToast(added ? "Favorilere eklendi ⭐" : "Favorilerden çıkarıldı");
      const favBtn = $("#quranShowFavs");
      if (favBtn) favBtn.textContent = `⭐ Favoriler (${getQuranFavs().length})`;
    });
  });
}

/* Teknik çeviriyazıyı sade okunuşa çevirir (noktalı harfler + ayın + tire temizlenir) */
function simplifyTranslit(s) {
  if (!s) return "";
  return s
    .replace(/`/g, "")                 // ayın (ع) → yok
    .replace(/ḥ|ḫ/g, "h")
    .replace(/ḳ/g, "k")
    .replace(/ṣ|ŝ/g, "s")
    .replace(/ṭ/g, "t")
    .replace(/ḍ/g, "d")
    .replace(/ẕ|ż/g, "z")
    .replace(/-/g, "");
}

async function openSurah(n, targetAyah) {
  const c = $("#livingContent");
  stopQuranAudio(); // önceki tilaveti tamamen durdur (sureler arası devam etmez)
  livingBackHandler = renderQuran; // okuyucudan "Geri" → sure listesine döner
  c.innerHTML = `<div class="quran__loading">${SURAH_NAMES_TR[n] || ""} sûresi yükleniyor...</div>`;
  clearQuranTracking();
  setQuranLast({ surah: n, ayah: targetAyah || 1 });

  let surah = null;
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/surah/${n}/editions/quran-uthmani,tr.diyanet,tr.transliteration,tr.yazir`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = (await res.json()).data;
    const ar = d.find((x) => x.edition.type === "quran") || d[0];
    const tr = d.find((x) => x.edition.identifier === "tr.diyanet") || d[1];
    const la = d.find((x) => x.edition.identifier === "tr.transliteration");
    const tf = d.find((x) => x.edition.identifier === "tr.yazir");
    surah = {
      number: n, name: d[0].name,
      ayahs: ar.ayahs.map((a, i) => ({
        ar: a.text,
        la: (la && la.ayahs[i]) ? simplifyTranslit(la.ayahs[i].text) : "",
        tr: (tr.ayahs[i] || {}).text || "",
        tf: (tf && tf.ayahs[i]) ? tf.ayahs[i].text : "",
      })),
    };
  } catch (e) {
    surah = FALLBACK_QURAN.find((s) => s.number === n) || null;
  }

  if (!surah) {
    c.innerHTML = '<div class="quran__loading">Sure yüklenemedi (çevrimdışı?).</div>';
    return;
  }

  const ayahHtml = surah.ayahs.map((a, i) => {
    const isFav = isQuranFav("ayah", n, i + 1);
    return `
    <div class="quran-ayah" data-ayah="${i + 1}">
      <button class="ayah-fav ${isFav ? "ayah-fav--on" : ""}" data-fav="${i + 1}" aria-label="${isFav ? "Âyeti favorilerden çıkar" : "Âyeti favorilere ekle"}">${isFav ? "⭐" : "☆"}</button>
      <p class="quran-ayah__ar" dir="rtl">${a.ar} <span class="quran-ayah__num">${i + 1}</span></p>
      ${a.la ? `<p class="quran-ayah__la"><i>${a.la}</i></p>` : ""}
      <p class="quran-ayah__tr">${a.tr}</p>
      ${a.tf ? `<p class="quran-ayah__tf"><b>Tefsir (Elmalılı):</b> ${a.tf}</p>` : ""}
    </div>`;
  }).join("");

  const surahFav = isQuranFav("surah", n);
  c.innerHTML = `
    <div class="quran__reader" id="quranReader">
      <div class="quran__reader-head">
        <span class="quran__reader-name">${SURAH_NAMES_TR[n] || ""}</span>
        <span class="quran__reader-ar" dir="rtl">${surah.name}</span>
        <button class="quran__reader-fav ${surahFav ? "quran__reader-fav--on" : ""}" id="quranSurahFav" aria-label="${surahFav ? "Sureyi favorilerden çıkar" : "Sureyi favorilere ekle"}">${surahFav ? "⭐" : "☆"}</button>
      </div>
      <div class="quran__reader-actions">
        <button class="quran__nav-btn quran__nav-btn--play" id="quranPlay">▶ Dinle</button>
        <button class="quran__nav-btn" data-goto-surah="${n - 1}" ${n <= 1 ? "disabled" : ""}>← Önceki</button>
        <button class="quran__nav-btn" data-back-list>Sure Listesi</button>
        <button class="quran__nav-btn" data-goto-surah="${n + 1}" ${n >= 114 ? "disabled" : ""}>Sonraki →</button>
        <button class="quran__nav-btn quran__nav-btn--full" id="quranFullscreen">⛶ Tam Ekran</button>
      </div>
      <label class="quran-autoscroll">
        <span class="switch">
          <input type="checkbox" id="quranAutoScrollToggle" ${quranAutoScroll ? "checked" : ""}>
          <span class="switch__track"><span class="switch__thumb"></span></span>
        </span>
        <span class="quran-autoscroll__label">📜 Âyetleri otomatik takip et (tilavetle sayfa kayar)</span>
      </label>
      <label class="quran-autoscroll">
        <span class="switch">
          <input type="checkbox" id="quranTafsirToggle" ${quranShowTafsir ? "checked" : ""}>
          <span class="switch__track"><span class="switch__thumb"></span></span>
        </span>
        <span class="quran-autoscroll__label">📖 Tefsir göster (Elmalılı Hamdi Yazır)</span>
      </label>
      ${ayahHtml}
    </div>`;

  c.querySelectorAll("[data-goto-surah]").forEach((b) => b.addEventListener("click", () => openSurah(Number(b.dataset.gotoSurah))));
  c.querySelector("[data-back-list]").addEventListener("click", renderQuran);
  c.querySelector("#quranFullscreen").addEventListener("click", () => toggleQuranFullscreen());
  c.querySelector("#quranPlay").addEventListener("click", () => toggleSurahAudio(n));
  c.querySelector("#quranAutoScrollToggle").addEventListener("change", (e) => {
    quranAutoScroll = e.target.checked;
    try { localStorage.setItem(QURAN_AUTOSCROLL_KEY, JSON.stringify(quranAutoScroll)); } catch (err) {}
    if (!quranAutoScroll) stopQuranAudio();
    showToast(quranAutoScroll ? "Otomatik takip açık 📜" : "Otomatik takip kapalı");
  });
  c.querySelector("#quranTafsirToggle").addEventListener("change", (e) => {
    quranShowTafsir = e.target.checked;
    try { localStorage.setItem(QURAN_TAFSIR_KEY, JSON.stringify(quranShowTafsir)); } catch (err) {}
    c.querySelector("#quranReader").classList.toggle("quran--tafsir", quranShowTafsir);
  });
  if (quranShowTafsir) c.querySelector("#quranReader").classList.add("quran--tafsir");
  c.querySelector("#quranSurahFav").addEventListener("click", () => {
    const added = toggleQuranFav("surah", n);
    const b = c.querySelector("#quranSurahFav");
    b.classList.toggle("quran__reader-fav--on", added);
    b.textContent = added ? "⭐" : "☆";
    showToast(added ? "Sure favorilere eklendi ⭐" : "Sure favorilerden çıkarıldı");
  });
  c.querySelectorAll(".ayah-fav").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const ayah = Number(btn.dataset.fav);
      const added = toggleQuranFav("ayah", n, ayah);
      btn.classList.toggle("ayah-fav--on", added);
      btn.textContent = added ? "⭐" : "☆";
      showToast(added ? "Âyet favorilere eklendi ⭐" : "Âyet favorilerden çıkarıldı");
    });
  });

  // Kaydedilen âyete kaydır + vurgula
  if (targetAyah && targetAyah > 1) {
    const target = c.querySelector(`.quran-ayah[data-ayah="${targetAyah}"]`);
    if (target) {
      target.classList.add("quran-ayah--current");
      setTimeout(() => {
        target.scrollIntoView({ block: "start", behavior: "smooth" });
      }, 150);
    }
  }

  // Okuma konumunu takip et (kaydırarak)
  trackQuranReading(n);
}

function trackQuranReading(surahNumber) {
  clearQuranTracking();
  quranScrollHandler = () => {
    const ayahs = document.querySelectorAll(".quran-ayah");
    if (!ayahs.length) return;
    let current = 1;
    const threshold = 120;
    for (const a of ayahs) {
      if (a.getBoundingClientRect().top <= threshold) current = Number(a.dataset.ayah);
      else break;
    }
    setQuranLast({ surah: surahNumber, ayah: current });
    // görsel vurgu
    ayahs.forEach((x) => x.classList.toggle("quran-ayah--current", Number(x.dataset.ayah) === current));
  };
  window.addEventListener("scroll", quranScrollHandler, { passive: true });
}

/* — Sure tilaveti (Mishary Alafasy) — */
function stopQuranAudio() {
  if (quranAudio) {
    try { quranAudio.pause(); } catch (e) {}
    quranAudio = null;
  }
  quranAyahPlayer = null;
  const btn = $("#quranPlay");
  if (btn) btn.textContent = "▶ Dinle";
}

/* Tilaveti DURDUR (kaldığı yerden devam etmek için): sesi duraklat, konumu koru */
function pauseQuranAudio() {
  if (quranAudio) {
    try { quranAudio.pause(); } catch (e) {}
  }
  const btn = $("#quranPlay");
  if (btn) btn.textContent = "▶ Devam";
}

/* Kaldığı yerden DEVAM ET (durdurulan ses elementini koruduğumuz için yeterli) */
function resumeQuranAudio() {
  const btn = $("#quranPlay");
  if (!quranAudio) return;
  quranAudio.play().then(() => {
    if (btn) btn.textContent = "⏸ Durdur";
  }).catch(() => {
    stopQuranAudio();
    showToast("Ses çalınamadı (bağlantı?).");
  });
}
function scrollToAyah(ayah) {
  const el = document.querySelector(`.quran-ayah[data-ayah="${ayah}"]`);
  if (!el) return;
  try { el.scrollIntoView({ block: "start", behavior: "smooth" }); } catch (e) { el.scrollIntoView(); }
  document.querySelectorAll(".quran-ayah--current").forEach((x) => x.classList.remove("quran-ayah--current"));
  el.classList.add("quran-ayah--current");
}
function toggleSurahAudio(n) {
  const btn = $("#quranPlay");
  if (quranAudio) {
    // Çalıyorsa durdur (kaldığı yerden devam edilebilir), duruyorsa devam et
    if (quranAudio.paused) resumeQuranAudio();
    else pauseQuranAudio();
    return;
  }
  stopAdhanOnly(); // ezan/preview çalıyorsa durdur (tek ses)
  if (quranAutoScroll) {
    playSurahAyahByAyah(n);
    return;
  }
  const src = `${QURAN_AUDIO_BASE}/${n}.mp3`;
  quranAudio = new Audio(src);
  quranAudio.play().then(() => {
    if (btn) btn.textContent = "⏸ Durdur";
    showToast("Tilavet başladı 🔊");
  }).catch(() => {
    stopQuranAudio();
    showToast("Ses çalınamadı (bağlantı?).");
  });
  quranAudio.onended = () => {
    if (btn) btn.textContent = "▶ Dinle";
    quranAudio = null;
  };
}

/* Âyet bazlı oynatma + otomatik takip (sayfa âyet âyet kayar) */
function playSurahAyahByAyah(n) {
  const total = SURAH_AYAH_COUNTS[n] || 0;
  if (!total) { showToast("Âyet bilgisi yok."); return; }
  stopAdhanOnly(); // ezan/preview çalıyorsa durdur (tek ses)
  const btn = $("#quranPlay");
  let idx = 0;
  const step = () => {
    if (idx >= total) {
      stopQuranAudio();
      return;
    }
    idx++;
    const global = globalAyahNumber(n, idx);
    const audio = new Audio(`${QURAN_AUDIO_AYAH_BASE}/${global}.mp3`);
    quranAudio = audio;
    quranAyahPlayer = { surah: n, idx, total };
    scrollToAyah(idx);
    audio.play().catch(() => {
      stopQuranAudio();
      showToast("Ses çalınamadı (bağlantı?).");
    });
    audio.onended = () => { quranAudio = null; step(); };
  };
  if (btn) btn.textContent = "⏸ Durdur";
  showToast("Tilavet başladı — âyetler takip ediliyor 🔊");
  step();
}

/* — Favoriler görünümü — */
function renderQuranFavorites() {
  stopQuranAudio();
  livingBackHandler = renderQuran; // favorilerden "Geri" → sure listesine döner
  const c = $("#livingContent");
  const favs = getQuranFavs();
  if (!favs.length) {
    c.innerHTML = `
      <div class="quran">
        <button class="quran__nav-btn" data-back-list>← Sure Listesi</button>
        <div class="quran__loading">Henüz favori eklemediniz. Sure veya âyetlerdeki ⭐ simgesine dokunun.</div>
      </div>`;
    c.querySelector("[data-back-list]").addEventListener("click", renderQuran);
    return;
  }

  const surahFavs = favs.filter((f) => f.type === "surah");
  const ayahFavs = favs.filter((f) => f.type === "ayah");

  const surahRows = surahFavs.map((f) => `
    <button class="surah-row" data-n="${f.surah}">
      <span class="surah-row__num">${f.surah}</span>
      <span class="surah-row__names"><span class="surah-row__tr">${SURAH_NAMES_TR[f.surah] || ""} Sûresi</span></span>
      <span class="surah-row__fav surah-row__fav--on">⭐</span>
    </button>`).join("");

  const ayahRows = ayahFavs.map((f) => `
    <div class="surah-row surah-row--ayah" data-n="${f.surah}" data-ayah="${f.ayah}">
      <span class="surah-row__num">${f.surah}:${f.ayah}</span>
      <span class="surah-row__names"><span class="surah-row__tr">${SURAH_NAMES_TR[f.surah] || ""} Sûresi · ${f.ayah}. âyet</span></span>
      <span class="surah-row__fav surah-row__fav--on">⭐</span>
      <button class="ayah-share" data-share-ayah="${f.surah}:${f.ayah}" aria-label="Âyeti paylaş">${ICON_SHARE}</button>
    </div>`).join("");

  c.innerHTML = `
    <div class="quran">
      <button class="quran__nav-btn" data-back-list>← Sure Listesi</button>
      ${surahRows ? `<div class="section-head"><h3 class="section-title">📖 Favori Sureler</h3></div><div class="quran__list">${surahRows}</div>` : ""}
      ${ayahRows ? `<div class="section-head"><h3 class="section-title">📑 Favori Âyetler</h3></div><div class="quran__list">${ayahRows}</div>` : ""}
    </div>`;

  c.querySelector("[data-back-list]").addEventListener("click", renderQuran);
  c.querySelectorAll(".surah-row").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".ayah-share")) return; // paylaş butonu kendi akışını yürütür
      openSurah(Number(row.dataset.n), row.dataset.ayah ? Number(row.dataset.ayah) : undefined);
    });
  });
  c.querySelectorAll(".ayah-share").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const [s, a] = btn.dataset.shareAyah.split(":").map(Number);
      shareAyah(s, a, btn);
    });
  });
}

/* — Favori âyeti paylaş (yalnızca favorilere eklenen âyetler) — */
async function fetchAyahText(surah, ayah) {
  try {
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/${surah}:${ayah}/editions/quran-uthmani,tr.diyanet,tr.transliteration`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = (await res.json()).data;
    const ar = d.find((x) => x.edition.type === "quran") || d[0];
    const tr = d.find((x) => x.edition.identifier === "tr.diyanet") || d[1];
    const la = d.find((x) => x.edition.identifier === "tr.transliteration");
    return {
      ar: ar.ayahs[0].text,
      la: (la && la.ayahs[0]) ? simplifyTranslit(la.ayahs[0].text) : "",
      tr: (tr.ayahs[0] || {}).text || "",
    };
  } catch (e) {
    // Çevrimdışı yedek (yalnızca Fâtiha)
    const s = FALLBACK_QURAN.find((x) => x.number === surah);
    return (s && s.ayahs[ayah - 1]) ? s.ayahs[ayah - 1] : null;
  }
}

async function shareAyah(surah, ayah, btn) {
  if (btn) btn.disabled = true;
  const a = await fetchAyahText(surah, ayah);
  if (btn) btn.disabled = false;
  if (!a) { showToast("Âyet yüklenemedi (çevrimdışı?)"); return; }
  const sureAdi = SURAH_NAMES_TR[surah] || "";
  await shareCard({
    type: "ayet",
    label: "KUR'AN-I KERİM",
    title: `${sureAdi} Sûresi · ${ayah}. âyet`,
    arabic: a.ar,
    text: a.tr,
    source: `${sureAdi} Sûresi, ${ayah}. âyet`,
    caption: `${sureAdi} Sûresi · ${ayah}. âyet`,
  });
}

/* Tam ekran okuma modu */
function toggleQuranFullscreen() {
  const target = $("#livingContent");
  const btn = $("#quranFullscreen");
  if (!document.fullscreenElement) {
    const req = target.requestFullscreen || target.webkitRequestFullscreen;
    if (req) req.call(target).catch(() => {});
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) exit.call(document);
  }
  const onFs = () => {
    const active = !!document.fullscreenElement;
    if (btn) btn.textContent = active ? "⛶ Tam Ekrandan Çık" : "⛶ Tam Ekran";
    document.body.classList.toggle("quran-fullscreen", active);
  };
  document.addEventListener("fullscreenchange", onFs, { once: true });
  document.addEventListener("webkitfullscreenchange", onFs, { once: true });
}

/* — Kıble Bulucu — */
function renderQibla() {
  const c = $("#livingContent");
  c.innerHTML = `
    <div class="qibla">
      <span class="qibla__loc"><span>📍</span><span id="qiblaLocation">${state.location ? state.location.name : ""}</span></span>

      <div class="compass" id="compass">
        <div class="compass__dial" id="compassDial">
          <span class="compass__mark compass__mark--n">K</span>
          <span class="compass__mark compass__mark--e">D</span>
          <span class="compass__mark compass__mark--s">G</span>
          <span class="compass__mark compass__mark--w">B</span>
          <span class="compass__tick"></span>
          <div class="compass__needle" id="needle">
            <span class="compass__needle-arrow"></span>
            <span class="compass__needle-label">Kıble</span>
          </div>
        </div>
        <div class="compass__center">🕋</div>
      </div>

      <div class="qibla__stats card">
        <div class="qibla__stat">
          <span class="qibla__stat-label">Kıble Açısı</span>
          <span class="qibla__stat-value" id="qiblaBearing">—°</span>
        </div>
        <div class="qibla__stat">
          <span class="qibla__stat-label">Kâbe'ye Uzaklık</span>
          <span class="qibla__stat-value" id="qiblaDistance">— km</span>
        </div>
      </div>

      <button class="btn-gold" id="btnCompass">Pusulayı Etkinleştir</button>
      <p class="qibla__hint" id="qiblaHint">Konum ve pusula izni verdiğinizde ibre Kâbe yönünü gösterir.</p>
    </div>`;
  $("#btnCompass").addEventListener("click", enableCompass);
  initQibla();
}

/* — En Yakın Cami — */
async function renderMosque() {
  const c = $("#livingContent");
  c.innerHTML = `<div class="quran__loading">🕌 Yakın camiler aranıyor...</div>`;

  let coords = state.location ? { lat: state.location.lat, lng: state.location.lng } : null;
  const pos = await getDevicePosition({ enableHighAccuracy: true, timeout: 8000 });
  if (pos) coords = { lat: pos.lat, lng: pos.lng };

  if (!coords) {
    c.innerHTML = '<div class="quran__loading">Konum alınamadı. Önce bir konum seçin.</div>';
    return;
  }

  const mosques = await fetchMosques(coords.lat, coords.lng);

  // Harici harita bağlantıları (iframe yok — bazı ortamlar iframe'i engelliyor)
  const gmapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;
  const gmapsDir = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  c.innerHTML = `
    <div class="mosque">
      <div class="mosque__head">
        <span class="mosque__title">🕌 En Yakın Camiler</span>
        <span class="mosque__loc">📍 ${state.location ? state.location.name : "Konumum"}</span>
      </div>
      <a class="mosque__map-btn" href="${gmapsLink(coords.lat, coords.lng)}" target="_blank" rel="noopener">
        🗺 Çevremdeki Camileri Haritada Gör →
      </a>
      ${mosques.length
        ? `<div class="mosque__list">${mosques.map((m) => `
          <div class="mosque-card">
            <div class="mosque-card__info">
              <span class="mosque-card__name">🕌 ${m.name || "Cami"}</span>
              <span class="mosque-card__dist">${m.distKm < 1 ? `${Math.round(m.distKm * 1000)} m` : `${m.distKm.toFixed(1)} km`} uzaklıkta</span>
            </div>
            <div class="mosque-card__actions">
              <a class="mosque-card__dir" href="${gmapsLink(m.lat, m.lng)}" target="_blank" rel="noopener">🗺 Harita</a>
              <a class="mosque-card__dir" href="${gmapsDir(m.lat, m.lng)}" target="_blank" rel="noopener">Yol Tarifi →</a>
            </div>
          </div>`).join("")}</div>`
        : '<div class="quran__loading">Yakında kayıtlı cami bulunamadı. Harita butonunu kullanarak çevrenizdeki camileri görebilirsiniz.</div>'}
      <p class="quran__note">Veri: OpenStreetMap (Overpass). Harita Google Maps'te açılır.</p>
    </div>`;
}

async function fetchMosques(lat, lng) {
  const query = `[out:json];node["amenity"="place_of_worship"]["religion"="muslim"](around:15000,${lat},${lng});out 30;`;
  // Yedekli Overpass mirror listesi (biri yüklenirse diğeri denenir)
  const mirrors = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];
  for (const base of mirrors) {
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (!Array.isArray(json.elements)) throw new Error("geçersiz yanıt");
      return json.elements
        .map((e) => ({
          name: (e.tags && (e.tags.name || e.tags["name:tr"])) || "",
          lat: e.lat, lng: e.lon,
          distKm: haversineKm(lat, lng, e.lat, e.lon),
        }))
        .sort((a, b) => a.distKm - b.distKm);
    } catch (e) {
      console.warn("[Mihrap] Cami arama hatası (" + base + "):", e.message);
    }
  }
  return [];
}

/* — Namaz Nasıl Kılınır — */
function renderPrayer() {
  const c = $("#livingContent");
  c.innerHTML = `
    <div class="prayer-guide">
      <div class="prayer-tabs" id="prayerTabs">
        ${PRAYER_GUIDE.map((p, i) => `<button class="prayer-tab ${i === 0 ? "prayer-tab--active" : ""}" data-i="${i}"><span>${p.icon}</span>${p.name}</button>`).join("")}
      </div>
      <div class="prayer-detail card" id="prayerDetail"></div>

      <div class="ornament" aria-hidden="true"><svg viewBox="0 0 220 24"><line x1="8" y1="12" x2="84" y2="12"/><line x1="136" y1="12" x2="212" y2="12"/><g transform="translate(110,12)"><path d="M0 -7 C5 -3.5 5 3.5 0 7 C-5 3.5 -5 -3.5 0 -7 Z"/><circle r="2.4"/></g><circle cx="84" cy="12" r="2.5"/><circle cx="136" cy="12" r="2.5"/></svg></div>

      <h3 class="guide-subtitle">🤲 Namazın Duruşları</h3>
      <div class="posture-grid">
        ${POSTURES.map((p) => `
          <div class="posture-card">
            <div class="posture-card__art">${POSTURE_ART[p.id]}</div>
            <span class="posture-card__no">${p.no}</span>
            <span class="posture-card__title">${p.title}</span>
            <p class="posture-card__desc">${p.desc}</p>
          </div>`).join("")}
      </div>

      <div class="ornament" aria-hidden="true"><svg viewBox="0 0 220 24"><line x1="8" y1="12" x2="84" y2="12"/><line x1="136" y1="12" x2="212" y2="12"/><g transform="translate(110,12)"><path d="M0 -7 C5 -3.5 5 3.5 0 7 C-5 3.5 -5 -3.5 0 -7 Z"/><circle r="2.4"/></g><circle cx="84" cy="12" r="2.5"/><circle cx="136" cy="12" r="2.5"/></svg></div>

      <h3 class="guide-subtitle">📖 Namazda Okunan Dualar</h3>
      <div class="dua-list">
        ${PRAYER_DUAS.map((d) => `
          <div class="dua-card">
            <span class="dua-card__name">${d.ad}</span>
            <p class="dua-card__ar" dir="rtl">${d.ar}</p>
            <p class="dua-card__okunus"><i>${d.okunus}</i></p>
            <p class="dua-card__tr">${d.tr}</p>
          </div>`).join("")}
      </div>

      <div class="ornament" aria-hidden="true"><svg viewBox="0 0 220 24"><line x1="8" y1="12" x2="84" y2="12"/><line x1="136" y1="12" x2="212" y2="12"/><g transform="translate(110,12)"><path d="M0 -7 C5 -3.5 5 3.5 0 7 C-5 3.5 -5 -3.5 0 -7 Z"/><circle r="2.4"/></g><circle cx="84" cy="12" r="2.5"/><circle cx="136" cy="12" r="2.5"/></svg></div>

      <h3 class="guide-subtitle">🧼 Abdest Alınışı</h3>
      <div class="abdest-steps">
        ${ABDEST_STEPS.map((s, i) => `
          <div class="abdest-step">
            <span class="guide-step__no">${i + 1}</span>
            <div class="guide-step__body">
              <span class="guide-step__title">${s.baslik}</span>
              <p class="guide-step__text">${s.text}</p>
              ${s.dua ? `<p class="guide-step__dua" dir="rtl">${s.dua}</p>` : ""}
            </div>
          </div>`).join("")}
      </div>
    </div>`;

  const detail = (i) => {
    const p = PRAYER_GUIDE[i];
    $("#prayerDetail").innerHTML = `
      <div class="prayer-detail__top">
        <span class="prayer-detail__icon">${p.icon}</span>
        <div>
          <span class="prayer-detail__name">${p.name} Namazı</span>
          <span class="prayer-detail__rekat">${p.rekat} · Toplam ${p.total} rekât</span>
        </div>
      </div>
      <p class="prayer-detail__text">${p.detail}</p>
      <div class="rekat-list">
        ${(p.rekatlar || []).map((r) => `
          <div class="rekat-row">
            <span class="rekat-row__ad">${r.ad}</span>
            <span class="rekat-row__detay">${r.detay}</span>
          </div>`).join("")}
      </div>`;
  };
  detail(0);

  c.querySelectorAll(".prayer-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      c.querySelectorAll(".prayer-tab").forEach((t) => t.classList.remove("prayer-tab--active"));
      tab.classList.add("prayer-tab--active");
      detail(Number(tab.dataset.i));
    });
  });
}

/* — Abdest Nasıl Alınır (abdest, gusül, teyemmüm, mesh) — */
const ABDEST_TYPES = [
  { id: "abdest", icon: "💧", name: "Abdest" },
  { id: "gusul", icon: "🚿", name: "Gusül" },
  { id: "teyemmum", icon: "🏜️", name: "Teyemmüm" },
  { id: "mesh", icon: "🧦", name: "Mest Mesh" },
  { id: "bozan", icon: "⚠️", name: "Abdesti Bozanlar" },
];

function renderAbdest() {
  const c = $("#livingContent");
  c.innerHTML = `
    <div class="prayer-guide">
      <div class="prayer-tabs" id="abdestTabs">
        ${ABDEST_TYPES.map((t, i) => `<button class="prayer-tab ${i === 0 ? "prayer-tab--active" : ""}" data-i="${i}"><span>${t.icon}</span>${t.name}</button>`).join("")}
      </div>
      <div class="abdest-detail" id="abdestDetail"></div>
    </div>`;

  const render = (i) => {
    const t = ABDEST_TYPES[i];
    $("#abdestDetail").innerHTML = ABDEST_CONTENT[t.id];
  };
  render(0);

  c.querySelectorAll("#abdestTabs .prayer-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      c.querySelectorAll("#abdestTabs .prayer-tab").forEach((t) => t.classList.remove("prayer-tab--active"));
      tab.classList.add("prayer-tab--active");
      render(Number(tab.dataset.i));
    });
  });
}

const ABDEST_CONTENT = {
  /* ---------- ABDEST (Wudu) ---------- */
  abdest: `
    <div class="card abdest-intro">
      <p>Abdest, namaz gibi ibadetlerden önce alınan temizliktir. <b>4 farzı</b> vardır; bunlardan biri eksik olursa abdest geçerli olmaz.</p>
    </div>

    <h3 class="guide-subtitle">📌 Abdestin Farzları</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">1</span><div class="guide-step__body"><span class="guide-step__title">Yüzü yıkamak</span><p class="guide-step__text">Alnın üstünden çene altına, iki kulak yumuşağı arası (kulak memesi) dahil yüzün tamamı bir kez yıkanır.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">2</span><div class="guide-step__body"><span class="guide-step__title">Kolları yıkamak</span><p class="guide-step__text">Parmak uçlarından başlayarak dirseklerle birlikte, önce sağ sonra sol kol bir kez yıkanır.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">3</span><div class="guide-step__body"><span class="guide-step__title">Başı mesh etmek</span><p class="guide-step__text">Islak elin içiyle başın dörtte biri (Hanefî'ye göre) mesh edilir.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">4</span><div class="guide-step__body"><span class="guide-step__title">Ayakları yıkamak</span><p class="guide-step__text">Topuklarla birlikte, önce sağ sonra sol ayak bir kez yıkanır; parmak araları hilallenir.</p></div></div>
    </div>

    <h3 class="guide-subtitle">✨ Abdestin Sünnetleri</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Niyet ve Besmele</span><p class="guide-step__text">Kalben niyet edilir, «Bismillâhirrahmânirrahîm» denir.</p><p class="guide-step__dua" dir="rtl">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Elleri yıkamak</span><p class="guide-step__text">Başlangıçta elleri bileklere kadar üç kez yıkamak.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Mazmaza ve İstinşak</span><p class="guide-step__text">Ağza üç kez su verip çalkalamak; buruna üç kez su çekip sümkürmek. Oruçlu değilken abartarak yapılır.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Misvak kullanmak</span><p class="guide-step__text">Dişleri misvak veya diş fırçasıyla temizlemek.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Üçer kez yıkamak</span><p class="guide-step__text">Yıkanacak uzuvları üçer kez yıkamak.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Sağdan başlamak</span><p class="guide-step__text">Önce sağ el/kol/ayak, sonra sol.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Parmak aralarını hilallemek</span><p class="guide-step__text">El ve ayak parmaklarının arasını suyla hilallemek.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Kulak ve boynu mesh etmek</span><p class="guide-step__text">Şehadet parmaklarıyla kulak içi, başparmaklarla kulak arkası; ardından boyun mesh edilir.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Tertibe riayet etmek</span><p class="guide-step__text">Uzuvları sırayla, ara vermeden yıkamak (müvâlât).</p></div></div>
    </div>

    <h3 class="guide-subtitle">🧼 Abdest Nasıl Alınır? (Adım Adım)</h3>
    <div class="abdest-steps">
      ${ABDEST_STEPS.map((s, i) => `
        <div class="abdest-step">
          <span class="guide-step__no">${i + 1}</span>
          <div class="guide-step__body">
            <span class="guide-step__title">${s.baslik}</span>
            <p class="guide-step__text">${s.text}</p>
            ${s.dua ? `<p class="guide-step__dua" dir="rtl">${s.dua}</p>` : ""}
          </div>
        </div>`).join("")}
    </div>

    <h3 class="guide-subtitle">🤲 Abdestten Sonra Okunacak Dua</h3>
    <div class="dua-card">
      <p class="dua-card__ar" dir="rtl">أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ وَأَشْهَدُ أَنَّ مُحَمَّدًا عَبْدُهُ وَرَسُولُهُ</p>
      <p class="dua-card__okunus"><i>Eşhedü en lâ ilâhe illallâhü vahdehû lâ şerîke leh, ve eşhedü enne Muhammeden abdühû ve rasûlüh.</i></p>
      <p class="dua-card__tr">Şehadet ederim ki Allah'tan başka ilah yoktur; O tektir, ortağı yoktur. Muhammed'in O'nun kulu ve elçisi olduğuna da şehadet ederim.</p>
    </div>`,

  /* ---------- GUSÜL (Boy Abdesti) ---------- */
  gusul: `
    <div class="card abdest-intro">
      <p>Gusül, bütün vücudun temiz suyla yıkanmasıdır. Cünüplük, hayız ve nifas hâlinin bitmesiyle gusül <b>farz</b> olur. Gusülsüz namaz kılınmaz, Kur'an'a dokunulmaz, Kâbe tavaf edilmez.</p>
    </div>

    <h3 class="guide-subtitle">📌 Guslün Farzları (3)</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">1</span><div class="guide-step__body"><span class="guide-step__title">Mazmaza (ağza su vermek)</span><p class="guide-step__text">Ağıza su alıp çalkalamak. Boğaza kadar ulaştırmak gerekmez; ağız içinin tamamını ıslatmak yeterlidir.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">2</span><div class="guide-step__body"><span class="guide-step__title">İstinşak (buruna su vermek)</span><p class="guide-step__text">Burnun yumuşak kısmına kadar su çekmek.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">3</span><div class="guide-step__body"><span class="guide-step__title">Bütün bedeni yıkamak</span><p class="guide-step__text">İğne ucu kadar kuru yer kalmayacak şekilde vücudun tamamını yıkamak. Göbek içi, kulak içi, saç dipleri dahil.</p></div></div>
    </div>

    <h3 class="guide-subtitle">✨ Guslün Sünnetleri</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Niyet ve Besmele</span><p class="guide-step__text">Gusle kalben niyet edilir ve besmele çekilir.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Elleri ve avret yerini yıkamak</span><p class="guide-step__text">Önce elleri yıkamak, sonra avret yerini ve bedendeki pisliği temizlemek.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Önce abdest almak</span><p class="guide-step__text">Gusül öncesi normal bir abdest almak.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Üçer kez su dökmek</span><p class="guide-step__text">Önce başa üç kez, sonra sağ omuza üç kez, sonra sol omuza üç kez su dökmek.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Sağdan başlamak ve ovmak</span><p class="guide-step__text">Önce sağ taraf, sonra sol taraf yıkanır; beden ovulur.</p></div></div>
    </div>

    <h3 class="guide-subtitle">🚿 Gusül Nasıl Alınır? (Adım Adım)</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">1</span><div class="guide-step__body"><span class="guide-step__title">Niyet</span><p class="guide-step__text">«Niyet ettim gusül abdesti almaya» diye kalben niyet edilir, besmele çekilir.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">2</span><div class="guide-step__body"><span class="guide-step__title">Elleri yıkamak</span><p class="guide-step__text">Eller bileklere kadar üç kez yıkanır.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">3</span><div class="guide-step__body"><span class="guide-step__title">Avret yerini temizlemek</span><p class="guide-step__text">Sol elle avret yeri ve çevresi temizlenir.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">4</span><div class="guide-step__body"><span class="guide-step__title">Abdest almak</span><p class="guide-step__text">Namaz abdesti gibi tam bir abdest alınır (ayaklar en sonda yıkanır).</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">5</span><div class="guide-step__body"><span class="guide-step__title">Başa su dökmek</span><p class="guide-step__text">Başa üç kez su dökülür; saç dipleri iyice ıslatılır, ovulur.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">6</span><div class="guide-step__body"><span class="guide-step__title">Sağ omuza su dökmek</span><p class="guide-step__text">Önce sağ omuzdan aşağı üç kez su dökülür, beden ovulur.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">7</span><div class="guide-step__body"><span class="guide-step__title">Sol omuza su dökmek</span><p class="guide-step__text">Sonra sol omuzdan aşağı üç kez su dökülür.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">8</span><div class="guide-step__body"><span class="guide-step__title">Ayakları yıkamak</span><p class="guide-step__text">Ayaklar başka bir yere çekilerek (kirlenmemesi için) topuklarla birlikte yıkanır.</p></div></div>
    </div>

    <h3 class="guide-subtitle">📋 Guslü Gerektiren Hâller</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">1</span><div class="guide-step__body"><span class="guide-step__title">Cünüplük</span><p class="guide-step__text">Cinsel ilişki veya ihtilam (uykuda boşalma) sonucu.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">2</span><div class="guide-step__body"><span class="guide-step__title">Hayız (âdet) bitimi</span><p class="guide-step__text">Kadının âdet hâlinin sona ermesi.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">3</span><div class="guide-step__body"><span class="guide-step__title">Nifas (lohusalık) bitimi</span><p class="guide-step__text">Doğum sonrası lohusalık hâlinin bitmesi.</p></div></div>
    </div>`,

  /* ---------- TEYEMMÜM ---------- */
  teyemmum: `
    <div class="card abdest-intro">
      <p>Teyemmüm, su bulunmadığında veya su kullanmaya engel bir durum olduğunda, <b>temiz toprak (veya toprak cinsinden bir şey)</b> ile abdest ve gusül yerine yapılan temizliktir.</p>
    </div>

    <h3 class="guide-subtitle">📌 Teyemmümün Farzları (2)</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">1</span><div class="guide-step__body"><span class="guide-step__title">Niyet etmek</span><p class="guide-step__text">Abdest veya gusül yerine teyemmüm etmeye kalben niyet etmek.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">2</span><div class="guide-step__body"><span class="guide-step__title">İki vuruş (darbeteyn)</span><p class="guide-step__text">Ellerle temiz toprağa iki kez vurup, ilkinde yüzü, ikincisinde kolları (dirseklere kadar) mesh etmek.</p></div></div>
    </div>

    <h3 class="guide-subtitle">🏜️ Teyemmüm Nasıl Alınır?</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">1</span><div class="guide-step__body"><span class="guide-step__title">Niyet ve Besmele</span><p class="guide-step__text">«Niyet ettim teyemmüm etmeye» denir, besmele çekilir.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">2</span><div class="guide-step__body"><span class="guide-step__title">Toprağa vurmak</span><p class="guide-step__text">İki elin içi temiz toprağa, taşa veya toprak cinsi bir yüzeye bir kez vurulur.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">3</span><div class="guide-step__body"><span class="guide-step__title">Yüzü mesh etmek</span><p class="guide-step__text">Ellerle yüzün tamamı mesh edilir.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">4</span><div class="guide-step__body"><span class="guide-step__title">Tekrar vurup kolları mesh etmek</span><p class="guide-step__text">Eller tekrar toprağa vurulur; önce sağ kol, sonra sol kol, dirseklerle birlikte avuç içleriyle mesh edilir.</p></div></div>
    </div>

    <h3 class="guide-subtitle">📋 Teyemmümü Gerektiren Durumlar</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Su bulunamaması</span><p class="guide-step__text">Yolculukta veya herhangi bir yerde su bulunamaması.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Su kullanamama</span><p class="guide-step__text">Hastalık, yara veya şiddetli soğuk sebebiyle su kullanmanın zarar vermesi.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Suya ulaşamama</span><p class="guide-step__text">Suyun çok uzakta veya kullanılamaz durumda olması.</p></div></div>
    </div>

    <h3 class="guide-subtitle">⚠️ Teyemmümü Bozan Şeyler</h3>
    <div class="abdest-step">
      <div class="guide-step__body">
        <p class="guide-step__text">Abdesti bozan her şey teyemmümü de bozar. Ayrıca <b>su bulunur bulunmaz</b> teyemmüm bozulur; ancak su varken teyemmüm edilmez.</p>
      </div>
    </div>`,

  /* ---------- MEST ÜZERİNE MESH ---------- */
  mesh: `
    <div class="card abdest-intro">
      <p>Mest, ayağa giyilen deri veya kalın çorap türüdür. Abdestliyken giyilen meste, abdest alırken ayakları yıkamak yerine <b>ıslak elle mesh etmek</b> yeterlidir.</p>
    </div>

    <h3 class="guide-subtitle">📌 Mest Üzerine Mesh Etmenin Şartları</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">1</span><div class="guide-step__body"><span class="guide-step__title">Abdestli giyilmiş olması</span><p class="guide-step__text">Mest, ayaklar tam abdestliyken giyilmiş olmalıdır.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">2</span><div class="guide-step__body"><span class="guide-step__title">Topukları örtmesi</span><p class="guide-step__text">Mest, ayakları topuklarla birlikte tam örtmelidir.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">3</span><div class="guide-step__body"><span class="guide-step__title">Sağlam ve su geçirmez olması</span><p class="guide-step__text">Üzerinden yürünebilir, sağlam ve deliksiz olmalıdır.</p></div></div>
    </div>

    <h3 class="guide-subtitle">🧦 Mesh Nasıl Yapılır?</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">1</span><div class="guide-step__body"><span class="guide-step__title">Islak el</span><p class="guide-step__text">Eller ıslatılır.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">2</span><div class="guide-step__body"><span class="guide-step__title">Mestin üstünü mesh etmek</span><p class="guide-step__text">Sağ elin parmakları sağ mestin uç kısmına, sol elin parmakları topuk kısmına konur ve parmaklar açık olarak üstten çekilir. Aynı işlem sol mest için yapılır.</p></div></div>
    </div>

    <h3 class="guide-subtitle">⏳ Mesh Müddeti</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">🏠</span><div class="guide-step__body"><span class="guide-step__title">Mukim (yolcu olmayan)</span><p class="guide-step__text"><b>24 saat</b> (1 gün 1 gece) mesh edebilir.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">🧳</span><div class="guide-step__body"><span class="guide-step__title">Misafir (yolcu)</span><p class="guide-step__text"><b>72 saat</b> (3 gün 3 gece) mesh edebilir. Süre, mest giyildikten sonra ilk abdest bozulmasıyla başlar.</p></div></div>
    </div>

    <h3 class="guide-subtitle">⚠️ Mesh Bozulursa</h3>
    <div class="abdest-step">
      <div class="guide-step__body">
        <p class="guide-step__text">Sürenin dolması, mestin çıkması veya mestin altına su ulaşacak kadar yırtılması durumunda; abdestli ise sadece <b>ayakları yıkamak</b> yeterlidir. Abdestli değilse tam abdest alınır.</p>
      </div>
    </div>`,

  /* ---------- ABDESTİ BOZANLAR ---------- */
  bozan: `
    <div class="card abdest-intro">
      <p>Aşağıdaki durumlardan herhangi biri gerçekleştiğinde abdest bozulur ve namaz için yeniden abdest almak gerekir.</p>
    </div>

    <h3 class="guide-subtitle">⚠️ Abdesti Bozan Durumlar</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">1</span><div class="guide-step__body"><span class="guide-step__title">Vücuttan bir şeyin çıkması</span><p class="guide-step__text">İdrar, dışkı, yel (gaz) çıkması; yara ve benzeri yerden akan kan/irin.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">2</span><div class="guide-step__body"><span class="guide-step__title">Ağız dolusu kusmak</span><p class="guide-step__text">Ağız dolusu kusmak abdesti bozar.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">3</span><div class="guide-step__body"><span class="guide-step__title">Uyumak</span><p class="guide-step__text">Yan yatarak, dayanarak veya derin uyku. Oturduğu yerde kısa süre uyuklamak bozmaz.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">4</span><div class="guide-step__body"><span class="guide-step__title">Aklın gitmesi</span><p class="guide-step__text">Bayılmak, delirmek, sara nöbeti gibi şuur kaybı.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">5</span><div class="guide-step__body"><span class="guide-step__title">Namazda sesli gülmek</span><p class="guide-step__text">Rükûlu ve secdeli namazda sesli gülmek hem namazı hem abdesti bozar.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">6</span><div class="guide-step__body"><span class="guide-step__title">Cünüplük hâli</span><p class="guide-step__text">Cinsel ilişki veya meninin çıkması — bu durumda gusül gerekir.</p></div></div>
    </div>

    <h3 class="guide-subtitle">✅ Abdesti Bozmayan Durumlar</h3>
    <div class="abdest-steps">
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Küçük sıyrık/yaradan az akıntı</span><p class="guide-step__text">Akmayan küçük sıyrıklar abdesti bozmaz (ihtiyatlı olmak için tazelenebilir).</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Kısa uyuklama</span><p class="guide-step__text">Oturur hâlde, vücudun dayanaksız olduğu kısa uyuklama.</p></div></div>
      <div class="abdest-step"><span class="guide-step__no">✦</span><div class="guide-step__body"><span class="guide-step__title">Ağlamak, terlemek</span><p class="guide-step__text">Ağlamak, terlemek, ağız dolusu olmayan kusma abdesti bozmaz.</p></div></div>
    </div>`,
};

/* =====================================================================
   İBADET MODÜLLERİ — Namaz Takibi, Oruç & Nâfile, Zikirler, Dualar
===================================================================== */

/* ============ 1) NAMAZ TAKİBİ ============ */
const NAMAZ_LOG_KEY = "mihrap:namaz-takip";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dateKeyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getNamazLog() {
  try {
    const l = JSON.parse(localStorage.getItem(NAMAZ_LOG_KEY) || "{}");
    return (l && typeof l === "object") ? l : {};
  } catch (e) { return {}; }
}
function saveNamazLog(log) {
  try { localStorage.setItem(NAMAZ_LOG_KEY, JSON.stringify(log)); } catch (e) {}
}
function setNamazDone(prayerKey, done) {
  const log = getNamazLog();
  const k = todayKey();
  if (!log[k]) log[k] = {};
  log[k][prayerKey] = done;
  saveNamazLog(log);
}
function getTodayNamaz() {
  const log = getNamazLog();
  return log[todayKey()] || {};
}

/* Son 7 günün tamamlanma oranları (haftalık grafik) */
function getWeekNamazStats() {
  const log = getNamazLog();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dateKeyOf(d);
    const day = log[k] || {};
    const done = FARD_KEYS.filter((p) => day[p]).length;
    days.push({
      key: k,
      label: d.toLocaleDateString("tr-TR", { weekday: "short" }),
      dayNum: d.getDate(),
      done, total: 5,
      ratio: done / 5,
    });
  }
  return days;
}
function getTotalNamazStats() {
  const log = getNamazLog();
  let totalDone = 0, totalPossible = 0, daysRecorded = 0;
  for (const k of Object.keys(log)) {
    const day = log[k] || {};
    const done = FARD_KEYS.filter((p) => day[p]).length;
    totalDone += done;
    totalPossible += 5;
    if (done > 0) daysRecorded++;
  }
  return { totalDone, totalPossible, daysRecorded };
}

function renderNamazTakip() {
  const c = $("#livingContent");
  const today = getTodayNamaz();
  const doneCount = FARD_KEYS.filter((p) => today[p]).length;
  const week = getWeekNamazStats();
  const totals = getTotalNamazStats();

  c.innerHTML = `
    <div class="ntakip">
      <div class="ntakip__head card">
        <span class="ntakip__title">📿 Namaz Takibi</span>
        <span class="ntakip__today">Bugün: <b>${doneCount}/5</b> vakit</span>
      </div>

      <div class="ntakip__progress card">
        <div class="ntakip__progress-ring">
          <svg viewBox="0 0 120 120">
            <circle class="ntakip__track" cx="60" cy="60" r="50"/>
            <circle class="ntakip__bar" cx="60" cy="60" r="50" stroke-dasharray="314.16" stroke-dashoffset="${(314.16 * (1 - doneCount / 5)).toFixed(2)}"/>
          </svg>
          <div class="ntakip__progress-label"><b>${doneCount}/5</b><span>bugün</span></div>
        </div>
        <div class="ntakip__progress-text">
          ${doneCount === 5 ? "🎉 Elhamdülillâh, bugün tüm vakitleri kıldın!" :
            doneCount >= 3 ? "👍 İyi gidiyorsun, kalan vakitleri de kılmaya çalış." :
            "🌱 Gayret et, namaz müminin miracıdır."}
        </div>
      </div>

      <h3 class="guide-subtitle">Bugünkü Vakitler</h3>
      <div class="ntakip__list">
        ${FARD_KEYS.map((key) => {
          const p = PRAYERS.find((x) => x.key === key);
          const time = (state.times && state.times[key]) || "--:--";
          const done = !!today[key];
          return `<button class="ntakip__item ${done ? "ntakip__item--done" : ""}" data-prayer="${key}">
            <span class="ntakip__check">${done ? "✅" : "⬜"}</span>
            <span class="ntakip__name">${p ? p.tr : key}</span>
            <span class="ntakip__time">${time}</span>
          </button>`;
        }).join("")}
      </div>

      <h3 class="guide-subtitle">Son 7 Gün</h3>
      <div class="ntakip__week card">
        ${week.map((d) => `
          <div class="ntakip__day" title="${d.label} ${d.dayNum} · ${d.done}/5">
            <div class="ntakip__day-bar"><span style="height:${Math.round(d.ratio * 100)}%"></span></div>
            <span class="ntakip__day-label">${d.label}</span>
          </div>`).join("")}
      </div>

      <div class="ntakip__stats card">
        <div class="ntakip__stat"><b>${totals.daysRecorded}</b><span>kayıtlı gün</span></div>
        <div class="ntakip__stat"><b>${totals.totalDone}</b><span>toplam vakit</span></div>
        <div class="ntakip__stat"><b>${totals.totalPossible ? Math.round(totals.totalDone / totals.totalPossible * 100) : 0}%</b><span>oran</span></div>
      </div>

      <p class="quran__note">Takip cihazında saklanır. Vakte dokunarak kıldığını işaretleyebilirsin.</p>
    </div>`;

  c.querySelectorAll(".ntakip__item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.prayer;
      const wasDone = !!getTodayNamaz()[key];
      setNamazDone(key, !wasDone);
      renderNamazTakip();
    });
  });
}

/* ============ 2) ORUÇ & NÂFİLE NAMAZLAR ============ */
const WORSHIP_TABS = [
  { id: "oruc", icon: "🌙", name: "Oruçlar" },
  { id: "nafile", icon: "🕌", name: "Nâfile Namazlar" },
];

const ORUC_LIST = [
  { ad: "Ramazan Orucu", hukum: "Farz", aciklama: "Ramazan ayının tamamını oruçlu geçirmek her Müslümana farzdır. Kur'an'da: 'Ey iman edenler! Oruç sizden öncekilere farz kılındığı gibi size de farz kılındı.' (Bakara 183).", kaynak: "Bakara, 183" },
  { ad: "Pazartesi & Perşembe Orucu", hukum: "Sünnet", aciklama: "Peygamberimiz (s.a.v.) Pazartesi ve Perşembe günleri oruç tutmaya özen gösterirdi: 'Ameller Pazartesi ve Perşembe günleri Allah'a arz olunur. Ben oruçlu iken amellerimin arz olunmasını severim.'", kaynak: "Tirmizî, Savm, 44" },
  { ad: "Arefe Günü Orucu", hukum: "Sünnet", aciklama: "Zilhicce'nin 9. günü (Arefe) hacda olmayanlar için tutulan oruçtur. 'Arefe günü orucunun, geçmiş ve gelecek birer yıllık günahlara keffâret olacağını Allah'tan umarım.'", kaynak: "Müslim, Sıyâm, 196" },
  { ad: "Aşure Orucu", hukum: "Sünnet", aciklama: "Muharrem'in 10. günü tutulur. Farklı olmak için 9. veya 11. günüyle birlikte tutmak müstehaptır. 'Aşure orucunun, geçmiş bir yılın günahlarına keffâret olacağını umarım.'", kaynak: "Müslim, Sıyâm, 197" },
  { ad: "Şevval Ayında 6 Gün", hukum: "Sünnet", aciklama: "Ramazan'dan sonra Şevval ayında 6 gün oruç tutmak, bir yıl oruç tutmuş gibi sevaptır: 'Kim Ramazan orucunu tutar, ardına Şevval'den altı gün eklerse, bütün yıl oruç tutmuş gibi olur.'", kaynak: "Müslim, Sıyâm, 204" },
  { ad: "Eyyâm-ı Bîd (Aydınlık Günler)", hukum: "Müstehap", aciklama: "Her kamerî ayın 13, 14 ve 15. günleri tutulan oruçtur. Peygamberimiz (s.a.v.) bu üç günü oruçlu geçirmeyi tavsiye etmiştir.", kaynak: "Tirmizî, Savm, 54; Nesâî, Sıyâm, 84" },
  { ad: "Muharrem Orucu", hukum: "Müstehap", aciklama: "Muharrem ayında oruç tutmak faziletlidir: 'Ramazan'dan sonra en faziletli oruç, Allah'ın ayı olan Muharrem'de tutulan oruçtur.'", kaynak: "Müslim, Sıyâm, 202" },
];

const NAFILE_LIST = [
  { ad: "Duha (Kuşluk) Namazı", vakit: "Güneş doğduktan ~45 dk sonra", rekat: "2-8 rekât", aciklama: "Kuşluk vakti kılınır. En azı 2, ortası 4, çoğu 8 rekâttır. 'Her gün her bir ekleminiz için bir sadaka gerekir... kuşluk vakti kılınan iki rekât namaz bunların yerini tutar.'", kaynak: "Müslim, Müsâfirîn, 84" },
  { ad: "Teheccüd Namazı", vakit: "Gece, uykudan uyanınca", rekat: "2-12 rekât", aciklama: "Yatsıdan sonra bir süre uyuyup gece uyanarak kılınır. En faziletli nâfile namazlardandır: 'Gece namazı kılın; çünkü o sizden önceki salihlerin âdetidir.'", kaynak: "Tirmizî, Deavât, 104" },
  { ad: "Evvabin Namazı", vakit: "Akşam ile yatsı arası", rekat: "2-20 (genelde 6) rekât", aciklama: "Akşam namazından sonra kılınır. 'Kim akşam namazından sonra altı rekât kılarsa, evvabinlerden (Allah'a çokça yönelenlerden) yazılır.'", kaynak: "Tirmizî, Salât, 204" },
  { ad: "Tahiyyetü'l-Mescid", vakit: "Mescide girince", rekat: "2 rekât", aciklama: "Mescide girildiğinde oturmadan önce kılınan 2 rekât namazdır: 'Sizden biri mescide girince oturmadan önce iki rekât kılsın.'", kaynak: "Buhârî, Salât, 60" },
  { ad: "İstihâre Namazı", vakit: "Karar vermeden önce", rekat: "2 rekât + dua", aciklama: "Bir işin hayırlısını istemek için 2 rekât kılınıp İstihâre duası okunur. Sonra gönle doğana göre hareket edilir.", kaynak: "Buhârî, Teheccüd, 25" },
  { ad: "Tesbih Namazı", vakit: "Herhangi bir vakit (kerahat hariç)", rekat: "4 rekât", aciklama: "İçinde 300 tesbih bulunan faziletli bir namazdır. Ömürde en az bir kez kılınması tavsiye edilmiştir.", kaynak: "Ebû Dâvûd, Tatavvu', 14" },
];

function renderWorship() {
  const c = $("#livingContent");
  c.innerHTML = `
    <div class="prayer-guide">
      <div class="prayer-tabs" id="worshipTabs">
        ${WORSHIP_TABS.map((t, i) => `<button class="prayer-tab ${i === 0 ? "prayer-tab--active" : ""}" data-i="${i}"><span>${t.icon}</span>${t.name}</button>`).join("")}
      </div>
      <div id="worshipDetail"></div>
    </div>`;

  const render = (i) => {
    const t = WORSHIP_TABS[i];
    if (t.id === "oruc") {
      $("#worshipDetail").innerHTML = `
        <div class="card abdest-intro"><p>Farz orucun yanında, Peygamberimizin (s.a.v.) tavsiye ettiği <b>sünnet ve müstehap oruçlar</b>. Hükümleri ve faziletleriyle:</p></div>
        <div class="abdest-steps">
          ${ORUC_LIST.map((o) => `
            <div class="abdest-step">
              <div class="guide-step__body">
                <div class="worship-row"><span class="guide-step__title">${o.ad}</span><span class="worship-hukum">${o.hukum}</span></div>
                <p class="guide-step__text">${o.aciklama}</p>
                <p class="guide-step__kaynak">${o.kaynak}</p>
              </div>
            </div>`).join("")}
        </div>`;
    } else {
      $("#worshipDetail").innerHTML = `
        <div class="card abdest-intro"><p>Farz namazların yanında, gönüllü olarak kılınan <b>nâfile namazlar</b>; kişiyi Allah'a yaklaştıran en güzel amellerdendir:</p></div>
        <div class="abdest-steps">
          ${NAFILE_LIST.map((n) => `
            <div class="abdest-step">
              <div class="guide-step__body">
                <span class="guide-step__title">🕌 ${n.ad}</span>
                <p class="guide-step__meta">⏰ ${n.vakit} · 🔢 ${n.rekat}</p>
                <p class="guide-step__text">${n.aciklama}</p>
                <p class="guide-step__kaynak">${n.kaynak}</p>
              </div>
            </div>`).join("")}
        </div>`;
    }
  };
  render(0);

  c.querySelectorAll("#worshipTabs .prayer-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      c.querySelectorAll("#worshipTabs .prayer-tab").forEach((t) => t.classList.remove("prayer-tab--active"));
      tab.classList.add("prayer-tab--active");
      render(Number(tab.dataset.i));
    });
  });
}

/* ============ 3) ZİKİRLER & TESBİHAT ============ */
const ZIKIR_TABS = [
  { id: "tesbihat", icon: "📿", name: "Namaz Sonrası" },
  { id: "sabah", icon: "🌅", name: "Sabah Zikri" },
  { id: "aksam", icon: "🌇", name: "Akşam Zikri" },
];

const TESBIHAT_LIST = [
  { ad: "Tesbihat (33+33+34)", ar: "سُبْحَانَ اللهِ (33) · الْحَمْدُ لِلَّهِ (33) · اللهُ أَكْبَرُ (34)", okunus: "33 kez Sübhânallah, 33 kez Elhamdülillâh, 34 kez Allâhü ekber", aciklama: "Her namazdan sonra çekilir. 'Kim her namazın ardından 33 kez Sübhânallah, 33 kez Elhamdülillâh, 34 kez Allâhü ekber derse, günahları deniz köpüğü kadar da olsa bağışlanır.'", kaynak: "Müslim, Mesâcid, 146" },
  { ad: "Ayetel Kürsi", ar: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ", okunus: "Allâhü lâ ilâhe illâ hüvel-hayyül-kayyûm...", aciklama: "Her farz namazdan sonra okunması tavsiye edilir: 'Kim her farz namazın ardından Âyetel Kürsi okursa, onun cennete girmesine ölümden başka bir şey engel olmaz.'", kaynak: "Nesâî, es-Sünenü'l-Kübrâ, 6/30" },
  { ad: "İhlâs, Felak, Nâs (3'er kez)", ar: "قُلْ هُوَ اللَّهُ أَحَدٌ · قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ · قُلْ أَعُوذُ بِرَبِّ النَّاسِ", okunus: "3'er kez İhlâs, Felak ve Nâs sûreleri", aciklama: "Sabah-akşam 3'er kez okunması sünnettir; her şeye karşı yeterlidir.", kaynak: "Tirmizî, Deavât, 117" },
];

const SABAH_ZIKIR = [
  { ad: "Sabah Zikri", ar: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ", okunus: "Asbahnâ ve asbaha'l-mülkü lillâh...", aciklama: "Sabahlayınca: 'Sabaha erdik; mülk Allah'ındır. Allah'ım, senden bu günün hayrını ve onda olanların hayrını isterim; bu günün şerrinden ve onda olanların şerrinden sana sığınırım.'", kaynak: "Ebû Dâvûd, Edeb, 100" },
  { ad: "Seyyidü'l-İstiğfar", ar: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ خَلَقْتَنِي وَأَنَا عَبْدُكَ", okunus: "Allâhümme ente Rabbî lâ ilâhe illâ ente halaktenî ve ene abdük...", aciklama: "İstiğfarın en üstünü. Sabah inanarak okuyup aynı gün ölen cennetliktir.", kaynak: "Buhârî, Deavât, 2" },
  { ad: "İhlas + Muavvizeteyn (3'er kez)", ar: "الإخلاص والمعوذتين ثلاثاً", okunus: "3'er kez İhlâs, Felak, Nâs", aciklama: "Sabah ve akşam 3'er kez okunur; her şeye kâfidir.", kaynak: "Tirmizî, Deavât, 117" },
];

const AKSAM_ZIKIR = [
  { ad: "Akşam Zikri", ar: "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ", okunus: "Emseynâ ve emse'l-mülkü lillâh...", aciklama: "Akşamlayınca: 'Akşama erdik; mülk Allah'ındır. Allah'ım, senden bu gecenin hayrını ister, şerrinden sana sığınırım.'", kaynak: "Ebû Dâvûd, Edeb, 100" },
  { ad: "Ayetel Kürsi (1 kez)", ar: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ", okunus: "Allâhü lâ ilâhe illâ hüvel-hayyül-kayyûm...", aciklama: "Akşam okuyan, sabaha kadar Allah'ın korumasındadır.", kaynak: "Hâkim, Müstedrek, 1/562" },
  { ad: "Yatarken: Muavvizeteyn + üfleme", ar: "المعوذتين ومسح الجسد", okunus: "Felak ve Nâs sûrelerini okuyup avuçlara üfleyip bedeni mesh etmek", aciklama: "Peygamberimiz (s.a.v.) her gece yatarken İhlâs, Felak ve Nâs'ı okuyup avuçlarına üfler, bedeninin ulaşabildiği yerine sürerdi.", kaynak: "Buhârî, Fedâilü'l-Kur'ân, 14" },
];

function renderZikir() {
  const c = $("#livingContent");
  c.innerHTML = `
    <div class="prayer-guide">
      <div class="prayer-tabs" id="zikirTabs">
        ${ZIKIR_TABS.map((t, i) => `<button class="prayer-tab ${i === 0 ? "prayer-tab--active" : ""}" data-i="${i}"><span>${t.icon}</span>${t.name}</button>`).join("")}
      </div>
      <div id="zikirDetail"></div>
    </div>`;

  const zikirCard = (z) => `
    <div class="dua-card">
      <span class="dua-card__name">${z.ad}</span>
      <p class="dua-card__ar" dir="rtl">${z.ar}</p>
      <p class="dua-card__okunus"><i>${z.okunus}</i></p>
      <p class="dua-card__tr">${z.aciklama}</p>
      <p class="dua-card__kaynak">${z.kaynak}</p>
    </div>`;

  const render = (i) => {
    const t = ZIKIR_TABS[i];
    const list = t.id === "tesbihat" ? TESBIHAT_LIST : t.id === "sabah" ? SABAH_ZIKIR : AKSAM_ZIKIR;
    $("#zikirDetail").innerHTML = `
      <div class="card abdest-intro"><p>Zikir, kalbi Allah ile diri tutan en güzel ibadettir. Dil ile söyleneni kalp ile tasdik etmek esastır.</p></div>
      <div class="abdest-steps">${list.map(zikirCard).join("")}</div>
      <button class="btn-gold" id="zikirTasbihBtn">📿 Zikirmatiğe Git</button>`;
    $("#zikirTasbihBtn").addEventListener("click", renderTasbih);
  };
  render(0);

  c.querySelectorAll("#zikirTabs .prayer-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      c.querySelectorAll("#zikirTabs .prayer-tab").forEach((t) => t.classList.remove("prayer-tab--active"));
      tab.classList.add("prayer-tab--active");
      render(Number(tab.dataset.i));
    });
  });
}

/* ============ 4) DUA KOLEKSİYONU ============ */
const DUA_CATEGORIES = [
  { id: "sabah", icon: "🌅", name: "Sabah" },
  { id: "aksam", icon: "🌇", name: "Akşam & Uyku" },
  { id: "yemek", icon: "🍽️", name: "Yemek" },
  { id: "yolculuk", icon: "🚗", name: "Yolculuk" },
  { id: "sikinti", icon: "🕊️", name: "Sıkıntı & Şifa" },
  { id: "tovbe", icon: "🤲", name: "Tövbe" },
  { id: "aile", icon: "👨‍👩‍👧", name: "Aile & Evlat" },
];

const DUAS = [
  // SABAH
  { kat: "sabah", ad: "Sabah Duası", ar: "اللَّهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا وَبِكَ نَحْيَا وَبِكَ نَمُوتُ وَإِلَيْكَ النُّشُورُ", okunus: "Allâhümme bike asbahnâ ve bike emseynâ ve bike nahyâ ve bike nemûtü ve ileyke'n-nüşûr.", anlam: "Allah'ım! Seninle sabahladık, seninle akşamladık; seninle dirilir, seninle ölürüz. Dönüş sanadır.", kaynak: "Tirmizî, Deavât, 13" },
  { kat: "sabah", ad: "Seyyidü'l-İstiğfar", ar: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ خَلَقْتَنِي وَأَنَا عَبْدُكَ وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ", okunus: "Allâhümme ente Rabbî lâ ilâhe illâ ente halaktenî ve ene abdük... feğfir lî fe innehû lâ yağfiru'z-zünûbe illâ ente.", anlam: "Allah'ım! Sen benim Rabbimsin; senden başka ilah yoktur. Beni sen yarattın, ben senin kulunum... Günahları ancak sen bağışlarsın.", kaynak: "Buhârî, Deavât, 2" },
  // AKŞAM & UYKU
  { kat: "aksam", ad: "Uyku Duası", ar: "اللَّهُمَّ بِاسْمِكَ أَمُوتُ وَأَحْيَا", okunus: "Allâhümme bismike emûtü ve ahyâ.", anlam: "Allah'ım! Senin isminle ölür, senin isminle dirilirim.", kaynak: "Buhârî, Deavât, 6" },
  { kat: "aksam", ad: "Uyanınca Dua", ar: "الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ", okunus: "Elhamdü lillâhillezî ahyânâ ba'de mâ emâtenâ ve ileyhi'n-nüşûr.", anlam: "Bizi öldürdükten sonra dirilten Allah'a hamdolsun; dönüş O'nadır.", kaynak: "Buhârî, Deavât, 8" },
  { kat: "aksam", ad: "Akşam Duası", ar: "اللَّهُمَّ بِكَ أَمْسَيْنَا وَبِكَ أَصْبَحْنَا وَبِكَ نَحْيَا وَبِكَ نَمُوتُ وَإِلَيْكَ الْمَصِيرُ", okunus: "Allâhümme bike emseynâ ve bike asbahnâ ve bike nahyâ ve bike nemûtü ve ileyke'l-masîr.", anlam: "Allah'ım! Seninle akşamladık, seninle sabahladık; dönüş sanadır.", kaynak: "Tirmizî, Deavât, 13" },
  // YEMEK
  { kat: "yemek", ad: "Yemekten Önce", ar: "بِسْمِ اللَّهِ", okunus: "Bismillâh. (Unutulursa: Bismillâhi fî evvelihî ve âhirihî)", anlam: "Allah'ın adıyla. (Başta unutulursa: başında ve sonunda Allah'ın adıyla.)", kaynak: "Ebû Dâvûd, Et'ime, 15" },
  { kat: "yemek", ad: "Yemekten Sonra", ar: "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا وَجَعَلَنَا مُسْلِمِينَ", okunus: "Elhamdü lillâhillezî at'amenâ ve sekânâ ve cealenâ müslimîn.", anlam: "Bizi yediren, içiren ve Müslüman kılan Allah'a hamdolsun.", kaynak: "Ebû Dâvûd, Et'ime, 52" },
  // YOLCULUK
  { kat: "yolculuk", ad: "Yolculuk (Sefere Çıkış) Duası", ar: "سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَٰذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ", okunus: "Sübhânellezî sahhara lenâ hâzâ ve mâ künnâ lehû mukrinîn. Ve innâ ilâ Rabbinâ le münkalibûn.", anlam: "Bunu bizim hizmetimize vereni tesbih ederim; yoksa buna gücümüz yetmezdi. Biz şüphesiz Rabbimize döneceğiz.", kaynak: "Zuhruf, 13-14; Müslim, Hac, 428" },
  // SIKINTI & ŞİFA
  { kat: "sikinti", ad: "Sıkıntı Duası", ar: "لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ", okunus: "Lâ ilâhe illâ ente sübhâneke innî küntü mine'z-zâlimîn.", anlam: "Senden başka ilah yoktur; seni tenzih ederim. Ben zalimlerden oldum.", kaynak: "Enbiyâ, 87; Tirmizî, Deavât, 82" },
  { kat: "sikinti", ad: "Şifa Duası", ar: "اللَّهُمَّ رَبَّ النَّاسِ أَذْهِبِ الْبَأْسَ اشْفِ أَنْتَ الشَّافِي لَا شِفَاءَ إِلَّا شِفَاؤُكَ", okunus: "Allâhümme Rabbe'n-nâs, ezhibi'l-be's, işfi ente'ş-şâfî, lâ şifâe illâ şifâük.", anlam: "Allah'ım, insanların Rabbi! Bu dert ve hastalığı gider; şifa ver. Şifa veren ancak sensin.", kaynak: "Buhârî, Merdâ, 20" },
  // TÖVBE
  { kat: "tovbe", ad: "Tövbe (Seyyidü'l-İstiğfar)", ar: "اللَّهُمَّ إِنِّي أَسْتَغْفِرُكَ لِذَنْبِي وَأَتُوبُ إِلَيْكَ", okunus: "Allâhümme innî estağfiruke li-zenbî ve etûbü ileyk.", anlam: "Allah'ım! Günahımdan dolayı senden bağışlanma diler, sana tövbe ederim.", kaynak: "Buhârî, Deavât, 3" },
  // AİLE
  { kat: "aile", ad: "Eş ve Evlat İçin Dua", ar: "رَبَّنَا هَبْ لَنَا مِنْ أَزْوَاجِنَا وَذُرِّيَّاتِنَا قُرَّةَ أَعْيُنٍ وَاجْعَلْنَا لِلْمُتَّقِينَ إِمَامًا", okunus: "Rabbenâ heb lenâ min ezvâcinâ ve zürriyyâtinâ kurrate a'yünin ve'c'alnâ lil-müttekîne imâmâ.", anlam: "Rabbimiz! Bize eşlerimizden ve çocuklarımızdan göz aydınlığı ver; bizi takva sahiplerine önder kıl.", kaynak: "Furkân, 74" },
  { kat: "aile", ad: "Anne-Baba İçin Dua", ar: "رَبِّ اغْفِرْ لِي وَلِوَالِدَيَّ وَارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا", okunus: "Rabbiğfir lî ve li-vâlideyye ve'rhamhümâ kemâ rabbeyânî sağîrâ.", anlam: "Rabbim! Beni ve anne-babamı bağışla; onlar beni küçükken yetiştirdikleri gibi sen de onlara merhamet et.", kaynak: "İsrâ, 24" },
  // EK SABAH
  { kat: "sabah", ad: "Sabah Zikri (Mülk Duası)", ar: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ وَالْحَمْدُ لِلَّهِ لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ", okunus: "Asbahnâ ve asbahal-mülkü lillâh, vel-hamdü lillâh, lâ ilâhe illallâhü vahdehû lâ şerîke leh.", anlam: "Sabaha çıktık; mülk Allah'ındır. Hamd Allah'a mahsustur. Allah'tan başka ilah yoktur; O tektir, ortağı yoktur.", kaynak: "Müslim, Zikr, 72" },
  // EK AKŞAM
  { kat: "aksam", ad: "Akşam Zikri (Mülk Duası)", ar: "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ وَالْحَمْدُ لِلَّهِ لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ", okunus: "Emseynâ ve emsel-mülkü lillâh, vel-hamdü lillâh, lâ ilâhe illallâhü vahdehû lâ şerîke leh.", anlam: "Akşama çıktık; mülk Allah'ındır. Hamd Allah'a mahsustur. Allah'tan başka ilah yoktur; O tektir, ortağı yoktur.", kaynak: "Müslim, Zikr, 72" },
  // EK YEMEK
  { kat: "yemek", ad: "Ev Sahibine / Misafire Dua", ar: "اللَّهُمَّ بَارِكْ لَهُمْ فِيمَا رَزَقْتَهُمْ وَاغْفِرْ لَهُمْ وَارْحَمْهُمْ", okunus: "Allâhümme bârik lehüm fîmâ razaktehüm, vağfir lehüm, verhamhüm.", anlam: "Allah'ım! Onlara verdiğin rızıkta bereket ver; onları bağışla ve onlara merhamet et.", kaynak: "Müslim, Eşribe, 142" },
  // EK YOLCULUK
  { kat: "yolculuk", ad: "Yolculuktan Dönüş Duası", ar: "آيِبُونَ تَائِبُونَ عَابِدُونَ لِرَبِّنَا حَامِدُونَ", okunus: "Âyibûne tâibûne âbidûne li-Rabbinâ hâmidûn.", anlam: "Döndük, tövbe ettik, kulluk ettik; Rabbimize hamd ederiz.", kaynak: "Müslim, Hac, 428" },
  // EK SIKINTI
  { kat: "sikinti", ad: "Keder ve Üzüntü Duası", ar: "اللَّهُمَّ إِنِّي عَبْدُكَ ابْنُ عَبْدِكَ ابْنُ أَمَتِكَ نَاصِيَتِي بِيَدِكَ مَاضٍ فِيَّ حُكْمُكَ عَدْلٌ فِيَّ قَضَاؤُكَ", okunus: "Allâhümme innî abdüke, ibnü abdike, ibnü emetike; nâsiyetî bi-yedik, mâdin fiyye hukmüke, adlün fiyye kadâüke.", anlam: "Allah'ım! Ben senin kulunum; kulunun ve câriyenin oğluyum. Alnım senin elindedir; hakkımdaki hükmün yürürlükte, hakkımdaki kazan adalettir.", kaynak: "Ahmed, Müsned; hadis" },
  // EK TÖVBE
  { kat: "tovbe", ad: "Büyük İstiğfar", ar: "أَسْتَغْفِرُ اللَّهَ الْعَظِيمَ الَّذِي لَا إِلَهَ إِلَّا هُوَ الْحَيَّ الْقَيُّومَ وَأَتُوبُ إِلَيْهِ", okunus: "Estağfirullâhe'l-azîm, ellezî lâ ilâhe illâ hüvel-hayyel-kayyûme ve etûbü ileyh.", anlam: "Kendisinden başka ilah olmayan, diri ve her şeyi ayakta tutan yüce Allah'tan bağışlanma diler, O'na tövbe ederim.", kaynak: "Tirmizî, Deavât, 119" },
  // EK AİLE
  { kat: "aile", ad: "Evlat (Çocuk Sahibi Olmak) Duası", ar: "رَبِّ لَا تَذَرْنِي فَرْدًا وَأَنْتَ خَيْرُ الْوَارِثِينَ", okunus: "Rabbi lâ tezernî ferden ve ente hayrü'l-vârisîn.", anlam: "Rabbim! Beni tek başıma (evlatsız) bırakma; sen varislerin en hayırlısısın.", kaynak: "Enbiyâ, 89" },
];

function renderDua() {
  const c = $("#livingContent");
  c.innerHTML = `
    <div class="prayer-guide">
      <div class="prayer-tabs" id="duaTabs">
        ${DUA_CATEGORIES.map((t, i) => `<button class="prayer-tab ${i === 0 ? "prayer-tab--active" : ""}" data-i="${i}"><span>${t.icon}</span>${t.name}</button>`).join("")}
      </div>
      <div id="duaDetail"></div>
    </div>`;

  const render = (i) => {
    const cat = DUA_CATEGORIES[i];
    const list = DUAS.filter((d) => d.kat === cat.id);
    $("#duaDetail").innerHTML = `
      <div class="card abdest-intro"><p>${list.length ? `${list.length} dua` : "Bu kategoride dua yok"} — Arapça, okunuş ve anlamıyla.</p></div>
      <div class="abdest-steps">
        ${list.map((d) => `
          <div class="dua-card">
            <span class="dua-card__name">${d.ad}</span>
            <p class="dua-card__ar" dir="rtl">${d.ar}</p>
            <p class="dua-card__okunus"><i>${d.okunus}</i></p>
            <p class="dua-card__tr">${d.anlam}</p>
            <p class="dua-card__kaynak">${d.kaynak}</p>
          </div>`).join("")}
      </div>`;
  };
  render(0);

  c.querySelectorAll("#duaTabs .prayer-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      c.querySelectorAll("#duaTabs .prayer-tab").forEach((t) => t.classList.remove("prayer-tab--active"));
      tab.classList.add("prayer-tab--active");
      render(Number(tab.dataset.i));
    });
  });
}

/* =====================================================================
   EK MODÜLLER — Hatim Takibi, Kaza Namaz, Quiz, Adab, Hicri Takvim,
   Dini Günler, Esma Zikri, İbadet Hatırlatıcıları
===================================================================== */

/* Hatim anahtarı (Ramazan modu ile ortak) */
const HATIM_STORAGE_KEY = "mihrap:hatim";
const KAZA_STORAGE_KEY = "mihrap:kaza-namaz";
const REMINDER_STORAGE_KEY = "mihrap:hatirlaticilar";
const QUIZ_BEST_KEY = "mihrap:quiz-best";

/* -------------------------------------------------------------------
   1) HATİM TAKİBİ (yıl boyu) — her cüzün başladığı sure/âyet
------------------------------------------------------------------- */
const CUZ_STARTS = [
  { cuz: 1,  surah: 2,  ayah: 1 },
  { cuz: 2,  surah: 2,  ayah: 142 },
  { cuz: 3,  surah: 2,  ayah: 253 },
  { cuz: 4,  surah: 3,  ayah: 93 },
  { cuz: 5,  surah: 4,  ayah: 24 },
  { cuz: 6,  surah: 4,  ayah: 148 },
  { cuz: 7,  surah: 5,  ayah: 82 },
  { cuz: 8,  surah: 6,  ayah: 111 },
  { cuz: 9,  surah: 7,  ayah: 88 },
  { cuz: 10, surah: 8,  ayah: 41 },
  { cuz: 11, surah: 9,  ayah: 93 },
  { cuz: 12, surah: 11, ayah: 6 },
  { cuz: 13, surah: 12, ayah: 53 },
  { cuz: 14, surah: 15, ayah: 1 },
  { cuz: 15, surah: 17, ayah: 1 },
  { cuz: 16, surah: 18, ayah: 75 },
  { cuz: 17, surah: 21, ayah: 1 },
  { cuz: 18, surah: 23, ayah: 1 },
  { cuz: 19, surah: 25, ayah: 21 },
  { cuz: 20, surah: 27, ayah: 56 },
  { cuz: 21, surah: 29, ayah: 46 },
  { cuz: 22, surah: 33, ayah: 31 },
  { cuz: 23, surah: 36, ayah: 28 },
  { cuz: 24, surah: 39, ayah: 32 },
  { cuz: 25, surah: 41, ayah: 47 },
  { cuz: 26, surah: 46, ayah: 1 },
  { cuz: 27, surah: 51, ayah: 31 },
  { cuz: 28, surah: 58, ayah: 1 },
  { cuz: 29, surah: 67, ayah: 1 },
  { cuz: 30, surah: 78, ayah: 1 },
];

function renderHatimFull() {
  const c = $("#livingContent");
  const done = state.hatim ? state.hatim.size : 0;
  const total = 30;
  const pct = Math.round((done / total) * 100);

  const grid = CUZ_STARTS.map((cuz) => {
    const isDone = state.hatim && state.hatim.has(cuz.cuz);
    const sure = SURAH_NAMES_TR[cuz.surah] || "";
    return `<button class="hatim__cuz ${isDone ? "hatim__cuz--done" : ""}" data-cuz="${cuz.cuz}">
      <span class="hatim__cuz-num">${cuz.cuz}</span>
      <span class="hatim__cuz-label">Cüz</span>
      <span class="hatim__cuz-sure">${sure} ${cuz.ayah}</span>
    </button>`;
  }).join("");

  c.innerHTML = `
    <div class="card abdest-intro"><p>📖 <b>Hatim Takibi</b> — 30 cüzü işaretleyerek Kur'an hatmini takip edin. İlerlemeniz cihazınızda saklanır ve Ramazan moduyla ortaktır.</p></div>
    <div class="card">
      <div class="ntakip__head">
        <span class="ntakip__title">İlerleme</span>
        <span class="ntakip__today"><b>${done}</b> / ${total} cüz · %${pct}</span>
      </div>
      <div class="hatim-bar"><div class="hatim-bar__fill" style="width:${pct}%"></div></div>
      <div class="hatim-grid">${grid}</div>
      <button class="btn-ghost" id="hatimReset2">Hatim'i Sıfırla</button>
    </div>`;

  c.querySelectorAll(".hatim__cuz").forEach((btn) => {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.cuz);
      if (state.hatim.has(n)) state.hatim.delete(n);
      else state.hatim.add(n);
      saveHatim();
      renderHatimFull();
    });
  });
  c.querySelector("#hatimReset2").addEventListener("click", () => {
    state.hatim = new Set();
    saveHatim();
    renderHatimFull();
    showToast("Hatim sıfırlandı");
  });
}

/* -------------------------------------------------------------------
   2) KAZA NAMAZ TAKİBİ
------------------------------------------------------------------- */
function loadKaza() {
  try { return JSON.parse(localStorage.getItem(KAZA_STORAGE_KEY) || '{"owed":0}'); }
  catch (e) { return { owed: 0 }; }
}
function saveKaza(k) {
  try { localStorage.setItem(KAZA_STORAGE_KEY, JSON.stringify(k)); } catch (e) {}
}
function renderKaza() {
  const c = $("#livingContent");
  const k = loadKaza();
  const owed = Math.max(0, k.owed || 0);

  const render = () => {
    c.querySelector("#kazaOwed").textContent = owed;
    c.querySelector("#kazaMsg").textContent =
      owed === 0 ? "Kaza borcunuz yok. Elhamdülillah! 🌸"
      : `Toplam ${owed} vakit kaza namazı borcunuz var.`;
  };

  c.innerHTML = `
    <div class="card abdest-intro"><p>🧾 <b>Kaza Namaz Takibi</b> — Kaçırdığınız vakitleri ekleyin, kıldıkça düşürün. Veriler cihazınızda saklanır.</p></div>
    <div class="card kaza">
      <div class="kaza__counter">
        <span class="kaza__label">Kalan kaza borcu</span>
        <span class="kaza__num" id="kazaOwed">0</span>
        <span class="kaza__unit">vakit</span>
      </div>
      <p class="kaza__msg" id="kazaMsg"></p>
      <div class="kaza__grid">
        <button class="kaza__btn" data-add="1">+1 vakit</button>
        <button class="kaza__btn" data-add="5">+5 vakit</button>
        <button class="kaza__btn kaza__btn--sub" data-add="-1">−1 kaza kıldım</button>
      </div>
      <button class="btn-ghost" id="kazaReset">Sıfırla</button>
    </div>`;

  c.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const add = Number(btn.dataset.add);
      const cur = loadKaza();
      cur.owed = Math.max(0, (cur.owed || 0) + add);
      saveKaza(cur);
      render();
    });
  });
  c.querySelector("#kazaReset").addEventListener("click", () => {
    saveKaza({ owed: 0 });
    render();
    showToast("Kaza sayacı sıfırlandı");
  });

  render();
}

/* -------------------------------------------------------------------
   3) DİNİ BİLGİ YARIŞMASI (Quiz)
------------------------------------------------------------------- */
const QUIZ_QUESTIONS = [
  { q: "Kaç vakit farz namaz vardır?", opts: ["3", "4", "5", "6"], correct: 2, exp: "Sabah, öğle, ikindi, akşam ve yatsı olmak üzere 5 vakit farz namaz vardır." },
  { q: "Oruç hangi ayda farz kılınmıştır?", opts: ["Şaban", "Ramazan", "Muharrem", "Recep"], correct: 1, exp: "Oruç, Ramazan ayında farzdır (Bakara, 183)." },
  { q: "Kur'an-ı Kerim kaç sûredir?", opts: ["110", "112", "114", "116"], correct: 2, exp: "Kur'an-ı Kerim 114 sûreden oluşur." },
  { q: "Kur'an-ı Kerim'de toplam kaç âyet vardır?", opts: ["6000", "6236", "6666", "6400"], correct: 1, exp: "Yaygın kabulle Kur'an'da 6236 âyet vardır." },
  { q: "Peygamber Efendimiz (s.a.v.) hangi şehirde doğmuştur?", opts: ["Medine", "Taif", "Mekke", "Kudüs"], correct: 2, exp: "Peygamberimiz 571'de Mekke'de doğdu." },
  { q: "İlk vahiy nerede gelmiştir?", opts: ["Hira Mağarası", "Sevr Mağarası", "Kâbe", "Mescid-i Nebevî"], correct: 0, exp: "İlk vahiy, Hira Mağarası'nda Cebrail (a.s.) aracılığıyla geldi." },
  { q: "İslam'ın ilk şartı hangisidir?", opts: ["Namaz", "Oruç", "Kelime-i Şehadet", "Zekât"], correct: 2, exp: "İmanın ilk şartı Kelime-i Şehadet getirmektir." },
  { q: "Zekât, malın (nisaba ulaşan zekât mallarında) kaçta kaçıdır?", opts: ["1/20", "1/40", "1/10", "1/100"], correct: 1, exp: "Zekât oranı 1/40, yani %2,5'tir." },
  { q: "Müslümanların kıblesi olan Kâbe hangi şehirdedir?", opts: ["Medine", "Kudüs", "Mekke", "İstanbul"], correct: 2, exp: "Kâbe, Mekke'dedir." },
  { q: "Sabah namazının farzı kaç rekâttır?", opts: ["2", "3", "4", "1"], correct: 0, exp: "Sabah namazının farzı 2 rekâttır." },
  { q: "Cuma namazı hangi vakit namazının yerine geçer?", opts: ["Sabah", "Öğle", "İkindi", "Akşam"], correct: 1, exp: "Cuma namazı, öğle namazının yerine kılınır." },
  { q: "Esmaül Hüsna kaç isimden oluşur?", opts: ["90", "99", "100", "103"], correct: 1, exp: "Allah'ın en güzel isimleri 99 tanedir." },
  { q: "Hac ibadeti hangi ayda eda edilir?", opts: ["Ramazan", "Şevval", "Zilhicce", "Muharrem"], correct: 2, exp: "Hac, Zilhicce ayında yapılır." },
  { q: "Kur'an'ın ilk sûresi hangisidir?", opts: ["Bakara", "İhlâs", "Fâtiha", "Nâs"], correct: 2, exp: "Kur'an, Fâtiha sûresi ile başlar." },
  { q: "Teravih namazı hangi ayda kılınır?", opts: ["Ramazan", "Şaban", "Muharrem", "Receb"], correct: 0, exp: "Teravih, Ramazan ayına mahsus sünnet bir namazdır." },
  { q: "Hanefî mezhebine göre vitir namazının hükmü nedir?", opts: ["Farz", "Vacip", "Sünnet", "Müstehap"], correct: 1, exp: "Vitir, Hanefîlere göre vaciptir." },
  { q: "Peygamberimizin kabri hangi şehirdedir?", opts: ["Mekke", "Medine", "Taif", "Kudüs"], correct: 1, exp: "Peygamberimiz Medine'de defnedilmiştir (Ravza-i Mutahhara)." },
  { q: "'Es-Semî' isminin anlamı nedir?", opts: ["Her şeyi gören", "Her şeyi işiten", "Çok merhamet eden", "Her şeye gücü yeten"], correct: 1, exp: "Es-Semî', her şeyi işiten demektir." },
  { q: "Namazda ilk oturuşta okunan dua hangisidir?", opts: ["Sübhaneke", "Ettehiyyâtü", "Rabbenâ", "Kunut"], correct: 1, exp: "Namazda oturuşlarda Ettehiyyâtü okunur." },
  { q: "Orucun başlangıcı olan vaktin adı nedir?", opts: ["İftar", "İmsak", "Sahur", "Teravih"], correct: 1, exp: "İmsak, orucun başladığı vakittir." },
];

function getQuizBest() {
  try { return Number(localStorage.getItem(QUIZ_BEST_KEY) || 0); } catch (e) { return 0; }
}
function setQuizBest(v) {
  try { localStorage.setItem(QUIZ_BEST_KEY, String(v)); } catch (e) {}
}

function renderQuiz() {
  const c = $("#livingContent");
  const total = QUIZ_QUESTIONS.length;
  let idx = 0, score = 0, answered = false;
  const best = getQuizBest();

  const render = () => {
    if (idx >= total) {
      const pct = Math.round((score / total) * 100);
      const newBest = score > best;
      if (newBest) setQuizBest(score);
      c.innerHTML = `
        <div class="card quiz quiz--end">
          <span class="quiz__emoji">${pct >= 80 ? "🏆" : pct >= 50 ? "🎉" : "📚"}</span>
          <h3 class="quiz__score">${score} / ${total}</h3>
          <p class="quiz__sub">Doğru oranı: %${pct}</p>
          <p class="quiz__sub">${newBest ? "Yeni en iyi skor! 🎊" : `En iyi skorunuz: ${best} / ${total}`}</p>
          <button class="btn-gold" id="quizRestart">Tekrar Oyna</button>
        </div>`;
      c.querySelector("#quizRestart").addEventListener("click", () => { idx = 0; score = 0; render(); });
      return;
    }
    const q = QUIZ_QUESTIONS[idx];
    answered = false;
    c.innerHTML = `
      <div class="card quiz">
        <div class="quiz__head">
          <span class="quiz__progress">Soru ${idx + 1} / ${total}</span>
          <span class="quiz__score-live">Skor: ${score}</span>
        </div>
        <h3 class="quiz__q">${q.q}</h3>
        <div class="quiz__opts">
          ${q.opts.map((o, i) => `<button class="quiz__opt" data-opt="${i}">${o}</button>`).join("")}
        </div>
        <div class="quiz__result" id="quizResult"></div>
      </div>`;
    c.querySelectorAll(".quiz__opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const chosen = Number(btn.dataset.opt);
        const correct = q.correct;
        const all = c.querySelectorAll(".quiz__opt");
        all.forEach((b, i) => {
          b.disabled = true;
          if (i === correct) b.classList.add("quiz__opt--correct");
          else if (i === chosen) b.classList.add("quiz__opt--wrong");
        });
        if (chosen === correct) score++;
        c.querySelector("#quizResult").innerHTML =
          `<p class="${chosen === correct ? "quiz__ok" : "quiz__no"}">${chosen === correct ? "✅ Doğru!" : "❌ Yanlış."}</p>
           <p class="quiz__exp">${q.exp}</p>
           <button class="btn-ghost" id="quizNext">Sonraki →</button>`;
        c.querySelector("#quizNext").addEventListener("click", () => { idx++; render(); });
      });
    });
  };

  render();
}

/* -------------------------------------------------------------------
   4) 40 YAŞAM REHBERİ (Adab-ı Muaşeret)
------------------------------------------------------------------- */
const ADAB_CATEGORIES = [
  { id: "selam", icon: "👋", name: "Selamlaşma & Sosyal" },
  { id: "yemek", icon: "🍽️", name: "Yeme-İçme" },
  { id: "temizlik", icon: "✨", name: "Temizlik & Giyim" },
  { id: "aile", icon: "👨‍👩‍👧", name: "Aile & Komşuluk" },
  { id: "ahlak", icon: "💬", name: "Konuşma & Ahlak" },
  { id: "rutin", icon: "🌙", name: "Uyku & Günlük Rutin" },
];

const ADAB_ITEMS = [
  // Selamlaşma & Sosyal
  { kat: "selam", baslik: "Selamı Yaymak", aciklama: "Karşılaştığında güler yüzle selam ver; tanıdığın tanımadığın herkese selamı yay. Selam vermek sünnet, almak ise farz-ı kifâyedir.", kaynak: "Müslim, Îmân, 93" },
  { kat: "selam", baslik: "Tokalaşmak (Musafaha)", aciklama: "Müminler karşılaştıklarında tokalaşır; günahları, yaprakların dökülmesi gibi dökülür.", kaynak: "Ebû Dâvûd, Edeb, 143" },
  { kat: "selam", baslik: "Genç Büyüğe Selam Verir", aciklama: "Küçük büyüğe, binekli yürüyene, yürüyen oturana selam verir.", kaynak: "Buhârî, İsti'zân, 4" },
  { kat: "selam", baslik: "Aksırana Teşmit", aciklama: "Aksıran 'Elhamdülillâh' derse ona 'Yerhamükellâh' (Allah sana merhamet etsin) de.", kaynak: "Buhârî, Edeb, 125" },
  { kat: "selam", baslik: "Hasta Ziyareti", aciklama: "Hastayı ziyaret et, ona şifa dile. Hastayı ziyaret eden, cennet bahçesinde gezinir gibidir.", kaynak: "Müslim, Birr, 40" },
  { kat: "selam", baslik: "Cenazeye Katılmak", aciklama: "Müminin mümin üzerindeki haklarından biri cenazesine katılmaktır.", kaynak: "Buhârî, Cenâiz, 2" },
  // Yeme-İçme
  { kat: "yemek", baslik: "Besmele ile Başlamak", aciklama: "Yemeğe 'Bismillâh' ile başla, bitince 'Elhamdülillâh' de.", kaynak: "Buhârî, Et'ime, 2" },
  { kat: "yemek", baslik: "Sağ Elle Yemek", aciklama: "Sağ elinle ve önünden ye.", kaynak: "Buhârî, Et'ime, 2" },
  { kat: "yemek", baslik: "Yemeği Ayıplamamak", aciklama: "Yemeği beğenmezsen ayıplama; ya ye ya da bırak.", kaynak: "Buhârî, Et'ime, 21" },
  { kat: "yemek", baslik: "Üç Nefeste Su İçmek", aciklama: "Suyu oturarak, besmeleyle ve üç nefeste iç; kabın içine soluma.", kaynak: "Buhârî, Eşribe, 26" },
  { kat: "yemek", baslik: "Misafire İkram", aciklama: "Allah'a ve ahiret gününe inanan, misafirine ikram etsin.", kaynak: "Buhârî, Edeb, 31" },
  { kat: "yemek", baslik: "Sofrada Birlikte Yemek", aciklama: "Bir araya gelerek yiyin; toplu yemekte bereket vardır.", kaynak: "Ebû Dâvûd, Et'ime, 14" },
  { kat: "yemek", baslik: "Elleri Yıkamak", aciklama: "Yemekten önce ve sonra elleri yıkamak berekettir.", kaynak: "Tirmizî, Et'ime, 39" },
  // Temizlik & Giyim
  { kat: "temizlik", baslik: "Misvak Kullanmak", aciklama: "Ağız ve diş temizliğine özen göster; misvak (diş fırçası) kullan.", kaynak: "Nesâî, Tahâret, 5" },
  { kat: "temizlik", baslik: "Güzel Koku Sürünmek", aciklama: "Güzel koku sürünmek Peygamberimizin sevdiği sünnetlerdendir.", kaynak: "Nesâî, Zîne, 61" },
  { kat: "temizlik", baslik: "Sağdan Başlamak", aciklama: "Giyinirken, ayakkabı giyerken ve temizlikte sağdan başla.", kaynak: "Buhârî, Vudû, 31" },
  { kat: "temizlik", baslik: "Tırnak ve Saç Bakımı", aciklama: "Tırnakları kesmek, saç ve sakalı bakımlı tutmak fıtrat gereğidir.", kaynak: "Müslim, Tahâret, 56" },
  { kat: "temizlik", baslik: "Elbisede Temizlik", aciklama: "Elbiselerini temiz tut; temizlik imanın yarısıdır.", kaynak: "Müslim, Tahâret, 1" },
  { kat: "temizlik", baslik: "Ayakkabıyı Önce Sol Çıkar", aciklama: "Ayakkabıyı giyerken sağdan, çıkarırken soldan başla.", kaynak: "Buhârî, Libâs, 39" },
  // Aile & Komşuluk
  { kat: "aile", baslik: "Aileye Şefkat", aciklama: "Ailenizin en hayırlısı, ailesine karşı en hayırlı olanınızdır.", kaynak: "Tirmizî, Menâkıb, 63" },
  { kat: "aile", baslik: "Eşler Arası Sevgi", aciklama: "Mümin, eşine sevgi ve şefkatle davranır; en hayırlınız eşine hayırlı olandır.", kaynak: "Tirmizî, Radâ', 11" },
  { kat: "aile", baslik: "Anne-Babaya İyilik", aciklama: "Anne babana güzellikle muamele et; rızalarını kazan.", kaynak: "İsrâ, 23" },
  { kat: "aile", baslik: "Komşuya İkram", aciklama: "Komşunu gözet, ona ikramdan çekinme. Cebrail komşu hakkını o kadar tavsiye etti ki mirasçı kılacak sandım.", kaynak: "Buhârî, Edeb, 28" },
  { kat: "aile", baslik: "Akraba Ziyareti (Sıla-i Rahim)", aciklama: "Akrabalık bağlarını koparma; akrabayı ziyaret et. Sıla-i rahim rızkı artırır.", kaynak: "Buhârî, Edeb, 12" },
  { kat: "aile", baslik: "Çocuklara Merhamet", aciklama: "Çocuklara merhamet et, onları sev; merhamet etmeyene merhamet edilmez.", kaynak: "Buhârî, Edeb, 18" },
  { kat: "aile", baslik: "Evde Selam ve İzin", aciklama: "Evine girerken ailene selam ver; odaya girerken izin iste.", kaynak: "Nûr, 58" },
  // Konuşma & Ahlak
  { kat: "ahlak", baslik: "Ya Hayır Söyle ya Sus", aciklama: "Allah'a ve ahirete inanan ya hayır söylesin ya da sussun.", kaynak: "Buhârî, Edeb, 31" },
  { kat: "ahlak", baslik: "Gıybetten Sakınmak", aciklama: "Din kardeşini gıybet etme; gıybet, ölü kardeşinin etini yemek gibidir.", kaynak: "Hucurât, 12" },
  { kat: "ahlak", baslik: "Doğru Sözlü Olmak", aciklama: "Doğruluk iyiliğe, iyilik cennete götürür. Yalan söylemekten kaçın.", kaynak: "Buhârî, Edeb, 69" },
  { kat: "ahlak", baslik: "Öfkeye Hâkim Olmak", aciklama: "Güçlü kimse güreşte yenen değil, öfkelendiğinde kendine hâkim olandır.", kaynak: "Buhârî, Edeb, 76" },
  { kat: "ahlak", baslik: "Tebessüm Sadakadır", aciklama: "Kardeşine tebessüm etmen senin için bir sadakadır.", kaynak: "Tirmizî, Birr, 36" },
  { kat: "ahlak", baslik: "Hasedi Bırakmak", aciklama: "Hasetten sakın; haset, iyilikleri ateşin odunu yediği gibi yer.", kaynak: "Ebû Dâvûd, Edeb, 44" },
  { kat: "ahlak", baslik: "Tevazu (Alçakgönüllülük)", aciklama: "Kim Allah için alçakgönüllü olursa, Allah onu yüceltir.", kaynak: "Müslim, Birr, 69" },
  // Uyku & Günlük Rutin
  { kat: "rutin", baslik: "Uyumadan Önce Dua", aciklama: "Abdestli olarak, sağ yanına yatarak ve dua ederek uyu.", kaynak: "Buhârî, Deavât, 6" },
  { kat: "rutin", baslik: "Uyanınca Dua", aciklama: "Uyanınca 'Elhamdülillâhillezî ahyânâ ba'de mâ emâtenâ' de.", kaynak: "Buhârî, Deavât, 8" },
  { kat: "rutin", baslik: "Evden Çıkarken Dua", aciklama: "Evden çıkarken 'Bismillâh, tevekkeltü alellâh' de.", kaynak: "Tirmizî, Deavât, 34" },
  { kat: "rutin", baslik: "Mescide Sağ Ayakla Girmek", aciklama: "Mescide sağ ayakla gir, sol ayakla çık; girerken rahmet kapıları için dua et.", kaynak: "Müslim, Mesâcid, 68" },
  { kat: "rutin", baslik: "Sabah-Akşam Zikri", aciklama: "Sabah ve akşam Allah'ı zikret; zikir kalbe huzur verir.", kaynak: "Ra'd, 28" },
  { kat: "rutin", baslik: "Güne Erken Başlamak", aciklama: "Sabah erken kalkmak ve işe erken başlamak berekettir.", kaynak: "Tirmizî, Büyû', 6" },
  { kat: "rutin", baslik: "Dua ile Günü Bitirmek", aciklama: "Günü, istiğfar ve dua ile kapat; hesabını vererek yaşa.", kaynak: "Müslim, Zikr, 38" },
];

function renderAdab() {
  const c = $("#livingContent");
  const renderCat = (i) => {
    const cat = ADAB_CATEGORIES[i];
    const list = ADAB_ITEMS.filter((x) => x.kat === cat.id);
    c.innerHTML = `
      <div class="prayer-guide">
        <div class="prayer-tabs" id="adabTabs">
          ${ADAB_CATEGORIES.map((t, j) => `<button class="prayer-tab ${j === i ? "prayer-tab--active" : ""}" data-i="${j}"><span>${t.icon}</span>${t.name}</button>`).join("")}
        </div>
        <div class="card abdest-intro"><p>🌿 <b>${cat.name}</b> — ${list.length} sünnet ve görgü kuralı.</p></div>
        <div class="adab-list">
          ${list.map((it, k) => `
            <div class="adab-item">
              <span class="adab-item__no">${k + 1}</span>
              <div class="adab-item__body">
                <span class="adab-item__title">${it.baslik}</span>
                <p class="adab-item__text">${it.aciklama}</p>
                <span class="adab-item__kaynak">${it.kaynak}</span>
              </div>
            </div>`).join("")}
        </div>
      </div>`;
    c.querySelectorAll("#adabTabs .prayer-tab").forEach((b) =>
      b.addEventListener("click", () => renderCat(Number(b.dataset.i))));
  };
  renderCat(0);
}

/* -------------------------------------------------------------------
   5) HİCRİ TAKVİM (aylık)
------------------------------------------------------------------- */
let hicriMonthOffset = 0; // -1 önceki, 0 bu ay, 1 sonraki

async function renderHicriTakvim() {
  const c = $("#livingContent");
  c.innerHTML = `<div class="quran__loading">Hicri takvim yükleniyor...</div>`;

  let base = state.hijri;
  if (!base) base = await fetchHijriToday();
  if (!base) { c.innerHTML = '<div class="quran__loading">Hicri takvim yüklenemedi.</div>'; return; }

  const draw = async () => {
    const m = ((base.month - 1 + hicriMonthOffset + 12) % 12) + 1;
    const y = base.year + Math.floor((base.month - 1 + hicriMonthOffset) / 12);
    c.innerHTML = `<div class="quran__loading">Yükleniyor...</div>`;
    try {
      const loc = state.location;
      const res = await fetch(`https://api.aladhan.com/v1/hijriCalendar?latitude=${loc.lat}&longitude=${loc.lng}&method=13&month=${m}&year=${y}`);
      if (!res.ok) throw new Error("HTTP");
      const data = (await res.json()).data;
      const monthName = HIJRI_MONTHS_TR[m - 1] || ("Ay " + m);
      const todayKey = `${pad(new Date().getDate())}-${pad(new Date().getMonth() + 1)}-${new Date().getFullYear()}`;
      const rows = data.map((d) => {
        const g = d.date.gregorian;
        const gKey = `${g.day}-${g.month.number}-${g.year}`;
        const isToday = gKey === todayKey;
        return `<div class="hicri-cell ${isToday ? "hicri-cell--today" : ""}">
          <span class="hicri-cell__hday">${d.date.hijri.day}</span>
          <span class="hicri-cell__gday">${g.day} ${GREG_MONTHS_TR[Number(g.month.number) - 1] || ""}</span>
          <span class="hicri-cell__week">${(d.date.hijri.weekday && d.date.hijri.weekday.tr) ? d.date.hijri.weekday.tr : ""}</span>
        </div>`;
      }).join("");
      c.innerHTML = `
        <div class="hicri">
          <div class="hicri__head">
            <button class="hicri__nav" data-nav="-1">←</button>
            <div class="hicri__title"><span>${monthName}</span><span class="hicri__year">${y} H.</span></div>
            <button class="hicri__nav" data-nav="1">→</button>
          </div>
          <div class="hicri__grid">${rows}</div>
          <p class="hicri__note">Hicri ay, hilalin görülmesiyle başlar; günler gün batımıyla değişir. (Umm al-Qura)</p>
        </div>`;
      c.querySelectorAll(".hicri__nav").forEach((b) =>
        b.addEventListener("click", () => { hicriMonthOffset += Number(b.dataset.nav); draw(); }));
    } catch (e) {
      c.innerHTML = '<div class="quran__loading">Hicri takvim yüklenemedi (çevrimdışı?).</div>';
    }
  };
  draw();
}

/* -------------------------------------------------------------------
   6) DİNİ GÜNLER YAKLAŞIYOR
------------------------------------------------------------------- */
const DINIGUNLER = [
  { id: "mevlid", name: "Mevlid Kandili", icon: "🌙", month: 3, day: 12, msg: "Peygamberimizin dünyaya teşrif ettiği gece. Salavat getirelim." },
  { id: "regaib", name: "Regaib Kandili", icon: "🌙", month: 7, day: 0, msg: "Receb ayının ilk Cuma gecesi. Tövbe ve dua ile ihya edelim." },
  { id: "mirac", name: "Miraç Kandili", icon: "🌙", month: 7, day: 27, msg: "Beş vakit namazın hediye edildiği mübarek gece." },
  { id: "berat", name: "Berat Kandili", icon: "🌙", month: 8, day: 15, msg: "Rahmet ve mağfiret gecesi. Bolca istiğfar edelim." },
  { id: "ramazan", name: "Ramazan Ayı", icon: "🌙", month: 9, day: 1, msg: "On bir ayın sultanı. Oruç ayı başlıyor." },
  { id: "kadir", name: "Kadir Gecesi", icon: "✨", month: 9, day: 27, msg: "Bin aydan hayırlı gece. Dua ve tilavetle ihya edelim." },
  { id: "ramazanbayram", name: "Ramazan Bayramı", icon: "🎉", month: 10, day: 1, msg: "Şevval ayının ilk günü. Bayramımız mübarek olsun." },
  { id: "kurbanbayram", name: "Kurban Bayramı", icon: "🎉", month: 12, day: 10, msg: "Zilhicce'nin 10. günü. Kurban ibadeti ile ihya edilir." },
  { id: "asure", name: "Aşure Günü", icon: "🥣", month: 1, day: 10, msg: "Muharrem'in 10. günü. Oruç tutulması faziletlidir." },
];

/* Önemli gün hatırlatması: yarın önemli bir günse 1 gün önceden bildir */
async function checkSpecialDayReminders() {
  const today = todayKey();
  if (state.lastSpecialCheck === today) return;
  state.lastSpecialCheck = today;
  if (!state.specialReminder) return;

  try {
    const now = new Date();
    now.setDate(now.getDate() + 1);
    const tomorrowStr = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
    const h = await fetchHijriFor(tomorrowStr);
    if (!h) return;

    // Regaib (ilk Cuma) gibi günü belirsiz olanlar hariç, sabit günlü olaylar
    const ev = DINIGUNLER.find((e) => e.day !== 0 && e.month === h.month && e.day === h.day);
    if (!ev) return;

    const msg = `Yarın ${ev.name} ${ev.icon} — ${ev.msg}`;
    showToast(msg);
    notifyUser("Mihrap — Önemli Gün Hatırlatması",
      `Yarın ${ev.name} ${ev.icon}\n${ev.msg}`,
      { tag: `mihrap-special-${today}`, channelId: "hatirlatma" });
  } catch (e) { /* hicri alınamadı — sessizce geç */ }
}

async function renderDiniGunler() {
  const c = $("#livingContent");
  c.innerHTML = `<div class="quran__loading">Yaklaşan dini günler hesaplanıyor...</div>`;

  let h = state.hijri;
  if (!h) h = await fetchHijriToday();
  if (!h) { c.innerHTML = '<div class="quran__loading">Hicri tarih alınamadı (çevrimdışı?).</div>'; return; }

  // Bugünün hicri (gün, ay, yıl) değerini tek değere çevir
  const hToday = h.year * 1000 + h.month * 50 + h.day;

  // Güvenli Gregorian tarih üret: "DD-MM-YYYY" → Date
  const toDate = (d) => new Date(Number(d.year), Number(d.month.number) - 1, Number(d.day));

  const rows = [];
  for (const ev of DINIGUNLER) {
    let y = h.year;
    const m = ev.month;
    // Regaib özel: Recep ayının ilk Cuma gecesi
    if (ev.day === 0) {
      const keyThis = y * 1000 + m * 50 + 1;
      if (keyThis < hToday) y += 1;
      try {
        const res = await fetch(`https://api.aladhan.com/v1/hToG/1-${m}-${y}`);
        if (res.ok) {
          const d = (await res.json()).data;
          const gdate = toDate(d.gregorian);
          const wd = gdate.getDay(); // 0=Pazar ... 5=Cuma
          const add = (5 - wd + 7) % 7;
          gdate.setDate(gdate.getDate() + add);
          rows.push({ ...ev, date: gdate });
        }
      } catch (e) {}
      continue;
    }
    let key = y * 1000 + m * 50 + ev.day;
    if (key < hToday) { y += 1; key = y * 1000 + m * 50 + ev.day; }
    try {
      const res = await fetch(`https://api.aladhan.com/v1/hToG/${ev.day}-${m}-${y}`);
      if (res.ok) {
        const d = (await res.json()).data;
        rows.push({ ...ev, date: toDate(d.gregorian) });
      }
    } catch (e) {}
  }

  rows.sort((a, b) => a.date - b.date);
  // Bugünü gece yarısına normalize et (saat farkı gün hesabını bozmasın)
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dayLabel = (dt) => {
    const d = new Date(dt); d.setHours(0, 0, 0, 0);
    const diff = Math.round((d - now) / 86400000);
    if (diff <= 0) return "Bugün";
    if (diff === 1) return "Yarın";
    return `${diff} gün kaldı`;
  };
  const fmt = (dt) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(dt);

  if (!rows.length) {
    c.innerHTML = '<div class="quran__loading">Dini günler hesaplanamadı (çevrimdışı?).</div>';
    return;
  }

  c.innerHTML = `
    <div class="card abdest-intro"><p>🌙 <b>Yaklaşan Dini Günler</b> — Kandil, bayram ve mübarek günlerin tarihleri.</p></div>
    <div class="dini-list">
      ${rows.map((r) => `
        <div class="dini-item">
          <span class="dini-item__icon">${r.icon}</span>
          <div class="dini-item__body">
            <span class="dini-item__name">${r.name}</span>
            <span class="dini-item__date">${fmt(r.date)}</span>
            <span class="dini-item__msg">${r.msg}</span>
          </div>
          <span class="dini-item__left">${dayLabel(r.date)}</span>
        </div>`).join("")}
    </div>`;
}

/* -------------------------------------------------------------------
   7) ESMA ZİKRİ (sesli)
------------------------------------------------------------------- */
let esmaZikirIdx = 0;
let esmaZikirPlaying = false;

function renderEsmaZikir() {
  const c = $("#livingContent");
  esmaZikirPlaying = false;
  const names = CONTENT.esmaulHusna;
  const draw = () => {
    const e = names[esmaZikirIdx];
    c.innerHTML = `
      <div class="esma-zikir">
        <div class="esma-zikir__card">
          <span class="esma-zikir__num">${e.sira} / 99</span>
          <span class="esma-zikir__ar" dir="rtl">${e.arapca}</span>
          <span class="esma-zikir__tr">${e.turkce}</span>
          <span class="esma-zikir__anlam">${e.anlam}</span>
        </div>
        <div class="esma-zikir__controls">
          <button class="btn-ghost" id="esmaPrev">← Önceki</button>
          <button class="btn-gold" id="esmaPlay">${esmaZikirPlaying ? "⏸ Durdur" : "🔊 Sesli Zikre Başla"}</button>
          <button class="btn-ghost" id="esmaNext">Sonraki →</button>
        </div>
        <p class="donate-note">Sesli zikir, isimleri sırayla okuyarak ilerler. ${esmaZikirPlaying ? "Durdurmak için butona basın." : "Başlatmak için butona dokunun."}</p>
      </div>`;
    c.querySelector("#esmaPrev").addEventListener("click", () => { esmaZikirIdx = (esmaZikirIdx - 1 + names.length) % names.length; draw(); });
    c.querySelector("#esmaNext").addEventListener("click", () => { esmaZikirIdx = (esmaZikirIdx + 1) % names.length; draw(); });
    c.querySelector("#esmaPlay").addEventListener("click", () => {
      if (esmaZikirPlaying) { esmaZikirPlaying = false; try { speechSynthesis && speechSynthesis.cancel(); } catch (e) {} draw(); return; }
      esmaZikirPlaying = true;
      draw();
      speakEsma();
    });
  };
  const speakEsma = () => {
    if (!esmaZikirPlaying) return;
    const e = names[esmaZikirIdx];
    if (!window.speechSynthesis) { showToast("Bu cihazda sesli okuma desteklenmiyor"); esmaZikirPlaying = false; draw(); return; }
    const u = new SpeechSynthesisUtterance(e.arapca);
    u.lang = "ar-SA";
    const v = voiceFor("ar-SA");   // erkek sesi tercih et
    if (v) u.voice = v;
    u.rate = 0.85;
    u.onend = () => {
      esmaZikirIdx = (esmaZikirIdx + 1) % names.length;
      if (esmaZikirPlaying) { draw(); speakEsma(); }
    };
    u.onerror = () => { esmaZikirPlaying = false; draw(); };
    try { speechSynthesis.speak(u); } catch (e) {}
  };
  draw();
}

/* -------------------------------------------------------------------
   8) İBADET HATIRLATICILARI
------------------------------------------------------------------- */
function loadReminders() {
  try { return JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || "[]"); }
  catch (e) { return []; }
}
function saveReminders(list) {
  try { localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(list)); } catch (e) {}
}
let lastReminderMinute = null;

function renderHatirlaticilar() {
  const c = $("#livingContent");
  const draw = () => {
    const list = loadReminders();
    c.innerHTML = `
      <div class="card abdest-intro"><p>⏰ <b>İbadet Hatırlatıcıları</b> — Kendi hatırlatıcılarınızı kurun. Uygulama açıkken belirlenen saatte bildirim gelir.</p></div>
      <div class="card">
        <div class="remind-form">
          <input class="setting-input" id="remindText" placeholder="Hatırlatma (örn. Evvabin namazı)" maxlength="80" />
          <div class="remind-form__row">
            <input class="setting-input" id="remindTime" type="time" value="20:00" />
            <button class="btn-ghost" id="remindAdd">Ekle</button>
          </div>
        </div>
      </div>
      <div class="remind-list" id="remindList">
        ${list.length ? list.map((r, i) => `
          <div class="remind-item">
            <div class="remind-item__body">
              <span class="remind-item__text">${r.text}</span>
              <span class="remind-item__time">⏰ ${r.time}</span>
            </div>
            <button class="remind-item__del" data-del="${i}" aria-label="Sil">🗑️</button>
          </div>`).join("") : '<p class="imsakiye__empty">Henüz hatırlatıcı yok.</p>'}
      </div>`;

    c.querySelector("#remindAdd").addEventListener("click", () => {
      const text = c.querySelector("#remindText").value.trim();
      const time = c.querySelector("#remindTime").value;
      if (!text || !time) { showToast("Lütfen metin ve saat girin"); return; }
      const list = loadReminders();
      list.push({ text, time, fired: false });
      saveReminders(list);
      draw();
      showToast("Hatırlatıcı eklendi ⏰");
    });
    c.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const list = loadReminders();
        list.splice(Number(btn.dataset.del), 1);
        saveReminders(list);
        draw();
      });
    });
  };
  draw();
}

/* Gün değişince tüm hatırlatıcıların "fired" bayrağını temizle — ertesi gün tekrar çalsın */
function resetRemindersFired() {
  const list = loadReminders();
  if (!list.length) return;
  let changed = false;
  list.forEach((r) => { if (r.fired) { r.fired = false; changed = true; } });
  if (changed) saveReminders(list);
}

function checkReminders() {
  const now = new Date();
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (lastReminderMinute === hm) return;
  lastReminderMinute = hm;
  const list = loadReminders();
  let changed = false;
  list.forEach((r) => {
    if (r.time === hm && !r.fired) {
      r.fired = true;
      changed = true;
      showToast(`⏰ ${r.text}`);
      notifyUser("Mihrap Hatırlatıcı", r.text, { tag: `mihrap-reminder-${r.time}`, channelId: "hatirlatma" });
    }
  });
  if (changed) saveReminders(list);
}

/* — Zikirmatik — */
function renderTasbih() {
  const c = $("#livingContent");
  tasbihCount = 0;
  c.innerHTML = `
    <div class="tasbih">
      <div class="tasbih__phrases" id="tasbihPhrases">
        ${DHIKR_PHRASES.map((p, i) => `<button class="tasbih__phrase ${i === 0 ? "tasbih__phrase--active" : ""}" data-i="${i}">${p.tr}</button>`).join("")}
      </div>

      <div class="tasbih__display">
        <span class="tasbih__ar" dir="rtl" id="tasbihAr">${DHIKR_PHRASES[0].ar}</span>
        <span class="tasbih__meaning" id="tasbihMeaning">${DHIKR_PHRASES[0].meaning}</span>
      </div>

      <div class="tasbih__target">
        ${[33, 99, 999].map((t) => `<button class="tasbih__target-btn ${t === tasbihTarget ? "tasbih__target-btn--active" : ""}" data-t="${t}">${t}</button>`).join("")}
      </div>

      <button class="tasbih__counter" id="tasbihCounter">
        <span class="tasbih__count" id="tasbihCount">0</span>
        <span class="tasbih__of" id="tasbihOf">/ ${tasbihTarget}</span>
      </button>

      <button class="btn-ghost" id="tasbihReset">Sıfırla</button>
    </div>`;

  const updateDisplay = () => {
    $("#tasbihCount").textContent = tasbihCount;
    $("#tasbihOf").textContent = `/ ${tasbihTarget}`;
    if (tasbihCount >= tasbihTarget && tasbihTarget > 0) {
      $("#tasbihCounter").classList.add("tasbih__counter--done");
      if (navigator.vibrate) navigator.vibrate([40, 40, 40, 40, 80]);
    } else {
      $("#tasbihCounter").classList.remove("tasbih__counter--done");
    }
  };

  c.querySelectorAll(".tasbih__phrase").forEach((b) => {
    b.addEventListener("click", () => {
      tasbihPhraseIdx = Number(b.dataset.i);
      c.querySelectorAll(".tasbih__phrase").forEach((x) => x.classList.remove("tasbih__phrase--active"));
      b.classList.add("tasbih__phrase--active");
      $("#tasbihAr").textContent = DHIKR_PHRASES[tasbihPhraseIdx].ar;
      $("#tasbihMeaning").textContent = DHIKR_PHRASES[tasbihPhraseIdx].meaning;
      tasbihCount = 0;
      updateDisplay();
    });
  });

  c.querySelectorAll(".tasbih__target-btn").forEach((b) => {
    b.addEventListener("click", () => {
      tasbihTarget = Number(b.dataset.t);
      c.querySelectorAll(".tasbih__target-btn").forEach((x) => x.classList.remove("tasbih__target-btn--active"));
      b.classList.add("tasbih__target-btn--active");
      updateDisplay();
    });
  });

  $("#tasbihCounter").addEventListener("click", () => {
    tasbihCount++;
    if (navigator.vibrate) navigator.vibrate(12);
    updateDisplay();
  });

  $("#tasbihReset").addEventListener("click", () => {
    tasbihCount = 0;
    updateDisplay();
  });
}

/* — Zekât Hesaplama (canlı altın/gümüş fiyatı ile) — */
const METAL_DEFAULTS = { gold: 3200, silver: 45 };
const fmtTL = (x) => Math.round(x).toLocaleString("tr-TR");

function loadSavedMetalPrices() {
  try {
    const s = localStorage.getItem(METAL_PRICES_KEY);
    if (s) {
      const p = JSON.parse(s);
      if (p && typeof p.gold === "number") return p;
    }
  } catch (e) {}
  return null;
}

function saveMetalPrices(gold, silver, updatedAt) {
  try {
    localStorage.setItem(METAL_PRICES_KEY, JSON.stringify({ gold, silver, updatedAt }));
  } catch (e) {}
}

/* Canlı gram altın/gümüş fiyatı (TL) — ücretsiz finans API */
async function fetchMetalPrices() {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 9000); // 9 sn timeout
    const res = await fetch("https://finans.truncgil.com/v4/today.json", { signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error("HTTP " + res.status);
    let raw = await res.text();
    raw = raw.replace(/,\s*([}\]])/g, "$1"); // olası trailing comma temizliği
    const d = JSON.parse(raw);
    const gold = d.GRA ? (Number(d.GRA.Selling) || Number(d.GRA.Buying)) : null;
    const silver = d.GUMUS ? (Number(d.GUMUS.Selling) || Number(d.GUMUS.Buying)) : null;
    if (gold && silver) {
      const updatedAt = d.Update_Date || new Date().toLocaleString("tr-TR");
      state.goldPrice = gold;
      state.silverPrice = silver;
      state.metalUpdatedAt = updatedAt;
      saveMetalPrices(gold, silver, updatedAt);
      return { gold, silver, updatedAt };
    }
    throw new Error("veri eksik");
  } catch (e) {
    console.warn("[Mihrap] Metal fiyat API hatası:", e.message);
    return null;
  }
}

function renderZakat() {
  const c = $("#livingContent");

  // Son bilinen fiyatları yükle (API çalışmazsa offline yedek)
  if (state.goldPrice == null) {
    const saved = loadSavedMetalPrices();
    if (saved) {
      state.goldPrice = saved.gold;
      state.silverPrice = saved.silver;
      state.metalUpdatedAt = saved.updatedAt || null;
    }
  }
  const goldInit = state.goldPrice != null ? state.goldPrice : METAL_DEFAULTS.gold;
  const silverInit = state.silverPrice != null ? state.silverPrice : METAL_DEFAULTS.silver;
  const updTxt = state.metalUpdatedAt
    ? `Son güncelleme: ${state.metalUpdatedAt}`
    : "Canlı fiyat yükleniyor…";

  c.innerHTML = `
    <div class="zakat">
      <p class="zakat__intro">Zekât, nisap miktarına ulaşan malın <b>%2,5</b>'idir. Nisap yaklaşık <b>85 gram altın</b> değeridir.</p>

      <div class="metal-live">
        <div class="metal-live__row"><span>🥇 Gram Altın</span><b>${fmtTL(goldInit)} TL</b></div>
        <div class="metal-live__row"><span>🥈 Gram Gümüş</span><b>${fmtTL(silverInit)} TL</b></div>
        <div class="metal-live__foot">
          <span id="metalUpdated">${updTxt}</span>
          <button class="metal-live__refresh" id="metalRefresh" type="button">🔄 Yenile</button>
        </div>
      </div>

      <div class="zakat__form">
        <label class="zakat__field"><span>💰 Nakit (TL)</span><input type="number" id="zNakit" inputmode="decimal" placeholder="0" value="0" min="0" /></label>
        <label class="zakat__field"><span>🥇 Altın (gram)</span><input type="number" id="zAltin" inputmode="decimal" placeholder="0" value="0" min="0" /></label>
        <label class="zakat__field"><span>🥈 Gümüş (gram)</span><input type="number" id="zGumus" inputmode="decimal" placeholder="0" value="0" min="0" /></label>
        <label class="zakat__field"><span>🏪 Ticaret malı (TL)</span><input type="number" id="zTicaret" inputmode="decimal" placeholder="0" value="0" min="0" /></label>
        <label class="zakat__field"><span>🏦 Borçlar (TL, düşülür)</span><input type="number" id="zBorc" inputmode="decimal" placeholder="0" value="0" min="0" /></label>
        <label class="zakat__field"><span>🥇 Altın gram fiyatı (TL)</span><input type="number" id="zAltinFiyat" inputmode="decimal" placeholder="0" value="${goldInit}" min="0" /></label>
        <label class="zakat__field"><span>🥈 Gümüş gram fiyatı (TL)</span><input type="number" id="zGumusFiyat" inputmode="decimal" placeholder="0" value="${silverInit}" min="0" /></label>
      </div>

      <button class="btn-gold" id="zakatCalc">Zekâtı Hesapla</button>

      <div class="zakat__result" id="zakatResult" hidden></div>
      <p class="quran__note">Fiyatlar bilgilendirme amaçlıdır ve canlı piyasadan alınır. Hesaplama tahminidir; kesin bilgi için bir din âlimine danışınız.</p>
    </div>`;

  const applyLive = (gold, silver) => {
    const g = $("#zAltinFiyat"), s = $("#zGumusFiyat");
    if (g) g.value = gold;
    if (s) s.value = silver;
    const upd = $("#metalUpdated");
    if (upd) upd.textContent = `Son güncelleme: ${state.metalUpdatedAt || new Date().toLocaleString("tr-TR")}`;
    // Canlı fiyat rozetini de güncelle
    const rows = c.querySelectorAll(".metal-live__row b");
    if (rows[0]) rows[0].textContent = `${fmtTL(gold)} TL`;
    if (rows[1]) rows[1].textContent = `${fmtTL(silver)} TL`;
  };

  const refresh = async () => {
    const btn = $("#metalRefresh");
    if (btn) { btn.disabled = true; btn.textContent = "⏳"; }
    const p = await fetchMetalPrices();
    if (btn) { btn.disabled = false; btn.textContent = "🔄 Yenile"; }
    if (p) applyLive(p.gold, p.silver);
    else showToast("Fiyat alınamadı — son bilinen fiyatlar kullanılıyor");
  };
  $("#metalRefresh").addEventListener("click", refresh);

  // İlk açılışta canlı fiyatı sessizce çek (başarısızsa mevcut değer kalır)
  if (state.metalUpdatedAt == null) refresh();

  $("#zakatCalc").addEventListener("click", () => {
    const n = (id) => Math.max(0, parseFloat($(id).value) || 0);
    const nakit = n("#zNakit"), altin = n("#zAltin"), gumus = n("#zGumus");
    const ticaret = n("#zTicaret"), borc = n("#zBorc");
    const altinFiyat = n("#zAltinFiyat"), gumusFiyat = n("#zGumusFiyat");

    const altinDeger = altin * altinFiyat;
    const gumusDeger = gumus * gumusFiyat;
    const toplam = nakit + altinDeger + gumusDeger + ticaret - borc;
    const nisap = 85 * (altinFiyat || METAL_DEFAULTS.gold);
    const zekat = toplam >= nisap ? toplam * 0.025 : 0;

    $("#zakatResult").hidden = false;
    $("#zakatResult").innerHTML = `
      <div class="zakat__rows">
        <div class="zakat__row"><span>Toplam mal varlığı</span><b>${fmtTL(toplam)} TL</b></div>
        <div class="zakat__row"><span>Nisap (85 gr altın)</span><b>${fmtTL(nisap)} TL</b></div>
        <div class="zakat__row zakat__row--final"><span>Ödenecek zekât</span><b>${fmtTL(zekat)} TL</b></div>
      </div>
      ${toplam < nisap ? '<p class="zakat__nona">Mal varlığınız nisap miktarının altında olduğu için zekât yükümlülüğü yoktur.</p>' : ""}`;
  });
}

/* -------------------------------------------------------------------
   18) AI ASİSTAN — Google Gemini (yalnızca dini sorular)
------------------------------------------------------------------- */
function aiFormat(text) {
  let s = String(text)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  s = s.replace(/\n/g, "<br>");
  return s;
}

function saveAIHistory() {
  try {
    if (state.aiHistory.length > 24) state.aiHistory = state.aiHistory.slice(-24);
    localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(state.aiHistory));
  } catch (e) {}
}

function appendTyping() {
  const box = $("#aiMessages");
  if (!box) return;
  const el = document.createElement("div");
  el.className = "ai-msg ai-msg--bot ai-msg--typing";
  el.id = "aiTyping";
  el.innerHTML = `<div class="ai-msg__avatar">✨</div><div class="ai-msg__bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}
function removeTyping() {
  const el = $("#aiTyping");
  if (el) el.remove();
}

function renderAIChat() {
  const box = $("#aiMessages");
  if (!box) return;

  if (!state.aiHistory.length) {
    box.innerHTML = `
      <div class="ai-msg ai-msg--bot">
        <div class="ai-msg__avatar">✨</div>
        <div class="ai-msg__bubble">Selâmün aleyküm! Ben Mihrap'ın dini soru asistanıyım. <b>Yalnızca İslam ile ilgili</b> sorularınızı yanıtlarım — namaz, oruç, zekât, hac, Kur'an, hadis, itikat ve günlük hayata dair dini hükümler. Size nasıl yardımcı olabilirim?</div>
      </div>`;
  } else {
    box.innerHTML = state.aiHistory.map((m) =>
      m.role === "user"
        ? `<div class="ai-msg ai-msg--user"><div class="ai-msg__bubble">${aiFormat(m.text)}</div></div>`
        : `<div class="ai-msg ai-msg--bot"><div class="ai-msg__avatar">✨</div><div class="ai-msg__bubble">${aiFormat(m.text)}</div></div>`
    ).join("");
  }
  box.scrollTop = box.scrollHeight;
}

async function callGemini() {
  const contents = state.aiHistory.slice(-12).map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  // Kullanıcı kendi anahtarını girdiyse doğrudan Gemini'yi kullan (BYOK),
  // aksi hâlde sunucu proxy'si üzerinden anahtarsız çağır.
  if (state.aiKey.trim()) {
    const key = state.aiKey.trim();
    let lastErr = "Uygun model bulunamadı";
    for (const model of GEMINI_MODELS) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
              contents,
              generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
            }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          const text = ((data && data.candidates && data.candidates[0] &&
            data.candidates[0].content && data.candidates[0].content.parts) || [])
            .map((p) => p.text || "").join("").trim();
          if (text) return text;
          lastErr = "Model boş yanıt döndürdü";
          continue;
        }
        const err = await res.json().catch(() => ({}));
        const msg = (err && err.error && err.error.message) || ("HTTP " + res.status);
        lastErr = msg;
        if (/no longer available|not found|deprecated|retired|does not exist/i.test(msg)) continue;
        throw new Error(msg);
      } catch (e) {
        if (e && e.message && !/no longer available|not found|deprecated|retired|does not exist/i.test(e.message)) throw e;
        lastErr = (e && e.message) || lastErr;
      }
    }
    throw new Error(lastErr);
  }

  // APK'da göreli yol çalışmaz; mutlak adres varsa onu kullan
  const proxy = (native() && AI_PROXY_ABS_URL) ? AI_PROXY_ABS_URL : AI_PROXY_URL;
  const res = await fetch(proxy, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
  if (!data.text) throw new Error("Model boş yanıt döndürdü");
  return data.text;
}

async function sendAIQuestion() {
  if (state.aiBusy) return;
  const input = $("#aiInput");
  const text = input.value.trim();
  if (!text) return;

  input.value = "";
  state.aiHistory.push({ role: "user", text });
  saveAIHistory();
  renderAIChat();
  appendTyping();

  state.aiBusy = true;
  try {
    const reply = await callGemini();
    removeTyping();
    state.aiHistory.push({ role: "model", text: reply });
    saveAIHistory();
    renderAIChat();
  } catch (e) {
    removeTyping();
    const hint = !state.aiKey.trim()
      ? " Anahtarsız mod sunucuda (Netlify/Vercel) çalışır; bu ortamda proxy bulunamadıysa yayınlanmış sürümü kullanın veya Ayarlar'dan kendi Gemini anahtarınızı girin."
      : " Lütfen anahtarınızı kontrol edip tekrar deneyin.";
    state.aiHistory.push({ role: "model", text: "Üzgünüm, bir hata oluştu: " + e.message + hint });
    renderAIChat();
  }
  state.aiBusy = false;
}

function initAI() {
  try { state.aiKey = localStorage.getItem(AI_KEY_STORAGE_KEY) || ""; } catch (e) {}
  try {
    const h = localStorage.getItem(AI_HISTORY_KEY);
    if (h) state.aiHistory = JSON.parse(h);
    if (!Array.isArray(state.aiHistory)) state.aiHistory = [];
  } catch (e) { state.aiHistory = []; }

  const input = $("#aiInput");
  const send = $("#aiSend");
  if (!input || !send) return;

  const doSend = () => sendAIQuestion();
  send.addEventListener("click", doSend);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSend(); });

  renderAIChat();
}
