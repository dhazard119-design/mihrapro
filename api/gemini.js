// ===================================================================
// Mihrap — Google Gemini proxy (Vercel Serverless Function)
// -------------------------------------------------------------------
// Kullanıcının sorusunu alır, sunucudaki GEMINI_API_KEY ile Gemini'ye
// iletir ve yalnızca metin döndürür. Böylece anahtar tarayıcıya hiç
// sızmaz ve herkes anahtarsız kullanır.
//
// KURULUM (Vercel):
//   1) aistudio.google.com → "Get API key" ile ücretsiz anahtar al.
//   2) Vercel panelinde: Project → Settings → "Environment Variables"
//      → Key: GEMINI_API_KEY → Value: (anahtarın) → Production'a ekle.
//   3) Yeniden deploy et. Hepsi bu.
// ===================================================================

// Birden fazla modeli sırayla deneriz — Google modelleri sık emekliye ayırır.
// GEMINI_MODEL env var'ı ile istediğin tek modeli zorlayabilirsin (örn. "gemini-3.7-flash").
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash",
].filter(Boolean);

const SYSTEM_PROMPT = [
  "Sen, 'Mihrap' adlı İslami yaşam uygulamasının dini soru-cevap asistanısın.",
  "YALNIZCA ve YALNIZCA İslam dini ile ilgili sorulara cevap verirsin. Kapsam: Kur'an-ı Kerim, tefsir, hadis, sünnet, siyer (Peygamber hayatı), fıkıh, itikat (inanç), ibadetler (namaz, oruç, zekât, hac, umre, abdest, gusül, tesettür), dua, zikir, ahlak, aile ve evlilik hayatı, helal-haram, faiz, ticaret ahlakı, kandil ve bayramlar, mezhepler arası farklar gibi konular.",
  "Dini OLMAYAN herhangi bir soru gelirse (spor, siyaset, teknoloji, matematik, programlama, hava durumu, tıbbi teşhis, yemek tarifi, kişisel/finansal tavsiye vb.) kibarca ama net biçimde reddet ve soruyu İslam ile ilgili bir konuya yönlendir.",
  "Cevaplarında Kur'an ayetlerine ve sahih hadislere dayan; Diyanet İşleri Başkanlığı'nın genel görüşüne uygun ol; varsa mezhep farklılıklarını saygılı şekilde belirt.",
  "Emin olmadığın veya ihtilaflı bir konuda kesin hüküm verme; 'Kesin bilgi için bir din âlimine veya Diyanet'e danışmanız doğru olur.' şeklinde uyar.",
  "Kısa, anlaşılır, saygılı ve nazik bir dille Türkçe cevap ver. Gerektiğinde ayet/hadis numarasını kaynağıyla belirt.",
].join("\n");

// Basit kötüye kullanım koruması: yalnızca bilinen kaynaklardan gelen
// istekleri kabul et. Origin yoksa (APK WebView / sunucu-arası) izin ver.
const ALLOWED_ORIGINS = [
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^capacitor:\/\//,
  /(^|\.)netlify\.app$/,
  /(^|\.)vercel\.app$/,
  /(^|\.)mihrap\./,
];

// Kendi alan adınız varsa ALLOWED_ORIGINS ortam değişkenine ekleyin
// (virgülle ayırın, örn. "https://mihrap.com,https://app.mihrap.com").
const _extra = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
for (const o of _extra) { try { ALLOWED_ORIGINS.push(new RegExp(o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); } catch (e) {} }

function originAllowed(origin) {
  if (!origin || origin === "null") return true; // native/curl/sandbox
  if (!/^https?:\/\//.test(origin) && !/^capacitor:\/\//.test(origin)) return true;
  return ALLOWED_ORIGINS.some((re) => re.test(origin));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  if (!originAllowed(req.headers.origin || req.headers.referer)) {
    res.status(403).json({ error: "Erişim reddedildi." });
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(500).json({ error: "Sunucuda GEMINI_API_KEY ortam değişkeni tanımlı değil." });
    return;
  }

  if (req.method !== "POST") { res.status(405).json({ error: "Yalnızca POST desteklenir." }); return; }

  const body = req.body || {};
  const contents = Array.isArray(body.contents) ? body.contents.slice(-12) : [];
  if (!contents.length) { res.status(400).json({ error: "Soru içeriği eksik." }); return; }

  let lastErr = "Uygun model bulunamadı";
  for (const model of MODELS) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
          }),
        }
      );

      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = ((data.candidates && data.candidates[0] &&
          data.candidates[0].content && data.candidates[0].content.parts) || [])
          .map((p) => p.text || "").join("").trim();
        if (text) { res.status(200).json({ text }); return; }
        lastErr = "Model boş yanıt döndürdü";
        continue;
      }

      const msg = (data && data.error && data.error.message) || ("HTTP " + r.status);
      lastErr = msg;
      if (/no longer available|not found|deprecated|retired|does not exist/i.test(msg)) continue;
      res.status(502).json({ error: msg });
      return;
    } catch (e) {
      lastErr = e.message;
    }
  }
  res.status(502).json({ error: lastErr });
  }

