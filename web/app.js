/* ============================================================
   Poemas & Pinturas · Afinidades — app
   SPA sin dependencias: datos en data.js, render por hash.
   ============================================================ */

"use strict";

/* ---------------------- Datos e índices ---------------------- */
/* HOME: dataset ligero de inicio (metadatos + resúmenes + poemas).
   DATA: corpus completo de afinidades, se carga perezosamente con
   ensureFullData() al entrar en una ruta de detalle. */
const HOME = window.APP_DATA_HOME;
const IMG_BASE = "../corpus/paintings/";

const pintores = HOME.pintores;
const poetas = HOME.poetas;

const pintorByDir = new Map(pintores.map((p) => [p.dir, p]));
const poetaByName = new Map(poetas.map((p) => [p.name, p]));

const K = (a, b) => a + "\u0001" + b;

const SIM_STATS = HOME.simStats;
const MAX_SIM = SIM_STATS.max;
const MIN_SIM = SIM_STATS.min;
const Q1 = SIM_STATS.q1;
const Q2 = SIM_STATS.q2;
const Q3 = SIM_STATS.q3;

/* Retrato provisional idéntico para todos (sin asignar), adaptado al tema */
function avatarSVG(theme) {
  const light = theme === "light";
  const grad1 = light ? "#e4ddd0" : "#26374a";
  const grad2 = light ? "#cfc5b1" : "#171e27";
  const figure = light ? "#b5a68f" : "#3a4f66";
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' +
        grad1 +
        '"/><stop offset="1" stop-color="' +
        grad2 +
        '"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><circle cx="48" cy="37" r="17" fill="' +
        figure +
        '"/><path d="M13 88c4-16 18-24 35-24s31 8 35 24z" fill="' +
        figure +
        '"/></svg>'
    )
  );
}

function avatarSrc(poeta) {
  return poeta.profile || avatarSVG(document.documentElement.dataset.theme);
}

// Corpus completo de afinidades (carga perezosa con ensureFullData)
let DATA = null;
let dataLoading = null;

// {poeta, pintor} -> [afinidades]
let affPairs = new Map();
// {pintor, obra, poeta} -> [afinidades ordenadas desc]
let affWork = new Map();
// {poeta, p} -> mejor afinidad de ese poema (mayor sim)
let poemBest = new Map();

function initFullData() {
  affPairs = new Map();
  affWork = new Map();
  poemBest = new Map();
  for (const a of DATA.afinidades) {
    const kp = K(a.poeta, a.pintor);
    if (!affPairs.has(kp)) affPairs.set(kp, []);
    affPairs.get(kp).push(a);

    const kw = K(K(a.pintor, a.obra), a.poeta);
    if (!affWork.has(kw)) affWork.set(kw, []);
    affWork.get(kw).push(a);

    const kpb = K(a.poeta, String(a.p));
    const c = poemBest.get(kpb);
    if (!c || a.sim > c.sim) poemBest.set(kpb, a);
  }
  for (const list of affWork.values()) list.sort((x, y) => y.sim - x.sim);
}

function simLevel(sim) {
  if (sim < Q1) return { n: "Baja", c: "lvl-baja" };
  if (sim < Q2) return { n: "Media", c: "lvl-media" };
  if (sim < Q3) return { n: "Alta", c: "lvl-alta" };
  return { n: "Muy alta", c: "lvl-muy" };
}

/* ---------------------- Utilidades ---------------------- */
const $ = (sel, root) => (root || document).querySelector(sel);

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function norm(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function humanize(file) {
  return file
    .replace(/\.(jpe?g|png|gif|webp)$/i, "")
    .replace(/^\d+_/, "")
    .replace(/[_\-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function imgSrc(pintorDir, obra) {
  return IMG_BASE + pintorDir + "/" + obra;
}

function pct(sim) {
  return Math.round((sim / MAX_SIM) * 100);
}

function fmt(sim) {
  return sim.toFixed(3);
}

function fragment(text, len) {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length > len ? t.slice(0, len).trimEnd() + "…" : t;
}

function chip(label, text) {
  return '<span class="chip"><span class="dot"></span>' + esc(label) + " <b>" + esc(text) + "</b></span>";
}

function metaChips(obj) {
  return chip("Género", obj.gender) + chip("Época", obj.period) + chip("Región", obj.region);
}

/* Indicador visual de la fuerza de una métrica (escala sobre el rango observado) */
function gpos(sim) {
  const span = MAX_SIM - MIN_SIM || 1;
  return Math.max(1, Math.min(99, Math.round(((sim - MIN_SIM) / span) * 100)));
}

/* Color continuo sobre la rampa azul→naranja según la posición p (0–100) */
function rampColor(p) {
  const t = Math.max(0, Math.min(100, p)) / 100;
  const light = document.documentElement.dataset.theme === "light";
  const lo = light ? [63, 103, 140] : [91, 131, 166];
  const hi = light ? [168, 122, 51] : [209, 160, 78];
  const c = lo.map((v, i) => Math.round(v + (hi[i] - v) * t));
  return "rgb(" + c.join(",") + ")";
}

function strengthHTML(sim) {
  return (
    '<span class="strength" title="' +
    esc(simLevel(sim).n) +
    " · " +
    fmt(sim) +
    " (máx " +
    fmt(MAX_SIM) +
    ')"><span class="s-track"><span class="s-fill" style="width:' +
    gpos(sim) +
    "%;background:" +
    rampColor(gpos(sim)) +
    '"></span></span></span>'
  );
}

function backlinkHTML(href, label) {
  return '<a class="backlink" href="' + href + '"><span class="arr">&#8592;</span> ' + esc(label) + "</a>";
}

function affPoem(poetaName, p) {
  const poeta = poetaByName.get(poetaName);
  return poeta ? poeta.poems[p] : null;
}

function obraHref(pintorDir, obra, poetaName, p) {
  return (
    "#/obra/" +
    encodeURIComponent(pintorDir) +
    "/" +
    encodeURIComponent(obra) +
    "/" +
    encodeURIComponent(poetaName) +
    "/" +
    p
  );
}

function poemHref(poetaName, p) {
  return "#/poema/" + encodeURIComponent(poetaName) + "/" + p;
}

/* ---------------------- Métricas de ranking ---------------------- */
const MODES = {
  best: { label: "Mejor pareja", hint: "máx. poema×obra" },
  mean: { label: "Media", hint: "promedio poema×obra" },
  topn: { label: "Suma top-N", hint: "suma de las N mejores parejas" },
  pmean: { label: "Media mejor obra", hint: "promedio de la obra más afín por poema" },
  wmean: { label: "Media mejor poema", hint: "promedio del poema más afín por obra" },
};
const TOPN_OPTIONS = [3, 5, 10, 20, 50];

function metricValue(mode, pairs, n) {
  if (!pairs.length) return 0;
  if (mode === "best") return Math.max(...pairs.map((a) => a.sim));
  if (mode === "mean") return pairs.reduce((s, a) => s + a.sim, 0) / pairs.length;
  if (mode === "pmean" || mode === "wmean") {
    const by = new Map();
    for (const a of pairs) {
      const k = mode === "pmean" ? a.p : a.obra;
      const cur = by.get(k);
      if (!cur || a.sim > cur.sim) by.set(k, a);
    }
    let s = 0;
    for (const a of by.values()) s += a.sim;
    return s / by.size;
  }
  const top = [...pairs].sort((x, y) => y.sim - x.sim).slice(0, n || 10);
  return top.reduce((s, a) => s + a.sim, 0);
}

function getPairs(poeta, pintorDir) {
  return affPairs.get(K(poeta, pintorDir)) || [];
}

function worksFor(poeta, pintorDir) {
  const byWork = new Map();
  for (const a of getPairs(poeta, pintorDir)) {
    const cur = byWork.get(a.obra);
    if (!cur || a.sim > cur.sim) byWork.set(a.obra, a);
  }
  return [...byWork.values()].sort((x, y) => y.sim - x.sim);
}

function rankPainters(poetaName, mode, n) {
  return pintores
    .map((pintor) => {
      const pairs = getPairs(poetaName, pintor.dir);
      return {
        pintor,
        value: metricValue(mode, pairs, n),
        works: worksFor(poetaName, pintor.dir),
      };
    })
    .sort((a, b) => b.value - a.value);
}

function rankPoets(pintorDir, mode, n) {
  return poetas
    .map((poeta) => {
      const pairs = getPairs(poeta.name, pintorDir);
      return {
        poeta,
        value: metricValue(mode, pairs, n),
        works: worksFor(poeta.name, pintorDir),
      };
    })
    .sort((a, b) => b.value - a.value);
}

/* Mejores parejas (una por obra, la del poema más afín) */
function poetTopPairs(poetaName, limit) {
  const byWork = new Map();
  for (const a of DATA.afinidades) {
    if (a.poeta !== poetaName) continue;
    const k = K(a.pintor, a.obra);
    const cur = byWork.get(k);
    if (!cur || a.sim > cur.sim) byWork.set(k, a);
  }
  return [...byWork.values()].sort((x, y) => y.sim - x.sim).slice(0, limit || 3);
}

function painterTopPairs(pintorDir, limit) {
  const byWork = new Map();
  for (const a of DATA.afinidades) {
    if (a.pintor !== pintorDir) continue;
    const k = K(a.pintor, a.obra);
    const cur = byWork.get(k);
    if (!cur || a.sim > cur.sim) byWork.set(k, a);
  }
  return [...byWork.values()].sort((x, y) => y.sim - x.sim).slice(0, limit || 3);
}

/* ---------------------- Estado persistente ---------------------- */
const LS = {
  theme: "pp_theme",
  mode: "pp_mode",
  n: "pp_topn",
  filters: "pp_filters",
  pfilters: "pp_pfilters",
  poemsview: "pp_poemsview",
  worksview: "pp_worksview",
  binview: "pp_binview",
};
function loadLS(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch (e) {
    return d;
  }
}
function saveLS(k, v) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
}
let orderMode = loadLS(LS.mode, "best");
let orderN = loadLS(LS.n, 10);
let filters = loadLS(LS.filters, { q: "", gender: "", region: "", period: "" });
let pfilters = loadLS(LS.pfilters, { q: "", gender: "", region: "", period: "" });

/* ---------------------- Tema claro / oscuro ---------------------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $("#theme-toggle");
  if (btn) {
    const next = theme === "light" ? "dark" : "light";
    btn.textContent = theme === "light" ? "\u263e" : "\u2600";
    btn.setAttribute("aria-label", next === "light" ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
    btn.title = next === "light" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  }
  document.querySelectorAll("img.avatar, img.avatar-lg").forEach((img) => {
    if (img.getAttribute("src") && img.getAttribute("src").indexOf("data:image/svg+xml") === 0) {
      img.src = avatarSVG(theme);
    }
  });
}

function initTheme() {
  let t = loadLS(LS.theme, null);
  if (t !== "light" && t !== "dark") {
    t = window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  applyTheme(t);
  const btn = $("#theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      saveLS(LS.theme, next);
      applyTheme(next);
    });
  }
}

/* ---------------------- Router ---------------------- */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  if (!h) return [];
  return h.split("/").filter(Boolean).map(decodeURIComponent);
}

function route(fn) {
  return function (parts) {
    fn(parts);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
}

/* ---------------------- Carga perezosa del corpus ---------------------- */
function parseDataText(text) {
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

function loadDataScript() {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "data.js.gz";
    s.onload = () => {
      DATA = window.APP_DATA;
      initFullData();
      resolve(DATA);
    };
    s.onerror = () => reject(new Error("No se pudo cargar data.js"));
    document.head.appendChild(s);
  });
}

function ensureFullData() {
  if (DATA) return Promise.resolve(DATA);
  if (dataLoading) return dataLoading;
  dataLoading = fetch("data.js.gz")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    })
    .then((t) => {
      DATA = parseDataText(t);
      initFullData();
      dataLoading = null;
      return DATA;
    })
    .catch((err) => {
      dataLoading = null;
      return loadDataScript();
    });
  return dataLoading;
}

