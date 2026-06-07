/* EBK · Career Path — all clues shown as facts; name the player.
   Sport-aware via <body data-sport>. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const rand = (a) => a[(Math.random() * a.length) | 0];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const take = (a) => a.splice((Math.random() * a.length) | 0, 1)[0];

  const SPORT = document.body.dataset.sport || "nfl";
  const LEAGUE = window[SPORT.toUpperCase()] || window.NFL;
  const DATA_URL = SPORT === "nfl" ? "/data/players.json" : "/data/" + SPORT + "/players.json";
  const BEST_KEY = SPORT === "nfl" ? "ebk_careerpath_best_v2" : "ebk_careerpath_" + SPORT + "_best";
  const REVEALS = 5;

  const CFG = {
    nfl: {
      icon: "🏈", seasonFmt: (y) => String(y),
      facts: ["position", "draft", "college", "career", "teampath"],
      posNames: {
        QB: "Quarterback", RB: "Running Back", FB: "Fullback", HB: "Running Back",
        WR: "Wide Receiver", TE: "Tight End",
        DE: "Defensive End", DT: "Defensive Tackle", NT: "Nose Tackle", DL: "Defensive Lineman", EDGE: "Edge Rusher",
        LB: "Linebacker", OLB: "Outside Linebacker", ILB: "Inside Linebacker", MLB: "Middle Linebacker",
        CB: "Cornerback", S: "Safety", FS: "Free Safety", SS: "Strong Safety", DB: "Defensive Back",
      },
      notable: [["fantasy_points_ppr", 60], ["passing_yards", 1200], ["rushing_yards", 450],
                ["receiving_yards", 450], ["def_sacks", 5], ["tackles", 75],
                ["def_interceptions", 3], ["def_fumbles_forced", 3], ["def_pass_defended", 12]],
    },
    nba: {
      icon: "🏀", seasonFmt: (y) => (y - 1) + "-" + String(y).slice(2),
      facts: ["position", "career", "teampath"],
      posNames: { PG: "Point Guard", SG: "Shooting Guard", SF: "Small Forward",
                  PF: "Power Forward", C: "Center", G: "Guard", F: "Forward" },
      notable: [["ppg", 10], ["pts", 500], ["rpg", 6], ["apg", 4]],
    },
    mlb: {
      icon: "⚾", seasonFmt: (y) => String(y),
      facts: ["position", "career", "teampath"],
      posNames: { P: "Pitcher", C: "Catcher", "1B": "First Base", "2B": "Second Base",
                  "3B": "Third Base", SS: "Shortstop", OF: "Outfield", DH: "Designated Hitter" },
      notable: [["hr", 12], ["hits", 120], ["rbi", 60], ["runs", 60], ["sb", 20],
                ["w", 8], ["k", 100], ["sv", 10]],
    },
    nhl: {
      icon: "🏒", seasonFmt: (y) => (y - 1) + "-" + String(y).slice(2),
      facts: ["position", "career", "teampath"],
      posNames: { C: "Center", L: "Left Wing", R: "Right Wing", D: "Defense", G: "Goalie", F: "Forward" },
      notable: [["pts", 30], ["g", 15], ["a", 20], ["w", 15], ["sv", 600], ["so", 3]],
    },
    cfb: {
      icon: "🏈", seasonFmt: (y) => String(y),
      facts: ["position", "career", "teampath"],
      posNames: { QB: "Quarterback", RB: "Running Back", FB: "Fullback", WR: "Wide Receiver",
                  TE: "Tight End", DL: "Defensive Line", DE: "Defensive End", DT: "Defensive Tackle",
                  LB: "Linebacker", OLB: "Outside Linebacker", ILB: "Inside Linebacker",
                  CB: "Cornerback", S: "Safety", SS: "Strong Safety", FS: "Free Safety",
                  DB: "Defensive Back", ATH: "Athlete" },
      notable: [["pyd", 1500], ["ptd", 12], ["ryd", 600], ["rtd", 8], ["recyd", 600],
                ["rec", 40], ["rectd", 6], ["tkl", 60], ["sk", 6]],
    },
  }[SPORT];

  const getBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } };
  const setBest = (v) => { try { localStorage.setItem(BEST_KEY, v); } catch {} };
  const isNotable = (s) => CFG.notable.some(([k, thr]) => (s[k] || 0) >= thr);
  const posName = (p) => CFG.posNames[p] || p;

  const S = {
    careers: new Map(), pool: [], colleges: {},
    mystery: null, options: [], hiddenIdx: 0, revealed: false, revealsLeft: REVEALS,
    score: 0, best: 0, locked: false,
  };

  async function load() {
    try {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const people = data.people || {};
      if (CFG.facts.includes("college")) {
        try { const cr = await fetch("/data/colleges.json", { cache: "no-cache" }); if (cr.ok) S.colleges = await cr.json(); } catch {}
      }

      for (const p of data.players) {
        if (!p.id) continue;
        let c = S.careers.get(p.id);
        if (!c) {
          const bio = people[p.id] || {};
          c = { id: p.id, name: p.name, pos: p.pos, headshot: p.headshot,
                college: bio.college || "", dy: bio.draftYear, dr: bio.draftRound,
                dp: bio.draftPick, dt: bio.draftTeam || "", years: new Map(), notable: false };
          S.careers.set(p.id, c);
        }
        c.years.set(p.season, p.team);
        if (p.headshot && !c.headshot) c.headshot = p.headshot;
        if (isNotable(p.stats)) c.notable = true;
      }
      for (const c of S.careers.values()) {
        if (!c.notable) continue;
        const yrs = [...c.years.keys()].sort((a, b) => a - b);
        c.min = yrs[0]; c.max = yrs[yrs.length - 1]; c.count = yrs.length;
        const path = [];
        for (const y of yrs) { const k = LEAGUE.keyOf(c.years.get(y)); if (path[path.length - 1] !== k) path.push(k); }
        c.path = path;
        S.pool.push(c);
      }

      S.best = getBest();
      $("#best").textContent = S.best;
      $("#loading").hidden = true;
      $("#game").hidden = false;
      newRun();
    } catch (e) {
      $("#loading").textContent = "Couldn't load player data. " + e.message;
    }
  }

  const teamTag = (k) => `<img class="tlogo" src="${LEAGUE.logo(k)}" alt="" /> ${LEAGUE.name(k)}`;
  const collegeTag = (name) => { if (!name) return "Unknown"; const u = S.colleges[name]; return u ? `<img class="tlogo" src="${u}" alt="" /> ${name}` : name; };

  function facts(c) {
    const draft = c.dy
      ? `${c.dy} · Round ${c.dr || "?"} · Pick ${c.dp || "?"}${c.dt ? " · " + teamTag(c.dt) : ""}`
      : "Undrafted";
    const all = {
      position: { icon: CFG.icon, k: "Position", v: posName(c.pos) },
      draft: { icon: "🎟️", k: "Draft", v: draft },
      college: { icon: "🎓", k: "College", v: collegeTag(c.college) },
      career: { icon: "📅", k: "Career", v: `${CFG.seasonFmt(c.min)}–${CFG.seasonFmt(c.max)} · ${c.count} season${c.count > 1 ? "s" : ""}` },
      teampath: { icon: "🧭", k: "Team path", v: c.path.map(teamTag).join("  →  ") },
    };
    return CFG.facts.map((key) => all[key]);
  }

  function pickOptions(c) {
    let cand = S.pool.filter((o) => o.id !== c.id && o.max >= c.min - 8 && o.min <= c.max + 8);
    if (cand.length < 6) cand = S.pool.filter((o) => o.id !== c.id);
    const byPos = {};
    cand.forEach((o) => { (byPos[o.pos] = byPos[o.pos] || []).push(o); });
    const picks = [];
    if (byPos[c.pos] && byPos[c.pos].length) picks.push(take(byPos[c.pos]));
    else { const sp = S.pool.filter((o) => o.id !== c.id && o.pos === c.pos); if (sp.length) picks.push(take(sp)); }
    for (const p of shuffle(Object.keys(byPos).filter((p) => p !== c.pos))) {
      if (picks.length >= 3) break;
      if (byPos[p].length) picks.push(take(byPos[p]));
    }
    const rest = cand.filter((o) => !picks.includes(o));
    while (picks.length < 3 && rest.length) picks.push(take(rest));
    const opts = picks.map((o) => ({ id: o.id, name: o.name }));
    opts.push({ id: c.id, name: c.name });
    return shuffle(opts);
  }

  function newRun() { S.score = 0; S.revealsLeft = REVEALS; $("#score").textContent = "0"; nextRound(); }

  function nextRound() {
    S.mystery = rand(S.pool);
    S.hiddenIdx = (Math.random() * CFG.facts.length) | 0;
    S.revealed = false;
    S.options = pickOptions(S.mystery);
    S.solved = false;
    S.wrongId = null;
    $("#banner").textContent = ""; $("#banner").className = "banner";
    $("#reveal").hidden = true;
    $("#next-row").hidden = true; $("#next-row").innerHTML = "";
    render();
  }

  function render() {
    const fs = facts(S.mystery);
    const cl = $("#facts");
    cl.innerHTML = "";
    fs.forEach((f, i) => {
      const hidden = i === S.hiddenIdx && !S.revealed && !S.solved;
      const div = document.createElement("div");
      div.className = "clue" + (hidden ? " locked" : "");
      div.innerHTML = `<span class="c-icon">${hidden ? "🔒" : f.icon}</span>` +
        `<div><div class="c-k">${f.k}</div><div class="c-v">${hidden ? "hidden — use a reveal" : f.v}</div></div>`;
      cl.appendChild(div);
    });

    $("#lifelines").hidden = S.solved;
    const pb = $("#reveal-fact");
    if (S.revealed) { pb.disabled = true; pb.textContent = "🔎 fact revealed"; }
    else if (S.revealsLeft <= 0) { pb.disabled = true; pb.textContent = "🔎 no reveals left"; }
    else { pb.disabled = false; pb.textContent = `🔎 Reveal ${fs[S.hiddenIdx].k} (${S.revealsLeft})`; }

    const ol = $("#options");
    ol.innerHTML = "";
    S.options.forEach((o) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.textContent = o.name;
      if (S.solved) {
        b.disabled = true;
        if (o.id === S.mystery.id) b.classList.add("correct");
        else if (o.id === S.wrongId) b.classList.add("wrong");
      } else {
        b.addEventListener("click", () => guess(o.id));
      }
      ol.appendChild(b);
    });
  }

  function guess(id) {
    if (S.solved) return;
    S.solved = true;
    const c = S.mystery;
    const correct = id === c.id;
    S.wrongId = correct ? null : id;
    render();
    const banner = $("#banner");
    if (correct) {
      S.score += 1;
      const sc = $("#score"); sc.textContent = S.score;
      sc.classList.remove("pop"); void sc.offsetWidth; sc.classList.add("pop");
      if (S.score > S.best) { S.best = S.score; setBest(S.best); $("#best").textContent = S.best; }
      banner.textContent = "Correct!"; banner.className = "banner good";
      showReveal(c);
      addBtn("Next player ›", "primary", nextRound);
    } else {
      banner.textContent = "Wrong!"; banner.className = "banner bad";
      showReveal(c);
      addBtn("New run", "primary", newRun);
    }
    addBtn("Back to EBK", "ghost", () => (location.href = "/" + SPORT));
  }

  function showReveal(c) {
    const r = $("#reveal");
    const img = `<img alt="" src="${c.headshot || "/img/avatar.svg"}" onerror="this.onerror=null;this.src='/img/avatar.svg'" />`;
    r.innerHTML = `${img}<div class="pr-name">${c.name}</div>` +
      `<div class="pr-meta">${posName(c.pos)} · ${CFG.seasonFmt(c.min)}–${CFG.seasonFmt(c.max)}</div>`;
    r.hidden = false;
  }

  function addBtn(label, kind, fn) {
    const row = $("#next-row"); row.hidden = false;
    const b = document.createElement("button");
    b.className = "gbtn " + kind; b.textContent = label;
    b.addEventListener("click", fn); row.appendChild(b);
  }

  $("#reveal-fact").addEventListener("click", () => {
    if (S.solved || S.revealed || S.revealsLeft <= 0) return;
    S.revealed = true; S.revealsLeft--;
    render();
  });

  load();
})();
