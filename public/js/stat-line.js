/* EBK · Guess the Stat Line — name the player from a mystery season's numbers.
   Sport-aware via <body data-sport>. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);

  const SPORT = document.body.dataset.sport || "nfl";
  const LEAGUE = window[SPORT.toUpperCase()] || window.NFL;
  const DATA_URL = SPORT === "nfl" ? "/data/players.json" : "/data/" + SPORT + "/players.json";
  const BEST_KEY = SPORT === "nfl" ? "ebk_statline_best_v2" : "ebk_statline_" + SPORT + "_best";

  const CFG = {
    nfl: {
      yMin: 1999, yMax: 2025,
      seasonFmt: (y) => String(y),
      display: [
        ["passing_yards", "Pass Yds"], ["passing_tds", "Pass TD"],
        ["rushing_yards", "Rush Yds"], ["rushing_tds", "Rush TD"],
        ["receptions", "Receptions"], ["receiving_yards", "Rec Yds"], ["receiving_tds", "Rec TD"],
        ["fantasy_points_ppr", "Fantasy (PPR)"],
        ["def_sacks", "Sacks"], ["tackles", "Tackles"], ["def_interceptions", "Interceptions"],
        ["def_pass_defended", "Passes Def"], ["def_fumbles_forced", "Forced Fum"],
      ],
      dec: { def_sacks: 1, fantasy_points: 1, fantasy_points_ppr: 1 },
      posNames: {
        QB: "Quarterback", RB: "Running Back", FB: "Fullback", HB: "Running Back",
        WR: "Wide Receiver", TE: "Tight End",
        DE: "Defensive End", DT: "Defensive Tackle", NT: "Nose Tackle", DL: "Defensive Lineman", EDGE: "Edge Rusher",
        LB: "Linebacker", OLB: "Outside Linebacker", ILB: "Inside Linebacker", MLB: "Middle Linebacker",
        CB: "Cornerback", S: "Safety", FS: "Free Safety", SS: "Strong Safety", DB: "Defensive Back",
      },
      sides: { QB: "off", RB: "off", WR: "off", TE: "off", DL: "def", LB: "def", DB: "def" },
      notable: [["fantasy_points_ppr", 60], ["passing_yards", 1200], ["rushing_yards", 450],
                ["receiving_yards", 450], ["def_sacks", 5], ["tackles", 75],
                ["def_interceptions", 3], ["def_fumbles_forced", 3], ["def_pass_defended", 12]],
    },
    nba: {
      yMin: 2002, yMax: 2023,
      seasonFmt: (y) => (y - 1) + "-" + String(y).slice(2),
      display: [
        ["pts", "Points"], ["ppg", "PPG"], ["reb", "Rebounds"], ["rpg", "RPG"],
        ["ast", "Assists"], ["apg", "APG"], ["stl", "Steals"], ["blk", "Blocks"], ["tpm", "3-Pointers"],
      ],
      dec: { ppg: 1, rpg: 1, apg: 1 },
      posNames: { PG: "Point Guard", SG: "Shooting Guard", SF: "Small Forward",
                  PF: "Power Forward", C: "Center", G: "Guard", F: "Forward" },
      sides: {},                              // one side: wildcard drawn from all
      notable: [["ppg", 10], ["pts", 500], ["rpg", 6], ["apg", 4]],
    },
    mlb: {
      yMin: 2000, yMax: 2021, seasonFmt: (y) => String(y),
      display: [
        ["hr", "Home Runs"], ["rbi", "RBI"], ["hits", "Hits"], ["runs", "Runs"],
        ["sb", "Stolen Bases"], ["avg", "Batting Avg"],
        ["w", "Wins"], ["k", "Strikeouts"], ["sv", "Saves"], ["era", "ERA"],
      ],
      dec: { avg: 3, era: 2 },
      posNames: { P: "Pitcher", C: "Catcher", "1B": "First Base", "2B": "Second Base",
                  "3B": "Third Base", SS: "Shortstop", OF: "Outfield", DH: "Designated Hitter" },
      sides: { H: "bat", P: "pitch" },
      notable: [["hr", 12], ["hits", 120], ["rbi", 60], ["runs", 60], ["sb", 20],
                ["w", 8], ["k", 100], ["sv", 10]],
    },
    nhl: {
      yMin: 2001, yMax: 2024, seasonFmt: (y) => (y - 1) + "-" + String(y).slice(2),
      display: [
        ["g", "Goals"], ["a", "Assists"], ["pts", "Points"], ["plus", "Plus/Minus"],
        ["shots", "Shots"], ["ppg_g", "PP Goals"], ["ppg", "Points/Game"],
        ["w", "Wins"], ["sv", "Saves"], ["svpct", "Save %"], ["gaa", "GAA"], ["so", "Shutouts"],
      ],
      dec: { ppg: 1, svpct: 3, gaa: 2 },
      posNames: { C: "Center", L: "Left Wing", R: "Right Wing", D: "Defense", G: "Goalie", F: "Forward" },
      sides: { F: "skater", D: "skater", G: "goalie" },
      notable: [["pts", 30], ["g", 15], ["a", 20], ["w", 15], ["sv", 600], ["so", 3]],
    },
    cfb: {
      yMin: 2014, yMax: 2024, seasonFmt: (y) => String(y),
      display: [
        ["pyd", "Pass Yds"], ["ptd", "Pass TD"], ["pint", "Interceptions"],
        ["ryd", "Rush Yds"], ["rtd", "Rush TD"], ["car", "Carries"],
        ["recyd", "Rec Yds"], ["rec", "Receptions"], ["rectd", "Rec TD"],
        ["tkl", "Tackles"], ["sk", "Sacks"], ["tfl", "Tackles for Loss"],
      ],
      dec: { sk: 1 },
      posNames: { QB: "Quarterback", RB: "Running Back", FB: "Fullback", WR: "Wide Receiver",
                  TE: "Tight End", DL: "Defensive Line", DE: "Defensive End", DT: "Defensive Tackle",
                  LB: "Linebacker", OLB: "Outside Linebacker", ILB: "Inside Linebacker",
                  CB: "Cornerback", S: "Safety", SS: "Strong Safety", FS: "Free Safety",
                  DB: "Defensive Back", ATH: "Athlete" },
      sides: { QB: "off", RB: "off", WR: "off", TE: "off", DL: "def", LB: "def", DB: "def", ATH: "off" },
      notable: [["pyd", 1500], ["ptd", 12], ["ryd", 600], ["rtd", 8], ["recyd", 600],
                ["rec", 40], ["rectd", 6], ["tkl", 60], ["sk", 6]],
    },
  }[SPORT];

  const fmt = (v, d = 0) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d });
  const rand = (a) => a[(Math.random() * a.length) | 0];
  const take = (a) => a.splice((Math.random() * a.length) | 0, 1)[0];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sideOf = (g) => CFG.sides[g] || "all";
  const decOf = (k) => CFG.dec[k] || 0;
  const posName = (p) => CFG.posNames[p] || p;

  const EXACT_REVEALS = 5;

  const S = {
    players: [], byId: new Map(), posIndex: new Map(), sideIndex: {}, notable: [],
    mystery: null, answerId: null, score: 0, best: 0, locked: false,
    exactLeft: EXACT_REVEALS, exactShown: false, range: [CFG.yMin, CFG.yMax], options: [],
  };

  const getBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } };
  const setBest = (v) => { try { localStorage.setItem(BEST_KEY, v); } catch {} };
  const isNotable = (p) => CFG.notable.some(([k, thr]) => (p.stats[k] || 0) >= thr);

  async function load() {
    try {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      S.players = data.players;
      for (const p of S.players) {
        if (!p.id) continue;
        const grp = p.grp || p.pos;
        let b = S.byId.get(p.id);
        if (!b) { b = { id: p.id, name: p.name, grp, min: p.season, max: p.season }; S.byId.set(p.id, b); }
        b.min = Math.min(b.min, p.season); b.max = Math.max(b.max, p.season);
        if (!S.posIndex.has(grp)) S.posIndex.set(grp, new Set());
        S.posIndex.get(grp).add(p.id);
      }
      for (const [grp, set] of S.posIndex) S.posIndex.set(grp, [...set]);
      S.sideIndex = {};
      for (const b of S.byId.values()) (S.sideIndex[sideOf(b.grp)] = S.sideIndex[sideOf(b.grp)] || []).push(b);
      S.notable = S.players.filter(isNotable);
      S.best = getBest();
      $("#best").textContent = S.best;
      $("#loading").hidden = true;
      $("#game").hidden = false;
      newRun();
    } catch (e) {
      $("#loading").textContent = "Couldn't load player data. " + e.message;
    }
  }

  function newRun() { S.score = 0; S.exactLeft = EXACT_REVEALS; $("#score").textContent = "0"; nextRound(); }

  function seasonRange(season) {
    const W = 3;
    let lo = season - ((Math.random() * (W + 1)) | 0);
    lo = Math.min(Math.max(lo, CFG.yMin), CFG.yMax - W);
    return [lo, lo + W];
  }

  function pickOptions(mystery) {
    const grp = mystery.grp || mystery.pos;
    const side = sideOf(grp);
    const samePos = (S.posIndex.get(grp) || []).map((id) => S.byId.get(id)).filter((b) => b.id !== mystery.id);
    const era = samePos.filter((b) => b.max >= mystery.season - 6 && b.min <= mystery.season + 6);
    const samePool = (era.length >= 2 ? era : samePos).slice();
    const picks = [];
    while (picks.length < 2 && samePool.length) picks.push(take(samePool));
    const sidePool = (S.sideIndex[side] || []).filter((b) => b.id !== mystery.id && !picks.some((x) => x.id === b.id));
    if (sidePool.length) picks.push(take(sidePool));
    const fb = samePos.filter((b) => !picks.some((x) => x.id === b.id));
    while (picks.length < 3 && fb.length) picks.push(take(fb));
    const opts = picks.map((b) => ({ id: b.id, name: b.name }));
    opts.push({ id: mystery.id, name: mystery.name });
    return shuffle(opts);
  }

  function nextRound() {
    S.mystery = rand(S.notable);
    S.answerId = S.mystery.id;
    S.exactShown = false;
    S.range = seasonRange(S.mystery.season);
    S.locked = false;
    S.options = pickOptions(S.mystery);
    render();
  }

  function render() {
    const m = S.mystery;
    $("#pos-line").textContent = posName(m.pos);
    $("#team-line").innerHTML = `Team: <img class="tlogo" src="${LEAGUE.logo(m.team)}" alt="" /> ${LEAGUE.name(m.team)}`;
    $("#season-badge").textContent = S.exactShown ? CFG.seasonFmt(m.season) : `Sometime ${CFG.seasonFmt(S.range[0])}–${CFG.seasonFmt(S.range[1])}`;

    const rows = [`<div class="s-k">Games</div><div class="s-v">${m.games || "—"}</div>`];
    for (const [k, label] of CFG.display) {
      if (m.stats[k] == null) continue;
      rows.push(`<div class="s-k">${label}</div><div class="s-v">${fmt(m.stats[k], decOf(k))}</div>`);
    }
    $("#statline").innerHTML = rows.join("");

    $("#lifelines").hidden = false;
    const eb = $("#reveal-exact");
    if (S.exactShown) { eb.disabled = true; eb.textContent = "🎯 exact season shown"; }
    else if (S.exactLeft <= 0) { eb.disabled = true; eb.textContent = "🎯 no exact reveals left"; }
    else { eb.disabled = false; eb.textContent = `🎯 Reveal exact season (${S.exactLeft})`; }

    const ol = $("#options");
    ol.innerHTML = "";
    for (const o of S.options) {
      const b = document.createElement("button");
      b.className = "opt";
      b.textContent = o.name;
      b.addEventListener("click", () => guess(o.id, b));
      ol.appendChild(b);
    }
    $("#banner").textContent = ""; $("#banner").className = "banner";
    $("#reveal").hidden = true;
    $("#next-row").hidden = true; $("#next-row").innerHTML = "";
  }

  function guess(id, btn) {
    if (S.locked) return;
    S.locked = true;
    const correct = id === S.answerId;
    const m = S.mystery;
    [...$("#options").children].forEach((b, i) => {
      b.disabled = true;
      if (S.options[i].id === S.answerId) b.classList.add("correct");
      else if (b === btn) b.classList.add("wrong");
    });
    $("#lifelines").hidden = true;
    const banner = $("#banner");
    if (correct) {
      S.score += 1;
      const sc = $("#score"); sc.textContent = S.score;
      sc.classList.remove("pop"); void sc.offsetWidth; sc.classList.add("pop");
      if (S.score > S.best) { S.best = S.score; setBest(S.best); $("#best").textContent = S.best; }
      banner.textContent = "Correct!"; banner.className = "banner good";
      showReveal(m); addBtn("Next player ›", "primary", nextRound);
    } else {
      banner.textContent = "Wrong!"; banner.className = "banner bad";
      showReveal(m); addBtn("New run", "primary", newRun);
    }
    addBtn("Back to EBK", "ghost", () => (location.href = "/" + SPORT));
  }

  function showReveal(m) {
    const r = $("#reveal");
    const img = `<img alt="" src="${m.headshot || "/img/avatar.svg"}" onerror="this.onerror=null;this.src='/img/avatar.svg'" />`;
    r.innerHTML = `${img}<div class="pr-name">${m.name}</div>` +
      `<div class="pr-meta">${CFG.seasonFmt(m.season)} · ${LEAGUE.name(m.team)} · ${posName(m.pos)}</div>`;
    r.hidden = false;
    $("#season-badge").textContent = CFG.seasonFmt(m.season);
    $("#team-line").innerHTML = `Team: <img class="tlogo" src="${LEAGUE.logo(m.team)}" alt="" /> ${LEAGUE.name(m.team)}`;
  }

  function addBtn(label, kind, fn) {
    const row = $("#next-row"); row.hidden = false;
    const b = document.createElement("button");
    b.className = "gbtn " + kind; b.textContent = label;
    b.addEventListener("click", fn); row.appendChild(b);
  }

  $("#reveal-exact").addEventListener("click", () => {
    if (S.locked || S.exactShown || S.exactLeft <= 0) return;
    S.exactShown = true; S.exactLeft--;
    render();
  });

  load();
})();