function showLoading() {
  $("#app").innerHTML =
    '<div class="container"><div class="loading"><span class="spinner"></span>' +
    '<p class="l-title">Cargando afinidades…</p>' +
    '<p class="l-sub">Es la primera vez en una página de detalle: se descarga el corpus completo. Solo ocurre una vez.</p>' +
    "</div></div>";
}

function renderLoadError(err) {
  $("#app").innerHTML =
    '<div class="container"><div class="empty"><div class="big">&#9888;</div>' +
    "No se pudo cargar el corpus de afinidades. Recarga la página e inténtalo de nuevo.</div></div>";
}

const NEEDS_FULL = { poeta: true, pintor: true, obra: true, poema: true, poemas: true };

function render() {
  const parts = parseHash();
  const root = parts[0] || "poetas";

  const nav = { poetas: false, pintores: false, poemas: false };
  if (root === "poetas" || root === "poeta") nav.poetas = true;
  if (root === "pintores" || root === "pintor") nav.pintores = true;
  if (root === "poemas") nav.poemas = true;
  document.querySelectorAll(".main-nav a").forEach((a) => {
    a.classList.toggle("active", nav[a.dataset.nav]);
  });

  const fn = ROUTES[root] || renderNotFound;
  if (NEEDS_FULL[root] && !DATA) {
    showLoading();
    ensureFullData()
      .then(() => fn(parts))
      .catch((err) => {
        renderLoadError(err);
        window.scrollTo({ top: 0, behavior: "instant" });
      });
  } else {
    fn(parts);
  }
}

const ROUTES = {
  poetas: route(renderPoets),
  pintores: route(renderPainters),
  poemas: route(renderPoemasPage),
  poeta: route(renderPoetRoute),
  pintor: route(renderPainterRoute),
  obra: route(renderObraRoute),
  poema: route(renderPoemaRoute),
  buscar: route(renderBuscarRoute),
};

window.addEventListener("hashchange", render);

/* ---------------------- Tarjetas reutilizables ---------------------- */
function poemCardHTML(o) {
  const t1 = o.t1Html != null ? o.t1Html : esc(o.t1);
  return (
    '<a class="poem-card" href="' +
    o.href +
    '"><span class="frame"><img loading="lazy" src="' +
    o.img +
    '" alt=""></span><span class="body"><span class="pt">' +
    t1 +
    '</span><span class="meta">' +
    esc(o.t2) +
    '</span><span class="frag">' +
    esc(o.frag) +
    '</span><span class="foot">' +
    strengthHTML(o.sim) +
    '<span class="sim">' +
    fmt(o.sim) +
    "</span></span></span></a>"
  );
}

function pairCardHTML(o) {
  const t1 = o.t1Html != null ? o.t1Html : esc(o.t1);
  return (
    '<a class="pair-card" href="' +
    o.href +
    '"><img class="thumb" loading="lazy" src="' +
    o.img +
    '" alt=""><span class="body"><span class="t1">' +
    t1 +
    '</span><span class="t2">' +
    esc(o.t2) +
    '</span><span class="frag">' +
    esc(o.frag) +
    '</span></span><span class="side"><span class="sim">' +
    fmt(o.sim) +
    "</span>" +
    strengthHTML(o.sim) +
    "</span></a>"
  );
}

function workCardHTML(o) {
  return (
    '<a class="work-card" href="' +
    o.href +
    '"><span class="frame"><img loading="lazy" src="' +
    o.img +
    '" alt=""></span><span class="body"><span class="title">' +
    esc(o.title) +
    '</span><span class="sub">' +
    esc(o.sub) +
    "</span>" +
    (o.meta ? '<span class="meta">' + esc(o.meta) + "</span>" : "") +
    '<span class="frag">' +
    esc(o.frag) +
    '</span><span class="foot">' +
    strengthHTML(o.sim) +
    '<span class="badge">' +
    fmt(o.sim) +
    "</span></span></span></a>"
  );
}

