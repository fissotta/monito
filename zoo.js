/* Monos que juegan sobre los anillos de cada equipo: caminan por la barra de RAM,
 * saltan de hilo en hilo por el anillo de CPU, comen, descansan y cruzan de un anillo
 * a otro. Dibujados con SVG en una capa (.zoo) con el mismo viewBox que los anillos
 * (300x300); con más carga de CPU se ponen más activos. */
const Zoo = (function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const CX = 150, CY = 150;
  const LANE = { ram: 99, cpu: 131 };   // radio donde pisan: borde exterior de cada anillo
  const BAR = 3.6;                      // grados por 1 % de RAM
  const RAM_LO = 4;
  const PER_CARD = 5;
  const SCALE = 1.25;                   // tamaño general de los monos

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = a => ((a % 360) + 360) % 360;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const hsl = (h, s, l) => `hsl(${Math.round(wrap(h))} ${Math.round(s)}% ${Math.round(l)}%)`;
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // ---- especies: color de pelaje [h,s,l], cara, forma de cola, tamaño ... ----
  const SPECIES = [
    { name: "capuchino",        fur: [28, 45, 38], face: [35, 45, 78], cap: [25, 30, 16], tail: "long" },
    { name: "tití león",        fur: [28, 95, 55], face: [22, 60, 38], mane: [26, 95, 48], tail: "long", size: .85 },
    { name: "mono ardilla",     fur: [48, 75, 58], face: [0, 0, 96],   mask: true, tail: "long", size: .8 },
    { name: "mandril",          fur: [30, 15, 34], face: [28, 20, 55], mandrill: true, tail: "stub", size: 1.05 },
    { name: "mono araña",       fur: [25, 25, 20], face: [25, 35, 55], tail: "curl", limbs: 1.45 },
    { name: "orangután",        fur: [18, 80, 44], face: [22, 40, 55], shaggy: true, tail: "none", limbs: 1.35, size: 1.12 },
    { name: "macaco de nieve",  fur: [0, 0, 68],   face: [5, 60, 68],  tail: "stub" },
    { name: "uacarí",           fur: [40, 30, 90], face: [0, 80, 50],  bald: true, tail: "stub", size: .95 },
    { name: "fantasía",         fantasy: true, tail: "curl", size: .9 },
  ];
  const TAILS = {   // relativas al pivote (-2.5,-6)
    long: "M0 0C-5 1 -8 -3 -6.5 -9",
    curl: "M0 0C-6 2 -9 -5 -5.5 -8C-3.5 -9.5 -2 -7.5 -3.5 -6.5",
    stub: "M0 0L-3.2 -.8",
  };
  const FOODS = ["banana", "berry", "leaf"];

  function palette(sp) {
    if (sp.fantasy) {
      const h = rnd(0, 360);
      return { fur: hsl(h, 85, 58), dark: hsl(h, 70, 40), face: hsl(h + rnd(150, 210), 80, 82),
               mane: Math.random() < .5 ? hsl(h + 40, 90, 62) : null, cheek: hsl(h, 60, 45) };
    }
    const j = rnd(-10, 10), l = rnd(-5, 5), [fh, fs, fl] = sp.fur, [ch, cs, cl] = sp.face;
    return { fur: hsl(fh + j, fs, fl + l), dark: hsl(fh + j, fs, Math.max(8, fl + l - 14)),
             face: hsl(ch + j, cs, cl), cheek: hsl(fh + j, fs, Math.max(8, fl + l - 8)),
             mane: sp.mane ? hsl(sp.mane[0] + j, sp.mane[1], sp.mane[2]) : null,
             cap: sp.cap ? hsl(sp.cap[0], sp.cap[1], sp.cap[2]) : null };
  }

  // ---- dibujo (pies en 0,0; cabeza hacia -y; mira hacia +x) ----
  function build(m) {
    const sp = m.sp, c = m.pal, k = sp.limbs || 1;
    const edge = { stroke: "rgba(0,0,0,.35)", "stroke-width": .35 };
    const root = el("g", {}), mirror = el("g", {}, root), bob = el("g", {}, mirror);
    const P = { root, mirror, bob };

    P.tail = el("g", {}, bob);
    if (sp.tail !== "none") {
      el("path", { d: TAILS[sp.tail], fill: "none", stroke: c.dark, "stroke-width": sp.tail === "stub" ? 2 : 1.5,
                   "stroke-linecap": "round" }, P.tail);
    }
    const limb = (len, col) => {
      const g = el("g", {}, bob);
      el("line", { x1: 0, y1: 0, x2: 0, y2: len, stroke: col, "stroke-width": 1.7, "stroke-linecap": "round" }, g);
      el("circle", { cx: 0, cy: len, r: 1.2, fill: col }, g);
      return g;
    };
    P.backArm = limb(4.5 * k, c.dark);
    P.backLeg = limb(5, c.dark);
    el("ellipse", { cx: 0, cy: -8.5, rx: sp.shaggy ? 4.3 : 3.4, ry: sp.shaggy ? 5.2 : 4.4, fill: c.fur, ...edge }, bob);
    el("ellipse", { cx: .9, cy: -8, rx: 1.9, ry: 3, fill: c.face, opacity: .5 }, bob);

    const h = P.head = el("g", {}, bob);
    if (c.mane) el("circle", { r: 5.4, fill: c.mane, ...edge }, h);
    for (const ex of [-2.5, 3.9]) {
      el("circle", { cx: ex, cy: -.8, r: 1.5, fill: c.fur, ...edge }, h);
      el("circle", { cx: ex, cy: -.8, r: .7, fill: c.face }, h);
    }
    el("circle", { r: 3.7, fill: sp.bald ? c.fur : c.fur, ...edge }, h);
    if (sp.bald) {
      el("ellipse", { cx: 1.3, cy: .6, rx: 2.6, ry: 2.6, fill: c.face }, h);
    } else {
      el("ellipse", { cx: 1.2, cy: .6, rx: 2.5, ry: 2.3, fill: c.face }, h);
    }
    if (c.cap) el("path", { d: "M-3.7 -.9A3.7 3.7 0 0 1 3.7 -.9Q0 -2.4 -3.7 -.9Z", fill: c.cap }, h);
    if (sp.mask) el("ellipse", { cx: 2.6, cy: 1.5, rx: 1.1, ry: .9, fill: "#333" }, h);
    if (sp.mandrill) {
      el("rect", { x: 1.1, y: -1, width: .9, height: 3.2, fill: "#d12b2b" }, h);
      el("ellipse", { cx: 0, cy: 1.7, rx: .8, ry: 1, fill: "#2b6fd1" }, h);
      el("ellipse", { cx: 3, cy: 1.7, rx: .8, ry: 1, fill: "#2b6fd1" }, h);
    }
    if (sp.shaggy) {
      el("ellipse", { cx: -1.1, cy: 1, rx: 1.1, ry: 1.7, fill: c.cheek }, h);
      el("ellipse", { cx: 3.8, cy: 1, rx: 1.1, ry: 1.7, fill: c.cheek }, h);
    }
    P.eyeOpen = el("g", {}, h);
    el("circle", { cx: .6, cy: -.4, r: .55, fill: "#111" }, P.eyeOpen);
    el("circle", { cx: 2.7, cy: -.4, r: .55, fill: "#111" }, P.eyeOpen);
    P.eyeShut = el("g", { style: "display:none" }, h);
    for (const ex of [.6, 2.7]) {
      el("path", { d: `M${ex - .8} -.5Q${ex} .3 ${ex + .8} -.5`, fill: "none", stroke: "#111", "stroke-width": .4 }, P.eyeShut);
    }
    el("ellipse", { cx: 2.2, cy: 1.2, rx: .7, ry: .5, fill: "#3a2418" }, h);
    el("path", { d: "M1 2.2Q1.8 2.8 2.7 2.2", fill: "none", stroke: "#3a2418", "stroke-width": .4 }, h);
    P.yawn = el("ellipse", { cx: 2.1, cy: 2.5, rx: .9, ry: 1.1, fill: "#5a2a2a", style: "display:none" }, h);

    P.frontLeg = limb(5, c.fur);
    P.frontArm = limb(4.5 * k, c.fur);

    P.food = el("g", {}, bob);
    P.foodShape = {
      banana: el("path", { d: "M0 0Q2.4 -.6 3.6 -3.4", fill: "none", stroke: "#f5d033", "stroke-width": 1.8, "stroke-linecap": "round" }, P.food),
      berry: el("g", {}, P.food),
      leaf: el("ellipse", { cx: 1.5, cy: -1, rx: 2.3, ry: 1.1, fill: "#4caf50", transform: "rotate(-35 1.5 -1)" }, P.food),
    };
    P.cup = el("g", { style: "display:none" }, bob);   // taza de cafe (con vapor)
    el("path", { d: "M1.4 -1.7q1.5 0 1.5 1.1q0 1.1 -1.5 1.1", fill: "none", stroke: "#cfc9bd", "stroke-width": .5 }, P.cup);
    el("rect", { x: -1.4, y: -2.4, width: 2.8, height: 2.8, rx: .5, fill: "#f4f1ea", ...edge }, P.cup);
    el("ellipse", { cx: 0, cy: -2.4, rx: 1.4, ry: .5, fill: "#5b3a1e" }, P.cup);
    P.steam = [0, 1].map(i => el("path", { d: `M${i ? .5 : -.5} -3q-.8 -1 0 -2q.8 -1 0 -2`, fill: "none",
                                           stroke: "#9aa4b2", "stroke-width": .4, "stroke-linecap": "round" }, P.cup));
    el("circle", { cx: 1, cy: -1, r: 1.6, fill: "#e53935" }, P.foodShape.berry);
    el("circle", { cx: 1.3, cy: -2.4, r: .6, fill: "#43a047" }, P.foodShape.berry);
    P.zzz = el("g", { style: "display:none" }, root);   // "z z Z" al dormir (no se espeja ni gira con el mono)
    P.zs = [0, 1, 2].map(() => {
      const t = el("text", { "font-weight": 700, style: "fill:var(--muted)" }, P.zzz);
      t.textContent = "z";
      return t;
    });
    return P;
  }

  // ---- poses según el modo; m.t = segundos en el modo, m.phase = ciclo de paso ----
  function pose(m) {
    const P = { legs: [0, 0], arms: [0, 0], tail: 0, bob: 0, lean: 0, headDy: 0, tilt: 0, food: 0, flip: 0,
                shut: false, yawn: false, cup: false, zzz: false };
    const s = Math.sin(m.phase), t = m.t, mood = m.mood;
    switch (m.mode) {
      case "walk": case "goto": {
        const A = 1 - .45 * mood.low + .25 * mood.high;   // flojos: pasos cortos; a tope: pasos grandes
        P.legs = [s * 32 * A, -s * 32 * A]; P.arms = [-s * 28 * A, s * 28 * A];
        P.bob = -Math.abs(s) * .9 * A; P.tail = Math.sin(m.phase * .5) * 12;
        P.tilt = 9 * mood.low; P.headDy = .5 * mood.low; break;   // cabeza caída de sueño
      }
      case "run":
        P.legs = [s * 50, -s * 50]; P.arms = [s * 45 - 20, -s * 45 - 20];
        P.bob = -Math.abs(s) * 2.2; P.lean = 10 + 6 * mood.high; P.tail = -10 + Math.sin(m.phase * .7) * 8; break;
      case "hop": {
        const air = Math.sin(Math.PI * m.hop.u);
        P.legs = [-45 * air + 8, -30 * air]; P.arms = [-140 * air, -120 * air];
        P.lean = 8 * air; P.tail = -15 * air; break;
      }
      case "eat":
        P.legs = [-65, -60]; P.bob = 3.2;
        P.arms = [-125 + Math.sin(t * 10) * 8, -110 - Math.sin(t * 10) * 8];
        P.headDy = Math.sin(t * 10) * .5; P.tail = Math.sin(t * 2) * 10;
        P.food = Math.max(.15, 1 - (t / m.dur) * .85); break;
      case "rest":
        P.legs = [-70, -62]; P.arms = [-45, -35]; P.bob = 3.2 + Math.sin(t * 2.2) * .2;
        P.tilt = Math.sin(t * .8) * 6; P.tail = Math.sin(t * 1.4) * 14; break;
      case "sleep":   // tumbado de lado sobre el anillo
        P.lean = 90; P.bob = -3 + Math.sin(t * 1.6) * .15; P.legs = [-80, -70]; P.arms = [-30, -40];
        P.tilt = 15; P.tail = Math.sin(t) * 6; P.shut = true; P.zzz = true; break;
      case "stretch": {
        const k = Math.sin(Math.PI * Math.min(1, t / m.dur));
        P.arms = [-170 * k, -165 * k]; P.lean = -8 * k; P.tilt = -12 * k; P.tail = -25 * k;
        P.yawn = k > .45; P.shut = k > .45; break;
      }
      case "coffee": {   // a mayor carga, mas temblor
        const j = .2 + .8 * mood.high;
        P.cup = true; P.arms = [-125 + Math.sin(t * 12) * 6, -20];
        P.bob = Math.sin(t * 38) * .35 * j; P.headDy = Math.sin(t * 33) * .4 * j; P.tilt = Math.sin(t * 29) * 5 * j;
        P.tail = Math.sin(t * 20) * 14 * j; P.legs = [Math.sin(t * 25) * 10 * j, -Math.sin(t * 25) * 10 * j]; break;
      }
      case "cross": {
        const u = Math.min(1, m.jump.u), air = Math.sin(Math.PI * u);
        P.legs = [-50 * air, -35 * air]; P.arms = [-150, -140]; P.tail = air * 20;
        if (m.jump.flip) P.flip = ease(u) * 360; break;
      }
    }
    return P;
  }
  const limbT = (x, y, a) => `translate(${x} ${y}) rotate(${a.toFixed(1)})`;
  function draw(m) {
    const p = m.parts, P = pose(m), sp = m.sp;
    p.mirror.setAttribute("transform", `scale(${m.dir * (sp.size || 1) * SCALE} ${(sp.size || 1) * SCALE})`);
    p.bob.setAttribute("transform", `translate(0 ${P.bob.toFixed(2)}) rotate(${P.lean.toFixed(1)})` +
      (P.flip ? ` rotate(${P.flip.toFixed(0)} 0 -8)` : ""));
    p.tail.setAttribute("transform", limbT(-2.5, -6, P.tail));
    p.backLeg.setAttribute("transform", limbT(-1.2, -5, P.legs[1]));
    p.frontLeg.setAttribute("transform", limbT(1.2, -5, P.legs[0]));
    p.backArm.setAttribute("transform", limbT(-1, -11.5, P.arms[1]));
    p.frontArm.setAttribute("transform", limbT(1.2, -11.5, P.arms[0]));
    p.head.setAttribute("transform", `translate(.8 ${(-15 + P.headDy).toFixed(2)}) rotate(${P.tilt.toFixed(1)})`);
    p.food.setAttribute("transform", `translate(4.2 -12.2) scale(${P.food.toFixed(2)})`);
    p.eyeOpen.style.display = P.shut ? "none" : "";
    p.eyeShut.style.display = P.shut ? "" : "none";
    p.yawn.style.display = P.yawn ? "" : "none";
    p.cup.setAttribute("transform", "translate(4.6 -13.2)");
    p.cup.style.display = P.cup ? "" : "none";
    if (P.cup) p.steam.forEach((e, i) => {
      e.setAttribute("opacity", (.35 + .35 * Math.sin(m.t * 5 + i * 2)).toFixed(2));
      e.setAttribute("transform", `translate(0 ${(-((m.t * 2 + i * .5) % 1) * 1.5).toFixed(2)})`);
    });
    p.zzz.style.display = P.zzz ? "" : "none";
    if (P.zzz) p.zs.forEach((z, i) => {
      const u = (m.t * .45 + i / 3) % 1;
      z.setAttribute("transform", `translate(${(m.dir * (17 + u * 4) + Math.sin(u * 7) * 2.5).toFixed(2)} ${(-10 - u * 18).toFixed(2)})`);
      z.setAttribute("font-size", (4 + u * 3.5).toFixed(2));
      z.setAttribute("opacity", Math.sin(Math.PI * u).toFixed(2));
    });
    p.food.style.display = P.food > 0 ? "" : "none";
    if (P.food > 0) for (const f in p.foodShape) p.foodShape[f].style.display = f === m.food ? "" : "none";
  }
  function place(m, theta, r) {
    const a = (theta - 90) * Math.PI / 180;
    m.parts.root.setAttribute("transform",
      `translate(${(CX + r * Math.cos(a)).toFixed(2)} ${(CY + r * Math.sin(a)).toFixed(2)}) rotate(${theta.toFixed(1)})`);
  }

  // ---- comportamiento ----
  const ramMax = ctx => Math.max(ctx.ram * BAR - 4, 24);
  const hopStep = ctx => { const s = 360 / Math.max(1, ctx.n); return Math.max(1, Math.round(9 / s)) * s; };
  const shortest = (from, to) => ((to - from + 540) % 360) - 180;

  function enter(m, mode, ctx, x) {
    m.mode = mode; m.t = 0;
    switch (mode) {
      case "walk": m.dur = rnd(3, 7); if (Math.random() < .4) m.dir *= -1; break;
      case "run": m.dur = rnd(2, 4); if (Math.random() < .5) m.dir *= -1; break;
      case "eat": m.dur = rnd(2.5, 4.5); m.food = pick(FOODS); break;
      case "rest": m.dur = rnd(2, 5); break;
      case "sleep": m.dur = rnd(7, 14); break;
      case "stretch": m.dur = rnd(2.2, 3.2); break;
      case "coffee": m.dur = ctx.cpu > 60 ? rnd(1.5, 2.5) : rnd(2.5, 4); break;
      case "hop":
        if (Math.random() < .4) m.dir *= -1;
        m.hop = { u: 0, n: Math.round(rnd(3, 8)), from: m.theta, to: m.theta + m.dir * hopStep(ctx) }; break;
      case "goto": m.target = x.target; m.after = x.after; break;
      case "cross": m.jump = { u: 0, r0: LANE[m.lane], r1: LANE[x.to], to: x.to, flip: Math.random() < .2 + .5 * m.mood.high }; break;
    }
  }
  // Que hacen segun la carga: flojos (dormir, estirarse) -> normales -> como locos (correr, cafe)
  const TIERS = {
    low:  { ram: { sleep: 30, walk: 20, stretch: 18, rest: 12, eat: 8, tip: 8, cross: 4 },
            cpu: { sleep: 30, walk: 20, stretch: 16, rest: 14, eat: 8, hop: 4, cross: 4 } },
    mid:  { ram: { walk: 30, eat: 16, rest: 8, tip: 12, cross: 14, run: 8, stretch: 6, coffee: 6 },
            cpu: { hop: 24, walk: 22, run: 10, eat: 14, rest: 8, cross: 12, coffee: 6, stretch: 4 } },
    high: { ram: { run: 30, coffee: 26, cross: 20, walk: 6, eat: 6, tip: 4 },
            cpu: { hop: 34, run: 30, coffee: 24, cross: 14, eat: 4 } },
  };
  const mood = cpu => {   // mezcla suave entre estados: bajo < 40 %, alto > 60 %
    const low = clamp((40 - cpu) / 20, 0, 1), high = clamp((cpu - 60) / 20, 0, 1);
    return { low, mid: 1 - low - high, high };
  };
  const speedOf = cpu => cpu <= 70 ? .3 + cpu / 100 * .9 : .93 + (cpu - 70) / 30 * 1.7;   // .3 .. 2.6

  function next(m, ctx) {
    const w = mood(ctx.cpu), tally = {};
    for (const t in TIERS) for (const k in TIERS[t][m.lane]) tally[k] = (tally[k] || 0) + w[t] * TIERS[t][m.lane][k];
    const opts = Object.entries(tally).filter(o => o[1] > 0);
    let r = Math.random() * opts.reduce((a, o) => a + o[1], 0), choice = opts[0][0];
    for (const o of opts) { if ((r -= o[1]) <= 0) { choice = o[0]; break; } }
    if (choice === "tip" && m.lane === "ram") {   // sube hasta la punta de la barra de RAM
      return enter(m, "goto", ctx, { target: ramMax(ctx), after: { mode: pick(["eat", "rest"]) } });
    }
    if (choice === "tip") choice = "cross";
    if (choice === "cross") {
      const to = m.lane === "ram" ? "cpu" : "ram";
      if (to === "ram") {   // antes de saltar, ubicarse sobre la parte llena de la barra
        const th = wrap(m.theta), hi = ramMax(ctx);
        if (th > hi) {
          const target = th - hi < (360 - th) + RAM_LO ? hi : RAM_LO;
          return enter(m, "goto", ctx, { target, after: { mode: "cross", to: "ram" } });
        }
      }
      return enter(m, "cross", ctx, { to });
    }
    enter(m, choice, ctx);
  }

  function update(m, dt, ctx) {
    m.t += dt;
    const sp = speedOf(ctx.cpu), hi = ramMax(ctx), pace = clamp(sp, .45, 1.8);
    m.mood = mood(ctx.cpu);
    let h = 0, r = LANE[m.lane];
    switch (m.mode) {
      case "walk": case "run": case "goto": {
        const run = m.mode === "run";
        const spd = (m.lane === "ram" ? 16 : 12) * sp * (run ? 2.4 : 1);   // flojo: muy lento; a tope: muy rapido
        if (m.mode === "goto") {
          const d = shortest(m.theta, m.target);
          if (Math.abs(d) <= spd * dt + .5) {
            m.theta = m.target;
            const a = m.after;
            enter(m, a.mode, ctx, a);
            break;
          }
          m.dir = Math.sign(d);
        }
        m.theta += m.dir * spd * dt; m.phase += dt * (run ? 15 : 9) * pace;
        if (m.lane === "ram") {
          if (m.theta > hi) { m.theta = hi; m.dir = -1; }
          if (m.theta < RAM_LO) { m.theta = RAM_LO; m.dir = 1; }
        }
        if (m.mode !== "goto" && m.t > m.dur) next(m, ctx);
        break;
      }
      case "hop": {
        const H = m.hop;
        H.u += dt * clamp(sp, .6, 1.9) / .45; m.phase += dt * 6;
        if (H.u >= 1) {
          m.theta = wrap(H.to);
          if (--H.n <= 0) { next(m, ctx); break; }
          H.from = m.theta; H.to = H.from + m.dir * hopStep(ctx); H.u = 0;
        } else {
          m.theta = wrap(lerp(H.from, H.to, ease(H.u)));
          h = Math.sin(Math.PI * H.u) * 7;
        }
        break;
      }
      case "cross": {
        const J = m.jump;
        J.u += dt * clamp(sp, .6, 1.5) / .8;
        const u = Math.min(1, J.u);
        r = lerp(J.r0, J.r1, ease(u)); h = Math.sin(Math.PI * u) * 11;
        m.theta = wrap(m.theta + m.dir * dt * 6);
        if (J.u >= 1) { m.lane = J.to; next(m, ctx); }
        break;
      }
      default:   // eat / rest / sleep / stretch / coffee
        m.phase += dt * 3;
        if (m.mode === "sleep" && ctx.cpu >= 45) { enter(m, "stretch", ctx); break; }   // la carga sube: despiertan
        if (m.t > m.dur) m.mode === "sleep" ? enter(m, "stretch", ctx) : next(m, ctx);
    }
    if (m.lane === "ram" && m.mode !== "cross" && m.theta > hi && m.theta < 180) m.theta = hi;
    m.theta = wrap(m.theta);
    draw(m);
    place(m, m.theta, r + h);
  }

  // ---- ciclo de animación ----
  const zoos = {};
  let ids = [], getData = () => ({}), enabled = true, raf = 0, last = 0;

  function create(ctx) {
    const species = SPECIES.slice().sort(() => Math.random() - .5).slice(0, PER_CARD);
    return species.map((sp, i) => {
      const m = { sp, pal: palette(sp), lane: i < 2 ? "ram" : "cpu", dir: Math.random() < .5 ? 1 : -1,
                  phase: rnd(0, 6), t: 0, dur: 1, mode: "rest" };
      m.mood = mood(ctx.cpu);
      m.theta = m.lane === "ram" ? rnd(RAM_LO, ramMax(ctx)) : rnd(0, 360);
      m.parts = build(m);
      next(m, ctx);
      return m;
    });
  }
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };   // replaceChildren no existe en navegadores viejos
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, Math.max(0, (now - last) / 1000)); last = now;
    if (document.hidden) return;
    const data = getData();
    for (const id of ids) {
      const d = data[id], svg = document.querySelector(`.zoo[data-id="${id}"]`);
      if (!d || !svg) continue;
      const ctx = { cpu: d.cpu, ram: d.ram, n: d.cores.length };
      const z = zoos[id] || (zoos[id] = { ms: create(ctx), svg: null });
      if (z.svg !== svg) { clear(svg); z.ms.forEach(m => svg.appendChild(m.parts.root)); z.svg = svg; }
      for (const m of z.ms) update(m, dt, ctx);
    }
  }
  function setEnabled(on) {
    enabled = on;
    if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    if (!on) {
      cancelAnimationFrame(raf); raf = 0;
      document.querySelectorAll(".zoo").forEach(clear);
      for (const id in zoos) zoos[id].svg = null;
    }
  }
  function init(machineIds, dataFn) { ids = machineIds; getData = dataFn; }

  return { init, setEnabled, SPECIES, _test: { build, palette, draw, place, enter } };
})();
