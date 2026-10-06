// =================================================================
// OF MICE AND MEN — REVISION NOTES
// Single source of truth: data/of_mice_and_men_notes.json
// Your own notes / quotes / diagrams: Firebase Realtime Database (omam/)
// =================================================================

import { firebaseConfig, DB_ROOT } from "./firebase-config.js";

const DATA_URL = "data/of_mice_and_men_notes.json";
const CACHE_KEY = "omam-notes-cache-v1";
const FIREBASE_VERSION = "10.7.0";

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)");
const NARROW = window.matchMedia("(max-width: 760px)");
const reduced = () => REDUCED_MOTION.matches;

const COLOURS = {
  george: "#2F6B4F", lennie: "#D29A2B", candy: "#9A7B4F", crooks: "#4A4E8C",
  curley: "#A93F2E", wife: "#C2385F", slim: "#2F7E86", boss: "#6E5A2E",
  nature: "#3E7A5A", bunkhouse: "#7A6E62",
};
const SWATCHES = ["#2A5DB0", "#2F6B4F", "#D29A2B", "#A93F2E", "#4A4E8C", "#2F7E86", "#C2385F", "#6E5A2E", "#7A6E62"];
const MINE = "#2A5DB0";
const KINDS = { quote: "Quote", point: "Point", context: "Context" };
const ARC = 44; // px: how far the top/bottom nodes tuck in towards the hub

const SECTION = {
  home: "Home", exam: "Exam essentials", characters: "Characters", settings: "Settings",
  incidents: "Incidents", notes: "Notes & Quotes", paragraphs: "Paragraphs", diagram: "Characters",
};

const state = {
  data: null,
  notes: {},      // { targetKey: { noteId: { text, kind, createdAt } } }
  diagrams: {},   // { id: { name, tagline, bookPage, colour, createdAt } }
  index: [],
  route: null,
  pendingJump: null,
  dirty: false,   // notes changed while a form was open
  filter: "all",
  quiz: { score: 0, asked: 0, item: null, done: false },
  connected: null,
};

// -----------------------------------------------------------------
// Tiny helpers
// -----------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s) => esc(s).replace(/"/g, "&quot;");
const safeColour = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : MINE);
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const QUOTE_RE = /(["“])([^"”]+?)(["”])/g;
const hasQuote = (t) => /["“][^"”]+["”]/.test(String(t ?? ""));
const isContext = (t) => String(t ?? "").trim().startsWith("★");
const firstQuote = (t) => { const m = String(t ?? "").match(/["“]([^"”]+)["”]/); return m ? m[1] : null; };
const bookRef = (p) => (p ? `<span class="pref">Book p.${esc(p)}</span>` : "");

/** Render a note string with the notebook conventions: "quotes" highlighted, ★ context, [p.X] → Book p.X */
function fmt(text, { kind } = {}) {
  let raw = String(text ?? "").trim();
  let ctx = kind === "context";
  if (raw.startsWith("★")) { ctx = true; raw = raw.slice(1).trim(); }
  let s = esc(raw);
  // quotes first, then page refs — the chip markup contains double quotes of its own
  let k = 0;
  s = s.replace(QUOTE_RE, (m, o, q, c) => `<mark class="hl" style="--k:${k++}">${o}${q}${c}</mark>`);
  s = s.replace(/\[p\.\s*([^\]]+)\]/g, (m, p) => `<span class="pref">Book p.${p}</span>`);
  if (kind === "quote" && k === 0) s = `<mark class="hl">“${s}”</mark>`;
  if (ctx) s = `<span class="star">★</span> ${s}`;
  return s;
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 2200);
}

function banner(msg) {
  const el = $("#banner");
  if (!msg) { el.hidden = true; return; }
  el.textContent = msg;
  el.hidden = false;
}

// -----------------------------------------------------------------
// Storage: Firebase Realtime Database (same project as the rest of
// the site) with a localStorage mirror so notes show instantly.
// -----------------------------------------------------------------
const store = {
  fb: null,
  offlineTimer: null,

  async init() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached) { state.notes = cached.notes || {}; state.diagrams = cached.diagrams || {}; }
    } catch { /* ignore a bad cache */ }

    try {
      const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
      const [{ initializeApp }, dbm] = await Promise.all([
        import(`${base}/firebase-app.js`),
        import(`${base}/firebase-database.js`),
      ]);
      const app = initializeApp(firebaseConfig);
      const db = dbm.getDatabase(app);
      this.fb = { db, ...dbm };

      dbm.onValue(dbm.ref(db, `${DB_ROOT}/notes`), (snap) => {
        state.notes = snap.val() || {};
        this.cache();
        onNotesChanged();
      });
      dbm.onValue(dbm.ref(db, `${DB_ROOT}/diagrams`), (snap) => {
        state.diagrams = snap.val() || {};
        this.cache();
        onNotesChanged();
      });
      dbm.onValue(dbm.ref(db, ".info/connected"), (snap) => {
        const on = snap.val() === true;
        state.connected = on;
        clearTimeout(this.offlineTimer);
        if (on) banner(null);
        else this.offlineTimer = setTimeout(() => banner("Offline — notes you add now are kept on this device and will sync when you're back online."), 5000);
      });
    } catch (err) {
      console.warn("Firebase unavailable, using this device only", err);
      this.fb = null;
      banner("Couldn't reach the notes database — notes you add are saved on this device only.");
    }
  },

  cache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ notes: state.notes, diagrams: state.diagrams })); } catch { /* storage full or blocked */ }
  },

  newId() {
    if (this.fb) return this.fb.push(this.fb.ref(this.fb.db, DB_ROOT)).key;
    return "local-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  async saveNote(target, id, patch) {
    const bucket = (state.notes[target] = state.notes[target] || {});
    bucket[id] = { ...(bucket[id] || {}), ...patch };
    this.cache();
    if (this.fb) await this.fb.update(this.fb.ref(this.fb.db, `${DB_ROOT}/notes/${target}/${id}`), patch);
  },

  async deleteNote(target, id) {
    if (state.notes[target]) { delete state.notes[target][id]; if (!Object.keys(state.notes[target]).length) delete state.notes[target]; }
    this.cache();
    if (this.fb) await this.fb.remove(this.fb.ref(this.fb.db, `${DB_ROOT}/notes/${target}/${id}`));
  },

  async saveDiagram(id, diagram) {
    state.diagrams[id] = { ...(state.diagrams[id] || {}), ...diagram };
    this.cache();
    if (this.fb) await this.fb.update(this.fb.ref(this.fb.db, `${DB_ROOT}/diagrams/${id}`), diagram);
  },

  async deleteDiagram(id) {
    delete state.diagrams[id];
    delete state.notes[`diagram_${id}`];
    this.cache();
    if (this.fb) {
      await this.fb.remove(this.fb.ref(this.fb.db, `${DB_ROOT}/diagrams/${id}`));
      await this.fb.remove(this.fb.ref(this.fb.db, `${DB_ROOT}/notes/diagram_${id}`));
    }
  },
};