function pairRow(a) {
  const pintor = pintorByDir.get(a.pintor);
  const pm = affPoem(a.poeta, a.p);
  return (
    '<a class="pair-row" href="' +
    obraHref(a.pintor, a.obra, a.poeta, a.p) +
    '"><img class="pthumb" loading="lazy" src="' +
    imgSrc(a.pintor, a.obra) +
    '" alt=""><span class="ptext"><span class="pt-line">' +
    esc(pm.title) +
    '</span><span class="pp-line">' +
    esc(humanize(a.obra)) +
    " &#183; " +
    esc(pintor.name) +
    '</span></span><span class="pval">' +
    strengthHTML(a.sim) +
    "<b>" +
    fmt(a.sim) +
    "</b></span></a>"
  );
}

/* ---------------------- Render: Poetas (inicio) ---------------------- */
function renderPoets(caretPos) {
  const app = $("#app");
  const genders = [...new Set(poetas.map((p) => p.gender))].sort();
  const regions = [...new Set(poetas.map((p) => p.region))].sort();
  const periods = [...new Set(poetas.map((p) => p.period))].sort();

  let list = poetas.filter((p) => {
    if (filters.q && !norm(p.name).includes(norm(filters.q))) return false;
    if (filters.gender && p.gender !== filters.gender) return false;
    if (filters.region && p.region !== filters.region) return false;
    if (filters.period && p.period !== filters.period) return false;
    return true;
  });

  const opt = (val) => '<option value="' + esc(val) + '">' + esc(val) + "</option>";
  const emptyOpt = '<option value="">Todos</option>';

  const cards = list
    .map((poeta) => {
      const meanRows = (poeta.topPainters || [])
        .map((r) => {
          const v = r.best != null ? r.best : r.value;
          return (
            '<a class="pair-row" href="#/poeta/' +
            encodeURIComponent(poeta.name) +
            "/" +
            encodeURIComponent(r.dir) +
            '"><span class="ptext"><span class="pt-line">' +
            esc(r.name) +
            '</span></span><span class="pval">' +
            strengthHTML(v) +
            "<b>" +
            fmt(v) +
            "</b></span></a>"
          );
        })
        .join("");
      const pairRows = (poeta.topPairs || []).map(pairRow).join("");
      return (
        '<div class="entity-card" data-href="#/poeta/' +
        encodeURIComponent(poeta.name) +
        '"><div class="card-top"><div class="card-id"><h3 class="name">' +
        esc(poeta.name) +
        "</h3>" +
        chip("Poemas", poeta.poems.length) +
        '</div><img class="avatar" src="' +
        avatarSrc(poeta) +
        '" alt=""></div><div class="meta-line"><span class="meta-inline">' +
        esc(poeta.gender) +
        " · " +
        esc(poeta.period) +
        " · " +
        esc(poeta.region) +
        "</span></div>" +
        (meanRows
          ? '<div class="pairs"><div class="pairs-title">Pintores afines · Media mejor obra</div>' +
            meanRows +
            "</div>"
          : "") +
        (pairRows
          ? '<div class="pairs"><div class="pairs-title">Mejores parejas poema&#8596;obra</div>' +
            pairRows +
            "</div>"
          : "") +
        "</div>"
      );
    })
    .join("");

  app.innerHTML =
    '<div class="container">' +
    '<div class="view-head">' +
    '<h1 class="page-title">🪶 Poetas</h1>' +
    '<p class="page-sub">Elige una voz y descubre con qué pinturas y obras guarda mayor afinidad, calculada con el modelo Jina-CLIP v2.</p>' +
    "</div>" +
    '<div class="filter-bar">' +
    '<span class="search"><span class="icon">&#9906;</span><input id="f-q" type="search" placeholder="Buscar poeta…" value="' +
    esc(filters.q) +
    '"><button type="button" id="f-q-clear" class="clear-search" aria-label="Limpiar búsqueda"' +
    (filters.q ? "" : " hidden") +
    ">&#10005;</button></span>" +
    '<select id="f-gender" class="select" aria-label="Filtrar por género">' +
    emptyOpt +
    genders.map((g) => opt(g)).join("") +
    "</select>" +
    '<select id="f-region" class="select" aria-label="Filtrar por región">' +
    emptyOpt +
    regions.map((r) => opt(r)).join("") +
    "</select>" +
    '<select id="f-period" class="select" aria-label="Filtrar por época">' +
    emptyOpt +
    periods.map((p) => opt(p)).join("") +
    '</select><span class="count">' +
    list.length +
    " de " +
    poetas.length +
    "</span></div>" +
    (list.length
      ? '<div class="entity-grid">' + cards + "</div>"
      : '<div class="empty"><div class="big">&#9881;</div>Ningún poeta coincide con los filtros.</div>') +
    "</div>";

  const q = $("#f-q");
  const bind = (id, key) => {
    const el = $("#" + id);
    el.value = filters[key] || "";
    el.addEventListener("change", () => {
      filters[key] = el.value;
      saveLS(LS.filters, filters);
      renderPoets();
    });
  };
  bind("f-gender", "gender");
  bind("f-region", "region");
  bind("f-period", "period");
  q.addEventListener("input", () => {
    const caret = q.selectionStart;
    filters.q = q.value;
    saveLS(LS.filters, filters);
    renderPoets(caret);
  });
  $("#f-q-clear").addEventListener("click", () => {
    filters.q = "";
    saveLS(LS.filters, filters);
    renderPoets();
  });

  if (caretPos != null) {
    const nq = $("#f-q");
    if (nq) {
      nq.focus();
      try {
        nq.setSelectionRange(caretPos, caretPos);
      } catch (e) {}
    }
  }

  bindCards();
}

/* ---------------------- Render: Pintores (inverso) ---------------------- */
function pintorCard(pintor) {
  const meanRows = (pintor.topPoets || [])
    .map((r) => {
      const v = r.best != null ? r.best : r.value;
      return (
        '<a class="pair-row" href="#/pintor/' +
        encodeURIComponent(pintor.dir) +
        "/" +
        encodeURIComponent(r.name) +
        '"><span class="ptext"><span class="pt-line">' +
        esc(r.name) +
        '</span></span><span class="pval">' +
        strengthHTML(v) +
        "<b>" +
        fmt(v) +
        "</b></span></a>"
      );
    })
    .join("");
  const pairRows = (pintor.topPairs || [])
    .map((a) => {
      const pm = affPoem(a.poeta, a.p);
      const poet = poetaByName.get(a.poeta);
      return (
        '<a class="pair-row" href="' +
        obraHref(a.pintor, a.obra, a.poeta, a.p) +
        '"><img class="pthumb" loading="lazy" src="' +
        imgSrc(a.pintor, a.obra) +
        '" alt=""><span class="ptext"><span class="pt-line">' +
        esc(humanize(a.obra)) +
        '</span><span class="pp-line">“' +
        esc(pm.title) +
        "” &#183; " +
        esc(poet.name) +
        "</span></span><span class=\"pval\">" +
        strengthHTML(a.sim) +
        "<b>" +
        fmt(a.sim) +
        "</b></span></a>"
      );
    })
    .join("");
  return (
    '<div class="entity-card" data-href="#/pintor/' +
    encodeURIComponent(pintor.dir) +
    '"><div class="cover"><img loading="lazy" src="' +
    imgSrc(pintor.dir, pintor.works[0]) +
    '" alt=""></div><div class="card-top"><div class="card-id"><h3 class="name">' +
    esc(pintor.name) +
    '</h3></div></div><div class="meta-line">' +
    chip("Obras", pintor.works.length) +
    '<span class="meta-inline">' +
    esc(pintor.gender) +
    " · " +
    esc(pintor.period) +
    " · " +
    esc(pintor.region) +
    "</span></div>" +
    (meanRows
      ? '<div class="pairs"><div class="pairs-title">Poetas afines · Media mejor poema</div>' +
        meanRows +
        "</div>"
      : "") +
    (pairRows
      ? '<div class="pairs"><div class="pairs-title">Mejores parejas poema&#8596;obra</div>' +
        pairRows +
        "</div>"
      : "") +
    "</div>"
  );
}

