/* Sociedad de monos. Cada 10 s nace un mono en un equipo al azar; cuando hay demasiados
 * se desbordan, caminan tapando los textos y caen al "suelo" (borde inferior de la
 * pantalla). Abajo arman una civilizacion que avanza por eras (piedra, fuego, nomadas,
 * sedentarios, colonial, industrial, moderna, espacial) hasta colonizar otro mundo.
 * La historia es distinta en cada corrida: temperamento, hitos y sucesos al azar.
 * Al recargar la pagina todo vuelve a cero.
 * Pruebas: ?turbo=20 acelera el tiempo; ?era=N empieza en esa era; ?do=guerra|cohete|meteorito|ovni|... */
const World = (function () {
  "use strict";
  const A = Zoo.api;
  const NS = "http://www.w3.org/2000/svg";
  const Q = new URLSearchParams(location.search);
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
  const svg = el("svg", { id: "world", width: W, height: H }, document.body);
  svg.style.cssText = "position:fixed;left:0;top:0;z-index:30;pointer-events:none;overflow:visible";
  const gSky = el("g", {}, svg), gGround = el("g", {}, svg), gStruct = el("g", {}, svg),
        gMon = el("g", {}, svg), gCrit = el("g", {}, svg), gFx = el("g", {}, svg);
  for (const g of [gGround, gStruct]) { g.style.opacity = 0; g.style.transition = "opacity 1.6s"; }
  const ground = el("rect", { x: 0, width: W, height: GROUND_H, fill: "#8b7b5c" }, gGround);
  ground.style.transition = "fill 2s";
  const grass = el("rect", { x: 0, width: W, height: 4, fill: "rgba(255,255,255,.18)" }, gGround);
  const rails = el("g", { style: "display:none" }, gGround);
  const dark = el("rect", { x: 0, y: 0, width: W, height: H, fill: "#000", opacity: 0 }, gSky);   // eclipse
  const gPlanets = el("g", {}, gSky); gSky.insertBefore(gPlanets, dark);
  const tint = el("rect", { x: 0, y: 0, width: W, height: H, fill: "#000" }, gSky);   // tono del cielo segun la saga
  tint.style.opacity = 0; tint.style.transition = "opacity 2s";
  const water = el("rect", { x: 0, width: W, height: 0, fill: "#3b7fbf", opacity: .55 }, gFx);   // inundaciones
  const hud = document.createElement("div"); hud.id = "hud"; hud.style.opacity = 0; document.body.appendChild(hud);
  const banner = document.createElement("div"); banner.id = "eraBanner"; document.body.appendChild(banner);
  const toasts = document.createElement("div"); toasts.id = "toasts"; document.body.appendChild(toasts);
  let hudOpen = Q.has("hud");
  hud.addEventListener("click", () => { hudOpen = !hudOpen; S.hudT = 0; renderHud(); });
  function layout() {
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    ground.setAttribute("y", floorY()); ground.setAttribute("width", W);
    grass.setAttribute("y", floorY()); grass.setAttribute("width", W);
    dark.setAttribute("width", W); dark.setAttribute("height", H);
    rails.innerHTML = `<rect x="0" y="${H - 9}" width="${W}" height="2.5" fill="#444"/>` +
      `<line x1="0" y1="${H - 5}" x2="${W}" y2="${H - 5}" stroke="#5a4630" stroke-width="3" stroke-dasharray="3 9"/>`;
    tint.setAttribute("width", W); tint.setAttribute("height", H); water.setAttribute("width", W);
    placePlanets();
  }

  // ---------- historia: epocas ----------
  const ERAS = [
    { name: "Edad de Piedra",           dur: 55, y0: -50000, y1: -30000, min: 0,  cap: 8,  ground: "#8b7b5c" },
    { name: "Descubrimiento del fuego", dur: 50, y0: -30000, y1: -15000, min: 4,  cap: 12, ground: "#85774f" },
    { name: "Era nómada",               dur: 55, y0: -15000, y1: -10000, min: 6,  cap: 16, ground: "#7c8a55" },
    { name: "Era sedentaria",           dur: 65, y0: -10000, y1: 1400,   min: 9,  cap: 22, ground: "#6f9a4a" },
    { name: "Era colonial",             dur: 55, y0: 1400,   y1: 1760,   min: 13, cap: 30, ground: "#6a9446" },
    { name: "Revolución industrial",    dur: 55, y0: 1760,   y1: 1950,   min: 18, cap: 40, ground: "#6c7a58" },
    { name: "Era moderna",              dur: 55, y0: 1950,   y1: 2030,   min: 24, cap: 52, ground: "#5e6a63" },
    { name: "Era espacial",            dur: 80, y0: 2030,   y1: 2150,   min: 30, cap: 70, ground: "#4f5a66" },
    { name: "Era galáctica",           dur: 500, y0: 2150,  y1: 2900,   min: 0,  cap: 80, ground: "#3d4655" },
  ];
  const DESTS = [
    { name: "Marte", c1: "#e0714a", c2: "#8f3a22", w: 5 }, { name: "la Luna", c1: "#d9d9d4", c2: "#8c8c88", w: 2 },
    { name: "Europa", c1: "#cfe3ee", c2: "#6f95ad", w: 2 }, { name: "Titán", c1: "#e3a64a", c2: "#8a5a1c", w: 1 },
  ];
  const SYL = ["ba", "na", "mo", "ku", "pi", "ri", "tu", "ma", "ko", "lu", "chi", "ta", "ni", "go", "zu", "bu", "fe"];
  const nm = () => { const s = Array.from({ length: 2 + (chance(.5) ? 1 : 0) }, () => pick(SYL)).join(""); return s[0].toUpperCase() + s.slice(1); };

  const S = {
    t: 0, started: false, era: 0, eraT: 0, eraDur: 55, boost: 1, boostT: 0,
    extra: 0, spawnT: 0, evT: 16, msT: 9, planT: 0, hudT: 0, deadT: 0,
    traits: { war: rnd(.25, 1.8), curious: rnd(.7, 1.5), luck: rnd(.6, 1.4) },   // temperamento de esta corrida
    branch: [0, 0, 0, 0, 0, 0, 0, 0].map(() => chance(.5) ? 1 : 0),             // variante de cada era
    done: {}, recent: {}, structs: [], mon: [], fx: [], flights: [], war: null, launch: null, ufo: null,
    rain: 0, eclipse: 0, colonists: 0, goal: 4 + (Math.random() * 3 | 0), won: false, destSeen: false, log: [], busy: false,
    tribe: nm(), city: nm(), hue: rnd(0, 360), flag: [rnd(0, 360), rnd(0, 360)],
    dest: wpick(DESTS, d => d.w), returnT: 0, returnMon: null, mammothT: 0,
    stats: { guerras: 0, plagas: 0, hambrunas: 0, terremotos: 0, meteoritos: 0, festivales: 0, cohetes: 0, hitos: 0, pandemias: 0, devorados: 0, cataclismos: 0, incendios: 0 },
    planets: [], q: [], crits: [], fleet: [], cycle: 1, saga: null, lastSaga: null, planPause: 0, rel: null, rel2: null, pandemic: null,
    drought: 0, flood: 0, spice: 0, code: 0, crumble: 0, crumbT: 0, fightBack: false, wormCalm: 0, fastLaunch: 0, station: null, cata: null,
    planetT: null, hole: null, aurora: 0, locust: 0, strike: 0, music: 0, floodMax: 14, launchT: null,
  };
  S.eraDur = ERAS[0].dur * rnd(.75, 1.35);

  const fmtYear = y => y < 0 ? `${Math.abs(Math.round(y / 10) * 10).toLocaleString("es")} a.C.` : `${Math.round(y)} d.C.`;
  const curYear = () => { const e = ERAS[S.era]; return lerp(e.y0, e.y1, clamp(S.eraT / S.eraDur, 0, 1)); };
  const popTotal = () => groundMons().length + Math.floor(S.extra);
  function logEv(text) {
    S.log.unshift({ y: fmtYear(curYear()), text });
    if (S.log.length > 40) S.log.length = 40;
    S.hudT = 0;
    if (S.started) {   // aviso flotante que se desvanece
      const t = document.createElement("div"); t.className = "toast"; t.textContent = text; toasts.appendChild(t);
      while (toasts.children.length > 3) toasts.removeChild(toasts.firstChild);
      setTimeout(() => t.remove(), 7200);
    }
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
  const wall = () => hsl(S.hue + rnd(-25, 25), 38, 76), roof = () => hsl(S.hue + 180 + rnd(-20, 20), 42, 40);

  const relColor = i => hsl(i === 0 ? (S.rel ? S.rel.hue : 40) : (S.rel2 ? S.rel2.hue : 200), 55, 52);
  const relInit = s => { s.rc = relColor(alive(s.kind).length); };
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
    hut: { w: 40, init: s => { s.col = hsl(rnd(28, 40), 45, 62); },
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
    house: { w: 44, init: s => { s.w1 = wall(); s.r1 = roof(); },
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
    hovercar: { w: 24, mobile: true, noflip: true, init: s => { s.dy = -rnd(30, 120); s.v = (chance(.5) ? 1 : -1) * rnd(40, 90); },
      draw: () => Ell(0, -5, 10, 4, "#dfe9f2") + Ell(0, -6.5, 5, 3, "#8fd3ff") + Ell(0, 0, 8, 1.6, "#6fe3ff", 'opacity=".6"'),
      tick(s, h) { s.x += s.v * h; s.dy += Math.sin(S.t * 2 + s.x) * h * 6; if (s.x > W + 30) s.x = -30; if (s.x < -30) s.x = W + 30; s.flip = s.v < 0; } },
    ruin: { w: 46, temp: true, draw: () => Pth("M-20 0L-18 -9L-10 -5L-5 -15L3 -7L10 -12L20 0Z", "#6e6a64") + Pth("M-8 0L-6 -6L0 -3L6 -8L9 0Z", "#8a857d") },
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
    train: { w: 130, mobile: true, noflip: true, init: s => { s.dy = GROUND_H - 12; s.v = chance(.5) ? 70 : -70; s.sm = 0; },
      draw: () => R(-60, -18, 40, 14, "#c0392b") + R(-60, -26, 14, 8, "#333") + R(-36, -30, 6, 12, "#222") + Pth("M-60 -4L-20 -4L-20 -2L-60 -2Z", "#222") +
        [-52, -40, -28].map(x => Cir(x, -3, 5, "#222")).join("") + R(-16, -20, 36, 16, "#3a6ea5") + R(24, -20, 36, 16, "#d6a62a") +
        [-8, 30, 44].map(x => Cir(x, -3, 5, "#222")).join(""),
      tick(s, h) { s.x += s.v * h; s.sm -= h; if (s.sm <= 0) { s.sm = .4; smoke(s.x + (s.v > 0 ? -33 : 33), floorY() + s.dy - 32); } if (s.x > W + 150) s.x = -150; if (s.x < -150) s.x = W + 150; s.flip = s.v < 0; } },
    skyscraper: { w: 32, noflip: true, init: s => { s.h = rnd(62, 128); s.cw = rnd(24, 33); s.col = hsl(210, 16, rnd(30, 52)); s.lit = {}; },
      draw: s => { let o = R(-s.cw / 2, -s.h, s.cw, s.h, s.col) + `<line x1="0" y1="${-s.h}" x2="0" y2="${-s.h - 12}" stroke="#555" stroke-width="1.5"/>`;
        for (let y = 8; y < s.h - 6; y += 10) for (let x = -s.cw / 2 + 4; x < s.cw / 2 - 4; x += 8) o += R(x, -s.h + y, 4, 5, chance(.45) ? "#ffe28a" : "rgba(0,0,0,.28)", `class="wn"`);
        return o; },
      tick(s, h) { s.bt = (s.bt || 0) - h; if (s.bt <= 0) { s.bt = rnd(.6, 2); const w = s.el.querySelectorAll(".wn"); if (w.length) w[Math.random() * w.length | 0].setAttribute("fill", chance(.5) ? "#ffe28a" : "rgba(0,0,0,.28)"); } } },
    car: { w: 30, mobile: true, noflip: true, init: s => { s.dy = GROUND_H - 14; s.v = (chance(.5) ? 1 : -1) * rnd(45, 90); s.col = hsl(rnd(0, 360), 70, 50); },
      draw: s => R(-12, -10, 24, 6, s.col) + R(-7, -15, 14, 6, s.col) + R(-5, -14, 4, 4, "#bfe3ff") + R(1, -14, 4, 4, "#bfe3ff") + Cir(-7, -3, 3.4, "#222") + Cir(7, -3, 3.4, "#222"),
      tick(s, h) { s.x += s.v * h; if (s.x > W + 40) s.x = -40; if (s.x < -40) s.x = W + 40; s.flip = s.v < 0; } },
    plane: { w: 56, mobile: true, noflip: true, init: s => { s.dy = -rnd(160, 300); s.v = (chance(.5) ? 1 : -1) * rnd(110, 160); s.x = s.v > 0 ? -80 : W + 80; s.wait = 0; },
      draw: () => Ell(0, 0, 22, 4, "#f4f1ea") + Pth("M-4 0L-14 -14L-8 -14L6 0Z", "#cfd6dd") + Pth("M-4 2L-14 12L-8 12L6 2Z", "#cfd6dd") + Pth("M-20 0L-26 -8L-22 -8L-16 0Z", "#cfd6dd"),
      tick(s, h) { if (s.wait > 0) { s.wait -= h; return; } s.x += s.v * h; s.flip = s.v < 0; if (chance(h * 10)) smoke(s.x - Math.sign(s.v) * 24, floorY() + s.dy, 1);
        if (s.x > W + 100 || s.x < -100) { s.wait = rnd(8, 20); s.dy = -rnd(160, 300); s.v = (chance(.5) ? 1 : -1) * rnd(110, 160); s.x = s.v > 0 ? -80 : W + 80; } } },
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
    S.structs.push(s);
    if (!def.mobile) dust(s.x, 10);
    return s;
  }
  function freeX(w) {
    for (let i = 0; i < 40; i++) {
      const x = rnd(40 + w / 2, W - 40 - w / 2);
      if (S.structs.every(s => s.mobile || s.dying || s.temp || Math.abs(s.x - x) > (s.w + w) / 2 + 6)) return x;
    }
    return null;
  }
  const alive = k => S.structs.filter(s => s.kind === k && !s.dying);
  function sacredKind() {   // el tipo de templo depende de la epoca
    const d = S.done, any = d.templo || d.piramide || d.catedral || d.iglesia_cosmica || d.nuevaera || d.fuego_sagrado;
    if (!any) return null;
    if (S.era <= 2) return d.totems || d.fuego_sagrado ? "totem" : null;
    if (S.era === 3) return d.piramide || S.branch[3] ? "pyramid" : "temple";
    if (S.era <= 6) return "cathedral";
    return "orb";
  }
  function GLOBAL() {   // lo que se conserva en cualquier epoca una vez descubierto
    const d = S.done, o = {
      cart: d.rueda ? 1 : 0, library: d.escritura || d.imprenta ? 1 : 0, market: d.comercio || d.trueque ? 1 : 0, dog: d.lobos ? 1 : 0,
      lamp: d.electricidad ? Math.min(7, 2 + S.era) : 0, academia: d.academia ? 1 : 0, observatory: d.astronomia || d.telescopio_optico ? 1 : 0,
      university: d.universidad ? 1 : 0, laboratory: d.laboratorio ? 1 : 0, hospital: d.antibioticos || d.vacunas ? 1 : 0, antenna: d.radio ? 1 : 0,
      stadium: d.deporte ? 1 : 0, statue: d.heroe ? 1 : 0,
    };
    const sk = sacredKind();
    if (sk) o[sk] = S.rel2 && d.reforma ? 2 : 1;
    return o;
  }
  const PLAN = [
    p => ({ cave: p > 5 ? 2 : 1, rock: 3, bones: 2, mammoth: 1 }),
    p => ({ cave: 1, campfire: p > 10 ? 2 : 1, rock: 2, mammoth: 1 }),
    (p, b) => ({ tent: Math.min(6, 2 + (p / 4 | 0)), campfire: 1, mammoth: 1, sheep: b ? 2 : 0 }),
    (p, b) => ({ hut: Math.min(8, 2 + (p / 3 | 0)), field: Math.min(5, 1 + (p / 5 | 0)), sheep: Math.min(5, p / 4 | 0), campfire: 1, windmill: b ? 1 : 0 }),
    (p, b) => b ? { house: Math.min(8, 2 + (p / 4 | 0)), fort: 1, ship: 1, field: 2, hut: 1 } : { house: Math.min(8, 2 + (p / 4 | 0)), windmill: 1 + (p > 25 ? 1 : 0), ship: 1, field: 2 },
    (p, b) => ({ factory: Math.min(4, 1 + (p / 10 | 0)), brickhouse: Math.min(9, 2 + (p / 4 | 0)), train: 1, house: b ? 2 : 0 }),
    (p, b) => ({ skyscraper: Math.min(10, 2 + (p / 5 | 0)), house: 2, car: Math.min(4, 1 + (p / 12 | 0)), plane: 1, factory: b ? 1 : 0 }),
    (p, b) => ({ skyscraper: b ? 6 : 4, pad: 1, dome: Math.min(3, 1 + (p / 15 | 0)), dish: 1, car: 2, plane: 1 }),
    (p, b) => ({ tower: b ? 6 : 4, skyscraper: 3, dome: 2, starport: 1, dish: 1, hovercar: 4, pad: 1 }),
  ];
  function plan() {
    const want = Object.assign({}, PLAN[S.era](popTotal(), S.branch[S.era]), GLOBAL());
    let added = false;
    for (const k in want) {
      const have = alive(k).length;
      if (have < want[k] && !added) {
        const def = KINDS[k], x = def.fixed != null ? def.fixed : def.mobile ? rnd(60, W - 60) : freeX(def.w);
        if (x != null && !(def.fixed != null && have)) { addStruct(k, x); added = true; }
      }
    }
    for (const s of S.structs) {   // lo viejo se va retirando
      const have = alive(s.kind).length;
      if (!s.dying && !s.temp && have > (want[s.kind] || 0)) { s.dying = .001; dust(s.x, 8); break; }
    }
    rails.style.display = S.era >= 5 ? "" : "none";
  }

  // ---------- efectos ----------
  function fx(type, o) {
    const f = Object.assign({ type, life: 1, t: 0, x: 0, y: 0, vx: 0, vy: 0, g: 0, col: "#fff" }, o);
    f.life0 = f.life;
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

  function say(text) { const g = pick(groundMons()); if (g && g.m.mode !== "sleep") { g.m.say = text; g.m.mode = "react"; g.m.t = 0; g.m.dur = 1.7; } }
  function adopt(m, x, y, id) {   // un mono se desborda del anillo hacia el mundo
    gMon.appendChild(m.parts.root);
    m.dir = chance(.5) ? 1 : -1; m.mode = "run"; m.theta = 0; m.mood = { low: 0, mid: 1, high: 0 }; m.pop = undefined;
    const zoo = document.querySelector(`.zoo[data-id="${id}"]`), card = zoo ? zoo.closest(".card") : null;
    const g = { m, state: "climb", card, x, y, rot: 0, vx: 0, vy: 0, vr: 0, dy: rnd(6, GROUND_H - 12), sp: rnd(.85, 1.2), climbT: rnd(5, 10), stay: 0, tu: .5, tv: .5, act: "idle" };
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
        if (g.stay <= 0 && !g.hold) think(g);
    }
  }
  function land(g) {
    if (!S.started) startWorld();
    g.act = "idle"; g.stay = rnd(.3, 1); g.m.mode = "rest"; g.m.t = 0;
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
  const anchor = kinds => { const c = S.structs.filter(s => kinds.includes(s.kind) && !s.dying && s.built > .5); return c.length ? pick(c).x : null; };
  function think(g) {
    const e = S.era, r = Math.random(), go = (x, act, stay, face) => {
      g.tx = clamp(x == null ? rnd(30, W - 30) : x, 18, W - 18); g.next = act; g.stayT = stay == null ? rnd(2, 6) : stay; g.face = face || 0;
      g.act = chance(.12) ? "run" : "walk"; g.m.t = 0;
    };
    const at = (kinds, sp) => { const x = anchor(kinds); return x == null ? null : x + rnd(-sp, sp); };
    if (chance(.06) && e >= 1) return go(null, "cheer", rnd(2, 4));
    if (e === 0) { r < .3 ? go(at(["cave", "rock", "bones"], 60), "sit") : r < .5 ? go(at(["cave"], 30), "sleep", rnd(6, 11)) : go(null, "sit"); }
    else if (e === 1) { r < .65 ? go(at(["campfire"], 34), pick(["sit", "sit", "sleep", "eat"]), rnd(4, 9)) : go(null, "sit"); }
    else if (e === 2) { r < .3 ? go(at(["campfire", "tent"], 40), "sit") : go(null, "sit", rnd(1, 3)); }
    else if (e === 3) { r < .5 ? go(at(["field"], 28), "work", rnd(4, 9)) : r < .75 ? go(at(["hut", "campfire", "temple", "market", "pyramid", "totem"], 40), "sit") : go(null, "sit", rnd(1, 3)); }
    else {
      const ei = Math.min(e, 7) - 4;
      const wk = [["field", "windmill", "fort", "ship", "market", "academia", "observatory"], ["factory", "train", "library", "university"], ["skyscraper", "car", "library", "laboratory", "hospital"], ["pad", "dish", "dome", "tower", "starport", "laboratory"]][ei];
      const hm = [["house", "hut", "market", "cathedral"], ["brickhouse", "house", "cathedral"], ["house", "skyscraper", "cathedral"], ["dome", "skyscraper", "dish", "tower", "orb"]][ei];
      r < .4 ? go(at(wk, 30), "work", rnd(3, 8)) : r < .7 ? go(at(hm, 36), "sit") : go(null, "sit", rnd(1, 3));
    }
  }
  const sendTo = (g, x, act, face, stay) => { g.tx = clamp(x, 14, W - 14); g.act = "run"; g.next = act; g.face = face || 0; g.stayT = stay == null ? 99 : stay; g.hold = true; g.m.t = 0; };

  // ---------- hitos canonicos y sucesos al azar ----------
  const T = () => S.tribe;
  const REL_A = ["Sol", "Luna", "Gran Banana", "Árbol Sagrado", "Río Eterno", "Trueno", "Cielo", "Montaña", "Estrellas", "Gran Mono"];
  const REL_B = ["Hijos del", "Orden del", "Culto del", "Iglesia del", "Camino del", "Los Fieles del"];
  const newRel = () => ({ name: `${pick(REL_B)} ${pick(REL_A)}`, hue: rnd(0, 360) });
  const DISEASES = ["Peste Gris", "Fiebre del Plátano", "Tos Simiesca", "Gripe Roja", "Mal del Sueño", "Viruela de los Árboles", "Fiebre Negra", "Sarampión Peludo", "Gripe de la Selva", "Mal de las Pulgas"];
  const cheerSome = (n, secs) => free().slice(0, n).forEach(g => { g.act = "cheer"; g.stay = secs; g.m.t = 0; });
  const releaseAll = list => list.forEach(g => { g.hold = false; g.stay = 0; });
  const M = (era, id, text, run) => ({ id, era, text: typeof text === "function" ? text : () => text, run });
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
    M(1, "fuego_sagrado", `Un fuego eterno arde en la cueva y un chamán lo cuida: nace el «Culto al Fuego Eterno»`, () => { S.rel = { name: "Culto al Fuego Eterno", hue: 20 }; }),
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
    M(2, "totems", () => `Tallan tótems: nace la fe en «${S.rel.name}»`, () => { S.rel = { name: `Espíritus del ${pick(["Bosque", "Río", "Viento", "Trueno", "Lobo"])}`, hue: rnd(0, 360) }; }),
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
    M(3, "templo", () => `Levantan el primer templo: nace la religión «${S.rel.name}»`, () => { S.rel = newRel(); }),
    M(3, "astronomia", `Observan los astros: primeros astrónomos`),
    M(3, "matematicas", `Inventan los números y la geometría`, () => say("1+1=2")),
    M(3, "filosofia", `Surge el primer filósofo: «¿por qué hay bananas?»`, () => say("¿por qué?")),
    M(3, "academia", `Fundan la primera academia de sabios`),
    M(3, "bronce", `Fabrican bronce: comienza la Edad del Bronce`),
    M(3, "hierro", `Dominan el hierro: armas y arados más fuertes`),
    M(3, "leyes", `Escriben el primer código de leyes`),
    M(3, "moneda", `Acuñan las primeras monedas`),
    M(3, "piramide", `Levantan una gigantesca pirámide para sus dioses`, () => { if (!S.rel) S.rel = newRel(); }),
    M(3, "curanderos", `Los curanderos descubren plantas medicinales`),
    M(3, "teatro", `Nace el teatro: los monos se burlan de los reyes`),
    M(3, "dioses", () => S.branch[3] ? `Creen en muchos dioses: uno para la lluvia, otro para las bananas` : `Surge la idea de un único dios supremo`),
    M(3, "arquitectura", `Aprenden arquitectura: nacen las primeras ciudades`),
    // --- Colonial ---
    M(4, "navegacion", `Zarpan hacia tierras desconocidas`, () => { const sh = alive("ship")[0]; if (sh) burst(sh.x, floorY() - 20, 8, "#fff", 60); }),
    M(4, "imprenta", `Inventan la imprenta: las ideas viajan rápido`),
    M(4, "colonia", () => `Fundan la colonia de ${S.city}`),
    M(4, "catedral", () => `Construyen una gran catedral para «${S.rel.name}»`, () => { if (!S.rel) S.rel = newRel(); }),
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
    M(6, "automovil", `Los automóviles llenan las calles`),
    M(6, "aviacion", `Primer vuelo: el mono por fin tiene alas`),
    M(6, "radio", `La radio y la televisión llegan a todos`),
    M(6, "internet", `Nace internet: todos miran videos de bananas`),
    M(6, "vacunas", `Inventan las vacunas`, () => { S.extra += 5; }),
    M(6, "relatividad", `Descubren la relatividad: el tiempo no es absoluto`, () => say("E=mc²")),
    M(6, "atomo", `Dividen el átomo`),
    M(6, "antibioticos", `Descubren los antibióticos`),
    M(6, "adn", `Descifran el ADN`),
    M(6, "computadora", `Aparecen las computadoras`),
    M(6, "television", `La televisión entra en cada casa`),
    M(6, "cine", `Nace el cine`),
    M(6, "rock", `Nace el rock and roll`, () => { S.music = 10; cheerSome(8, 8); }),
    M(6, "derechos", `Declaran los derechos de todos los monos`),
    M(6, "naciones", `Fundan la Asamblea de las Naciones Monas`),
    M(6, "ecologia", `Nace el movimiento ecologista`),
    M(6, "smartphone", `Todos tienen un teléfono inteligente (y no levantan la vista)`),
    M(6, "ia", `Primeras inteligencias artificiales`),
    M(6, "nuevaera", () => `Surgen nuevas espiritualidades: «${S.rel.name}»`, () => { S.rel = newRel(); S.rel2 = null; S.done.reforma = false; }),
    M(6, "cuantica", `La física cuántica desafía el sentido común`),
    M(6, "laboratorio", `Enormes laboratorios de investigación`),
    M(6, "carrera", `Comienza la carrera espacial`),
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
    M(7, "iglesia_cosmica", () => `Nace una fe cósmica: «${S.rel.name}»`, () => { S.rel = newRel(); S.rel2 = null; S.done.reforma = false; }),
    M(7, "filosofia_cosmica", `¿Estamos solos en el universo? Los filósofos debaten`, () => say("¿solos?")),
    M(7, "conciencia_ia", `Una IA pide derechos`),
    M(7, "ascensor", `Construyen un ascensor espacial`),
    M(7, "terraformacion", `Comienzan a terraformar otro mundo`),
    M(7, "seti", `Captan una señal extraña desde muy lejos…`),
  ];
  const sacredX = () => anchor(SACRED);
  const EVENTS = [
    { id: "guerra", min: 1, w: () => S.traits.war * 1.4 * (free().length >= 6 ? 1 : 0), run: () => startWar() },
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
    { id: "edadoro", w: () => .4 * S.traits.luck, run: () => { S.boost = 1.5; S.boostT = 40; logEv(`Edad dorada: ${T()} florece`); for (let i = 0; i < 3; i++) later(i * .7, () => fireworks(rnd(W * .2, W * .8), rnd(H * .2, H * .5))); } },
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
    { id: "tsunami", min: 3, w: () => alive("ship").length ? .3 : 0, run: () => flood(18, `Tsunami: una ola gigante golpea la costa`) },
  ];
  function nextMilestone() {
    let c = MILESTONES.filter(m => m.era === S.era && !S.done[m.id]);
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
    if (S.era >= 4) for (let i = 0; i < 3; i++) setTimeout(() => fireworks(rnd(W * .15, W * .85), rnd(H * .2, H * .55)), i * 600);
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
    fx("g", { x: x0, y: -30, life: 1.3, vx: (x - x0) / 1.3, vy: (floorY() + 6) / 1.3 * 1.0, html: `<circle r="6" fill="#ffd27a"/><circle r="11" fill="#ff9a3c" opacity=".4"/><line x1="0" y1="0" x2="60" y2="-40" stroke="#ff9a3c" stroke-width="5" stroke-linecap="round" opacity=".6"/>`,
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
    const y = rnd(H * .12, H * .35), dir = chance(.5) ? 1 : -1;
    fx("g", { x: dir > 0 ? -60 : W + 60, y, life: 6, vx: dir * (W + 120) / 6, vy: 40, html: `<circle r="4" fill="#fff"/><circle r="9" fill="#bfe3ff" opacity=".35"/><line x1="0" y1="0" x2="${-dir * 70}" y2="-12" stroke="#bfe3ff" stroke-width="4" stroke-linecap="round" opacity=".5"/>` });
    free().slice(0, 4).forEach(g => { g.act = "cheer"; g.stay = 4; g.m.t = 0; });
    logEv(`Un cometa cruza el cielo: ¿buen augurio?`);
  }
  function ufo() {
    const g = pick(free()); if (!g) return;
    S.busy = true; g.hold = true; g.act = "idle"; g.stay = 99;
    const dir = chance(.5) ? 1 : -1;
    S.ufo = { x: dir > 0 ? -50 : W + 50, tx: g.x, g, state: "in", t: 0,
      e: el("g", { }, gFx), y: floorY() - 190 };
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
  function pandemic() {
    if (S.pandemic) return;
    const name = pick(DISEASES), med = S.done.vacunas || S.done.antibioticos;
    S.pandemic = { name, t: 0, dur: med ? rnd(10, 16) : S.era >= 5 ? rnd(18, 26) : rnd(26, 40), dead: 0, sick: 0 };
    S.stats.pandemias++;
    logEv(`Pandemia: ${name} se propaga por ${T()}`);
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
        if (chance(S.done.antibioticos ? .1 : S.done.vacunas ? .2 : S.era >= 5 ? .3 : .5)) { g.dead = 1.2; p.dead++; }
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
    const x = rnd(40, W - 40); let d = `M${x.toFixed(0)} -10`, y = -10, cx = x;
    while (y < floorY()) { y += rnd(30, 60); cx += rnd(-22, 22); d += `L${cx.toFixed(0)} ${Math.min(y, floorY()).toFixed(0)}`; }
    fx("g", { x: 0, y: 0, life: .25, html: `<path d="${d}" stroke="#bfe3ff" stroke-width="9" fill="none" opacity=".4"/><path d="${d}" stroke="#fff" stroke-width="3" fill="none" stroke-linejoin="round"/>` });
    fx("flash", { x, y: floorY(), r0: 6, r1: 28, life: .3, col: "#fff", op: .8 });
    const s = S.structs.find(q => !q.mobile && !q.dying && !q.temp && Math.abs(q.x - x) < 40);
    if (!quiet && s && !s.fireT && chance(.4)) { s.fireT = 7; logEv(`Un rayo incendia una construcción`); }
  }
  function aurora() {
    S.aurora = 12; logEv(`Aurora boreal: el cielo se ilumina de colores`);
    fx("g", { x: 0, y: H * .08, life: 12, tick: f => f.e.setAttribute("opacity", (Math.sin(Math.PI * clamp(f.t / 12, 0, 1)) * .9).toFixed(2)),
      html: `<defs><linearGradient id="au" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7dffb0" stop-opacity="0"/><stop offset=".5" stop-color="#7dffb0" stop-opacity=".5"/><stop offset="1" stop-color="#b57dff" stop-opacity="0"/></linearGradient></defs>` +
        `<path d="M0 20Q${W * .25} -10 ${W * .5} 25T${W} 15V70Q${W * .75} 95 ${W * .5} 60T0 80Z" fill="url(#au)"/>` });
    cheerSome(4, 6);
  }
  function starShower() {
    logEv(`Lluvia de estrellas: todos piden un deseo`); cheerSome(5, 5);
    for (let i = 0; i < 14; i++) later(i * .45, () => fx("g", { x: rnd(0, W), y: rnd(0, H * .3), life: .9, vx: 260, vy: 150,
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
    S.done.reforma = true; S.rel2 = newRel();
    logEv(`Cisma: nace «${S.rel2.name}», rival de «${S.rel.name}»`);
  }
  function prophet() {
    logEv(`Un profeta anuncia el fin del mundo para mañana... y no pasa nada`);
    free().slice(0, 4).forEach(g => { g.m.say = "¿en serio?"; g.m.mode = "react"; g.m.t = 0; g.m.dur = 1.7; });
  }
  function hero() {
    S.done.heroe = true; logEv(`Un héroe salva a ${T()} y le erigen una estatua`); cheerSome(6, 5);
  }

  // --- guerra y paz ---
  const WEAPON = ["stone", "stone", "arrow", "arrow", "ball", "ball", "bullet", "laser"];
  function startWar(label) {
    const gs = shuffle(free());
    if (gs.length < 6) return false;
    const cx = rnd(W * .3, W * .7), L = [], R2 = [];
    gs.slice(0, 22).forEach((g, i) => {
      const left = i % 2 === 0, side = left ? L : R2; side.push(g);
      sendTo(g, cx + (left ? -1 : 1) * (60 + side.length * 9), "fight", left ? 1 : -1, 999);
    });
    S.stats.guerras++;
    S.war = { phase: "march", t: 0, cx, L, R: R2, shot: 0, ko: 3, dur: rnd(11, 17), weapon: WEAPON[Math.min(S.era, 7)] };
    S.busy = true;
    logEv(label || pick([`Estalla la guerra entre dos bandos de ${T()}`, `Guerra civil: el clan se divide`, `Disputa por el agua: ${T()} toma las armas`]));
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
        fx("g", { x: dir > 0 ? -20 : W + 20, y: H * .3, vx: dir * 120, vy: 0, life: (W + 40) / 120, html: `<ellipse rx="6" ry="3.5" fill="#fff" stroke="#ddd"/><path class="wg" d="M-2 0Q-6 -12 2 -8Z" fill="#fff"/><path d="M2 0Q6 -12 -2 -8Z" fill="#fff"/>`,
          tick: f => { f.e.setAttribute("transform", `translate(${f.x.toFixed(1)} ${(f.y + Math.sin(f.t * 9) * 6).toFixed(1)}) scale(${dir} 1)`); } });
        for (let i = 0; i < 45; i++) fx("conf", { x: w.cx + rnd(-160, 160), y: rnd(-40, H * .3), vy: rnd(40, 90), life: 6, col: `hsl(${rnd(0, 360)} 85% 60%)` });
        logEv(pick([`Firman la paz: ${T()} vuelve a ser una sola`, `Tregua y abrazos: se acabó la guerra`, `La paloma llega y los bandos hacen las paces`]));
      }
      return;
    }
    if (w.phase === "peace" && w.t > 6) { all.forEach(g => { g.hold = false; g.stay = 0; }); S.war = null; S.busy = false; }
  }

  // --- planetas, cohetes y colonizacion ---
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
      `<g class="col"></g><text y="${r + 13}" text-anchor="middle" font-size="10" font-weight="700" style="fill:var(--muted)">${p.name}</text>`;
    S.planets.push(p); placePlanets(); renderColonies(p);
    return p;
  }
  function placePlanets() {   // arriba a la derecha primero, luego hacia la izquierda
    S.planets.forEach((p, i) => {
      p.x = i === 0 ? W - 88 : 340 + (i - 1) * 105; p.y = i === 0 ? 96 : 30;   // los demas, en la franja libre del encabezado (entre el titulo y el estado)
      if (i && p.x > W * .6) p.x = 340 + ((i * 97) % Math.max(60, W * .25));
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
      const cx = f.x0 + (f.x1 - f.x0) * .15, cy = f.y0 - H * .5;
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
      S.won = true; showBanner(`¡${S.tribe} colonizó ${S.dest.name}!`);
      logEv(`¡${T()} COLONIZÓ ${S.dest.name.toUpperCase()}!`);
      for (let i = 0; i < 6; i++) later(i * .5, () => fireworks(rnd(W * .1, W * .9), rnd(H * .15, H * .5)));
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
  const bigText = txt => fx("g", { x: W / 2, y: H * .4, life: 1, html: `<text text-anchor="middle" font-size="44" font-weight="900" style="fill:#e53935;stroke:#fff;stroke-width:1.4px">${txt}</text>` });
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
    const hx = W * (.12 + .76 * (i + .5) / n) + rnd(-20, 20), hy = H * rnd(.15, .3), ph = rnd(0, 6);
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
      const dir = chance(.5) ? 1 : -1, y = rnd(H * .15, H * .55), x0 = dir > 0 ? -40 : W + 40, x1 = dir > 0 ? W + 40 : -40;
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
    const f = fx("g", { x: W * rnd(.22, .45), y: H * .2, life: 99999,
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
      c.el.setAttribute("transform", `translate(${c.x.toFixed(1)} ${(floorY() + 6).toFixed(1)}) scale(${f * (c.sc || 1)} ${c.sc || 1})`);
      c.el.style.opacity = ((c.alpha == null ? 1 : c.alpha) * Math.max(0, b)).toFixed(2);
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
      const x = rnd(40, W - 40), f = fx("g", { x: x - 140, y: -20, life: .9, vx: 155, vy: (floorY() + 20) / .9, rotate: 48, html: `<g transform="scale(1.6)">${SHIP.missile()}</g>` });
      f.onEnd = () => { boom(x, floorY() - 6, true); destroyAt(x, 90, .8); S.shake = 1; fx("flash", { x, y: floorY() - 20, r0: 10, r1: 90, life: .5, col: "#fff", op: .5 }); };
    });
  }
  function blackhole() {
    S.hole = fx("g", { x: W * rnd(.35, .6), y: H * .2, life: 99999,
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
    S.war = S.hunt = S.launch = S.saga = S.cata = S.station = S.hole = S.pandemic = null; S.busy = false;
    S.fightBack = false; S.wormCalm = S.spice = S.code = S.crumble = S.rain = S.snow = S.eclipse = S.shake = S.fastLaunch = 0;
    S.flood = S.locust = S.drought = S.aurora = S.music = 0;
    water.setAttribute("height", 0); dark.setAttribute("opacity", 0);
    groundMons().forEach(g => { g.sick = 0; g.hold = false; g.stay = 0; g.m.parts.root.style.filter = ""; });
    S.cycle++;
    S.era = o.era || 0; S.eraT = 0; S.eraDur = ERAS[S.era].dur * rnd(.75, 1.35); S.extra = o.extra || 0;
    S.done = {}; S.recent = {}; S.won = false; S.destSeen = false; S.dest = wpick(DESTS, d => d.w); S.goal = 4 + (Math.random() * 3 | 0);
    S.traits = { war: rnd(.25, 1.8), curious: rnd(.7, 1.5), luck: rnd(.6, 1.4) };
    S.branch = [0, 0, 0, 0, 0, 0, 0, 0, 0].map(() => chance(.5) ? 1 : 0);
    S.rel = S.rel2 = null; S.tribe = nm(); S.city = nm(); S.hue = rnd(0, 360); S.flag = [rnd(0, 360), rnd(0, 360)];
    S.planPause = 0; S.planT = 0; S.msT = 6; S.evT = 12; S.launchT = null; S.mammothT = 0; S.planetT = null;
    setLook(null); rails.style.display = "none";
    showBanner(o.era ? "El conocimiento sobrevive" : "Los supervivientes empiezan de nuevo");
    logEv(`— Ciclo ${S.cycle}: ${S.tribe} ${o.era ? "reconstruye la civilización" : "vuelve a la Edad de Piedra"} —`);
    S.hudT = 0;
  }

  // ---------- poblacion, eras y reloj ----------
  function startWorld() {
    S.started = true; gGround.style.opacity = 1; gStruct.style.opacity = 1; hud.style.opacity = 1;
    logEv(`${T()} llega al suelo: empieza su historia`);
    showBanner(ERAS[0].name);
  }
  function eraUp() {
    S.era++; S.eraT = 0; S.eraDur = ERAS[S.era].dur * rnd(.75, 1.35); S.msT = 4;
    ground.setAttribute("fill", ERAS[S.era].ground);
    showBanner(ERAS[S.era].name); logEv(`Comienza: ${ERAS[S.era].name}`);
    if (S.era === 3) logEv(`Nace ${S.city}, la primera aldea de ${T()}`);
    burst(W / 2, floorY() - 20, 14, "#ffd23f", 100);
    if (S.era === 7) { S.msT = 6; }
    if (S.era === 8) startSaga();
  }
  function step(h) {
    S.t += h;
    S.spawnT += h;
    if (S.spawnT >= SPAWN_S) {
      S.spawnT -= SPAWN_S;
      const ids = A.ids().filter(id => document.querySelector(`.zoo[data-id="${id}"]`));
      if (ids.length) A.spawn(pick(ids));
    }
    for (const k in S.recent) { S.recent[k] -= h; if (S.recent[k] <= 0) delete S.recent[k]; }
    if (S.boostT > 0) { S.boostT -= h; if (S.boostT <= 0) S.boost = 1; }
    if (S.eclipse > 0) { S.eclipse -= h; dark.setAttribute("opacity", (Math.sin(Math.PI * clamp(1 - S.eclipse / 10, 0, 1)) * .55).toFixed(2)); }
    if (S.rain > 0) { S.rain -= h; for (let i = 0; i < h * 90; i++) fx("drop", { x: rnd(0, W), y: -10, vy: rnd(500, 700), vx: -40, life: 3 }); }
    if (S.snow > 0) { S.snow -= h; for (let i = 0; i < h * 30; i++) fx("flake", { x: rnd(0, W), y: -10, vy: rnd(40, 80), life: 8 }); }
    qStep(); pandemicStep(h);
    if (S.flood > 0) S.flood -= h;
    { const k = S.flood > 0 ? Math.sin(Math.PI * clamp(1 - S.flood / S.floodMax, 0, 1)) : 0; water.setAttribute("height", (k * 30).toFixed(1)); water.setAttribute("y", (H - k * 30).toFixed(1)); }
    if (S.locust > 0) { S.locust -= h; for (let i = 0; i < h * 90; i++) fx("spark", { x: -10, y: rnd(H * .2, H * .8), vx: rnd(150, 260), vy: rnd(-20, 20), life: 4, col: "#3a2a14", r: 1.8 }); }
    if (S.drought > 0) { S.drought -= h; if (S.drought <= 0) { logEv(`La sequía termina: vuelve la lluvia`); S.rain = 8; if (!S.saga) tint.style.opacity = 0; } }
    if (S.music > 0) { S.music -= h; if (chance(h * 5)) { const g = pick(groundMons()); if (g) fx("note", { x: g.x, y: floorY() - 20, vy: -30, vx: rnd(-10, 10), life: 1.6, col: `hsl(${rnd(0, 360)} 70% 55%)` }); } }
    if (S.wormCalm > 0) S.wormCalm -= h;
    if (S.fastLaunch > 0) S.fastLaunch -= h;
    if (S.spice > 0) { S.spice -= h; if (chance(h * 8)) fx("spark", { x: rnd(0, W), y: floorY() - rnd(0, 50), vy: -rnd(5, 20), life: 1.5, col: "#ffb24d", r: 2 }); }
    if (S.code > 0) { S.code -= h; for (let i = 0; i < h * 36; i++) fx("code", { x: rnd(0, W), y: -10, vy: rnd(60, 140), life: rnd(3, 6) }); }
    if (S.crumble > 0) { S.crumble -= h; S.crumbT -= h; if (S.crumbT <= 0) { S.crumbT = 6; const t = S.structs.filter(q => !q.mobile && !q.dying && !q.temp && q.built > .8); if (t.length > 2) ruinOf(pick(t)); } }
    for (const c of S.crits) critStep(c, h);
    S.crits = S.crits.filter(c => !c.gone);
    for (const g of S.mon.slice()) stepMon(g, h);
    if (S.started) {
      S.eraT += h * S.boost;
      const ground2 = groundMons().length;
      if (ground2 >= 2 && popTotal() < ERAS[S.era].cap) S.extra += h * (.12 + ground2 * .012) * S.traits.luck;
      if (S.era < 7 && S.eraT >= S.eraDur && popTotal() >= ERAS[S.era + 1].min) eraUp();
      else if (S.era === 7 && ((S.won && S.eraT >= S.eraDur * .5) || S.eraT >= S.eraDur * 3)) eraUp();   // tras colonizar viene la era galactica
      S.planT -= h; if (S.planT <= 0) { S.planT = 1.1; if (S.planPause > 0) S.planPause -= 1.1; else plan(); }
      S.msT -= h; if (S.msT <= 0) { S.msT = rnd(7, 14) / S.traits.curious / S.boost; nextMilestone(); }
      if (!S.busy && !S.saga) { S.evT -= h; if (S.evT <= 0) { S.evT = rnd(11, 22) / Math.sqrt(S.boost); nextEvent(); } }
      if (S.era >= 7 && S.destSeen && !S.busy && !S.launch && !S.cata) { S.launchT = (S.launchT == null ? 8 : S.launchT) - h; if (S.launchT <= 0) { S.launchT = S.fastLaunch > 0 ? rnd(5, 8) : rnd(14, 22); tryLaunch(); } }
      if (S.era >= 7 && S.destSeen && !S.cata) { S.planetT = (S.planetT == null ? 20 : S.planetT) - h; if (S.planetT <= 0 && S.planets.length < 5) { S.planetT = rnd(24, 40); const pl = addPlanet({}); logEv(`El telescopio descubre ${pl.name}`); } }
      if (S.mammothT > 0) { S.mammothT -= h; }
      if (S.returnT > 0) { S.returnT -= h; if (S.returnT <= 0 && S.returnMon) { const m = S.returnMon; S.returnMon = null; gMon.appendChild(m.parts.root); const g = { m, state: "ground", x: 0, y: 0, rot: 0, vx: 0, vy: 0, vr: 0, dy: rnd(6, GROUND_H - 12), sp: 1, act: "idle", stay: 0 }; g.x = rnd(60, W - 60); g.y = -40; S.mon.push(g); fall(g); m.say = "¡¿?!"; logEv(`El mono abducido regresó... con cara de susto`); } }
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
    warStep(h); huntStep(h); launchStep(h); flightStep(h); ufoStep(h);
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
      s.el.setAttribute("transform", `translate(${(s.x + sh).toFixed(1)} ${(floorY() + (s.dy || 0) + 4).toFixed(1)}) scale(${sx} ${Math.max(.001, b).toFixed(3)})`);
    }
  }
  function renderMons() {
    for (const g of S.mon) {
      A.draw(g.m);
      g.m.parts.root.setAttribute("transform", `translate(${g.x.toFixed(1)} ${(g.state === "ground" ? floorY() + g.dy : g.y).toFixed(1)}) scale(${K}) rotate(${g.rot.toFixed(1)} 0 -9)`);
      g.m.parts.root.style.opacity = g.dead > 0 ? clamp(g.dead, 0, 1).toFixed(2) : 1;
    }
  }
  function renderHud() {
    if (!S.started || S.hudT > 0) return;
    S.hudT = .3;
    const e = ERAS[S.era], pop = popTotal(), st = S.stats;
    let h = `<b>${e.name}</b> · ${fmtYear(curYear())} ${hudOpen ? "▾" : "▸"}<br>Población ${pop} · ${S.tribe}` + (S.cycle > 1 ? ` · Ciclo ${S.cycle}` : "") +
      (S.saga ? `<br>Saga: ${S.saga.def.name}` : "") +
      (S.era === 7 && S.destSeen ? ` · ${S.dest.name}: ${S.colonists}${S.won ? " ✔" : "/" + S.goal}` : "");
    if (hudOpen) {
      h += `<div class="ev" style="margin-top:4px;max-height:42vh;overflow:auto">` +
        S.log.slice(0, 14).map(l => `${l.y}: ${l.text}`).join("<br>") + `</div>` +
        (S.rel ? `<div style="margin-top:4px">Religión: ${S.rel.name}${S.rel2 && S.done.reforma ? " · rival: " + S.rel2.name : ""}</div>` : "") +
        `<div style="margin-top:4px;border-top:1px solid var(--border);padding-top:3px">Guerras ${st.guerras} · Plagas ${st.plagas} · Hambrunas ${st.hambrunas} · Terremotos ${st.terremotos} · Meteoritos ${st.meteoritos} · Fiestas ${st.festivales} · Cohetes ${st.cohetes} · Pandemias ${st.pandemias} · Incendios ${st.incendios} · Bajas ${st.devorados} · Cataclismos ${st.cataclismos} · Hitos ${st.hitos}</div>`;
    }
    hud.innerHTML = h + (Q.has("debug") ? `<br>t=${S.t.toFixed(1)} fx=${S.fx.length} mon=${S.mon.length} st=${S.structs.length}` : "");
    toasts.style.display = hudOpen ? "none" : "";
  }

  // ---------- ciclo ----------
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
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
    const flags = [[1, ["fuego_sagrado"]], [2, ["totems", "trueque"]], [3, ["rueda", "escritura", "comercio", "templo", "academia", "astronomia"]], [4, ["catedral", "universidad", "reforma", "imprenta"]],
      [5, ["electricidad", "deporte", "heroe"]], [6, ["radio", "laboratorio", "antibioticos", "vacunas"]]];
    flags.forEach(([e, fl]) => { if (S.era >= e) fl.forEach(f => { S.done[f] = true; }); });
    if (S.era >= 1) S.rel = newRel();
    if (S.era >= 4) S.rel2 = newRel();
    ground.setAttribute("fill", ERAS[S.era].ground);
    S.started = true; gGround.style.opacity = 1; gStruct.style.opacity = 1; hud.style.opacity = 1;
    for (let i = 0; i < 14; i++) {
      const m = A.make(); gMon.appendChild(m.parts.root); m.mood = { low: 0, mid: 1, high: 0 }; m.theta = 0;
      S.mon.push({ m, state: "ground", x: rnd(40, W - 40), y: 0, rot: 0, vx: 0, vy: 0, vr: 0, dy: rnd(6, GROUND_H - 12), sp: rnd(.85, 1.2), act: "idle", stay: rnd(0, 3) });
    }
    if (S.era >= 7) { ensureDest(); for (let i = 0; i < 3; i++) addPlanet({}); }
    for (let i = 0; i < 6; i++) plan();
    S.structs.forEach(s => s.built = 1);
    const DO = { guerra: startWar, caceria: startHunt, cohete: () => { S.destSeen = true; ensureDest(); tryLaunch(); }, meteorito: meteor, ovni: ufo, plaga: () => hurt(.25, "Plaga"),
      terremoto: quake, volcan: volcano, festival, eclipse: () => { S.eclipse = 10; }, lluvia: () => { S.rain = 12; }, cometa: comet };
    Object.assign(DO, { cataclismo: () => cataclysm({ surv: 4 }), pandemia: pandemic, incendio: fire, inundacion: () => flood(14, "Inundación"), tormenta: storm, aurora, estrellas: starShower,
      olimpiadas: olympics, peregrinacion: pilgrimage, milagro: miracle, cisma: schism, huelga: strike, crisis, langostas: locusts, sequia: drought, genio: genius, concierto: () => { S.music = 10; cheerSome(10, 8); } });
    if (START_ERA === 8) setTimeout(() => startSaga(Q.get("saga")), 600);
    const d = Q.get("do"); if (d && DO[d]) setTimeout(DO[d], 2500);
  }

  const WARP = parseFloat(Q.get("warp")) || 0;   // ?warp=300 adelanta la simulacion 300 s (para pruebas)
  if (WARP) setTimeout(() => { for (let t = 0; t < WARP; t += .05) step(.05); }, 3500);
  layout(); testSetup(); requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
  return { _S: S, _ERAS: ERAS };
})();