function userNotes(target) {
  const bucket = state.notes[target] || {};
  return Object.keys(bucket)
    .map((id) => ({ id, target, ...bucket[id] }))
    .filter((n) => typeof n.text === "string" && n.text.trim())
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function customDiagrams() {
  return Object.keys(state.diagrams)
    .map((id) => ({ id, ...state.diagrams[id] }))
    .filter((d) => typeof d.name === "string" && d.name.trim())
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function onNotesChanged() {
  if (!state.data) return;
  buildIndex();
  if ($(".note-form")) { state.dirty = true; return; }
  if (state.route) render({ animate: false });
}

// -----------------------------------------------------------------
// Subjects (characters, settings, custom diagrams) share one shape
// -----------------------------------------------------------------
function subjectFor(kind, id) {
  const d = state.data;
  if (kind === "characters") {
    const c = d.characters.find((x) => x.id === id);
    return c && { kind, id: c.id, key: `char_${c.id}`, name: c.name, tagline: c.tagline, bookPage: c.bookPage, nodes: c.nodes, colour: COLOURS[c.id] || MINE, mine: false, route: `#/characters/${c.id}` };
  }
  if (kind === "settings") {
    const s = d.settings.find((x) => x.id === id);
    return s && { kind, id: s.id, key: `setting_${s.id}`, name: s.name, tagline: s.tagline, bookPage: s.bookPage, nodes: s.nodes, colour: COLOURS[s.id] || MINE, mine: false, route: `#/settings/${s.id}` };
  }
  if (kind === "diagram") {
    const g = state.diagrams[id];
    return g && { kind, id, key: `diagram_${id}`, name: g.name, tagline: g.tagline || "", bookPage: g.bookPage || "", nodes: [], colour: safeColour(g.colour), mine: true, route: `#/diagram/${id}` };
  }
  return null;
}

// -----------------------------------------------------------------
// Search index — rebuilt whenever the notes change
// -----------------------------------------------------------------
function buildIndex() {
  const d = state.data;
  const idx = [];
  const add = (o) => idx.push({ ...o, isQuote: o.kind === "quote" || hasQuote(o.text), isContext: o.kind === "context" || isContext(o.text), lc: String(o.text).toLowerCase() });
  const addMine = (target, route, section, group, colour) =>
    userNotes(target).forEach((n) => add({ id: `u-${n.id}`, route, section, group, text: n.text, kind: n.kind, mine: true, colour }));

  d.assessmentObjectives.forEach((ao) => ao.points.forEach((p, i) =>
    add({ id: `ao-${ao.ao}-${i}`, route: "#/exam", section: "Exam essentials", group: ao.ao, text: p, colour: COLOURS.boss })));

  d.characters.forEach((c) => {
    const route = `#/characters/${c.id}`;
    c.nodes.forEach((t, i) => add({ id: `n-char_${c.id}-${i}`, route, section: "Characters", group: c.name, text: t, colour: COLOURS[c.id] }));
    addMine(`char_${c.id}`, route, "Characters", c.name, COLOURS[c.id]);
  });

  d.settings.forEach((s) => {
    const route = `#/settings/${s.id}`;
    s.nodes.forEach((t, i) => add({ id: `n-setting_${s.id}-${i}`, route, section: "Settings", group: s.name, text: t, colour: COLOURS[s.id] }));
    addMine(`setting_${s.id}`, route, "Settings", s.name, COLOURS[s.id]);
  });

  customDiagrams().forEach((g) => addMine(`diagram_${g.id}`, `#/diagram/${g.id}`, "My diagrams", g.name, safeColour(g.colour)));

  d.incidents.forEach((inc) => {
    const route = `#/incidents/${inc.id}`;
    add({ id: `inc-${inc.id}-what`, route, section: "Incidents", group: inc.title, text: inc.what, colour: COLOURS.curley });
    (inc.notes || []).forEach((t, i) => add({ id: `inc-${inc.id}-n${i}`, route, section: "Incidents", group: inc.title, text: t, colour: COLOURS.curley }));
    if (inc.para) add({ id: `inc-${inc.id}-para`, route, section: "Incidents", group: `${inc.title} — paragraph`, text: `${inc.para_title}: ${inc.para}`, colour: COLOURS.curley });
    addMine(`incident_${inc.id}`, route, "Incidents", inc.title, COLOURS.curley);
  });

  d.notesAndQuotes.forEach((pg) => {
    const route = `#/notes/${pg.page}`;
    pg.items.forEach((t, i) => add({ id: `nq-${pg.page}-${i}`, route, section: "Notes & Quotes", group: `Book p.${pg.page}`, text: t, colour: COLOURS.lennie }));
    addMine(`notes_${pg.page}`, route, "Notes & Quotes", `Book p.${pg.page}`, COLOURS.lennie);
  });
  addMine("notes_mine", "#/notes/mine", "Notes & Quotes", "My own notes", MINE);

  d.paragraphs.forEach((p) => {
    const route = `#/paragraphs/${p.id}`;
    add({ id: `para-${p.id}-text`, route, section: "Paragraphs", group: p.title, text: p.text, colour: COLOURS.george });
    if (p.feedback) {
      const fb = [p.feedback.mark, p.feedback.comment, p.feedback.target].filter(Boolean).join(" — ");
      add({ id: `para-${p.id}-fb`, route, section: "Paragraphs", group: `${p.title} — feedback`, text: fb, colour: COLOURS.george });
    }
    addMine(`para_${p.id}`, route, "Paragraphs", p.title, COLOURS.george);
  });

  state.index = idx;
}

// -----------------------------------------------------------------
// Router + page transitions
// -----------------------------------------------------------------
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, "");
  const [page = "", sub = ""] = h.split("/").map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  return { page: page || "home", sub };
}

let navToken = 0;
async function navigate() {
  const r = parseRoute();
  const prev = state.route;
  const samePage = prev && prev.page === r.page && (["incidents", "notes", "paragraphs"].includes(r.page) || prev.sub === r.sub);
  state.route = r;
  setActiveNav(r.page);

  const view = $("#view");
  const token = ++navToken;
  if (!samePage && prev && !reduced()) {
    view.classList.remove("is-entering");
    view.classList.add("is-leaving");
    await wait(150);
    if (token !== navToken) return;
    view.classList.remove("is-leaving");
  }
  render({ animate: !samePage });
  if (!samePage) {
    view.classList.remove("is-entering");
    void view.offsetWidth;
    view.classList.add("is-entering");
  }
  const jump = state.pendingJump || (["incidents", "notes", "paragraphs"].includes(r.page) && r.sub ? routeTargetId(r) : null);
  state.pendingJump = null;
  if (jump) requestAnimationFrame(() => jumpTo(jump));
  else if (!samePage) window.scrollTo({ top: 0, behavior: "auto" });
}

