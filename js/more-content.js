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

async function renderDiniGunler() {
  const c = $("#livingContent");
  c.innerHTML = `<div class="quran__loading">Yaklaşan dini günler hesaplanıyor...</div>`;

  let h = state.hijri;
  if (!h) h = await fetchHijriToday();
  if (!h) { c.innerHTML = '<div class="quran__loading">Hicri tarih alınamadı.</div>'; return; }

  // Bugünün hicri (gün, ay, yıl) değerini tek değere çevir
  const hToday = h.year * 1000 + h.month * 50 + h.day;

  const rows = [];
  for (const ev of DINIGUNLER) {
    // Aynı ay + sonraki gün → bu yıl; değilse gelecek yıl ara
    let y = h.year;
    let m = ev.month;
    // Regaib özel: Recep ilk Cuma
    if (ev.day === 0) {
      // yaklaşık: Recep 1'i al, ilk cumaya götürür
      const keyThis = y * 1000 + m * 50 + 1;
      if (keyThis < hToday) y += 1;
      let approx = null;
      try {
        const res = await fetch(`https://api.aladhan.com/v1/hToG/1-${m}-${y}`);
        if (res.ok) {
          const d = (await res.json()).data;
          const gd = new Date(`${d.hijri.date} `);
          // weekday en kısa: gregorian date parse
          const gdate = new Date(`${d.gregorian.day}-${d.gregorian.month.number}-${d.gregorian.year}`);
          const wd = gdate.getDay(); // 0=Pazar ... 5=Cuma
          const add = (5 - wd + 7) % 7;
          gdate.setDate(gdate.getDate() + add);
          approx = { g: gdate, hijriDay: 1 };
        }
      } catch (e) {}
      if (approx) {
        rows.push({ ...ev, date: approx.g, day: "ilk Cuma" });
      }
      continue;
    }
    let key = y * 1000 + m * 50 + ev.day;
    if (key < hToday) { y += 1; key = y * 1000 + m * 50 + ev.day; }
    try {
      const res = await fetch(`https://api.aladhan.com/v1/hToG/${ev.day}-${m}-${y}`);
      if (res.ok) {
        const d = (await res.json()).data;
        const gdate = new Date(`${d.gregorian.day}-${d.gregorian.month.number}-${d.gregorian.year}`);
        rows.push({ ...ev, date: gdate });
      }
    } catch (e) {}
  }

  rows.sort((a, b) => a.date - b.date);
  const now = new Date();
  const dayLabel = (dt) => {
    const diff = Math.ceil((dt - now) / 86400000);
    if (diff <= 0) return "Bugün";
    if (diff === 1) return "Yarın";
    return `${diff} gün kaldı`;
  };
  const fmt = (dt) => new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(dt);

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
      try {
        if (Notification && Notification.permission === "granted") {
          new Notification("Mihrap Hatırlatıcı", { body: r.text });
        }
      } catch (e) {}
    }
  });
  if (changed) saveReminders(list);
}
