/* EBK · Career Path — all clues shown as facts; name the player. */
(() => {
  "use strict";
  const BEST_KEY = "ebk_careerpath_best_v2"; // v2: facts model, score = correct
  const REVEALS = 5;                          // "reveal hidden fact" lifelines per run
  const $ = (s, r = document) => r.querySelector(s);
  const rand = (a) => a[(Math.random() * a.length) | 0];
  const getBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } };
  const setBest = (v) => { try { localStorage.setItem(BEST_KEY, v); } catch {} };

  const S = {
    careers: new Map(), pool: [],
    mystery: null, options: [], hiddenIdx: 0, revealed: false, revealsLeft: REVEALS,
    score: 0, best: 0, locked: false,
  };

  function isNotable(s) {
    return (s.fantasy_points_ppr || 0) >= 60 || (s.passing_yards || 0) >= 1200 ||
           (s.rushing_yards || 0) >= 450 || (s.receiving_yards || 0) >= 450 ||
           (s.def_sacks || 0) >= 5 || (s.tackles || 0) >= 75 ||
           (s.def_interceptions || 0) >= 3 || (s.def_fumbles_forced || 0) >= 3 ||
           (s.def_pass_defended || 0) >= 12;
  }
  const POS_NAMES = {
    QB: "Quarterback", RB: "Running Back", FB: "Fullback", HB: "Running Back",
    WR: "Wide Receiver", TE: "Tight End",
    DE: "Defensive End", DT: "Defensive Tackle", NT: "Nose Tackle", DL: "Defensive Lineman", EDGE: "Edge Rusher",
    LB: "Linebacker", OLB: "Outside Linebacker", ILB: "Inside Linebacker", MLB: "Middle Linebacker",
    CB: "Cornerback", S: "Safety", FS: "Free Safety", SS: "Strong Safety", DB: "Defensive Back",
  };
  function posName(p) { return POS_NAMES[p] || p; }

  async function load() {
    try {
      const res = await fetch("/data/players.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const people = data.people || {};

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
        for (const y of yrs) { const k = NFL.keyOf(c.years.get(y)); if (path[path.length - 1] !== k) path.push(k); }
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

  function facts(c) {
    const draft = c.dy
      ? `${c.dy} · Round ${c.dr || "?"} · Pick ${c.dp || "?"}${c.dt ? " (" + NFL.name(c.dt) + ")" : ""}`
      : "Undrafted";
    return [
      { icon: "🏈", k: "Position", v: posName(c.pos) },
      { icon: "🎟️", k: "Draft", v: draft },
      { icon: "🎓", k: "College", v: c.college || "Unknown" },
      { icon: "📅", k: "Career", v: `${c.min}–${c.max} · ${c.count} season${c.count > 1 ? "s" : ""}` },
      { icon: "🧭", k: "Team path", v: c.path.map((k) => NFL.name(k)).join("  →  ") },
    ];
  }

  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const take = (a) => a.splice((Math.random() * a.length) | 0, 1)[0];

  // 4 options that span multiple positions: answer + 1 same-position distractor
  // (so a position reveal isn't an auto-win) + 2 other-position distractors.
  function pickOptions(c) {
    let cand = S.pool.filter((o) => o.id !== c.id && o.max >= c.min - 8 && o.min <= c.max + 8);
    if (cand.length < 6) cand = S.pool.filter((o) => o.id !== c.id);
    const byPos = {};
    cand.forEach((o) => { (byPos[o.pos] = byPos[o.pos] || []).push(o); });

    const picks = [];
    // one same-position distractor (fall back to whole pool if needed)
    if (byPos[c.pos] && byPos[c.pos].length) picks.push(take(byPos[c.pos]));
    else { const sp = S.pool.filter((o) => o.id !== c.id && o.pos === c.pos); if (sp.length) picks.push(take(sp)); }
    // distractors from other positions, each a distinct position
    for (const p of shuffle(Object.keys(byPos).filter((p) => p !== c.pos))) {
      if (picks.length >= 3) break;
      if (byPos[p].length) picks.push(take(byPos[p]));
    }
    // top up if still short (small era pools)
    const rest = cand.filter((o) => !picks.includes(o));
    while (picks.length < 3 && rest.length) picks.push(take(rest));

    const opts = picks.map((o) => ({ id: o.id, name: o.name }));
    opts.push({ id: c.id, name: c.name });
    return shuffle(opts);
  }

  function newRun() {
    S.score = 0; S.revealsLeft = REVEALS;
    $("#score").textContent = "0";
    nextRound();
  }

  function nextRound() {
    S.mystery = rand(S.pool);
    S.hiddenIdx = (Math.random() * 5) | 0;   // hide one of the 5 facts
    S.revealed = false;
    S.options = pickOptions(S.mystery);
    S.locked = false;
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
      const hidden = i === S.hiddenIdx && !S.revealed && !S.locked;
      const div = document.createElement("div");
      div.className = "clue" + (hidden ? " locked" : "");
      div.innerHTML = `<span class="c-icon">${hidden ? "🔒" : f.icon}</span>` +
        `<div><div class="c-k">${f.k}</div><div class="c-v">${hidden ? "hidden — use a reveal" : f.v}</div></div>`;
      cl.appendChild(div);
    });

    $("#lifelines").hidden = S.locked;
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
      if (S.locked) {
        b.disabled = true;
        if (o.id === S.mystery.id) b.classList.add("correct");
      } else {
        b.addEventListener("click", () => guess(o.id, b));
      }
      ol.appendChild(b);
    });
  }

  function guess(id, btn) {
    if (S.locked) return;
    S.locked = true;
    const c = S.mystery;
    const correct = id === c.id;

    [...$("#options").children].forEach((b, i) => {
      b.disabled = true;
      if (S.options[i].id === c.id) b.classList.add("correct");
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
      showReveal(c);
      addBtn("Next player ›", "primary", nextRound);
    } else {
      banner.textContent = "Wrong!"; banner.className = "banner bad";
      showReveal(c);
      addBtn("New run", "primary", newRun);
    }
    addBtn("Back to EBK", "ghost", () => (location.href = "/"));
  }

  function showReveal(c) {
    const r = $("#reveal");
    const img = c.headshot ? `<img alt="" src="${c.headshot}" />` : "";
    r.innerHTML = `${img}<div class="pr-name">${c.name}</div>` +
      `<div class="pr-meta">${posName(c.pos)} · ${c.college || "—"} · ${c.min}–${c.max}</div>`;
    r.hidden = false;
  }

  function addBtn(label, kind, fn) {
    const row = $("#next-row"); row.hidden = false;
    const b = document.createElement("button");
    b.className = "gbtn " + kind; b.textContent = label;
    b.addEventListener("click", fn); row.appendChild(b);
  }

  $("#reveal-fact").addEventListener("click", () => {
    if (S.locked || S.revealed || S.revealsLeft <= 0) return;
    S.revealed = true; S.revealsLeft--;
    render();
  });

  load();
})();