function routeTargetId(r) {
  if (r.page === "incidents") return `inc-${r.sub}`;
  if (r.page === "notes") return `nq-${r.sub}`;
  if (r.page === "paragraphs") return `para-${r.sub}`;
  return null;
}

function setActiveNav(page) {
  const key = page === "diagram" ? "characters" : page;
  $$("#nav a").forEach((a) => a.classList.toggle("is-active", a.dataset.nav === key));
}

function jumpTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("is-in");
  el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1800);
}

// -----------------------------------------------------------------
// Render
// -----------------------------------------------------------------
function render({ animate = true } = {}) {
  const { page, sub } = state.route;
  const view = $("#view");
  let html = "";
  let title = SECTION[page] || "Not found";

  switch (page) {
    case "home": html = renderHome(); title = "Revision Notes"; break;
    case "exam": html = renderExam(); break;
    case "characters": {
      if (sub) { const s = subjectFor("characters", sub); html = s ? renderSpiderPage(s) : renderNotFound(); if (s) title = s.name; }
      else html = renderCharactersIndex();
      break;
    }
    case "settings": {
      if (sub) { const s = subjectFor("settings", sub); html = s ? renderSpiderPage(s) : renderNotFound(); if (s) title = s.name; }
      else html = renderSettingsIndex();
      break;
    }
    case "diagram": { const s = subjectFor("diagram", sub); html = s ? renderSpiderPage(s) : renderNotFound(); if (s) title = s.name; break; }
    case "incidents": html = renderIncidents(); break;
    case "notes": html = renderNotes(); break;
    case "paragraphs": html = renderParagraphs(); break;
    default: html = renderNotFound();
  }

  view.innerHTML = html;
  document.title = `${title} · Of Mice and Men`;
  afterRender(animate);
}

function renderNotFound() {
  return `<div class="page-head"><h1>Page not found</h1></div><p>That page isn't in the notebook. <a href="#/">Back to the cover</a>.</p>`;
}

// ---------- home / cover ----------
function renderHome() {
  const d = state.data;
  const quoteCount = state.index.filter((i) => i.isQuote).length;
  const mineCount = state.index.filter((i) => i.mine).length;
  const cards = [
    { href: "#/exam", num: "01", title: "Exam essentials", text: "AO1–AO4 and context at a glance.", count: `${d.assessmentObjectives.length} assessment objectives`, c: COLOURS.boss },
    { href: "#/characters", num: "02", title: "Characters", text: "A spider diagram for every character.", count: `${d.characters.length} characters${customDiagrams().length ? ` · ${customDiagrams().length} of mine` : ""}`, c: COLOURS.curley },
    { href: "#/settings", num: "03", title: "Settings", text: "The natural world and the bunkhouse.", count: `${d.settings.length} settings`, c: COLOURS.nature },
    { href: "#/incidents", num: "04", title: "Incidents", text: "Key moments, what happens and why it matters.", count: `${d.incidents.length} incidents`, c: COLOURS.wife },
    { href: "#/notes", num: "05", title: "Notes & Quotes", text: "The notebook pages, quote by quote.", count: `${d.notesAndQuotes.length} pages`, c: COLOURS.lennie },
    { href: "#/paragraphs", num: "06", title: "Paragraphs", text: "Model paragraphs with teacher feedback.", count: `${d.paragraphs.length} paragraphs`, c: COLOURS.george },
  ];
  return `
    <section class="cover">
      <div class="cover__inner">
        <div class="cover__eyebrow">GCSE English Literature</div>
        <h1>Of Mice <em>and</em> Men</h1>
        <p class="cover__sub">${esc(d.title.split("—")[1]?.trim() || "Revision Notes")} — John Steinbeck's novel, page by page from the exercise book.</p>
        <div class="cover__author"><span class="tag">Notes by</span> <strong>${esc(d.author)}</strong></div>
        <div class="cover__actions">
          <a class="btn btn--primary" href="#/characters">Start with the characters</a>
          <button type="button" class="btn btn--gold" data-action="quiz">Random quote quiz</button>
          <button type="button" class="btn btn--ghost" data-action="search">Search <kbd>Ctrl/⌘ K</kbd></button>
        </div>
      </div>
      <svg class="cover__sun" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="#F3D98C"/><circle cx="50" cy="50" r="26" fill="#D9A441"/></svg>
      <svg class="cover__hills" viewBox="0 0 1200 260" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 150 C 150 60, 300 60, 450 140 S 750 230, 900 150 S 1100 60, 1200 110 V260 H0Z" fill="#E9C76A"/>
        <path d="M0 190 C 200 120, 350 110, 520 180 S 820 250, 1000 180 S 1150 120, 1200 160 V260 H0Z" fill="#D9A441"/>
        <path d="M0 225 C 180 190, 360 180, 540 215 S 860 260, 1040 220 S 1160 195, 1200 210 V260 H0Z" fill="#B8862B"/>
        <path d="M0 250 C 200 236, 400 232, 600 246 S 1000 262, 1200 244 V260 H0Z" fill="#3E7A5A"/>
        <path d="M0 256 C 240 248, 420 246, 640 254 S 980 262, 1200 252 V260 H0Z" fill="#2D5C44"/>
      </svg>
    </section>

    <section class="sections">
      <div class="grid">
        ${cards.map((c) => `
          <a class="card card--link card--c section-card hl-watch" href="${c.href}" style="--c:${c.c}">
            <span class="section-card__num">${c.num}</span>
            <h3>${c.title}</h3>
            <p>${c.text}</p>
            <span class="section-card__count">${c.count}</span>
          </a>`).join("")}
      </div>
    </section>

    <section class="card hl-watch">
      <span class="eyebrow">How to read these notes</span>
      <ul class="legend" style="margin-top:8px">
        <li><mark class="hl">"double quotes"</mark> ${esc(d.conventions.quotes.replace("Text in double quotes is", "=").trim())}</li>
        <li><span class="star">★</span> ${esc(d.conventions.context.replace("Items starting with ★ are", "=").trim())}</li>
        <li><span class="pref" style="margin:0">Book p.X</span> ${esc(d.conventions.bookRef.replace("[p.X] =", "=").trim())}</li>
        <li><span class="swatch"></span> notes in blue are ones you've added yourself</li>
      </ul>
      <p class="form__hint" style="margin-top:12px">${quoteCount} quotations across the notebook${mineCount ? ` · ${mineCount} note${mineCount === 1 ? "" : "s"} of your own` : ""}.</p>
    </section>`;
}