function renderPainters(caretPos) {
  const app = $("#app");
  const genders = [...new Set(pintores.map((p) => p.gender))].sort();
  const regions = [...new Set(pintores.map((p) => p.region))].sort();
  const periods = [...new Set(pintores.map((p) => p.period))].sort();

  let list = pintores.filter((p) => {
    if (pfilters.q && !norm(p.name).includes(norm(pfilters.q))) return false;
    if (pfilters.gender && p.gender !== pfilters.gender) return false;
    if (pfilters.region && p.region !== pfilters.region) return false;
    if (pfilters.period && p.period !== pfilters.period) return false;
    return true;
  });

  const opt = (val) => '<option value="' + esc(val) + '">' + esc(val) + "</option>";
  const emptyOpt = '<option value="">Todos</option>';
  const cards = list.map(pintorCard).join("");

  app.innerHTML =
    '<div class="container">' +
    '<div class="view-head"><h1 class="page-title">🎨 Pintores</h1>' +
    '<p class="page-sub">Explora el camino inverso: elige un artista y descubre qué poetas resuenan más con su obra.</p></div>' +
    '<div class="filter-bar">' +
    '<span class="search"><span class="icon">&#9906;</span><input id="fp-q" type="search" placeholder="Buscar pintor…" value="' +
    esc(pfilters.q) +
    '"><button type="button" id="fp-q-clear" class="clear-search" aria-label="Limpiar búsqueda"' +
    (pfilters.q ? "" : " hidden") +
    ">&#10005;</button></span>" +
    '<select id="fp-gender" class="select" aria-label="Filtrar por género">' +
    emptyOpt +
    genders.map((g) => opt(g)).join("") +
    "</select>" +
    '<select id="fp-region" class="select" aria-label="Filtrar por región">' +
    emptyOpt +
    regions.map((r) => opt(r)).join("") +
    "</select>" +
    '<select id="fp-period" class="select" aria-label="Filtrar por época">' +
    emptyOpt +
    periods.map((p) => opt(p)).join("") +
    '</select><span class="count">' +
    list.length +
    " de " +
    pintores.length +
    "</span></div>" +
    (list.length
      ? '<div class="entity-grid">' + cards + "</div>"
      : '<div class="empty"><div class="big">&#9881;</div>Ningún pintor coincide con los filtros.</div>') +
    "</div>";

  const q = $("#fp-q");
  const bind = (id, key) => {
    const el = $("#" + id);
    el.value = pfilters[key] || "";
    el.addEventListener("change", () => {
      pfilters[key] = el.value;
      saveLS(LS.pfilters, pfilters);
      renderPainters();
    });
  };
  bind("fp-gender", "gender");
  bind("fp-region", "region");
  bind("fp-period", "period");
  q.addEventListener("input", () => {
    const caret = q.selectionStart;
    pfilters.q = q.value;
    saveLS(LS.pfilters, pfilters);
    renderPainters(caret);
  });
  $("#fp-q-clear").addEventListener("click", () => {
    pfilters.q = "";
    saveLS(LS.pfilters, pfilters);
    renderPainters();
  });

  if (caretPos != null) {
    const nq = $("#fp-q");
    if (nq) {
      nq.focus();
      try {
        nq.setSelectionRange(caretPos, caretPos);
      } catch (e) {}
    }
  }

  bindCards();
}

/* ---------------------- Selector de métrica ---------------------- */
function effMode(modes) {
  return modes.indexOf(orderMode) >= 0 ? orderMode : modes[0];
}

function metricToolbar(containerId, modes) {
  modes = modes || ["best", "mean", "topn"];
  const active = effMode(modes);
  return (
    '<div class="toolbar" id="' +
    containerId +
    '"><span class="toolbar-label">Orden por</span>' +
    '<div class="seg" role="group" aria-label="Modo de ordenación">' +
    modes
      .map(
        (m) =>
          '<button data-mode="' +
          m +
          '" title="' +
          MODES[m].hint +
          '" class="' +
          (active === m ? "active" : "") +
          '">' +
          MODES[m].label +
          "</button>"
      )
      .join("") +
    '</div>' +
    '<span class="toolbar-label" id="' +
    containerId +
    '-nlabel" style="' +
    (active === "topn" ? "" : "display:none") +
    '">N</span>' +
    '<select id="' +
    containerId +
    '-n" class="select" aria-label="Tamaño de N" style="' +
    (active === "topn" ? "" : "display:none") +
    '">' +
    TOPN_OPTIONS.map(
      (o) => '<option value="' + o + '"' + (o === orderN ? " selected" : "") + ">" + o + "</option>"
    ).join("") +
    '</select><span class="hint">' +
    MODES[active].hint +
    "</span></div>"
  );
}

function bindMetricToolbar(containerId, onchange) {
  const wrap = $("#" + containerId);
  if (!wrap) return;
  wrap.querySelectorAll(".seg button").forEach((b) =>
    b.addEventListener("click", () => {
      orderMode = b.dataset.mode;
      saveLS(LS.mode, orderMode);
      onchange();
    })
  );
  const nsel = $("#" + containerId + "-n");
  const nlabel = $("#" + containerId + "-nlabel");
  nsel.addEventListener("change", () => {
    orderN = parseInt(nsel.value, 10);
    saveLS(LS.n, orderN);
    onchange();
  });
  if (orderMode === "topn") {
    nsel.style.display = "";
    nlabel.style.display = "";
  }
}

/* ---------------------- Selector de vista (lista / fichas) ---------------------- */
function subbar(count, storeKey, refresh, view) {
  return (
    '<div class="subbar"><span class="count">' +
    count +
    '</span><div class="viewtoggle" role="group" aria-label="Vista">' +
    '<button data-view="wide"' +
    (view === "wide" ? ' class="active"' : "") +
    '>Lista</button>' +
    '<button data-view="grid"' +
    (view === "grid" ? ' class="active"' : "") +
    '>Fichas</button></div></div>'
  );
}

function bindViewToggle(storeKey, refresh) {
  $("#app").querySelectorAll(".viewtoggle button").forEach((b) =>
    b.addEventListener("click", () => {
      saveLS(storeKey, b.dataset.view);
      refresh();
    })
  );
}

/* ---------------------- Render: detalle de poeta ---------------------- */
function renderPoetRoute(parts) {
  const name = parts[1] || "";
  if (parts.length >= 3) {
    const seg = parts[2];
    if (pintorByDir.has(seg)) return renderWorks(name, seg);
    if (seg === "poemas" || seg === "obras" || seg === "pintores") return renderPoet(name, seg);
  }
  renderPoet(name, "poemas");
}

function renderPoet(name, tab) {
  const poeta = poetaByName.get(name);
  const app = $("#app");
  if (!poeta) return renderNotFound();

  const T = [
    ["poemas", "Poemas"],
    ["obras", "Asociaciones"],
    ["pintores", "Pintores"],
  ];
  const tabs =
    '<div class="tabs">' +
    T.map(
      (t) =>
        '<button class="tab' +
        (t[0] === tab ? " active" : "") +
        '" data-tab="' +
        t[0] +
        '">' +
        t[1] +
        "</button>"
    ).join("") +
    "</div>";

  let body = "";
  if (tab === "obras") body = poetObrasTab(poeta);
  else if (tab === "pintores") body = poetPintoresTab(poeta);
  else body = poetPoemasTab(poeta);

  app.innerHTML =
    '<div class="container">' +
    backlinkHTML("#/poetas", "Todos los poetas") +
    '<div class="view-head"><div class="head-line"><img class="avatar avatar-lg" src="' +
    avatarSrc(poeta) +
    '" alt=""><div><h1 class="page-title">' +
    esc(poeta.name) +
    '</h1><span class="chips">' +
    metaChips(poeta) +
    '<span class="chip">Poemas <b>' +
    poeta.poems.length +
    "</b></span></span></div></div></div>" +
    tabs +
    body +
    "</div>";

  app.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => {
      location.hash = "#/poeta/" + encodeURIComponent(name) + "/" + b.dataset.tab;
    })
  );
  if (tab === "pintores") bindMetricToolbar("mt-poeta", () => renderPoet(name, "pintores"));
  else bindViewToggle(tab === "obras" ? "pp_worksview" : "pp_poemsview", () => renderPoet(name, tab));
  bindCards();
}

