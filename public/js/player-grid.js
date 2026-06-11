/* EBK · Player Grid — immaculate-grid: name a player for each row×col criterion. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);

  const SPORT = document.body.dataset.sport || "nfl";
  const LEAGUE = window[SPORT.toUpperCase()] || window.NFL;
  const DATA_URL = SPORT === "nfl" ? "/data/players.json" : "/data/" + SPORT + "/players.json";
  const BEST_KEY = SPORT === "nfl" ? "ebk_grid_best" : "ebk_grid_" + SPORT + "_best";
  (function () { if (!window.EBKF) { var s = document.createElement("script"); s.src = "/js/ebk-firebase.js"; document.head.appendChild(s); } })();
  const ebkRecord = (score) => { try { window.EBKF && EBKF.recordScore(SPORT, "player-grid", score); } catch (e) {} };
  const sfx = (n) => { try { window.EBKS && EBKS.play(n); } catch (e) {} };

  const CFG = {
    nfl: {
      ach: [
        ["pass4000", "4,000+ Pass Yds", "passing_yards", 4000],
        ["pass30",   "30+ Pass TD",     "passing_tds",   30],
        ["rush1000", "1,000+ Rush Yds", "rushing_yards", 1000],
        ["rush10",   "10+ Rush TD",     "rushing_tds",   10],
        ["rec1000",  "1,000+ Rec Yds",  "receiving_yards", 1000],
        ["rec100",   "100+ Catches",    "receptions",    100],
        ["rec10",    "10+ Rec TD",      "receiving_tds", 10],
        ["sack10",   "10+ Sacks",       "def_sacks",     10],
        ["tk100",    "100+ Tackles",    "tackles",       100],
        ["int5",     "5+ INT (season)", "def_interceptions", 5],
        ["pd15",     "15+ Passes Def",  "def_pass_defended", 15],
        ["ff4",      "4+ Forced Fum",   "def_fumbles_forced", 4],
      ],
      positions: [["QB", "QB"], ["RB", "RB"], ["WR", "WR"], ["TE", "TE"],
                  ["DL", "D-Line"], ["LB", "Linebacker"], ["DB", "Def. Back"]],
      flags: [["r1", "1st-Rd Pick"], ["undrafted", "Undrafted"]],
      posKey: "grp",
    },
    nba: {
      ach: [
        ["p20",  "20+ PPG",      "ppg", 20],
        ["p2k",  "2,000+ Points","pts", 2000],
        ["r10",  "10+ RPG",      "rpg", 10],
        ["a7",   "7+ APG",       "apg", 7],
        ["t150", "150+ 3PM",     "tpm", 150],
        ["b100", "100+ Blocks",  "blk", 100],
        ["s120", "120+ Steals",  "stl", 120],
      ],
      positions: [["G", "Guard"], ["F", "Forward"], ["C", "Center"]],
      flags: [],
      posKey: "grp",
    },
    mlb: {
      ach: [
        ["hr30",  "30+ HR",        "hr",  30],
        ["hr40",  "40+ HR",        "hr",  40],
        ["rbi100","100+ RBI",      "rbi", 100],
        ["h200",  "200+ Hits",     "hits", 200],
        ["sb30",  "30+ Steals",    "sb",  30],
        ["avg300",".300+ Average", "avg", 0.300],
        ["w18",   "18+ Wins",      "w",   18],
        ["k200",  "200+ K",        "k",   200],
        ["sv30",  "30+ Saves",     "sv",  30],
      ],
      positions: [["P", "Pitcher"], ["C", "Catcher"], ["1B", "1B"], ["2B", "2B"],
                  ["3B", "3B"], ["SS", "SS"], ["OF", "Outfield"]],
      flags: [],
      posKey: "pos",
    },
    nhl: {
      ach: [
        ["g40", "40+ Goals", "g", 40], ["g30", "30+ Goals", "g", 30],
        ["a50", "50+ Assists", "a", 50], ["p80", "80+ Points", "pts", 80],
        ["p100", "100+ Points", "pts", 100], ["sh250", "250+ Shots", "shots", 250],
        ["w35", "35+ Wins", "w", 35], ["so6", "6+ Shutouts", "so", 6],
      ],
      positions: [["F", "Forward"], ["D", "Defense"], ["G", "Goalie"]],
      flags: [],
      posKey: "grp",
    },
    soccer: {
      ach: [
        ["g15", "15+ Goals", "goals", 15], ["g20", "20+ Goals", "goals", 20],
        ["a10", "10+ Assists", "assists", 10], ["cs15", "15+ Clean Sheets", "cs", 15],
        ["sv100", "100+ Saves", "saves", 100], ["pts150", "150+ FPL Pts", "pts", 150],
        ["min3000", "3,000+ Minutes", "minutes", 3000],
      ],
      positions: [["GK", "Keeper"], ["DEF", "Defender"], ["MID", "Midfielder"], ["FWD", "Forward"]],
      flags: [],
      posKey: "grp",
    },
  }[SPORT];
  const ACH = CFG.ach;

  const S = {
    R: [],            // roster: per-player attribute objects
    crit: [],         // all criteria, each with .set (Set of roster indices)
    rows: [], cols: [],
    cells: [],        // 9 cell states: null | {idx} | 'dead'
    used: new Set(),  // used player ids
    entries: 9, score: 0, best: 0, active: null, // active = cell index being guessed
    over: false, lastIdx: null,
    acItems: [],
    mode: "daily",    // "daily" | "practice"
    date: null,       // ET date of the daily grid
    pcts: null,       // per-cell rarity % after a finished daily
    recPs: [],        // in-flight answer-count writes
  };

  const ENTRIES = 9;        // every guess — right, wrong or timed out — costs one
  const SHOT_MS = 20000;    // shot clock per entry

  // ---- shot clock ----
  let rtTO = null, rtLowTO = null, rtEl = null;
  function rtBar() {
    if (rtEl) return rtEl;
    rtEl = document.createElement("div");
    rtEl.className = "round-timer";
    rtEl.innerHTML = '<div class="fill"></div>';
    $("#game").prepend(rtEl);
    return rtEl;
  }
  function rtStart() {
    const fill = $(".fill", rtBar());
    clearTimeout(rtTO); clearTimeout(rtLowTO);
    fill.classList.remove("low");
    fill.style.transition = "none";
    fill.style.width = "100%";
    void fill.offsetWidth;
    fill.style.transition = `width ${SHOT_MS}ms linear`;
    fill.style.width = "0%";
    rtLowTO = setTimeout(() => { if (!S.over) fill.classList.add("low"); }, SHOT_MS - 5000);
    rtTO = setTimeout(shotClockOut, SHOT_MS);
  }
  function rtStop() {
    clearTimeout(rtTO); clearTimeout(rtLowTO);
    if (!rtEl) return;
    const fill = $(".fill", rtEl);
    fill.style.transition = "none";
    fill.style.width = getComputedStyle(fill).width;
  }

  function shotClockOut() {
    if (S.over) return;
    if (S.active != null) closeModal();
    sfx("timeout");
    flash("⏱ Shot clock! That entry is gone.", false);
    consumeEntry();
  }

  function setEntries(n) {
    S.entries = n;
    const el = $("#entries");
    if (el) {
      el.textContent = n;
      el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
    }
  }

  // an entry was used (guess or timeout) — end the game or rearm the clock
  function consumeEntry() {
    setEntries(S.entries - 1);
    const resolved = S.cells.filter((c) => c !== null).length;
    if (S.entries <= 0 || resolved >= 9) finish();
    else rtStart();
  }

  const normPos = (p) => (p === "FB" || p === "HB" ? "RB" : p);
  const getBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } };
  const setBest = (v) => { try { localStorage.setItem(BEST_KEY, v); } catch {} };
  const shuffle = (a, rnd = Math.random) => { for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---- daily mode: same grid for everyone, resets midnight ET --------------
  const etDate = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  // deterministic RNG seeded from "<sport>|<date>" so every client builds
  // the identical grid from the identical (static) dataset
  function seededRng(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    let a = (h ^= h >>> 16) >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const PLAY_KEY = () => "ebk_daily_" + SPORT + "_" + S.date;
  function loadLocalPlay() {
    try { return JSON.parse(localStorage.getItem(PLAY_KEY())); } catch { return null; }
  }
  function saveLocalPlay(data) {
    try { localStorage.setItem(PLAY_KEY(), JSON.stringify(data)); } catch {}
  }
  function hoursToReset() {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour12: false,
      hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date());
    const get = (t) => +p.find((x) => x.type === t).value;
    const mins = 1440 - ((get("hour") % 24) * 60 + get("minute"));
    return Math.floor(mins / 60) + "h " + (mins % 60) + "m";
  }

  async function load() {
    try {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      buildRoster(data);
      buildCriteria();
      S.best = getBest();
      $("#best").textContent = S.best;
      // entries-left chip in the header
      const gs = document.querySelector(".gscore");
      if (gs && !$("#entries")) {
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = '<span class="k">Entries</span><span class="v" id="entries">9</span>';
        gs.insertBefore(chip, gs.firstChild);
      }
      $("#loading").hidden = true;
      $("#game").hidden = false;
      setupTabs();
      startMode("daily");
    } catch (e) {
      $("#loading").textContent = "Couldn't load player data. " + e.message;
    }
  }

  // ---- mode tabs (Daily / Practice) ----
  function setupTabs() {
    const tabs = document.createElement("div");
    tabs.className = "grid-tabs";
    tabs.innerHTML =
      '<button class="gtab" data-mode="daily">📅 Daily</button>' +
      '<button class="gtab" data-mode="practice">♾ Practice</button>';
    $("#game").insertBefore(tabs, $("#status-line"));
    tabs.addEventListener("click", (e) => {
      const b = e.target.closest(".gtab");
      if (!b || b.dataset.mode === S.mode) return;
      if (S.mode === "daily" && !S.over && S.entries < 9 &&
          !confirm("Leave the daily grid? Your remaining entries won't be saved.")) return;
      startMode(b.dataset.mode);
    });
  }
  function paintTabs() {
    document.querySelectorAll(".gtab").forEach((b) =>
      b.classList.toggle("active", b.dataset.mode === S.mode));
  }

  function startMode(mode) {
    S.date = etDate();
    if (mode === "daily") {
      const saved = loadLocalPlay();
      if (saved) { S.mode = "daily"; showCompleted(saved); return; }
      newGrid("daily");
      whenUser(() => checkRemotePlay());
    } else {
      newGrid("practice");
    }
  }

  function whenUser(cb) {
    let fired = false;
    const tick = () => {
      if (window.EBKF && EBKF.onChange) EBKF.onChange((u) => { if (u && !fired) { fired = true; cb(); } });
      else setTimeout(tick, 150);
    };
    tick();
  }

  // played today on another device? swap to the completed view (only while
  // this board is still untouched)
  async function checkRemotePlay() {
    try {
      const play = await EBKF.getGridPlay(SPORT, S.date);
      if (play && S.mode === "daily" && !S.over && S.entries === 9 && S.score === 0) {
        saveLocalPlay(play);
        rtStop();
        showCompleted(play);
      }
    } catch (e) {}
  }

  function buildRoster(data) {
    const people = data.people || {};
    const byId = new Map();
    for (const p of data.players) {
      if (!p.id) continue;
      let a = byId.get(p.id);
      if (!a) {
        const bio = people[p.id] || {};
        a = { id: p.id, name: p.name, pos: p[CFG.posKey] || p.grp || normPos(p.pos), headshot: p.headshot,
              teams: new Set(), ach: new Set(),
              r1: bio.draftRound === 1, undrafted: bio.draftYear == null,
              min: p.season, max: p.season };
        byId.set(p.id, a);
      }
      a.teams.add(LEAGUE.keyOf(p.team));
      a.min = Math.min(a.min, p.season); a.max = Math.max(a.max, p.season);
      if (p.headshot && !a.headshot) a.headshot = p.headshot;
      for (const [key, , col, thr] of ACH) if ((p.stats[col] || 0) >= thr) a.ach.add(key);
    }
    S.R = [...byId.values()];
    S.R.forEach((a) => (a.nameLC = a.name.toLowerCase()));
    S.R.sort((x, y) => x.name.localeCompare(y.name));
  }

  function buildCriteria() {
    const crit = [];
    LEAGUE.franchises.forEach((f) => crit.push({ type: "team", key: f.key, label: f.name }));
    ACH.forEach(([key, label]) => crit.push({ type: "ach", key, label }));
    CFG.positions.forEach(([k, l]) => crit.push({ type: "pos", key: k, label: l }));
    CFG.flags.forEach(([k, l]) => crit.push({ type: "flag", key: k, label: l }));
    // precompute satisfaction set (roster indices) for each criterion
    crit.forEach((c) => (c.set = new Set()));
    S.R.forEach((p, i) => crit.forEach((c) => { if (satisfies(p, c)) c.set.add(i); }));
    S.crit = crit;
    S.teams = crit.filter((c) => c.type === "team");
    S.specials = crit.filter((c) => c.type !== "team");
  }

  function satisfies(p, c) {
    if (c.type === "team") return p.teams.has(c.key);
    if (c.type === "ach") return p.ach.has(c.key);
    if (c.type === "pos") return p.pos === c.key;
    return c.key === "r1" ? p.r1 : p.undrafted;
  }

  function intersects(a, b, min) {
    const [small, big] = a.size < b.size ? [a, b] : [b, a];
    let n = 0;
    for (const v of small) if (big.has(v)) { if (++n >= min) return true; }
    return false;
  }

  function generate(min, rnd = Math.random) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const teams = shuffle(S.teams.slice(), rnd).slice(0, 6);
      const picks = teams.slice();
      const nSpecial = (rnd() * 3) | 0; // 0..2 special axes
      const slots = shuffle([0, 1, 2, 3, 4, 5], rnd).slice(0, nSpecial);
      const usedKeys = new Set(picks.map((c) => c.key));
      for (const slot of slots) {
        const sp = S.specials[(rnd() * S.specials.length) | 0];
        if (usedKeys.has(sp.key)) continue;
        usedKeys.delete(picks[slot].key);
        picks[slot] = sp; usedKeys.add(sp.key);
      }
      const rows = picks.slice(0, 3), cols = picks.slice(3, 6);
      let ok = true;
      for (let r = 0; r < 3 && ok; r++)
        for (let c = 0; c < 3 && ok; c++)
          if (!intersects(rows[r].set, cols[c].set, min)) ok = false;
      if (ok) return { rows, cols };
    }
    return null;
  }

  function newGrid(mode) {
    S.mode = mode || S.mode || "practice";
    S.date = etDate();
    S.pcts = null; S.recPs = [];
    const rnd = S.mode === "daily" ? seededRng(SPORT + "|" + S.date) : Math.random;
    const g = generate(2, rnd) || generate(1, rnd);
    S.rows = g.rows; S.cols = g.cols;
    S.cells = Array(9).fill(null);
    S.used = new Set();
    S.score = 0; S.over = false; S.lastIdx = null;
    setEntries(ENTRIES);
    paintTabs();
    $("#score").textContent = "0";
    $("#banner").textContent = ""; $("#banner").className = "banner";
    $("#end-row").hidden = true; $("#end-row").innerHTML = "";
    $("#status-line").textContent = S.mode === "daily"
      ? "Daily grid · " + S.date + " — everyone plays this exact board. 9 entries, 20s shot clock."
      : "Practice grid — 9 entries, 20s on the shot clock. Right, wrong or too slow, each costs one.";
    render();
    rtStart();
  }

  // restore a finished daily (this device or another, via Firestore)
  function showCompleted(saved) {
    paintTabs();
    S.over = true;
    S.pcts = saved.pcts || null;
    const rnd = seededRng(SPORT + "|" + S.date);
    const g = generate(2, rnd) || generate(1, rnd);
    S.rows = g.rows; S.cols = g.cols;
    S.cells = (saved.cells || Array(9).fill(null)).slice(0, 9);
    while (S.cells.length < 9) S.cells.push(null);
    S.score = saved.score || 0;
    setEntries(0);
    $("#score").textContent = S.score;
    $("#banner").textContent = ""; $("#banner").className = "banner";
    $("#status-line").innerHTML =
      "You've played today's " + SPORT.toUpperCase() + " grid: <b>" + S.score + "/9</b>" +
      (saved.rarity != null ? " · rarity score <b>" + saved.rarity + "</b>" : "") +
      " · new grid in " + hoursToReset();
    render();
    const row = $("#end-row"); row.hidden = false; row.innerHTML = "";
    addBtn(row, "Practice grid", "primary", () => newGrid("practice"));
    addBtn(row, "Back to EBK", "ghost", () => (location.href = "/" + SPORT));
  }

  function critLabel(c) {
    if (c.type === "team")
      return `<img class="gh-logo" src="${LEAGUE.logo(c.key)}" alt="${c.label}" loading="lazy" />` +
             `<span class="gh-name">${c.label}</span>`;
    return `<span class="gh-name">${c.label}</span>`;
  }

  function render() {
    const g = $("#grid");
    g.innerHTML = "";
    g.appendChild(headerCell("corner", ""));
    S.cols.forEach((c) => g.appendChild(headerCell("", critLabel(c))));
    for (let r = 0; r < 3; r++) {
      g.appendChild(headerCell("", critLabel(S.rows[r])));
      for (let c = 0; c < 3; c++) {
        const idx = r * 3 + c;
        g.appendChild(cellEl(idx, S.cells[idx]));
      }
    }
  }

  function headerCell(extra, html) {
    const d = document.createElement("div");
    d.className = "gh " + extra;
    d.innerHTML = html;
    return d;
  }

  function cellEl(idx, state) {
    const d = document.createElement("div");
    d.className = "gcell";
    if (idx === S.lastIdx) { d.classList.add("just"); S.lastIdx = null; }
    if (state && (state.idx != null || state.name)) {
      d.classList.add("filled");
      const p = state.name ? state : S.R[state.idx];
      const rar = (S.pcts && S.pcts[idx] != null)
        ? `<div class="cell-rar">${S.pcts[idx]}%</div>` : "";
      d.innerHTML = `<div class="cell-name">${p.name}</div><div class="cell-meta">${p.pos || ""}</div>${rar}`;
    } else if (state === "dead") {
      d.classList.add("dead");
      d.innerHTML = `<div class="cell-plus">✕</div>`;
    } else {
      d.innerHTML = `<div class="cell-plus">＋</div>`;
      d.addEventListener("click", () => { if (!S.over) openModal(idx); });
    }
    return d;
  }

  // ---- guess modal + autocomplete ----
  function openModal(idx) {
    S.active = idx;
    const r = S.rows[(idx / 3) | 0], c = S.cols[idx % 3];
    $("#m-title").textContent = "Name a player";
    $("#m-sub").innerHTML = `<b>${r.label}</b> &nbsp;×&nbsp; <b>${c.label}</b>`;
    $("#m-msg").textContent = "";
    const ac = $("#ac"); ac.value = "";
    $("#ac-list").hidden = true;
    $("#modal").hidden = false;
    setTimeout(() => ac.focus(), 30);
  }
  function closeModal() { $("#modal").hidden = true; S.active = null; }

  function renderAC(q) {
    const list = $("#ac-list");
    q = q.trim().toLowerCase();
    if (q.length < 2) { list.hidden = true; return; }
    const starts = [], has = [];
    for (const p of S.R) {
      const i = p.nameLC.indexOf(q);
      if (i === 0) starts.push(p);
      else if (i > 0) has.push(p);
      if (starts.length >= 8) break;
    }
    const items = starts.concat(has).slice(0, 8);
    S.acItems = items;
    if (!items.length) { list.innerHTML = `<div class="ac-empty">No players found</div>`; list.hidden = false; return; }
    list.innerHTML = items.map((p, i) =>
      `<div class="ac-item" data-i="${i}"><span>${p.name}</span><span class="ac-meta">${p.pos} · ${p.min}–${p.max}</span></div>`
    ).join("");
    [...list.children].forEach((el) => {
      if (el.dataset.i == null) return;
      el.addEventListener("click", () => submitGuess(S.acItems[+el.dataset.i]));
    });
    list.hidden = false;
  }

  function submitGuess(p) {
    if (S.active == null || S.over) return;
    if (S.used.has(p.id)) { $("#m-msg").textContent = `${p.name} is already on the grid — pick another.`; return; }
    const idx = S.active;
    const r = S.rows[(idx / 3) | 0], c = S.cols[idx % 3];
    const ok = satisfies(p, r) && satisfies(p, c);
    if (ok) {
      const i = S.R.indexOf(p);
      S.cells[idx] = { idx: i, pid: p.id, name: p.name, pos: p.pos };
      S.used.add(p.id);
      S.score++;
      // daily mode: this answer joins the community counts that set rarity
      if (S.mode === "daily") {
        try {
          if (window.EBKF)
            S.recPs.push(EBKF.recordGridAnswer(SPORT, S.date, idx, p).catch(() => {}));
        } catch (e) {}
      }
      const sc = $("#score"); sc.textContent = S.score;
      sc.classList.remove("pop"); void sc.offsetWidth; sc.classList.add("pop");
      if (S.score > S.best) { S.best = S.score; setBest(S.best); $("#best").textContent = S.best; }
    } else {
      S.cells[idx] = "dead";
    }
    S.lastIdx = idx;
    closeModal();
    render();
    sfx(ok ? "fill" : "wrong");
    flash(ok ? `✓ ${p.name} fits!` : `✕ ${p.name} doesn't fit that square.`, ok);
    consumeEntry();
  }

  function flash(msg, good) {
    const b = $("#banner"); b.textContent = msg; b.className = "banner " + (good ? "good" : "bad");
  }

  function finish() {
    S.over = true;
    rtStop();
    sfx(S.score === 9 ? "best" : "over");
    ebkRecord(S.score);
    flash(S.score === 9 ? "Immaculate! 9/9 🎉" : `You filled ${S.score}/9.`, S.score >= 5);
    const row = $("#end-row"); row.hidden = false; row.innerHTML = "";
    if (S.mode === "daily") {
      $("#status-line").textContent = `Daily grid done — ${S.score}/9 filled. Scoring rarity…`;
      addBtn(row, "Practice grid", "primary", () => newGrid("practice"));
      addBtn(row, "Back to EBK", "ghost", () => (location.href = "/" + SPORT));
      finishDaily();
    } else {
      $("#status-line").textContent = `Grid complete — ${S.score}/9 squares filled.`;
      addBtn(row, "New grid", "primary", () => newGrid("practice"));
      addBtn(row, "Back to EBK", "ghost", () => (location.href = "/" + SPORT));
    }
  }

  // rarity: your pick's share of all community answers for that cell.
  // 3 picks of Brady out of 4 total = 75%. Lower = rarer = better. Empty or
  // dead squares count as 100. Total is the sum over all nine squares.
  async function finishDaily() {
    let pcts = Array(9).fill(100);
    try {
      try { await Promise.allSettled(S.recPs); } catch (e) {}
      let stats = [];
      try { stats = (window.EBKF && await EBKF.gridStats(SPORT, S.date)) || []; } catch (e) {}
      const cellTotals = Array(9).fill(0), counts = {};
      for (const s of stats) {
        cellTotals[s.cell] = (cellTotals[s.cell] || 0) + (s.n || 0);
        counts[s.cell + "_" + s.pid] = (counts[s.cell + "_" + s.pid] || 0) + (s.n || 0);
      }
      for (let i = 0; i < 9; i++) {
        const c = S.cells[i];
        if (!c || c === "dead") continue;
        let n = counts[i + "_" + c.pid] || 0, t = cellTotals[i] || 0;
        if (!n) { n = 1; t += 1; }            // signed-out answers aren't recorded
        pcts[i] = Math.max(1, Math.round((n / Math.max(t, 1)) * 100));
      }
    } catch (e) {}
    S.pcts = pcts;
    const total = pcts.reduce((a, b) => a + b, 0);
    render();
    $("#status-line").innerHTML =
      `Daily ${S.date}: <b>${S.score}/9</b> · rarity score <b>${total}</b> ` +
      `<span class="muted">(lower = rarer picks; missed squares count 100)</span>` +
      ` · new grid in ${hoursToReset()}`;
    const cells = S.cells.map((c) =>
      c && c !== "dead" ? { pid: c.pid, name: c.name, pos: c.pos } : (c === "dead" ? "dead" : null));
    saveLocalPlay({ cells, score: S.score, rarity: total, pcts, ts: Date.now() });
    try {
      if (window.EBKF)
        EBKF.saveGridPlay(SPORT, S.date, { cells, score: S.score, rarity: total, pcts })
          .catch(() => {});
    } catch (e) {}
  }

  function addBtn(row, label, kind, fn) {
    const b = document.createElement("button");
    b.className = "gbtn " + kind; b.textContent = label;
    b.addEventListener("click", fn); row.appendChild(b);
  }

  $("#ac").addEventListener("input", (e) => renderAC(e.target.value));
  $("#m-cancel").addEventListener("click", closeModal);
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });

  load();
})();
