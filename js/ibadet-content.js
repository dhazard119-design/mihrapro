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