// ---------- exam essentials ----------
function renderExam() {
  const d = state.data;
  const aoColours = [COLOURS.george, COLOURS.curley, COLOURS.slim, COLOURS.lennie];
  const ctx = state.index.filter((i) => i.isContext);
  return `
    <div class="page-head">
      <div><span class="eyebrow">Section 01</span><h1>Exam essentials</h1></div>
      <p class="lede">The four assessment objectives, and every ★ context point from the notebook gathered in one place.</p>
    </div>
    <div class="grid" style="margin-bottom:28px">
      ${d.assessmentObjectives.map((ao, a) => `
        <section class="card ao-card hl-watch" style="--c:${aoColours[a % aoColours.length]}">
          <h3>${esc(ao.ao)}</h3>
          <ul>${ao.points.map((p, i) => `<li id="ao-${attr(ao.ao)}-${i}" class="${/most examined|needed for all/i.test(p) ? "is-key" : ""}">${fmt(p)}</li>`).join("")}</ul>
        </section>`).join("")}
    </div>
    <div class="page-head">
      <div><span class="eyebrow">AO4</span><h2>Context at a glance</h2></div>
      <p class="lede">Tap any point to jump to where it sits in the notes.</p>
    </div>
    <div class="context-list">
      ${ctx.map((it) => `
        <button type="button" class="card card--link context-item hl-watch" data-action="jump" data-route="${attr(it.route)}" data-id="${attr(it.id)}" style="--c:${it.colour || MINE}">
          <span class="star">★</span>
          <span>${fmt(it.text.replace(/^★\s*/, ""))}<span class="context-item__src">${it.mine ? '<span class="tag tag--mine">Mine</span> ' : ""}${esc(it.section)} · <b style="color:${it.mine ? MINE : it.colour}">${esc(it.group)}</b></span></span>
        </button>`).join("")}
    </div>`;
}

// ---------- characters + settings indexes ----------
function subjectCard(s) {
  const n = s.nodes.length + userNotes(s.key).length;
  return `
    <a class="card card--link card--c char-card hl-watch ${s.mine ? "char-card--mine" : ""}" href="${s.route}" style="--c:${s.colour}">
      <span class="char-card__name">${esc(s.name)}</span>
      <p class="char-card__tag">${esc(s.tagline || "")}</p>
      <span class="char-card__foot"><span>${n} point${n === 1 ? "" : "s"}</span>${s.bookPage ? bookRef(s.bookPage) : (s.mine ? '<span class="tag tag--mine">Mine</span>' : "")}</span>
    </a>`;
}

function myDiagramsSection() {
  const mine = customDiagrams().map((g) => subjectFor("diagram", g.id)).filter(Boolean);
  return `
    <div class="page-head" style="margin-top:30px">
      <div><span class="eyebrow">Yours</span><h2>My spider diagrams</h2></div>
      <p class="lede">Start a blank diagram for anyone the notebook doesn't cover yet — Carlson, Whit, the barn…</p>
    </div>
    <div class="grid">
      ${mine.map(subjectCard).join("")}
      <button type="button" class="card char-card char-card--new" data-action="new-diagram"><span class="plus">+</span><span>New spider diagram</span></button>
    </div>`;
}

function renderCharactersIndex() {
  const d = state.data;
  return `
    <div class="page-head">
      <div><span class="eyebrow">Section 02</span><h1>Characters</h1></div>
      <p class="lede">One spider diagram per character. Open one to see every point drawn out from the hub — and add your own legs.</p>
    </div>
    <div class="grid">${d.characters.map((c) => subjectCard(subjectFor("characters", c.id))).join("")}</div>
    ${myDiagramsSection()}`;
}

function renderSettingsIndex() {
  const d = state.data;
  return `
    <div class="page-head">
      <div><span class="eyebrow">Section 03</span><h1>Settings</h1></div>
      <p class="lede">Where the novel happens — and how Steinbeck sets the two worlds against each other.</p>
    </div>
    <div class="grid">${d.settings.map((s) => subjectCard(subjectFor("settings", s.id))).join("")}</div>
    ${myDiagramsSection()}`;
}

// ---------- spider diagram page ----------
function mineControls(target, id, kind) {
  return `
    <span class="tag tag--mine">Mine</span><span>${esc(KINDS[kind] || "Point")}</span><span class="spacer"></span>
    <button type="button" class="icon-btn" data-action="edit-note" data-target="${attr(target)}" data-id="${attr(id)}" aria-label="Edit this note"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 14.5V17h2.5L15 7.5 12.5 5zM13.8 3.7l2.5 2.5 1.2-1.2a1 1 0 0 0 0-1.4L16.4 2.5a1 1 0 0 0-1.4 0z" fill="currentColor"/></svg></button>
    <button type="button" class="icon-btn icon-btn--danger" data-action="delete-note" data-target="${attr(target)}" data-id="${attr(id)}" aria-label="Delete this note"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6h10l-.8 11H5.8zM8 3h4l.5 2h-5zM3 5h14" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/></svg></button>`;
}

function addButton(target, label = "Add a note, quote or point") {
  return `<div class="mine-area" data-mine-area="${attr(target)}"><button type="button" class="add-btn" data-action="add-note" data-target="${attr(target)}"><span class="plus">+</span>${esc(label)}</button></div>`;
}

