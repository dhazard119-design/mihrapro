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
    </div>

    <h3 class="guide-subtitle shafi-title">🟢 Şâfiî Mezhebinde Önemli Farklar</h3>
    <div class="shafi-note">
      <ul>
        <li><span class="shafi-tag">FARK</span><b>Niyet farzdır:</b> Şâfiî'de abdestin farzlarından biri niyettir; yüzü yıkamaya başlarken kalben niyet edilir. Hanefî'de niyet sünnettir.</li>
        <li><span class="shafi-tag">FARK</span><b>Tertip (sıra) farzdır:</b> Uzuvların Kur'an'daki sıraya göre (yüz → kollar → baş → ayaklar) yıkanması farzdır.</li>
        <li><span class="shafi-tag">FARK</span><b>Muvâlât (ara vermemek) farzdır:</b> Uzuvlar, bir önceki kurumadan art arda yıkanmalıdır.</li>
        <li><span class="shafi-tag">BİLGİ</span><b>Farz sayısı 6'dır:</b> Niyet, yüzü yıkamak, kolları yıkamak, başın bir kısmını mesh, ayakları yıkamak ve tertip.</li>
        <li><span class="shafi-tag">BİLGİ</span><b>Mazmaza ve istinşak sünnettir</b> (farz değildir).</li>
      </ul>
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
    </div>

    <h3 class="guide-subtitle shafi-title">🟢 Şâfiî Mezhebinde Önemli Farklar</h3>
    <div class="shafi-note">
      <ul>
        <li><span class="shafi-tag">FARK</span><b>Niyet farzdır:</b> Gusle başlarken kalben niyet edilmelidir.</li>
        <li><span class="shafi-tag">FARK</span><b>Mazmaza ve istinşak sünnettir</b> (farz değildir).</li>
        <li><span class="shafi-tag">FARK</span><b>Bedeni ovmak (delk) farzdır:</b> Suyun her noktaya ulaşması için vücut elle ovulmalıdır.</li>
        <li><span class="shafi-tag">FARK</span><b>Muvâlât (ara vermemek) farzdır.</b></li>
        <li><span class="shafi-tag">BİLGİ</span><b>Kadın saç örgüsünü çözmek zorunda değildir</b> — su saç diplerine ulaşıyorsa örgünün çözülmesi gerekmez.</li>
        <li><span class="shafi-tag">BİLGİ</span><b>Suya engel olan her şey giderilmelidir:</b> Oje, mum, yapıştırıcı gibi cilde su geçirmeyen maddeler.</li>
      </ul>
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
    </div>

    <h3 class="guide-subtitle shafi-title">🟢 Şâfiî Mezhebinde Önemli Farklar</h3>
    <div class="shafi-note">
      <ul>
        <li><span class="shafi-tag">FARK</span><b>Sadece toprak (türâb) geçerlidir:</b> Şâfiî'de teyemmüm yalnızca <b>tozlu, temiz toprak</b> ile yapılır; taş, mermer, kiremit, metal gibi toprak cinsi olmayan yüzeylerle caiz değildir.</li>
        <li><span class="shafi-tag">FARK</span><b>Niyet farzdır.</b></li>
        <li><span class="shafi-tag">FARK</span><b>Tertip farzdır:</b> Önce yüz, sonra kollar mesh edilmelidir.</li>
        <li><span class="shafi-tag">FARK</span><b>Namaz vakti girdikten sonra</b> teyemmüm yapılmalıdır.</li>
      </ul>
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
    </div>

    <h3 class="guide-subtitle shafi-title">🟢 Şâfiî Mezhebinde Önemli Farklar</h3>
    <div class="shafi-note">
      <ul>
        <li><span class="shafi-tag">FARK</span><b>Deri mest şartı:</b> Şâfiî'de mesh, ancak <b>deriden yapılmış</b> (deri mest/khuff) üzerine caizdir. İnce kumaş çoraplar üzerine mesh caiz görülmez.</li>
        <li><span class="shafi-tag">BİLGİ</span><b>Şartlar aynıdır:</b> Abdestli giyilmiş olmalı, topuğu örtmeli, yürünebilir ve su geçirmez olmalıdır.</li>
        <li><span class="shafi-tag">BİLGİ</span><b>Süre aynıdır:</b> Mukim 1 gün 1 gece, yolcu 3 gün 3 gece.</li>
      </ul>
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
    </div>

    <h3 class="guide-subtitle shafi-title">🟢 Şâfiî Mezhebinde Önemli Farklar</h3>
    <div class="shafi-note">
      <ul>
        <li><span class="shafi-tag">FARK</span><b>Kan ve irin abdesti BOZMAZ</b> (Hanefî'de akan kan bozar).</li>
        <li><span class="shafi-tag">FARK</span><b>Kusmak abdesti BOZMAZ</b> (ağız dolusu da olsa).</li>
        <li><span class="shafi-tag">FARK</span><b>Namazda gülmek abdesti bozmaz</b> (namazı bozar, fakat abdest bozulmaz).</li>
        <li><span class="shafi-tag">FARK</span><b>Nâmahreme (yabancı) ten teması abdesti BOZAR:</b> Şehvetle veya şehvetsiz, mahrem olmayan bir kadın/erkeğin tenine dokunmak abdesti bozar.</li>
        <li><span class="shafi-tag">FARK</span><b>Avret yerine dokunmak abdesti BOZAR:</b> Kişinin kendi ön/arka avretine çıplak elle (avuç içiyle) dokunması abdesti bozar.</li>
        <li><span class="shafi-tag">FARK</span><b>Dinden çıkmak (irtidat) abdesti bozar.</b></li>
      </ul>
    </div>`,
};