function poetPoemasTab(poeta) {
  const view = loadLS(LS.poemsview, "grid");
  const list = poeta.poems
    .map((pm, i) => ({ pm, i, ba: poemBest.get(K(poeta.name, String(i))) }))
    .sort((x, y) => (y.ba ? y.ba.sim : -1) - (x.ba ? x.ba.sim : -1));
  const items = list
    .map(({ pm, i, ba }) => {
      const img = ba ? imgSrc(ba.pintor, ba.obra) : "";
      const t2 = ba ? pintorByDir.get(ba.pintor).name + " · " + humanize(ba.obra) : "";
      const sim = ba ? ba.sim : 0;
      const href = "#/poema/" + encodeURIComponent(poeta.name) + "/" + i;
      const o = { img, t1: pm.title, t2, frag: fragment(pm.text, 260), sim, href };
      return view === "wide" ? pairCardHTML(o) : poemCardHTML(o);
    })
    .join("");
  return (
    subbar(poeta.poems.length + " poemas", "pp_poemsview", () => renderPoet(poeta.name, "poemas"), view) +
    '<div class="' +
    (view === "wide" ? "poem-list" : "poem-grid") +
    '">' +
    items +
    "</div>"
  );
}

function poetObrasTab(poeta) {
  const view = loadLS(LS.worksview, "grid");
  const pairs = poetTopPairs(poeta.name, 60);
  const items = pairs
    .map((a) => {
      const pintor = pintorByDir.get(a.pintor);
      const pm = affPoem(a.poeta, a.p);
      const o = {
        img: imgSrc(a.pintor, a.obra),
        frag: fragment(pm.text, 260),
        sim: a.sim,
        href: obraHref(a.pintor, a.obra, a.poeta, a.p),
      };
      return view === "wide"
        ? pairCardHTML({ ...o, t1: pm.title, t2: pintor.name + " · " + humanize(a.obra) })
        : poemCardHTML({ ...o, t1: pm.title, t2: pintor.name + " · " + humanize(a.obra) });
    })
    .join("");
  return (
    subbar(pairs.length + " binomios", "pp_worksview", () => renderPoet(poeta.name, "obras"), view) +
    '<div class="' +
    (view === "wide" ? "poem-list" : "poem-grid") +
    '">' +
    items +
    "</div>"
  );
}

function painterRankCard(r, i, maxV, poetaName, mode) {
  const best = r.works[0];
  return (
    '<div class="rank-card" data-href="#/poeta/' +
    encodeURIComponent(poetaName) +
    "/" +
    encodeURIComponent(r.pintor.dir) +
    '">' +
    '<span class="pos' +
    (i === 0 ? " top" : "") +
    '">' +
    (i + 1) +
    "</span>" +
    '<img class="thumb" loading="lazy" src="' +
    (best ? imgSrc(r.pintor.dir, best.obra) : "") +
    '" alt="">' +
    '<div class="info"><h3 class="name">' +
    esc(r.pintor.name) +
    '</h3><div class="meta">' +
    esc(r.pintor.period) +
    " · " +
    esc(r.pintor.region) +
    " · <b>" +
    r.works.length +
    " obras</b></div></div>" +
    '<div class="score"><span class="hint">' +
    esc(MODES[mode].hint) +
    '</span><span class="value">' +
    fmt(r.value) +
    "</span>" +
    strengthHTML(r.value) +
    "</div></div>"
  );
}

function poetPintoresTab(poeta) {
  const mode = effMode(["pmean", "mean", "topn"]);
  const ranking = rankPainters(poeta.name, mode, orderN);
  const maxV = ranking.length ? ranking[0].value : 1;
  const cards = ranking.map((r, i) => painterRankCard(r, i, maxV, poeta.name, mode)).join("");
  return metricToolbar("mt-poeta", ["pmean", "mean", "topn"]) + '<div class="rank-list">' + cards + "</div>";
}

/* ---------------------- Render: detalle de pintor ---------------------- */
function renderPainterRoute(parts) {
  const dir = parts[1] || "";
  if (parts.length >= 3) {
    const seg = parts[2];
    if (seg === "obras" || seg === "asociaciones" || seg === "poetas") return renderPainter(dir, seg);
    return renderWorks(seg, dir);
  }
  renderPainter(dir, "obras");
}

function poetRankCard(r, i, maxV, pintorDir, mode) {
  const best = r.works[0];
  return (
    '<div class="rank-card" data-href="#/pintor/' +
    encodeURIComponent(pintorDir) +
    "/" +
    encodeURIComponent(r.poeta.name) +
    '">' +
    '<span class="pos' +
    (i === 0 ? " top" : "") +
    '">' +
    (i + 1) +
    "</span>" +
    '<img class="thumb" loading="lazy" src="' +
    (best ? imgSrc(pintorDir, best.obra) : "") +
    '" alt="">' +
    '<div class="info"><h3 class="name">' +
    esc(r.poeta.name) +
    '</h3><div class="meta">' +
    esc(r.poeta.period) +
    " · " +
    esc(r.poeta.region) +
    " · <b>" +
    r.poeta.poems.length +
    " poemas</b></div></div>" +
    '<div class="score"><span class="hint">' +
    esc(MODES[mode].hint) +
    '</span><span class="value">' +
    fmt(r.value) +
    "</span>" +
    strengthHTML(r.value) +
    "</div></div>"
  );
}

function renderPainter(dir, tab) {
  const pintor = pintorByDir.get(dir);
  const app = $("#app");
  if (!pintor) return renderNotFound();

  const T = [
    ["obras", "Obras"],
    ["asociaciones", "Asociaciones"],
    ["poetas", "Poetas"],
  ];
  const tabs =
    '<div class="tabs">' +
    T.map(
      (t) =>
        '<button class="tab' +
        (t[0] === tab ? " active" : "") +
        '" data-tab="' +
        t[0] +
        '">' +
        t[1] +
        "</button>"
    ).join("") +
    "</div>";

  let body = "";
  if (tab === "asociaciones") body = painterAsocTab(pintor);
  else if (tab === "poetas") body = painterPoetasTab(pintor);
  else body = painterObrasTab(pintor);

  app.innerHTML =
    '<div class="container">' +
    backlinkHTML("#/pintores", "Todos los pintores") +
    '<div class="view-head"><div class="head-line"><img class="avatar avatar-lg" src="' +
    avatarSVG(document.documentElement.dataset.theme) +
    '" alt=""><div><h1 class="page-title">' +
    esc(pintor.name) +
    '</h1><span class="chips">' +
    metaChips(pintor) +
    '<span class="chip">Obras <b>' +
    pintor.works.length +
    "</b></span></span></div></div></div>" +
    tabs +
    body +
    "</div>";

  app.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => {
      location.hash = "#/pintor/" + encodeURIComponent(dir) + "/" + b.dataset.tab;
    })
  );
  if (tab === "poetas") bindMetricToolbar("mt-pintor", () => renderPainter(dir, "poetas"));
  else bindViewToggle(tab === "asociaciones" ? "pp_pasocview" : "pp_pobrasview", () => renderPainter(dir, tab));
  bindCards();
}

function painterObrasTab(pintor) {
  const view = loadLS("pp_pobrasview", "grid");
  const pairs = painterTopPairs(pintor.dir, 60);
  const items = pairs
    .map((a) => {
      const pm = affPoem(a.poeta, a.p);
      const poet = poetaByName.get(a.poeta);
      const o = {
        img: imgSrc(a.pintor, a.obra),
        frag: fragment(pm.text, 260),
        sim: a.sim,
        href: obraHref(a.pintor, a.obra, a.poeta, a.p),
      };
      return view === "wide"
        ? pairCardHTML({ ...o, t1: humanize(a.obra), t2: poet.name + " · " + pm.title })
        : poemCardHTML({ ...o, t1: humanize(a.obra), t2: poet.name + " · " + pm.title });
    })
    .join("");
  return (
    subbar(pairs.length + " obras", "pp_pobrasview", () => renderPainter(pintor.dir, "obras"), view) +
    '<div class="' +
    (view === "wide" ? "poem-list" : "poem-grid") +
    '">' +
    items +
    "</div>"
  );
}

