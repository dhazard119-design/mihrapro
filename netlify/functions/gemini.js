// ===================================================================
// Mihrap — Google Gemini proxy (Netlify Function)
// -------------------------------------------------------------------
// Kullanıcının sorusunu alır, sunucudaki GEMINI_API_KEY ile Gemini'ye
// iletir ve yalnızca metin döndürür. Böylece anahtar tarayıcıya hiç
// sızmaz ve herkes anahtarsız kullanır.
//
// KURULUM (Netlify):
//   1) aistudio.google.com → "Get API key" ile ücretsiz anahtar al.
//   2) Netlify panelinde: Site → "Environment variables"
//      → "Add a variable" → Key: GEMINI_API_KEY → Value: (anahtarın)
//   3) Yeniden deploy et. Hepsi bu.
// ===================================================================

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Yalnızca dini sorulara cevap veren sistem talimatı (sunucuda sabitlenir,
// böylece istemciden değiştirilemez).
const SYSTEM_PROMPT = [
  "Sen, 'Mihrap' adlı İslami yaşam uygulamasının dini soru-cevap asistanısın.",
  "YALNIZCA ve YALNIZCA İslam dini ile ilgili sorulara cevap verirsin. Kapsam: Kur'an-ı Kerim, tefsir, hadis, sünnet, siyer (Peygamber hayatı), fıkıh, itikat (inanç), ibadetler (namaz, oruç, zekât, hac, umre, abdest, gusül, tesettür), dua, zikir, ahlak, aile ve evlilik hayatı, helal-haram, faiz, ticaret ahlakı, kandil ve bayramlar, mezhepler arası farklar gibi konular.",
  "Dini OLMAYAN herhangi bir soru gelirse (spor, siyaset, teknoloji, matematik, programlama, hava durumu, tıbbi teşhis, yemek tarifi, kişisel/finansal tavsiye vb.) kibarca ama net biçimde reddet ve soruyu İslam ile ilgili bir konuya yönlendir.",
  "Cevaplarında Kur'an ayetlerine ve sahih hadislere dayan; Diyanet İşleri Başkanlığı'nın genel görüşüne uygun ol; varsa mezhep farklılıklarını saygılı şekilde belirt.",
  "Emin olmadığın veya ihtilaflı bir konuda kesin hüküm verme; 'Kesin bilgi için bir din âlimine veya Diyanet'e danışmanız doğru olur.' şeklinde uyar.",
  "Kısa, anlaşılır, saygılı ve nazik bir dille Türkçe cevap ver. Gerektiğinde ayet/hadis numarasını kaynağıyla belirt.",
].join("\n");

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const origin = (event.headers && (event.headers.origin || event.headers.referer)) || "";
  if (!originAllowed(origin)) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: "Erişim reddedildi." }) };
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Sunucuda GEMINI_API_KEY ortam değişkeni tanımlı değil." }),
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: "Yalnızca POST desteklenir." }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Geçersiz istek gövdesi." }) };
  }

  const contents = Array.isArray(body.contents) ? body.contents.slice(-12) : [];
  if (!contents.length) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "Soru içeriği eksik." }) };
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`,
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
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || ("HTTP " + r.status);
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: msg }) };
    }

    const text = ((data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map((p) => p.text || "").join("").trim();

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
