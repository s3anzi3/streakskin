/* EBK · Guess the Stat Line — name the player from a mystery season's numbers. */
(() => {
  "use strict";
  const BEST_KEY = "ebk_statline_best";
  const $ = (s, r = document) => r.querySelector(s);

  const DISPLAY = [
    ["passing_yards", "Pass Yds"],
    ["passing_tds", "Pass TD"],
    ["rushing_yards", "Rush Yds"],
    ["rushing_tds", "Rush TD"],
    ["receptions", "Receptions"],
    ["receiving_yards", "Rec Yds"],
    ["receiving_tds", "Rec TD"],
    ["fantasy_points_ppr", "Fantasy (PPR)"],
  ];
  const PTS = [100, 60, 25]; // by hints used

  const S = {
    players: [], byId: new Map(), posIndex: new Map(), notable: [],
    mystery: null, answerId: null, hints: 0, score: 0, best: 0, locked: false,
  };

  const fmt = (v, d = 0) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d });
  const rand = (a) => a[(Math.random() * a.length) | 0];
  const getBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } };
  const setBest = (v) => { try { localStorage.setItem(BEST_KEY, v); } catch {} };

  function isNotable(p) {
    const s = p.stats;
    return (s.fantasy_points_ppr || 0) >= 60 ||
           (s.passing_yards || 0) >= 1200 ||
           (s.rushing_yards || 0) >= 450 ||
           (s.receiving_yards || 0) >= 450;
  }

  async function load() {
    try {
      const res = await fetch("/data/players.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      S.players = data.players;
      for (const p of S.players) {
        if (!p.id) continue;
        let b = S.byId.get(p.id);
        if (!b) { b = { id: p.id, name: p.name, pos: p.pos, min: p.season, max: p.season }; S.byId.set(p.id, b); }
        b.min = Math.min(b.min, p.season); b.max = Math.max(b.max, p.season);
        if (!S.posIndex.has(p.pos)) S.posIndex.set(p.pos, new Set());
        S.posIndex.get(p.pos).add(p.id);
      }
      for (const [pos, set] of S.posIndex) S.posIndex.set(pos, [...set]);
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

  function newRun() { S.score = 0; $("#score").textContent = "0"; nextRound(); }

  function pickOptions(mystery) {
    const samePos = (S.posIndex.get(mystery.pos) || []).map((id) => S.byId.get(id));
    // prefer players whose careers overlap the mystery's era (+/- 6 yrs)
    const era = samePos.filter((b) => b.id !== mystery.id &&
      b.max >= mystery.season - 6 && b.min <= mystery.season + 6);
    const pool = (era.length >= 3 ? era : samePos.filter((b) => b.id !== mystery.id)).slice();
    const picks = [];
    while (picks.length < 3 && pool.length) {
      const i = (Math.random() * pool.length) | 0;
      picks.push(pool.splice(i, 1)[0]);
    }
    const opts = picks.map((b) => ({ id: b.id, name: b.name }));
    opts.push({ id: mystery.id, name: mystery.name });
    for (let i = opts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return opts;
  }

  function nextRound() {
    S.mystery = rand(S.notable);
    S.answerId = S.mystery.id;
    S.hints = 0;
    S.locked = false;
    S.options = pickOptions(S.mystery);
    render();
  }

  function render() {
    const m = S.mystery;
    $("#pos-line").textContent = posName(m.pos);
    $("#season-badge").textContent = S.hints >= 2 ? m.season : "????";
    $("#team-line").textContent = S.hints >= 1 ? "Team: " + NFL.name(m.team) + " (" + m.team + ")" : "Team: hidden";

    const rows = [`<div class="s-k">Games</div><div class="s-v">${m.games || "—"}</div>`];
    for (const [k, label] of DISPLAY) {
      if (m.stats[k] == null) continue;
      rows.push(`<div class="s-k">${label}</div><div class="s-v">${fmt(m.stats[k], k.startsWith("fantasy") ? 1 : 0)}</div>`);
    }
    $("#statline").innerHTML = rows.join("");

    const hb = $("#hint-btn");
    hb.hidden = S.hints >= 2;
    hb.textContent = S.hints === 0 ? "Reveal team (−40)" : "Reveal season (−35)";

    const ol = $("#options");
    ol.innerHTML = "";
    for (const o of S.options) {
      const b = document.createElement("button");
      b.className = "opt";
      b.textContent = o.name;
      b.addEventListener("click", () => guess(o.id, b));
      ol.appendChild(b);
    }
    $("#banner").textContent = "";
    $("#banner").className = "banner";
    $("#reveal").hidden = true;
    $("#next-row").hidden = true;
    $("#next-row").innerHTML = "";
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
    $("#hint-btn").hidden = true;

    const banner = $("#banner");
    if (correct) {
      const pts = PTS[Math.min(S.hints, PTS.length - 1)];
      S.score += pts;
      const sc = $("#score");
      sc.textContent = S.score;
      sc.classList.remove("pop"); void sc.offsetWidth; sc.classList.add("pop");
      if (S.score > S.best) { S.best = S.score; setBest(S.best); $("#best").textContent = S.best; }
      banner.textContent = `Correct! +${pts}`;
      banner.className = "banner good";
      showReveal(m, false);
      addBtn("Next player ›", "primary", nextRound);
    } else {
      banner.textContent = "Wrong!";
      banner.className = "banner bad";
      showReveal(m, true);
      addBtn("New run", "primary", newRun);
    }
    addBtn("Back to EBK", "ghost", () => (location.href = "/"));
  }

  function showReveal(m, ended) {
    const r = $("#reveal");
    const img = m.headshot ? `<img alt="" src="${m.headshot}" />` : "";
    r.innerHTML = `${img}<div class="pr-name">${m.name}</div>` +
      `<div class="pr-meta">${m.season} · ${NFL.name(m.team)} · ${posName(m.pos)}</div>`;
    r.hidden = false;
    $("#season-badge").textContent = m.season;
    $("#team-line").textContent = "Team: " + NFL.name(m.team) + " (" + m.team + ")";
  }

  function addBtn(label, kind, fn) {
    const row = $("#next-row");
    row.hidden = false;
    const b = document.createElement("button");
    b.className = "gbtn " + kind;
    b.textContent = label;
    b.addEventListener("click", fn);
    row.appendChild(b);
  }

  function posName(p) {
    return { QB: "Quarterback", RB: "Running Back", FB: "Fullback", HB: "Running Back", WR: "Wide Receiver", TE: "Tight End" }[p] || p;
  }

  $("#hint-btn").addEventListener("click", () => {
    if (S.locked || S.hints >= 2) return;
    S.hints++;
    render();
  });

  load();
})();