function renderSpiderPage(s) {
  const d = state.data;
  const siblings = s.kind === "settings"
    ? d.settings.map((x) => subjectFor("settings", x.id))
    : [...d.characters.map((x) => subjectFor("characters", x.id)), ...customDiagrams().map((g) => subjectFor("diagram", g.id))];
  const backHref = s.kind === "settings" ? "#/settings" : "#/characters";
  const backLabel = s.kind === "settings" ? "Settings" : "Characters";
  const mine = userNotes(s.key);
  const total = s.nodes.length + mine.length;

  const nodeHtml = (i, inner, extra = "", id = "") => `
    <div class="node hl-watch ${extra}" id="${id}" style="--i:${i}" data-i="${i}" data-side="${i % 2 === 0 ? "left" : "right"}">${inner}</div>`;

  const items = [
    ...s.nodes.map((t, i) => nodeHtml(i, fmt(t), isContext(t) ? "node--ctx" : "", `n-${s.key}-${i}`)),
    ...mine.map((n, j) => nodeHtml(s.nodes.length + j,
      `<div class="node__body">${fmt(n.text, { kind: n.kind })}</div><div class="node__mine-row">${mineControls(s.key, n.id, n.kind)}</div>`,
      "node--mine", `u-${n.id}`)),
  ];
  const left = items.filter((_, i) => i % 2 === 0).join("");
  const right = items.filter((_, i) => i % 2 === 1).join("");

  return `
    <div class="page-head">
      <div><a class="eyebrow" href="${backHref}">← ${backLabel}</a><h1 style="color:${s.colour}">${esc(s.name)}</h1></div>
      <div class="page-actions">
        ${s.mine ? `<button type="button" class="btn btn--ghost btn--small" data-action="delete-diagram" data-id="${attr(s.id)}">Delete diagram</button>` : ""}
        <button type="button" class="btn btn--ghost btn--small" data-action="print">Print</button>
      </div>
      <p class="lede">${esc(s.tagline || "")}${total ? ` <span class="form__hint" style="display:inline">· ${total} point${total === 1 ? "" : "s"}</span>` : ""}</p>
    </div>
    <nav class="subnav" aria-label="Other ${backLabel.toLowerCase()}">
      ${siblings.map((x) => `<a class="chip chip--c ${x.key === s.key ? "is-active" : ""}" href="${x.route}" style="--c:${x.colour}">${esc(x.name)}</a>`).join("")}
    </nav>
    <section class="spider ${s.mine ? "spider--mine" : ""}" style="--c:${s.colour}" data-key="${attr(s.key)}">
      <div class="spider__canvas">
        <svg class="spider__legs" aria-hidden="true"></svg>
        <div class="spider__col spider__col--left">${left}</div>
        <div class="spider__hub">
          <h2>${esc(s.name)}</h2>
          ${s.tagline ? `<p>${esc(s.tagline)}</p>` : ""}
          ${s.bookPage ? bookRef(s.bookPage) : (s.mine ? '<span class="tag tag--mine">My diagram</span>' : "")}
        </div>
        <div class="spider__col spider__col--right">${right}</div>
      </div>
      ${total === 0 ? `<p class="form__hint" style="text-align:center;margin-top:16px">This diagram is empty — add your first leg below.</p>` : ""}
      <div class="spider__add">${addButton(s.key, "Add a leg: note, quote or context")}</div>
    </section>`;
}

// ---------- incidents ----------
function renderIncidents() {
  const d = state.data;
  return `
    <div class="page-head">
      <div><span class="eyebrow">Section 04</span><h1>Incidents</h1></div>
      <p class="lede">The key moments in order: what happens, what the notebook says about it, and the paragraphs written on it.</p>
    </div>
    <div class="timeline">
      ${d.incidents.map((inc) => {
        const mine = userNotes(`incident_${inc.id}`);
        return `
        <article class="card incident hl-watch" id="inc-${attr(inc.id)}" style="--c:${COLOURS.curley}">
          <span class="incident__chapter">${esc(inc.chapter)}</span>
          <h2>${esc(inc.title)}</h2>
          <p class="incident__what" id="inc-${attr(inc.id)}-what">${fmt(inc.what)}</p>
          <ul class="notes-list">
            ${(inc.notes || []).map((t, i) => `<li id="inc-${attr(inc.id)}-n${i}" class="${isContext(t) ? "is-ctx" : ""}">${fmt(t)}</li>`).join("")}
            ${mine.map((n) => `<li id="u-${attr(n.id)}" class="is-mine">${fmt(n.text, { kind: n.kind })}<div class="mine-row">${mineControls(`incident_${inc.id}`, n.id, n.kind)}</div></li>`).join("")}
          </ul>
          ${inc.para ? `
            <div class="para-block hl-watch" id="inc-${attr(inc.id)}-para">
              <span class="eyebrow">Paragraph</span>
              <h3>${esc(inc.para_title)} ${bookRef(inc.para_page)}</h3>
              <p class="para-text">${fmt(inc.para)}</p>
            </div>` : ""}
          ${addButton(`incident_${inc.id}`)}
        </article>`;
      }).join("")}
    </div>`;
}

// ---------- notes & quotes ----------
function renderNotes() {
  const d = state.data;
  const pageCard = (id, title, meta, items, target) => {
    const mine = userNotes(target);
    return `
      <section class="card notes-page hl-watch" id="${attr(id)}">
        <div class="card__title"><h2>${title}</h2>${meta}</div>
        <ul class="notes-list">
          ${items}
          ${mine.map((n) => `<li id="u-${attr(n.id)}" class="is-mine">${fmt(n.text, { kind: n.kind })}<div class="mine-row">${mineControls(target, n.id, n.kind)}</div></li>`).join("")}
        </ul>
        ${addButton(target)}
      </section>`;
  };
  return `
    <div class="page-head">
      <div><span class="eyebrow">Section 05</span><h1>Notes &amp; Quotes</h1></div>
      <p class="lede">The notebook pages as written — quotations highlighted, ★ for context.</p>
    </div>
    <div class="timeline">
      ${d.notesAndQuotes.map((pg) => pageCard(`nq-${pg.page}`, esc(pg.title), bookRef(pg.page),
        pg.items.map((t, i) => `<li id="nq-${attr(pg.page)}-${i}" class="${isContext(t) ? "is-ctx" : ""}">${fmt(t)}</li>`).join(""),
        `notes_${pg.page}`)).join("")}
      ${pageCard("nq-mine", "My own notes", '<span class="tag tag--mine">Mine</span>', "", "notes_mine")}
    </div>`;
}

// ---------- paragraphs ----------
function renderParagraphs() {
  const d = state.data;
  return `
    <div class="page-head">
      <div><span class="eyebrow">Section 06</span><h1>Paragraphs</h1></div>
      <p class="lede">Practice paragraphs from the exercise book, with the feedback they got.</p>
    </div>
    <div class="timeline">
      ${d.paragraphs.map((p) => {
        const mine = userNotes(`para_${p.id}`);
        const fb = p.feedback;
        return `
        <article class="card para-card hl-watch" id="para-${attr(p.id)}" style="--c:${COLOURS.george}">
          <div class="card__title"><h2>${esc(p.title)}</h2>${bookRef(p.page)}${p.task ? `<span class="tag">${esc(p.task)}</span>` : ""}</div>
          <p class="para-text" id="para-${attr(p.id)}-text">${fmt(p.text)}</p>
          ${fb ? `
            <div class="feedback" id="para-${attr(p.id)}-fb">
              ${fb.mark ? `<span class="feedback__mark">${esc(fb.mark)}</span>` : ""}
              <span class="eyebrow">Teacher feedback</span>
              ${fb.comment ? `<p>${fmt(fb.comment)}</p>` : ""}
              ${fb.target ? `<p><strong>Target:</strong> ${fmt(fb.target)}</p>` : ""}
            </div>` : ""}
          ${mine.length ? `<ul class="notes-list" style="margin-top:12px">${mine.map((n) => `<li id="u-${attr(n.id)}" class="is-mine">${fmt(n.text, { kind: n.kind })}<div class="mine-row">${mineControls(`para_${p.id}`, n.id, n.kind)}</div></li>`).join("")}</ul>` : ""}
          ${addButton(`para_${p.id}`)}
        </article>`;
      }).join("")}
    </div>`;
}

