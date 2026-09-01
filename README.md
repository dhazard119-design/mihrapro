# 🕌 Mihrap — Ezan Vakti & İslami Yaşam

Türkiye odaklı, **premium ve ultra-lüks** hissiyatına sahip, mobil-öncelikli bir İslami yaşam uygulaması. Saf **HTML + CSS + Vanilla JavaScript** ile yazıldı — framework yok, bağımlılık yok. PWA olarak kurulabilir, ileride **Capacitor** ile native (Android/iOS) uygulamaya dönüştürülmeye hazır.

---

## ✨ Özellikler

| # | Modül | Açıklama |
|---|---|---|
| 1 | 📍 Konum | İl → İlçe → Köy seçimi (81 il, 957 ilçe, koordinatlı) + GPS |
| 2 | 🕌 Vakitler | Diyanet uyumlu (Aladhan API, `method=13`) + çevrimdışı yedek |
| 3 | 🌗 Tema | Saate göre 5 tema (sisli mavi → gün batımı → yıldızlı gece), crossfade |
| 4 | ⏱️ Geri sayım | SVG dairesel sayaç + 5 vakit listesi + aylık takvim |
| 5 | 🧭 Kıble | Cihaz pusulası + Kâbe açısı + km uzaklık |
| 6 | 📖 İçerik | Günlük Hadis / Sünnet / Esma (yılın gününe göre otomatik döner) |
| 7 | ✨ 99 Esma + 📜 30 Kıssa | Tam liste, arama, detay modalı |
| 8 | 📲 Paylaşım | Canvas ile premium görsel kart + Web Share (uygulama adı + link) |
| 9 | 🔔 Ezan bildirimi | Opsiyonel; vakit gelince ses + bildirim (Ayarlar'dan açılır) |
| 10 | 🔊 Sesli okuma | Arapça + Türkçe (Web Speech API) |
| 11 | 📱 PWA | Manifest + service worker + ikonlar, "Ana ekrana ekle" |
| 12 | 🌙 Özel günler | Cuma, kandiller, bayramlar, Ramazan + İmsakiye tablosu |
| 13 | 🤲 Ramazan Modu | Sahur/iftar geri sayımı, hatim takibi, günlük dualar |
| 14 | 🕌 İslamı Yaşamak | Kur'an (AR+TR), en yakın cami, namaz rehberi, zikirmatik, zekât, kıble |
| 15 | ✨ AI Asistan | Dini soru-cevap (Gemini); yalnızca İslam konularına cevap verir, anahtarsız (sunucu proxy) |

---

## 📱 Android Widget

Ana ekran **"Mihrap Vakitleri" widget'ı** için native Kotlin/XML kaynakları hazır
(`android-widget/` klasörü). Kurulum adımları: **`WIDGET.md`**.

---

## 📁 Dosya Yapısı

```
ezan-app/
├── index.html            → Ana ekran + 6 ekran (SPA mantığı)
├── manifest.webmanifest  → PWA tanımı + kısayollar
├── sw.js                 → Service worker (çevrimdışı + bildirim tıklama)
├── css/style.css         → Premium tema (glassmorphism + altın/zümrüt)
├── js/app.js             → Tüm uygulama mantığı
├── js/capacitor-bridge.js → Native köprü (APK'da Capacitor, tarayıcıda web API)
├── js/ezan-audio.js      → Gömülü Ayasofya ezan kaydı (base64)
├── data/
│   ├── content.js        → 60 hadis, 20 sünnet, 99 esma, 30 kıssa, 5 kandil mesajı
│   ├── content.json      → Aynı veri (JSON, dokümantasyon için)
│   ├── locations.js      → 81 il + 957 ilçe (gömülü, koordinatlı)
│   └── locations.json    → Aynı veri (JSON)
├── assets/
│   ├── icon-192.png / icon-512.png / icon-maskable-512.png
│   ├── apple-touch-icon.png
│   └── og-image.png      → Sosyal paylaşım önizleme görseli (1200×630)
├── resources/            → APK ikonu + splash (1024×1024 / 2732×2732)
├── android-res/          → APK bildirim sesi (raw/ezan.mp3) + küçük ikon
├── android-widget/       → Ana ekran widget kaynakları (Kotlin + XML)
├── scripts/              → Otomasyon (prepare-www, android-res, manifest, zip)
├── netlify.toml / vercel.json → Deploy başlık yapılandırması
├── netlify/functions/gemini.js → AI asistan proxy'si (Netlify Function)
├── api/gemini.js              → AI asistan proxy'si (Vercel Function)
├── robots.txt / sitemap.xml   → SEO
└── README.md
```

> **Tek dosyalık sürüm:** `mihrap.html` (proje kökünde) — CSS, JS ve veriler satır içi gömülü. İndirip çift tıklayınca çalışır. PWA manifest/SW tek dosyada çalışmaz; tam PWA için `ezan-app/` klasörünü sunucuda barındır.

---

## ⚙️ Yayınlamadan Önce Güncelle (kritik)

Aşağıdaki **alan adı referanslarını** gerçek linkinle değiştir:

| Yer | Ne değişecek |
|---|---|
| `js/app.js` → `APP_URL` | Paylaşım kartındaki "İndir:" linki |
| `js/app.js` → `ADHAN_URL` | (İsteğe bağlı) Gerçek ezan MP3 linki |
| `index.html` → `og:url`, `og:image`, `canonical`, `twitter:image` | Sosyal önizleme URL'leri |
| `robots.txt` + `sitemap.xml` | Site haritası URL'i |

Hızlı arama: tüm dosyalarda `mihrap.app` metnini ara → gerçek alan adınla değiştir.

---

## 🚀 Yayınlama (Deploy)

### Seçenek A — Netlify (önerilen, en kolay)
1. [netlify.com](https://www.netlify.com)'a git → **"Add new site" → "Deploy manually"**
2. `ezan-app/` klasörünü sürükle-bırak → birkaç saniyede yayında
3. HTTPS, CDN ve PWA kurulumu otomatik gelir
4. (İsteğe bağlı) Alan adını bağla: Site settings → Domain management

### Seçenek B — Vercel
1. `vercel.com` → **New Project** → `ezan-app/` klasörünü seç
2. Framework: **Other**, build command boş, output directory: `.`

### Seçenek C — GitHub Pages
1. `ezan-app/` içeriğini bir GitHub repo'suna push et
2. Settings → Pages → branch'i seç → kaydet

### Yerelde çalıştırma (test için)
```bash
cd ezan-app
python3 -m http.server 8080
# → http://localhost:8080
```
> **Not:** Service worker ve bazı API'ler `https` veya `localhost` gerektirir. `file://` ile açarsan uygulama yedek verilerle çalışır ama PWA/SW devre dışı kalır.

---

## ✨ AI Asistan (dini soru-cevap)

AI asistanı **Google Gemini** kullanır ve **herkes anahtarsız** kullanır — API anahtarı sunucuda gizli tutulur. Asistan, sistem talimatıyla **yalnızca İslam ile ilgili sorulara** cevap verir (dini olmayan soruları reddeder).

### Kurulum (1 dakika, ücretsiz)

1. **aistudio.google.com** → Google hesabınla giriş yap → **"Get API key"** → **"Create API key"** (ücretsiz, kredi kartı istemez)
2. Anahtarı bir **ortam değişkeni** olarak ekle:
   - **Netlify:** Site → **Environment variables** → Add → Key: `GEMINI_API_KEY`, Value: (anahtarın)
   - **Vercel:** Project → **Settings → Environment Variables** → Key: `GEMINI_API_KEY`, Value: (anahtarın)
3. Yeniden deploy et. Hepsi bu.

> `netlify/functions/gemini.js` ve `api/gemini.js` dosyaları hazır; `/api/gemini` yolunu her iki platform da kullanır.

### Opsiyonel: kullanıcının kendi anahtarı (BYOK)

Kullanıcı **Ayarlar → AI Asistan** kısmına kendi Gemini anahtarını girerse, uygulama sunucu yerine o anahtarı kullanır. Boş bırakılırsa sunucu proxy'si devreye girer. Bu, tek dosyalık `mihrap.html` sürümünde AI'ı kullanmanın da yoludur.

> **Not:** Tek dosyalık `mihrap.html`'de sunucu proxy'si yoktur (dosya olarak açılır). Orada AI'ı kullanmak için yukarıdaki BYOK yöntemi gerekir.

---

## 🔔 Arka Plan Ezan Bildirimi (push)

Şu an bildirim **uygulama açıkken** tetiklenir. Uygulama **tamamen kapalıyken** bildirim için bir **push servisi** gerekir. Kod tarafı hazır — sadece **OneSignal App ID** gerekli:

### OneSignal Kurulumu (adım adım)
1. [onesignal.com](https://onesignal.com)'da ücretsiz hesap aç → **New App/Website** → **Web Push** seç
2. Site adını (`Mihrap`) ve URL'ni gir → **App ID**'yi kopyala (ör. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
3. `js/app.js` içindeki sabiti doldur:
   ```js
   const ONESIGNAL_APP_ID = "buraya-app-id";
   ```
4. `index.html` içindeki şu satırın başındaki yorum işaretini kaldır:
   ```html
   <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
   ```
5. OneSignal panelinde **Auto Resubscribe**'ı aç (kullanıcılar otomatik yeniden abone olur)
6. İsteğe bağlı: OneSignal'da **"Triggered Messages"** ile vakit API'ni çağıran bir sunucu/otomasyon kur → vakit geldiğinde herkese bildirim gönderilir

> **Alternatif:** Kendi VAPID anahtarlı push sunucun. `sw.js` içinde `push` ve `pushsubscriptionchange` kancaları hazır.

### Not
Push bildirim, kullanıcının **cihazı/uygulaması kapalı olsa bile** çalışır — bu, "uygulama açıkken" tetiklenen mevcut bildirimden farklıdır ve gerçek mobil deneyimin anahtarıdır.

---

## 📱 Mobil Uygulamaya Dönüştürme (Capacitor)

Bu kod, native bir uygulamanın çekirdeğidir. Tüm hazırlıklar (native köprü, bildirim planlama,
ikon, splash, bildirim sesi, widget, otomasyon scriptleri) **zaten yapıldı ve test edildi**.
Sarmalamak için:

```bash
cd ezan-app
npm install            # bağımlılıklar (Capacitor + eklentiler)
npm run add:android    # android/ projesi + native kaynaklar + manifest
npm run assets         # APK ikonu + splash üret
npm run sync           # web dosyalarını senkronize et
npm run build:apk      # debug APK üret
```

Ayrıntılı adım adım rehber: **`ANDROID_APK.md`** · APK öncesi hazırlık listesi ve test
planı: **`ANDROID_CHECKLIST.md`** · Ana ekran widget'ı: **`WIDGET.md`**.

APK'da çalışanlar: ezan bildirimi (uygulama kapalıyken bile), ezan sesi, kıble/cami (GPS),
AI (BYOK), ana ekran widget'ı, donanım geri butonu, splash ekran.

---

## 🛠️ Teknoloji

- **Veri:** [Aladhan API](https://aladhan.com) (Diyanet uyumlu vakitler, Hicri takvim, İmsakiye) + [Nominatim](https://nominatim.org) (köy koordinatları)
- **Fontlar:** Google Fonts — Amiri (kaligrafi), Reem Kufi (Kufi), Cormorant Garamond (serif), Manrope (UI)
- **Grafik:** Canvas (paylaşım kartı), SVG (geri sayım halkası), Web Audio (ezan nağmesi), Web Speech (sesli okuma)

---

## ⚖️ Lisans / Kullanım Notu

Kod kişisel/kurumsal projen için kullanılabilir. Yayınlamadan önce:
- **İçerik** (hadis, sünnet, esma, kıssalar) kaynaklarıyla birlikte sunulmuştur; dilersen dini otoritelerden doğrulat.
- **Ezan sesi** için telifsiz/izinli bir kayıt kullan (`ADHAN_URL`).
- **Nominatim** yoğun kullanımda politika gereği sınırlandırılmıştır; üretimde kendi coğrafi verinle veya önbellekle değiştir.

---

*Mihrap — bereketli bir proje olması duasıyla. 🤲✨*
