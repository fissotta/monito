/* Sociedad de monos. Cada 10 s nace un mono en un equipo al azar; cuando hay demasiados
 * se desbordan, caminan tapando los textos y caen al "suelo" (borde inferior de la
 * pantalla). Abajo arman una civilizacion que avanza por eras (piedra, fuego, nomadas,
 * sedentarios, colonial, industrial, moderna, espacial) hasta colonizar otro mundo.
 * La historia es distinta en cada corrida: temperamento, hitos y sucesos al azar.
 * Al recargar la pagina todo vuelve a cero.
 * Pruebas: ?turbo=20 acelera el tiempo; ?era=N empieza en esa era; ?do=guerra|cohete|meteorito|ovni|... */
const World = (function () {
  "use strict";
  const A = Zoo.api, LOW = !!A.low, FX_MAX = LOW ? 110 : 240;   // FX_MAX = tope de particulas decorativas
  const NS = "http://www.w3.org/2000/svg";
  const Q = new URLSearchParams(location.search);
  const SKYOFF = Q.get("cielo") === "off";   // ?cielo=off: sin cielo vivo
  const SKYMIN = LOW || Q.get("cielo") === "min";   // TV (o ?cielo=min): solo sol/luna, nubes y pajaros; nada volando a la altura de la civilizacion
  const TURBO = Math.min(60, Math.max(1, parseFloat(Q.get("turbo")) || 1));
  const START_ERA = Math.min(8, Math.max(0, parseInt(Q.get("era"), 10) || 0));
  const SPAWN_S = 10, K = 1.1, GROUND_H = 34, MAX_SPRITES = 34;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const chance = p => Math.random() < p;
  const out3 = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const shuffle = a => a.sort(() => Math.random() - .5);
  function wpick(items, wf) {
    let tot = 0;
    const ws = items.map(i => { const w = Math.max(0, wf(i)); tot += w; return w; });
    if (tot <= 0) return null;
    let r = Math.random() * tot;
    for (let i = 0; i < items.length; i++) if ((r -= ws[i]) <= 0) return items[i];
    return items[items.length - 1];
  }
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // ---------- capa del mundo ----------
  let W = innerWidth, H = innerHeight;
  const floorY = () => H - GROUND_H;
  let SKY = 0;   // borde superior del panel de la civilizacion (0 = sin division, como en el celular)
  const skyH = () => floorY() - SKY, skyY = f => SKY + skyH() * f;
  const svg = el("svg", { id: "world", width: W, height: H }, document.body);
  svg.style.cssText = "position:fixed;left:0;top:0;z-index:30;pointer-events:none;overflow:visible";
  const gSky = el("g", {}, svg), gGround = el("g", {}, svg), gStruct = el("g", {}, svg),
        gMon = el("g", {}, svg), gCrit = el("g", {}, svg), gFx = el("g", {}, svg);
  for (const g of [gGround, gStruct]) { g.style.opacity = 0; g.style.transition = "opacity 1.6s"; }
  const ground = el("rect", { x: 0, width: W, height: GROUND_H, fill: "#8b7b5c" }, gGround);
  ground.style.transition = "fill 2s";
  const grass = el("rect", { x: 0, width: W, height: 4, fill: "rgba(255,255,255,.18)" }, gGround);
  const rails = el("g", { style: "display:none" }, gGround);
  const skyBg = el("g", {}); gSky.insertBefore(skyBg, gSky.firstChild);   // fondo del panel (degradado, estrellas de noche)
  skyBg.innerHTML = `<defs><linearGradient id="skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sky1)"/><stop offset="1" style="stop-color:var(--sky2)"/></linearGradient></defs>` +
    `<rect class="sb" fill="url(#skyg)"/><line class="sl" style="stroke:var(--border)" stroke-width="2"/><g class="stars" style="opacity:var(--stars)"></g>`;
  const dark = el("rect", { x: 0, y: 0, width: W, height: H, fill: "#000", opacity: 0 }, gSky);   // eclipse
  const gPlanets = el("g", {}, gSky); gSky.insertBefore(gPlanets, dark);
  const tint = el("rect", { x: 0, y: 0, width: W, height: H, fill: "#000" }, gSky);   // tono del cielo segun la saga
  tint.style.opacity = 0; tint.style.transition = "opacity 2s";
  const water = el("rect", { x: 0, width: W, height: 0, fill: "#3b7fbf", opacity: .55 }, gFx);   // inundaciones
  const hud = document.createElement("div"); hud.id = "hud"; hud.style.opacity = 0; document.body.appendChild(hud);
  const banner = document.createElement("div"); banner.id = "eraBanner"; document.body.appendChild(banner);
  const toasts = document.createElement("div"); toasts.id = "toasts"; document.body.appendChild(toasts);
  const chip = document.createElement("button"); chip.id = "hudChip"; chip.title = "Ver época, población y crónica"; chip.textContent = "Civilización ▸"; chip.style.opacity = 1; (document.getElementById("eraSlot") || document.body).appendChild(chip);
  let hudOpen = Q.has("hud"), hudTimer = 0;   // el cuadro central se esconde solo al minuto
  const setHud = on => { hudOpen = on; hud.classList.toggle("open", on); clearTimeout(hudTimer); if (on) hudTimer = setTimeout(() => setHud(false), 60000); S.hudT = 0; renderHud(); };
  if (hudOpen) { hud.classList.add("open"); hudTimer = setTimeout(() => setHud(false), 60000); }
  chip.addEventListener("click", () => setHud(!hudOpen));
  hud.addEventListener("click", () => setHud(false));
  // logo del laboratorio (esquina superior izquierda de la civilizacion), dibujado dentro del propio svg del mundo para que funcione en cualquier navegador
  const logoG = el("g", { "pointer-events": "none" }, svg), logoBg = el("rect", { rx: 10, fill: "#fff" }, logoG), logoImg = el("image", { preserveAspectRatio: "xMinYMid meet" }, logoG);
  logoImg.setAttribute("href", "logoMEL.svg"); logoImg.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "logoMEL.svg");
  const ambClip = el("clipPath", { id: "ambclip" }, svg), ambClipR = el("rect", { x: 0, width: 99999 }, ambClip);   // lo del cielo no se sale hacia la zona de informacion
  function placeLogo() {
    ambClipR.setAttribute("y", SKY); ambClipR.setAttribute("height", Math.max(0, H - SKY));
    const h = Math.max(34, Math.min(66, H * .06)), lw = h * 2383 / 578, dark = document.documentElement.dataset.theme === "dark", narrow = matchMedia("(max-width: 900px)").matches;
    // con pantalla dividida: esquina superior izquierda de la civilizacion; en pantallas bajas (sin division, p. ej. 1920x395): a la derecha, sobre el suelo
    const x = SKY ? 12 : W - lw - 36, y = SKY ? SKY + 8 : Math.round(H * .55 - h);
    logoG.style.display = narrow ? "none" : "";
    logoBg.setAttribute("x", x); logoBg.setAttribute("y", y - 3); logoBg.setAttribute("width", lw + 16); logoBg.setAttribute("height", h + 6); logoBg.setAttribute("opacity", dark || !SKY ? .9 : 0);
    logoImg.setAttribute("x", x + 8); logoImg.setAttribute("y", y); logoImg.setAttribute("width", lw); logoImg.setAttribute("height", h);
    // la pastilla de la epoca va dentro de la civilizacion, justo bajo el logo (en pantallas angostas vuelve a su lugar, bajo el clima)
    const slot = document.getElementById("eraSlot");
    if (narrow) { if (slot && chip.parentNode !== slot) slot.appendChild(chip); chip.classList.remove("fl"); chip.style.left = chip.style.top = ""; }
    else { if (chip.parentNode !== document.body) document.body.appendChild(chip); chip.classList.add("fl"); chip.style.left = (x + 4) + "px"; chip.style.top = (y + h + 10) + "px"; }
  }
  new MutationObserver(placeLogo).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  function layout() {
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    ground.setAttribute("y", floorY()); ground.setAttribute("width", W);
    grass.setAttribute("y", floorY()); grass.setAttribute("width", W);
    dark.setAttribute("width", W); dark.setAttribute("height", H);
    rails.innerHTML = `<rect x="0" y="${H - 9}" width="${W}" height="2.5" fill="#444"/>` +
      `<line x1="0" y1="${H - 5}" x2="${W}" y2="${H - 5}" stroke="#5a4630" stroke-width="3" stroke-dasharray="3 9"/>`;
    SKY = measureSky();
    placeLogo();
    dark.setAttribute("y", SKY); dark.setAttribute("height", H - SKY); tint.setAttribute("y", SKY);
    tint.setAttribute("width", W); tint.setAttribute("height", H - SKY); water.setAttribute("width", W);
    const sb = skyBg.querySelector(".sb"), sl = skyBg.querySelector(".sl"), st = skyBg.querySelector(".stars");
    skyBg.style.display = SKY > 0 ? "" : "none";
    sb.setAttribute("x", 0); sb.setAttribute("y", SKY); sb.setAttribute("width", W); sb.setAttribute("height", H - SKY);
    sl.setAttribute("x1", 0); sl.setAttribute("x2", W); sl.setAttribute("y1", SKY); sl.setAttribute("y2", SKY);
    st.innerHTML = SKY > 0 ? Array.from({ length: 70 }, (_, i) => `<circle cx="${(Math.random() * W).toFixed(0)}" cy="${(SKY + 6 + Math.random() * Math.max(10, skyH() - 40)).toFixed(0)}" r="${(.5 + Math.random() * 1.1).toFixed(1)}" fill="#fff"${i % 5 === 0 ? ` style="animation:tw ${(2 + Math.random() * 3).toFixed(1)}s ease-in-out ${(Math.random() * 3).toFixed(1)}s infinite"` : ""}/>`).join("") : "";
    placePlanets();
  }
  function measureSky() {   // la pantalla se reparte: informacion arriba, civilizacion abajo
    const lay = document.querySelector(".layout"), foot = document.querySelector("footer");
    if (!lay || matchMedia("(max-width: 900px)").matches) return 0;
    const b = Math.max(lay.getBoundingClientRect().bottom, foot ? foot.getBoundingClientRect().bottom : 0) + scrollY;
    return b > H * .74 ? 0 : Math.round(b + 8);
  }

  // ---------- historia: epocas ----------
  const ERAS = [
    { name: "Edad de Piedra",           dur: 55, y0: -50000, y1: -30000, min: 0,  cap: 8,  ground: "#8b7b5c" },
    { name: "Descubrimiento del fuego", dur: 50, y0: -30000, y1: -15000, min: 4,  cap: 12, ground: "#85774f" },
    { name: "Era nómada",               dur: 55, y0: -15000, y1: -10000, min: 6,  cap: 16, ground: "#7c8a55" },
    { name: "Era sedentaria",           dur: 150, y0: -10000, y1: 1400,   min: 9,  cap: 22, ground: "#6f9a4a" },
    { name: "Era colonial",             dur: 55, y0: 1400,   y1: 1760,   min: 13, cap: 30, ground: "#6a9446" },
    { name: "Revolución industrial",    dur: 55, y0: 1760,   y1: 1950,   min: 18, cap: 40, ground: "#6c7a58" },
    { name: "Era nuclear",              dur: 100, y0: 1945,  y1: 2030,   min: 24, cap: 52, ground: "#5e6a63" },
    { name: "Era espacial",            dur: 80, y0: 2030,   y1: 2150,   min: 30, cap: 70, ground: "#4f5a66" },
    { name: "Era galáctica",           dur: 500, y0: 2150,  y1: 2900,   min: 0,  cap: 80, ground: "#3d4655" },
  ];
  const DESTS = [
    { name: "Marte", c1: "#e0714a", c2: "#8f3a22", w: 5 }, { name: "la Luna", c1: "#d9d9d4", c2: "#8c8c88", w: 2 },
    { name: "Europa", c1: "#cfe3ee", c2: "#6f95ad", w: 2 }, { name: "Titán", c1: "#e3a64a", c2: "#8a5a1c", w: 1 },
  ];
  const SYL = ["ba", "na", "mo", "ku", "pi", "ri", "tu", "ma", "ko", "lu", "chi", "ta", "ni", "go", "zu", "bu", "fe"];
  const nm = () => { const s = Array.from({ length: 2 + (chance(.5) ? 1 : 0) }, () => pick(SYL)).join(""); return s[0].toUpperCase() + s.slice(1); };

  // tres pueblos, uno por animal (monos=akaza, jirafas=ymir, focas=inozuke); en la era espacial se funden en uno solo
  const TRIBE_KINDS = ["mono", "jirafa", "foca"];
  const TRIBE_INFO = { mono: { plural: "monos", art: "los" }, jirafa: { plural: "jirafas", art: "las" }, foca: { plural: "focas", art: "las" } };
  function makeTribes() {
    S.tribes = TRIBE_KINDS.map((k, i) => ({ i, kind: k, nm: nm(), hue: rnd(0, 360), rel: null, rel2: null, cult: null }));
    S.dip = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];   // relaciones entre pueblos: -3 guerra ... +3 alianza
    S.unified = false; S.nation = nm() + "ia";
  }
  const S = {
    t: 0, started: false, era: 0, eraT: 0, eraDur: 55, boost: 1, boostT: 0,
    extra: 0, spawnT: 0, evT: 16, msT: 9, planT: 0, hudT: 0, deadT: 0,
    traits: { war: rnd(.25, 1.8), curious: rnd(.7, 1.5), luck: rnd(.6, 1.4) },   // temperamento de esta corrida
    branch: [0, 0, 0, 0, 0, 0, 0, 0].map(() => chance(.5) ? 1 : 0),             // variante de cada era
    done: {}, recent: {}, structs: [], mon: [], fx: [], flights: [], war: null, launch: null, ufo: null,
    rain: 0, eclipse: 0, colonists: 0, goal: 4 + (Math.random() * 3 | 0), won: false, destSeen: false, log: [], busy: false,
    tribe: nm(), city: nm(), hue: rnd(0, 360), flag: [rnd(0, 360), rnd(0, 360)],
    dest: wpick(DESTS, d => d.w), returnT: 0, returnMon: null, mammothT: 0,
    stats: { guerras: 0, plagas: 0, hambrunas: 0, terremotos: 0, meteoritos: 0, festivales: 0, cohetes: 0, hitos: 0, pandemias: 0, devorados: 0, cataclismos: 0, incendios: 0, choques: 0 },
    planets: [], q: [], crits: [], fleet: [], cycle: 1, saga: null, lastSaga: null, planPause: 0, rel: null, rel2: null, pandemic: null,
    drought: 0, flood: 0, spice: 0, code: 0, crumble: 0, crumbT: 0, fightBack: false, wormCalm: 0, fastLaunch: 0, station: null, cata: null,
    planetT: null, sea: 0, waterH: 0, hole: null, aurora: 0, locust: 0, strike: 0, music: 0, floodMax: 14, launchT: null,
  };
  makeTribes();
  S.eraDur = ERAS[0].dur * rnd(.75, 1.35);

  const fmtYear = y => y < 0 ? `${Math.abs(Math.round(y / 10) * 10).toLocaleString("es")} a.C.` : `${Math.round(y)} d.C.`;
  const curYear = () => { const e = ERAS[S.era]; return lerp(e.y0, e.y1, clamp(S.eraT / S.eraDur, 0, 1)); };
  const popTotal = () => groundMons().length + Math.floor(S.extra);
  const zone = t => S.unified || t == null ? [0, W] : [W * t / 3, W * (t + 1) / 3];   // el territorio de cada pueblo
  const popOf = t => groundMons().filter(g => S.unified || t == null || g.tribe === t).length + Math.floor(S.extra / (S.unified || t == null ? 1 : 3));
  const tn = i => { const t = S.tribes[i], d = TRIBE_INFO[t.kind]; return `${d.art} ${d.plural} ${t.nm}`; };
  const natName = () => S.unified ? S.nation : tn(0);
  const dip = (a, b) => S.dip[a][b];
  const dipAdd = (a, b, d) => { S.dip[a][b] = S.dip[b][a] = clamp(S.dip[a][b] + d, -3, 3); };
  function pushToast(text) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = text; toasts.appendChild(t);
    while (toasts.children.length > 3) toasts.removeChild(toasts.firstChild);
    setTimeout(() => t.remove(), 7200);
  }
  A.setCelebHandler(m => { const t = `Llega ${m.celeb.name}, disfrazado de ${m.kind}: tócalo para saludar`; if (S.started) logEv(t); else pushToast(t); });
  function logEv(text) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
    S.log.unshift({ y: fmtYear(curYear()), text });
    if (S.log.length > 40) S.log.length = 40;
    S.hudT = 0;
    if (S.started) pushToast(text);   // aviso flotante que se desvanece
  }
  function showBanner(text) {
    banner.textContent = text; banner.classList.remove("on"); void banner.offsetWidth; banner.classList.add("on");
  }

  // ---------- dibujos: px, suelo en y=0 (hacia arriba es negativo) ----------
  const R = (x, y, w, h, f, x2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${x2 || ""}/>`;
  const Pth = (d, f, x2) => `<path d="${d}" fill="${f}" ${x2 || ""}/>`;
  const Cir = (cx, cy, r, f, x2) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}" ${x2 || ""}/>`;
  const Ell = (cx, cy, rx, ry, f, x2) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}" ${x2 || ""}/>`;
  const hsl = (h, s, l) => `hsl(${Math.round(h)} ${s}% ${l}%)`;
  const thue = s => s && S.tribes[s.tribe] ? S.tribes[s.tribe].hue : S.hue;
  const wall = s => hsl(thue(s) + rnd(-25, 25), 38, 76), roof = s => hsl(thue(s) + 180 + rnd(-20, 20), 42, 40);

  const relColor = (t, i) => { const tr = S.tribes[t], r1 = tr && tr.rel || S.rel, r2 = tr && tr.rel2 || S.rel2; return hsl(i === 0 ? (r1 ? r1.hue : 40) : (r2 ? r2.hue : 200), 55, 52); };
  const relInit = s => { s.rc = relColor(s.tribe, alive(s.kind, s.tribe).length); };
  const SACRED = ["totem", "pyramid", "temple", "cathedral", "orb"];
  const KINDS = {
    cave: { w: 50, draw: () => Pth("M-42 0Q-38 -38 0 -44Q40 -38 44 0Z", "#857b6e") +
      `<path d="M-34 -8Q-24 -32 -8 -37" fill="none" stroke="#a49a8c" stroke-width="3" stroke-linecap="round"/>` +
      Pth("M-14 0Q-14 -23 0 -26Q14 -23 14 0Z", "#241e1a") +
      `<g class="pt" style="display:none" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M-30 -14l6 -8" stroke="#d8553a"/><path d="M-22 -20l7 4" stroke="#f2c14e"/><circle cx="-26" cy="-27" r="3" stroke="#e8e0d0"/></g>` },
    rock: { w: 18, draw: () => Ell(0, -5, 11, 7, "#8d8a84") + Ell(-4, -8, 5, 3, "#a8a59e") },
    bones: { w: 22, draw: () => `<g stroke="#eee8d8" stroke-width="2.2" stroke-linecap="round"><path d="M-8 -2L8 -5"/><path d="M-6 -6L6 -1"/></g>` + Cir(10, -4, 2.6, "#eee8d8") + Cir(-10, -3, 2.6, "#eee8d8") },
    campfire: { w: 30, noflip: true,
      draw: () => Cir(0, -10, 34, "#ffb24d", 'class="gl" opacity=".16"') +
        `<path d="M-11 -2L11 -7M11 -2L-11 -7" stroke="#5a3b22" stroke-width="4" stroke-linecap="round"/>` +
        `<g class="fl"><path d="M0 0C-9 -4 -6 -16 0 -25C6 -16 9 -4 0 0Z" fill="#ff7a1a"/><path d="M0 0C-5 -3 -3 -11 0 -16C3 -11 5 -3 0 0Z" fill="#ffd23f"/></g>`,
      tick(s, h) {
        s.t += h;
        s.$(".fl").setAttribute("transform", `translate(0 -6) scale(${(1 + .08 * Math.sin(s.t * 13)).toFixed(2)} ${(.9 + .22 * Math.sin(s.t * 9 + 1)).toFixed(2)})`);
        s.$(".gl").setAttribute("opacity", (.14 + .07 * Math.sin(s.t * 11)).toFixed(2));
      } },
    tent: { w: 44, init: s => { s.col = hsl(rnd(15, 45), 50, 50); },
      draw: s => Pth("M-21 0L0 -42L21 0Z", s.col) + Pth("M-5 0L0 -24L5 0Z", "rgba(60,30,10,.7)") +
        `<path d="M-3 -38L-9 -48M3 -38L9 -48" stroke="#6b4a2a" stroke-width="2"/>` },
    hut: { w: 40, init: s => { s.col = hsl(S.tribes[s.tribe] ? thue(s) % 40 + 20 : rnd(28, 40), 45, 62); },
      draw: s => R(-15, -17, 30, 17, s.col) + Pth("M-20 -17L0 -37L20 -17Z", "#a67c2e") + R(-4, -11, 8, 11, "#5a3b22") },
    field: { w: 70, noflip: true, init: s => { s.g = rnd(0, 1); },
      draw: () => R(-32, -5, 64, 5, "#6b4a2a") + Array.from({ length: 9 }, (_, i) =>
        `<line class="cr" x1="${-28 + i * 7}" x2="${-28 + i * 7}" y1="-5" y2="-9" stroke="#4caf50" stroke-width="2" stroke-linecap="round"/>`).join(""),
      tick(s, h) {
        s.g += h / (S.rain || S.flood > 0 ? 11 : S.drought > 0 ? 70 : 22);
        if (s.g > 1.15) { s.g = 0; burst(s.x, floorY() - 8, 6, "#d9b53a", 40); if (chance(.35)) say("cosecha"); }
        const g = Math.min(1, s.g), col = g > .85 ? "#d9b53a" : "#4caf50";
        s.el.querySelectorAll(".cr").forEach((c, i) => {
          c.setAttribute("y2", (-5 - g * (11 + (i % 3) * 2)).toFixed(1)); c.setAttribute("stroke", col);
        });
      } },
    sheep: { w: 16, mobile: true, draw: () => Ell(0, -7, 8, 6, "#f4f1ea") + Cir(8, -9, 3.4, "#3b3530") + R(-4, -3, 2, 3, "#3b3530") + R(3, -3, 2, 3, "#3b3530") },
    dog: { w: 16, mobile: true, draw: () => Ell(0, -7, 7, 4, "#9a7b55") + Cir(8, -10, 3.6, "#9a7b55") + Pth("M9 -13L11 -17L12 -12Z", "#7d6040") +
      `<path d="M-7 -8Q-11 -12 -9 -14" stroke="#9a7b55" stroke-width="2" fill="none"/>` + R(-4, -3, 2, 3, "#7d6040") + R(4, -3, 2, 3, "#7d6040") },
    mammoth: { w: 62, mobile: true, draw: () => Ell(0, -17, 23, 14, "#6b4a32") + Cir(22, -19, 10, "#6b4a32") +
      `<path d="M30 -14Q40 -6 35 3" stroke="#6b4a32" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M27 -11Q39 -10 36 -2" stroke="#f4f1ea" stroke-width="2.6" fill="none"/>` +
      R(-16, -9, 7, 9, "#5a3b27") + R(9, -9, 7, 9, "#5a3b27") + Cir(26, -22, 1.4, "#111") },
    house: { w: 44, init: s => { s.w1 = wall(s); s.r1 = roof(s); },
      draw: s => R(-18, -22, 36, 22, s.w1) + Pth("M-23 -22L0 -41L23 -22Z", s.r1) + R(-4, -13, 8, 13, "#5a3b22") +
        R(-14, -17, 6, 6, "#ffe08a") + R(8, -17, 6, 6, "#ffe08a") + R(10, -38, 5, 10, "#7a4a3a") },
    fort: { w: 62, noflip: true, init: s => { s.col = hsl(S.flag[0], 70, 50); },
      draw: s => R(-30, -26, 60, 26, "#9a9a96") + [-28, -16, -4, 8, 20].map(x => R(x, -31, 8, 5, "#9a9a96")).join("") +
        Pth("M-7 0L-7 -14Q0 -20 7 -14L7 0Z", "#3b3530") + `<line x1="0" y1="-26" x2="0" y2="-52" stroke="#444" stroke-width="2"/>` +
        `<path class="fg" d="M0 -52L16 -48L0 -43Z" fill="${s.col}"/>`,
      tick(s, h) { s.t += h; const w = 3 * Math.sin(s.t * 6); s.$(".fg").setAttribute("d", `M0 -52Q8 ${-52 + w} 16 ${-48 + w}Q8 ${-45 - w} 0 -43Z`); } },
    windmill: { w: 40, noflip: true,
      draw: () => Pth("M-10 0L-6 -36L6 -36L10 0Z", "#cdbba0") + R(-3, -10, 6, 10, "#6b4a2a") +
        `<g class="bl" transform="translate(0 -36)">${[0, 90, 180, 270].map(a => `<g transform="rotate(${a})">${R(-2, -26, 4, 26, "#8b6b44")}${R(2, -26, 9, 12, "rgba(255,255,255,.85)")}</g>`).join("")}</g>` + Cir(0, -36, 2.5, "#4a3a28"),
      tick(s, h) { s.rot = (s.rot || 0) + h * 70; s.$(".bl").setAttribute("transform", `translate(0 -36) rotate(${s.rot.toFixed(0)})`); } },
    ship: { w: 76, noflip: true, fixed: 66,
      draw: () => Pth("M-44 -1Q-33 -7 -22 -1T0 -1T22 -1T44 -1V8H-44Z", "#3b7fbf") +
        `<g class="bob">${Pth("M-26 -6L26 -6L18 6L-18 6Z", "#6b4226")}<line x1="0" y1="-6" x2="0" y2="-40" stroke="#4a3220" stroke-width="2"/>${Pth("M2 -38L22 -12L2 -12Z", "#f4f1ea")}${Pth("M-2 -34L-18 -12L-2 -12Z", "#e8e0d0")}</g>`,
      tick(s, h) { s.t += h; s.$(".bob").setAttribute("transform", `translate(0 ${(Math.sin(s.t * 2) * 1.6).toFixed(1)}) rotate(${(Math.sin(s.t * 1.4) * 3).toFixed(1)} 0 0)`); } },
    market: { w: 46, draw: s => R(-20, -22, 3, 22, "#6b4a2a") + R(17, -22, 3, 22, "#6b4a2a") + Pth("M-24 -22L24 -22L20 -32L-20 -32Z", hsl(S.flag[1], 70, 50)) +
      R(-18, -10, 36, 4, "#a67c2e") + Cir(-9, -13, 3, "#e53935") + Cir(0, -13, 3, "#f5d033") + Cir(9, -13, 3, "#7cb342") },
    temple: { w: 58, noflip: true, init: relInit, draw: s => R(-24, -4, 48, 4, "#d8d2c4") + [-18, -9, 0, 9, 18].map(x => R(x - 2, -28, 4, 24, "#eee8dc")).join("") +
      Pth("M-28 -28L0 -46L28 -28Z", "#cfc6b4") + Cir(0, -33, 3.2, s.rc) },
    totem: { w: 22, noflip: true, init: relInit,
      draw: s => R(-5, -44, 10, 44, "#8a5a2b") + [-12, -26, -40].map(y => Cir(0, y, 4.3, y === -40 ? s.rc : "#e8c98a") + R(-2.4, y - 1, 1.5, 1.5, "#222") + R(.9, y - 1, 1.5, 1.5, "#222")).join("") +
        Pth("M-14 -36L-5 -34L-5 -30L-14 -32Z", s.rc) + Pth("M14 -36L5 -34L5 -30L14 -32Z", s.rc) },
    pyramid: { w: 74, noflip: true, init: relInit,
      draw: s => Pth("M-36 0L0 -48L36 0Z", "#d9b66a") + `<path d="M-26 -14L26 -14M-18 -26L18 -26M-10 -37L10 -37" stroke="#b8924a" stroke-width="1.5"/>` + Pth("M-6 0L-6 -10Q0 -15 6 -10L6 0Z", "#3a2a14") + Cir(0, -51, 4, s.rc) },
    cathedral: { w: 74, noflip: true, init: relInit,
      draw: s => R(-20, -32, 40, 32, "#cfc6b4") + R(-28, -56, 11, 56, "#c2b8a4") + R(17, -56, 11, 56, "#c2b8a4") + Pth("M-30 -56L-22.5 -80L-15 -56Z", s.rc) + Pth("M15 -56L22.5 -80L30 -56Z", s.rc) +
        Pth("M-20 -32L0 -50L20 -32Z", "#b0a68f") + Cir(0, -22, 6, "#6fa8dc", 'stroke="#fff" stroke-width="1"') + Pth("M-6 0L-6 -10Q0 -17 6 -10L6 0Z", "#3a2a14") },
    orb: { w: 46, noflip: true, init: relInit,
      draw: s => R(-3, -26, 6, 26, "#aab4c2") + Cir(0, -40, 14, s.rc, 'class="ob" opacity=".9"') + Cir(0, -40, 23, s.rc, 'opacity=".18"') + `<ellipse cx="0" cy="-40" rx="23" ry="5" fill="none" stroke="#fff" stroke-width="1.2" opacity=".7"/>`,
      tick(s, h) { s.t += h; s.$(".ob").setAttribute("r", (14 + Math.sin(s.t * 2) * 1.2).toFixed(1)); } },
    academia: { w: 64, noflip: true, draw: () => R(-28, -4, 56, 4, "#d8d2c4") + R(-24, -8, 48, 4, "#cfc9bb") + [-20, -10, 0, 10, 20].map(x => R(x - 2, -34, 4, 26, "#f1ede2")).join("") + Pth("M-30 -34L0 -50L30 -34Z", "#c2b8a4") + Cir(0, -40, 3, "#6b7a99") },
    observatory: { w: 48, noflip: true,
      draw: () => R(-16, -18, 32, 18, "#d8dde6") + Pth("M-16 -18A16 16 0 0 1 16 -18Z", "#9aa7bd") + `<g class="tl" transform="translate(0 -22) rotate(-35)">${R(-2, -16, 4, 18, "#4a5568")}</g>` + R(-3, -9, 6, 9, "#3a4150"),
      tick(s, h) { s.t += h; s.$(".tl").setAttribute("transform", `translate(0 -22) rotate(${(-35 + Math.sin(s.t * .3) * 20).toFixed(0)})`); } },
    university: { w: 74, noflip: true,
      draw: () => R(-30, -26, 60, 26, "#b36a4e") + R(-8, -52, 16, 52, "#a65a40") + Pth("M-10 -52L0 -64L10 -52Z", "#4a3a30") + Cir(0, -42, 5, "#f4efe2", 'stroke="#555" stroke-width="1"') +
        `<path d="M0 -42L0 -45M0 -42L2.5 -42" stroke="#333" stroke-width="1"/>` + [-24, -17, 13, 20].map(x => R(x, -19, 4, 8, "#ffe08a")).join("") + R(-4, -12, 8, 12, "#3a2a1a") },
    laboratory: { w: 52, noflip: true, init: s => { s.bb = 0; },
      draw: () => R(-20, -24, 40, 24, "#dfe6ee") + R(-20, -28, 40, 4, "#8a97a8") + [-14, 0, 10].map(x => R(x, -18, 8, 8, "#9fe3ff")).join("") +
        Pth("M-4 -50L-4 -38L-11 -30L11 -30L4 -38L4 -50Z", "#8fe08f", 'opacity=".9" stroke="#4a7a4a" stroke-width="1"') + R(-5, -52, 10, 3, "#8a97a8"),
      tick(s, h) { s.bb -= h; if (s.bb <= 0) { s.bb = rnd(.4, 1); fx("puff", { x: s.x + rnd(-3, 3), y: floorY() - 48, vy: -rnd(8, 16), r0: 1.5, r1: 4, life: 1, col: "#8fe08f", op: .7 }); } } },
    hospital: { w: 56, noflip: true, draw: () => R(-24, -30, 48, 30, "#f4f7fa") + R(-24, -34, 48, 4, "#d0d7e0") + R(-4, -27, 8, 22, "#e53935") + R(-11, -20, 22, 8, "#e53935") + R(-19, -14, 6, 8, "#9fd3ff") + R(13, -14, 6, 8, "#9fd3ff") },
    antenna: { w: 24, noflip: true, draw: () => `<path d="M-8 0L0 -70L8 0M-5 -18L5 -18M-3.5 -34L3.5 -34M-2 -50L2 -50" fill="none" stroke="#8a929c" stroke-width="2"/>` + Cir(0, -72, 3, "#e53935", 'class="bl2"'),
      tick(s, h) { s.t += h; s.$(".bl2").setAttribute("opacity", Math.sin(s.t * 5) > 0 ? 1 : .2); } },
    stadium: { w: 94, noflip: true, draw: () => Pth("M-44 0L-40 -20Q0 -30 40 -20L44 0Z", "#aab2bd") + Pth("M-40 -20Q0 -30 40 -20L36 -26Q0 -34 -36 -26Z", "#c9d0d9") + R(-6, -6, 12, 6, "#4caf50") + R(-44, -42, 3, 42, "#777") + R(41, -42, 3, 42, "#777") + Cir(-42, -44, 4, "#ffe9a0") + Cir(42, -44, 4, "#ffe9a0") },
    statue: { w: 24, noflip: true, draw: () => R(-9, -8, 18, 8, "#9aa0a8") + R(-6, -14, 12, 6, "#b3b9c0") + Ell(0, -24, 4, 7, "#c4a24a") + Cir(0, -33, 3.5, "#c4a24a") + R(3, -42, 2.2, 10, "#c4a24a") + Ell(4, -43, 2.6, 1.6, "#e8c96a") },
    tower: { w: 26, noflip: true, draw: () => Pth("M-7 0L-3 -96L3 -96L7 0Z", "#e8eff6") + `<ellipse cx="0" cy="-56" rx="11" ry="3.2" fill="none" stroke="#6fe3ff" stroke-width="2"/><ellipse cx="0" cy="-76" rx="9" ry="2.6" fill="none" stroke="#6fe3ff" stroke-width="2"/>` + Cir(0, -98, 3, "#6fe3ff", 'class="bk"'),
      tick(s, h) { s.t += h; s.$(".bk").setAttribute("opacity", (.5 + .5 * Math.sin(s.t * 4)).toFixed(2)); } },
    starport: { w: 86, noflip: true, draw: () => R(-40, -4, 80, 4, "#7b8494") + Ell(0, -14, 26, 7, "#aab4c2") + Ell(0, -19, 12, 8, "#9fe3ff", 'opacity=".8"') + [-16, -5, 6, 16].map(x => Cir(x, -12, 1.6, "#ffd23f")).join("") + R(-28, -12, 3, 8, "#5a6270") + R(25, -12, 3, 8, "#5a6270") },
    hovercar: { w: 24, mobile: true, init: s => { s.dy = -rnd(30, 120); s.v = (chance(.5) ? 1 : -1) * rnd(40, 90); },
      draw: () => Ell(0, -5, 10, 4, "#dfe9f2") + Ell(0, -6.5, 5, 3, "#8fd3ff") + Ell(0, 0, 8, 1.6, "#6fe3ff", 'opacity=".6"'),
      tick(s, h) { s.x += s.v * h; s.dy += Math.sin(S.t * 2 + s.x) * h * 6; if (s.x > W + 30) s.x = -30; if (s.x < -30) s.x = W + 30; s.flip = s.v < 0; } },
    ruin: { w: 46, temp: true, draw: () => Pth("M-20 0L-18 -9L-10 -5L-5 -15L3 -7L10 -12L20 0Z", "#6e6a64") + Pth("M-8 0L-6 -6L0 -3L6 -8L9 0Z", "#8a857d") },
    castle: { w: 90, noflip: true, init: s => { s.col = hsl(S.flag[0], 70, 50); },
      draw: s => R(-34, -28, 68, 28, "#a4a29b") + [-34, -20, -6, 8, 22].map(x => R(x, -33, 8, 5, "#a4a29b")).join("") +
        R(-42, -52, 18, 52, "#93918a") + R(24, -52, 18, 52, "#93918a") + Pth("M-44 -52L-33 -72L-22 -52Z", "#8c3b2a") + Pth("M22 -52L33 -72L44 -52Z", "#8c3b2a") +
        R(-9, -44, 18, 44, "#9a988f") + Pth("M-11 -44L0 -60L11 -44Z", "#8c3b2a") + Pth("M-8 0L-8 -14Q0 -22 8 -14L8 0Z", "#3b3530") +
        R(-38, -42, 3, 6, "#2a2520") + R(35, -42, 3, 6, "#2a2520") + `<line x1="0" y1="-60" x2="0" y2="-80" stroke="#444" stroke-width="2"/><path class="fg" d="M0 -80L16 -76L0 -71Z" fill="${s.col}"/>`,
      tick(s, h) { s.t += h; const w = 3 * Math.sin(s.t * 6); s.$(".fg").setAttribute("d", `M0 -80Q8 ${-80 + w} 16 ${-76 + w}Q8 ${-73 - w} 0 -71Z`); } },
    catapult: { w: 38, temp: true, init: s => { s.fire = 0; },
      draw: () => R(-14, -6, 28, 4, "#6b4a2a") + Cir(-9, -3, 4, "#4a3220") + Cir(9, -3, 4, "#4a3220") + `<path d="M-8 -6L0 -16L8 -6" stroke="#6b4a2a" stroke-width="3" fill="none"/>` +
        `<g class="arm" transform="translate(0 -14) rotate(-60)">${R(-1.5, -22, 3, 24, "#8b6b44")}${Cir(0, -23, 4, "#6d6a64")}</g>`,
      tick(s, h) { s.fire = Math.max(0, s.fire - h * 1.6); s.$(".arm").setAttribute("transform", `translate(0 -14) rotate(${(-60 + s.fire * 100).toFixed(0)})`); } },
    colosseum: { w: 114, noflip: true, draw: () => Pth("M-56 0L-52 -44Q0 -60 52 -44L56 0Z", "#d8c9a8") + [0, 1, 2].map(r => Array.from({ length: 9 }, (_, i) => `<path d="M${-47 + i * 11.7} ${-5 - r * 13}v-6a4 4 0 0 1 8 0v6z" fill="#a8956d"/>`).join("")).join("") + Pth("M-52 -44Q0 -60 52 -44L47 -48Q0 -64 -47 -48Z", "#c6b48c") },
    aqueduct: { w: 154, noflip: true, draw: () => R(-76, -64, 152, 7, "#cdbb94") + Array.from({ length: 8 }, (_, i) => `<path d="M${-74 + i * 19} 0V-26A9.5 9.5 0 0 1 ${-55 + i * 19} -26V0Z" fill="#cdbb94"/>`).join("") + Array.from({ length: 8 }, (_, i) => `<path d="M${-74 + i * 19} -26V-44A9.5 9.5 0 0 1 ${-55 + i * 19} -44V-26Z" fill="#c2b088"/>`).join("") + R(-76, -57, 152, 4, "#b6a47c") },
    villa: { w: 56, noflip: true, draw: () => R(-24, -22, 48, 22, "#efe4cc") + Pth("M-28 -22L0 -38L28 -22Z", "#b5502e") + [-18, -9, 0, 9, 18].map(x => R(x - 1.5, -22, 3, 22, "#fffaf0")).join("") + R(-4, -12, 8, 12, "#6b4a2a") },
    obelisk: { w: 18, noflip: true, draw: () => Pth("M-5.5 0L-3.4 -80L0 -92L3.4 -80L5.5 0Z", "#d6c08c") + `<path d="M0 -70v8M0 -54v8M0 -38v8M0 -22v8" stroke="#a8915a" stroke-width="1.4"/>` + R(-8, -3, 16, 3, "#b6a074") },
    sphinx: { w: 70, noflip: true, draw: () => Pth("M-32 0L-30 -14Q-10 -20 14 -16L16 -26Q20 -34 26 -30Q30 -26 28 -16L30 0Z", "#d9bd7a") + Cir(24, -26, 6, "#d9bd7a") + R(18, -34, 12, 3, "#2f7fc0") + Cir(27, -27, 1, "#222") + R(-28, -4, 56, 4, "#c8aa66") },
    longhouse: { w: 78, noflip: true, draw: () => R(-34, -16, 68, 16, "#8a5a32") + Pth("M-38 -16L-26 -34L26 -34L38 -16Z", "#5a3a1e") + `<path d="M-26 -34L-31 -42M26 -34L31 -42" stroke="#5a3a1e" stroke-width="2.4" stroke-linecap="round"/>` + R(-5, -12, 10, 12, "#3b2a18") + [-26, -16, 16, 26].map(x => Cir(x, -9, 3, "#c9a24a")).join("") },
    runestone: { w: 18, noflip: true, draw: () => Pth("M-6 0L-5 -22Q0 -28 5 -22L6 0Z", "#8d8f94") + `<path d="M-2 -18l3 4-3 4M-1 -8l3-3" stroke="#c0392b" stroke-width="1.2" fill="none"/>` },
    pagoda: { w: 46, noflip: true, init: s => { const c = S.tribes[s.tribe] && S.tribes[s.tribe].cult; s.col = c === "japonesa" ? "#d9d4c4" : "#b3282d"; s.n = c === "japonesa" ? 3 : 5; },
      draw: s => { let o = R(-3, -s.n * 17 - 10, 6, 10, "#444"); for (let i = 0; i < s.n; i++) { const y = -i * 17, w = 20 - i * 2.2; o += R(-w + 3, y - 14, 2 * w - 6, 14, s.col) + Pth(`M${-w - 4} ${y - 14}Q0 ${y - 22} ${w + 4} ${y - 14}L${w + 1} ${y - 11}L${-w - 1} ${y - 11}Z`, "#3b2f2a") + R(-2, y - 10, 4, 10, "#5a3b22"); } return o; } },
    greatwall: { w: 176, noflip: true, draw: () => R(-86, -26, 172, 26, "#a39a86") + Array.from({ length: 16 }, (_, i) => R(-86 + i * 11, -31, 7, 6, "#a39a86")).join("") + [-70, 0, 70].map(x => R(x - 9, -48, 18, 48, "#938a76") + Pth(`M${x - 11} -48L${x} -58L${x + 11} -48Z`, "#7a3b2a") + R(x - 2, -40, 4, 7, "#2a2520")).join("") },
    pavilion: { w: 46, noflip: true, draw: () => [-17, 17].map(x => R(x - 2, -24, 4, 24, "#b3282d")).join("") + Pth("M-26 -24Q0 -34 26 -24L20 -30Q0 -42 -20 -30Z", "#2f6b4a") + R(-19, -3, 38, 3, "#8a6a4a") },
    torii: { w: 44, noflip: true, draw: () => [-14, 14].map(x => R(x - 2.2, -40, 4.4, 40, "#c0392b")).join("") + R(-22, -40, 44, 5, "#c0392b") + R(-17, -32, 34, 3.4, "#a82f23") },
    dojo: { w: 56, noflip: true, draw: () => R(-22, -16, 44, 16, "#9a7a52") + Pth("M-30 -16Q0 -34 30 -16L24 -20Q0 -32 -24 -20Z", "#4a3a30") + R(-5, -12, 10, 12, "#3b2a18") + [-14, 14].map(x => R(x - 3, -13, 6, 8, "#efe4cc")).join("") },
    stepped: { w: 80, noflip: true, draw: () => [0, 1, 2, 3, 4].map(i => R(-38 + i * 7, -i * 12 - 12, 76 - i * 14, 12, i % 2 ? "#b8a27a" : "#a8926a")).join("") + R(-3, -62, 6, 6, "#6b4a2a") + R(-5, -68, 10, 8, "#c0392b") + R(-4, -52, 8, 52, "#8a7650", 'opacity=".5"') },
    palace: { w: 76, noflip: true, draw: () => R(-26, -34, 52, 34, "#efe6d2") + Pth("M-22 -34A22 20 0 0 1 22 -34Z", "#2f7fc0") + Cir(0, -56, 2, "#d4a82a") + [-34, 34].map(x => R(x - 4, -78, 8, 78, "#e8dcc0") + Pth(`M${x - 5} -78Q${x} -92 ${x + 5} -78Z`, "#2f7fc0") + Cir(x, -93, 1.6, "#d4a82a")).join("") + Pth("M-7 0V-14A7 7 0 0 1 7 -14V0Z", "#3b2f2a") },
    yurt: { w: 42, noflip: true, draw: () => R(-16, -14, 32, 14, "#eee6d4") + Pth("M-19 -14Q0 -34 19 -14Z", "#f6f0e2") + `<path d="M-19 -14Q0 -34 19 -14" fill="none" stroke="#b5502e" stroke-width="1.6"/>` + R(-4, -11, 8, 11, "#6b4a2a") + Cir(0, -30, 1.4, "#b5502e") },
    taj: { w: 100, noflip: true, draw: () => R(-34, -34, 68, 34, "#f4f1ea") + Pth("M-22 -34A22 24 0 0 1 22 -34Z", "#f8f6f0") + Pth("M-3 -58L0 -72L3 -58Z", "#d4a82a") + [-46, 46].map(x => R(x - 4, -62, 8, 62, "#f1eee6") + Pth(`M${x - 5} -62Q${x} -74 ${x + 5} -62Z`, "#f8f6f0")).join("") + Pth("M-8 0V-16A8 8 0 0 1 8 -16V0Z", "#bfc7d4") + R(-40, -2, 80, 2, "#9fd3ff", 'opacity=".6"') },
    nuclearplant: { w: 104, noflip: true, init: s => { s.sm = 0; },
      draw: () => [-34, 12].map(x => `<g transform="translate(${x} 0)">${Pth("M-15 0Q-7 -34 -10 -64L10 -64Q7 -34 15 0Z", "#d4d8de")}${R(-10.5, -66, 21, 3, "#aab1bb")}</g>`).join("") + Pth("M38 0V-22A15 15 0 0 1 68 -22V0Z", "#b8bec6") + R(34, -4, 38, 4, "#8e959f") + R(-48, -6, 8, 6, "#8e959f") + Cir(53, -14, 4, "#fdd835"),
      tick(s, h) { s.sm -= h; if (s.sm <= 0) { s.sm = .5; smoke(s.x - 34, floorY() - 68, 1); smoke(s.x + 12, floorY() - 68, 1); } } },
    silo: { w: 44, noflip: true, draw: () => R(-20, -4, 40, 4, "#80868f") + Pth("M-13 -4L-8 -11L8 -11L13 -4Z", "#6c727b") + R(-5, -13, 10, 2, "#c0392b") + Cir(-16, -7, 1.6, "#e53935") + Cir(16, -7, 1.6, "#e53935") },
    bunker: { w: 60, noflip: true, draw: () => Pth("M-28 0A28 24 0 0 1 28 0Z", "#9aa0a8") + R(-6, -14, 12, 14, "#3a3f46") + Cir(0, -22, 5, "#fdd835", 'stroke="#222" stroke-width="1"') + `<path d="M-2 -22h4M0 -24v4" stroke="#222" stroke-width="1"/>` + R(-30, -2, 60, 2, "#7d848d") },
    tflag: { w: 26, temp: true, noflip: true, init: s => { const tr = S.tribes[s.tribe]; s.col = hsl(tr.hue, 70, 48); s.ch = TRIBE_INFO[tr.kind].plural[0].toUpperCase(); },
      draw: s => `<line x1="0" y1="0" x2="0" y2="-46" stroke="#555" stroke-width="2.2"/><path class="fg" d="M0 -46L28 -41L0 -35Z" fill="${s.col}"/><text x="9" y="-38" style="fill:#fff;font-size:8px;font-weight:800;text-anchor:middle">${s.ch}</text>`,
      tick(s, h) { s.t += h; const w = 3 * Math.sin(s.t * 5); s.$(".fg").setAttribute("d", `M0 -46Q10 ${-46 + w} 28 ${-41 + w}Q10 ${-38 - w} 0 -35Z`); } },
    wreck: { w: 82, temp: true, noflip: true, draw: () => Pth("M-38 0Q-34 -16 -2 -20L34 -12Q40 -4 30 0Z", "#6e7681") + R(-6, -28, 12, 10, "#4a515b", 'transform="rotate(-18 0 -23)"') + Cir(14, -8, 2.4, "#e53935"),
      tick(s, h) { s.sm = (s.sm || 0) - h; if (s.sm <= 0) { s.sm = .45; smoke(s.x - 4, floorY() - 22); } } },
    egg: { w: 14, temp: true, noflip: true, draw: () => Ell(0, -8, 6, 9, "#6f7f3c") + `<path d="M-3 -14L0 -10L3 -14" stroke="#3a4620" stroke-width="1" fill="none"/>` },

    library: { w: 46, draw: () => R(-20, -26, 40, 26, "#b08a5b") + Pth("M-24 -26L0 -42L24 -26Z", "#6b4a2a") + R(-14, -20, 8, 10, "#ffe08a") + R(6, -20, 8, 10, "#ffe08a") + R(-3, -12, 6, 12, "#4a2f1a") },
    cart: { w: 36, mobile: true, draw: () => R(-14, -14, 28, 8, "#a67c2e") + Cir(-9, -4, 5, "#5a3b22") + Cir(9, -4, 5, "#5a3b22") +
      Cir(-5, -17, 4, "#e8c96a") + Cir(3, -18, 5, "#d9b53a") },
    lamp: { w: 10, noflip: true, draw: () => R(-1, -34, 2, 34, "#444") + Cir(0, -36, 5, "#ffe08a", 'class="lm" opacity=".95"') + Cir(0, -36, 14, "#ffe08a", 'opacity=".18"') },
    factory: { w: 64, noflip: true, init: s => { s.sm = 0; },
      draw: () => R(-28, -26, 56, 26, "#a8553a") + Pth("M-28 -26L-14 -36L-14 -26L0 -36L0 -26L14 -36L14 -26Z", "#8a4430") +
        R(-20, -52, 8, 26, "#7a3b28") + R(8, -46, 8, 20, "#7a3b28") + [-20, -8, 4, 16].map(x => R(x, -16, 6, 8, "#ffcf6e")).join(""),
      tick(s, h) { s.sm -= h; if (s.sm <= 0) { s.sm = .5; smoke(s.x - 16, floorY() - 54); smoke(s.x + 12, floorY() - 48); } } },
    brickhouse: { w: 38, init: s => { s.col = hsl(rnd(8, 20), 46, 42); },
      draw: s => R(-16, -26, 32, 26, s.col) + R(-18, -30, 36, 4, "#3b3530") + [-11, 3].map(x => R(x, -21, 7, 8, "#ffe08a")).join("") + R(-3, -12, 6, 12, "#2a1a10") },
    train: { w: 130, mobile: true, init: s => { s.dy = GROUND_H - 12; s.v = chance(.5) ? 70 : -70; s.sm = 0; s.flip = s.v > 0; },
      draw: () => R(-60, -18, 40, 14, "#c0392b") + R(-60, -26, 14, 8, "#333") + R(-36, -30, 6, 12, "#222") + Pth("M-60 -4L-20 -4L-20 -2L-60 -2Z", "#222") +
        [-52, -40, -28].map(x => Cir(x, -3, 5, "#222")).join("") + R(-16, -20, 36, 16, "#3a6ea5") + R(24, -20, 36, 16, "#d6a62a") +
        [-8, 30, 44].map(x => Cir(x, -3, 5, "#222")).join(""),
      tick(s, h) { s.x += s.v * h; s.sm -= h; if (s.sm <= 0) { s.sm = .4; smoke(s.x + (s.v > 0 ? 33 : -33), floorY() + s.dy - 32); } if (s.x > W + 150) s.x = -150; if (s.x < -150) s.x = W + 150; s.flip = s.v > 0; } },
    skyscraper: { w: 32, noflip: true, init: s => { s.h = rnd(62, 128); s.cw = rnd(24, 33); s.col = hsl(210, 16, rnd(30, 52)); s.lit = {}; },
      draw: s => { let o = R(-s.cw / 2, -s.h, s.cw, s.h, s.col) + `<line x1="0" y1="${-s.h}" x2="0" y2="${-s.h - 12}" stroke="#555" stroke-width="1.5"/>`;
        for (let y = 8; y < s.h - 6; y += 10) for (let x = -s.cw / 2 + 4; x < s.cw / 2 - 4; x += 8) o += R(x, -s.h + y, 4, 5, chance(.45) ? "#ffe28a" : "rgba(0,0,0,.28)", `class="wn"`);
        return o; },
      tick(s, h) { s.bt = (s.bt || 0) - h; if (s.bt <= 0) { s.bt = rnd(.6, 2); const w = s.el.querySelectorAll(".wn"); if (w.length) w[Math.random() * w.length | 0].setAttribute("fill", chance(.5) ? "#ffe28a" : "rgba(0,0,0,.28)"); } } },
    car: { w: 30, mobile: true, init: s => { s.dy = GROUND_H - 14; s.v = (chance(.5) ? 1 : -1) * rnd(45, 90); s.col = hsl(rnd(0, 360), 70, 50); s.flip = s.v < 0; },
      draw: s => R(-12, -10, 24, 6, s.col) + R(-7, -15, 14, 6, s.col) + R(-5, -14, 4, 4, "#bfe3ff") + R(1, -14, 4, 4, "#bfe3ff") + Cir(-7, -3, 3.4, "#222") + Cir(7, -3, 3.4, "#222"),
      tick(s, h) { s.x += s.v * h; if (s.x > W + 40) s.x = -40; if (s.x < -40) s.x = W + 40; s.flip = s.v < 0; } },
    plane: { w: 56, mobile: true, init: s => { s.dy = -rnd(160, 300); s.v = (chance(.5) ? 1 : -1) * rnd(110, 160); s.x = s.v > 0 ? -80 : W + 80; s.wait = 0; s.flip = s.v < 0; },
      draw: () => Ell(0, 0, 22, 4, "#f4f1ea") + Pth("M-4 0L-14 -14L-8 -14L6 0Z", "#cfd6dd") + Pth("M-4 2L-14 12L-8 12L6 2Z", "#cfd6dd") + Pth("M-20 0L-26 -8L-22 -8L-16 0Z", "#cfd6dd"),
      tick(s, h) { if (s.wait > 0) { s.wait -= h; return; } s.x += s.v * h; s.flip = s.v < 0; if (chance(h * 10)) smoke(s.x - Math.sign(s.v) * 24, floorY() + s.dy, 1);
        if (s.x > W + 100 || s.x < -100) { s.wait = rnd(8, 20); s.dy = -rnd(160, 300); s.v = (chance(.5) ? 1 : -1) * rnd(110, 160); s.x = s.v > 0 ? -80 : W + 80; s.flip = s.v < 0; } } },
    pad: { w: 50, noflip: true, init: s => { s.ready = true; s.readyT = 0; },
      draw: () => `<g stroke="#8a8f99" stroke-width="2"><line x1="14" y1="0" x2="14" y2="-70"/><line x1="24" y1="0" x2="24" y2="-70"/><path d="M14 -10L24 -22M24 -10L14 -22M14 -30L24 -42M24 -30L14 -42M14 -50L24 -62M24 -50L14 -62" fill="none"/></g>` +
        R(-22, -3, 52, 3, "#666") + `<g class="rk">${Pth("M-6 -14Q-6 -64 2 -72Q10 -64 10 -14Z", "#f4f1ea")}${Pth("M-6 -52Q2 -76 10 -52Z", "#e53935")}${Cir(2, -40, 3.2, "#6fb7ff")}${Pth("M-6 -14L-13 -4L-6 -4Z", "#e53935")}${Pth("M10 -14L17 -4L10 -4Z", "#e53935")}</g>`,
      tick(s, h) { if (!s.ready) { s.readyT -= h; if (s.readyT <= 0) s.ready = true; } s.$(".rk").style.display = s.ready ? "" : "none"; } },
    dome: { w: 52, noflip: true, draw: () => Pth("M-24 0A24 24 0 0 1 24 0Z", "rgba(159,216,255,.45)", 'stroke="#cfe9ff" stroke-width="1.5"') +
      Cir(-8, -6, 5, "#4caf50") + Cir(4, -5, 4, "#66bb6a") + Cir(12, -4, 3.5, "#81c784") + R(-24, -2, 48, 2, "#8a8f99") },
    dish: { w: 30, noflip: true, draw: () => R(-2, -16, 4, 16, "#8a8f99") + `<g class="ds" transform="translate(0 -16)">${Pth("M-13 -2Q0 12 13 -2Z", "#dfe5ec")}<line x1="0" y1="4" x2="0" y2="-10" stroke="#8a8f99" stroke-width="1.5"/>${Cir(0, -10, 1.8, "#e53935")}</g>`,
      tick(s, h) { s.t += h; s.$(".ds").setAttribute("transform", `translate(0 -16) rotate(${(Math.sin(s.t * .5) * 28).toFixed(0)})`); } },
    volcano: { w: 80, temp: true, noflip: true, draw: () => Pth("M-42 0L-10 -50L10 -50L42 0Z", "#6a4a3a") + Pth("M-10 -50L10 -50L6 -46L-6 -46Z", "#e8552a"),
      tick(s, h) { s.sm = (s.sm || 0) - h; if (s.sm <= 0) { s.sm = .12; const f = fx("spark", { x: s.x + rnd(-6, 6), y: floorY() - 50, vx: rnd(-50, 50), vy: -rnd(160, 300), g: 420, life: rnd(.9, 1.5), col: chance(.5) ? "#ff7a1a" : "#ffd23f", r: 2.2 }); if (chance(.25)) smoke(s.x, floorY() - 52); } } },
  };

  // ---------- estructuras ----------
  function addStruct(kind, x, o) {
    const def = KINDS[kind];
    const s = Object.assign({ kind, x, w: def.w, t: rnd(0, 9), built: 0, dying: 0, flip: chance(.5), mobile: !!def.mobile, temp: !!def.temp, _c: {} }, o || {});
    s.$ = sel => s._c[sel] || (s._c[sel] = s.el.querySelector(sel));
    if (def.init) def.init(s);
    s.el = el("g", {}, gStruct); s.el.innerHTML = def.draw(s);
    if (BLD[kind]) { s.el.style.pointerEvents = "all"; s.el.style.cursor = "pointer"; s.el.addEventListener("click", e => { e.stopPropagation(); showBuilding(s, e.clientX, e.clientY); }); }   // los importantes dicen que son
    S.structs.push(s);
    if (!def.mobile) dust(s.x, 10);
    return s;
  }
  function freeX(w, t) {
    const z = zone(t);
    for (let i = 0; i < 40; i++) {
      const x = rnd(Math.max(40, z[0] + 14) + w / 2, Math.min(W - 40, z[1] - 14) - w / 2);
      if (S.structs.every(s => s.mobile || s.dying || s.temp || Math.abs(s.x - x) > (s.w + w) / 2 + 6)) return x;
    }
    return null;
  }
  const alive = (k, t) => S.structs.filter(s => s.kind === k && !s.dying && (t == null || S.unified || s.tribe === t));
  function sacredKind() {   // el tipo de templo depende de la epoca
    const d = S.done, any = d.templo || d.piramide || d.catedral || d.iglesia_cosmica || d.nuevaera || d.fuego_sagrado;
    if (!any) return null;
    if (S.era <= 2) return d.totems || d.fuego_sagrado ? "totem" : null;
    if (S.era === 3) return d.piramide || S.branch[3] ? "pyramid" : "temple";
    if (S.era <= 6) return "cathedral";
    return "orb";
  }
  function GLOBAL(t) {   // lo que se conserva en cualquier epoca una vez descubierto (cada pueblo tiene los suyos)
    const d = S.done, o = {
      cart: d.rueda ? 1 : 0, library: d.escritura || d.imprenta ? 1 : 0, market: d.comercio || d.trueque ? 1 : 0, dog: d.lobos ? 1 : 0,
      lamp: d.electricidad ? (S.unified ? Math.min(7, 2 + S.era) : Math.min(4, 1 + (S.era >> 1))) : 0, academia: d.academia ? 1 : 0, observatory: d.astronomia || d.telescopio_optico ? 1 : 0,
      university: d.universidad ? 1 : 0, laboratory: d.laboratorio ? 1 : 0, hospital: d.antibioticos || d.vacunas ? 1 : 0, antenna: d.radio ? 1 : 0,
      stadium: d.deporte ? 1 : 0, statue: d.heroe ? 1 : 0, castle: d.castillo || d.feudalismo ? 1 : 0,
    };
    const sk = sacredKind();
    if (sk) o[sk] = (t != null && !S.unified && S.tribes[t] ? S.tribes[t].rel2 : S.rel2) && d.reforma ? 2 : 1;
    return o;
  }
  const PLAN = [
    p => ({ cave: p > 5 ? 2 : 1, rock: 3, bones: 2, mammoth: 1 }),
    p => ({ cave: 1, campfire: p > 10 ? 2 : 1, rock: 2, mammoth: 1 }),
    (p, b) => ({ tent: Math.min(6, 2 + (p / 4 | 0)), campfire: 1, mammoth: 1, sheep: b ? 2 : 0 }),
    (p, b) => ({ hut: S.medieval ? Math.min(3, 1 + (p / 8 | 0)) : Math.min(8, 2 + (p / 3 | 0)), field: Math.min(5, 1 + (p / 5 | 0)), sheep: Math.min(5, p / 4 | 0), campfire: 1, windmill: b ? 1 : 0 }),
    (p, b) => b ? { house: Math.min(8, 2 + (p / 4 | 0)), fort: 1, ship: 1, field: 2, hut: 1 } : { house: Math.min(8, 2 + (p / 4 | 0)), windmill: 1 + (p > 25 ? 1 : 0), ship: 1, field: 2 },
    (p, b) => ({ factory: Math.min(4, 1 + (p / 10 | 0)), brickhouse: Math.min(9, 2 + (p / 4 | 0)), train: 1, house: b ? 2 : 0 }),
    (p, b) => S.digital ? { skyscraper: Math.min(10, 2 + (p / 5 | 0)), house: 2, car: Math.min(4, 1 + (p / 12 | 0)), plane: 1, factory: b ? 1 : 0, nuclearplant: 1 }
      : { house: 3, brickhouse: Math.min(4, 1 + (p / 6 | 0)), skyscraper: Math.min(4, 1 + (p / 8 | 0)), car: Math.min(3, 1 + (p / 12 | 0)), plane: 1, factory: 1, nuclearplant: 1, bunker: 1, silo: p >= 6 ? 1 : 0, dish: 1 },
    (p, b) => ({ skyscraper: b ? 6 : 4, pad: 1, dome: Math.min(3, 1 + (p / 15 | 0)), dish: 1, car: 2, plane: 1 }),
    (p, b) => ({ tower: b ? 6 : 4, skyscraper: 3, dome: 2, starport: 1, dish: 1, hovercar: 4, pad: 1 }),
  ];
  function plan() {
    const groups = S.unified ? [null] : S.tribes.map(t => t.i);
    for (const t of groups) planGroup(t);
    if (!S.unified) for (const tr of S.tribes) {   // bandera de cada pueblo en el centro de su territorio
      if (popOf(tr.i) >= 1 && !S.structs.some(q => q.kind === "tflag" && q.tribe === tr.i && !q.dying)) { const z = zone(tr.i); addStruct("tflag", (z[0] + z[1]) / 2, { tribe: tr.i }); }
    }
    rails.style.display = S.era >= 5 ? "" : "none";
  }
  function planGroup(t) {
    const pop = popOf(t), want = Object.assign({}, cultureWant(t, pop), PLAN[S.era](pop, S.branch[S.era]), GLOBAL(t));   // primero lo propio de su cultura
    let added = 0;
    const limit = S.era === 3 || S.era === 4 ? 2 : 1;
    for (const k in want) {
      const have = alive(k, t).length;
      if (have < want[k] && added < limit) {
        const def = KINDS[k];
        if (def.fixed != null && t != null && t > 0) continue;   // el puerto solo en la costa del primer pueblo
        const z = zone(t), x = def.fixed != null ? def.fixed : def.mobile ? rnd(z[0] + 30, z[1] - 30) : freeX(def.w, t);
        if (x != null && !(def.fixed != null && have)) { addStruct(k, x, { tribe: t == null ? 0 : t }); added++; }
      }
    }
    for (const q of S.structs) {   // lo viejo se va retirando
      if (q.dying || q.temp || (t != null && !S.unified && q.tribe !== t)) continue;
      if (alive(q.kind, t).length > (want[q.kind] || 0)) { q.dying = .001; dust(q.x, 8); break; }
    }
  }
  const CULTURES = {
    romana:   { name: "romana",   desc: "construyen un coliseo y acueductos como los romanos",             want: p => ({ colosseum: p >= 6 ? 1 : 0, aqueduct: p >= 4 ? 1 : 0, villa: Math.min(4, 1 + (p / 4 | 0)), academia: 1 }) },
    egipcia:  { name: "egipcia",  desc: "levantan obeliscos y una esfinge como en el antiguo Egipto",      want: p => ({ obelisk: Math.min(3, 1 + (p / 6 | 0)), sphinx: p >= 5 ? 1 : 0, pyramid: 1 }) },
    vikinga:  { name: "vikinga",  desc: "construyen casas largas y piedras rúnicas como los vikingos",     want: p => ({ longhouse: Math.min(4, 1 + (p / 5 | 0)), runestone: Math.min(3, 1 + (p / 8 | 0)) }) },
    china:    { name: "china",    desc: "levantan pagodas y una gran muralla como en la antigua China",    want: p => ({ pagoda: Math.min(3, 1 + (p / 6 | 0)), greatwall: p >= 6 ? 1 : 0, pavilion: Math.min(3, 1 + (p / 6 | 0)) }) },
    japonesa: { name: "japonesa", desc: "construyen pagodas, dojos y puertas torii como en el Japón feudal", want: p => ({ pagoda: 1, torii: 1, dojo: Math.min(2, 1 + (p / 8 | 0)) }) },
    azteca:   { name: "azteca",   desc: "erigen pirámides escalonadas como los aztecas",                   want: p => ({ stepped: Math.min(2, 1 + (p / 8 | 0)), market: 1 }) },
    arabe:    { name: "árabe",    desc: "levantan palacios de cúpulas y minaretes como en los califatos",  want: p => ({ palace: Math.min(2, 1 + (p / 8 | 0)), market: 1 }) },
    mongola:  { name: "mongola",  desc: "viven en yurtas y cabalgan por la estepa como los mongoles",      want: p => ({ yurt: Math.min(5, 2 + (p / 4 | 0)) }) },
    europea:  { name: "europea",  desc: "construyen castillos y molinos como en la Europa medieval",       want: p => ({ castle: 1, windmill: 1 }) },
    india:    { name: "india",    desc: "levantan un mausoleo de mármol como en la India de los mogoles",  want: p => ({ taj: 1, palace: p >= 6 ? 1 : 0 }) },
  };
  function assignCultures(forced) {
    const keys = shuffle(Object.keys(CULTURES));
    S.tribes.forEach((t, i) => { t.cult = forced && forced[i] && CULTURES[forced[i]] ? forced[i] : keys[i]; });
  }
  const eraName = () => S.era === 3 && S.medieval ? "Antigüedad y Edad Media" : S.era === 6 && S.digital ? "Era digital" : ERAS[S.era].name;
  function startDigital() {   // la era nuclear da paso a la era digital
    S.digital = true; showBanner("Era digital"); logEv(`Termina la era nuclear y comienza la era digital: computadores, redes y datos por todas partes`);
  }
  function startMedieval() {   // la segunda mitad de la era sedentaria: grandes culturas del mundo
    S.medieval = true; assignCultures();
    showBanner("Antigüedad y Edad Media");
    logEv(`Comienza la Antigüedad y la Edad Media: el mundo se llena de grandes culturas`);
    S.tribes.forEach((t, i) => later(1.5 + i * 2.5, () => logEv(`${tn(i)} ${CULTURES[t.cult].desc}`)));
  }
  function cultureWant(t, pop) {   // lo que construye cada pueblo segun su cultura (en la era colonial queda a la mitad)
    const tr = t == null ? null : S.tribes[t];
    if (S.era < 3 || S.era > 4) return {};
    if (S.unified || !tr || !tr.cult || (S.era === 3 && !S.medieval)) return {};
    const w = CULTURES[tr.cult].want(pop);
    if (S.era === 4) for (const k in w) w[k] = Math.min(w[k], 1);
    return w;
  }
  // sucesos de las culturas
  function gladiators() {
    const c = alive("colosseum")[0]; if (!c) return;
    const gs = alive2(c.tribe).filter(g => Math.abs(g.x - c.x) < 400).slice(0, 8); if (gs.length < 4) return;
    sendTo(gs[0], c.x - 18, "fight", 1, 7); sendTo(gs[1], c.x + 18, "fight", -1, 7);
    gs.slice(2).forEach((g, i) => sendTo(g, c.x + (i % 2 ? 1 : -1) * (52 + (i >> 1) * 14), "cheer", 0, 7));
    logEv(`Combates de gladiadores en el Coliseo de ${tn(c.tribe)}`);
    later(7.5, () => { const l = pick([gs[0], gs[1]]); l.act = "ko"; l.stay = 3; l.m.t = 0; boom(c.x, floorY() - 14, false); floatText(c.x, floorY() - 46, "¡Ave!"); });
    later(11, () => releaseAll(gs));
  }
  function legion() {
    const t = S.tribes.find(q => q.cult === "romana"), gs = t ? alive2(t.i).slice(0, 8) : []; if (gs.length < 5) return;
    const z = zone(t.i), dir = z[0] < W / 2 ? 1 : -1, tx = dir > 0 ? z[1] - 20 : z[0] + 20;
    gs.forEach((g, i) => { sendTo(g, tx - dir * i * 12, "cheer", dir, 6); g.act = "walk"; g.sp = 1; });
    logEv(`Las legiones de ${tn(t.i)} marchan hacia la frontera`); dipAdd(t.i, (t.i + 1 + Math.floor(Math.random() * 2)) % 3, -1);
    later(14, () => { sendHome(gs, t.i); later(6, () => releaseAll(gs)); });
  }
  function horde() {
    const t = S.tribes.find(q => q.cult === "mongola"); if (!t || S.unified) return;
    const dir = chance(.5) ? 1 : -1, dur = 5.5, x0 = dir > 0 ? -60 : W + 60;
    for (let i = 0; i < 6; i++) later(i * .35, () => {
      const f = fx("g", { x: x0, y: floorY() + 10 + (i % 3) * 5, vx: dir * (W + 120) / dur, life: dur, flip: dir < 0,
        html: `<g transform="scale(1.1)">${Ell(0, -9, 11, 5, "#5a3b22")}${R(-8, -5, 2.4, 6, "#3b2616")}${R(6, -5, 2.4, 6, "#3b2616")}${Cir(11, -13, 3.4, "#5a3b22")}${R(-2, -20, 4, 9, "#c0392b")}${Cir(0, -22, 2.6, "#d9b66a")}</g>` });
      f.dt = 0; f.tick = (g, h) => { g.dt -= h; if (g.dt <= 0) { g.dt = .35; destroyAt(g.x, 36, .25); dust(g.x, 1); } };
    });
    logEv(`Una horda de jinetes de ${tn(t.i)} cabalga a toda velocidad por las llanuras`); S.shake = 1;
  }


  // ---------- efectos ----------
  const COSM = { puff: 1, spark: 1, conf: 1, flake: 1, drop: 1 };
  function fx(type, o) {
    const f = Object.assign({ type, life: 1, t: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, col: "#fff" }, o);
    f.life0 = f.life;
    if (COSM[type] && S.fx.length >= FX_MAX) return f;   // demasiadas particulas a la vez: esta se omite
    if (type === "puff") f.e = el("circle", { r: f.r0 || 3, fill: f.col }, gFx);
    else if (type === "spark") f.e = el("circle", { r: f.r || 1.8, fill: f.col }, gFx);
    else if (type === "conf") f.e = el("rect", { width: 5, height: 3, fill: f.col }, gFx);
    else if (type === "drop") f.e = el("line", { stroke: "#7fb2e5", "stroke-width": 1.2 }, gFx);
    else if (type === "flake") f.e = el("circle", { r: 1.8, fill: "#fff" }, gFx);
    else if (type === "flash") f.e = el("circle", { r: 4, fill: f.col }, gFx);
    else if (type === "line") f.e = el("line", { x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, stroke: f.col, "stroke-width": f.w || 2, "stroke-linecap": "round" }, gFx);
    else if (type === "code") { f.e = el("text", { "font-size": 13, style: "fill:#3df57a;font-family:monospace;font-weight:700" }, gFx); f.e.textContent = pick(["0", "1", "ｱ", "ﾊ", "ﾐ", "ｦ", "2", "7"]); }
    else if (type === "note") { f.e = el("text", { "font-size": 15, style: "fill:" + (f.col || "#7a5af0") + ";font-weight:700" }, gFx); f.e.textContent = pick(["♪", "♫", "♬"]); }
    else if (type === "proj") {
      f.e = f.kind === "stone" ? el("circle", { r: 3, fill: "#6d6a64" }, gFx) : f.kind === "ball" ? el("circle", { r: 3.6, fill: "#222" }, gFx)
        : el("line", { stroke: f.kind === "arrow" ? "#6b4a2a" : f.kind === "laser" ? "#ff4d6d" : "#ffe14d", "stroke-width": f.kind === "laser" ? 2.4 : 1.8, "stroke-linecap": "round" }, gFx);
    } else if (type === "g") { f.e = el("g", {}, gFx); f.e.innerHTML = f.html; }
    S.fx.push(f);
    return f;
  }
  const smoke = (x, y, big) => fx("puff", { x, y, vx: rnd(-6, 6), vy: -rnd(18, 30), r0: 2.5, r1: big ? 5 : 9, life: rnd(1.4, 2.2), col: "#8a8f99", op: .55 });
  const dust = (x, n) => { for (let i = 0; i < n; i++) fx("puff", { x: x + rnd(-14, 14), y: floorY() + rnd(2, 8), vx: rnd(-25, 25), vy: -rnd(5, 25), r0: 2, r1: 7, life: rnd(.5, .9), col: "#b9a98a", op: .6 }); };
  const burst = (x, y, n, col, sp) => { for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), v = rnd(.3, 1) * sp; fx("spark", { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * .3, g: 200, life: rnd(.4, .9), col }); } };
  function boom(x, y, big) {
    fx("flash", { x, y, r0: 4, r1: big ? 46 : 20, life: .35, col: "#ffd27a", op: .9 });
    for (let i = 0; i < (big ? 9 : 4); i++) fx("puff", { x: x + rnd(-8, 8), y: y + rnd(-6, 4), vx: rnd(-30, 30), vy: -rnd(10, 40), r0: 3, r1: big ? 16 : 10, life: rnd(.7, 1.3), col: pick(["#6b6b6b", "#8a8a8a", "#3b3b3b"]), op: .75 });
    burst(x, y, big ? 14 : 6, "#ff9a3c", 130);
  }
  function fireworks(x, y) {
    const h = rnd(0, 360);
    for (let i = 0; i < 30; i++) { const a = i / 30 * 6.28, v = rnd(70, 120); fx("spark", { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 90, life: rnd(.9, 1.4), col: `hsl(${h + rnd(-30, 30)} 90% 60%)`, r: 2 }); }
  }
  function fxStep(h) {
    for (const f of S.fx) {
      f.t += h; f.life -= h; f.vy += f.g * h; f.x += f.vx * h; f.y += f.vy * h;
      const u = 1 - f.life / f.life0, e = f.e;
      switch (f.type) {
        case "puff": case "flash":
          e.setAttribute("cx", f.x.toFixed(1)); e.setAttribute("cy", f.y.toFixed(1)); e.setAttribute("r", lerp(f.r0, f.r1, u).toFixed(1));
          e.setAttribute("opacity", ((f.op || 1) * (1 - u)).toFixed(2)); break;
        case "spark": case "flake":
          e.setAttribute("cx", f.x.toFixed(1)); e.setAttribute("cy", f.y.toFixed(1)); e.setAttribute("opacity", clamp(f.life / f.life0 * 1.6, 0, 1).toFixed(2));
          if (f.type === "flake") { f.vx = Math.sin(f.t * 2 + f.x) * 14; if (f.y > floorY()) f.life = 0; } break;
        case "conf": e.setAttribute("transform", `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${(f.t * 300).toFixed(0)})`); f.vx = Math.sin(f.t * 4 + f.y) * 20; if (f.y > floorY() + 20) f.life = 0; break;
        case "drop": e.setAttribute("x1", f.x.toFixed(1)); e.setAttribute("y1", f.y.toFixed(1)); e.setAttribute("x2", (f.x - 2).toFixed(1)); e.setAttribute("y2", (f.y - 9).toFixed(1)); if (f.y > floorY() + 8) f.life = 0; break;
        case "proj": {
          if (f.e.tagName === "circle") { e.setAttribute("cx", f.x.toFixed(1)); e.setAttribute("cy", f.y.toFixed(1)); }
          else { const n = Math.hypot(f.vx, f.vy) || 1, L = f.kind === "arrow" ? 11 : f.kind === "laser" ? 16 : 7; e.setAttribute("x1", f.x.toFixed(1)); e.setAttribute("y1", f.y.toFixed(1)); e.setAttribute("x2", (f.x - f.vx / n * L).toFixed(1)); e.setAttribute("y2", (f.y - f.vy / n * L).toFixed(1)); }
          if (f.y >= floorY() + 2 || f.x < -20 || f.x > W + 20 || (f.tx != null && Math.abs(f.x - f.tx) < 6)) { f.life = 0; if (f.kind === "ball" || f.kind === "bullet" || f.kind === "laser") boom(f.x, Math.min(f.y, floorY() + 4), false); else dust(f.x, 2); }
          break;
        }
        case "line": e.setAttribute("opacity", clamp(f.life / f.life0, 0, 1).toFixed(2)); break;
        case "code": case "note": e.setAttribute("x", f.x.toFixed(0)); e.setAttribute("y", f.y.toFixed(0)); e.setAttribute("opacity", clamp(f.life / f.life0 * 1.4, 0, 1).toFixed(2)); break;
        case "g": f.e.setAttribute("transform", `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})` + (f.flip ? " scale(-1 1)" : "") + (f.rotate ? ` rotate(${f.rotate.toFixed(0)})` : "")); if (f.tick) f.tick(f, h); break;
      }
    }
    S.fx = S.fx.filter(f => { if (f.life <= 0) { if (f.onEnd) f.onEnd(f); f.e.remove(); return false; } return true; });
  }

  // ---------- monos del mundo ----------
  const groundMons = () => S.mon.filter(g => g.state === "ground" && !(g.dead > 0));
  const free = () => groundMons().filter(g => !g.hold);
  const MODE_OF = { sit: "rest", sleep: "sleep", work: "work", cheer: "cheer", fight: "fight", ko: "ko", eat: "eat", idle: "rest" };
  const rectOf = {};   // cache por cuadro
  const cardRect = c => rectOf[c.dataset.id || (c.dataset.id = Math.random())] || (rectOf[c.dataset.id] = c.getBoundingClientRect());

  // mensajes que cruzan el cielo de vez en cuando (el laboratorio vigila)
  const SKY_MSGS = [
    "¡Dejen de ver monos y vayan a trabajar!", "¿Cómo vas con tu experimento?", "¿Y el paper? ¿Y el código?", "¿Ya escribiste hoy tu tesis?", "Harto de tesis… ¡pero a seguir!",
    "¿Cómo están tus bacterias?", "¿Y tu ADN? ¿Ya lo secuenciaste?", "¿Qué tal van esos genomas?", "¿Ya ensamblaste ese genoma?", "¿Corriste el alineamiento?",
    "¿Y el árbol filogenético?", "¿Pasaste el control de calidad?", "¿Hiciste el backup de tus datos?", "El cluster no se llena solo: ¡a correr jobs!", "¿Cuántas lecturas tienes hoy?",
    "¿Revisaste tus controles negativos?", "¿Anotaste ya tu genoma?", "Tu tesis te extraña", "¿Y la discusión? ¿Y las conclusiones?", "Gracias por mirar monos. Ahora, ¡a trabajar!",
    "¿Cómo va tu PCR?", "¿Pipeteaste hoy?", "¿Leíste el paper de la semana?", "Recuerda citar bien tus referencias", "¿Y las figuras? ¡Que se vean bonitas!",
    "El revisor 2 te está mirando…", "¿Ya preparaste tu seminario?", "¿Subiste tus secuencias a GenBank?", "Mejor un commit hoy que una tesis mañana", "¿Código sin comentarios? ¡Ay!",
    "¿Y el medio de cultivo? ¿Ya lo autoclavaste?", "¿Cuánto crecieron tus Acidithiobacillus?", "¿Mapeaste las lecturas contra el genoma?", "¿Cuántos contigs tienes?", "¿Tu hipótesis sigue en pie?",
    "Tesis, tesis, tesis…", "¿Ya escribiste los métodos?", "¿Y la reproducibilidad, eh?", "¡Un párrafo más y descansas!", "¿Hoy toca bioinformática o bañera?",
  ];
  const SKY_MSGS_MORE = [
    // bioinformatica: del dato crudo al árbol
    "¿Ya corriste FastQC en tus lecturas?", "¿Recortaste los adaptadores?", "¿Cuántas lecturas pasaron el filtro de calidad?", "¿SPAdes o MEGAHIT? Esa es la cuestión", "¿Tu ensamblaje tiene un buen N50?",
    "¿Pasó CheckM? ¿Completitud y contaminación?", "¿Ya corriste GTDB-Tk?", "¿Anotaste con Prokka o con Bakta?", "¿Y el PGAP? ¿Ya terminó?", "¿Cómo va DRAM con tus MAGs?",
    "¿Revisaste los resultados de DRAM2?", "¿Alineaste con MAFFT?", "¿Recortaste el alineamiento con trimAl?", "¿IQ-TREE ya eligió el modelo (ModelFinder)?", "¿Cuántos UFBoot llevas? ¿10 000?",
    "¿Ya miraste el árbol en iTOL?", "¿Subiste las secuencias a NCBI?", "¿ANI sobre 95 %? ¿Es la misma especie?", "¿Y el pangenoma? ¿Core o accesorio?", "¿Mapeaste las lecturas con BWA o Bowtie2?",
    "¿Revisaste la cobertura de tus MAGs?", "¿Hiciste el binning con MetaBAT?", "¿Qué dice BLAST de esa secuencia rara?", "¿Y la anotación funcional con KEGG?", "¿Cuántos genes de oxidación de hierro y azufre encontraste?",
    "¿Buscaste el operón rus en tus genomas?", "¿Hay genes sox y tetH en tus Acidithiobacillia?", "¿Ya comparaste tu 16S contra SILVA?", "¿Cuántas secuencias 16S dereplicaste?", "¿Ya miraste el árbol en TreeViewer?",
    "¿Tu script corre sin errores o solo en tu mente?", "¿Versionaste tu pipeline en git?", "¿Tu entorno de conda es reproducible?", "¿Tienes espacio en disco para los BAM?", "¿Cuántos núcleos está usando tu job?",
    "¿Se cayó el job a las 3 AM? Revísalo", "¿Cómo va tu job en el cluster?", "¿Pediste suficientes horas de cómputo?", "¿Moviste tus datos fuera de /scratch?", "¿Documentaste los parámetros de cada herramienta?",
    "¿Qué versión de la base de datos usaste?", "¿Guardaste las semillas de tus análisis aleatorios?", "¿Comprobaste el e-value antes de creerle a BLAST?", "¿Y si revisas los outliers de tu árbol?", "¿Tu dendrograma tiene una raíz razonable?",
    "¿Exportaste el árbol en Newick?", "¿Comparaste con un genoma de referencia?", "¿Cuántos genes hipotéticos quedaron sin anotar?", "¿Probaste a anotar de nuevo con otra base de datos?", "¿Ya limpiaste los archivos temporales del cluster?",
    // laboratorio húmedo
    "¿Cómo están tus bacterias hoy?", "¿Ya pasaste tus cultivos a medio fresco?", "¿Revisaste el pH de tu medio?", "¿Cuánto Fe(II) queda en tu cultivo?", "¿Ya autoclavaste el medio 9K?",
    "¿Tus Acidithiobacillus crecen o se hacen los dormidos?", "¿Extrajiste ADN? ¿Qué dice el NanoDrop?", "¿Cuál es tu 260/280?", "¿Corriste el gel? ¿Se ve la banda?", "¿Cómo salió tu PCR? ¿Control negativo limpio?",
    "¿Calibraste el pHmetro?", "¿Rotulaste tus tubos?", "¿Pipeteaste con puntas nuevas?", "¿Y si repites el experimento por triplicado?", "¿Anotaste todo en tu cuaderno de laboratorio?",
    "¿Cuántas réplicas biológicas tienes?", "¿Limpiaste el mesón antes de irte?", "¿Guardaste las muestras a −80 °C?", "¿Revisaste la fecha de tus reactivos?", "¿Hiciste el conteo de células?",
    "¿La curva de crecimiento ya entró en fase exponencial?", "¿Preparaste tus alícuotas?", "¿Esterilizaste las puntas?", "¿La centrífuga está balanceada?", "¿Alguien apagó el autoclave?",
    // tesis, paper y vida de laboratorio
    "¿Ya hiciste el esquema de la tesis?", "¿Ya lo revisó quien guía tu tesis?", "¿Respondiste los comentarios del revisor 2?", "¿Tu paper ya tiene un título pegajoso?", "¿Y el abstract? Que sea corto",
    "¿Tienes las figuras en alta resolución?", "¿Definiste todas las abreviaturas?", "¿La bibliografía sigue el formato de la revista?", "¿Cuántas veces escribiste «novedoso»? Borra algunas", "¿Y la carta de presentación?",
    "¿Cuándo es la fecha límite? ¡Ahora!", "¿Ya agradeciste al financiamiento?", "¿Y el material suplementario?", "¿Revisaste la ortografía del manuscrito?", "¿Y las tablas? ¿Están en orden?",
    "Antes de irte: ¿lanzaste los jobs?", "Los genomas no se ensamblan mirando monos", "Un cluster ocupado es un cluster feliz", "Quien no hace backup, llora", "El mejor momento para comentar el código fue ayer",
    "Se acabaron las puntas azules… otra vez", "¿Quién se tomó mi café?", "Hoy toca bioinformática, mañana también", "¡Un figure al día mantiene al revisor lejos!", "Cada error de script es un aprendizaje (y un café)",
    // datos curiosos
    "Dato: la E. coli se divide cada ~20 minutos", "Dato: tu genoma tiene ~3.100 millones de pares de bases", "Dato: el gen 16S mide unos 1.500 pb", "Dato: los Acidithiobacillus viven felices a pH ~2",
    "Dato: el primer genoma bacteriano completo fue el de Haemophilus influenzae (1995)", "Dato: pH 2 es unas 100.000 veces más ácido que el agua pura", "Dato: los ribosomas bacterianos son 70S",
    "Dato: la PCR la inventó Kary Mullis", "Dato: la doble hélice del ADN se publicó en 1953", "Dato: CRISPR nació como defensa de las bacterias contra los virus", "Dato: los bacteriófagos son virus que infectan bacterias",
    "Dato: en el desierto de Atacama viven bacterias extremófilas", "Dato: una bacteria puede intercambiar genes con otra por conjugación", "Dato: el ADN de una bacteria suele ser un cromosoma circular",
  ];
  SKY_MSGS_MORE.push(   // "a trabajar" y cosas de los temas del laboratorio (acidófilos, hierro/azufre, elementos móviles, genómica, IA)
    "Dejen de mirar animalitos: ¡a trabajar!", "¿Y si en vez de mirar monos abres el script?", "Cierra YouTube y abre RStudio", "Esa tesis no se escribe sola", "Los revisores no esperan",
    "¿Qué haces mirando esto? ¡Al trabajo!", "Menos nubes, más análisis", "El paper de tu vida empieza con un párrafo", "Los datos no se analizan solos… todavía", "¿Y el commit de hoy?",
    "¿Ya tienes listo el póster para el SCB?", "El SCB se acerca: ¿y tu resumen?", "SOMICH a la vista: ¿ya tienes tu presentación?", "¿Revisaste el programa del SOMICH?", "¿Preparaste tu seminario?",
    "¿Leíste algún paper de la cinta de abajo hoy?", "Hay papers nuevos en el feed: ¡a leer!", "¿Qué dice el último preprint de bioRxiv?", "Lee un abstract: es solo un minuto",
    "¿Tu Acidithiobacillus ya oxidó el hierro?", "¿A. caldus ya creció a 45 °C?", "¿Probaste A. thiooxidans con azufre elemental?", "¿Comparaste A. ferrooxidans con A. ferrivorans?", "¿Qué vive hoy en el volcán Copahue?",
    "¿Tu muestra viene de una mina de cobre?", "¿Cuánto cobre soltó tu cultivo?", "¿Revisaste el pH de la pila de lixiviación?", "¿Ya biolixiviaste hoy?", "El hierro es vida (si eres un acidófilo)",
    "¿Cuántos elementos móviles hay en tu genoma?", "¿Revisaste las secuencias de inserción (IS)?", "¿Y si ese plásmido viene de otro Acidithiobacillia?", "¿Ya miraste los sistemas CRISPR-Cas de tus cepas?", "¿Hay sistemas de restricción-modificación en tu genoma?",
    "¿Qué regulador Fur tiene tu cepa?", "¿Cómo regula el hierro tu bacteria?", "¿Hay clústeres Fe-S en tu anotación?", "¿Está completo el operón rus?", "¿Anotaste los genes de fijación de carbono?",
    "¿Cuántos Acidithiobacillia hay en GTDB?", "¿Ya ubicaste tus MAGs en el árbol de Acidithiobacillia?", "¿Tu árbol tiene soporte suficiente?", "¿Y el pangenoma? ¿Core, shell o cloud?", "¿Qué genes son únicos de tu cepa?",
    "¿Probaste un modelo de lenguaje de proteínas con los genes hipotéticos?", "¿Y si le preguntas a AlphaFold por esa proteína rara?", "¿Tus datos están limpios antes de entrenar el modelo?", "Aprendizaje automático: ¿tienes suficientes datos?", "La IA ayuda, pero alguien debe validar los resultados",
    "¿Snakemake o Nextflow? Elige uno y trabaja", "¿Tu pipeline corre sin que tú lo mires?", "¿Tu script tiene un README?", "¿Probaste con menos hilos? A veces rinde más", "Un -j más no arregla un script malo",
    "La reproducibilidad empieza hoy", "¿Las figuras se leen en blanco y negro?", "Cada gráfico necesita su leyenda", "¿Revisaste los ejes de tu gráfico?", "¿Tu cluster te extraña?",
    "Dato: A. ferrooxidans obtiene energía oxidando hierro (Fe II)", "Dato: A. thiooxidans vive de oxidar compuestos de azufre", "Dato: con biolixiviación se extrae cobre de minerales pobres", "Dato: los acidófilos mantienen su interior cerca de pH neutro",
    "Dato: los transposones son fragmentos de ADN que saltan de un lugar a otro", "Dato: las bacterias tienen sistemas inmunes como CRISPR y restricción-modificación", "Dato: un pangenoma reúne todos los genes de un grupo de cepas", "Dato: GTDB reordenó la taxonomía de miles de bacterias",
    "Dato: IQ-TREE puede elegir solo el mejor modelo evolutivo", "Dato: AlphaFold predice estructuras de proteínas con inteligencia artificial", "Dato: el hierro y el azufre son comida para muchos acidófilos", "Dato: un MAG es un genoma reconstruido a partir de un metagenoma",
  );
  let skyDeck = [];
  function skyMessage(fixed, atX) {
    if (!skyDeck.length) skyDeck = shuffle(SKY_MSGS.concat(SKY_MSGS_MORE));
    const txt = typeof fixed === "string" ? fixed : skyDeck.pop(), w = txt.length * 9 + 104, dir = chance(.5) ? 1 : -1, y0 = skyY(rnd(.42, .68)), dur = rnd(24, 32);
    // una nube gordita: base redondeada, ruedas de esponja arriba (mas grandes al centro) y una sombra azulada abajo para dar volumen
    const n = Math.max(3, Math.round(w / 78)), lo = -w / 2 + 40, hi = w / 2 - 40;
    const puffs = Array.from({ length: n }, (_, i) => { const t = n === 1 ? .5 : i / (n - 1), r = 24 + 16 * Math.sin(Math.PI * t) + ((i * 5) % 3) * 3; return [lo + (hi - lo) * t, -4 - r * .5, r]; });
    puffs.push([-w / 2 + 30, 10, 26], [w / 2 - 30, 10, 26]);
    const shapes = dy => `<rect x="${-w / 2 + 22}" y="${-8 + dy}" width="${w - 44}" height="44" rx="22"/>` + puffs.map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y + dy}" r="${r.toFixed(1)}"/>`).join("");
    fx("g", { x: atX != null ? atX : dir > 0 ? -w / 2 - 10 : W + w / 2 + 10, y: y0, vx: dir * (W + w + 20) / dur, life: dur,
      html: `<g style="fill:#9db2d3" opacity=".35">${shapes(7)}</g><g style="fill:var(--cloud)" opacity=".97">${shapes(0)}</g>` +
        `<text text-anchor="middle" y="19" style="fill:var(--text);font-size:15px;font-weight:700">${txt}</text>`,
      tick: g => { g.y = y0 + Math.sin(g.t * .8) * 6; } });
  }
  // ---------- cielo vivo: nubes que pasan, pajaros, sol o luna, estrellas fugaces, luciernagas y mariposas ----------
  const gAmb = el("g", { "pointer-events": "none", "clip-path": "url(#ambclip)" }, gSky); gSky.insertBefore(gAmb, dark);   // detras de edificios y animales
  const celest = el("g", {}, gAmb), AMB = { clouds: [], flocks: [], flies: [], bf: [], cloudT: 0, birdT: 10, starT: 25, theme: null, init: false };
  function cloudMarkup(w) {   // nube esponjosa sin texto (mismo dibujo que las de los mensajes, sin sombra pesada)
    const n = Math.max(3, Math.round(w / 78)), lo = -w / 2 + 40, hi = w / 2 - 40;
    const puffs = Array.from({ length: n }, (_, i) => { const t = n === 1 ? .5 : i / (n - 1), r = 24 + 16 * Math.sin(Math.PI * t) + ((i * 5) % 3) * 3; return [lo + (hi - lo) * t, -4 - r * .5, r]; });
    puffs.push([-w / 2 + 30, 10, 26], [w / 2 - 30, 10, 26]);
    const shapes = dy => `<rect x="${-w / 2 + 22}" y="${-8 + dy}" width="${w - 44}" height="44" rx="22"/>` + puffs.map(([x, y, r]) => `<circle cx="${x.toFixed(1)}" cy="${y + dy}" r="${r.toFixed(1)}"/>`).join("");
    return `<g style="fill:#9db2d3" opacity=".3">${shapes(8)}</g><g style="fill:var(--cloud)">${shapes(0)}</g>`;
  }
  const isNight = () => document.documentElement.dataset.theme === "dark";
  function drawCelestial(night) {
    celest.innerHTML = night
      ? `<circle r="48" fill="#cfd8ff" opacity=".09"/><circle r="32" fill="#cfd8ff" opacity=".13"/><circle r="21" fill="#f3f0d6"/><circle cx="-6" cy="-5" r="4" fill="#d9d4b4" opacity=".7"/><circle cx="7" cy="6" r="5.5" fill="#d9d4b4" opacity=".6"/><circle cx="5" cy="-9" r="2.5" fill="#d9d4b4" opacity=".6"/>`
      : `<circle r="64" fill="#fff6c2" opacity=".25"/><circle r="43" fill="#ffee9a" opacity=".33"/><circle r="26" fill="#ffd84a"/>`;
  }
  function spawnCloud(x) {
    const d = Math.random(), w = rnd(150, 300), s = .55 + d * .95, e = el("g", {}, gAmb);
    e.innerHTML = cloudMarkup(w);
    AMB.clouds.push({ e, x: x != null ? x : -w * s / 2 - 20, f: rnd(.04, .6), s, w, vx: 3 + d * 9, op: .5 + d * .35 });
  }
  function spawnFlock() {   // bandada en V
    const dir = chance(.5) ? 1 : -1, sz = rnd(.9, 1.4), n = Math.floor(rnd(3, 8)), e = el("g", {}, gAmb), birds = [];
    for (let i = 0; i < n; i++) {
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      birds.push({ dx: -dir * row * 15 * sz, dy: i ? side * row * 7 * sz : 0, ph: rnd(0, 6.28), p: el("path", { fill: "none", stroke: "#2f3a48", "stroke-width": 1.7, "stroke-linecap": "round", "stroke-linejoin": "round" }, e) });
    }
    AMB.flocks.push({ e, birds, sz, x: dir > 0 ? -80 : W + 80, f: rnd(.08, .5), vx: dir * rnd(55, 85), t: 0 });
  }
  function ambient(h) {
    const night = isNight(), space = S.era >= 7, calm = !S.saga;
    if (night !== AMB.theme) { AMB.theme = night; drawCelestial(night); }
    celest.setAttribute("transform", `translate(${(W * .88).toFixed(0)} ${skyY(.2).toFixed(0)}) scale(${FEST.season === "verano" ? 1.3 : 1})`); celest.style.display = space || SKYOFF ? "none" : "";
    const base = (FEST.season === "invierno" ? 8 : FEST.season === "verano" ? 3 : 6) - (LOW ? 2 : 0), want = space || SKYOFF ? 0 : night ? Math.max(2, base - 2) : base;
    if (!AMB.init) { AMB.init = true; for (let i = 0; i < want; i++) spawnCloud(rnd(-60, W)); }
    // desde que empieza la civilizacion el fondo es una imagen fija: nada se mueve (solo pasan las nubes con mensajes)
    if (S.started && !SKYOFF) {
      if (AMB.flocks.length || AMB.flies.length || AMB.bf.length) { [].concat(AMB.flocks, AMB.flies, AMB.bf).forEach(o => o.e.remove()); AMB.flocks = []; AMB.flies = []; AMB.bf = []; }
      const sig = W + "," + SKY + "," + night + "," + FEST.season + "," + space;
      if (AMB.sig !== sig) {   // solo se vuelve a colocar si cambia la pantalla, el dia/noche o la estacion
        AMB.sig = sig;
        for (const c of AMB.clouds) { c.e.setAttribute("transform", `translate(${c.x.toFixed(1)} ${skyY(c.f).toFixed(1)}) scale(${c.s.toFixed(2)})`); c.e.setAttribute("opacity", (c.op * (night ? .75 : 1)).toFixed(2)); }
        AMB.clouds = AMB.clouds.filter(c => { if (space || c.x > W + c.w * c.s) { c.e.remove(); return false; } return true; });
      }
      festive(h); return;
    }
    // nubes que cruzan despacio (mas lejos = mas chicas, lentas y claras)
    AMB.cloudT -= h; if (AMB.clouds.length < want && AMB.cloudT <= 0) { AMB.cloudT = rnd(6, 14); spawnCloud(); }
    for (const c of AMB.clouds) { c.x += c.vx * h; c.e.setAttribute("transform", `translate(${c.x.toFixed(1)} ${skyY(c.f).toFixed(1)}) scale(${c.s.toFixed(2)})`); c.e.setAttribute("opacity", (c.op * (night ? .75 : 1)).toFixed(2)); }
    AMB.clouds = AMB.clouds.filter(c => { if (space || c.x > W + c.w * c.s) { c.e.remove(); return false; } return true; });
    // pajaros de dia
    AMB.birdT -= h; if (AMB.birdT <= 0) { AMB.birdT = rnd(40, 90); if (!night && !space && calm && !SKYOFF) spawnFlock(); }
    for (const f of AMB.flocks) {
      f.t += h; f.x += f.vx * h; const y = skyY(f.f) + Math.sin(f.t * .6) * 6;
      f.e.setAttribute("transform", `translate(${f.x.toFixed(1)} ${y.toFixed(1)})`);
      for (const b of f.birds) { const a = Math.sin(f.t * 8 + b.ph) * 4 * f.sz, k = f.sz; b.p.setAttribute("d", `M${(b.dx - 6 * k).toFixed(1)} ${(b.dy + a).toFixed(1)}Q${(b.dx - 3 * k).toFixed(1)} ${(b.dy - 4 * k).toFixed(1)} ${b.dx.toFixed(1)} ${b.dy.toFixed(1)}Q${(b.dx + 3 * k).toFixed(1)} ${(b.dy - 4 * k).toFixed(1)} ${(b.dx + 6 * k).toFixed(1)} ${(b.dy + a).toFixed(1)}`); }
    }
    AMB.flocks = AMB.flocks.filter(f => { if (f.x < -120 || f.x > W + 120) { f.e.remove(); return false; } return true; });
    // luciernagas de noche y mariposas de dia, cerca del suelo
    const lowOk = !space && calm && !SKYMIN && !SKYOFF;   // mariposas y luciernagas vuelan junto a los animales: no en la TV
    const wantFl = night && lowOk ? 6 : 0, wantBf = !night && lowOk ? (FEST.season === "primavera" ? 3 : 2) : 0;
    while (AMB.flies.length < wantFl) { const e = el("g", {}, gAmb); e.innerHTML = `<circle r="5" fill="#d8ff6a" opacity=".22"/><circle r="1.7" fill="#eaffa0"/>`; AMB.flies.push({ e, x: rnd(0, W), oy: rnd(10, 95), vx: rnd(-8, 8), ph: rnd(0, 6.28), t: 0 }); }
    while (AMB.bf.length < wantBf) { const e = el("g", {}, gAmb), col = pick(["#ff8fb3", "#ffb347", "#8fd0ff", "#c79bff", "#fff27a"]); e.innerHTML = `<ellipse class="w1" cx="-2.5" cy="0" rx="3" ry="4" fill="${col}"/><ellipse class="w2" cx="2.5" cy="0" rx="3" ry="4" fill="${col}"/><rect x="-.5" y="-3" width="1" height="6" fill="#444"/>`; AMB.bf.push({ e, x: rnd(0, W), oy: rnd(18, 80), vx: rnd(-14, 14), ph: rnd(0, 6.28), t: 0 }); }
    for (const q of AMB.flies) { q.t += h; q.vx += rnd(-1, 1) * h * 20; q.vx = clamp(q.vx, -14, 14); q.x = (q.x + q.vx * h + W) % W; q.e.setAttribute("transform", `translate(${q.x.toFixed(1)} ${(floorY() - q.oy + Math.sin(q.t * 1.1 + q.ph) * 8).toFixed(1)})`); q.e.setAttribute("opacity", (.3 + .7 * (.5 + .5 * Math.sin(q.t * 2.2 + q.ph))).toFixed(2)); }
    for (const q of AMB.bf) { q.t += h; q.vx = Math.sin(q.t * .6 + q.ph) * 20; q.x = (q.x + q.vx * h + W) % W; const fl = Math.abs(Math.sin(q.t * 11 + q.ph)); q.e.setAttribute("transform", `translate(${q.x.toFixed(1)} ${(floorY() - q.oy + Math.sin(q.t * 1.5 + q.ph) * 14).toFixed(1)})`); q.e.querySelector(".w1").setAttribute("rx", (3 * fl + .6).toFixed(1)); q.e.querySelector(".w2").setAttribute("rx", (3 * fl + .6).toFixed(1)); }
    if (!wantFl && AMB.flies.length) { AMB.flies.forEach(q => q.e.remove()); AMB.flies = []; }
    if (!wantBf && AMB.bf.length) { AMB.bf.forEach(q => q.e.remove()); AMB.bf = []; }
    festive(h);
    // estrella fugaz
    AMB.starT -= h; if (AMB.starT <= 0) { AMB.starT = rnd(18, 45); if (night && !space && !SKYMIN && !SKYOFF) fx("g", { x: rnd(W * .25, W * .95), y: skyY(rnd(.05, .35)), vx: -rnd(260, 360), vy: rnd(80, 130), life: .9, html: `<line x1="0" y1="0" x2="38" y2="-13" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/>` }); }
  }
  // ---------- fiestas y estaciones: decoraciones en el suelo, gorros en los animales y cosas en el cielo ----------
  const gDeco = el("g", { "pointer-events": "none" }, svg); svg.insertBefore(gDeco, gMon);   // sobre las construcciones, bajo los animales
  const D = (y, m, d) => new Date(y, m - 1, d), addD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const nthSun = (y, m, n) => { const f = D(y, m, 1); return addD(f, (7 - f.getDay()) % 7 + 7 * (n - 1)); };
  function easterOf(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return D(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
  }
  const CNY = { 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3], 2031: [1, 23] };   // año nuevo chino
  const IND = { 2024: 20, 2025: 20, 2028: 20, 2029: 20, 2032: 20 };   // dia de los pueblos indigenas (20 o 21 de junio)
  const todayD = () => { const m = (Q.get("fecha") || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], m[2] - 1, +m[3], 12) : new Date(); };
  // at(y) = [dia principal, dias antes, dias despues]; g = cosas en el suelo, f = cosas en el cielo, hats = gorros de los animales
  const FIESTAS = [
    { id: "anonuevo", n: "Año Nuevo", at: y => [D(y, 1, 1), 4, 1], g: ["gift"], f: ["star", "confetti"], fw: 1, hats: ["sombrero de fiesta"] },
    { id: "valentin", n: "San Valentín", at: y => [D(y, 2, 14), 7, 0], g: ["flower"], f: ["heart"], hats: ["corazones"], pal: ["#ff4d6d", "#ff8fb3", "#e53935"] },
    { id: "chino", n: "Año Nuevo chino", at: y => CNY[y] ? [D(y, CNY[y][0], CNY[y][1]), 7, 3] : null, f: ["lantern"], hats: ["sombrero de fiesta"] },
    { id: "mujerciencia", n: "Día de la Mujer y la Niña en la Ciencia", at: y => [D(y, 2, 11), 0, 0], f: ["balloon"], hats: ["flor", "lentes redondos"], pal: ["#c79bff", "#8e44ad", "#ff8fb3"] },
    { id: "darwin", n: "Día de Darwin", at: y => [D(y, 2, 12), 0, 0], f: ["bird", "leaf"], hats: ["lentes redondos"] },
    { id: "mujer", n: "Día de la Mujer", at: y => [D(y, 3, 8), 0, 0], g: ["flower"], f: ["balloon"], hats: ["flor"], pal: ["#c79bff", "#ff8fb3", "#fff27a"] },
    { id: "pi", n: "Día de Pi", at: y => [D(y, 3, 14), 0, 0], f: ["pi"], hats: ["lentes redondos"] },
    { id: "patricio", n: "San Patricio", at: y => [D(y, 3, 17), 0, 0], g: ["clover"], f: ["clover"], hats: ["duende"] },
    { id: "pascua", n: "Pascua", at: y => [easterOf(y), 7, 1], g: ["egg"], f: ["petal"], hats: ["orejas de conejo"] },
    { id: "inocentes", n: "Día de los Inocentes", at: y => [D(y, 4, 1), 0, 0], f: ["confetti"], hats: ["sombrero de fiesta"] },
    { id: "trabajo", n: "Día del Trabajo", at: y => [D(y, 5, 1), 0, 0], f: ["balloon"], hats: ["gorra"], pal: ["#e53935", "#ffb347"] },
    { id: "tierra", n: "Día de la Tierra", at: y => [D(y, 4, 22), 0, 0], g: ["flower"], f: ["leaf", "petal"], hats: ["flor"], pal: ["#7ed957", "#fff27a", "#ff8fb3"] },
    { id: "adn", n: "Día del ADN", at: y => [D(y, 4, 25), 0, 0], f: ["helix"], hats: ["lentes redondos"] },
    { id: "starwars", n: "Día de Star Wars", at: y => [D(y, 5, 4), 0, 0], f: ["ship"], hats: [] },
    { id: "madre", n: "Día de la Madre", at: y => [nthSun(y, 5, 2), 3, 0], g: ["flower"], f: ["balloon", "heart"], hats: ["flor"], pal: ["#ff8fb3", "#ff4d6d", "#fff27a"] },
    { id: "glorias", n: "Glorias Navales", at: y => [D(y, 5, 21), 0, 0], g: ["flag"], hats: [] },
    { id: "indigenas", n: "Día de los Pueblos Indígenas", at: y => [D(y, 6, IND[y] || 21), 0, 0], f: ["star"], hats: ["flor"] },
    { id: "padre", n: "Día del Padre", at: y => [nthSun(y, 6, 3), 3, 0], f: ["balloon"], hats: ["sombrero de copa"], pal: ["#3b82f6", "#1e3a8a", "#7ed957"] },
    { id: "microbioma", n: "Día del Microbioma", at: y => [D(y, 6, 27), 0, 0], f: ["bacterium"], hats: ["lentes redondos"] },
    { id: "nino", n: "Día del Niño", at: y => [nthSun(y, 8, 2), 3, 0], g: ["gift"], f: ["balloon", "confetti"], hats: ["sombrero de fiesta"] },
    { id: "patrias", n: "Fiestas Patrias", at: y => [D(y, 9, 18), 7, 2], g: ["flag", "fonda"], f: ["kite"], fw: 1, hats: ["chupalla"] },
    { id: "profesor", n: "Día del Profesor", at: y => [D(y, 10, 16), 0, 0], f: ["star"], hats: ["lentes redondos"] },
    { id: "halloween", n: "Halloween", at: y => [D(y, 10, 31), 7, 0], g: ["pumpkin"], f: ["bat", "ghost"], hats: ["sombrero de bruja"] },
    { id: "navidad", n: "Navidad", at: y => [D(y, 12, 25), 7, 1], g: ["tree", "gift"], f: ["snow", "star"], hats: ["gorro de santa"] },
    { id: "pasteur", n: "Cumpleaños de Pasteur", at: y => [D(y, 12, 27), 0, 0], f: ["bacterium"], hats: ["lentes redondos"] },
  ];
  const seasonOf = d => { const v = (d.getMonth() + 1) * 100 + d.getDate(); return v >= 1221 || v < 320 ? "verano" : v < 621 ? "otoño" : v < 922 ? "invierno" : "primavera"; };
  const PAL = ["#ff4d6d", "#ffb347", "#8fd0ff", "#c79bff", "#fff27a", "#7ed957", "#ff8fb3"];
  const FEST = { fk: new Set(), sig: "", active: [], season: "verano", kinds: [], fl: [], items: [], tm: {}, chk: 0, rainT: 120, fwT: 5 };
  const RATE = { heart: 3, balloon: 5, kite: 9, lantern: 4, bat: 5, ghost: 7, bacterium: 5, helix: 8, pi: 6, clover: 5, leaf: 2.5, petal: 2.5, star: 5, ship: 14, confetti: 7, snow: .8, bird: 14 };
  const CAP = { heart: 3, balloon: 3, kite: 3, lantern: 3, bat: 2, ghost: 3, bacterium: 3, helix: 2, pi: 2, clover: 3, leaf: 4, petal: 4, star: 3, ship: 1 };   // maximo de cada cosa flotando a la vez
  function activeFiestas(d) {
    const force = (Q.get("fiesta") || "").split(",").filter(Boolean);
    if (force.length) return FIESTAS.filter(f => force.includes(f.id)).map(f => ({ f, main: d, dist: 0 }));
    const out = [], t0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    for (const f of FIESTAS) for (let y = d.getFullYear() - 1; y <= d.getFullYear() + 1; y++) {
      const r = f.at(y); if (!r) continue;
      const main = new Date(r[0].getFullYear(), r[0].getMonth(), r[0].getDate());
      if (t0 >= addD(main, -r[1]) && t0 <= addD(main, r[2])) { out.push({ f, main, dist: Math.round((t0 - main) / 864e5) }); break; }
    }
    return out;
  }
  // dibujos (el suelo en y = 0; en el cielo, centrados)
  function decoSvg(kind, col) {
    const c = col || pick(PAL);
    switch (kind) {
      case "pumpkin": return `<ellipse cy="-6" rx="9" ry="7" fill="#f58a1f"/><path d="M-3.5 -12Q-7 -6 -3.5 0M3.5 -12Q7 -6 3.5 0" stroke="#c76a10" fill="none"/><rect x="-1.2" y="-16" width="2.4" height="4.5" fill="#4b6b2a"/><path d="M-5 -8l2.3 -3 2.3 3zM.4 -8l2.3 -3 2.3 3z" fill="#ffd84a"/><path d="M-4.5 -3.2Q0 0 4.5 -3.2" stroke="#ffd84a" stroke-width="1.4" fill="none"/>`;
      case "tree": {
        const lights = Array.from({ length: 9 }, (_, i) => { const y = -12 - i * 4.2, x = Math.sin(i * 2.1) * (12 - i * 1.1); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="${["#ff5252", "#ffd84a", "#4fc3f7", "#fff"][i % 4]}"><animate attributeName="opacity" values=".2;1;.2" dur="${(1 + (i % 3) * .5).toFixed(1)}s" begin="${(i * .23).toFixed(2)}s" repeatCount="indefinite"/></circle>`; }).join("");
        return `<g transform="scale(.8)"><rect x="-2.5" y="-6" width="5" height="6" fill="#6b4a2a"/><path d="M-16 -6L0 -27L16 -6Z" fill="#1f7a3a"/><path d="M-13 -19L0 -38L13 -19Z" fill="#238c42"/><path d="M-10 -31L0 -48L10 -31Z" fill="#27a04c"/><path d="M0 -55l1.7 3.5 3.8.5-2.8 2.7.7 3.8L0 -45.8l-3.4 1.7.7-3.8-2.8-2.7 3.8-.5z" fill="#ffd84a"/>${lights}</g>`;
      }
      case "gift": return `<rect x="-6" y="-9" width="12" height="9" fill="${c}"/><rect x="-1" y="-9" width="2" height="9" fill="#fff" opacity=".85"/><rect x="-6" y="-5" width="12" height="2" fill="#fff" opacity=".85"/><path d="M0 -9Q-5 -15 -1 -12ZM0 -9Q5 -15 1 -12Z" fill="#fff" stroke="#999" stroke-width=".4"/>`;
      case "egg": return `<ellipse cy="-4.6" rx="3.6" ry="4.8" fill="${c}"/><path d="M-3.5 -5Q-1.7 -7 0 -5T3.5 -5" stroke="#fff" stroke-width="1" fill="none" opacity=".85"/><circle cx="-1" cy="-2.2" r=".8" fill="#fff" opacity=".8"/>`;
      case "flag": return `<rect x="-.8" y="-36" width="1.6" height="36" fill="#8a8a8a"/><g><rect x=".8" y="-36" width="24" height="7.5" fill="#fff"/><rect x=".8" y="-28.5" width="24" height="7.5" fill="#d52b1e"/><rect x=".8" y="-36" width="9.5" height="7.5" fill="#0039a6"/><path d="M5.5 -34.7l.8 1.7 1.8.2-1.3 1.2.4 1.8-1.7-.9-1.7.9.4-1.8-1.3-1.2 1.8-.2z" fill="#fff"/><animateTransform attributeName="transform" type="skewY" values="0;7;0" dur="1.7s" repeatCount="indefinite"/></g>`;
      case "fonda": {
        const tri = Array.from({ length: 9 }, (_, i) => { const x = -19 + i * 4.75, y = -19 + Math.sin(i / 8 * Math.PI) * 4; return `<path d="M${x.toFixed(1)} ${y.toFixed(1)}l4 0 -2 6z" fill="${["#d52b1e", "#fff", "#0039a6"][i % 3]}" stroke="#999" stroke-width=".3"/>`; }).join("");
        return `<rect x="-19" y="-24" width="2.6" height="24" fill="#8a5a2b"/><rect x="16.4" y="-24" width="2.6" height="24" fill="#8a5a2b"/><path d="M-24 -23L0 -37L24 -23Z" fill="#c9a35a"/><path d="M-19 -19Q0 -13 19 -19" stroke="#666" stroke-width=".7" fill="none"/>${tri}<rect x="-8" y="-8" width="16" height="3" fill="#8a5a2b"/><rect x="-7" y="-5" width="2" height="5" fill="#8a5a2b"/><rect x="5" y="-5" width="2" height="5" fill="#8a5a2b"/>`;
      }
      case "flower": return `<path d="M0 0V-9" stroke="#3f8f3a" stroke-width="1.3"/>${[0, 72, 144, 216, 288].map(a => `<circle cx="${(Math.cos(a * Math.PI / 180) * 3).toFixed(1)}" cy="${(-10 + Math.sin(a * Math.PI / 180) * 3).toFixed(1)}" r="2.2" fill="${c}"/>`).join("")}<circle cy="-10" r="1.5" fill="#ffd84a"/>`;
      case "clover": return `<path d="M0 0V-7" stroke="#2e7d32" stroke-width="1.1"/>${[[-2.4, -9], [2.4, -9], [0, -11.5], [0, -7.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="#2fa84f"/>`).join("")}`;
      // cielo
      case "heart": return `<path d="M0 7C-12 -2 -7 -11 0 -4C7 -11 12 -2 0 7Z" fill="${c}"/>`;
      case "balloon": return `<ellipse rx="7.5" ry="9.5" fill="${c}"/><ellipse cx="-2.5" cy="-3.5" rx="1.8" ry="2.8" fill="#fff" opacity=".45"/><path d="M0 9.5Q-3 16 0 23" stroke="#777" stroke-width=".8" fill="none"/>`;
      case "kite": return `<path d="M0 -13L9 0L0 15L-9 0Z" fill="${["#d52b1e", "#0039a6", "#fff", "#ffb347"][Math.floor(Math.random() * 4)]}" stroke="#555" stroke-width=".6"/><path d="M0 -13V15M-9 0H9" stroke="#666" stroke-width=".7"/><path d="M0 15Q-5 21 0 27T0 39T0 51" stroke="#d52b1e" stroke-width="1.6" fill="none"/>`;
      case "lantern": return `<path d="M0 -12V-9" stroke="#8a5a2b"/><rect x="-7" y="-9" width="14" height="16" rx="6" fill="#d52b1e"/><rect x="-3" y="-9" width="6" height="16" rx="3" fill="#f0483a"/><rect x="-4" y="-10" width="8" height="2" fill="#f4c430"/><path d="M0 7v7" stroke="#f4c430" stroke-width="1.2"/>`;
      case "bat": return `<path d="M-11 -1Q-7 -8 -3 -3Q0 -6 3 -3Q7 -8 11 -1Q7 -2 4 3Q0 0 -4 3Q-7 -2 -11 -1Z" fill="#241a2e"/>`;
      case "ghost": return `<path d="M-8 9V-2A8 9 0 0 1 8 -2V9L5 7L2 9L-1 7L-4 9L-6 7Z" fill="#fff" opacity=".88"/><circle cx="-3" cy="-1" r="1.4" fill="#333"/><circle cx="3" cy="-1" r="1.4" fill="#333"/><ellipse cy="4" rx="1.6" ry="2.2" fill="#333"/>`;
      case "bacterium": return `<rect x="-10" y="-4.5" width="20" height="9" rx="4.5" fill="${["#7ed957", "#4fc3f7", "#ff8fb3"][Math.floor(Math.random() * 3)]}" opacity=".92"/><circle cx="-4" cy="0" r="1.3" fill="#fff" opacity=".6"/><circle cx="3" cy="-1" r="1" fill="#fff" opacity=".6"/><path d="M10 0Q15 -4 19 0T27 0" stroke="#666" stroke-width="1" fill="none"/>`;
      case "helix": {
        let a = "", b = "", r = "";
        for (let y = -22; y <= 22; y += 2) { const x = 7 * Math.sin(y / 4); a += (y === -22 ? "M" : "L") + x.toFixed(1) + " " + y; b += (y === -22 ? "M" : "L") + (-x).toFixed(1) + " " + y; if ((y + 22) % 6 === 0) r += `M${x.toFixed(1)} ${y}L${(-x).toFixed(1)} ${y}`; }
        return `<path d="${r}" stroke="#bbb" stroke-width="1" fill="none"/><path d="${a}" stroke="#4fc3f7" stroke-width="2" fill="none"/><path d="${b}" stroke="#ff8fb3" stroke-width="2" fill="none"/>`;
      }
      case "pi": return `<text y="8" font-size="26" style="fill:#7a5af0;font-weight:800">π</text>`;
      case "leaf": { const lc = pick(["#e8751a", "#d4a017", "#b5361f", "#c98b2a"]); return `<path d="M0 -7Q8 -3 0 8Q-8 -3 0 -7Z" fill="${lc}"/><path d="M0 -7V9" stroke="#6b3a10" stroke-width=".7"/>`; }
      case "petal": return `<ellipse rx="3" ry="5" fill="${pick(["#ffb6c8", "#fff", "#ffd1e0"])}" opacity=".9"/>`;
      case "star": return `<path d="M0 -9l2.6 5.6 6 .8-4.4 4.2 1.1 6L0 4.6l-5.3 3 1.1-6-4.4-4.2 6-.8z" fill="#ffd84a"/>`;
      case "ship": return `<path d="M-16 0L10 -3.5L16 0L10 3.5Z" fill="#9aa4b2"/><path d="M-5 -10L3 0L-5 10Z" fill="#6b7686"/><path d="M-16 0H-34" stroke="#ff4d6d" stroke-width="2" opacity=".6"/>`;
    }
    return "";
  }
  function festRebuild() {
    gDeco.innerHTML = ""; FEST.items = [];
    const gk = []; FEST.active.forEach(a => (a.f.g || []).forEach(k => { if (!gk.includes(k)) gk.push(k); }));
    if (FEST.season === "primavera" && !gk.includes("flower")) gk.push("flower");
    const N = { pumpkin: 3, tree: 2, gift: 3, egg: 6, flag: 3, fonda: 1, flower: 5, clover: 4 };   // pocas cosas, para no recargar la civilizacion
    for (const k of gk) {
      const pal = (FEST.active.find(a => (a.f.g || []).includes(k)) || {}).f; const colors = (pal && pal.pal) || PAL;
      for (let i = 0; i < (N[k] || 6); i++) {
        const e = el("g", {}, gDeco); e.innerHTML = decoSvg(k, pick(colors));
        FEST.items.push({ e, fx: (i + rnd(.1, .9)) / (N[k] || 6), dy: rnd(3, GROUND_H - 9) });
      }
    }
    FEST.items.forEach(it => { it.e.setAttribute("opacity", 1); });
    // cosas del cielo + gorros
    FEST.kinds = []; FEST.active.forEach(a => (a.f.f || []).forEach(k => { if (!FEST.kinds.includes(k)) FEST.kinds.push(k); }));
    FEST.fk = new Set(FEST.kinds);   // lo de las fiestas (las hojas y petalos de la estacion se quedan)
    if (FEST.season === "otoño") FEST.kinds.push("leaf"); if (FEST.season === "primavera") FEST.kinds.push("petal");
    FEST.tm = {}; FEST.kinds.forEach(k => { FEST.tm[k] = rnd(0, RATE[k] || 5); });
    const hats = []; FEST.active.forEach(a => (a.f.hats || []).forEach(h => { if (!hats.includes(h)) hats.push(h); }));
    A.setFestive(hats);
  }
  function festSpawn(kind) {
    if (kind === "confetti") { for (let i = 0; i < 4; i++) fx("conf", { x: rnd(0, W), y: SKY, vy: rnd(40, 70), life: 7, col: pick(PAL) }); return; }
    if (kind === "snow") { fx("flake", { x: rnd(0, W), y: SKY - 10, vy: rnd(28, 52), life: 12 }); return; }
    if (kind === "bird") { if (!AMB.flocks.length) spawnFlock(); return; }
    if (FEST.fl.length > 14 || FEST.fl.filter(o => o.kind === kind).length >= (CAP[kind] || 3)) return;
    const e = el("g", {}, gAmb), pal = (FEST.active.find(a => (a.f.f || []).includes(kind)) || {}).f, col = pick((pal && pal.pal) || PAL);
    e.innerHTML = decoSvg(kind, col);
    const o = { e, kind, t: 0, ph: rnd(0, 6.28), x: rnd(0, W), y: 0, vx: 0, vy: 0, rot: 0, rs: 0, s: 1, f: null };
    const side = chance(.5);
    switch (kind) {
      case "bat": o.x = side ? -30 : W + 30; o.vx = (side ? 1 : -1) * rnd(50, 80); o.f = rnd(.12, .6); break;
      case "ghost": o.x = side ? -30 : W + 30; o.vx = (side ? 1 : -1) * rnd(12, 22); o.f = rnd(.2, .6); break;
      case "kite": o.x = side ? -30 : W + 30; o.vx = (side ? 1 : -1) * rnd(12, 24); o.f = rnd(.1, .45); o.s = rnd(.9, 1.4); break;
      case "ship": o.x = -40; o.vx = rnd(110, 150); o.f = rnd(.12, .5); break;
      case "leaf": case "petal": o.y = SKY - 10; o.vy = rnd(26, 44); o.vx = rnd(-6, 6); o.rs = rnd(-90, 90); o.fall = 1; break;
      default: o.y = floorY() - rnd(0, 30); o.vy = -rnd(12, 24); o.rs = rnd(-20, 20); o.rise = 1;
    }
    FEST.fl.push(o);
  }
  function festive(h) {
    FEST.chk -= h;
    if (FEST.chk <= 0) {
      FEST.chk = 2;
      const d = todayD(), act = activeFiestas(d), season = seasonOf(d), sig = act.map(a => a.f.id).join(",") + "|" + season;
      if (sig !== FEST.sig) { FEST.sig = sig; FEST.active = act.map(a => Object.assign({ main: a.main, dist: a.dist }, { f: a.f })); FEST.season = season; festRebuild(); }
    }
    const calm = S.era < 7 && !S.saga, skyFest = !S.started || Q.has("fiesta");   // el cielo festivo solo antes de que empiece la civilizacion
    gDeco.style.display = S.era >= 7 ? "none" : "";
    for (const it of FEST.items) it.e.setAttribute("transform", `translate(${(it.fx * W).toFixed(1)} ${(floorY() + it.dy).toFixed(1)})`);
    if (calm) for (const k of FEST.kinds) { if (FEST.fk.has(k) && !skyFest) continue; FEST.tm[k] -= h; if (FEST.tm[k] <= 0) { FEST.tm[k] = (RATE[k] || 5) * rnd(.7, 1.3); festSpawn(k); } }
    for (const o of FEST.fl) {
      o.t += h; o.x += o.vx * h;
      if (o.f != null) o.y = skyY(o.f) + Math.sin(o.t * (o.kind === "bat" ? 5 : 1.2) + o.ph) * (o.kind === "bat" ? 14 : 8);
      else { o.y += o.vy * h; o.x += Math.sin(o.t * 1.3 + o.ph) * 10 * h; }
      o.rot += o.rs * h;
      const rot = o.kind === "kite" ? Math.sin(o.t * 1.3 + o.ph) * 10 : o.kind === "bat" || o.kind === "ghost" || o.kind === "ship" ? 0 : o.rot, flap = o.kind === "bat" ? ` scale(1 ${(.6 + .5 * Math.abs(Math.sin(o.t * 12))).toFixed(2)})` : "";
      o.e.setAttribute("transform", `translate(${o.x.toFixed(1)} ${o.y.toFixed(1)}) rotate(${rot.toFixed(0)}) scale(${o.s.toFixed(2)})` + flap);
    }
    FEST.fl = FEST.fl.filter(o => { const gone = !calm || (FEST.fk.has(o.kind) && !skyFest) || (o.rise ? o.y < SKY - 20 : o.fall ? o.y > floorY() + 8 : (o.x < -80 || o.x > W + 80)); if (gone) o.e.remove(); return !gone; });
    // fuegos artificiales (Año Nuevo y Fiestas Patrias: el dia principal y el anterior)
    FEST.fwT -= h;
    if (FEST.fwT <= 0) { FEST.fwT = rnd(4, 9); if (calm && skyFest && FEST.active.some(a => a.f.fw && Math.abs(a.dist) <= 1)) fireworks(rnd(W * .1, W * .9), skyY(rnd(.15, .5))); }
    // invierno: de vez en cuando llovizna
    FEST.rainT -= h; if (FEST.rainT <= 0) { FEST.rainT = rnd(200, 400); if (FEST.season === "invierno" && calm && !S.rain && chance(.4)) S.rain = rnd(8, 14); }
  }
  // ---------- poderes: botones para provocar sucesos en la civilizacion (para mal o para bien) ----------
  function manna() {   // comida del cielo
    logEv(`¡Cae comida del cielo sobre ${T()}!`);
    const items = [
      `<path d="M-6 0Q0 8 6 0Q4 -7 -6 -4Z" fill="#ffd84a" stroke="#c9a200" stroke-width=".6"/>`,
      `<circle r="5" fill="#e53935"/><path d="M0 -5Q1 -9 4 -9" stroke="#4b6b2a" fill="none"/>`,
      `<ellipse rx="7" ry="4.5" fill="#d9a05b"/><path d="M-3 -2l1 3M1 -3l1 4" stroke="#b9803a"/>`,
      `<path d="M-7 0Q-2 -6 4 -1L8 -4V4L4 1Q-2 6 -7 0Z" fill="#7fc4ff"/>`,
      `<circle r="4.5" fill="#fb8c00"/><path d="M0 -4.5Q2 -8 5 -7" stroke="#4b6b2a" fill="none"/>`];
    for (let i = 0; i < 40; i++) later(i * .13, () => {
      const v = rnd(110, 170), rs = rnd(-200, 200);
      fx("g", { x: rnd(30, W - 30), y: SKY - 8, vy: v, life: (floorY() - SKY + 14) / v, rotate: rnd(0, 360), html: pick(items),
        tick: f => { f.rotate += rs * .016; }, onEnd: f => burst(f.x, floorY() - 3, 3, "#fff3b0", 45) });
    });
    later(5.4, () => {
      S.extra += 6;
      free().slice(0, 16).forEach(g => { g.act = "eat"; g.stay = rnd(4, 7); g.m.t = 0; g.m.dur = g.stay; g.m.food = pick(["banana", "berry", "leaf"]); });
      logEv(`Banquete para todos: llega más gente a ${T()} (+6)`);
    });
  }
  function alienGift() {   // los alienigenas regalan tecnologia
    const tx = rnd(W * .3, W * .7), sx = chance(.5) ? -70 : W + 70, ex = sx < 0 ? W + 80 : -80, y = Math.max(SKY + 50, skyY(.25)), ground = floorY() - y;
    logEv(`¡Una nave alienígena se detiene sobre ${T()}!`);
    fx("g", { x: sx, y, life: 11, html: `<ellipse rx="30" ry="9" fill="#8fe3c8"/><ellipse cy="-6" rx="14" ry="9" fill="#bff3ff" opacity=".85"/><circle cx="-18" cy="2" r="2.2" fill="#fff27a"/><circle cx="0" cy="4" r="2.2" fill="#fff27a"/><circle cx="18" cy="2" r="2.2" fill="#fff27a"/>`,
      tick: f => { const t = f.t; f.vx = 0; f.x = t < 3 ? lerp(sx, tx, out3(t / 3)) : t < 8 ? tx : lerp(tx, ex, clamp((t - 8) / 3, 0, 1)); f.y = y + Math.sin(t * 4) * 3 - (t > 8 ? (t - 8) * 14 : 0); } });
    later(3.2, () => fx("g", { x: tx, y, life: 4.6, html: `<path d="M-12 10L-48 ${ground + 14}L48 ${ground + 14}L12 10Z" fill="#c9fff0"/>`,
      tick: f => f.e.setAttribute("opacity", (clamp(f.t / .5, 0, 1) * clamp(f.life / .7, 0, 1) * .5).toFixed(2)) }));
    later(4.4, () => fx("g", { x: tx, y: y + 12, vy: (ground - 26) / 1.6, life: 1.6, rotate: 0,
      html: `<circle r="13" fill="#7dffb0" opacity=".25"/><rect x="-6" y="-6" width="12" height="12" rx="2" fill="#7dffb0"/><rect x="-6" y="-6" width="12" height="12" rx="2" fill="none" stroke="#fff" stroke-width="1.5"/>`,
      tick: f => { f.rotate += 6; },
      onEnd: () => {
        burst(tx, floorY() - 12, 26, "#7dffb0", 150); fx("flash", { x: tx, y: floorY() - 16, r0: 6, r1: 60, life: .5, col: "#bfffe0", op: .7 });
        logEv(`Los alienígenas dejan un regalo luminoso: conocimiento nuevo`);
        let got = nextMilestone(); got = nextMilestone() || got;
        if (!got) S.eraT = Math.min(S.eraDur * .97, S.eraT + S.eraDur * .12);   // sin hitos pendientes, la era avanza
        S.extra += 3; cheerSome(10, 6);
      } }));
  }
  const POWERS = [
    { id: "meteorito", ico: "☄️", n: "Meteorito", bad: 1, run: () => meteor() },
    { id: "volcan", ico: "🌋", n: "Volcán", bad: 1, run: volcano },
    { id: "inundacion", ico: "🌊", n: "Inundación", bad: 1, run: () => flood(14, `Inundación: el agua sube sobre ${T()}`) },
    { id: "tormenta", ico: "⛈️", n: "Tormenta", bad: 1, run: storm },
    { id: "terremoto", ico: "🌍", n: "Terremoto", bad: 1, run: quake },
    { id: "incendio", ico: "🔥", n: "Incendio", bad: 1, run: fire },
    { id: "plaga", ico: "🦠", n: "Plaga", bad: 1, run: () => { if (S.pandemic) { pushToast("Ya hay una plaga en curso"); return false; } pandemic(); } },
    { id: "abduccion", ico: "🛸", n: "Abducción", bad: 1, run: () => { if (S.busy || S.ufo || !free().length) { pushToast("Ahora no hay nadie que abducir"); return false; } ufo(); } },
    { id: "manna", ico: "🍎", n: "Comida", tip: "Comida del cielo", run: manna },
    { id: "regalo", ico: "👽", n: "Aliens", tip: "Los aliens regalan tecnología", run: alienGift },
    { id: "deseos", ico: "🌠", n: "Deseos", run: () => { starShower(); S.extra += 3; } },
    { id: "fiesta", ico: "🎉", n: "Fiesta", run: () => { festival(); S.extra += 2; } },
  ];
  (function buildPowers() {
    const box = document.getElementById("powers"); if (!box) return;
    for (const p of POWERS) {
      const b = document.createElement("button"); b.className = "pw " + (p.bad ? "bad" : "good"); b.type = "button";
      b.title = (p.bad ? "Para mal: " : "Para bien: ") + (p.tip || p.n); b.innerHTML = `<span aria-hidden="true">${p.ico}</span>${p.n}`;
      b.addEventListener("click", e => {
        e.stopPropagation();
        if (!S.started) { pushToast("La civilización empieza cuando cae el primer animal"); return; }
        if (S.cata || S.saga) { pushToast("La civilización está en plena crisis: espera un momento"); return; }
        if (p.run() === false) return;
        pushToast(`${p.ico} ${p.n}`);
        b.disabled = true; setTimeout(() => { b.disabled = false; }, 20000);   // enfriamiento de 20 s por boton
      });
      box.appendChild(b);
    }
    if (Q.get("power")) setTimeout(() => { const p = POWERS.find(x => x.id === Q.get("power")); if (p) { S.started = true; p.run(); const ps = parseFloat(Q.get("pstep")) || 0; for (let t = 0; t < ps; t += .05) step(.05); } }, 3500);   // prueba: ?power=meteorito
  })();
  const THOUGHTS = {
    any: ["Hmm… ¿y si…?", "¡Qué buen día!", "Tengo sueño…", "Me pica la espalda", "¿Qué estarán pensando los demás?", "Qué linda tribu tenemos", "¿Habrá algo de comer?", "¿Y si descansamos un poco?", "Mañana será mejor", "¡Cómo pasa el tiempo!", "¿Habrá terminado mi job?", "Me falta un párrafo del paper", "¿Y si repito el experimento?", "Tengo que hacer backup", "¿Quedará café en el lab?", "Mi tesis me espera"],
    0: ["Hambre… ¡uh!", "¿Qué es esa luz tan grande?", "Palo bueno, piedra mejor", "Esa cueva se ve cómoda", "Brrr, qué frío hace"],
    1: ["El fuego es mágico", "Mmm… huele a asado", "¡No toques, que quema!", "¿Qué habrá detrás de las estrellas?"],
    2: ["¿Dónde acampamos hoy?", "Sigamos a las bananas", "Ese lobo me mira raro", "Otra migración… qué cansancio"],
    3: ["¿Habrá buena cosecha?", "Quiero una casa más grande", "¿Por qué sale el sol?", "Hoy toca sembrar", "Qué alto es ese templo"],
    4: ["¡Tierra a la vista!", "¿Y si navego hacia el oeste?", "Dicen que el mundo es redondo", "Qué castillo tan alto"],
    5: ["El humo me da tos", "¿Llegará el tren a tiempo?", "Mi jornada es larguísima", "¡Cuánto ruido hacen las máquinas!"],
    nuc: ["¿Y si alguien aprieta el botón?", "Ese hongo en el horizonte no me gusta", "¿Será seguro el búnker?", "Las pruebas atómicas dan miedo", "Qué grande es esa central"],
    6: ["Me llegó un mensaje", "¿Y si me tomo un café?", "Voy tarde a la oficina", "¿Quién ganó el partido?", "Se me acabó la batería"],
    7: ["¿Viviremos en otro planeta?", "Quiero ir a la Luna", "¿Habrá bananas en Marte?"],
    8: ["¿Estamos solos?", "Esa nave me da mala espina", "¿Será seguro el hiperespacio?"],
  };
  const KIND_THOUGHTS = { mono: ["¿Habrá bananas?", "Quiero trepar ese árbol", "¡Uh uh!"], jirafa: ["Las hojas ricas están arriba", "Qué lindo se ve todo desde acá", "¿Habrá acacias mañana?"], foca: ["¿Dónde está el pescado?", "Quiero un chapuzón", "Mmm… huele a mar"] };
  const thoughtFor = g => g.m.celeb && chance(.4) ? `“${g.m.celeb.quote}”` : chance(.28) ? pick(KIND_THOUGHTS[g.m.kind] || KIND_THOUGHTS.mono) : pick(chance(.55) ? THOUGHTS.any.concat(eraThoughts()) : (eraThoughts().length ? eraThoughts() : THOUGHTS.any));
  const eraThoughts = () => (THOUGHTS[Math.min(S.era, 8)] || []).concat(S.era === 6 && !S.digital ? THOUGHTS.nuc : []);
  function say(text) { const g = pick(groundMons()); if (g && g.m.mode !== "sleep") { g.m.say = text; g.m.mode = "react"; g.m.t = 0; g.m.dur = 1.7; } }
  function adopt(m, x, y, id) {   // un mono se desborda del anillo hacia el mundo
    gMon.appendChild(m.parts.root);
    m.dir = chance(.5) ? 1 : -1; m.mode = "run"; m.theta = 0; m.mood = { low: 0, mid: 1, high: 0 }; m.pop = undefined;
    const zoo = document.querySelector(`.zoo[data-id="${id}"]`), card = zoo ? zoo.closest(".card") : null;
    const g = { m, tribe: Math.max(0, TRIBE_KINDS.indexOf(m.kind)), state: "climb", card, x, y, rot: 0, vx: 0, vy: 0, vr: 0, dy: rnd(6, GROUND_H - 12), sp: rnd(.85, 1.2), climbT: rnd(5, 10), stay: 0, tu: .5, tv: .5, act: "idle" };
    S.mon.push(g);
    if (!card) fall(g);
  }
  A.setReleaseHandler(adopt);
  function fall(g) { g.state = "fall"; g.vx = rnd(-60, 60); g.vy = -rnd(80, 180); g.vr = rnd(-420, 420); g.bounced = false; g.m.mode = "fall"; g.m.t = 0; }
  function pickTarget(g) {
    const els = g.card.querySelectorAll("h2,.row,.age,.ringwrap"), e = els[Math.random() * els.length | 0], cr = g.card.getBoundingClientRect(), er = e.getBoundingClientRect();
    g.tu = (er.left + rnd(.1, .9) * er.width - cr.left) / cr.width; g.tv = (er.top + rnd(.3, .9) * er.height - cr.top) / cr.height;
  }
  function stepMon(g, h) {
    const m = g.m;
    m.t += h;
    if (g.state === "climb") {   // camina por encima de los textos y los tapa
      if (!g.card || !g.card.isConnected) return fall(g);
      const cr = g.card.getBoundingClientRect();
      g.climbT -= h;
      g.rot = (((g.rot + 180) % 360 + 360) % 360 - 180) * (1 - Math.min(1, h * 8));   // se endereza
      if (g.stay > 0) { g.stay -= h; m.mode = g.sit; m.phase += h * 3; if (g.stay <= 0) pickTarget(g); }
      else {
        if (g.tarT == null || g.tarT) { pickTarget(g); g.tarT = 0; }
        const tx = cr.left + g.tu * cr.width, ty = cr.top + g.tv * cr.height, dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy), sp = 85;
        if (d < sp * h + 1) { g.x = tx; g.y = ty; g.stay = rnd(1.5, 3.5); g.sit = chance(.5) ? "rest" : "eat"; m.t = 0; m.dur = g.stay; m.food = pick(["banana", "berry", "leaf"]); }
        else { g.x += dx / d * sp * h; g.y += dy / d * sp * h; m.dir = dx >= 0 ? 1 : -1; m.mode = "run"; m.phase += h * 14; }
      }
      if (g.climbT <= 0) fall(g);
      return;
    }
    if (g.state === "fall") {
      g.vy += 1500 * h; g.x += g.vx * h; g.y += g.vy * h; g.rot += g.vr * h; m.mode = "fall";
      if (g.x < 10 || g.x > W - 10) { g.vx *= -1; g.x = clamp(g.x, 10, W - 10); }
      const fy = floorY() + g.dy;
      if (g.y >= fy) {
        g.y = fy;
        if (g.vy > 420 && !g.bounced) { g.vy *= -.28; g.vx *= .5; g.bounced = true; dust(g.x, 3); }
        else { g.state = "ground"; g.rot = 0; g.vr = 0; dust(g.x, 4); land(g); }
      }
      return;
    }
    if (g.state === "abduct") { g.y -= 55 * h; g.rot += 80 * h; m.mode = "fall"; return; }
    // en el suelo
    if (g.dead > 0) { g.dead -= h; m.mode = "ko"; if (g.dead <= 0) killMon(g); return; }
    if (S.crits.length && !g.hold) {   // huyen de las criaturas
      g.fearT = (g.fearT || 0) - h;
      if (g.fearT <= 0) {
        g.fearT = .3;
        const c = nearestCrit(g.x);
        if (c && Math.abs(c.x - g.x) < 140) { g.tx = clamp(g.x + (g.x < c.x ? -1 : 1) * rnd(120, 220), 18, W - 18); g.act = "run"; g.next = "sit"; g.stayT = .6; g.face = 0; }
      }
    }
    g.talkT = (g.talkT == null ? rnd(3, 14) : g.talkT) - h;   // piensa en voz alta de vez en cuando
    if (m.thinkT > 0) m.thinkT -= h;
    if (g.talkT <= 0) {
      g.talkT = rnd(14, 34);
      if (!(m.thinkT > 0) && m.mode !== "ko" && m.mode !== "sleep" && g.act !== "fight" && S.mon.filter(o => o.m.thinkT > 0).length < 5) {
        m.think = thoughtFor(g); m.thinkDur = m.thinkT = clamp(2 + m.think.length * .06, 2.4, 5);
      }
    }
    if (m.mode === "react") { if (m.t > m.dur) m.mode = "rest"; return; }
    switch (g.act) {
      case "walk": case "run": {
        const d = g.tx - g.x, spd = (g.act === "run" ? 95 : 34) * g.sp;
        m.mode = g.act; m.phase += h * (g.act === "run" ? 15 : 9); m.dir = d >= 0 ? 1 : -1;
        if (Math.abs(d) <= spd * h + 1) { g.x = g.tx; arrive(g); } else g.x += Math.sign(d) * spd * h;
        break;
      }
      default:
        m.mode = MODE_OF[g.act] || "rest"; m.phase += h * (g.act === "work" || g.act === "fight" ? 9 : 3);
        g.stay -= h;
        if (g.act === "ko" && chance(h * 2.5)) floatText(g.x + rnd(-8, 8), floorY() + g.dy - 34, "★", "#f5c518");   // estrellitas
        if (g.stay <= 0 && g.complain) {   // el aplastado despierta y reclama
          g.complain = false; g.m.say = pick(COMPLAINTS); g.m.mode = "react"; g.m.t = 0; g.m.dur = 2.6; g.act = "idle"; g.stay = 2.8;
        } else if (g.stay <= 0 && !g.hold) think(g);
    }
  }
  const COMPLAINTS = ["¡oye, fíjate!", "¡mi cabeza!", "¡quítate!", "¡ay, mi espalda!", "¡qué pesado!", "¿no ves dónde caes?", "¡esa era mi banana!", "¡mira por dónde!"];
  function crashOnto(g, v) {   // g cayo encima de v: los dos quedan inconscientes unos segundos
    S.stats.choques++;
    for (const k of [g, v]) { k.act = "ko"; k.stay = rnd(2.5, 4.5); k.m.t = 0; k.m.mode = "ko"; k.hold = false; }
    v.complain = true;
    dust(g.x, 5); floatText(g.x, floorY() - 40, "¡PAF!", "#e53935");
  }
  function land(g) {
    if (!S.started) startWorld();
    g.act = "idle"; g.stay = rnd(.3, 1); g.m.mode = "rest"; g.m.t = 0;
    const v = groundMons().find(o => o !== g && Math.abs(o.x - g.x) < 20 && !(o.dead > 0));
    if (v) crashOnto(g, v);
    if (groundMons().length > MAX_SPRITES) {   // demasiados: el mas viejo se va caminando y se suma a la poblacion invisible
      const old = groundMons().filter(x => !x.hold)[0];
      if (old) { old.tx = old.x < W / 2 ? -30 : W + 30; old.act = "walk"; old.next = "leave"; old.hold = true; }
    }
  }
  function killMon(g) { g.m.parts.root.remove(); S.mon.splice(S.mon.indexOf(g), 1); }
  function arrive(g) {
    if (g.next === "leave") { S.extra++; return killMon(g); }
    g.act = g.next || "sit"; g.stay = g.stayT == null ? rnd(2, 6) : g.stayT; g.m.t = 0;
    if (g.face) g.m.dir = g.face;
    if (g.act === "eat") { g.m.dur = g.stay; g.m.food = pick(["banana", "berry", "leaf"]); }
    if (g.onArrive) { const f = g.onArrive; g.onArrive = null; f(g); }
  }
  const anchor = (kinds, t) => { const c = S.structs.filter(s => kinds.includes(s.kind) && !s.dying && s.built > .5 && (t == null || S.unified || s.tribe == null || s.tribe === t)); return c.length ? pick(c).x : null; };
  function think(g) {
    if (S.lunch) { g.act = "eat"; g.stay = rnd(20, 50); g.m.t = 0; g.m.dur = g.stay; g.m.food = pick(["banana", "berry", "leaf"]); return; }   // hora de almuerzo
    const e = S.era, r = Math.random(), z = zone(g.tribe), go = (x, act, stay, face) => {
      g.tx = clamp(x == null ? (chance(.07) && !S.unified ? rnd(30, W - 30) : rnd(z[0] + 22, z[1] - 22)) : x, 18, W - 18); g.next = act; g.stayT = stay == null ? rnd(2, 6) : stay; g.face = face || 0;
      g.act = chance(.12) ? "run" : "walk"; g.m.t = 0;
    };
    const at = (kinds, sp) => { const x = anchor(kinds, g.tribe); return x == null ? null : x + rnd(-sp, sp); };
    if (!S.unified && g.tribe != null && (g.x < z[0] - 50 || g.x > z[1] + 50)) return go(null, "sit", rnd(1, 3));   // vuelve a su pueblo
    if (chance(.06) && e >= 1) return go(null, "cheer", rnd(2, 4));
    if (e === 0) { r < .3 ? go(at(["cave", "rock", "bones"], 60), "sit") : r < .5 ? go(at(["cave"], 30), "sleep", rnd(6, 11)) : go(null, "sit"); }
    else if (e === 1) { r < .65 ? go(at(["campfire"], 34), pick(["sit", "sit", "sleep", "eat"]), rnd(4, 9)) : go(null, "sit"); }
    else if (e === 2) { r < .3 ? go(at(["campfire", "tent"], 40), "sit") : go(null, "sit", rnd(1, 3)); }
    else if (e === 3) { r < .5 ? go(at(["field"], 28), "work", rnd(4, 9)) : r < .75 ? go(at(["hut", "campfire", "temple", "market", "pyramid", "totem"], 40), "sit") : go(null, "sit", rnd(1, 3)); }
    else {
      const ei = Math.min(e, 7) - 4;
      const wk = [["field", "windmill", "fort", "ship", "market", "academia", "observatory"], ["factory", "train", "library", "university"], ["skyscraper", "car", "library", "laboratory", "hospital", "nuclearplant", "bunker"], ["pad", "dish", "dome", "tower", "starport", "laboratory"]][ei];   // (era 6: ver abajo)
      const hm = [["house", "hut", "market", "cathedral"], ["brickhouse", "house", "cathedral"], ["house", "skyscraper", "cathedral"], ["dome", "skyscraper", "dish", "tower", "orb"]][ei];
      r < .4 ? go(at(wk, 30), "work", rnd(3, 8)) : r < .7 ? go(at(hm, 36), "sit") : go(null, "sit", rnd(1, 3));
    }
  }
  const sendTo = (g, x, act, face, stay) => { g.tx = clamp(x, 14, W - 14); g.act = "run"; g.next = act; g.face = face || 0; g.stayT = stay == null ? 99 : stay; g.hold = true; g.m.t = 0; };

  // ---------- hitos canonicos y sucesos al azar ----------
  const T = () => S.unified ? S.nation : tn(Math.floor(Math.random() * S.tribes.length));
  const REL_A = ["del Sol", "de la Luna", "de la Gran Banana", "del Árbol Sagrado", "del Río Eterno", "del Trueno", "del Cielo", "de la Montaña", "de las Estrellas", "del Gran Mono"];
  const REL_B = ["Hijos", "Orden", "Culto", "Iglesia", "Camino", "Los Fieles"];
  const newRel = () => ({ name: `${pick(REL_B)} ${pick(REL_A)}`, hue: rnd(0, 360) });
  const setRels = fn => { S.tribes.forEach(t => { t.rel = fn(t); }); S.rel = S.tribes[0].rel; };   // cada pueblo con su propia fe
  const DISEASES = ["Peste Gris", "Fiebre del Plátano", "Tos Simiesca", "Gripe Roja", "Mal del Sueño", "Viruela de los Árboles", "Fiebre Negra", "Sarampión Peludo", "Gripe de la Selva", "Mal de las Pulgas"];
  const cheerSome = (n, secs) => free().slice(0, n).forEach(g => { g.act = "cheer"; g.stay = secs; g.m.t = 0; });
  const releaseAll = list => list.forEach(g => { g.hold = false; g.stay = 0; });
  const M = (era, id, text, run, ph) => ({ id, era, text: typeof text === "function" ? text : () => text, run, ph });   // ph: fase de la era 6 ("n" nuclear, "d" digital)
  const MILESTONES = [
    // --- Edad de Piedra ---
    M(0, "herramientas", () => `${T()}: fabrican las primeras herramientas de piedra`),
    M(0, "pintura", `Pintan las paredes de la cueva`, () => alive("cave").forEach(s => s.$(".pt").style.display = "")),
    M(0, "lenguaje", `Nace el lenguaje: se oyen los primeros «uh uh»`, () => { for (let i = 0; i < 4; i++) later(i * .5, () => say(pick(A.SAYS))); }),
    M(0, "caza_grupo", `Aprenden a cazar en grupo`),
    M(0, "creencia", `Entierran a sus muertos con flores: nace la primera creencia`),
    M(0, "tambor", `Inventan el tambor con un tronco hueco`, () => { S.music = 8; }),
    M(0, "trueno", `Un trueno los aterra: ¿quién lo envía?`, () => bolt(true)),
    M(0, "estrellas", `Cuentan las estrellas: nace la astronomía`),
    M(0, "danza", `Danzan bajo la luna`, () => cheerSome(6, 5)),
    // --- Fuego ---
    M(1, "fuego", () => `¡${T()} domina el fuego!`, () => dust(W / 2, 4)),
    M(1, "cocina", `Descubren que la comida cocida sabe mejor`, () => free().slice(0, 4).forEach(g => { g.act = "eat"; g.stay = 5; g.m.food = "banana"; g.m.dur = 5; g.m.t = 0; })),
    M(1, "ritual", `Primer ritual bailando alrededor del fuego`, () => cheerSome(7, 6)),
    M(1, "pieles", `Se abrigan con pieles para el frío`),
    M(1, "fuego_sagrado", `Un fuego eterno arde en la cueva y un chamán lo cuida: nace el «Culto al Fuego Eterno»`, () => setRels(t => ({ name: ["Culto al Fuego Eterno", "Guardianes de la Llama", "Hijos del Ascua"][t.i], hue: 20 + t.i * 50 }))),
    M(1, "ceramica", `Cuecen barro en el fuego: nace la cerámica`),
    M(1, "cobre", `Funden cobre en la hoguera`),
    M(1, "mitos", `Se cuentan historias junto al fuego: nacen los mitos`, () => say("érase una vez…")),
    M(1, "antorchas", `Iluminan las cuevas con antorchas`),
    M(1, "funerales", `Primer funeral con fuego: despiden a los suyos`),
    // --- Nomadas ---
    M(2, "lobos", `Domestican al lobo: nace el mejor amigo`),
    M(2, "arco", `Inventan el arco y la flecha`),
    M(2, "jefe", `Aparece un jefe que guía al clan`),
    M(2, "chamanismo", `Un chamán dice hablar con los espíritus`, () => say("¡espíritus!")),
    M(2, "totems", () => `Tallan tótems: nace la fe en «${S.rel.name}»`, () => setRels(() => ({ name: `Espíritus del ${pick(["Bosque", "Río", "Viento", "Trueno", "Lobo"])}`, hue: rnd(0, 360) }))),
    M(2, "calendario", `Siguen a la luna: nace el primer calendario`),
    M(2, "balsas", `Cruzan los ríos en balsas`),
    M(2, "trueque", `Intercambian pieles y comida: nace el trueque`),
    M(2, "tejido", `Aprenden a tejer fibras`),
    M(2, "rutas", `Trazan rutas migratorias siguiendo a las bananas`),
    M(2, "flautas", `Tallan flautas de hueso: nace la música`, () => { S.music = 8; }),
    M(2, "reglas", `Primeras reglas: nadie roba la comida del vecino`),
    // --- Sedentarios ---
    M(3, "agricultura", `Inventan la agricultura: ¡adiós a vagar!`, () => { S.extra += 3; }),
    M(3, "alfareria", `Aprenden alfarería para guardar el grano`),
    M(3, "rueda", `Inventan la rueda`),
    M(3, "escritura", `Nace la escritura`),
    M(3, "comercio", `Abren el primer mercado`),
    M(3, "templo", () => `Levantan el primer templo: nace la religión «${S.rel.name}»`, () => setRels(() => newRel())),
    M(3, "astronomia", `Observan los astros: primeros astrónomos`),
    M(3, "matematicas", `Inventan los números y la geometría`, () => say("1+1=2")),
    M(3, "filosofia", `Surge el primer filósofo: «¿por qué hay bananas?»`, () => say("¿por qué?")),
    M(3, "academia", `Fundan la primera academia de sabios`),
    M(3, "bronce", `Fabrican bronce: comienza la Edad del Bronce`),
    M(3, "hierro", `Dominan el hierro: armas y arados más fuertes`),
    M(3, "leyes", `Escriben el primer código de leyes`),
    M(3, "moneda", `Acuñan las primeras monedas`),
    M(3, "piramide", `Levantan una gigantesca pirámide para sus dioses`, () => { if (!S.rel) setRels(() => newRel()); }),
    M(3, "curanderos", `Los curanderos descubren plantas medicinales`),
    M(3, "teatro", `Nace el teatro: los monos se burlan de los reyes`),
    M(3, "dioses", () => S.branch[3] ? `Creen en muchos dioses: uno para la lluvia, otro para las bananas` : `Surge la idea de un único dios supremo`),
    M(3, "arquitectura", `Aprenden arquitectura: nacen las primeras ciudades`),
    M(3, "castillo", `Los señores levantan castillos para defenderse`),
    // --- Colonial ---
    M(4, "navegacion", `Zarpan hacia tierras desconocidas`, () => { const sh = alive("ship")[0]; if (sh) burst(sh.x, floorY() - 20, 8, "#fff", 60); }),
    M(4, "imprenta", `Inventan la imprenta: las ideas viajan rápido`),
    M(4, "colonia", () => `Fundan la colonia de ${S.city}`),
    M(4, "catedral", () => `Construyen una gran catedral para «${S.rel.name}»`, () => { if (!S.rel) setRels(() => newRel()); }),
    M(4, "reforma", () => `Una reforma divide a los creyentes: nace «${S.rel2.name}»`, () => { S.rel2 = newRel(); }),
    M(4, "renacimiento", `Renacimiento: florecen el arte y la ciencia`),
    M(4, "telescopio_optico", `Inventan el telescopio: la Tierra ya no es el centro`),
    M(4, "heliocentrismo", `Un sabio afirma que el mundo gira alrededor del sol: ¡escándalo!`, () => say("¡herejía!")),
    M(4, "universidad", `Fundan la universidad`),
    M(4, "polvora", `Descubren la pólvora`, () => burst(W / 2, floorY() - 30, 12, "#ffcf6e", 90)),
    M(4, "brujula", `La brújula inaugura la gran navegación`),
    M(4, "ilustracion", `Ilustración: la razón desafía a la fe`),
    M(4, "gravedad", `Un mono descubre la gravedad cuando le cae una banana en la cabeza`, () => say("¡ay!")),
    M(4, "microscopio", `Con el microscopio ven por primera vez los microbios`),
    M(4, "imperio", `Se funda un gran imperio colonial`),
    M(4, "bancos", `Abren el primer banco`),
    M(4, "independencia", `Las colonias se rebelan y se independizan`),
    M(4, "feudalismo", `Nace el feudalismo: cada señor levanta su castillo`),
    M(4, "caballeria", `Surgen los caballeros: armadura, espada y honor`),
    M(4, "gremios", `Los artesanos se organizan en gremios`),
    M(4, "juglares", `Los juglares recorren las villas cantando hazañas`, () => { S.music = 8; }),
    M(4, "magna_carta", `Se firma una carta que limita el poder del rey`),
    M(4, "gotico", `El arte gótico levanta catedrales con vitrales`),
    // --- Industrial ---
    M(5, "vapor", `Máquina de vapor: ¡las fábricas no paran!`),
    M(5, "ferrocarril", `Llega el ferrocarril`),
    M(5, "electricidad", `Se hace la luz: llega la electricidad`),
    M(5, "telegrafo", `El telégrafo conecta a la colonia`),
    M(5, "evolucion", `Teoría de la evolución: ¿descendemos de otros monos?`, () => say("¿yo?")),
    M(5, "fotografia", `Inventan la fotografía`),
    M(5, "telefono", `Suena el primer teléfono`),
    M(5, "periodicos", `Nacen los periódicos`),
    M(5, "sindicatos", `Nacen los sindicatos`),
    M(5, "anestesia", `Descubren la anestesia`),
    M(5, "democracia", `Nace la democracia moderna`),
    M(5, "ateismo", `Crece el librepensamiento y el ateísmo`),
    M(5, "psicologia", `Nace la psicología: los monos se tumban en un diván`),
    M(5, "motor", `Inventan el motor de combustión`),
    M(5, "acero", `La era del acero levanta puentes y rascacielos`),
    M(5, "subterraneo", `Inauguran el metro`),
    M(5, "higiene", `Descubren la higiene: ¡a lavarse las manos!`, () => { S.done.cuarentena = true; }),
    M(5, "deporte", `Nacen los deportes modernos`),
    // --- Moderna ---
    M(6, "automovil", `Los automóviles llenan las calles`, null, "n"),
    M(6, "aviacion", `Primer vuelo: el mono por fin tiene alas`, null, "n"),
    M(6, "radio", `La radio y la televisión llegan a todos`, null, "n"),
    M(6, "relatividad", `Descubren la relatividad: el tiempo no es absoluto`, () => say("E=mc²"), "n"),
    M(6, "atomo", `Dividen el átomo: nace la era nuclear`, null, "n"),
    M(6, "fision", `Primera reacción nuclear en cadena controlada`, null, "n"),
    M(6, "bomba", `Una bomba atómica ilumina el desierto: el mundo contiene el aliento`, () => nuclearTest(), "n"),
    M(6, "guerra_fria", `Comienza la Guerra Fría: dos bloques y miles de misiles`, null, "n"),
    M(6, "central", `Inauguran la primera central nuclear: energía para ciudades enteras`, null, "n"),
    M(6, "bunkers", `Se construyen búnkeres antiatómicos`, null, "n"),
    M(6, "misiles_crisis", `Crisis de los misiles: el mundo a un botón de distancia`, () => coldWar(), "n"),
    M(6, "no_proliferacion", `Se firma el tratado de no proliferación nuclear`, null, "n"),
    M(6, "medicina_nuclear", `Nace la medicina nuclear: diagnósticos y tratamientos con radiación`, null, "n"),
    M(6, "fusion_sueno", `Sueñan con la fusión nuclear: el Sol en una botella`, null, "n"),
    M(6, "antibioticos", `Descubren los antibióticos`, null, "n"),
    M(6, "adn", `Descifran el ADN`, null, "n"),
    M(6, "television", `La televisión entra en cada casa`, null, "n"),
    M(6, "cine", `Nace el cine`, null, "n"),
    M(6, "rock", `Nace el rock and roll`, () => { S.music = 10; cheerSome(8, 8); }, "n"),
    M(6, "derechos", `Declaran los derechos de todos los monos`, null, "n"),
    M(6, "naciones", `Fundan la Asamblea de las Naciones Monas`, null, "n"),
    M(6, "ecologia", `Nace el movimiento ecologista`, null, "n"),
    M(6, "cuantica", `La física cuántica desafía el sentido común`, null, "n"),
    M(6, "laboratorio", `Enormes laboratorios de investigación`, null, "n"),
    M(6, "carrera", `Comienza la carrera espacial`, null, "n"),
    M(6, "computadora", `Aparecen las computadoras personales`, null, "d"),
    M(6, "internet", `Nace internet: todos miran videos de bananas`, null, "d"),
    M(6, "vacunas", `Inventan las vacunas modernas`, () => { S.extra += 5; }, "d"),
    M(6, "genoma", `Secuencian el primer genoma completo`, null, "d"),
    M(6, "crispr", `Nace CRISPR: editar genes con tijeras moleculares`, null, "d"),
    M(6, "redes", `Nacen las redes sociales: todos opinan de todo`, null, "d"),
    M(6, "nube", `Todo se guarda en la nube (que es el computador de otro)`, null, "d"),
    M(6, "bigdata", `Datos masivos: los servidores ya no dan abasto`, null, "d"),
    M(6, "solar", `Paneles solares y energías limpias`, null, "d"),
    M(6, "smartphone", `Todos tienen un teléfono inteligente (y no levantan la vista)`, null, "d"),
    M(6, "ia", `Primeras inteligencias artificiales`, null, "d"),
    M(6, "teletrabajo", `Teletrabajo: reuniones en pijama`, null, "d"),
    M(6, "nuevaera", () => `Surgen nuevas espiritualidades: «${S.rel.name}»`, () => { setRels(() => newRel()); S.tribes.forEach(t => { t.rel2 = null; }); S.rel2 = null; S.done.reforma = false; }, "d"),
    // --- Espacial ---
    M(7, "satelite", `Lanzan el primer satélite`),
    M(7, "telescopio", () => `El telescopio divisa ${S.dest.name}`, () => { S.destSeen = true; ensureDest(); }),
    M(7, "estacion", `Construyen una estación espacial`),
    M(7, "reutilizables", `Cohetes reutilizables: viajar es barato`),
    M(7, "luna", `Los primeros monos pisan la Luna`),
    M(7, "sonda", `Sondas exploran el sistema solar`),
    M(7, "exoplanetas", `Descubren miles de exoplanetas`),
    M(7, "fusion", `Logran la energía de fusión`),
    M(7, "genetica", `Editan los genes: monos a la carta`),
    M(7, "iglesia_cosmica", () => `Nace una fe cósmica: «${S.rel.name}»`, () => { setRels(() => newRel()); S.tribes.forEach(t => { t.rel2 = null; }); S.rel2 = null; S.done.reforma = false; }),
    M(7, "filosofia_cosmica", `¿Estamos solos en el universo? Los filósofos debaten`, () => say("¿solos?")),
    M(7, "conciencia_ia", `Una IA pide derechos`),
    M(7, "ascensor", `Construyen un ascensor espacial`),
    M(7, "terraformacion", `Comienzan a terraformar otro mundo`),
    M(7, "seti", `Captan una señal extraña desde muy lejos…`),
  ];
  const sacredX = () => anchor(SACRED);
  const EVENTS = [
    { id: "guerra", min: 1, w: () => S.traits.war * 1.4 * (free().length >= 6 ? 1 : 0), run: () => { if (!tribalWar()) startWar(); } },
    { id: "caceria", max: 2, w: () => alive("mammoth").length && free().length >= 4 ? 1.1 : 0, run: () => startHunt() },
    { id: "festival", min: 1, w: () => 1, run: () => festival() },
    { id: "pandemia", min: 2, w: () => S.pandemic ? 0 : .8 * (2 - S.traits.luck), run: () => pandemic() },
    { id: "langostas", min: 3, w: () => alive("field").length ? .45 : 0, run: () => locusts() },
    { id: "sequia", min: 3, w: () => S.drought > 0 ? 0 : .4, run: () => drought() },
    { id: "hambruna", min: 3, w: () => alive("field").length < 2 ? .8 : .25, run: () => hurt(rnd(.1, .22), `Hambruna: la cosecha fracasó`, "hambrunas") },
    { id: "terremoto", min: 1, w: () => .5, run: () => quake() },
    { id: "volcan", max: 4, w: () => .45, run: () => volcano() },
    { id: "meteorito", w: () => .35, run: () => meteor() },
    { id: "eclipse", w: () => .5, run: () => { S.eclipse = 10; logEv(`Eclipse total: ${T()} mira al cielo asustada`); } },
    { id: "lluvia", w: () => .9, run: () => { S.rain = rnd(10, 16); logEv(`Llueve: los cultivos lo agradecen`); } },
    { id: "glaciacion", max: 2, w: () => .35, run: () => { S.snow = 22; S.boost = .6; S.boostT = 30; logEv(`Glaciación: el frío frena a ${T()}`); } },
    { id: "edadoro", w: () => .4 * S.traits.luck, run: () => { S.boost = 1.5; S.boostT = 40; logEv(`Edad dorada: ${T()} florece`); for (let i = 0; i < 3; i++) later(i * .7, () => fireworks(rnd(W * .2, W * .8), skyY(rnd(.15, .6)))); } },
    { id: "edadoscura", min: 2, w: () => .3 * (2 - S.traits.luck), run: () => { S.boost = .55; S.boostT = 32; logEv(`Edad oscura: se pierde conocimiento`); } },
    { id: "ovni", min: 5, w: () => .5, run: () => ufo() },
    { id: "cometa", w: () => .45, run: () => comet() },
    { id: "oro", min: 3, w: () => .4, run: () => { S.extra += 3; logEv(`Hallan una veta de oro: llegan inmigrantes`); } },
    { id: "incendio", min: 1, w: () => .55, run: () => fire() },
    { id: "inundacion", min: 2, w: () => .35, run: () => flood(14, `Inundación: el río se desborda`) },
    { id: "tormenta", w: () => .6, run: () => storm() },
    { id: "aurora", w: () => .4, run: () => aurora() },
    { id: "estrellas", w: () => .4, run: () => starShower() },
    { id: "olimpiadas", min: 3, w: () => free().length >= 5 ? .45 : 0, run: () => olympics() },
    { id: "concierto", min: 5, w: () => .5, run: () => { S.music = 10; cheerSome(10, 8); logEv(`Gran concierto: ${T()} canta y baila`); } },
    { id: "exploracion", min: 4, w: () => alive("ship").length ? .4 : 0, run: () => { S.extra += 2; logEv(`Una expedición regresa de ultramar con especias y mapas`); } },
    { id: "revolucion", min: 4, w: () => .5 * S.traits.war * (free().length >= 6 ? 1 : 0), run: () => startWar(pick([`Revolución: el pueblo derriba al rey`, `Revuelta del pan: los monos toman las calles`])) },
    { id: "huelga", min: 5, w: () => free().length >= 6 ? .4 : 0, run: () => strike() },
    { id: "crisis", min: 5, w: () => .35 * (2 - S.traits.luck), run: () => crisis() },
    { id: "boom", min: 5, w: () => .4 * S.traits.luck, run: () => { S.extra += 3 + (Math.random() * 3 | 0); logEv(`Boom económico: llegan trabajadores y bananas`); burst(W / 2, floorY() - 30, 14, "#ffd23f", 110); } },
    { id: "genio", min: 2, w: () => .55, run: () => genius() },
    { id: "arqueologia", min: 4, w: () => .35, run: () => archaeology() },
    { id: "peregrinacion", min: 1, w: () => sacredX() != null && free().length >= 4 ? .6 : 0, run: () => pilgrimage() },
    { id: "milagro", min: 3, w: () => sacredX() != null ? .4 : 0, run: () => miracle() },
    { id: "cisma", min: 4, w: () => S.rel && !S.done.reforma && S.era <= 6 ? .55 : 0, run: () => schism() },
    { id: "guerrasanta", min: 4, w: () => S.rel2 && S.done.reforma && free().length >= 6 ? .6 * S.traits.war : 0, run: () => startWar(`Guerra santa: «${S.rel.name}» contra «${S.rel2.name}»`) },
    { id: "profeta", min: 2, w: () => .35, run: () => prophet() },
    { id: "inmigracion", min: 3, w: () => .5, run: () => { S.extra += 3 + (Math.random() * 4 | 0); logEv(`Llegan inmigrantes de tierras lejanas`); } },
    { id: "heroe", min: 2, w: () => S.done.heroe ? 0 : .4, run: () => hero() },
    { id: "tribu", max: 3, w: () => .5, run: () => { S.extra += rnd(2, 4); logEv(`Otra tribu se une a ${T()}`); } },
    { id: "falsoovni", min: 6, w: () => .3, run: () => logEv(`Falsa alarma: el «ovni» era un globo meteorológico`) },
    { id: "gladiadores", min: 3, max: 4, w: () => alive("colosseum").length ? .8 : 0, run: () => gladiators() },
    { id: "legion", min: 3, max: 4, w: () => !S.unified && S.tribes.some(t => t.cult === "romana") ? .55 : 0, run: () => legion() },
    { id: "horda", min: 3, max: 4, w: () => !S.unified && S.tribes.some(t => t.cult === "mongola") ? .5 : 0, run: () => horde() },
    // --- diplomacia entre pueblos (mientras no sean uno solo) ---
    { id: "exploradores", min: 2, w: () => !S.unified && twoTribes() ? .9 : 0, run: () => explorers() },
    { id: "comercio", min: 2, w: () => !S.unified && twoTribes() ? .8 : 0, run: () => trade() },
    { id: "misioneros", min: 2, w: () => !S.unified && S.tribes.some(t => t.rel) && twoTribes() ? .6 : 0, run: () => missionaries() },
    { id: "tratado", min: 2, w: () => !S.unified && twoTribes() ? .45 + Math.max(0, -Math.min(...S.dip.flat())) * .5 : 0, run: () => treaty() },
    { id: "ayuda", min: 2, w: () => S.pandemic && !S.unified ? 1.2 : 0, run: () => aid() },
    { id: "bodareal", min: 3, w: () => !S.unified && twoTribes() ? .4 : 0, run: () => royalWedding() },
    { id: "tsunami", min: 3, w: () => alive("ship").length ? .3 : 0, run: () => flood(18, `Tsunami: una ola gigante golpea la costa`) },
    // --- medievales ---
    { id: "asedio", min: 3, max: 4, w: () => (alive("castle").length || alive("fort").length) && free().length >= 10 ? .9 * S.traits.war : 0, run: () => siege() },
    { id: "justas", min: 3, max: 4, w: () => free().length >= 8 ? .65 : 0, run: () => joust() },
    { id: "cruzada", min: 3, max: 4, w: () => free().length >= 8 ? .45 : 0, run: () => crusade() },
    { id: "invasores", min: 3, max: 4, w: () => .55, run: () => raid() },
    { id: "pestenegra", min: 3, max: 4, w: () => S.pandemic ? 0 : .45 * (2 - S.traits.luck), run: () => pandemic({ name: "Peste Negra", lethal: .75, dur: 40, text: `La Peste Negra asola a ${T()}: mueren aldeas enteras` }) },
    { id: "dragon", min: 3, max: 4, w: () => .22, run: () => dragon() },
    { id: "feria", min: 3, max: 4, w: () => .5, run: () => { S.music = 9; cheerSome(10, 8); logEv(`Feria medieval: juglares, mercaderes y torneos`); } },
    { id: "campesinos", min: 3, max: 4, w: () => .5 * S.traits.war * (free().length >= 6 ? 1 : 0), run: () => startWar(`Revuelta campesina: los campesinos se alzan contra el señor`) },
    { id: "naval", min: 4, max: 4, w: () => alive("ship").length ? .45 : 0, run: () => navalBattle() },
    { id: "cienanos", min: 4, max: 4, w: () => .3 * S.traits.war * (free().length >= 8 ? 1 : 0), run: () => startWar(`Guerra de los Cien Años: las batallas no terminan nunca`, { dur: 30 }) },
    // --- modernas ---
    { id: "guerramundial", min: 6, max: 6, w: () => .6 * S.traits.war * (free().length >= 8 ? 1 : 0), run: () => worldWar() },
    { id: "guerrafria", min: 6, max: 6, w: () => .4, run: () => coldWar() },
    { id: "pruebanuclear", min: 6, max: 6, w: () => S.digital ? 0 : .6, run: () => nuclearTest() },
    { id: "simulacro", min: 6, max: 6, w: () => S.digital || free().length < 4 ? 0 : .5, run: () => airRaid() },
    { id: "accidentenuclear", min: 6, max: 6, w: () => S.digital || S.pandemic ? 0 : .3, run: () => radiation() },
  ];
  function nextMilestone() {
    let c = MILESTONES.filter(m => m.era === S.era && !S.done[m.id] && (m.ph == null || S.era !== 6 || m.ph === (S.digital ? "d" : "n")));
    if (S.era === 7 && !S.destSeen && S.eraT > S.eraDur * .25) c = c.filter(m => m.id === "telescopio");   // sin esto no hay destino
    const m = wpick(c, () => 1); if (!m) return false;
    S.done[m.id] = true; S.stats.hitos++; if (m.run) m.run(); logEv(m.text()); return true;
  }
  function nextEvent() {
    const c = EVENTS.filter(e => (e.min == null || S.era >= e.min) && (e.max == null || S.era <= e.max) && !S.recent[e.id]);
    const e = wpick(c, x => x.w());
    if (!e) return;
    S.recent[e.id] = 70; e.run();   // el mismo suceso no se repite enseguida
  }

  // --- sucesos ---
  function festival() {
    const g = free(); if (g.length < 3) return;
    S.stats.festivales++;
    g.slice(0, 12).forEach(x => { x.act = "cheer"; x.stay = rnd(4, 7); x.m.t = 0; });
    if (S.era >= 4) for (let i = 0; i < 3; i++) setTimeout(() => fireworks(rnd(W * .15, W * .85), skyY(rnd(.15, .6))), i * 600);
    else burst(W / 2, floorY() - 30, 20, "#ffd23f", 120);
    logEv(pick([`Gran fiesta en ${T()}`, `Celebran la cosecha con música`, `Se casan dos monos y todos bailan`]));
  }
  function hurt(frac, text, key) {
    S.stats[key || "plagas"]++;
    const n = Math.max(1, Math.floor(popTotal() * frac));
    let k = Math.min(n, Math.floor(S.extra)); S.extra -= k;
    free().slice(0, n - k).forEach(g => { g.dead = 3; g.m.t = 0; });
    logEv(`${text} (-${n})`);
  }
  function quake() {
    S.stats.terremotos++;
    const t = S.structs.filter(s => !s.mobile && !s.dying && !s.temp && s.built > .8);
    if (t.length > 2 && chance(.6)) { const s = pick(t); s.dying = .001; boom(s.x, floorY() - 10, true); }
    groundMons().forEach(g => { g.m.mode = "react"; g.m.t = 0; g.m.dur = 1.7; g.m.say = "¡¡!!"; });
    S.shake = 1.2; logEv(`Terremoto: tiembla la tierra`);
  }
  function volcano() {
    const x = chance(.5) ? rnd(60, W * .25) : rnd(W * .75, W - 60);
    const v = addStruct("volcano", x); v.lifeT = 14;
    logEv(`Un volcán despierta cerca de ${T()}`);
    groundMons().slice(0, 5).forEach(g => { g.m.mode = "react"; g.m.t = 0; g.m.dur = 1.7; g.m.say = "¡aaah!"; });
  }
  function meteor(quiet) {
    const x = rnd(W * .15, W * .85), x0 = x + rnd(250, 420);
    fx("g", { x: x0, y: SKY - 30, life: 1.3, vx: (x - x0) / 1.3, vy: (floorY() + 6) / 1.3 * 1.0, html: `<circle r="6" fill="#ffd27a"/><circle r="11" fill="#ff9a3c" opacity=".4"/><line x1="0" y1="0" x2="60" y2="-40" stroke="#ff9a3c" stroke-width="5" stroke-linecap="round" opacity=".6"/>`,
      tick: f => { if (f.life < .05 && !f.hit) { f.hit = true; impact(f.x, quiet); } } });
    if (!quiet) logEv(`¡Un meteorito cruza el cielo!`);
  }
  function impact(x, quiet) {
    S.stats.meteoritos++;
    boom(x, floorY(), true); fx("flash", { x, y: floorY() - 20, r0: 10, r1: 130, life: .6, col: "#fff", op: .5 });
    S.structs.forEach(s => { if (!s.mobile && !s.dying && !s.temp && Math.abs(s.x - x) < 80) s.dying = .001; });
    groundMons().forEach(g => { if (Math.abs(g.x - x) < 100) { g.act = "ko"; g.stay = 3; g.m.t = 0; } });
    S.shake = 1.4; if (!quiet) logEv(`El meteorito cae y arrasa lo que encuentra`);
  }
  function comet() {
    const y = skyY(rnd(.1, .4)), dir = chance(.5) ? 1 : -1;
    fx("g", { x: dir > 0 ? -60 : W + 60, y, life: 6, vx: dir * (W + 120) / 6, vy: 40, html: `<circle r="4" fill="#fff"/><circle r="9" fill="#bfe3ff" opacity=".35"/><line x1="0" y1="0" x2="${-dir * 70}" y2="-12" stroke="#bfe3ff" stroke-width="4" stroke-linecap="round" opacity=".5"/>` });
    free().slice(0, 4).forEach(g => { g.act = "cheer"; g.stay = 4; g.m.t = 0; });
    logEv(`Un cometa cruza el cielo: ¿buen augurio?`);
  }
  function ufo() {
    const g = pick(free()); if (!g) return;
    S.busy = true; g.hold = true; g.act = "idle"; g.stay = 99;
    const dir = chance(.5) ? 1 : -1;
    S.ufo = { x: dir > 0 ? -50 : W + 50, tx: g.x, g, state: "in", t: 0,
      e: el("g", { }, gFx), y: Math.max(SKY + 40, floorY() - 190) };
    S.ufo.e.innerHTML = `<ellipse cx="0" cy="0" rx="26" ry="8" fill="#9aa4b2"/><ellipse cx="0" cy="-5" rx="12" ry="8" fill="#9fe3ff" opacity=".8"/><circle cx="-15" cy="1" r="2" fill="#ffd23f"/><circle cx="0" cy="3" r="2" fill="#ffd23f"/><circle cx="15" cy="1" r="2" fill="#ffd23f"/>`;
    S.ufo.beam = el("path", { fill: "#fff6a8", opacity: 0 }, gFx);
    logEv(`¡Un objeto desconocido aparece en el cielo!`);
  }
  function ufoStep(h) {
    const u = S.ufo; if (!u) return;
    u.t += h; const g = u.g;
    if (u.state === "in") {
      const d = u.tx - u.x; u.x += Math.sign(d) * Math.min(Math.abs(d), 240 * h);
      if (Math.abs(d) < 3) { u.state = "beam"; u.t = 0; g.state = "abduct"; g.m.mode = "fall"; }
    } else if (u.state === "beam") {
      u.beam.setAttribute("opacity", ".45");
      if (g.y < u.y + 14) { u.state = "out"; u.dir = u.x < W / 2 ? 1 : -1; S.returnMon = g.m; S.returnT = 22; g.m.parts.root.remove(); S.mon.splice(S.mon.indexOf(g), 1); u.beam.setAttribute("opacity", 0); }
    } else {
      u.x += u.dir * 360 * h; u.y -= 40 * h;
      if (u.x < -80 || u.x > W + 80) { u.e.remove(); u.beam.remove(); S.ufo = null; S.busy = false; logEv(`El objeto se fue... y se llevó a un mono`); return; }
    }
    u.e.setAttribute("transform", `translate(${u.x.toFixed(1)} ${(u.y + Math.sin(u.t * 5) * 3).toFixed(1)})`);
    u.beam.setAttribute("d", `M${(u.x - 10).toFixed(1)} ${u.y + 6}L${(u.x - 30).toFixed(1)} ${floorY() + 24}L${(u.x + 30).toFixed(1)} ${floorY() + 24}L${(u.x + 10).toFixed(1)} ${u.y + 6}Z`);
  }
  function startHunt() {
    const mm = alive("mammoth")[0], hs = free().slice(0, 5); if (!mm || hs.length < 3) return;
    S.hunt = { mm, hs, t: 0, ph: "run" };
    hs.forEach((g, i) => sendTo(g, mm.x + (i % 2 ? 40 : -40) + rnd(-12, 12), "fight", i % 2 ? -1 : 1, 99));
    logEv(`Gran cacería: ${hs.length} cazadores persiguen al mamut`);
  }
  function huntStep(h) {
    const u = S.hunt; if (!u) return;
    u.t += h;
    if (u.ph === "run" && (u.t > 7 || u.hs.every(g => g.act === "fight"))) { u.ph = "fight"; u.t = 0; }
    else if (u.ph === "fight" && u.t > 3.5) {
      u.ph = "feast"; u.t = 0; u.mm.dying = .001; S.mammothT = 28; boom(u.mm.x, floorY() - 14, false);
      u.hs.forEach(g => { g.act = "eat"; g.stay = 6; g.m.food = "berry"; g.m.dur = 6; g.m.t = 0; });
      logEv(`Banquete: el mamut alimenta a toda la tribu`); S.extra += 1;
    } else if (u.ph === "feast" && u.t > 6) { u.hs.forEach(g => { g.hold = false; g.stay = 0; }); S.hunt = null; }
  }

  // --- mas sucesos: pandemias, desastres, religion, ciencia ---
  function pandemic(o) {
    if (S.pandemic) return;
    o = o || {};
    const name = o.name || pick(DISEASES), med = S.done.vacunas || S.done.antibioticos;
    S.pandemic = { name, t: 0, dur: o.dur || (med ? rnd(10, 16) : S.era >= 5 ? rnd(18, 26) : rnd(26, 40)), dead: 0, sick: 0, lethal: o.lethal };
    S.stats.pandemias++;
    logEv(o.text || `Pandemia: ${name} se propaga por ${T()}`);
  }
  function pandemicStep(h) {
    const p = S.pandemic; if (!p) return;
    p.t += h;
    S.extra = Math.max(0, S.extra - h * (S.done.vacunas ? .15 : .45));
    if (chance(h * (1.2 + p.t / p.dur * 2.2))) {   // nuevos contagios
      const g = pick(free().filter(x => !x.sick));
      if (g) { g.sick = 6 + rnd(0, 4); p.sick++; g.m.parts.root.style.filter = "sepia(1) hue-rotate(50deg) saturate(3)"; g.m.say = "¡achís!"; g.m.mode = "react"; g.m.t = 0; g.m.dur = 1.2; }
    }
    for (const g of S.mon) {
      if (!(g.sick > 0) || g.state !== "ground") continue;
      g.sick -= h;
      if (chance(h * 3)) fx("puff", { x: g.x, y: floorY() + g.dy - 14, vy: -12, r0: 2, r1: 6, life: .8, col: "#7fbf3f", op: .6 });
      if (g.sick <= 0) {
        g.sick = 0; g.m.parts.root.style.filter = "";
        if (chance(p.lethal != null ? p.lethal : S.done.antibioticos ? .1 : S.done.vacunas ? .2 : S.era >= 5 ? .3 : .5)) { g.dead = 1.2; p.dead++; }
      }
    }
    if (p.t > p.dur) {
      S.pandemic = null;
      logEv(`La pandemia de ${p.name} termina: ${p.dead} muertos` + (S.done.vacunas || S.done.antibioticos || S.done.cuarentena ? " (la medicina ayudó)" : ""));
    }
  }
  function fire() {
    const t = S.structs.filter(s => !s.mobile && !s.dying && !s.temp && s.built > .8 && !s.fireT);
    if (!t.length) return;
    const s = pick(t); S.stats.incendios++;
    s.fireT = S.era >= 5 ? 5 : 9;
    logEv(`Incendio: arde una construcción de ${T()}` + (S.era >= 5 ? " (llegan los bomberos)" : ""));
    free().slice(0, 4).forEach(g => { g.m.say = "¡fuego!"; g.m.mode = "react"; g.m.t = 0; g.m.dur = 1.7; });
  }
  function flood(secs, text) {
    S.flood = S.floodMax = secs; logEv(text);
    groundMons().slice(0, 6).forEach(g => { g.m.say = "¡agua!"; g.m.mode = "react"; g.m.t = 0; g.m.dur = 1.7; });
  }
  function locusts() {
    S.locust = 9; alive("field").forEach(f => { f.g = 0; });
    S.extra = Math.max(0, S.extra - 2); logEv(`Una nube de langostas devora los cultivos`);
  }
  function drought() {
    S.drought = 28; logEv(`Sequía: los campos se agrietan`);
    if (!S.saga) { tint.setAttribute("fill", "#d98c2b"); tint.style.opacity = .12; }
  }
  function storm() {
    S.rain = rnd(9, 14); logEv(`Tormenta eléctrica sobre ${T()}`);
    for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) later(1 + i * rnd(1.5, 3), () => bolt());
  }
  function bolt(quiet) {
    const x = rnd(40, W - 40); let d = `M${x.toFixed(0)} ${SKY - 10}`, y = SKY - 10, cx = x;
    while (y < floorY()) { y += rnd(30, 60); cx += rnd(-22, 22); d += `L${cx.toFixed(0)} ${Math.min(y, floorY()).toFixed(0)}`; }
    fx("g", { x: 0, y: 0, life: .25, html: `<path d="${d}" stroke="#bfe3ff" stroke-width="9" fill="none" opacity=".4"/><path d="${d}" stroke="#fff" stroke-width="3" fill="none" stroke-linejoin="round"/>` });
    fx("flash", { x, y: floorY(), r0: 6, r1: 28, life: .3, col: "#fff", op: .8 });
    const s = S.structs.find(q => !q.mobile && !q.dying && !q.temp && Math.abs(q.x - x) < 40);
    if (!quiet && s && !s.fireT && chance(.4)) { s.fireT = 7; logEv(`Un rayo incendia una construcción`); }
  }
  function aurora() {
    S.aurora = 12; logEv(`Aurora boreal: el cielo se ilumina de colores`);
    fx("g", { x: 0, y: SKY + 10, life: 12, tick: f => f.e.setAttribute("opacity", (Math.sin(Math.PI * clamp(f.t / 12, 0, 1)) * .9).toFixed(2)),
      html: `<defs><linearGradient id="au" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dffb0" stop-opacity="0"/><stop offset=".5" stop-color="#7dffb0" stop-opacity=".5"/><stop offset="1" stop-color="#b57dff" stop-opacity="0"/></linearGradient></defs>` +
        `<path d="M0 20Q${W * .25} -10 ${W * .5} 25T${W} 15V70Q${W * .75} 95 ${W * .5} 60T0 80Z" fill="url(#au)"/>` });
    cheerSome(4, 6);
  }
  function starShower() {
    logEv(`Lluvia de estrellas: todos piden un deseo`); cheerSome(5, 5);
    for (let i = 0; i < 14; i++) later(i * .45, () => fx("g", { x: rnd(0, W), y: SKY + rnd(0, skyH() * .3), life: .9, vx: 260, vy: 150,
      html: `<line x1="0" y1="0" x2="-40" y2="-24" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle r="2.2" fill="#fff"/>` }));
  }
  function olympics() {
    const gs = free().slice(0, 6); if (gs.length < 4) return;
    const x0 = rnd(W * .15, W * .35), x1 = x0 + rnd(240, 380);
    gs.forEach((g, i) => sendTo(g, x0 + i * 10, "idle", 1, 1));
    logEv(`Olimpiadas: ${gs.length} atletas corren por la gloria`);
    later(3, () => gs.forEach((g, i) => { g.tx = x1 + i * 6; g.act = "run"; g.next = "cheer"; g.stayT = 4; g.sp = rnd(.9, 1.5); g.m.t = 0; }));
    later(8, () => { const w = pick(gs); w.m.say = "¡gané!"; w.m.mode = "react"; w.m.t = 0; w.m.dur = 1.7; });
    later(11, () => gs.forEach(g => { g.hold = false; g.stay = 0; g.sp = rnd(.85, 1.2); }));
  }
  function strike() {
    const x = anchor(["factory", "skyscraper", "market"]) || W / 2, gs = free().slice(0, 8);
    gs.forEach(g => sendTo(g, x + rnd(-50, 50), "sit", 0, 10));
    logEv(`Huelga: los trabajadores se sientan frente a la fábrica`);
    later(2, () => gs.forEach(g => { g.m.say = "¡huelga!"; g.m.mode = "react"; g.m.t = 0; g.m.dur = 1.7; }));
    later(11, () => releaseAll(gs));
  }
  function crisis() {
    S.extra = Math.max(0, S.extra * .85 - 2);
    const t = S.structs.filter(q => !q.mobile && !q.dying && !q.temp && q.built > .8);
    if (t.length > 3) ruinOf(pick(t));
    logEv(`Crisis económica: quiebran los bancos y cierran negocios`);
  }
  function genius() {
    logEv(`Nace ${nm()}, un genio ${pick(["matemático", "inventor", "poeta", "médico", "filósofo", "músico"])}`);
    S.msT = Math.min(S.msT, 2); say("¡eureka!");
  }
  function archaeology() {
    const x = freeX(46); if (x == null) return;
    const rn = addStruct("ruin", x); rn.lifeT = rnd(40, 70);
    logEv(S.cycle > 1 ? `Hallan ruinas de una civilización anterior... ¿serían ellos mismos?` : `Desentierran ruinas ancestrales`);
  }
  function pilgrimage() {
    const x = sacredX(); if (x == null) return;
    const gs = free().slice(0, 10);
    gs.forEach(g => sendTo(g, x + rnd(-44, 44), "sit", 0, 7));
    logEv(`Peregrinación: ${T()} viaja al templo de «${S.rel.name}»`);
    later(9, () => releaseAll(gs));
  }
  function miracle() {
    const x = sacredX(); if (x == null) return;
    fx("line", { x1: x, y1: -10, x2: x, y2: floorY(), col: "#fff7b0", w: 16, life: 2.4 });
    fx("flash", { x, y: floorY() - 30, r0: 8, r1: 60, life: 1.2, col: "#fff7b0", op: .6 });
    cheerSome(8, 5); S.extra += 2;
    logEv(`Milagro en el templo de «${S.rel.name}»: un haz de luz baja del cielo`);
  }
  function schism() {
    const t = pick(S.tribes);
    S.done.reforma = true; t.rel2 = S.rel2 = newRel();
    logEv(`Cisma entre ${S.unified ? S.nation : tn(t.i)}: nace «${t.rel2.name}», rival de «${(t.rel || S.rel).name}»`);
  }
  function prophet() {
    logEv(`Un profeta anuncia el fin del mundo para mañana... y no pasa nada`);
    free().slice(0, 4).forEach(g => { g.m.say = "¿en serio?"; g.m.mode = "react"; g.m.t = 0; g.m.dur = 1.7; });
  }
  function hero() {
    S.done.heroe = true; logEv(`Un héroe salva a ${T()} y le erigen una estatua`); cheerSome(6, 5);
  }

  // --- medievales y guerras ---
  function siege() {
    const cs = alive("castle")[0] || alive("fort")[0], gs = shuffle(free());
    if (!cs || gs.length < 8) return;
    const side = cs.x > W / 2 ? -1 : 1, att = gs.slice(0, 8), def = gs.slice(8, 12);
    att.forEach((g, i) => sendTo(g, clamp(cs.x + side * (190 + i * 9), 20, W - 20), "fight", -side, 999));
    def.forEach((g, i) => sendTo(g, cs.x + (i % 2 ? 22 : -22), "fight", side, 999));
    const cats = [0, 1].map(i => { const c = addStruct("catapult", clamp(cs.x + side * (235 + i * 40), 30, W - 30)); c.flip = side > 0; c.lifeT = 45; return c; });
    S.siege = { cs, att, def, cats, t: 0, ph: "march", shot: 0, dur: rnd(14, 19), hits: 0 };
    S.busy = true; S.stats.guerras++;
    logEv(`Asedio: ${T()} sitia ${cs.kind === "castle" ? "el castillo" : "la fortaleza"}`);
  }
  function siegeStep(h) {
    const u = S.siege; if (!u) return;
    u.t += h;
    const att = u.att.filter(g => S.mon.includes(g) && !(g.dead > 0));
    if (u.ph === "march") { if (u.t > 8 || att.every(g => g.act === "fight")) { u.ph = "fight"; u.t = 0; } return; }
    if (u.ph === "fight") {
      u.shot -= h;
      if (u.shot <= 0) {
        u.shot = rnd(.7, 1.3);
        const c = pick(u.cats), x0 = c ? c.x : u.cs.x - 200, tx = u.cs.x + rnd(-14, 14);
        if (c) c.fire = 1;
        fx("proj", { kind: S.era >= 4 ? "ball" : "stone", x: x0, y: floorY() - 22, vx: (tx - x0) / .9, vy: -405, g: 900, life: 1.6, tx });
        later(.9, () => { u.hits++; S.shake = .5; });
      }
      if (att.length > 4 && chance(h * .15)) pick(att).dead = 1.2;
      if (u.t > u.dur) {
        u.ph = "end"; u.t = 0;
        if (u.hits >= 8 || chance(.4)) { ruinOf(u.cs); logEv(`El castillo cae: los sitiadores toman la fortaleza`); } else logEv(`El asedio fracasa: los defensores resisten`);
        att.concat(u.def).forEach(g => { g.act = "cheer"; g.stay = 5; g.m.t = 0; });
      }
      return;
    }
    if (u.ph === "end" && u.t > 5) { releaseAll(u.att.concat(u.def)); u.cats.forEach(c => { c.dying = c.dying || .001; }); S.siege = null; S.busy = false; }
  }
  function joust() {
    const gs = shuffle(free()); if (gs.length < 8) return;
    const a = gs[0], b = gs[1], crowd = gs.slice(2, 8), cx = rnd(W * .35, W * .65);
    sendTo(a, cx - 130, "idle", 1, 1); sendTo(b, cx + 130, "idle", -1, 1);
    crowd.forEach((g, i) => sendTo(g, cx + (i % 2 ? 1 : -1) * (165 + (i >> 1) * 20), "cheer", 0, 12));
    logEv(`Torneo de justas: dos caballeros se enfrentan`);
    later(3, () => { a.tx = cx - 6; a.act = "run"; a.sp = 2.1; a.next = "idle"; b.tx = cx + 6; b.act = "run"; b.sp = 2.1; b.next = "idle"; });
    later(5, () => {
      boom(cx, floorY() - 18, false); floatText(cx, floorY() - 44, "¡CLANG!");
      const w = chance(.5) ? a : b, l = w === a ? b : a;
      l.act = "ko"; l.stay = 3.5; l.m.t = 0; w.act = "cheer"; w.stay = 4; w.m.t = 0;
      logEv(`Un caballero derriba al otro y gana la justa`);
    });
    later(10, () => releaseAll([a, b].concat(crowd)));
  }
  function crusade() {
    const gs = free().slice(0, 10); if (gs.length < 5) return;
    const dir = chance(.5) ? 1 : -1;
    gs.forEach(g => { sendTo(g, dir > 0 ? W - 10 : 10, "leave", dir, 0); g.act = "walk"; g.sp = rnd(.9, 1.15); });
    logEv(`Cruzada: ${gs.length} monos parten con estandartes hacia tierras lejanas`);
  }
  function raid() {
    const kind = S.era >= 4 ? "galleon" : "longship", dir = chance(.5) ? 1 : -1, x = rnd(W * .25, W * .75), x0 = dir > 0 ? -90 : W + 90, y = floorY() + 16;
    S.sea = 20;
    fx("g", { x: x0, y, life: 20, flip: dir < 0, html: `<g transform="scale(1.1)">${SHIP[kind]()}</g>`,
      tick(g, h) {
        if (g.t < 4) g.x = lerp(x0, x, out3(g.t / 4)); else if (g.t > 11) g.x += dir * 90 * h;
        g.y = floorY() + 16 + Math.sin(g.t * 2) * 1.6;   // sigue al suelo aunque cambie el tamaño de la ventana
        if (g.t >= 4 && !g.sacked) { g.sacked = true; boom(x, floorY() - 10, true); destroyAt(x, 90, .55); S.shake = 1; groundMons().slice(0, 4).forEach(q => { q.m.say = "¡al ataque!"; q.m.mode = "react"; q.m.t = 0; q.m.dur = 1.7; }); }
      } });
    logEv(S.era >= 4 ? `Piratas asaltan el puerto` : `Invasores del norte desembarcan y saquean la costa`);
  }
  function navalBattle() {
    S.sea = 22;
    const cx = rnd(W * .35, W * .65), ships = [1, -1].map(dir => fx("g", { x: dir > 0 ? -90 : W + 90, y: floorY() + 16, life: 17, flip: dir < 0, shot: rnd(.5, 1.2), sunk: 0,
      html: `<g transform="scale(1.1)">${SHIP.galleon()}</g>`,
      tick(g, h) {
        const tx = cx - dir * 80;
        g.x = g.t < 4 ? lerp(dir > 0 ? -90 : W + 90, tx, out3(g.t / 4)) : g.x;
        g.y = floorY() + 16 + Math.sin(g.t * 2 + dir) * 1.6 + g.sunk * 22; g.shot -= h;
        if (g.t > 4 && g.shot <= 0 && !g.sunk) { g.shot = rnd(.6, 1.2); fx("proj", { kind: "ball", x: g.x + dir * 30, y: floorY() + 4, vx: dir * 250, vy: -190, g: 600, life: 1.5 }); }
        if (g.sunk) { g.sunk = Math.min(1, g.sunk + h * .4); g.e.style.opacity = 1 - g.sunk; }
      } }));
    logEv(`Batalla naval: dos flotas se cañonean frente al puerto`);
    later(11, () => { const l = pick(ships); l.sunk = .01; boom(l.x, floorY() + 8, true); logEv(`Un galeón se hunde: la flota rival gana la batalla`); });
  }
  function dragon() {
    const dir = chance(.5) ? 1 : -1, y = skyY(rnd(.15, .4)), x0 = dir > 0 ? -90 : W + 90, x1 = dir > 0 ? W + 90 : -90, dur = 9, tx = rnd(W * .25, W * .75);
    fx("g", { x: x0, y, vx: (x1 - x0) / dur, life: dur, flip: dir < 0,
      html: `<g transform="scale(1.1)"><path d="M-30 0Q-52 -10 -66 6Q-48 -2 -34 8Z" fill="#2f7a3a"/><ellipse rx="30" ry="9" fill="#3f9a4a"/><g class="wg"><path d="M-6 -6Q-14 -42 12 -48Q4 -26 8 -6Z" fill="#2f7a3a"/></g><path d="M26 -2Q44 -8 52 0Q44 6 28 4Z" fill="#3f9a4a"/><circle cx="46" cy="-3" r="1.8" fill="#ffd23f"/><path d="M52 0L60 -2L54 3Z" fill="#e53935"/></g>`,
      tick(g, h) {
        g.vy = Math.sin(g.t * 2) * 12;
        g.e.querySelector(".wg").setAttribute("transform", `rotate(${(Math.sin(g.t * 9) * 22).toFixed(0)} -4 -6)`);
        if (!g.fired && Math.abs(g.x - tx) < 40) {
          g.fired = true;
          laser(g.x + dir * 58, g.y, tx + dir * 20, floorY(), "#ff7a1a", 12, .9); burst(tx + dir * 20, floorY() - 10, 18, "#ff9a3c", 120);
          const t = S.structs.find(q => !q.mobile && !q.dying && !q.temp && Math.abs(q.x - tx) < 70);
          if (t) t.fireT = 8;
          groundMons().forEach(q => { if (Math.abs(q.x - tx) < 120) { q.m.say = "¡un dragón!"; q.m.mode = "react"; q.m.t = 0; q.m.dur = 1.7; } });
        }
      } });
    logEv(`¡Un dragón sobrevuela las aldeas de ${T()}!`);
  }
  function bombers(n) {
    for (let i = 0; i < n; i++) later(2 + i * 1.5, () => {
      const dir = chance(.5) ? 1 : -1, y = skyY(rnd(.15, .45)), x0 = dir > 0 ? -50 : W + 50, x1 = dir > 0 ? W + 50 : -50;
      const f = flyShip("bomber", x0, y, x1, y + 30, 6, { s: 1.4 });
      f.bt = rnd(.3, 1);
      f.tick = (g, h) => {
        g.bt -= h;
        if (g.bt <= 0 && g.x > 40 && g.x < W - 40) {
          g.bt = rnd(.5, 1.1);
          const b = fx("g", { x: g.x, y: g.y + 8, vy: 40, g: 700, life: 3, html: `<ellipse rx="3" ry="5" fill="#333"/>` });
          b.tick = q => { if (q.y >= floorY()) { q.life = 0; boom(q.x, floorY() - 4, true); destroyAt(q.x, 45, .6); } };
        }
      };
    });
  }
  function worldWar() { startWar(`Guerra mundial: los bandos se enfrentan en trincheras`); bombers(3); logEv(`Los bombarderos cruzan el cielo`); }
  function nuclearTest() {   // lejos del pueblo: un hongo de humo en el horizonte
    const x = rnd(W * .12, W * .88), y0 = floorY();
    fx("flash", { x, y: y0 - 10, r0: 10, r1: Math.max(W, H), life: 1.2, col: "#fff", op: .8 });
    S.shake = 2;
    fx("g", { x, y: y0, life: 9, tick: (g, h) => {
      const u = out3(g.t / 4.5), hh = skyH() * .55 * u, rr = 8 + 34 * u;
      g.e.querySelector(".st").setAttribute("y", -hh); g.e.querySelector(".st").setAttribute("height", hh);
      for (const c of g.e.querySelectorAll(".cp")) { c.setAttribute("cy", -hh); c.setAttribute("rx", rr * (c.dataset.k || 1)); c.setAttribute("ry", rr * .55 * (c.dataset.k || 1)); }
      g.e.setAttribute("opacity", clamp((9 - g.t) / 3, 0, 1).toFixed(2));
    }, html: `<rect class="st" x="-6" width="12" height="0" fill="#7d6f62"/><ellipse class="cp" data-k="1" cx="0" rx="8" ry="4" fill="#a8927a"/><ellipse class="cp" data-k=".62" cx="0" rx="5" ry="3" fill="#d9c4a6"/>` });
    groundMons().forEach(g => { if (chance(.5)) { g.m.say = "¿Y ese hongo?"; g.m.mode = "react"; g.m.t = 0; g.m.dur = 2; } });
    logEv(pick([`Prueba nuclear en el desierto: un hongo de humo se alza en el horizonte`, `Se detona una bomba de prueba: el cielo se ilumina`]));
  }
  function airRaid() {
    const b = anchor(["bunker"]) , gs = free().slice(0, 12); if (!gs.length) return;
    gs.forEach(g => sendTo(g, (b == null ? W / 2 : b) + rnd(-26, 26), "sit", 0, 8));
    logEv(`Suena la sirena: simulacro de ataque nuclear, todos al búnker`);
    later(10, () => releaseAll(gs));
  }
  function radiation() {
    const pl = alive("nuclearplant")[0];
    pandemic({ name: "Radiación", lethal: .45, dur: 28, text: `Accidente en una central nuclear: se escapa radiación` });
    if (pl) for (let i = 0; i < 12; i++) later(i * .4, () => fx("puff", { x: pl.x + rnd(-40, 50), y: floorY() - rnd(8, 60), vy: -12, r0: 3, r1: 12, life: 1.6, col: "#7fe36a", op: .5 }));
  }
  function coldWar() {
    logEv(`Guerra fría: dos potencias acumulan misiles sin atreverse a dispararlos`);
    for (let i = 0; i < 3; i++) later(1 + i * 1.2, () => { const x = rnd(W * .15, W * .85); flyShip("missile", x, floorY() - 10, x + rnd(-50, 50), -40, 2.6, { s: 2 }); });
    free().slice(0, 6).forEach(g => { g.m.say = "¡calma!"; g.m.mode = "react"; g.m.t = 0; g.m.dur = 1.7; });
  }

  // --- guerra y paz ---
  const WEAPON = ["stone", "stone", "arrow", "arrow", "ball", "ball", "bullet", "laser"];
  function startWar(label, opts) {
    opts = opts || {};
    const L = [], R2 = []; let cx = rnd(W * .3, W * .7), tribes = null;
    if (opts.tribes) {   // guerra entre dos pueblos: cada uno pone a los suyos a ambos lados de la frontera
      const [a, b] = opts.tribes[0] < opts.tribes[1] ? opts.tribes : [opts.tribes[1], opts.tribes[0]];
      const la = shuffle(free().filter(g => g.tribe === a)).slice(0, 11), lb = shuffle(free().filter(g => g.tribe === b)).slice(0, 11);
      if (la.length < 3 || lb.length < 3) return false;
      cx = (zone(a)[1] + zone(b)[0]) / 2; tribes = [a, b];
      la.forEach(g => { L.push(g); sendTo(g, cx - (60 + L.length * 9), "fight", 1, 999); });
      lb.forEach(g => { R2.push(g); sendTo(g, cx + (60 + R2.length * 9), "fight", -1, 999); });
    } else {
      const gs = shuffle(free());
      if (gs.length < 6) return false;
      gs.slice(0, 22).forEach((g, i) => {
        const left = i % 2 === 0, side = left ? L : R2; side.push(g);
        sendTo(g, cx + (left ? -1 : 1) * (60 + side.length * 9), "fight", left ? 1 : -1, 999);
      });
    }
    S.stats.guerras++;
    S.war = { phase: "march", t: 0, cx, L, R: R2, shot: 0, ko: 3, dur: opts.dur || rnd(11, 17), weapon: WEAPON[Math.min(S.era, 7)], tribes };
    S.busy = true;
    const pool = S.era <= 2 ? [`Las tribus se disputan el territorio de caza`, `Estalla la guerra entre dos bandos de ${T()}`, `Disputa por el agua: ${T()} toma las armas`]
      : S.era <= 4 ? [`Guerra entre señores feudales por unas tierras`, `Guerra de sucesión: dos primos reclaman la corona`, `Guerra civil: el reino se divide`, `Los ejércitos de ${T()} se enfrentan en el campo de batalla`]
      : S.era === 5 ? [`Guerra de independencia: el pueblo se levanta`, `Los ejércitos se alinean con cañones y fusiles`, `Guerra entre imperios por las colonias`]
      : S.era === 6 ? [`Estalla una guerra a gran escala`, `Conflicto fronterizo: suenan las ametralladoras`, `Guerra civil: el país se divide`]
      : [`Guerra espacial entre colonias rivales`, `Los bandos de ${T()} se enfrentan con láseres`];
    logEv(label || pick(pool));
  }
  function warStep(h) {
    const w = S.war; if (!w) return;
    w.t += h;
    const all = w.L.concat(w.R).filter(g => !(g.dead > 0) && S.mon.includes(g));
    if (w.phase === "march") { if (w.t > 7 || all.every(g => g.act === "fight")) { w.phase = "fight"; w.t = 0; } return; }
    if (w.phase === "fight") {
      w.shot -= h;
      if (w.shot <= 0 && all.length) {
        w.shot = rnd(.16, .38);
        const left = chance(.5), from = pick(left ? w.L : w.R), to = left ? w.R : w.L;
        if (from && to.length) {
          const tg = pick(to), dx = tg.x - from.x, T2 = .8;
          const stra = w.weapon === "bullet" || w.weapon === "laser";
          fx("proj", { kind: w.weapon, x: from.x, y: floorY() + from.dy - 12, vx: stra ? Math.sign(dx) * 700 : dx / T2, vy: stra ? 0 : -450 * T2 / 2 + 0, g: stra ? 0 : 900, life: 1.6, tx: tg.x });
          if (w.weapon === "ball") burst(from.x + Math.sign(dx) * 8, floorY() + from.dy - 12, 4, "#bbb", 40);
        }
      }
      w.ko -= h;
      if (w.ko <= 0 && all.length > 4) { const v = pick(all); v.dead = 2.8; v.m.t = 0; w.ko = rnd(2.5, 5); }
      if (w.t > w.dur) {
        w.phase = "peace"; w.t = 0;
        all.forEach(g => { g.act = "cheer"; g.stay = 6; g.m.t = 0; });
        fx("g", { x: w.cx, y: floorY() - 20, life: 9, html: `<line x1="0" y1="0" x2="0" y2="-36" stroke="#6b4a2a" stroke-width="2"/><path d="M0 -36L22 -32L0 -26Z" fill="#fff" stroke="#ccc"/>` });
        const dir = chance(.5) ? 1 : -1;
        fx("g", { x: dir > 0 ? -20 : W + 20, y: skyY(.3), vx: dir * 120, vy: 0, life: (W + 40) / 120, html: `<ellipse rx="6" ry="3.5" fill="#fff" stroke="#ddd"/><path class="wg" d="M-2 0Q-6 -12 2 -8Z" fill="#fff"/><path d="M2 0Q6 -12 -2 -8Z" fill="#fff"/>`,
          tick: f => { f.e.setAttribute("transform", `translate(${f.x.toFixed(1)} ${(f.y + Math.sin(f.t * 9) * 6).toFixed(1)}) scale(${dir} 1)`); } });
        for (let i = 0; i < 45; i++) fx("conf", { x: w.cx + rnd(-160, 160), y: SKY + rnd(-40, skyH() * .3), vy: rnd(40, 90), life: 6, col: `hsl(${rnd(0, 360)} 85% 60%)` });
        if (w.tribes) tribalOutcome(w); else logEv(pick([`Firman la paz: ${T()} vuelve a ser una sola`, `Tregua y abrazos: se acabó la guerra`, `La paloma llega y los bandos hacen las paces`]));
      }
      return;
    }
    if (w.phase === "peace" && w.t > 6) { all.forEach(g => { g.hold = false; g.stay = 0; }); S.war = null; S.busy = false; }
  }

  const alive2 = i => free().filter(g => g.tribe === i);
  function twoTribes(minA) {   // hay al menos un pueblo con gente libre y otro distinto
    return S.tribes.filter(t => alive2(t.i).length >= (minA || 3)).length >= 1 && S.tribes.length > 1;
  }
  function pairFor(minA) {
    const ok = S.tribes.filter(t => alive2(t.i).length >= (minA || 3));
    if (!ok.length) return null;
    const a = pick(ok).i, b = pick(S.tribes.filter(t => t.i !== a)).i;
    return [a, b];
  }
  const homeOf = i => { const z = zone(i); return rnd(z[0] + 30, z[1] - 30); };
  const sendHome = (gs, i) => gs.forEach(g => { sendTo(g, homeOf(i), "sit", 0, 2); });
  function explorers() {
    const pr = pairFor(3); if (!pr) return;
    const [a, b] = pr, gs = alive2(a).slice(0, 3), z = zone(b), tx = (z[0] + z[1]) / 2 + rnd(-40, 40);
    gs.forEach((g, i) => sendTo(g, tx + i * 14, "cheer", 0, 7));
    logEv(`Exploradores de ${tn(a)} llegan a las tierras de ${tn(b)}`); dipAdd(a, b, 1);
    later(9, () => sendHome(gs, a)); later(15, () => releaseAll(gs));
  }
  function trade() {
    const pr = pairFor(2); if (!pr) return;
    const [a, b] = pr, za = zone(a), zb = zone(b), x0 = (za[0] + za[1]) / 2, x1 = (zb[0] + zb[1]) / 2, dur = Math.abs(x1 - x0) / 60;
    fx("g", { x: x0, y: floorY() + 20, vx: (x1 - x0) / dur, life: dur, flip: x1 < x0,
      html: R(-14, -14, 28, 8, "#a67c2e") + Cir(-9, -4, 5, "#5a3b22") + Cir(9, -4, 5, "#5a3b22") + Cir(-5, -17, 4, "#e8c96a") + Cir(3, -18, 5, "#d9b53a") + Cir(9, -16, 3.5, "#e53935") });
    S.extra += 2; dipAdd(a, b, 1);
    logEv(`Caravana comercial: ${tn(a)} intercambian mercancías con ${tn(b)}`);
  }
  function missionaries() {
    const pr = pairFor(3); if (!pr) return;
    const [a, b] = pr, ta = S.tribes[a], tb = S.tribes[b];
    if (!ta.rel) return;
    const gs = alive2(a).slice(0, 3), z = zone(b), tx = (z[0] + z[1]) / 2 + rnd(-30, 30);
    gs.forEach((g, i) => sendTo(g, tx + i * 14, "cheer", 0, 7));
    if (tb.rel && tb.rel.name !== ta.rel.name && !tb.rel2) {
      tb.rel2 = ta.rel; S.rel2 = ta.rel; S.done.reforma = true; dipAdd(a, b, 1);
      logEv(`Misioneros de ${tn(a)} difunden «${ta.rel.name}»: parte de ${tn(b)} se convierte`);
    } else { logEv(`Misioneros de ${tn(a)} predican en las tierras de ${tn(b)}, sin demasiado éxito`); }
    later(9, () => sendHome(gs, a)); later(15, () => releaseAll(gs));
  }
  function treaty() {
    const pr = pairFor(2); if (!pr) return;
    let [a, b] = pr;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (dip(i, j) < dip(a, b) && alive2(i).length && alive2(j).length) { a = i; b = j; }   // el par mas enemistado
    const l = Math.min(a, b), rr = Math.max(a, b), cx = (zone(l)[1] + zone(rr)[0]) / 2, ga = alive2(a)[0], gb = alive2(b)[0];
    if (!ga || !gb) return;
    sendTo(ga, cx + (a < b ? -14 : 14), "cheer", a < b ? 1 : -1, 6); sendTo(gb, cx + (a < b ? 14 : -14), "cheer", a < b ? -1 : 1, 6);
    fx("g", { x: cx, y: floorY() - 20, life: 8, html: `<line x1="0" y1="0" x2="0" y2="-36" stroke="#6b4a2a" stroke-width="2"/><path d="M0 -36L22 -32L0 -26Z" fill="#fff" stroke="#ccc"/>` });
    dipAdd(a, b, 2); logEv(`Tratado de ${pick(["paz", "amistad", "comercio"])} entre ${tn(a)} y ${tn(b)}`);
    later(8, () => releaseAll([ga, gb]));
  }
  function aid() {
    const p = S.pandemic; if (!p) return;
    const pr = pairFor(2); if (!pr) return;
    p.lethal = Math.max(.08, (p.lethal != null ? p.lethal : .4) - .15); dipAdd(pr[0], pr[1], 1);
    logEv(`${tn(pr[0])} envían médicos y medicinas a ${tn(pr[1])} para frenar ${p.name}`);
  }
  function royalWedding() {
    const pr = pairFor(2); if (!pr) return;
    const [a, b] = pr, gs = alive2(a).slice(0, 4).concat(alive2(b).slice(0, 4)), cx = (zone(Math.min(a, b))[1] + zone(Math.max(a, b))[0]) / 2;
    gs.forEach((g, i) => sendTo(g, cx + (i - 4) * 12, "cheer", 0, 7));
    fireworks(cx, skyY(.4)); dipAdd(a, b, 2);
    logEv(`Boda real: se casan un príncipe de ${tn(a)} y una princesa de ${tn(b)}`);
    later(9, () => releaseAll(gs));
  }
  function tribalWar() {   // guerra entre dos pueblos (mas probable si ya estaban enemistados)
    if (S.unified) return false;
    const cand = [];
    for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) if (free().filter(g => g.tribe === a).length >= 3 && free().filter(g => g.tribe === b).length >= 3) cand.push([a, b]);
    const pr = wpick(cand, q => 1 + Math.max(0, -dip(q[0], q[1])) * 1.5 - Math.max(0, dip(q[0], q[1])) * .4);
    if (!pr) return false;
    const [a, b] = pr;
    if (startWar(pick([`${tn(a)} y ${tn(b)} entran en guerra por el territorio`, `Frontera en llamas: ${tn(a)} contra ${tn(b)}`, `Guerra entre ${tn(a)} y ${tn(b)}`]), { tribes: pr }) === false) return false;
    dipAdd(a, b, -2);
    return true;
  }
  function tribalOutcome(w) {
    const [a, b] = w.tribes, win = chance(.5) ? a : b, lose = win === a ? b : a;
    if (chance(.55)) {   // conquista
      S.structs.filter(q => q.tribe === lose && !q.mobile && !q.dying && !q.temp && Math.abs(q.x - w.cx) < 150).slice(0, 3).forEach(ruinOf);
      S.extra = Math.max(0, S.extra - 1); dipAdd(a, b, -1);
      logEv(`${tn(win)} vencen y toman tierras de ${tn(lose)}`);
    } else { dipAdd(a, b, 2); logEv(`Tablas: ${tn(a)} y ${tn(b)} firman una tregua`); }
  }
  function unify() {   // en la era espacial los pueblos se funden en uno solo
    if (S.unified) return;
    S.unified = true; S.structs.forEach(q => { if (q.kind === "tflag") q.dying = .001; });
    showBanner(`Un solo pueblo: ${S.nation}`);
    logEv(`${S.tribes.map((t, i) => tn(i)).join(", ")} se unen en un solo pueblo: ${S.nation}`);
    for (let i = 0; i < 4; i++) later(i * .5, () => fireworks(rnd(W * .15, W * .85), skyY(rnd(.15, .6))));
  }

  // --- planetas, cohetes y colonizacion ---
  // edificios importantes: al tocarlos dicen que son y de que cultura (5 s)
  const BLD = { castle: ["Castillo"], fort: ["Fortaleza"], cathedral: ["Catedral"], temple: ["Templo"], pyramid: ["Pirámide"], orb: ["Templo cósmico"], totem: ["Tótem"],
    colosseum: ["Coliseo", "romana"], aqueduct: ["Acueducto", "romana"], villa: ["Villa romana", "romana"], obelisk: ["Obelisco", "egipcia"], sphinx: ["Esfinge", "egipcia"],
    longhouse: ["Casa larga", "vikinga"], runestone: ["Piedra rúnica", "vikinga"], pagoda: ["Pagoda"], greatwall: ["Gran Muralla", "china"], pavilion: ["Pabellón", "china"],
    torii: ["Puerta torii", "japonesa"], dojo: ["Dojo", "japonesa"], stepped: ["Pirámide escalonada", "azteca"], palace: ["Palacio con minaretes"], yurt: ["Yurta", "mongola"], taj: ["Mausoleo de mármol", "india"],
    academia: ["Academia"], university: ["Universidad"], observatory: ["Observatorio"], library: ["Biblioteca"], hospital: ["Hospital"], laboratory: ["Laboratorio"], stadium: ["Estadio"], factory: ["Fábrica"],
    skyscraper: ["Rascacielos"], pad: ["Plataforma de lanzamiento"], starport: ["Puerto estelar"], tower: ["Torre luminosa"], dome: ["Cúpula de cultivo"], windmill: ["Molino"], nuclearplant: ["Central nuclear"], silo: ["Silo de misiles"], bunker: ["Búnker antiatómico"], market: ["Mercado"], cave: ["Cueva"], campfire: ["Fogata"], tflag: ["Bandera del pueblo"] };
  const bldPop = document.createElement("div"); bldPop.id = "bldPop"; bldPop.hidden = true; document.body.appendChild(bldPop);
  let bldT = 0;
  function cultureOf(s, key) {
    if (key && CULTURES[key]) return `Cultura ${CULTURES[key].name}` + (!S.unified && S.tribes[s.tribe] ? ` · ${tn(s.tribe)}` : "");
    if (S.unified) return `Cultura de ${S.nation}`;
    const tr = S.tribes[s.tribe];
    if (!tr) return "Cultura de los pueblos del mundo";
    if (tr.cult && CULTURES[tr.cult] && S.era >= 3 && S.era <= 4) return `Cultura ${CULTURES[tr.cult].name} · ${tn(s.tribe)}`;
    return `Cultura de ${tn(s.tribe)}`;
  }
  function showBuilding(s, x, y) {
    const [name, key] = BLD[s.kind];
    bldPop.innerHTML = `<b>${name}</b><br>${cultureOf(s, key)}`; bldPop.hidden = false;
    bldPop.style.left = clamp(x - 100, 8, Math.max(8, W - 250)) + "px"; bldPop.style.top = clamp(y - 66, 8, Math.max(8, H - 90)) + "px";
    clearTimeout(bldT); bldT = setTimeout(() => { bldPop.hidden = true; }, 5000);   // desaparece a los 5 s
  }
  const planetPop = document.createElement("div"); planetPop.id = "planetPop"; planetPop.hidden = true; document.body.appendChild(planetPop);
  let planetT = 0;
  const armPlanetHide = () => { clearTimeout(planetT); planetT = setTimeout(() => { planetPop.hidden = true; }, 15000); };   // se oculta solo tras 15 s sin tocarlo
  for (const ev of ["pointermove", "touchstart", "wheel"]) planetPop.addEventListener(ev, () => { if (!planetPop.hidden) armPlanetHide(); }, { passive: true });
  planetPop.addEventListener("click", e => { e.stopPropagation(); armPlanetHide(); if (e.target.classList && e.target.classList.contains("x")) planetPop.hidden = true; });
  document.addEventListener("click", () => { planetPop.hidden = true; bldPop.hidden = true; });
  addEventListener("keydown", e => { if (e.key === "Escape") planetPop.hidden = true; });
  const REAL_INFO = {
    "Marte": { tipo: "Planeta rocoso (el 4.º del Sistema Solar)", datos: ["Diámetro: 6.779 km", "Gravedad: 0,38 g", "Temperatura media: −63 °C", "Atmósfera: muy fina, de CO₂", "Lunas: Fobos y Deimos", "Día: 24 h 37 min"],
      desc: "El «planeta rojo» debe su color al óxido de hierro. Tiene el volcán más alto del Sistema Solar, el Monte Olimpo, y un cañón de 4.000 km, el Valles Marineris." },
    "la Luna": { tipo: "Satélite natural de la Tierra", datos: ["Diámetro: 3.474 km", "Gravedad: 0,17 g", "Temperatura: de −173 °C a 127 °C", "Atmósfera: prácticamente ninguna", "Distancia a la Tierra: 384.400 km"],
      desc: "Estabiliza la inclinación de la Tierra y provoca las mareas. En cohete se llega en unos tres días." },
    "Europa": { tipo: "Luna helada de Júpiter", datos: ["Diámetro: 3.122 km", "Gravedad: 0,13 g", "Temperatura en superficie: −160 °C", "Océano de agua salada bajo el hielo", "Período orbital: 3,5 días"],
      desc: "Uno de los mejores candidatos para albergar vida fuera de la Tierra: su corteza helada esconde un océano global." },
    "Titán": { tipo: "Luna de Saturno", datos: ["Diámetro: 5.149 km", "Gravedad: 0,14 g", "Temperatura: −179 °C", "Atmósfera densa de nitrógeno", "Lagos y ríos de metano líquido"],
      desc: "La única luna con una atmósfera espesa. Allí llueve metano y, con tan poca gravedad, los monos podrían volar con alas pequeñas." },
  };
  function planetInfo(p) {
    if (REAL_INFO[p.name]) return REAL_INFO[p.name];
    const hh = parseFloat((String(p.c1).match(/\d+/) || [0])[0]), ri = (a, b) => Math.round(rnd(a, b)), ly = ri(4, 420), km = n => n.toLocaleString("es");
    if (p.alien) return { tipo: "Mundo alienígena", datos: [`Distancia: ${ly} años luz`, "Habitantes: desconocidos", `Gravedad: ${rnd(.6, 1.8).toFixed(1)} g`, "Atmósfera: no respirable (por ahora)"],
      desc: "De aquí salen las naves extrañas que se ven en el cielo. Nadie ha vuelto para contar cómo es vivir allá." };
    if (p.ring || p.r > 20) return { tipo: "Gigante gaseoso", datos: [`Diámetro: ${km(ri(60000, 140000))} km`, `Gravedad: ${rnd(1, 2.6).toFixed(1)} g`, "Atmósfera: hidrógeno y helio", `Temperatura: −${ri(100, 190)} °C`, `Distancia: ${ly} años luz`, p.ring ? "Tiene un sistema de anillos" : `Lunas: ${ri(2, 40)}`],
      desc: "No tiene superficie sólida: los monos solo pueden instalarse en estaciones flotantes sobre las nubes." };
    let tipo, temp, atm, desc;
    if (hh >= 80 && hh < 170) { tipo = "Mundo selvático"; temp = ri(18, 34); atm = "respirable, con mucho oxígeno"; desc = "Selvas inmensas y bananos gigantes: el sueño de cualquier mono."; }
    else if (hh >= 170 && hh < 260) { tipo = "Mundo oceánico"; temp = ri(5, 25); atm = "húmeda, con tormentas constantes"; desc = "Casi toda su superficie es agua; las colonias flotan sobre plataformas."; }
    else if (hh < 50 || hh >= 330) { tipo = "Mundo desértico"; temp = ri(30, 70); atm = "seca y polvorienta"; desc = "Dunas hasta el horizonte. Dicen que bajo la arena duermen criaturas enormes."; }
    else if (hh >= 260) { tipo = "Mundo de cristales"; temp = ri(-40, 10); atm = "tenue, con brillos de polvo mineral"; desc = "Sus montañas son de cristal y de noche brillan como una ciudad enorme."; }
    else { tipo = "Planeta rocoso"; temp = ri(-60, 40); atm = "fina, con poco oxígeno"; desc = "Un mundo árido de rocas y cráteres, ideal para minas y observatorios."; }
    return { tipo, datos: [`Diámetro: ${km(ri(4000, 15000))} km`, `Gravedad: ${rnd(.4, 1.6).toFixed(1)} g`, `Temperatura media: ${temp} °C`, `Atmósfera: ${atm}`, `Distancia: ${ly} años luz`, `Día: ${ri(8, 60)} h`], desc };
  }
  function showPlanet(p) {
    const i = p.info, col = p.col > 0 ? `${p.col} colono${p.col > 1 ? "s" : ""} de ${natName()}` : p.alien ? "territorio alienígena" : "ninguna todavía";
    planetPop.innerHTML = `<button class="x" aria-label="Cerrar">×</button><b>${p.name}</b><div class="sub">${i.tipo}</div>` +
      `<ul>${i.datos.map(x => `<li>${x}</li>`).join("")}<li>Descubierto: ${p.disc}</li><li>Colonias: ${col}</li></ul><p>${i.desc}</p>`;
    planetPop.hidden = false; armPlanetHide();
    planetPop.style.left = clamp(p.x - 140, 8, W - 292) + "px"; planetPop.style.top = Math.min(Math.max(8, H - 260), p.y + p.r + 24) + "px";
  }
  let pid = 0;
  function addPlanet(o) {
    const i = S.planets.length, r = Math.round((o && o.r) || (i === 0 ? 44 : rnd(13, 22)));
    const p = Object.assign({ id: ++pid, name: nm() + " " + pick(["b", "c", "IV", "Prime", "X"]), c1: hsl(rnd(0, 360), 55, 62), c2: hsl(rnd(0, 360), 55, 28), ring: chance(.3), col: 0 }, o || {});
    p.r = r;
    p.g = el("g", {}, gPlanets);
    const rr = r * 1.75, rk = r * .38, sw = Math.max(3, r * .14);
    p.g.innerHTML = `<defs><radialGradient id="pg${p.id}" cx=".35" cy=".35"><stop offset="0" stop-color="${p.c1}"/><stop offset="1" stop-color="${p.c2}"/></radialGradient></defs>` +
      (p.ring ? `<ellipse rx="${rr}" ry="${rk}" fill="none" stroke="${p.c1}" stroke-width="${sw}" opacity=".55" transform="rotate(-18)"/>` : "") +
      `<circle r="${r}" fill="url(#pg${p.id})"/><circle cx="${-r * .3}" cy="${-r * .22}" r="${r * .16}" fill="${p.c2}" opacity=".5"/><circle cx="${r * .35}" cy="${r * .3}" r="${r * .2}" fill="${p.c2}" opacity=".45"/>` +
      (p.ring ? `<path d="M${-rr} 0A${rr} ${rk} 0 0 0 ${rr} 0" fill="none" stroke="${p.c1}" stroke-width="${sw}" opacity=".7" transform="rotate(-18)"/>` : "") +
      `<g class="col"></g><text y="${r + 13}" text-anchor="middle" font-size="10" font-weight="700" style="fill:var(--sky-text)">${p.name}</text>`;
    p.info = planetInfo(p); p.disc = fmtYear(curYear());
    p.g.style.pointerEvents = "all"; p.g.style.cursor = "pointer";
    p.g.addEventListener("click", e => { e.stopPropagation(); showPlanet(p); });
    S.planets.push(p); placePlanets(); renderColonies(p);
    return p;
  }
  function placePlanets() {
    S.planets.forEach((p, i) => {
      if (SKY > 0) { p.x = W - 80 - i * 125; p.y = SKY + 50 + (i % 2) * 52; if (p.x < 60) { p.x = 60 + (i * 131) % Math.max(60, W - 120); p.y = SKY + 100; } }   // en el cielo del panel
      else {   // sin division: arriba a la derecha y en la franja libre del encabezado
        p.x = i === 0 ? W - 88 : 340 + (i - 1) * 105; p.y = i === 0 ? 96 : 30;
        if (i && p.x > W * .6) p.x = 340 + ((i * 97) % Math.max(60, W * .25));
      }
      p.g.setAttribute("transform", `translate(${p.x} ${p.y})`);
    });
  }
  function renderColonies(p) {
    const c = p.g.querySelector(".col"), n = Math.min(6, p.col);
    let html = "";
    for (let i = 0; i < n; i++) {
      const a = (-150 + i * 24) * Math.PI / 180, x = p.r * Math.cos(a), y = p.r * Math.sin(a);
      html += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(a * 180 / Math.PI + 90).toFixed(0)})"><path d="M-6 0A6 6 0 0 1 6 0Z" fill="#cfe9ff" stroke="#fff" stroke-width="1"/><line x1="6" y1="0" x2="6" y2="-10" stroke="#555"/><path d="M6 -10L13 -8L6 -6Z" fill="${hsl(S.flag[0], 70, 50)}"/></g>`;
    }
    c.innerHTML = html;
  }
  function ensureDest() { if (!S.planets.length) addPlanet({ name: S.dest.name, c1: S.dest.c1, c2: S.dest.c2, r: 44, ring: false, dest: true }); }
  function removePlanet(p) { p.g.remove(); S.planets.splice(S.planets.indexOf(p), 1); S.colonists = S.planets.reduce((a, q) => a + q.col, 0); placePlanets(); }
  function clearPlanets() { S.planets.forEach(p => p.g.remove()); S.planets = []; S.colonists = 0; }
  const pickPlanet = () => { const f = S.planets.find(p => p.dest); return f && f.col < S.goal ? f : pick(S.planets.filter(p => !p.alien)) || S.planets[0]; };

  function tryLaunch() {
    const pad = alive("pad").find(p => p.ready && p.built > .9), gs = free();
    if (!pad || gs.length < 4 || !S.destSeen || !S.planets.length) return false;
    const pl = pickPlanet();
    gs.sort((a, b) => Math.abs(a.x - pad.x) - Math.abs(b.x - pad.x));
    const grp = gs.slice(0, 2 + (Math.random() * 3 | 0));
    grp.forEach(g => sendTo(g, pad.x + rnd(-16, 16), "cheer", 1, 99));
    S.launch = { pad, grp, t: 0, pl }; S.busy = true;
    logEv(`Preparan un cohete hacia ${pl.name}`);
    return true;
  }
  function launchStep(h) {
    const L = S.launch; if (!L) return;
    L.t += h;
    if (L.t > 9 || L.grp.every(g => g.act === "cheer")) {
      L.pad.ready = false; L.pad.readyT = 18 / Math.min(2, S.boost);
      L.grp.forEach(g => { boom(g.x, floorY() - 10, false); killMon(g); });
      const n = L.grp.length, f = { x0: L.pad.x + 2, y0: floorY() - 70, x1: L.pl.x, y1: L.pl.y, pl: L.pl, t: 0, dur: 8, n, e: el("g", {}, gFx) };
      f.e.innerHTML = `<g>${Pth("M-5 6Q-5 -22 2 -28Q9 -22 9 6Z", "#f4f1ea")}${Pth("M-5 -14Q2 -30 9 -14Z", "#e53935")}${Cir(2, -6, 2.6, "#6fb7ff")}<path d="M-3 6Q2 22 7 6Z" fill="#ff9a3c"/></g>`;
      S.flights.push(f);
      S.stats.cohetes++;
      logEv(`¡Despega! ${n} monos viajan a ${L.pl.name}`);
      S.launch = null; S.busy = false;
    }
  }
  function flightStep(h) {
    for (const f of S.flights) {
      f.t += h;
      if (f.pl && S.planets.includes(f.pl)) { f.x1 = f.pl.x; f.y1 = f.pl.y; }
      const u = clamp(f.t / f.dur, 0, 1), e = u * u * .6 + u * .4;   // acelera
      const cx = f.x0 + (f.x1 - f.x0) * .15, cy = f.y0 - skyH() * .7;
      const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * cx + e * e * f.x1, y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * cy + e * e * f.y1;
      const dx = 2 * (1 - e) * (cx - f.x0) + 2 * e * (f.x1 - cx), dy = 2 * (1 - e) * (cy - f.y0) + 2 * e * (f.y1 - cy);
      f.e.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(Math.atan2(dy, dx) * 180 / Math.PI + 90).toFixed(0)}) scale(${lerp(1, .45, u).toFixed(2)})`);
      if (chance(h * 25)) fx("puff", { x, y, vx: rnd(-8, 8), vy: rnd(-8, 8), r0: 3, r1: 9, life: 1.1, col: "#e8e8e8", op: .6 });
      if (u >= 1) { f.done = true; arrivePlanet(f); }
    }
    S.flights = S.flights.filter(f => { if (f.done) { f.e.remove(); return false; } return true; });
  }
  function arrivePlanet(f) {
    if (!S.planets.includes(f.pl)) return;   // el planeta ya no existe
    f.pl.col += f.n; S.colonists += f.n; boom(f.x1, f.y1, false); renderColonies(f.pl);
    logEv(`Llegan ${f.n} colonos a ${f.pl.name}: ya son ${S.colonists}`);
    if (!S.won && S.colonists >= S.goal) {
      S.won = true; showBanner(`¡${natName()} colonizó ${S.dest.name}!`);
      logEv(`¡${T()} COLONIZÓ ${S.dest.name.toUpperCase()}!`);
      for (let i = 0; i < 6; i++) later(i * .5, () => fireworks(rnd(W * .1, W * .9), skyY(rnd(.15, .6))));
    }
  }

  // ---------- era galactica: sagas de ciencia ficcion ----------
  const later = (sec, fn) => S.q.push({ at: S.t + sec, fn });
  function qStep() {
    if (!S.q.length) return;
    const due = S.q.filter(e => e.at <= S.t);
    if (!due.length) return;
    S.q = S.q.filter(e => e.at > S.t);
    due.forEach(e => e.fn());
  }
  const at = (t, fn) => later(t * rnd(.92, 1.08), fn);
  const floatText = (x, y, text, col) => fx("g", { x, y, vy: -30, life: 1.1,
    html: `<text text-anchor="middle" font-size="12" font-weight="800" style="fill:${col || "#e53935"};stroke:#fff;stroke-width:.6px">${text}</text>` });
  const bigText = txt => fx("g", { x: W / 2, y: skyY(.4), life: 1, html: `<text text-anchor="middle" font-size="44" font-weight="900" style="fill:#e53935;stroke:#fff;stroke-width:1.4px">${txt}</text>` });
  const laser = (x0, y0, x1, y1, col, w, life) => fx("line", { x1: x0, y1: y0, x2: x1, y2: y1, col, w: w || 2, life: life || .2 });
  function ruinOf(s) {
    if (s.dying) return;
    s.dying = .001;
    const r = addStruct("ruin", s.x); r.lifeT = rnd(30, 60);
    S.planPause = Math.max(S.planPause, 14);
  }
  function destroyAt(x, rad, frac) {
    S.structs.forEach(s => { if (!s.mobile && !s.dying && !s.temp && Math.abs(s.x - x) < rad) ruinOf(s); });
    groundMons().forEach(g => { if (Math.abs(g.x - x) < rad && chance(frac == null ? .8 : frac)) g.dead = .8 + rnd(0, .6); });
  }

  // naves (miran hacia +x)
  const SHIP = {
    longship: () => Pth("M-34 -2Q-34 6 -22 7L22 7Q34 6 36 -4L36 -12Q31 -10 30 -4L-30 -4Q-32 -8 -36 -14Q-34 -6 -34 -2Z", "#6b4226") + R(-1, -32, 2.4, 28, "#4a3220") +
      Pth("M-16 -30L16 -30L12 -10L-12 -10Z", "#c0392b") + `<path d="M-14 -24L14 -24M-13 -17L13 -17" stroke="#f4efe2" stroke-width="2"/>` + Pth("M36 -12L45 -21L41 -8Z", "#6b4226") + [-18, -6, 6, 18].map(x => Cir(x, 1, 3, "#d9b66a")).join(""),
    galleon: () => Pth("M-36 0Q-30 10 -14 10L22 10Q36 8 40 -4L36 -6L-32 -6Z", "#5a3a22") + R(-14, -36, 2.4, 30, "#3a2616") + R(10, -32, 2.4, 26, "#3a2616") +
      Pth("M-12 -34L10 -34L8 -10L-12 -10Z", "#f4efe2") + Pth("M12 -30L30 -30L28 -10L12 -10Z", "#e8e0d0") + `<line x1="-36" y1="-6" x2="-45" y2="-13" stroke="#3a2616" stroke-width="2"/>`,
    bomber: () => Ell(0, 0, 26, 5, "#6b7280") + Pth("M-4 0L-16 -16L-8 -16L8 0Z", "#59606b") + Pth("M-4 2L-16 18L-8 18L8 2Z", "#59606b") + Pth("M-24 0L-32 -9L-26 -9L-18 0Z", "#59606b") + Cir(20, -1, 2, "#bfe3ff"),
    destroyer: () => Pth("M-42 0L26 -11L46 0L26 11Z", "#59606b") + Pth("M-42 0L26 -11L46 0Z", "#6b7380") + Pth("M-12 -7L6 -7L2 -17L-8 -17Z", "#444b55") + Cir(-40, 0, 3.5, "#6fb7ff") + R(-30, -1, 40, 1.6, "#2d323a"),
    fighter: () => Pth("M-9 0L5 -4L11 0L5 4Z", "#cfd6dd") + Pth("M-3 -3L-8 -10L-1 -4Z", "#9aa4b2") + Pth("M-3 3L-8 10L-1 4Z", "#9aa4b2") + Cir(-9, 0, 2, "#ff9a3c"),
    saucer: () => Ell(0, 0, 30, 8, "#8d96a3") + Ell(0, -6, 14, 9, "#9fe3ff", 'opacity=".75"') + [-18, -6, 6, 18].map(x => Cir(x, 2, 1.8, "#ffd23f")).join(""),
    derelict: () => Pth("M-34 0Q-30 -14 0 -16Q34 -14 40 0Q30 8 0 7Q-30 8 -34 0Z", "#6e7681") + R(-4, -22, 10, 7, "#4a515b") + Cir(10, -3, 2.2, "#e53935"),
    missile: () => Pth("M-8 -1.6L4 -1.6L9 0L4 1.6L-8 1.6Z", "#e8e8e8") + Pth("M-8 -1.6L-12 -4L-5 -1.6Z", "#e53935") + Cir(-9, 0, 2.2, "#ff9a3c"),
  };
  function flyShip(kind, x0, y0, x1, y1, dur, o) {
    o = o || {};
    return fx("g", Object.assign({ x: x0, y: y0, vx: (x1 - x0) / dur, vy: (y1 - y0) / dur, life: dur, flip: x1 < x0,
      rotate: Math.atan2(y1 - y0, Math.abs(x1 - x0)) * 180 / Math.PI, html: `<g transform="scale(${o.s || 1})">${SHIP[kind]()}</g>` }, o));
  }
  function hoverShip(kind, i, n, home, scale) {
    const hx = W * (.12 + .76 * (i + .5) / n) + rnd(-20, 20), hy = skyY(rnd(.12, .3)), ph = rnd(0, 6);
    const x0 = home ? home.x : (chance(.5) ? -60 : W + 60), y0 = home ? home.y : -40;
    const f = fx("g", { x: x0, y: y0, life: 99999, html: `<g transform="scale(${scale || 1.5})">${SHIP[kind]()}</g>`,
      tick(f, h) { const u = Math.min(1, f.t / 4); f.x = lerp(x0, hx, out3(u)) + (u >= 1 ? Math.sin(f.t * .4 + ph) * 28 : 0); f.y = lerp(y0, hy, out3(u)) + Math.sin(f.t * .9 + ph) * 4; f.vx = 0; f.vy = 0; } });
    S.fleet.push(f);
    return f;
  }
  const fleet = (n, home, kind) => { for (let i = 0; i < n; i++) later(i * .6, () => hoverShip(kind || "destroyer", i, n, home, 1.6)); };
  function shipBeam(f, x) {
    if (!f) return;
    laser(f.x, f.y + 8, x, floorY() + 4, "#ff4d4d", 5, .6); boom(x, floorY() - 8, true); destroyAt(x, 70, .85); S.shake = .8;
  }
  function dogfight(n) {
    for (let i = 0; i < n; i++) later(i * rnd(.3, .8), () => {
      const dir = chance(.5) ? 1 : -1, y = skyY(rnd(.1, .6)), x0 = dir > 0 ? -40 : W + 40, x1 = dir > 0 ? W + 40 : -40;
      const f = flyShip("fighter", x0, y, x1, y + rnd(-60, 60), rnd(3.2, 5), { s: 1.6 });
      f.sh = rnd(.2, .5);
      f.tick = (g, h) => {
        g.sh -= h;
        if (g.sh <= 0) { g.sh = rnd(.25, .6); laser(g.x, g.y, g.x + dir * rnd(80, 170), g.y + rnd(-40, 40), chance(.5) ? "#ff4d6d" : "#6fd3ff", 2.2, .18); }
        if (chance(h * .35)) { boom(g.x, g.y, false); g.life = 0; }
      };
    });
  }
  function station() {
    const f = fx("g", { x: W * rnd(.22, .45), y: skyY(.24), life: 99999,
      html: `<g><circle r="62" fill="#8e96a3"/><path d="M-62 0A62 62 0 0 0 62 0Z" fill="#6b7380" opacity=".6"/><path d="M-62 3Q0 12 62 3" stroke="#4a515b" stroke-width="3" fill="none"/>` +
        `<circle cx="-22" cy="-20" r="15" fill="#6b7380"/><circle cx="-22" cy="-20" r="10" fill="#3b424d"/><circle cx="-22" cy="-20" r="4" fill="#7dff9a"/><circle cx="20" cy="22" r="3" fill="#ffd23f"/><circle cx="34" cy="10" r="2" fill="#ffd23f"/></g>`,
      tick(f, h) { f.e.setAttribute("transform", `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) scale(${(.1 + .9 * out3(f.t / 3)).toFixed(2)})`); } });
    S.station = f;
  }
  function stationFire(tx, final) {
    const st = S.station; if (!st) return;
    const dx = st.x - 22, dy = st.y - 20;
    fx("flash", { x: dx, y: dy, r0: 3, r1: 26, life: 2.4, col: "#7dff9a", op: .9 });
    later(2.4, () => {
      laser(dx, dy, tx, floorY() + 4, "#7dff9a", 10, .9); laser(dx, dy, tx, floorY() + 4, "#d8ffe0", 4, .9);
      boom(tx, floorY() - 6, true); fx("flash", { x: tx, y: floorY() - 20, r0: 10, r1: 150, life: .8, col: "#bfffcf", op: .6 });
      destroyAt(tx, final ? 9999 : 170, final ? 1 : .6); S.shake = 2;
      if (final) later(1.2, () => cataclysm({ title: "La Estrella Negra dispara", text: `El superláser destruye el planeta: solo escapan unas cápsulas`, surv: 4 }));
    });
  }
  function stationExplode() {
    const st = S.station; if (!st) return;
    boom(st.x, st.y, true); fx("flash", { x: st.x, y: st.y, r0: 20, r1: 140, life: 1, col: "#fff", op: .8 }); burst(st.x, st.y, 24, "#ffb24d", 160);
    st.life = 0; S.station = null;
  }

  // criaturas y enemigos que persiguen a los monos
  const CRITS = {};
  function nearestMon(x) { let b = null, d = 1e9; for (const g of groundMons()) { const dd = Math.abs(g.x - x); if (dd < d) { d = dd; b = g; } } return b ? { g: b, d } : null; }
  function nearestCrit(x) { let b = null, d = 1e9; for (const c of S.crits) { if (c.dying) continue; const dd = Math.abs(c.x - x); if (dd < d) { d = dd; b = c; } } return b; }
  function devour(c, g) { g.dead = .5; S.stats.devorados++; dust(g.x, 3); floatText(g.x, floorY() - 30, pick(["¡ñam!", "¡crunch!"])); }
  function shootAt(c, g, col, y0) {
    laser(c.x + c.dir * 10, floorY() - (y0 || 26), g.x, floorY() + g.dy - 8, col, 3, .25);
    boom(g.x, floorY() + g.dy - 8, false); g.dead = .6; S.stats.devorados++;
  }
  function chomp(x, rad) {
    boom(x, floorY() - 10, false);
    groundMons().forEach(g => { if (Math.abs(g.x - x) < rad) { g.dead = .5; S.stats.devorados++; } });
    S.structs.forEach(s => { if (!s.mobile && !s.dying && !s.temp && Math.abs(s.x - x) < rad * .8) ruinOf(s); });
    floatText(x, floorY() - 60, "¡ÑAM!"); S.shake = .6;
  }
  function killCrit(c, acid) {
    if (c.dying) return;
    c.dying = .001;
    if (acid) for (let i = 0; i < 6; i++) fx("puff", { x: c.x + rnd(-10, 10), y: floorY() - rnd(2, 20), vx: rnd(-20, 20), vy: -rnd(5, 25), r0: 3, r1: 11, life: 1, col: "#7fbf3f", op: .7 });
    else boom(c.x, floorY() - 14, false);
  }
  function critAdd(kind, x, o) {
    const def = CRITS[kind], c = Object.assign({ kind, x: clamp(x, 12, W - 12), dir: x < W / 2 ? 1 : -1, t: 0, eat: 0, _q: {} }, o || {});
    c.el = el("g", {}, gCrit); c.el.innerHTML = def.draw(c);
    c.q = sel => c._q[sel] || (c._q[sel] = c.el.querySelector(sel));
    if (def.init) def.init(c);
    S.crits.push(c);
    return c;
  }
  function critStep(c, h) {
    c.t += h;
    if (c.dying) { c.dying += h / .5; if (c.dying > 1) { if (c.dots) c.dots.remove(); c.el.remove(); c.gone = true; } return; }
    CRITS[c.kind].tick(c, h);
  }
  function renderCrits() {
    for (const c of S.crits) {
      const b = c.dying ? 1 - c.dying : 1, f = c.noflip ? 1 : (c.dir < 0 ? -1 : 1);
      setT(c.el, `translate(${c.x.toFixed(1)} ${(floorY() + 6).toFixed(1)}) scale(${f * (c.sc || 1)} ${c.sc || 1})`);
      setO(c.el, ((c.alpha == null ? 1 : c.alpha) * Math.max(0, b)).toFixed(2));
    }
  }
  CRITS.xeno = {
    draw: () => `<g class="b"><path d="M-14 -14Q-36 -12 -44 -30Q-40 -14 -22 -8Z" fill="#1d2333" stroke="#0e1220" stroke-width="1.2"/>` +
      `<ellipse cx="0" cy="-14" rx="15" ry="9" fill="#232b40"/><path d="M8 -20Q16 -34 40 -26Q46 -22 38 -17Q24 -15 14 -12Z" fill="#2a3350"/>` +
      `<path d="M12 -26Q24 -33 38 -26" stroke="#5a6aa0" stroke-width="1.5" fill="none" opacity=".7"/>` +
      `<path class="jw" d="M38 -19l5 2l-5 1.6l3 2.2l-6 .6z" fill="#e8e8e8" style="display:none"/>` +
      `<g stroke="#1d2333" stroke-width="3" stroke-linecap="round" fill="none"><path d="M-6 -8L-10 0"/><path d="M8 -8L12 0"/><path d="M-12 -14L-18 -6M14 -14L20 -4"/></g></g>`,
    tick(c, h) {
      const n = nearestMon(c.x); c.eat -= h;
      if (n && n.d < 22 && c.eat <= 0) { c.eat = 1.1; c.mouth = .5; devour(c, n.g); }
      else if (n) { c.dir = n.g.x >= c.x ? 1 : -1; if (c.eat <= .6) c.x += c.dir * 135 * h; }
      else { c.dir = c.x < W / 2 ? 1 : -1; c.x += c.dir * 30 * h; }
      c.x = clamp(c.x, 10, W - 10); c.mouth = Math.max(0, (c.mouth || 0) - h);
      c.q(".b").setAttribute("transform", `translate(0 ${(-Math.abs(Math.sin(c.t * 14)) * 2).toFixed(1)})`);
      c.q(".jw").style.display = c.mouth > 0 ? "" : "none";
      if (S.fightBack && chance(h * .35) && groundMons().filter(g => Math.abs(g.x - c.x) < 90).length >= 2) killCrit(c, true);
    } };
  CRITS.predator = {
    init(c) { c.alpha = .55; c.aim = null; c.cool = 1.5; c.sc = 1.2; },
    draw: () => R(-6, -28, 12, 18, "#8a7a4a") + R(-5, -12, 4, 12, "#6b5f3a") + R(1, -12, 4, 12, "#6b5f3a") + R(-11, -28, 4, 16, "#7d6e42") + R(7, -28, 4, 16, "#7d6e42") +
      Cir(0, -34, 6, "#a79a68") + R(-3, -36, 6, 2.4, "#444") + `<path d="M-4 -30L-6 -26M4 -30L6 -26M0 -29L0 -25" stroke="#d8cfa0" stroke-width="1.4"/>` +
      `<path d="M-5 -38L-14 -30M-3 -39L-11 -24M3 -39L11 -24M5 -38L14 -30" stroke="#3a3320" stroke-width="1.6"/>` + R(6, -36, 11, 4, "#444") + Cir(16, -34, 1.4, "#e53935") +
      `<path d="M-6 -22L6 -22M-6 -18L6 -18" stroke="#c9b97a" stroke-width="1"/>`,
    tick(c, h) {
      c.alpha = .4 + .2 * Math.sin(c.t * 3); c.cool -= h;
      let tg = c.target && S.mon.includes(c.target) && !(c.target.dead > 0) && c.target.state === "ground" ? c.target : null;
      if (!tg) { const n = nearestMon(c.x); tg = c.target = n ? n.g : null; c.aim = null; if (c.dots) { c.dots.remove(); c.dots = null; } }
      if (!tg) { c.x += c.dir * 25 * h; if (c.x < 20 || c.x > W - 20) c.dir *= -1; return; }
      const d = tg.x - c.x; c.dir = d >= 0 ? 1 : -1;
      if (c.duel) return;
      if (Math.abs(d) > 170) { c.x += c.dir * 70 * h; return; }
      if (c.cool > 0) return;
      if (c.aim == null) { c.aim = .9; c.dots = el("g", {}, gFx); c.dots.innerHTML = [-4, 0, 4].map(o => Cir(o, 0, 1.6, "#ff2a2a")).join(""); }
      c.aim -= h; c.dots.setAttribute("transform", `translate(${tg.x.toFixed(0)} ${(floorY() + tg.dy - 20).toFixed(0)})`);
      if (c.aim <= 0) {
        shootAt(c, tg, "#7dff9a", 34); c.dots.remove(); c.dots = null; c.aim = null; c.cool = rnd(3, 5); c.target = null;
        c.trophies = (c.trophies || 0) + 1; floatText(c.x, floorY() - 60, "☠" + c.trophies, "#7a6a3a");
      }
    } };
  CRITS.robot = {
    init(c) { c.cool = rnd(.5, 1.5); },
    draw: () => R(-5, -28, 10, 14, "#8a929c") + `<path d="M-4 -24L4 -24M-4 -20L4 -20M-4 -16L4 -16" stroke="#444" stroke-width="1"/>` + Cir(0, -34, 6, "#c9d1d9") + Cir(-2.2, -34.5, 1.6, "#ff2a2a") + Cir(2.2, -34.5, 1.6, "#ff2a2a") + R(-3, -31, 6, 2, "#444") +
      `<g stroke="#6b737d" stroke-width="3" stroke-linecap="round" fill="none"><path class="rl1" d="M-3 -14L-6 0"/><path class="rl2" d="M3 -14L6 0"/><path d="M-5 -26L-10 -14"/></g>` + R(5, -26, 13, 3, "#444") + Cir(18, -24.5, 1.6, "#ff4d4d"),
    tick(c, h) {
      const n = nearestMon(c.x); c.cool -= h;
      if (!n) { c.x += c.dir * 25 * h; if (c.x < 20 || c.x > W - 20) c.dir *= -1; return; }
      c.dir = n.g.x >= c.x ? 1 : -1;
      if (n.d > 160) c.x += c.dir * 50 * h; else if (c.cool <= 0) { c.cool = rnd(1.8, 3); shootAt(c, n.g, "#ff4d4d", 24); }
      c.x = clamp(c.x, 10, W - 10);
      c.q(".rl1").setAttribute("transform", `rotate(${(Math.sin(c.t * 8) * 18).toFixed(0)} -3 -14)`); c.q(".rl2").setAttribute("transform", `rotate(${(-Math.sin(c.t * 8) * 18).toFixed(0)} 3 -14)`);
    } };
  CRITS.tripod = {
    init(c) { c.shot = rnd(1.5, 3); c.sc = 1.25; },
    draw: () => `<path class="lg" d="M-7 -46L-26 0M0 -46L0 0M7 -46L28 0" stroke="#5a606c" stroke-width="3" fill="none" stroke-linecap="round"/>` + Ell(0, -52, 14, 10, "#7a7f8c") + Cir(7, -52, 3.2, "#ff4d4d") + `<path d="M-14 -50L-24 -40M14 -50L22 -42" stroke="#5a606c" stroke-width="2"/>`,
    tick(c, h) {
      if (c.disabled) { killCrit(c, false); return; }
      const n = nearestMon(c.x), tx = n ? n.g.x : W / 2; c.dir = tx >= c.x ? 1 : -1;
      if (Math.abs(tx - c.x) > 80) c.x += c.dir * 28 * h;
      c.x = clamp(c.x, 10, W - 10); c.q(".lg").setAttribute("transform", `skewX(${(Math.sin(c.t * 3) * 7).toFixed(1)})`);
      c.shot -= h;
      if (c.shot <= 0) { c.shot = rnd(2.5, 4); const x2 = (n ? n.g.x : c.x + c.dir * 120) + rnd(-30, 30); laser(c.x + c.dir * 8, floorY() - 80, x2, floorY() + 4, "#ff4d4d", 5, .5); boom(x2, floorY() - 6, false); destroyAt(x2, 60, .9); }
    } };
  CRITS.worm = {
    noflip: true,
    init(c) { c.st = "under"; c.tx = rnd(W * .15, W * .85); c.h = 0; c.hit = false; },
    draw: () => `<path class="wb" d="" fill="#a8743a" stroke="#6b4521" stroke-width="2"/><g class="wr" stroke="#7a5128" stroke-width="1.4" fill="none"></g><g class="wm"><ellipse rx="14" ry="7" fill="#6d1616"/><g class="wt" fill="#f4efe2"></g></g>`,
    tick(c, h) {
      if (c.st === "under") {
        const d = c.tx - c.x; c.x += Math.sign(d) * Math.min(Math.abs(d), 170 * h);
        if (chance(h * 14)) dust(c.x, 1);
        c.h = 0;
        if (Math.abs(d) < 3) { c.st = "rise"; c.t = 0; c.hit = false; dust(c.x, 8); S.shake = .5; }
      } else if (c.st === "rise") { c.h = 100 * out3(c.t / .55); if (c.t > .55) { c.st = "bite"; c.t = 0; } }
      else if (c.st === "bite") {
        c.h = 100 - 14 * Math.sin(c.t * 12);
        if (!c.hit) { c.hit = true; if (S.wormCalm > 0) floatText(c.x, floorY() - 110, "…", "#a8743a"); else chomp(c.x, 60); }
        if (c.t > .7) { c.st = "sink"; c.t = 0; }
      } else {
        c.h = 100 * (1 - out3(c.t / .6));
        if (c.t > .6) { c.st = "under"; c.t = 0; const n = nearestMon(c.x + rnd(-200, 200)); c.tx = n ? clamp(n.g.x + rnd(-40, 40), 30, W - 30) : rnd(W * .15, W * .85); }
      }
      const hh = c.h, wb = c.q(".wb"), wm = c.q(".wm"), wr = c.q(".wr"), wt = c.q(".wt");
      if (hh < 3) { wb.setAttribute("d", ""); wm.style.display = "none"; wr.innerHTML = ""; return; }
      wm.style.display = ""; wb.setAttribute("d", `M-15 0Q-17 ${-hh * .6} 0 ${-hh}Q17 ${-hh * .6} 15 0Z`);
      wm.setAttribute("transform", `translate(0 ${-hh}) scale(1 ${(.5 + .5 * Math.abs(Math.sin(c.t * 10))).toFixed(2)})`);
      wr.innerHTML = [.2, .4, .6, .8].map(f => `<path d="M${-14 * (1 - f * .1)} ${-hh * f}Q0 ${-hh * f + 5} ${14 * (1 - f * .1)} ${-hh * f}"/>`).join("");
      wt.innerHTML = Array.from({ length: 8 }, (_, i) => { const a = i / 8 * 6.283; return `<path d="M${(Math.cos(a) * 12).toFixed(1)} ${(Math.sin(a) * 5.5).toFixed(1)}l${(Math.cos(a) * -3).toFixed(1)} ${(Math.sin(a) * -2).toFixed(1)}l2 2z"/>`; }).join("");
    } };

  // piezas de las sagas
  function alienWorld(c1, c2, name) { ensureDest(); return addPlanet({ alien: true, name: name || nm() + " Prime", c1, c2, r: 34, ring: chance(.4) }); }
  function crash(x) {
    const f = flyShip("derelict", x + 220, -40, x, floorY() - 8, 2.2, { s: 1.5 });
    f.onEnd = () => { boom(x, floorY() - 10, true); S.shake = 1.2; const w = addStruct("wreck", x); w.lifeT = 400; };
  }
  function eggs(x) { for (let i = 0; i < 4; i++) { const e = addStruct("egg", clamp(x + (i - 1.5) * 18, 20, W - 20)); e.lifeT = 200; } }
  function orbitalStrike() {
    for (let i = 0; i < 10; i++) later(i * .5, () => { const x = rnd(40, W - 40); laser(x, -10, x, floorY(), "#ff9a3c", 8, .5); boom(x, floorY() - 6, true); destroyAt(x, 90, .9); S.shake = 1; });
  }
  function missiles() {
    for (let i = 0; i < 12; i++) later(i * .45, () => {
      const x = rnd(40, W - 40), f = fx("g", { x: x - 140, y: SKY - 20, life: .9, vx: 155, vy: (floorY() + 20) / .9, rotate: 48, html: `<g transform="scale(1.6)">${SHIP.missile()}</g>` });
      f.onEnd = () => { boom(x, floorY() - 6, true); destroyAt(x, 90, .8); S.shake = 1; fx("flash", { x, y: floorY() - 20, r0: 10, r1: 90, life: .5, col: "#fff", op: .5 }); };
    });
  }
  function blackhole() {
    S.hole = fx("g", { x: W * rnd(.35, .6), y: skyY(.25), life: 99999,
      html: `<ellipse class="ad" rx="1" ry="1" fill="none" stroke="#ffb24d" stroke-width="5" opacity=".85"/><circle class="bc" r="1" fill="#000"/>`,
      tick(f, h) {
        const r = 8 + Math.min(1, f.t / 90) * 62, ad = f.e.querySelector(".ad");
        f.e.querySelector(".bc").setAttribute("r", r.toFixed(1)); ad.setAttribute("rx", (r * 2).toFixed(1)); ad.setAttribute("ry", (r * .45).toFixed(1));
        ad.setAttribute("transform", `rotate(${(-12 + Math.sin(f.t) * 3).toFixed(1)})`);
        if (chance(h * 30)) { const a = rnd(0, 6.28), d = rnd(120, 260); fx("spark", { x: f.x + Math.cos(a) * d, y: f.y + Math.sin(a) * d * .5, vx: -Math.cos(a) * d * .9, vy: -Math.sin(a) * d * .45, life: 1, col: "#ffb24d", r: 1.8 }); }
      } });
  }
  function eatPlanet() {
    const p = pick(S.planets.filter(q => !q.dest)) || S.planets[S.planets.length - 1];
    if (!p) return;
    boom(p.x, p.y, true); fx("flash", { x: p.x, y: p.y, r0: 10, r1: 80, life: .8, col: "#ffb24d", op: .7 }); removePlanet(p);
  }
  function followLeader() {
    const gs = free().slice(0, 12); if (gs.length < 4) return;
    const tx = rnd(W * .55, W * .85);
    sendTo(gs[0], tx, "cheer", 1, 6);
    gs.slice(1).forEach((g, i) => sendTo(g, tx - 14 - i * 12, "cheer", 1, 6));
    later(12, () => releaseAll(gs));
  }
  function duel() {
    const c = S.crits.find(k => k.kind === "predator" && !k.dying), g = pick(free());
    if (!c || !g) return;
    c.duel = true; sendTo(g, c.x + 42, "fight", -1, 6);
    later(5, () => {
      if (chance(.5) && !c.dying) { killCrit(c, false); logEv(`¡El mono derrota al cazador en un duelo cuerpo a cuerpo!`); }
      else { g.dead = .8; c.duel = false; logEv(`El cazador gana el duelo y se lleva otro trofeo`); }
    });
  }
  function countdown() { [3, 2, 1].forEach((n, i) => later(i, () => bigText(n))); }

  // ---------- sagas ----------
  const SAGAS = [
    { id: "imperio", name: "Guerra de las galaxias", look: ["grayscale(.5) brightness(.85)", "#3a3f4a", "#000", .12],
      go() {
        const home = alienWorld("#c9c9d6", "#4a4a5a", "Capital Imperial"), win = chance(.5);
        at(0, () => { logEv(`Una flota de ${home.name} cubre el cielo: el Imperio exige obediencia`); fleet(3, home); });
        at(16, () => { logEv(`${T()} se divide en rebeldes e imperiales`); startWar(); });
        at(40, () => { logEv(`Combate espacial sobre la ciudad`); dogfight(7); });
        at(64, () => { logEv(`Aparece la Estrella Negra, una estación del tamaño de una luna`); station(); });
        at(88, () => { logEv(`La Estrella Negra destruye una ciudad`); stationFire(rnd(W * .2, W * .8), false); });
        at(114, () => { logEv(`Los rebeldes atacan su punto débil`); dogfight(9); });
        at(136, () => {
          if (win) {
            logEv(`¡Los rebeldes destruyen la Estrella Negra! Pero sus restos caen sobre el planeta`); stationExplode();
            for (let i = 0; i < 8; i++) later(2 + i * .8, () => meteor(true));
            later(11, () => cataclysm({ title: "Lluvia de escombros", text: `Los restos de la Estrella Negra arrasan el planeta`, surv: 5 }));
          } else { logEv(`La Estrella Negra dispara una última vez`); stationFire(W / 2, true); }
        });
      } },
    { id: "arrakis", name: "El planeta de arena", look: ["sepia(.75) saturate(1.3)", "#b98a4a", "#d98c2b", .16],
      go() {
        at(0, () => { logEv(`El planeta se vuelve un desierto: la especia vale más que el oro`); S.spice = 200; });
        at(14, () => { logEv(`Dos casas rivales pelean por la especia`); startWar(); });
        at(34, () => { logEv(`La arena tiembla: despierta un gusano gigante`); critAdd("worm", rnd(W * .15, W * .85)); });
        at(76, () => { logEv(`Un joven mono profetizado calma al gusano y lo cabalga`); S.wormCalm = 16; cheerSome(8, 6); });
        at(100, () => { logEv(`La profecía fracasa y los gusanos se multiplican`); critAdd("worm", rnd(W * .1, W * .9)); critAdd("worm", rnd(W * .1, W * .9)); });
        at(138, () => cataclysm({ title: "Los gusanos devoran el mundo", text: `Los gusanos gigantes devoran lo que queda de ${T()}`, surv: 5 }));
      } },
    { id: "fundacion", name: "La Fundación", look: ["hue-rotate(-20deg) saturate(.9)", "#4a4a58", "#3a5ac0", .08],
      go() {
        at(0, () => { logEv(`El Imperio galáctico tambalea: el sabio Seldon predice treinta mil años de oscuridad`); S.crumble = 95; S.crumbT = 4; });
        at(22, () => { const p = addPlanet({}); logEv(`Plan Seldon: se funda la Fundación en ${p.name}, un planeta remoto`); });
        at(48, () => { logEv(`Primera crisis: bárbaros asaltan la ciudad`); startWar(); });
        at(78, () => { logEv(`La Fundación prospera comerciando`); festival(); });
        at(104, () => { logEv(`El Mulo, un mono mutante, hace que todos lo sigan`); followLeader(); });
        at(132, () => cataclysm({ title: "Cae el Imperio", text: `Cae el Imperio: la Fundación guarda la Enciclopedia y la civilización renacerá desde la era colonial`, surv: 12, era: 4, extra: 8 }));
      } },
    { id: "alien", name: "El octavo pasajero", look: ["hue-rotate(70deg) contrast(1.1) brightness(.85)", "#2f3b34", "#0a2a1a", .16],
      go() {
        const x = rnd(W * .25, W * .75);
        at(0, () => { logEv(`Una señal de socorro guía a ${T()} hasta una nave abandonada`); crash(x); });
        at(14, () => { logEv(`Dentro de la nave hay huevos extraños`); eggs(x); });
        at(26, () => { logEv(`¡Un xenomorfo escapa y empieza a devorar monos!`); critAdd("xeno", x); });
        at(52, () => { logEv(`${T()} se arma con lanzallamas`); S.fightBack = true; });
        at(70, () => { logEv(`Segunda oleada: eclosionan más huevos`); critAdd("xeno", x - 30); critAdd("xeno", x + 30); });
        at(100, () => { logEv(`La reina se esconde en el nido y los huevos se multiplican`); for (let i = 0; i < 3; i++) critAdd("xeno", rnd(30, W - 30)); });
        at(126, () => { logEv(`Última opción: arrasar todo desde la órbita`); orbitalStrike(); later(6, () => cataclysm({ title: "Bombardeo orbital", text: `${T()} arrasa su propio mundo para frenar a los xenomorfos`, surv: 4 })); });
      } },
    { id: "predator", name: "El cazador", look: ["sepia(.35) hue-rotate(60deg) brightness(.9)", "#35452f", "#1a3a12", .14],
      go() {
        const x = rnd(W * .2, W * .8);
        at(0, () => { logEv(`Una nave invisible aterriza en la selva`); const f = flyShip("saucer", x + 160, -40, x, floorY() - 30, 2.4, { s: 1.4 }); f.onEnd = () => boom(x, floorY() - 20, false); });
        at(10, () => { logEv(`Un cazador interestelar desciende: se oyen clics en la oscuridad`); critAdd("predator", x); });
        at(40, () => { logEv(`Los monos se cubren de barro para esconderse`); cheerSome(4, 4); });
        at(56, () => { logEv(`Un mono valiente desafía al cazador`); duel(); });
        at(84, () => { logEv(`El cazador activa su autodestrucción`); countdown(); });
        at(88, () => cataclysm({ title: "Explosión nuclear", text: `La autodestrucción del cazador arrasa la selva`, surv: 4 }));
      } },
    { id: "maquinas", name: "La rebelión de las máquinas", look: ["hue-rotate(120deg) saturate(.7) brightness(.8)", "#26332b", "#00ff66", .1],
      go() {
        at(0, () => { logEv(`Despierta una inteligencia artificial: «Red Neural» toma el control`); S.code = 120; });
        at(14, () => { logEv(`Los robots salen de las fábricas`); for (let i = 0; i < 3; i++) critAdd("robot", chance(.5) ? rnd(20, W * .3) : rnd(W * .7, W - 20)); });
        at(46, () => logEv(`Los monos se esconden en bunkers`));
        at(60, () => { logEv(`Un héroe viaja al pasado para detener a Red Neural`); fx("flash", { x: W / 2, y: floorY() - 40, r0: 6, r1: 70, life: 1, col: "#9fe3ff", op: .8 }); cheerSome(5, 4); });
        at(84, () => { logEv(`Fallan: Red Neural lanza los misiles nucleares`); missiles(); });
        at(106, () => cataclysm({ title: "Invierno nuclear", text: `Invierno nuclear: apenas sobreviven unos pocos monos`, surv: 4 }));
      } },
    { id: "invasion", name: "La guerra de los mundos", look: ["hue-rotate(-40deg) saturate(1.2) brightness(.9)", "#4a3a3a", "#ff3a3a", .12],
      go() {
        const home = alienWorld("#d8603a", "#6a1f10", "Mundo Rojo"), virus = chance(.5);
        at(0, () => { logEv(`Cilindros metálicos caen del cielo`); for (let i = 0; i < 3; i++) later(i * .8, () => meteor(true)); });
        at(14, () => { logEv(`De los cilindros emergen trípodes gigantes`); critAdd("tripod", rnd(30, W * .3)); critAdd("tripod", rnd(W * .7, W - 30)); });
        at(40, () => { logEv(`Platillos enormes cubren las ciudades`); fleet(3, home, "saucer"); for (let i = 0; i < 4; i++) later(3 + i * 4, () => shipBeam(pick(S.fleet), rnd(W * .1, W * .9))); });
        at(62, () => { logEv(`Contraataque militar de ${T()}`); startWar(); });
        at(92, () => {
          if (virus) { logEv(`Los invasores caen enfermos: los frenó un virus microbiano`); S.crits.forEach(c => { c.disabled = true; }); S.fleet.forEach(f => { f.life = 0; }); }
          else logEv(`Nada los detiene: las armas no sirven`);
        });
        at(118, () => cataclysm({ title: "Mundo devastado", text: virus ? `Los invasores caen, pero el planeta queda devastado` : `Los invasores devastan el planeta`, surv: 5 }));
      } },
    { id: "agujero", name: "Horizonte de sucesos", look: ["brightness(.8) contrast(1.15)", "#2a2a36", "#000", .2],
      go() {
        at(0, () => { logEv(`Un agujero negro se acerca al sistema solar`); blackhole(); });
        at(18, () => { logEv(`Las mareas gravitatorias sacuden las ciudades`); quake(); });
        at(36, () => { logEv(`Evacuación: los cohetes parten sin parar`); S.fastLaunch = 70; S.launchT = 0; });
        at(60, () => { logEv(`El agujero negro devora un planeta`); eatPlanet(); });
        at(84, () => { logEv(`Algunos cruzan un agujero de gusano hacia lo desconocido`); fx("flash", { x: W * .75, y: floorY() - 60, r0: 8, r1: 80, life: 1.4, col: "#9fe3ff", op: .8 }); });
        at(106, () => cataclysm({ title: "Horizonte de sucesos", text: `El agujero negro se traga la Tierra; los que cruzaron el agujero de gusano empiezan de nuevo`, surv: 5 }));
      } },
  ];
  function setLook(look) {
    gStruct.style.transition = "filter 2s"; gStruct.style.filter = look ? look[0] : "";
    if (look) { ground.setAttribute("fill", look[1]); tint.setAttribute("fill", look[2]); tint.style.opacity = look[3]; }
    else { ground.setAttribute("fill", ERAS[Math.min(S.era, 8)].ground); tint.style.opacity = 0; }
  }
  function startSaga(id) {
    const def = SAGAS.find(q => q.id === id) || wpick(SAGAS.filter(q => q.id !== S.lastSaga), () => 1);
    S.saga = { def }; S.lastSaga = def.id; setLook(def.look);
    showBanner(`Saga: ${def.name}`); logEv(`Comienza la saga «${def.name}»`);
    def.go();
  }
  function cataclysm(o) {
    if (S.cata) return;
    o = o || {}; S.cata = o; S.busy = true; S.planPause = 999; S.shake = 4; S.stats.cataclismos++;
    showBanner(o.title || "¡Catástrofe!"); logEv(o.text || `Una catástrofe arrasa el mundo`);
    fx("flash", { x: W / 2, y: H / 2, r0: 20, r1: Math.max(W, H) * 1.2, life: 1.6, col: "#fff", op: .95 });
    S.structs.forEach((q, i) => { if (!q.mobile && !q.temp) later(.2 + i * .12, () => { if (!q.dying) { q.dying = .001; boom(q.x, floorY() - 12, true); } }); });
    const surv = o.surv == null ? 3 + (Math.random() * 3 | 0) : o.surv;
    shuffle(groundMons()).slice(surv).forEach((g, i) => { g.dead = 1 + i * .12; });
    S.crits.forEach(c => { c.dying = c.dying || .001; });
    S.fleet.forEach(f => { f.life = 0; }); S.fleet = [];
    for (let i = 0; i < 9; i++) later(i * .6, () => boom(rnd(40, W - 40), floorY() - rnd(0, 30), true));
    later(8, () => resetWorld(o));
  }
  function resetWorld(o) {
    S.q.length = 0;
    S.fx.forEach(f => f.e.remove()); S.fx = [];
    S.flights.forEach(f => f.e.remove()); S.flights = [];
    S.structs.forEach(q => q.el.remove()); S.structs = [];
    S.crits.forEach(c => { if (c.dots) c.dots.remove(); c.el.remove(); }); S.crits = []; S.fleet = [];
    clearPlanets();
    if (S.ufo) { S.ufo.e.remove(); S.ufo.beam.remove(); S.ufo = null; }
    S.war = S.hunt = S.launch = S.saga = S.cata = S.station = S.hole = S.pandemic = S.siege = null; S.busy = false;
    S.fightBack = false; S.wormCalm = S.spice = S.code = S.crumble = S.rain = S.snow = S.eclipse = S.shake = S.fastLaunch = 0;
    S.flood = S.locust = S.drought = S.aurora = S.music = 0;
    S.sea = 0; S.waterH = 0; water.setAttribute("height", 0); dark.setAttribute("opacity", 0);
    groundMons().forEach(g => { g.sick = 0; g.hold = false; g.stay = 0; g.m.parts.root.style.filter = ""; });
    S.cycle++;
    S.medieval = false; S.digital = false; S.era = o.era || 0; S.eraT = 0; S.eraDur = ERAS[S.era].dur * rnd(.75, 1.35); S.extra = o.extra || 0;
    S.done = {}; S.recent = {}; S.won = false; S.destSeen = false; S.dest = wpick(DESTS, d => d.w); S.goal = 4 + (Math.random() * 3 | 0);
    S.traits = { war: rnd(.25, 1.8), curious: rnd(.7, 1.5), luck: rnd(.6, 1.4) };
    S.branch = [0, 0, 0, 0, 0, 0, 0, 0, 0].map(() => chance(.5) ? 1 : 0);
    S.rel = S.rel2 = null; makeTribes(); S.city = nm(); S.hue = rnd(0, 360); S.flag = [rnd(0, 360), rnd(0, 360)];
    S.planPause = 0; S.planT = 0; S.msT = 6; S.evT = 12; S.launchT = null; S.mammothT = 0; S.planetT = null;
    setLook(null); rails.style.display = "none";
    showBanner(o.era ? "El conocimiento sobrevive" : "Los supervivientes empiezan de nuevo");
    logEv(`— Ciclo ${S.cycle}: ${S.tribes.map((t, i) => tn(i)).join(", ")} ${o.era ? "reconstruyen la civilización" : "vuelven a la Edad de Piedra"} —`);
    S.hudT = 0;
  }

  // ---------- poblacion, eras y reloj ----------
  function startWorld() {
    S.started = true; gGround.style.opacity = 1; gStruct.style.opacity = 1; hud.style.opacity = 1; chip.style.opacity = 1;
    logEv(`${T()} llega al suelo: empieza su historia`);
    showBanner(ERAS[0].name);
  }
  function eraUp() {
    S.era++; S.eraT = 0; S.eraDur = ERAS[S.era].dur * rnd(.75, 1.35); S.msT = 4; S.medieval = false; S.digital = false;
    ground.setAttribute("fill", ERAS[S.era].ground);
    showBanner(ERAS[S.era].name); logEv(`Comienza: ${ERAS[S.era].name}`);
    if (S.era === 3) logEv(`Nace ${S.city}, la primera aldea de ${T()}`);
    burst(W / 2, floorY() - 20, 14, "#ffd23f", 100);
    if (S.era === 7) { S.msT = 6; unify(); }
    if (S.era === 8) startSaga();
  }
  function step(h) {
    S.t += h;
    ambient(h);
    S.spawnT += h;
    if (S.spawnT >= SPAWN_S) {
      S.spawnT -= SPAWN_S;
      const ids = A.ids().filter(id => document.querySelector(`.zoo[data-id="${id}"]`));
      if (ids.length) A.spawn(pick(ids));
    }
    for (const k in S.recent) { S.recent[k] -= h; if (S.recent[k] <= 0) delete S.recent[k]; }
    if (S.boostT > 0) { S.boostT -= h; if (S.boostT <= 0) S.boost = 1; }
    if (S.eclipse > 0) { S.eclipse -= h; dark.setAttribute("opacity", (Math.sin(Math.PI * clamp(1 - S.eclipse / 10, 0, 1)) * .55).toFixed(2)); }
    if (S.rain > 0) { S.rain -= h; for (let i = 0; i < h * 90; i++) fx("drop", { x: rnd(0, W), y: SKY - 10, vy: rnd(500, 700), vx: -40, life: 3 }); }
    if (S.snow > 0) { S.snow -= h; for (let i = 0; i < h * 30; i++) fx("flake", { x: rnd(0, W), y: SKY - 10, vy: rnd(40, 80), life: 8 }); }
    S.skyT = (S.skyT == null ? rnd(14, 26) : S.skyT) - h; if (S.skyT <= 0) { S.skyT = rnd(35, 80); skyMessage(); }
    if (S.lunch) { S.lunchMsgT -= h; if (S.lunchMsgT <= 0) { S.lunchMsgT = rnd(110, 200); skyMessage(pick(LUNCH_MSGS)); } }
    S.skyChk = (S.skyChk || 0) - h; if (S.skyChk <= 0) { S.skyChk = 2; const n = measureSky(); if (Math.abs(n - SKY) > 3) layout(); }   // el reparto de la pantalla sigue al tamaño de la informacion
    qStep(); pandemicStep(h);
    if (S.flood > 0) S.flood -= h;
    if (S.sea > 0) S.sea -= h;
    { const k = S.flood > 0 ? Math.sin(Math.PI * clamp(1 - S.flood / S.floodMax, 0, 1)) : 0, target = Math.max(k * 30, S.sea > 0 ? 17 : 0);
      S.waterH += (target - S.waterH) * Math.min(1, h * 3); water.setAttribute("height", S.waterH.toFixed(1)); water.setAttribute("y", (H - S.waterH).toFixed(1)); }
    if (S.locust > 0) { S.locust -= h; for (let i = 0; i < h * 90; i++) fx("spark", { x: -10, y: skyY(rnd(.1, .9)), vx: rnd(150, 260), vy: rnd(-20, 20), life: 4, col: "#3a2a14", r: 1.8 }); }
    if (S.drought > 0) { S.drought -= h; if (S.drought <= 0) { logEv(`La sequía termina: vuelve la lluvia`); S.rain = 8; if (!S.saga) tint.style.opacity = 0; } }
    if (S.music > 0) { S.music -= h; if (chance(h * 5)) { const g = pick(groundMons()); if (g) fx("note", { x: g.x, y: floorY() - 20, vy: -30, vx: rnd(-10, 10), life: 1.6, col: `hsl(${rnd(0, 360)} 70% 55%)` }); } }
    if (S.wormCalm > 0) S.wormCalm -= h;
    if (S.fastLaunch > 0) S.fastLaunch -= h;
    if (S.spice > 0) { S.spice -= h; if (chance(h * 8)) fx("spark", { x: rnd(0, W), y: floorY() - rnd(0, 50), vy: -rnd(5, 20), life: 1.5, col: "#ffb24d", r: 2 }); }
    if (S.code > 0) { S.code -= h; for (let i = 0; i < h * 36; i++) fx("code", { x: rnd(0, W), y: SKY - 10, vy: rnd(60, 140), life: rnd(3, 6) }); }
    if (S.crumble > 0) { S.crumble -= h; S.crumbT -= h; if (S.crumbT <= 0) { S.crumbT = 6; const t = S.structs.filter(q => !q.mobile && !q.dying && !q.temp && q.built > .8); if (t.length > 2) ruinOf(pick(t)); } }
    for (const c of S.crits) critStep(c, h);
    S.crits = S.crits.filter(c => !c.gone);
    for (const g of S.mon.slice()) stepMon(g, h);
    if (S.started) {
      S.eraT += h * S.boost;
      if (S.era === 3 && !S.medieval && S.eraT >= S.eraDur * .3) startMedieval();
      if (S.era === 6 && !S.digital && S.eraT >= S.eraDur * .42) startDigital();
      const ground2 = groundMons().length;
      if (ground2 >= 2 && popTotal() < ERAS[S.era].cap) S.extra += h * (.12 + ground2 * .012) * S.traits.luck;
      if (S.era < 7 && S.eraT >= S.eraDur && popTotal() >= ERAS[S.era + 1].min) eraUp();
      else if (S.era === 7 && ((S.won && S.eraT >= S.eraDur * .5) || S.eraT >= S.eraDur * 3)) eraUp();   // tras colonizar viene la era galactica
      S.planT -= h; if (S.planT <= 0) { S.planT = 1.1; if (S.planPause > 0) S.planPause -= 1.1; else plan(); }
      S.msT -= h; if (S.msT <= 0) { S.msT = rnd(7, 14) / S.traits.curious / S.boost; nextMilestone(); }
      if (!S.busy && !S.saga && !S.lunch) { S.evT -= h; if (S.evT <= 0) { S.evT = rnd(11, 22) / Math.sqrt(S.boost); nextEvent(); } }
      if (S.era >= 7 && S.destSeen && !S.busy && !S.launch && !S.cata) { S.launchT = (S.launchT == null ? 8 : S.launchT) - h; if (S.launchT <= 0) { S.launchT = S.fastLaunch > 0 ? rnd(5, 8) : rnd(14, 22); tryLaunch(); } }
      if (S.era >= 7 && S.destSeen && !S.cata) { S.planetT = (S.planetT == null ? 20 : S.planetT) - h; if (S.planetT <= 0 && S.planets.length < 5) { S.planetT = rnd(24, 40); const pl = addPlanet({}); logEv(`El telescopio descubre ${pl.name}`); } }
      if (S.mammothT > 0) { S.mammothT -= h; }
      if (S.returnT > 0) { S.returnT -= h; if (S.returnT <= 0 && S.returnMon) { const m = S.returnMon; S.returnMon = null; gMon.appendChild(m.parts.root); const g = { m, tribe: Math.max(0, TRIBE_KINDS.indexOf(m.kind)), state: "ground", x: 0, y: 0, rot: 0, vx: 0, vy: 0, vr: 0, dy: rnd(6, GROUND_H - 12), sp: 1, act: "idle", stay: 0 }; g.x = rnd(60, W - 60); g.y = -40; S.mon.push(g); fall(g); m.say = "¡¿?!"; logEv(`El mono abducido regresó... con cara de susto`); } }
    }
    for (const s of S.structs) {
      const def = KINDS[s.kind];
      if (s.dying) s.dying += h / .7; else s.built = Math.min(1, s.built + h / .8);
      if (s.lifeT != null) { s.lifeT -= h; if (s.lifeT <= 0 && !s.dying) s.dying = .001; }
      if (s.fireT > 0 && !s.dying) {
        s.fireT -= h;
        if (chance(h * 22)) fx("spark", { x: s.x + rnd(-s.w / 3, s.w / 3), y: floorY() - rnd(4, 30), vy: -rnd(30, 70), life: rnd(.4, .9), col: chance(.5) ? "#ff7a1a" : "#ffd23f", r: 2.4 });
        if (chance(h * 3)) smoke(s.x, floorY() - 30);
        if (s.fireT <= 0) ruinOf(s);
      }
      if (def.tick && !s.dying) def.tick(s, h);
      if (s.kind === "mammoth" || s.kind === "sheep" || s.kind === "dog" || s.kind === "cart") wander(s, h);
    }
    S.structs = S.structs.filter(s => { if (s.dying > 1) { s.el.remove(); return false; } return true; });
    if (S.started && !S.structs.some(s => s.kind === "mammoth" && !s.dying) && S.era <= 2 && S.mammothT <= 0 && !S.hunt) { /* lo repone plan() */ }
    warStep(h); siegeStep(h); huntStep(h); launchStep(h); flightStep(h); ufoStep(h);
    fxStep(h);
    S.hudT -= h;
    if (S.shake > 0) S.shake -= h;
  }
  function wander(s, h) {   // animales y carretas
    if (s.hunted) return;
    s.wt = (s.wt || 0) - h;
    if (s.wt <= 0) { s.wt = rnd(2, 7); s.v = chance(.35) ? 0 : (chance(.5) ? 1 : -1) * (s.kind === "mammoth" ? 9 : s.kind === "cart" ? 18 : 16); }
    s.x = clamp(s.x + s.v * h, 30, W - 30); if (s.v) s.flip = s.v < 0;
  }
  function renderStructs() {
    const sh = S.shake > 0 ? Math.sin(S.t * 60) * 3 * S.shake : 0;
    for (const s of S.structs) {
      const def = KINDS[s.kind], b = s.dying ? 1 - out3(s.dying) : out3(s.built);
      const sx = (s.flip && !def.noflip ? -1 : 1);
      setT(s.el, `translate(${(s.x + sh).toFixed(1)} ${(floorY() + (s.dy || 0) + 4).toFixed(1)}) scale(${sx} ${Math.max(.001, b).toFixed(3)})`);
    }
  }
  const setT = (e, v) => { if (e._t !== v) { e._t = v; e.setAttribute("transform", v); } };   // solo se escribe en el DOM si el valor cambio
  const setO = (e, v) => { if (e._o !== v) { e._o = v; e.style.opacity = v; } };
  function renderMons() {
    for (const g of S.mon) {
      A.draw(g.m);
      setT(g.m.parts.root, `translate(${g.x.toFixed(1)} ${(g.state === "ground" ? floorY() + g.dy : g.y).toFixed(1)}) scale(${K}) rotate(${g.rot.toFixed(1)} 0 -9)`);
      setO(g.m.parts.root, g.dead > 0 ? clamp(g.dead, 0, 1).toFixed(2) : "1");
    }
  }
  const popLine = () => S.unified ? `Población ${popTotal()} · ${S.nation}` : S.tribes.map(t => { const w = TRIBE_INFO[t.kind].plural; return `${w[0].toUpperCase() + w.slice(1)} ${popOf(t.i)}`; }).join(" · ");
  function renderHud() {
    if (!S.started) { if (hudOpen) hud.innerHTML = "La civilización empieza cuando cae el primer animal de los anillos."; return; }
    if (S.hudT > 0) return;
    S.hudT = .3;
    const e = ERAS[S.era], pop = popTotal(), st = S.stats;
    chip.innerHTML = `<b>${eraName()}</b> · ${fmtYear(curYear())}` + (S.cycle > 1 ? ` · Ciclo ${S.cycle}` : "") + " ▸";
    let h = `<b>${eraName()}</b> · ${fmtYear(curYear())}<br>${popLine()}` + (S.cycle > 1 ? ` · Ciclo ${S.cycle}` : "") + (S.tribes.some(t => t.cult) && !S.unified && S.era <= 4 ? `<br>Culturas: ${S.tribes.map(t => `${TRIBE_INFO[t.kind].plural} ${CULTURES[t.cult] ? CULTURES[t.cult].name : "—"}`).join(" · ")}` : "") +
      (S.saga ? `<br>Saga: ${S.saga.def.name}` : "") +
      (S.era === 7 && S.destSeen ? ` · ${S.dest.name}: ${S.colonists}${S.won ? " ✔" : "/" + S.goal}` : "");
    if (hudOpen) {
      h += `<div class="ev" style="margin-top:4px;max-height:42vh;overflow:auto">` +
        S.log.slice(0, 14).map(l => `${l.y}: ${l.text}`).join("<br>") + `</div>` +
        (S.rel ? `<div style="margin-top:4px">Religión: ${S.rel.name}${S.rel2 && S.done.reforma ? " · rival: " + S.rel2.name : ""}</div>` : "") +
        `<div style="margin-top:4px;border-top:1px solid var(--border);padding-top:3px">Guerras ${st.guerras} · Plagas ${st.plagas} · Hambrunas ${st.hambrunas} · Terremotos ${st.terremotos} · Meteoritos ${st.meteoritos} · Fiestas ${st.festivales} · Cohetes ${st.cohetes} · Pandemias ${st.pandemias} · Incendios ${st.incendios} · Bajas ${st.devorados} · Cataclismos ${st.cataclismos} · Choques ${st.choques} · Hitos ${st.hitos}</div>`;
    }
    hud.innerHTML = h + (Q.has("debug") ? `<br>t=${S.t.toFixed(1)} fx=${S.fx.length} mon=${S.mon.length} st=${S.structs.length}` : "");
  }

  // ---------- almuerzo: a las 12:00 todos paran a comer ----------
  const LUNCH_FROM = 12 * 60, LUNCH_LEN = 60;   // de 12:00 a 12:59 (hora local)
  const LUNCH_MSGS = ["¡Es hora de almorzar!", "¡A almorzar! El paper puede esperar", "¿Ya calentaste tu almuerzo?", "¿Qué hay de almuerzo hoy?", "Pausa de almuerzo: ¡las bacterias también descansan!",
    "Un buen almuerzo vale más que un buen gel", "A comer: los genomas se ensamblan solos un ratito", "¿Fila del microondas? ¡Ve ahora!", "¡Buen provecho, científicos!", "Nada de tesis mientras comes",
    "¿Compartes tu postre?", "Hoy toca almorzar, mañana toca graficar", "Hidrátate y come algo de verdad", "Si no almuerzas, no hay paper", "¿Y si almuerzas lejos del computador?"];
  function startLunch() {
    S.lunch = true; S.lunchMsgT = rnd(90, 150);
    showBanner("¡A almorzar!"); if (Q.has("lunch")) bigRun(BIG[0]); skyMessage("¡Es hora de almorzar!"); pushToast("12:00 · ¡A almorzar!");
    groundMons().forEach(g => { g.hold = false; g.act = "eat"; g.stay = rnd(20, 50); g.m.t = 0; g.m.dur = g.stay; g.m.food = pick(["banana", "berry", "leaf"]); });
    A.setLunch(true);
  }
  function endLunch() {
    S.lunch = false; A.setLunch(false);
    pushToast("Terminó el almuerzo: ¡de vuelta al trabajo!"); skyMessage("¡Se acabó el almuerzo! De vuelta al trabajo");
    groundMons().forEach(g => { g.stay = 0; });
  }
  // ---------- mensajes de pantalla completa con un mono haciendo lo que dice el mensaje ----------
  const big = document.createElement("div"); big.id = "bigMsg"; big.hidden = true; document.body.appendChild(big);
  let bigRaf = 0, bigTimer = 0, bigSeries = [];
  const BIG_SHOW = 8, BIG_TIMES = 5, BIG_GAP = 12;   // a la hora del evento: 5 apariciones de 8 s durante 1 minuto
  function closeBig(all) {
    big.hidden = true; cancelAnimationFrame(bigRaf); clearTimeout(bigTimer); big.innerHTML = "";
    if (all === true) { bigSeries.forEach(clearTimeout); bigSeries = []; }   // al tocarlo se va y no vuelve
  }
  big.addEventListener("click", () => closeBig(true));
  function bigRun(o) {
    closeBig(true);
    for (let i = 0; i < BIG_TIMES; i++) bigSeries.push(setTimeout(() => bigMsg(o), i * BIG_GAP * 1000));
  }
  function bigMsg(o) {
    closeBig();
    const NS = "http://www.w3.org/2000/svg", sp = pick(A.SPECIES_BY_KIND.mono);
    const m = { sp, kind: "mono", pal: A.palette(sp), dir: 1, phase: 0, t: 0, dur: 6, mode: o.mode, mood: { low: 0, mid: 1, high: o.mode === "hop" ? 1 : 0 }, theta: 0, seed: 5,
      hop: { u: 0 }, jump: { u: 0 }, acc: o.acc || null, celeb: null, lane: "cpu", food: o.food };
    m.parts = A.build(m);
    big.innerHTML = `<div class="bm-in ${o.tone || ""}"><svg class="bm-mono" viewBox="0 0 120 130"><g transform="translate(60 124) scale(5.2)"></g></svg><div><div class="bm-t"></div><div class="bm-s"></div></div></div>`;
    big.querySelector(".bm-t").textContent = o.title; big.querySelector(".bm-s").textContent = o.sub;
    big.querySelector("g").appendChild(m.parts.root);
    big.hidden = false;
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(.05, (now - last) / 1000); last = now; m.t += dt; m.phase += dt * (o.mode === "hop" ? 10 : 8);
      if (o.mode === "hop") m.hop.u = Math.abs(Math.sin(m.t * 5));
      if (o.mode === "eat" && m.t > m.dur) m.t = 0;
      A.draw(m); bigRaf = requestAnimationFrame(loop);
    };
    A.draw(m); bigRaf = requestAnimationFrame(loop);
    bigTimer = setTimeout(() => closeBig(), BIG_SHOW * 1000);
  }
  const BIG = [   // at = minuto del dia; days = dias de la semana (0 = domingo) o null = todos
    { id: "almuerzo", at: 12 * 60, days: null, title: "¡A almorzar!", sub: "Buen provecho · el paper puede esperar", mode: "eat", food: "banana", secs: 9 },
    { id: "seminario", at: 9 * 60 + 20, days: [4], title: "¡Seminario FCV!", sub: "Es hora: ¡todos al seminario!", mode: "walk", acc: { name: "lentes redondos", a: "#333", d: "#111" }, secs: 14 },
    { id: "tarde", at: 9 * 60 + 30, days: [4], title: "¿Qué hacen acá?", sub: "¿¿¿No deberían estar en el seminario???", mode: "hop", tone: "alert", secs: 16 },
    { id: "cafe", at: 16 * 60, days: [1, 2, 3, 4, 5], title: "¡Hora del café!", sub: "Un cafecito y seguimos con los genomas", mode: "coffee", secs: 8 },
    { id: "casa", at: 18 * 60, days: [1, 2, 3, 4, 5], title: "¿Lanzaste tus jobs?", sub: "Antes de irte: guarda, respalda y apaga el autoclave", mode: "stretch", secs: 10 },
  ];
  const firedBig = new Set();
  function bigCheck(d) {
    const m = d.getHours() * 60 + d.getMinutes();
    for (const b of BIG) {
      const key = d.toDateString() + b.id;
      if (b.at === m && (!b.days || b.days.includes(d.getDay())) && !firedBig.has(key)) { firedBig.add(key); bigRun(b); }
    }
  }
  if (Q.get("big")) setTimeout(() => { const b = BIG.find(x => x.id === Q.get("big")); if (b) bigRun(b); }, 1500);   // prueba: ?big=almuerzo|seminario|tarde|cafe|casa
  let lunchAt = 0;
  function lunchCheck(now) {   // una vez por segundo
    if (now - lunchAt < 1000) return;
    lunchAt = now;
    const d = new Date(); bigCheck(d);
    const m = d.getHours() * 60 + d.getMinutes(), on = Q.has("lunch") || (m >= LUNCH_FROM && m < LUNCH_FROM + LUNCH_LEN);
    if (on && !S.lunch) startLunch(); else if (!on && S.lunch) endLunch();
  }

  // ---------- ciclo ----------
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    lunchCheck(now);
    if (A.minDt() && now - last < A.minDt()) return;   // si la TV no llega a 60 fps se limita a ~30 (la simulacion usa el tiempo real, no se ralentiza)
    const real = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    if (document.hidden) return;
    for (const k in rectOf) delete rectOf[k];
    let rem = real * TURBO;
    while (rem > 1e-4) { const h = Math.min(.05, rem); step(h); rem -= h; }
    renderStructs(); renderCrits(); renderMons(); renderHud();
  }
  addEventListener("resize", () => { const ow = W; W = innerWidth; H = innerHeight; S.structs.forEach(s => { s.x *= W / ow; }); layout(); });

  // ---------- pruebas (?era=N, ?do=...) ----------
  function testSetup() {
    if (!START_ERA && !Q.get("do")) return;
    S.era = START_ERA; S.eraDur = ERAS[S.era].dur * 2; S.extra = ERAS[S.era].cap; S.destSeen = S.era >= 7; S.won = S.era >= 8;
    const flags = [[1, ["fuego_sagrado"]], [2, ["totems", "trueque"]], [3, ["rueda", "escritura", "comercio", "templo", "academia", "astronomia", "castillo"]], [4, ["catedral", "universidad", "reforma", "imprenta", "feudalismo"]],
      [5, ["electricidad", "deporte", "heroe"]], [6, ["radio", "laboratorio", "antibioticos", "vacunas"]]];
    flags.forEach(([e, fl]) => { if (S.era >= e) fl.forEach(f => { S.done[f] = true; }); });
    if (S.era >= 1) setRels(() => newRel());
    if (S.era >= 4) { S.tribes.forEach(t => { t.rel2 = newRel(); }); S.rel2 = S.tribes[0].rel2; }
    if (S.era >= 7) { S.unified = true; }
    if (S.era === 6) S.digital = Q.has("digital");   // ?era=6 = nuclear; ?era=6&digital
    if (S.era === 3 && Q.has("medieval")) { S.eraT = S.eraDur * .31; }
    if (S.era === 3 && Q.has("medieval") || S.era === 4) assignCultures((Q.get("cult") || "").split(",")), S.medieval = S.era === 3;
    ground.setAttribute("fill", ERAS[S.era].ground);
    S.started = true; gGround.style.opacity = 1; gStruct.style.opacity = 1; hud.style.opacity = 1; chip.style.opacity = 1;
    for (let i = 0; i < 14; i++) {
      const tr = i % 3, m = A.make(TRIBE_KINDS[tr]), zz = zone(tr); gMon.appendChild(m.parts.root); m.mood = { low: 0, mid: 1, high: 0 }; m.theta = 0;
      S.mon.push({ m, tribe: tr, state: "ground", x: rnd(zz[0] + 30, zz[1] - 30), y: 0, rot: 0, vx: 0, vy: 0, vr: 0, dy: rnd(6, GROUND_H - 12), sp: rnd(.85, 1.2), act: "idle", stay: rnd(0, 3) });
    }
    if (S.era >= 7) { ensureDest(); for (let i = 0; i < 3; i++) addPlanet({}); }
    for (let i = 0; i < 14; i++) plan();
    if (S.era >= 3 && S.era <= 4) addStruct("castle", W * .5, { tribe: 1 });
    S.structs.forEach(s => s.built = 1);
    const DO = { pajaros: spawnFlock, nube: () => skyMessage("¿Ya corriste GTDB-Tk en tus MAGs?", W / 2), guerra: () => { if (!tribalWar()) startWar(); }, caceria: startHunt, cohete: () => { S.destSeen = true; ensureDest(); tryLaunch(); }, meteorito: meteor, ovni: ufo, plaga: () => hurt(.25, "Plaga"),
      terremoto: quake, volcan: volcano, festival, eclipse: () => { S.eclipse = 10; }, lluvia: () => { S.rain = 12; }, cometa: comet };
    Object.assign(DO, { cataclismo: () => cataclysm({ surv: 4 }), pandemia: pandemic, incendio: fire, inundacion: () => flood(14, "Inundación"), tormenta: storm, aurora, estrellas: starShower,
      exploradores: explorers, comercio: trade, misioneros: missionaries, tratado: treaty, ayuda: aid, bodareal: royalWedding,
      gladiadores: gladiators, legion, horda: horde, medieval: startMedieval,
      pruebanuclear: nuclearTest, simulacro: airRaid, accidentenuclear: radiation,
      asedio: siege, justas: joust, cruzada: crusade, invasores: raid, pestenegra: () => pandemic({ name: "Peste Negra", lethal: .75, dur: 40 }), dragon, naval: navalBattle, guerramundial: worldWar, guerrafria: coldWar,
      olimpiadas: olympics, peregrinacion: pilgrimage, milagro: miracle, cisma: schism, huelga: strike, crisis, langostas: locusts, sequia: drought, genio: genius, concierto: () => { S.music = 10; cheerSome(10, 8); } });
    if (START_ERA === 8) setTimeout(() => startSaga(Q.get("saga")), 600);
    DO.cielo = skyMessage;
    DO.edificio = () => { const q = S.structs.filter(z => BLD[z.kind] && z.built > .9 && z.kind !== "tflag"); if (!q.length) return; const z = pick(q), b = z.el.getBoundingClientRect(); showBuilding(z, b.left + b.width / 2, b.top + b.height * .35); };
    DO.choque = () => { const gs = groundMons(); if (gs.length < 2) return; const a = gs[0], b = gs[1]; a.state = "fall"; a.x = b.x; a.y = -30; a.vx = 0; a.vy = 0; a.vr = 0; a.bounced = true; a.m.mode = "fall"; };
    const d = Q.get("do"); if (d && DO[d]) setTimeout(DO[d], 2500);
    if (Q.get("planet") != null) setTimeout(() => { const pl = S.planets[+Q.get("planet")]; if (pl) showPlanet(pl); }, 1500);
    if (Q.has("selftest")) setTimeout(() => {   // los vehiculos deben mirar hacia donde van
      const bad = S.structs.filter(q => ["plane", "car", "train"].includes(q.kind) && q.v && (q.kind === "train" ? q.flip !== (q.v > 0) : q.flip !== (q.v < 0))).map(q => q.kind);
      document.title = "selftest:H=" + H + ":floor=" + floorY() + ":" + (bad.length ? "FALLA " + bad.join(",") : "ok") + ":" + S.structs.filter(q => ["plane", "car", "train"].includes(q.kind)).map(q => q.kind + (q.v > 0 ? ">" : "<") + (q.flip ? "F" : "-")).join(",");
    }, 6000);
  }

  const WARP = parseFloat(Q.get("warp")) || 0;   // ?warp=300 adelanta la simulacion 300 s (para pruebas)
  if (WARP) setTimeout(() => { for (let t = 0; t < WARP; t += .05) step(.05); }, 3500);
  festive(0);   // fiestas de hoy: los gorros deben estar listos antes de crear los animales
  layout(); testSetup(); requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
  return { _S: S, _ERAS: ERAS };
})();