// -----------------------------------------------------------------
// After render: spider layout, highlighter swipes
// -----------------------------------------------------------------
const spiders = new Map(); // section -> { ro, timer }

function afterRender(animate) {
  spiders.forEach((v) => { v.ro.disconnect(); clearTimeout(v.timer); });
  spiders.clear();

  $$(".spider").forEach((section) => setupSpider(section, animate && !reduced()));

  const watched = $$(".hl-watch");
  if (reduced() || !("IntersectionObserver" in window)) { watched.forEach((el) => el.classList.add("is-in")); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      io.unobserve(el);
      const spider = el.closest(".spider.is-drawing");
      const delay = spider && el.classList.contains("node") ? Number(el.dataset.i || 0) * 55 + 420 : 60;
      setTimeout(() => el.classList.add("is-in"), delay);
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -5% 0px" });
  watched.forEach((el) => io.observe(el));
}

function setupSpider(section, animate) {
  const nodes = $$(".node", section);
  if (animate) section.classList.add("is-drawing");
  layoutSpider(section, true);

  const ro = new ResizeObserver(() => layoutSpider(section, false));
  ro.observe($(".spider__canvas", section));
  const timer = setTimeout(() => {
    section.classList.remove("is-drawing");
    layoutSpider(section, false);
  }, animate ? 260 + nodes.length * 55 + 650 : 0);
  spiders.set(section, { ro, timer });
}

function layoutSpider(section, build) {
  const canvas = $(".spider__canvas", section);
  const svg = $(".spider__legs", section);
  const hub = $(".spider__hub", section);
  const nodes = $$(".node", section);
  const narrow = NARROW.matches;

  ["left", "right"].forEach((side) => {
    const col = nodes.filter((n) => n.dataset.side === side);
    const mid = (col.length - 1) / 2;
    col.forEach((el, j) => {
      const t = col.length > 1 ? (j - mid) / mid : 0;
      const dx = narrow ? 0 : Math.round(ARC * (1 - Math.sqrt(Math.max(0, 1 - t * t))));
      el.style.setProperty("--dx", `${side === "left" ? dx : -dx}px`);
    });
  });

  if (narrow) { svg.innerHTML = ""; svg.dataset.count = "0"; return; }

  const cr = canvas.getBoundingClientRect();
  const hr = hub.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${Math.max(1, cr.width)} ${Math.max(1, cr.height)}`);
  const hx = hr.left - cr.left, hy = hr.top - cr.top + hr.height / 2, hw = hr.width;

  if (svg.dataset.count !== String(nodes.length)) {
    svg.innerHTML = nodes.map((el, i) => {
      const mine = el.classList.contains("node--mine");
      return `<path style="--i:${i}" class="${mine ? "leg--mine" : ""}" d="M0,0"/><circle r="3.5" style="--i:${i}" class="${mine ? "dot--mine" : ""}"/>`;
    }).join("");
    svg.dataset.count = String(nodes.length);
  }
  const paths = $$("path", svg), dots = $$("circle", svg);

  nodes.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const left = el.dataset.side === "left";
    const ax = (left ? r.right : r.left) - cr.left;
    const ay = r.top - cr.top + r.height / 2;
    const sx = left ? hx + 6 : hx + hw - 6;
    const sy = hy + Math.max(-hr.height * 0.32, Math.min(hr.height * 0.32, (ay - hy) * 0.3));
    const c1 = sx + (ax - sx) * 0.42, c2 = ax - (ax - sx) * 0.42;
    const p = paths[i], dot = dots[i];
    if (!p) return;
    p.setAttribute("d", `M${sx.toFixed(1)},${sy.toFixed(1)} C${c1.toFixed(1)},${sy.toFixed(1)} ${c2.toFixed(1)},${ay.toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)}`);
    if (build || !p.style.getPropertyValue("--len")) p.style.setProperty("--len", p.getTotalLength().toFixed(1));
    dot.setAttribute("cx", ax.toFixed(1));
    dot.setAttribute("cy", ay.toFixed(1));
  });
}

// -----------------------------------------------------------------
// Adding / editing your own notes
// -----------------------------------------------------------------
function closeNoteForm() {
  const form = $(".note-form");
  if (!form) return;
  const hidden = form.previousElementSibling;
  if (hidden && hidden.dataset.hiddenForEdit) { hidden.hidden = false; delete hidden.dataset.hiddenForEdit; }
  const area = form.closest("[data-mine-area]");
  form.remove();
  if (area) { const b = $(".add-btn", area); if (b) b.hidden = false; }
  if (state.dirty) { state.dirty = false; onNotesChanged(); }
}

function openNoteForm(target, id = null) {
  closeNoteForm();
  const existing = id ? (state.notes[target] || {})[id] : null;
  const form = document.createElement("form");
  form.className = "note-form";
  form.noValidate = true;
  const kind = existing?.kind || "point";
  form.innerHTML = `
    <label class="field"><span>${existing ? "Edit your note" : "Your note"}</span>
      <textarea name="text" required placeholder='Write it how you'd write it in the book — put novel quotations in "double quotes" and use [p.12] for a book page'>${esc(existing?.text || "")}</textarea></label>
    <div class="kind-picker" role="radiogroup" aria-label="Kind of note">
      ${Object.entries(KINDS).map(([k, label]) => `<label><input type="radio" name="kind" value="${k}" ${k === kind ? "checked" : ""}>${k === "quote" ? "“ ” " : k === "context" ? "★ " : "✎ "}${label}</label>`).join("")}
    </div>
    <p class="form__hint">Saved online to your notes database, so it shows up on every device.</p>
    <div class="form__actions">
      <button type="button" class="btn btn--ghost btn--small" data-cancel>Cancel</button>
      <button type="submit" class="btn btn--mine btn--small">${existing ? "Save changes" : "Add note"}</button>
    </div>`;

  if (existing) {
    const el = document.getElementById(`u-${id}`);
    if (el) { el.hidden = true; el.dataset.hiddenForEdit = "1"; el.after(form); }
  }
  if (!form.isConnected) {
    const area = $(`[data-mine-area="${CSS.escape(target)}"]`);
    if (!area) return;
    $(".add-btn", area).hidden = true;
    area.appendChild(form);
  }

  $("[data-cancel]", form).addEventListener("click", closeNoteForm);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = form.text.value.trim();
    const k = form.kind.value;
    if (!text) { form.text.focus(); return; }
    const btn = $('[type="submit"]', form);
    btn.disabled = true;
    try {
      if (existing) await store.saveNote(target, id, { text, kind: k, updatedAt: Date.now() });
      else await store.saveNote(target, store.newId(), { text, kind: k, createdAt: Date.now() });
      toast(existing ? "Note updated" : "Note added");
      state.dirty = true;
      closeNoteForm();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      toast("Couldn't save that — try again");
    }
  });
  const ta = $("textarea", form);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  form.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
}

async function deleteNote(target, id) {
  if (!confirm("Delete this note? This can't be undone.")) return;
  try { await store.deleteNote(target, id); toast("Note deleted"); onNotesChanged(); }
  catch (err) { console.error(err); toast("Couldn't delete that — try again"); }
}

// ---------- new spider diagram ----------
function openDiagramModal() {
  const form = $("#diagram-form");
  form.reset();
  $("#diagram-swatches").innerHTML = SWATCHES.map((c, i) => `<label style="--sw:${c}" title="${c}"><input type="radio" name="colour" value="${c}" ${i === 0 ? "checked" : ""}></label>`).join("");
  openOverlay("#diagram-modal");
  form.name.focus();
}

async function createDiagram(form) {
  const name = form.name.value.trim();
  if (!name) { form.name.focus(); return; }
  const id = store.newId();
  const diagram = { name, tagline: form.tagline.value.trim(), bookPage: form.bookPage.value.trim(), colour: safeColour(form.colour.value), createdAt: Date.now() };
  try {
    await store.saveDiagram(id, diagram);
    closeOverlays();
    toast(`${name} added — now give it some legs`);
    location.hash = `#/diagram/${id}`;
  } catch (err) { console.error(err); toast("Couldn't create that diagram — try again"); }
}