function painterAsocTab(pintor) {
  const view = loadLS("pp_pasocview", "grid");
  const byPoem = new Map();
  for (const a of DATA.afinidades) {
    if (a.pintor !== pintor.dir) continue;
    const k = K(a.poeta, String(a.p));
    const c = byPoem.get(k);
    if (!c || a.sim > c.sim) byPoem.set(k, a);
  }
  const pairs = [...byPoem.values()].sort((x, y) => y.sim - x.sim).slice(0, 60);
  const items = pairs
    .map((a) => {
      const pm = affPoem(a.poeta, a.p);
      const poet = poetaByName.get(a.poeta);
      const o = {
        img: imgSrc(a.pintor, a.obra),
        frag: fragment(pm.text, 260),
        sim: a.sim,
        href: obraHref(a.pintor, a.obra, a.poeta, a.p),
      };
      return view === "wide"
        ? pairCardHTML({ ...o, t1: humanize(a.obra), t2: poet.name + " · " + pm.title })
        : poemCardHTML({ ...o, t1: humanize(a.obra), t2: poet.name + " · " + pm.title });
    })
    .join("");
  return (
    subbar(pairs.length + " binomios", "pp_pasocview", () => renderPainter(pintor.dir, "asociaciones"), view) +
    '<div class="' +
    (view === "wide" ? "poem-list" : "poem-grid") +
    '">' +
    items +
    "</div>"
  );
}

function painterPoetasTab(pintor) {
  const mode = effMode(["wmean", "mean", "topn"]);
  const ranking = rankPoets(pintor.dir, mode, orderN);
  const maxV = ranking.length ? ranking[0].value : 1;
  const cards = ranking.map((r, i) => poetRankCard(r, i, maxV, pintor.dir, mode)).join("");
  return metricToolbar("mt-pintor", ["wmean", "mean", "topn"]) + '<div class="rank-list">' + cards + "</div>";
}

/* ---------------------- Galería (binomio poeta × pintor) ---------------------- */
function renderWorks(poetaName, pintorDir) {
  const poeta = poetaByName.get(poetaName);
  const pintor = pintorByDir.get(pintorDir);
  const app = $("#app");
  if (!poeta || !pintor) return renderNotFound();

  const fromPoet = location.hash.indexOf("#/poeta/") === 0;
  const view = loadLS(LS.binview, "grid");
  const allPairs = getPairs(poeta.name, pintorDir) || [];
  const mean = allPairs.length ? allPairs.reduce((s, a) => s + a.sim, 0) / allPairs.length : 0;

  let items = "";
  let count = 0;
  if (fromPoet) {
    const byPoem = new Map();
    for (const a of allPairs) {
      const c = byPoem.get(a.p);
      if (!c || a.sim > c.sim) byPoem.set(a.p, a);
    }
    const list = [...byPoem.values()].sort((x, y) => y.sim - x.sim);
    count = list.length;
    items = list
      .map((a) => {
        const pm = poeta.poems[a.p];
        const o = {
          img: imgSrc(pintorDir, a.obra),
          frag: fragment(pm.text, 260),
          sim: a.sim,
          href: poemHref(poeta.name, a.p),
        };
        return view === "wide"
          ? pairCardHTML({ ...o, t1: pm.title, t2: pintor.name + " · " + humanize(a.obra) })
          : poemCardHTML({ ...o, t1: pm.title, t2: pintor.name + " · " + humanize(a.obra) });
      })
      .join("");
  } else {
    const works = worksFor(poeta.name, pintorDir);
    count = works.length;
    items = works
      .map((w) => {
        const pm = poeta.poems[w.p];
        const o = {
          img: imgSrc(pintorDir, w.obra),
          frag: fragment(pm.text, 260),
          sim: w.sim,
          href: obraHref(pintorDir, w.obra, poeta.name, w.p),
        };
        return view === "wide"
          ? pairCardHTML({ ...o, t1: humanize(w.obra), t2: poeta.name + " · " + pm.title })
          : poemCardHTML({ ...o, t1: humanize(w.obra), t2: poeta.name + " · " + pm.title });
      })
      .join("");
  }

  const left = fromPoet ? poeta : pintor;
  const right = fromPoet ? pintor : poeta;
  const crumb = fromPoet
    ? '<a href="#/poetas">🪶 Poetas</a><span class="sep">/</span><a href="#/poeta/' +
      encodeURIComponent(poeta.name) +
      '">' +
      esc(poeta.name) +
      '</a><span class="sep">/</span><a href="#/pintores">🎨 Pintores</a><span class="sep">/</span><a href="#/pintor/' +
      encodeURIComponent(pintorDir) +
      '">' +
      esc(pintor.name) +
      "</a>"
    : '<a href="#/pintores">🎨 Pintores</a><span class="sep">/</span><a href="#/pintor/' +
      encodeURIComponent(pintorDir) +
      '">' +
      esc(pintor.name) +
      '</a><span class="sep">/</span><a href="#/poetas">🪶 Poetas</a><span class="sep">/</span><a href="#/poeta/' +
      encodeURIComponent(poeta.name) +
      '">' +
      esc(poeta.name) +
      "</a>";

  app.innerHTML =
    '<div class="container">' +
    '<nav class="breadcrumbs">' +
    crumb +
    "</nav>" +
    '<div class="view-head"><h1 class="page-title">' +
    esc(left.name) +
    ' <span style="color:var(--text-faint)">&#8596;</span> ' +
    esc(right.name) +
    '</h1><span class="chips">' +
    '<span class="chip"><span class="dot"></span>Media <b>' +
    fmt(mean) +
    "</b></span>" +
    '<span class="chip">' +
    count +
    " parejas</span>" +
    "</span></div>" +
    subbar(
      count + (fromPoet ? " poemas" : " obras"),
      "pp_binview",
      () => renderWorks(poetaName, pintorDir),
      view
    ) +
    (items
      ? '<div class="' + (view === "wide" ? "poem-list" : "poem-grid") + '">' + items + "</div>"
      : '<div class="empty"><div class="big">&#9672;</div>No hay afinidades registradas para esta pareja.</div>') +
    "</div>";

  bindViewToggle("pp_binview", () => renderWorks(poetaName, pintorDir));
  bindCards();
}

/* ---------------------- Detalle obra (vertical) ---------------------- */
function renderObraRoute(parts) {
  if (parts.length < 5) return renderNotFound();
  renderObra(parts[1], parts[2], parts[3], parseInt(parts[4], 10));
}

