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
  const START_ERA = Math.min(7, Math.max(0, parseInt(Q.get("era"), 10) || 0));
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
        gMon = el("g", {}, svg), gFx = el("g", {}, svg);
  for (const g of [gGround, gStruct]) { g.style.opacity = 0; g.style.transition = "opacity 1.6s"; }
  const ground = el("rect", { x: 0, width: W, height: GROUND_H, fill: "#8b7b5c" }, gGround);
  ground.style.transition = "fill 2s";
  const grass = el("rect", { x: 0, width: W, height: 4, fill: "rgba(255,255,255,.18)" }, gGround);
  const rails = el("g", { style: "display:none" }, gGround);
  const dark = el("rect", { x: 0, y: 0, width: W, height: H, fill: "#000", opacity: 0 }, gSky);   // eclipse
  const hud = document.createElement("div"); hud.id = "hud"; hud.style.opacity = 0; document.body.appendChild(hud);
  const banner = document.createElement("div"); banner.id = "eraBanner"; document.body.appendChild(banner);
  const toasts = document.createElement("div"); toasts.id = "toasts"; document.body.appendChild(toasts);
  let hudOpen = false;
  hud.addEventListener("click", () => { hudOpen = !hudOpen; S.hudT = 0; renderHud(); });
  function layout() {
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    ground.setAttribute("y", floorY()); ground.setAttribute("width", W);
    grass.setAttribute("y", floorY()); grass.setAttribute("width", W);
    dark.setAttribute("width", W); dark.setAttribute("height", H);
    rails.innerHTML = `<rect x="0" y="${H - 9}" width="${W}" height="2.5" fill="#444"/>` +
      `<line x1="0" y1="${H - 5}" x2="${W}" y2="${H - 5}" stroke="#5a4630" stroke-width="3" stroke-dasharray="3 9"/>`;
    marsPlace();
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
    stats: { guerras: 0, plagas: 0, hambrunas: 0, terremotos: 0, meteoritos: 0, festivales: 0, cohetes: 0, hitos: 0 },
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
        s.g += h / (S.rain ? 11 : 22);
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
    temple: { w: 56, draw: () => R(-24, -4, 48, 4, "#d8d2c4") + [-18, -9, 0, 9, 18].map(x => R(x - 2, -28, 4, 24, "#eee8dc")).join("") +
      Pth("M-28 -28L0 -46L28 -28Z", "#cfc6b4") },
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
    const s = Object.assign({ kind, x, w: def.w, t: rnd(0, 9), built: 0, dying: 0, flip: chance(.5), mobile: !!def.mobile, _c: {} }, o || {});
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
  function GLOBAL() {   // lo que se conserva en cualquier epoca una vez descubierto
    const d = S.done;
    return { cart: d.rueda ? 1 : 0, library: d.escritura || d.imprenta ? 1 : 0, market: d.comercio ? 1 : 0, temple: d.templo ? 1 : 0,
             lamp: d.electricidad ? Math.min(7, 2 + S.era) : 0, dog: d.lobos ? 1 : 0 };
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
        case "g": f.e.setAttribute("transform", `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)})`); if (f.tick) f.tick(f, h); break;
      }
    }
    S.fx = S.fx.filter(f => { if (f.life <= 0) { f.e.remove(); return false; } return true; });
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
    else if (e === 3) { r < .5 ? go(at(["field"], 28), "work", rnd(4, 9)) : r < .75 ? go(at(["hut", "campfire", "temple", "market"], 40), "sit") : go(null, "sit", rnd(1, 3)); }
    else {
      const wk = [["field", "windmill", "fort", "ship", "market"], ["factory", "train", "library"], ["skyscraper", "car", "library"], ["pad", "dish", "dome"]][e - 4];
      const hm = [["house", "hut", "market"], ["brickhouse", "house"], ["house", "skyscraper"], ["dome", "skyscraper", "dish"]][e - 4];
      r < .4 ? go(at(wk, 30), "work", rnd(3, 8)) : r < .7 ? go(at(hm, 36), "sit") : go(null, "sit", rnd(1, 3));
    }
  }
  const sendTo = (g, x, act, face, stay) => { g.tx = clamp(x, 14, W - 14); g.act = "run"; g.next = act; g.face = face || 0; g.stayT = stay == null ? 99 : stay; g.hold = true; g.m.t = 0; };

  // ---------- hitos canonicos y sucesos al azar ----------
  const T = () => S.tribe;
  const MILESTONES = [
    { id: "herramientas", era: 0, text: () => `${T()}: fabrican las primeras herramientas de piedra` },
    { id: "pintura", era: 0, text: () => `Pintan las paredes de la cueva`, run: () => alive("cave").forEach(s => s.$(".pt").style.display = "") },
    { id: "lenguaje", era: 0, text: () => `Nace el lenguaje: se oyen los primeros «uh uh»`, run: () => { for (let i = 0; i < 4; i++) setTimeout(() => say(pick(A.SAYS)), i * 500); } },
    { id: "fuego", era: 1, text: () => `¡${T()} domina el fuego!`, run: () => dust(W / 2, 4) },
    { id: "cocina", era: 1, text: () => `Descubren que la comida cocida sabe mejor`, run: () => free().slice(0, 4).forEach(g => { g.act = "eat"; g.stay = 5; g.m.food = "banana"; g.m.dur = 5; g.m.t = 0; }) },
    { id: "ritual", era: 1, text: () => `Primer ritual bailando alrededor del fuego`, run: () => free().slice(0, 7).forEach(g => { g.act = "cheer"; g.stay = 6; g.m.t = 0; }) },
    { id: "pieles", era: 1, text: () => `Se abrigan con pieles para el frío` },
    { id: "lobos", era: 2, text: () => `Domestican al lobo: nace el mejor amigo` },
    { id: "arco", era: 2, text: () => `Inventan el arco y la flecha` },
    { id: "jefe", era: 2, text: () => `Aparece un jefe que guía al clan` },
    { id: "agricultura", era: 3, text: () => `Inventan la agricultura: ¡adiós a vagar!`, run: () => { S.extra += 3; } },
    { id: "alfareria", era: 3, text: () => `Aprenden alfarería para guardar el grano` },
    { id: "rueda", era: 3, text: () => `Inventan la rueda`, },
    { id: "escritura", era: 3, text: () => `Nace la escritura` },
    { id: "comercio", era: 3, text: () => `Abren el primer mercado` },
    { id: "templo", era: 3, text: () => `Levantan un templo a la Gran Banana` },
    { id: "navegacion", era: 4, text: () => `Zarpan hacia tierras desconocidas`, run: () => { const sh = alive("ship")[0]; if (sh) burst(sh.x, floorY() - 20, 8, "#fff", 60); } },
    { id: "imprenta", era: 4, text: () => `Inventan la imprenta: las ideas viajan rápido` },
    { id: "colonia", era: 4, text: () => `Fundan la colonia de ${S.city}` },
    { id: "vapor", era: 5, text: () => `Máquina de vapor: ¡las fábricas no paran!` },
    { id: "ferrocarril", era: 5, text: () => `Llega el ferrocarril` },
    { id: "electricidad", era: 5, text: () => `Se hace la luz: llega la electricidad` },
    { id: "telegrafo", era: 5, text: () => `El telégrafo conecta a la colonia` },
    { id: "automovil", era: 6, text: () => `Los automóviles llenan las calles` },
    { id: "aviacion", era: 6, text: () => `Primer vuelo: el mono por fin tiene alas` },
    { id: "radio", era: 6, text: () => `La radio y la televisión llegan a todos` },
    { id: "internet", era: 6, text: () => `Nace internet: todos miran videos de bananas` },
    { id: "vacunas", era: 6, text: () => `Inventan las vacunas`, run: () => { S.extra += 5; } },
    { id: "satelite", era: 7, text: () => `Lanzan el primer satélite` },
    { id: "telescopio", era: 7, text: () => `El telescopio divisa ${S.dest.name}`, run: () => { S.destSeen = true; marsPlace(); } },
    { id: "estacion", era: 7, text: () => `Construyen una estación espacial` },
    { id: "reutilizables", era: 7, text: () => `Cohetes reutilizables: viajar es barato` },
  ];
  const EVENTS = [
    { id: "guerra", min: 1, w: () => S.traits.war * 1.4 * (free().length >= 6 ? 1 : 0), run: () => startWar() },
    { id: "caceria", max: 2, w: () => alive("mammoth").length && free().length >= 4 ? 1.1 : 0, run: () => startHunt() },
    { id: "festival", min: 1, w: () => 1, run: () => festival() },
    { id: "plaga", min: 2, w: () => .5 * (2 - S.traits.luck), run: () => hurt(rnd(.15, .35), `Una plaga azota a ${T()}`) },
    { id: "hambruna", min: 3, w: () => alive("field").length < 2 ? .8 : .25, run: () => hurt(rnd(.1, .22), `Hambruna: la cosecha fracasó`, "hambrunas") },
    { id: "terremoto", min: 1, w: () => .5, run: () => quake() },
    { id: "volcan", max: 4, w: () => .45, run: () => volcano() },
    { id: "meteorito", w: () => .35, run: () => meteor() },
    { id: "eclipse", w: () => .5, run: () => { S.eclipse = 10; logEv(`Eclipse total: ${T()} mira al cielo asustada`); } },
    { id: "lluvia", w: () => .9, run: () => { S.rain = rnd(10, 16); logEv(`Llueve: los cultivos lo agradecen`); } },
    { id: "glaciacion", max: 2, w: () => .35, run: () => { S.snow = 22; S.boost = .6; S.boostT = 30; logEv(`Glaciación: el frío frena a ${T()}`); } },
    { id: "edadoro", w: () => .4 * S.traits.luck, run: () => { S.boost = 1.5; S.boostT = 40; logEv(`Edad dorada: ${T()} florece`); for (let i = 0; i < 3; i++) setTimeout(() => fireworks(rnd(W * .2, W * .8), rnd(H * .2, H * .5)), i * 700); } },
    { id: "edadoscura", min: 2, w: () => .3 * (2 - S.traits.luck), run: () => { S.boost = .55; S.boostT = 32; logEv(`Edad oscura: se pierde conocimiento`); } },
    { id: "ovni", min: 5, w: () => .5, run: () => ufo() },
    { id: "cometa", w: () => .45, run: () => comet() },
    { id: "oro", min: 3, w: () => .4, run: () => { S.extra += 3; logEv(`Hallan una veta de oro: llegan inmigrantes`); } },
  ];
  function nextMilestone() {
    const c = MILESTONES.filter(m => m.era === S.era && !S.done[m.id]);
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
  function meteor() {
    const x = rnd(W * .15, W * .85), x0 = x + rnd(250, 420);
    fx("g", { x: x0, y: -30, life: 1.3, vx: (x - x0) / 1.3, vy: (floorY() + 6) / 1.3 * 1.0, html: `<circle r="6" fill="#ffd27a"/><circle r="11" fill="#ff9a3c" opacity=".4"/><line x1="0" y1="0" x2="60" y2="-40" stroke="#ff9a3c" stroke-width="5" stroke-linecap="round" opacity=".6"/>`,
      tick: f => { if (f.life < .05 && !f.hit) { f.hit = true; impact(f.x); } } });
    logEv(`¡Un meteorito cruza el cielo!`);
  }
  function impact(x) {
    S.stats.meteoritos++;
    boom(x, floorY(), true); fx("flash", { x, y: floorY() - 20, r0: 10, r1: 130, life: .6, col: "#fff", op: .5 });
    S.structs.forEach(s => { if (!s.mobile && !s.dying && !s.temp && Math.abs(s.x - x) < 80) s.dying = .001; });
    groundMons().forEach(g => { if (Math.abs(g.x - x) < 100) { g.act = "ko"; g.stay = 3; g.m.t = 0; } });
    S.shake = 1.4; logEv(`El meteorito cae y arrasa lo que encuentra`);
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

  // --- guerra y paz ---
  const WEAPON = ["stone", "stone", "arrow", "arrow", "ball", "ball", "bullet", "laser"];
  function startWar() {
    const gs = shuffle(free());
    if (gs.length < 6) return false;
    const cx = rnd(W * .3, W * .7), L = [], R2 = [];
    gs.slice(0, 22).forEach((g, i) => {
      const left = i % 2 === 0, side = left ? L : R2; side.push(g);
      sendTo(g, cx + (left ? -1 : 1) * (60 + side.length * 9), "fight", left ? 1 : -1, 999);
    });
    S.stats.guerras++;
    S.war = { phase: "march", t: 0, cx, L, R: R2, shot: 0, ko: 3, dur: rnd(11, 17), weapon: WEAPON[S.era] };
    S.busy = true;
    logEv(pick([`Estalla la guerra entre dos bandos de ${T()}`, `Guerra civil: el clan se divide`, `Disputa por el agua: ${T()} toma las armas`]));
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

  // --- cohetes y colonizacion ---
  function tryLaunch() {
    const pad = alive("pad").find(p => p.ready && p.built > .9), gs = free();
    if (!pad || gs.length < 4 || !S.destSeen) return false;
    gs.sort((a, b) => Math.abs(a.x - pad.x) - Math.abs(b.x - pad.x));
    const grp = gs.slice(0, 2 + (Math.random() * 3 | 0));
    grp.forEach(g => sendTo(g, pad.x + rnd(-16, 16), "cheer", 1, 99));
    S.launch = { pad, grp, t: 0 }; S.busy = true;
    logEv(`Preparan un cohete hacia ${S.dest.name}`);
    return true;
  }
  function launchStep(h) {
    const L = S.launch; if (!L) return;
    L.t += h;
    if (L.t > 9 || L.grp.every(g => g.act === "cheer")) {
      L.pad.ready = false; L.pad.readyT = 18 / Math.min(2, S.boost);
      L.grp.forEach(g => { boom(g.x, floorY() - 10, false); killMon(g); });
      const n = L.grp.length, x0 = L.pad.x + 2, y0 = floorY() - 70;
      const mp = marsPos();
      S.flights.push({ x0, y0, x1: mp.x, y1: mp.y, t: 0, dur: 8, n,
        e: el("g", {}, gFx) });
      S.flights[S.flights.length - 1].e.innerHTML = `<g transform="rotate(0)">${Pth("M-5 6Q-5 -22 2 -28Q9 -22 9 6Z", "#f4f1ea")}${Pth("M-5 -14Q2 -30 9 -14Z", "#e53935")}${Cir(2, -6, 2.6, "#6fb7ff")}<path class="fl2" d="M-3 6Q2 22 7 6Z" fill="#ff9a3c"/></g>`;
      S.stats.cohetes++;
      logEv(`¡Despega! ${n} monos viajan a ${S.dest.name}`);
      S.launch = null; S.busy = false;
    }
  }
  function flightStep(h) {
    for (const f of S.flights) {
      f.t += h; const u = clamp(f.t / f.dur, 0, 1), e = u * u * .6 + u * .4;   // acelera
      const cx = f.x0 + (f.x1 - f.x0) * .15, cy = f.y0 - H * .5;
      const x = (1 - e) * (1 - e) * f.x0 + 2 * (1 - e) * e * cx + e * e * f.x1, y = (1 - e) * (1 - e) * f.y0 + 2 * (1 - e) * e * cy + e * e * f.y1;
      const dx = 2 * (1 - e) * (cx - f.x0) + 2 * e * (f.x1 - cx), dy = 2 * (1 - e) * (cy - f.y0) + 2 * e * (f.y1 - cy);
      f.e.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(Math.atan2(dy, dx) * 180 / Math.PI + 90).toFixed(0)}) scale(${lerp(1, .45, u).toFixed(2)})`);
      if (chance(h * 25)) fx("puff", { x, y, vx: rnd(-8, 8), vy: rnd(-8, 8), r0: 3, r1: 9, life: 1.1, col: "#e8e8e8", op: .6 });
      if (u >= 1) { f.done = true; arriveMars(f); }
    }
    S.flights = S.flights.filter(f => { if (f.done) { f.e.remove(); return false; } return true; });
  }
  function arriveMars(f) {
    S.colonists += f.n; boom(f.x1, f.y1, false); marsPlace();
    logEv(`Llegan ${f.n} colonos a ${S.dest.name}: ya son ${S.colonists}`);
    if (!S.won && S.colonists >= S.goal) {
      S.won = true; showBanner(`¡${S.tribe} colonizó ${S.dest.name}!`);
      logEv(`¡${T()} COLONIZÓ ${S.dest.name.toUpperCase()}!`);
      for (let i = 0; i < 6; i++) setTimeout(() => fireworks(rnd(W * .1, W * .9), rnd(H * .15, H * .5)), i * 500);
    }
  }
  // planeta destino (arriba a la derecha)
  const gDest = el("g", { style: "display:none" }, gSky);
  const marsPos = () => ({ x: W - 88, y: 96 });
  function marsPlace() {
    const p = marsPos(), d = S.dest;
    if (!gDest.firstChild) {
      gDest.innerHTML = `<defs><radialGradient id="dg" cx=".35" cy=".35"><stop offset="0" stop-color="${d.c1}"/><stop offset="1" stop-color="${d.c2}"/></radialGradient></defs>` +
        `<circle r="44" fill="url(#dg)"/><circle cx="-14" cy="-10" r="7" fill="${d.c2}" opacity=".5"/><circle cx="16" cy="14" r="9" fill="${d.c2}" opacity=".45"/><circle cx="8" cy="-24" r="4" fill="${d.c2}" opacity=".5"/>` +
        `<g class="col"></g><text y="62" text-anchor="middle" font-size="12" font-weight="700" style="fill:var(--muted)">${d.name}</text>`;
    }
    gDest.setAttribute("transform", `translate(${p.x} ${p.y})`);
    gDest.style.display = S.destSeen ? "" : "none";
    const c = gDest.querySelector(".col"), n = Math.min(6, S.colonists);
    let html = "";
    for (let i = 0; i < n; i++) { const a = (-130 + i * 22) * Math.PI / 180, x = 44 * Math.cos(a), y = 44 * Math.sin(a); html += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(a * 180 / Math.PI + 90).toFixed(0)})"><path d="M-6 0A6 6 0 0 1 6 0Z" fill="#cfe9ff" stroke="#fff" stroke-width="1"/><line x1="6" y1="0" x2="6" y2="-10" stroke="#555"/><path d="M6 -10L13 -8L6 -6Z" fill="${hsl(S.flag[0], 70, 50)}"/></g>`; }
    c.innerHTML = html;
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
    if (S.era >= 3) logEv(`Nace ${S.city}, la primera aldea de ${T()}`);
    burst(W / 2, floorY() - 20, 14, "#ffd23f", 100);
    if (S.era === 7) { S.msT = 6; }
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
    for (const g of S.mon.slice()) stepMon(g, h);
    if (S.started) {
      S.eraT += h * S.boost;
      const ground2 = groundMons().length;
      if (ground2 >= 2 && popTotal() < ERAS[S.era].cap) S.extra += h * (.12 + ground2 * .012) * S.traits.luck;
      if (S.era < 7 && S.eraT >= S.eraDur && popTotal() >= ERAS[S.era + 1].min) eraUp();
      S.planT -= h; if (S.planT <= 0) { S.planT = 1.1; plan(); }
      S.msT -= h; if (S.msT <= 0) { S.msT = rnd(9, 18) / S.traits.curious / S.boost; nextMilestone(); }
      if (!S.busy) { S.evT -= h; if (S.evT <= 0) { S.evT = rnd(14, 28) / Math.sqrt(S.boost); nextEvent(); } }
      if (S.era === 7 && S.destSeen && !S.busy && !S.launch) { S.launchT = (S.launchT == null ? 8 : S.launchT) - h; if (S.launchT <= 0) { S.launchT = rnd(14, 22); tryLaunch(); } }
      if (S.mammothT > 0) { S.mammothT -= h; }
      if (S.returnT > 0) { S.returnT -= h; if (S.returnT <= 0 && S.returnMon) { const m = S.returnMon; S.returnMon = null; gMon.appendChild(m.parts.root); const g = { m, state: "ground", x: 0, y: 0, rot: 0, vx: 0, vy: 0, vr: 0, dy: rnd(6, GROUND_H - 12), sp: 1, act: "idle", stay: 0 }; g.x = rnd(60, W - 60); g.y = -40; S.mon.push(g); fall(g); m.say = "¡¿?!"; logEv(`El mono abducido regresó... con cara de susto`); } }
    }
    for (const s of S.structs) {
      const def = KINDS[s.kind];
      if (s.dying) s.dying += h / .7; else s.built = Math.min(1, s.built + h / .8);
      if (s.lifeT != null) { s.lifeT -= h; if (s.lifeT <= 0 && !s.dying) s.dying = .001; }
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
    let h = `<b>${e.name}</b> · ${fmtYear(curYear())} ${hudOpen ? "▾" : "▸"}<br>Población ${pop} · ${S.tribe}` +
      (S.era === 7 && S.destSeen ? ` · ${S.dest.name}: ${S.colonists}${S.won ? " ✔" : "/" + S.goal}` : "");
    if (hudOpen) {
      h += `<div class="ev" style="margin-top:4px;max-height:42vh;overflow:auto">` +
        S.log.slice(0, 14).map(l => `${l.y}: ${l.text}`).join("<br>") + `</div>` +
        `<div style="margin-top:4px;border-top:1px solid var(--border);padding-top:3px">Guerras ${st.guerras} · Plagas ${st.plagas} · Hambrunas ${st.hambrunas} · Terremotos ${st.terremotos} · Meteoritos ${st.meteoritos} · Fiestas ${st.festivales} · Cohetes ${st.cohetes} · Hitos ${st.hitos}</div>`;
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
    renderStructs(); renderMons(); renderHud();
  }
  addEventListener("resize", () => { const ow = W; W = innerWidth; H = innerHeight; S.structs.forEach(s => { s.x *= W / ow; }); layout(); });

  // ---------- pruebas (?era=N, ?do=...) ----------
  function testSetup() {
    if (!START_ERA && !Q.get("do")) return;
    S.era = START_ERA; S.eraDur = ERAS[S.era].dur * 2; S.extra = ERAS[S.era].cap; S.destSeen = S.era === 7;
    ground.setAttribute("fill", ERAS[S.era].ground);
    S.started = true; gGround.style.opacity = 1; gStruct.style.opacity = 1; hud.style.opacity = 1;
    for (let i = 0; i < 14; i++) {
      const m = A.make(); gMon.appendChild(m.parts.root); m.mood = { low: 0, mid: 1, high: 0 }; m.theta = 0;
      S.mon.push({ m, state: "ground", x: rnd(40, W - 40), y: 0, rot: 0, vx: 0, vy: 0, vr: 0, dy: rnd(6, GROUND_H - 12), sp: rnd(.85, 1.2), act: "idle", stay: rnd(0, 3) });
    }
    for (let i = 0; i < 6; i++) plan();
    S.structs.forEach(s => s.built = 1);
    const DO = { guerra: startWar, caceria: startHunt, cohete: () => { S.destSeen = true; marsPlace(); tryLaunch(); }, meteorito: meteor, ovni: ufo, plaga: () => hurt(.25, "Plaga"),
      terremoto: quake, volcan: volcano, festival, eclipse: () => { S.eclipse = 10; }, lluvia: () => { S.rain = 12; }, cometa: comet };
    const d = Q.get("do"); if (d && DO[d]) setTimeout(DO[d], 2500);
  }

  const WARP = parseFloat(Q.get("warp")) || 0;   // ?warp=300 adelanta la simulacion 300 s (para pruebas)
  if (WARP) setTimeout(() => { for (let t = 0; t < WARP; t += .05) step(.05); }, 3500);
  layout(); testSetup(); requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
  return { _S: S, _ERAS: ERAS };
})();