async function deleteDiagram(id) {
  const g = state.diagrams[id];
  if (!g) return;
  if (!confirm(`Delete the "${g.name}" diagram and every note on it?`)) return;
  try { await store.deleteDiagram(id); toast("Diagram deleted"); location.hash = "#/characters"; }
  catch (err) { console.error(err); toast("Couldn't delete that — try again"); }
}

// -----------------------------------------------------------------
// Overlays
// -----------------------------------------------------------------
let lastFocus = null;
function openOverlay(sel) {
  closeOverlays();
  lastFocus = document.activeElement;
  $(sel).hidden = false;
  document.body.style.overflow = "hidden";
}
function closeOverlays() {
  let any = false;
  $$(".overlay").forEach((o) => { if (!o.hidden) { o.hidden = true; any = true; } });
  document.body.style.overflow = "";
  if (any && lastFocus && lastFocus.focus) lastFocus.focus();
}

// -----------------------------------------------------------------
// Search
// -----------------------------------------------------------------
function openSearch() {
  openOverlay("#search");
  const input = $("#search-input");
  input.value = "";
  input.focus();
  runSearch();
}

function matchRanges(text, terms) {
  const lc = text.toLowerCase();
  const ranges = [];
  terms.forEach((t) => { let from = 0; while (t) { const at = lc.indexOf(t, from); if (at < 0) break; ranges.push([at, at + t.length]); from = at + t.length; } });
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  ranges.forEach((r) => { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push(r.slice()); });
  return merged;
}

function highlightMatches(text, terms) {
  const ranges = matchRanges(text, terms);
  if (!ranges.length) return esc(text);
  let out = "", pos = 0;
  ranges.forEach(([a, b]) => { out += esc(text.slice(pos, a)) + `<mark class="match">${esc(text.slice(a, b))}</mark>`; pos = b; });
  return out + esc(text.slice(pos));
}

