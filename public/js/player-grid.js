/* EBK · Player Grid — immaculate-grid: name a player for each row×col criterion. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);

  const SPORT = document.body.dataset.sport || "nfl";
  const LEAGUE = window[SPORT.toUpperCase()] || window.NFL;
  const DATA_URL = SPORT === "nfl" ? "/data/players.json" : "/data/" + SPORT + "/players.json";
  const BEST_KEY = SPORT === "nfl" ? "ebk_grid_best" : "ebk_grid_" + SPORT + "_best";

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
  }[SPORT];
  const ACH = CFG.ach;

  const S = {
    R: [],            // roster: per-player attribute objects
    crit: [],         // all criteria, each with .set (Set of roster indices)
    rows: [], cols: [],
    cells: [],        // 9 cell states: null | {idx} | 'dead'
    used: new Set(),  // used player ids
    attempts: 0, score: 0, best: 0, active: null, // active = cell index being guessed
    acItems: [],
  };

  const normPos = (p) => (p === "FB" || p === "HB" ? "RB" : p);
  const getBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } };
  const setBest = (v) => { try { localStorage.setItem(BEST_KEY, v); } catch {} };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  async function load() {
    try {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      buildRoster(data);
      buildCriteria();
      S.best = getBest();
      $("#best").textContent = S.best;
      $("#loading").hidden = true;
      $("#game").hidden = false;
      newGrid();
    } catch (e) {
      $("#loading").textContent = "Couldn't load player data. " + e.message;
    }
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

  function generate(min) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const teams = shuffle(S.teams.slice()).slice(0, 6);
      const picks = teams.slice();
      const nSpecial = (Math.random() * 3) | 0; // 0..2 special axes
      const slots = shuffle([0, 1, 2, 3, 4, 5]).slice(0, nSpecial);
      const usedKeys = new Set(picks.map((c) => c.key));
      for (const slot of slots) {
        const sp = S.specials[(Math.random() * S.specials.length) | 0];
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

  function newGrid() {
    const g = generate(2) || generate(1);
    S.rows = g.rows; S.cols = g.cols;
    S.cells = Array(9).fill(null);
    S.used = new Set();
    S.attempts = 0; S.score = 0;
    $("#score").textContent = "0";
    $("#banner").textContent = ""; $("#banner").className = "banner";
    $("#end-row").hidden = true; $("#end-row").innerHTML = "";
    $("#status-line").textContent = "Tap a square and name a player who fits both labels. One guess per square.";
    render();
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
    if (state && state.idx != null) {
      d.classList.add("filled");
      const p = S.R[state.idx];
      d.innerHTML = `<div class="cell-name">${p.name}</div><div class="cell-meta">${p.pos}</div>`;
    } else if (state === "dead") {
      d.classList.add("dead");
      d.innerHTML = `<div class="cell-plus">✕</div>`;
    } else {
      d.innerHTML = `<div class="cell-plus">＋</div>`;
      d.addEventListener("click", () => openModal(idx));
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
    if (S.active == null) return;
    if (S.used.has(p.id)) { $("#m-msg").textContent = `${p.name} is already on the grid — pick another.`; return; }
    const idx = S.active;
    const r = S.rows[(idx / 3) | 0], c = S.cols[idx % 3];
    const ok = satisfies(p, r) && satisfies(p, c);
    S.attempts++;
    if (ok) {
      const i = S.R.indexOf(p);
      S.cells[idx] = { idx: i };
      S.used.add(p.id);
      S.score++;
      const sc = $("#score"); sc.textContent = S.score;
      sc.classList.remove("pop"); void sc.offsetWidth; sc.classList.add("pop");
      if (S.score > S.best) { S.best = S.score; setBest(S.best); $("#best").textContent = S.best; }
    } else {
      S.cells[idx] = "dead";
    }
    closeModal();
    render();
    flash(ok ? `✓ ${p.name} fits!` : `✕ ${p.name} doesn't fit that square.`, ok);
    if (S.attempts >= 9) finish();
  }

  function flash(msg, good) {
    const b = $("#banner"); b.textContent = msg; b.className = "banner " + (good ? "good" : "bad");
  }

  function finish() {
    const left = 9 - S.score;
    $("#status-line").textContent = `Grid complete — ${S.score}/9 squares filled.`;
    flash(S.score === 9 ? "Immaculate! 9/9 🎉" : `You filled ${S.score}/9.`, S.score >= 5);
    const row = $("#end-row"); row.hidden = false; row.innerHTML = "";
    addBtn(row, "New grid", "primary", newGrid);
    addBtn(row, "Back to EBK", "ghost", () => (location.href = "/" + SPORT));
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