function renderObra(pintorDir, obra, poetaName, p) {
  const pintor = pintorByDir.get(pintorDir);
  const poeta = poetaByName.get(poetaName);
  const app = $("#app");
  if (!pintor || !poeta) return renderNotFound();

  const all = affWork.get(K(K(pintorDir, obra), poetaName)) || [];
  if (!all.length) return renderNotFound();
  const cur = all.find((a) => a.p === p) || all[0];
  const sim = cur.sim;
  const pm = poeta.poems[cur.p];
  const lvl = simLevel(sim);

  const works = worksFor(poetaName, pintorDir);
  const idx = works.findIndex((w) => w.obra === obra);
  const prev = idx > 0 ? works[idx - 1] : null;
  const next = idx < works.length - 1 ? works[idx + 1] : null;
  const workHref = (w) => obraHref(pintorDir, w.obra, poetaName, w.p);

  const opts = all
    .slice(0, 8)
    .map(
      (a) =>
        '<button class="opt' +
        (a.p === cur.p ? " active" : "") +
        '" data-poeta="' +
        esc(poetaName) +
        '" data-p="' +
        a.p +
        '">' +
        esc(poeta.poems[a.p].title) +
        " <small>" +
        fmt(a.sim) +
        "</small></button>"
    )
    .join("");

  const bestPerPoem = new Map();
  for (const a of DATA.afinidades) {
    if (a.pintor !== pintorDir || a.obra !== obra) continue;
    const k = K(a.poeta, String(a.p));
    const c = bestPerPoem.get(k);
    if (!c || a.sim > c.sim) bestPerPoem.set(k, a);
  }
  const globalAll = [...bestPerPoem.values()].sort((x, y) => y.sim - x.sim).slice(0, 8);
  const globalOpts = globalAll
    .map((a) => {
      const gpm = affPoem(a.poeta, a.p);
      const gpoet = poetaByName.get(a.poeta);
      return (
        '<button class="opt' +
        (a.p === cur.p && a.poeta === poetaName ? " active" : "") +
        '" data-poeta="' +
        esc(a.poeta) +
        '" data-p="' +
        a.p +
        '">' +
        esc(gpm.title) +
        " <small>&#183; " +
        esc(gpoet ? gpoet.name : a.poeta) +
        " &#183; " +
        fmt(a.sim) +
        "</small></button>"
      );
    })
    .join("");

  const paintingNav =
    '<nav class="painting-nav">' +
    (prev
      ? '<a class="prev" href="' +
        workHref(prev) +
        '"><img loading="lazy" src="' +
        imgSrc(pintorDir, prev.obra) +
        '" alt=""><span><span class="dir">Anterior obra</span><span class="t">' +
        esc(humanize(prev.obra)) +
        "</span></span></a>"
      : '<a class="disabled prev"><span><span class="dir">Anterior obra</span></span></a>') +
    (next
      ? '<a class="next" href="' +
        workHref(next) +
        '"><img loading="lazy" src="' +
        imgSrc(pintorDir, next.obra) +
        '" alt=""><span><span class="dir">Siguiente obra</span><span class="t">' +
        esc(humanize(next.obra)) +
        "</span></span></a>"
      : '<a class="disabled next"><span><span class="dir">Siguiente obra</span></span></a>') +
    "</nav>";

  app.innerHTML =
    '<div class="container container-narrow">' +
    '<nav class="breadcrumbs"><a href="#/poetas">Poetas</a><span class="sep">/</span><a href="#/poeta/' +
    encodeURIComponent(poetaName) +
    '">' +
    esc(poetaName) +
    '</a><span class="sep">/</span><a href="#/poeta/' +
    encodeURIComponent(poetaName) +
    "/" +
    encodeURIComponent(pintorDir) +
    '">' +
    esc(pintor.name) +
    "</a></nav>" +
    '<div class="view-head"><h1 class="page-title">' +
    esc(humanize(obra)) +
    '</h1><span class="chips">' +
    chip("Pintor", pintor.name) +
    chip("Poeta", poeta.name) +
    chip("Afín", fmt(sim)) +
    "</span></div>" +
    '<div class="painting-stage"><img src="' +
    imgSrc(pintorDir, obra) +
    '" alt="' +
    esc(humanize(obra)) +
    '"></div>' +
    '<div class="cap"><span class="pname">' +
    esc(pintor.name) +
    '</span><span class="wtitle">' +
    esc(humanize(obra)) +
    "</span></div>" +
    gaugeHTML(pm, poeta.name, sim, lvl) +
    '<section class="panel" style="margin-top:36px"><p class="poem-kicker">' +
    esc(poeta.name) +
    '</p><h2 class="poem-title">' +
    esc(pm.title) +
    '</h2><p class="poem-year">' +
    (pm.year ? esc(pm.year) : "") +
    '</p><pre class="poem-text">' +
    esc(pm.text) +
    "</pre></section>" +
    '<section style="margin-top:34px"><div class="poem-switch"><div class="label">Otros poemas afines a esta obra · ' +
    esc(poeta.name) +
    '</div><div class="opts">' +
    opts +
    "</div></div></section>" +
    (globalOpts
      ? '<section style="margin-top:34px"><div class="poem-switch"><div class="label">Poemas más afines · todos los poetas</div><div class="opts">' +
        globalOpts +
        "</div></div></section>"
      : "") +
    paintingNav +
    "</div>";

  app.querySelectorAll(".opts").forEach((el) =>
    el.addEventListener("click", (e) => {
      const b = e.target.closest(".opt");
      if (!b) return;
      location.hash = obraHref(pintorDir, obra, b.dataset.poeta, parseInt(b.dataset.p, 10));
    })
  );
}

/* ---------------------- Poema + afinidades ---------------------- */
function renderPoemaRoute(parts) {
  if (parts.length < 3) return renderNotFound();
  renderPoema(parts[1], parseInt(parts[2], 10));
}

function gaugeHTML(pm, poetaName, sim, lvl) {
  return (
    '<div class="gauge"><div class="glabel"><span class="glabel-text">Afinidad con “' +
    esc(pm.title) +
    '” de ' +
    esc(poetaName) +
    '</span><span class="gmetric">' +
    fmt(sim) +
    " <small>de máx " +
    fmt(MAX_SIM) +
    "</small></span><span class=\"lvl " +
    lvl.c +
    '">' +
    lvl.n +
    '</span></div><div class="gbar"><div class="gfill" style="width:' +
    pct(sim) +
    "%;background:" +
    rampColor(pct(sim)) +
    '"></div></div></div>'
  );
}

function heroArtHTML(a, poetaName) {
  const pintor = pintorByDir.get(a.pintor);
  const pm = affPoem(a.poeta, a.p);
  const lvl = simLevel(a.sim);
  return (
    '<a class="hero-stage" href="' +
    obraHref(a.pintor, a.obra, a.poeta, a.p) +
    '"><div class="painting-stage"><img src="' +
    imgSrc(a.pintor, a.obra) +
    '" alt=""></div><div class="cap"><span class="pname">' +
    esc(pintor.name) +
    '</span><span class="wtitle">' +
    esc(humanize(a.obra)) +
    "</span></div>" +
    gaugeHTML(pm, poetaName, a.sim, lvl) +
    "</a>"
  );
}

function renderPoema(poetaName, p) {
  const poeta = poetaByName.get(poetaName);
  const app = $("#app");
  if (!poeta || !poeta.poems[p]) return renderNotFound();
  const pm = poeta.poems[p];

  const affs = DATA.afinidades
    .filter((a) => a.poeta === poetaName && a.p === p)
    .sort((x, y) => y.sim - x.sim);
  const best = affs[0];
  const shown = affs.slice(0, 10);

  const rows = shown
    .map((a) => {
      const pintor = pintorByDir.get(a.pintor);
      return (
        '<div class="aff-row" data-href="' +
        obraHref(a.pintor, a.obra, poetaName, p) +
        '"><img class="thumb" loading="lazy" src="' +
        imgSrc(a.pintor, a.obra) +
        '" alt=""><div class="t"><span class="pn">' +
        esc(pintor.name) +
        '</span> <span class="pm">' +
        esc(humanize(a.obra)) +
        '</span></div><div class="v">' +
        strengthHTML(a.sim) +
        '<span class="val">' +
        fmt(a.sim) +
        "</span></div></div>"
      );
    })
    .join("");

  const order = poeta.poems
    .map((_, i) => ({ p: i, ba: poemBest.get(K(poetaName, String(i))) }))
    .sort((x, y) => (y.ba ? y.ba.sim : -1) - (x.ba ? x.ba.sim : -1))
    .map((o) => o.p);
  const pIdx = order.indexOf(p);
  const prev = pIdx > 0 ? { p: order[pIdx - 1] } : null;
  const next = pIdx >= 0 && pIdx < order.length - 1 ? { p: order[pIdx + 1] } : null;
  const prevBest = prev ? poemBest.get(K(poetaName, String(prev.p))) : null;
  const nextBest = next ? poemBest.get(K(poetaName, String(next.p))) : null;
  const poemNav =
    '<nav class="poem-nav">' +
    (prev
      ? '<a class="prev" href="#/poema/' +
        encodeURIComponent(poetaName) +
        "/" +
        prev.p +
        '">' +
        (prevBest
          ? '<img loading="lazy" src="' + imgSrc(prevBest.pintor, prevBest.obra) + '" alt="">'
          : "") +
        '<span><span class="dir">Anterior poema</span><span class="t">' +
        esc(poeta.poems[prev.p].title) +
        "</span></span></a>"
      : '<a class="disabled prev"><span><span class="dir">Anterior poema</span></span></a>') +
    (next
      ? '<a class="next" href="#/poema/' +
        encodeURIComponent(poetaName) +
        "/" +
        next.p +
        '">' +
        (nextBest
          ? '<img loading="lazy" src="' + imgSrc(nextBest.pintor, nextBest.obra) + '" alt="">'
          : "") +
        '<span><span class="dir">Siguiente poema</span><span class="t">' +
        esc(poeta.poems[next.p].title) +
        "</span></span></a>"
      : '<a class="disabled next"><span><span class="dir">Siguiente poema</span></span></a>') +
    "</nav>";

  app.innerHTML =
    '<div class="container container-narrow">' +
    backlinkHTML("#/poeta/" + encodeURIComponent(poetaName), poetaName) +
    '<div class="view-head"><p class="poem-kicker">' +
    esc(poeta.name) +
    '</p><h1 class="page-title">' +
    esc(pm.title) +
    '</h1><p class="poem-year" style="color:var(--text-dim)">' +
    (pm.year ? esc(pm.year) : "") +
    "</p></div>" +
    (best ? heroArtHTML(best, poetaName) : "") +
    '<pre class="poem-text" style="margin-bottom:34px">' +
    esc(pm.text) +
    "</pre>" +
    poemNav +
    '<h2 style="font-family:var(--font-serif);font-weight:400;font-size:20px;margin:34px 0 14px">Obras más afines · ' +
    shown.length +
    "</h2>" +
    (rows ? '<div class="aff-list">' + rows + "</div>" : '<div class="empty">Sin afinidades.</div>') +
    "</div>";

  bindCards();
}

