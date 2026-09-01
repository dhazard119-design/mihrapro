/* ===================================================================
   MİHRAP — Service Worker
   - Çevrimdışı çalışma (çekirdek varlıklar + API içeriği önbelleğe alınır)
   - Vakit/Kur'an API istekleri için network-first (güncel veri, yedekli)
   - Arka plan senkron (Periodic Background Sync, destekleyen tarayıcılar)
   - Push bildirim desteği (sunucu bağlanınca hazır)
   - Bildirim tıklama + güncelleme akışı
   =================================================================== */

const CACHE_VERSION = "mihrap-v2";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/app.js",
  "/js/capacitor-bridge.js",
  "/js/ezan-audio.js",
  "/data/content.js",
  "/data/locations.js",
  "/manifest.webmanifest",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/icon-maskable-512.png",
  "/assets/apple-touch-icon.png",
];

/* — Kurulum: çekirdek varlıkları önbelleğe al — */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* — Aktivasyon: eski önbellekleri temizle — */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* — İstemciden gelen mesajlar (güncelleme, skip waiting) — */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* — Fetch stratejisi — */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // API istekleri: network-first (güncel veri), çevrimdışıyken önbellekten
  if (
    url.hostname.includes("api.aladhan.com") ||
    url.hostname.includes("api.alquran.cloud") ||
    url.hostname.includes("nominatim") ||
    url.hostname.includes("overpass-api") ||
    url.hostname.includes("overpass.kumi.systems")
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Tilavet sesleri: önce çal, yoksa ağdan al ve önbelleğe koy
  if (url.hostname.includes("cdn.islamic.network")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Statik varlıklar: cache-first, bulunamazsa ağ
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    // Çevrimdışı: HTML istekleri için ana sayfaya düş
    if (request.mode === "navigate") {
      const fallback = await cache.match("/index.html");
      if (fallback) return fallback;
    }
    throw e;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const res = await fetch(request);
    if (res.ok) {
      // Yalnızca başarılı yanıtları önbelleğe al
      cache.put(request, res.clone());
    }
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

/* — Bildirim tıklama: uygulamayı aç/odakla — */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.registration.scope));
        if (existing) return existing.focus();
        return self.clients.openWindow("/");
      })
  );
});

/* ===================================================================
   PUSH BİLDİRİM — arka plan ezan bildirimi
   -------------------------------------------------------------------
   Tarayıcı tamamen kapalıyken ezan bildirimi gönderebilmek için bir
   push servisi (FCM/OneSignal veya VAPID anahtarlı kendi sunucunuz)
   gerekir. Bu handler hazır: sunucu push gönderdiğinde bildirim görünür.
   =================================================================== */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {
    data = { title: "Mihrap", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Mihrap";
  const opts = {
    body: data.body || "",
    icon: data.icon || "/assets/icon-192.png",
    badge: data.badge || "/assets/icon-192.png",
    tag: data.tag || "mihrap-push",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true })
      .then((sub) => console.log("[Mihrap] Yeni push aboneliği:", sub))
      .catch((e) => console.warn("[Mihrap] Push yeniden abonelik hatası:", e))
  );
});

/* ===================================================================
   ARKA PLAN SENKRON — Periodic Background Sync
   -------------------------------------------------------------------
   Uygulama arka plandayken bile günlük içeriği/vakitleri tazelemek için.
   Yalnızca yüklü (installed) PWA'larda ve destekleyen tarayıcılarda
   (Chromium) çalışır; diğer tarayıcılarda sessizce yok sayılır.
   =================================================================== */
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "mihrap-daily") {
    event.waitUntil(refreshDailyData());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "mihrap-daily") {
    event.waitUntil(refreshDailyData());
  }
});

/* Günlük veriyi arka planda tazele (en iyi çaba): istemcilere haber ver */
async function refreshDailyData() {
  try {
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) => {
      client.postMessage({ type: "DAILY_REFRESH" });
    });
  } catch (e) { /* istemci yoksa sorun değil */ }
}