function snippet(text, terms, max = 180) {
  if (text.length <= max) return text;
  const r = matchRanges(text, terms)[0];
  if (!r) return text.slice(0, max - 1) + "…";
  const start = Math.max(0, r[0] - 60);
  const end = Math.min(text.length, start + max);
  return (start ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

function runSearch() {
  const q = $("#search-input").value.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  const box = $("#search-results");
  const count = $("#search-count");
  const f = state.filter;

  if (!terms.length && f === "all") {
    box.innerHTML = `<div class="search__empty">Type to search every character node, incident, note, quote and paragraph — including the ones you've added.<br><small>Tip: switch to <b>Quotes only</b> or <b>Context only</b> to browse.</small></div>`;
    count.textContent = "";
    return;
  }

  const hits = state.index.filter((it) =>
    (f === "all" || (f === "quotes" && it.isQuote) || (f === "context" && it.isContext)) &&
    terms.every((t) => it.lc.includes(t)));

  count.textContent = hits.length ? `${hits.length} result${hits.length === 1 ? "" : "s"}` : "No results";
  if (!hits.length) { box.innerHTML = `<div class="search__empty">Nothing matches “${esc(q)}”${f !== "all" ? " with that filter" : ""}.</div>`; return; }

  const order = ["Exam essentials", "Characters", "Settings", "My diagrams", "Incidents", "Notes & Quotes", "Paragraphs"];
  const groups = new Map();
  hits.forEach((it) => { if (!groups.has(it.section)) groups.set(it.section, []); groups.get(it.section).push(it); });

  box.innerHTML = order.filter((s) => groups.has(s)).map((s) => `
    <div class="search__group">${esc(s)} <span style="opacity:.6">· ${groups.get(s).length}</span></div>
    ${groups.get(s).map((it) => `
      <button type="button" class="result ${it.mine ? "is-mine" : ""}" data-route="${attr(it.route)}" data-id="${attr(it.id)}" style="--c:${it.colour || MINE}">
        <span class="result__where">${it.mine ? '<span class="tag tag--mine">Mine</span> ' : ""}<b>${esc(it.group)}</b>${it.isContext ? ' · <span class="star">★</span> context' : ""}${it.isQuote ? " · quotation" : ""}</span>
        ${highlightMatches(snippet(it.text, terms), terms)}
      </button>`).join("")}`).join("");
}

function pickResult(btn) {
  const route = btn.dataset.route, id = btn.dataset.id;
  closeOverlays();
  goTo(route, id);
}

function goTo(route, id) {
  const target = parseRoute.call(null);
  const want = route.replace(/^#\/?/, "");
  const here = location.hash.replace(/^#\/?/, "");
  const samePage = here.split("/")[0] === want.split("/")[0] && (here === want || ["incidents", "notes", "paragraphs"].includes(want.split("/")[0]));
  if (samePage && document.getElementById(id)) { jumpTo(id); return; }
  state.pendingJump = id;
  if (location.hash === route) navigate(); else location.hash = route;
  void target;
}

// -----------------------------------------------------------------
// Random quote quiz
// -----------------------------------------------------------------
function quizPool() {
  return state.index.filter((it) => it.isQuote && ["Characters", "Settings", "My diagrams", "Incidents"].includes(it.section) && !it.id.endsWith("-para"));
}

function openQuiz() {
  state.quiz = { score: 0, asked: 0, item: null, done: false };
  openOverlay("#quiz");
  nextQuestion();
}

function nextQuestion() {
  const pool = quizPool();
  const body = $("#quiz-body");
  $("#quiz-score").textContent = state.quiz.asked ? `${state.quiz.score} / ${state.quiz.asked}` : "";
  if (!pool.length) { body.innerHTML = `<p>No quotations to quiz on yet.</p>`; return; }
  let item = pool[Math.floor(Math.random() * pool.length)];
  if (pool.length > 1 && state.quiz.item && item.id === state.quiz.item.id) item = pool[(pool.indexOf(item) + 1) % pool.length];
  state.quiz.item = item;
  state.quiz.done = false;

  const answer = item.group;
  const subjects = [...new Set(pool.map((p) => p.group))].filter((g) => g !== answer);
  const options = shuffle([answer, ...shuffle(subjects).slice(0, 3)]);
  const q = firstQuote(item.text);

  body.innerHTML = `
    <span class="eyebrow">${esc(item.section)}</span>
    <p class="quiz__quote"><mark class="hl is-on">“${esc(q)}”</mark></p>
    <p class="quiz__q">Who, or what, is this quotation about?</p>
    <div class="quiz__options">${options.map((o) => `<button type="button" class="quiz__opt" data-answer="${attr(o)}">${esc(o)}</button>`).join("")}</div>
    <div id="quiz-reveal"></div>
    <div class="quiz__actions">
      <button type="button" class="btn btn--ghost btn--small" data-quiz="reveal">Not sure — show me</button>
    </div>`;
}

function answerQuiz(choice) {
  const { item } = state.quiz;
  if (!item || state.quiz.done) return;
  state.quiz.done = true;
  state.quiz.asked += 1;
  const right = choice === item.group;
  if (right) state.quiz.score += 1;
  $$(".quiz__opt").forEach((b) => {
    b.disabled = true;
    if (b.dataset.answer === item.group) b.classList.add("is-right");
    else if (b.dataset.answer === choice) b.classList.add("is-wrong");
  });
  $("#quiz-score").textContent = `${state.quiz.score} / ${state.quiz.asked}`;
  $("#quiz-reveal").innerHTML = `
    <div class="quiz__reveal" style="--c:${item.colour || MINE}">
      <span class="eyebrow">${choice === null ? "Answer" : right ? "Correct" : "Not quite"} — ${esc(item.group)}</span>
      <p><strong>What it shows:</strong> ${fmt(item.text, { kind: item.kind })}</p>
    </div>`;
  $(".quiz__actions").innerHTML = `
    <button type="button" class="btn btn--primary btn--small" data-quiz="next">Next quote →</button>
    <button type="button" class="btn btn--ghost btn--small" data-quiz="go" data-route="${attr(item.route)}" data-id="${attr(item.id)}">Open this note</button>`;
  $('[data-quiz="next"]').focus();
}

// -----------------------------------------------------------------
// Wiring
// -----------------------------------------------------------------
function wireChrome() {
  $("#btn-search").addEventListener("click", openSearch);
  $("#btn-quiz").addEventListener("click", openQuiz);
  $("#btn-print").addEventListener("click", () => window.print());

  // overlay close buttons / backdrops
  $$(".overlay").forEach((o) => o.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeOverlays(); }));

  // search
  const input = $("#search-input");
  let t;
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(runSearch, 40); });
  $$(".search__filters .chip").forEach((chip) => chip.addEventListener("click", () => {
    state.filter = chip.dataset.filter;
    $$(".search__filters .chip").forEach((c) => c.classList.toggle("is-active", c === chip));
    runSearch();
    input.focus();
  }));
  $("#search-results").addEventListener("click", (e) => { const b = e.target.closest(".result"); if (b) pickResult(b); });
  $("#search").addEventListener("keydown", (e) => {
    const results = $$(".result");
    if (!results.length) return;
    const i = results.findIndex((r) => r.classList.contains("is-focused"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = e.key === "ArrowDown" ? Math.min(results.length - 1, i + 1) : Math.max(0, i - 1);
      results.forEach((r, j) => r.classList.toggle("is-focused", j === n));
      results[n].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && document.activeElement === input) {
      e.preventDefault();
      pickResult(results[Math.max(0, i)]);
    }
  });

  // quiz
  $("#quiz-body").addEventListener("click", (e) => {
    const opt = e.target.closest(".quiz__opt");
    if (opt) { answerQuiz(opt.dataset.answer); return; }
    const b = e.target.closest("[data-quiz]");
    if (!b) return;
    if (b.dataset.quiz === "reveal") answerQuiz(null);
    else if (b.dataset.quiz === "next") nextQuestion();
    else if (b.dataset.quiz === "go") { closeOverlays(); goTo(b.dataset.route, b.dataset.id); }
  });

  // new diagram
  $("#diagram-form").addEventListener("submit", (e) => { e.preventDefault(); createDiagram(e.currentTarget); });

  // in-view actions
  $("#view").addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const a = b.dataset.action;
    if (a === "add-note") openNoteForm(b.dataset.target);
    else if (a === "edit-note") openNoteForm(b.dataset.target, b.dataset.id);
    else if (a === "delete-note") deleteNote(b.dataset.target, b.dataset.id);
    else if (a === "new-diagram") openDiagramModal();
    else if (a === "delete-diagram") deleteDiagram(b.dataset.id);
    else if (a === "quiz") openQuiz();
    else if (a === "search") openSearch();
    else if (a === "print") window.print();
    else if (a === "jump") goTo(b.dataset.route, b.dataset.id);
  });

  // keyboard
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if ($("#search").hidden) openSearch(); else closeOverlays(); return; }
    if (e.key === "Escape") { if ($$(".overlay").some((o) => !o.hidden)) { closeOverlays(); } else if ($(".note-form")) { closeNoteForm(); } }
  });

  NARROW.addEventListener?.("change", () => $$(".spider").forEach((s) => layoutSpider(s, false)));
  REDUCED_MOTION.addEventListener?.("change", () => render({ animate: false }));
  window.addEventListener("hashchange", navigate);
}

async function init() {
  wireChrome();
  store.init();
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    console.error(err);
    $("#view").innerHTML = `<div class="page-head"><h1>Couldn't open the notes</h1></div><p>The notes file <code>${DATA_URL}</code> didn't load (${esc(err.message)}). Check it's in the repo and is valid JSON, then refresh.</p>`;
    return;
  }
  $("#footer-author").textContent = `${state.data.title} · ${state.data.author}`;
  buildIndex();
  navigate();
}

init();