/* ---------------------- Página: mejores parejas globales ---------------------- */
function renderPoemasPage() {
  const app = $("#app");
  const view = loadLS("pp_poemaspageview", "wide");
  const top = [...DATA.afinidades].sort((x, y) => y.sim - x.sim).slice(0, 100);
  const items = top
    .map((a) => {
      const pm = affPoem(a.poeta, a.p);
      const pintor = pintorByDir.get(a.pintor);
      const poet = poetaByName.get(a.poeta);
      const t1Html =
        '<span class="poem-t">' +
        esc(pm.title) +
        '</span><span class="poem-by">' +
        esc(poet.name) +
        "</span>";
      const o = {
        img: imgSrc(a.pintor, a.obra),
        t1Html,
        t2: pintor.name + " · " + humanize(a.obra),
        frag: fragment(pm.text, 260),
        sim: a.sim,
        href: "#/poema/" + encodeURIComponent(a.poeta) + "/" + a.p,
      };
      return view === "wide" ? pairCardHTML(o) : poemCardHTML(o);
    })
    .join("");

  app.innerHTML =
    '<div class="container">' +
    '<div class="view-head"><h1 class="page-title">📜 Poemas</h1>' +
    '<p class="page-sub">Los binomios poema&#8596;obra con mayor coincidencia en todo el corpus.</p></div>' +
    subbar(top.length + " binomios", "pp_poemaspageview", () => renderPoemasPage(), view) +
    '<div class="' +
    (view === "wide" ? "poem-list" : "poem-grid") +
    '">' +
    items +
    "</div></div>";

  bindViewToggle("pp_poemaspageview", () => renderPoemasPage());
  bindCards();
}

/* ---------------------- Búsqueda ---------------------- */
function renderBuscarRoute(parts) {
  const q = (parts[1] || "").trim();
  const input = $("#global-search-input");
  if (input) {
    input.value = q;
    const clear = $("#global-search-clear");
    if (clear) clear.hidden = !q;
  }
  renderBuscar(q);
}

function renderBuscar(q) {
  const app = $("#app");
  if (!q) {
    app.innerHTML =
      '<div class="container"><div class="empty"><div class="big">&#9906;</div>Escribe un término en el buscador para localizarlo en los poemas.</div></div>';
    return;
  }

  const nq = norm(q);
  const results = [];
  for (const poeta of poetas) {
    for (let i = 0; i < poeta.poems.length; i++) {
      const pm = poeta.poems[i];
      if (norm(pm.title).includes(nq) || norm(pm.text).includes(nq)) {
        results.push({ poeta, p: i, pm });
      }
    }
  }

  const byPoet = new Map();
  for (const r of results) {
    if (!byPoet.has(r.poeta.name)) byPoet.set(r.poeta.name, []);
    byPoet.get(r.poeta.name).push(r);
  }

  const groups = [...byPoet.values()]
    .map((list) => {
      const rows = list
        .map((r) => {
          const pos = norm(r.pm.text).indexOf(nq);
          let snip = "";
          if (pos >= 0) {
            const start = Math.max(0, pos - 70);
            const len = Math.min(r.pm.text.length - start, 170);
            snip = (start > 0 ? "…" : "") + esc(r.pm.text.slice(start, start + len)) + (start + len < r.pm.text.length ? "…" : "");
            snip = highlight(snip, q);
          }
          return (
            '<a class="poem-row" href="#/poema/' +
            encodeURIComponent(r.poeta.name) +
            "/" +
            r.p +
            '"><p class="pt">' +
            esc(r.pm.title) +
            '</p><p class="py">' +
            (r.pm.year ? esc(r.pm.year) : "") +
            '</p><p class="snip">' +
            snip +
            "</p></a>"
          );
        })
        .join("");
      const name = list[0].poeta.name;
      return (
        '<div class="result-group"><h2 class="ghead">' +
        esc(name) +
        " <small>" +
        list.length +
        " coincidencia" +
        (list.length > 1 ? "s" : "") +
        "</small></h2>" +
        rows +
        "</div>"
      );
    })
    .join("");

  app.innerHTML =
    '<div class="container">' +
    '<div class="view-head"><h1 class="page-title">Resultados para “' +
    esc(q) +
    '”</h1><p class="page-sub">' +
    results.length +
    " poema" +
    (results.length === 1 ? "" : "s") +
    " encontrado" +
    (results.length === 1 ? "" : "s") +
    "</p></div>" +
    (groups
      ? groups
      : '<div class="empty"><div class="big">&#9888;</div>Sin coincidencias en los poemas cargados.</div>') +
    "</div>";
}

function highlight(text, q) {
  const escQ = esc(q);
  const re = new RegExp(escQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
  return text.replace(re, (m) => "<mark>" + m + "</mark>");
}

/* ---------------------- 404 ---------------------- */
function renderNotFound() {
  $("#app").innerHTML =
    '<div class="container"><div class="empty"><div class="big">&#10060;</div>Ruta no encontrada. <a href="#/poetas">Volver al inicio</a>.</div></div>';
}

/* ---------------------- Delegación de clics en tarjetas ---------------------- */
function bindCards() {
  const app = $("#app");
  if (app.dataset.bound === "1") return;
  app.dataset.bound = "1";
  app.addEventListener("click", (e) => {
    if (e.target.closest("a[href]")) return;
    const el = e.target.closest("[data-href]");
    if (el) location.hash = el.dataset.href;
  });
}

/* ---------------------- Arranque ---------------------- */
function boot() {
  initTheme();
  $("#footer-meta").textContent =
    HOME.meta.afinidades + " afinidades · " + pintores.length + " pintores · " + poetas.length + " poetas";
  const ginput = $("#global-search-input");
  const gclear = $("#global-search-clear");
  gclear.addEventListener("click", () => {
    ginput.value = "";
    gclear.hidden = true;
    ginput.focus();
  });
  ginput.addEventListener("input", () => {
    gclear.hidden = !ginput.value;
  });
  $("#global-search").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = ginput.value.trim();
    location.hash = q ? "#/buscar/" + encodeURIComponent(q) : "#/poetas";
  });
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
