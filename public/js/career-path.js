/* EBK · Career Path — trace draft / college / team clues to the player. */
(() => {
  "use strict";
  const BEST_KEY = "ebk_careerpath_best";
  const $ = (s, r = document) => r.querySelector(s);
  const rand = (a) => a[(Math.random() * a.length) | 0];
  const getBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } };
  const setBest = (v) => { try { localStorage.setItem(BEST_KEY, v); } catch {} };
  const PTS = [100, 70, 45, 25];

  const S = {
    careers: new Map(), posIndex: new Map(), pool: [],
    mystery: null, clues: [], revealed: 1, options: [], eliminated: new Set(),
    score: 0, best: 0, locked: false,
  };

  function isNotable(s) {
    return (s.fantasy_points_ppr || 0) >= 60 || (s.passing_yards || 0) >= 1200 ||
           (s.rushing_yards || 0) >= 450 || (s.receiving_yards || 0) >= 450;
  }

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
        if (!S.posIndex.has(c.pos)) S.posIndex.set(c.pos, []);
        S.posIndex.get(c.pos).push(c);
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

  function buildClues(c) {
    const draft = c.dy
      ? `${c.dy} · Round ${c.dr || "?"} · Pick ${c.dp || "?"}${c.dt ? " (" + NFL.name(c.dt) + ")" : ""}`
      : "Undrafted";
    return [
      { icon: "🎟️", k: "Draft", v: draft },
      { icon: "🎓", k: "College", v: c.college || "Unknown" },
      { icon: "📅", k: "Career", v: `${c.min}–${c.max} · ${c.count} season${c.count > 1 ? "s" : ""}` },
      { icon: "🧭", k: "Team path", v: c.path.map((k) => NFL.name(k)).join("  →  ") },
    ];
  }

  function pickOptions(c) {
    const same = (S.posIndex.get(c.pos) || []).filter((o) =>
      o.id !== c.id && o.max >= c.min - 8 && o.min <= c.max + 8);
    const pool = (same.length >= 3 ? same : (S.posIndex.get(c.pos) || []).filter((o) => o.id !== c.id)).slice();
    const picks = [];
    while (picks.length < 3 && pool.length) picks.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
    const opts = picks.map((o) => ({ id: o.id, name: o.name }));
    opts.push({ id: c.id, name: c.name });
    for (let i = opts.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return opts;
  }

  function newRun() { S.score = 0; $("#score").textContent = "0"; nextRound(); }

  function nextRound() {
    S.mystery = rand(S.pool);
    S.clues = buildClues(S.mystery);
    S.revealed = 1;
    S.eliminated = new Set();
    S.options = pickOptions(S.mystery);
    S.solved = false;
    $("#banner").textContent = ""; $("#banner").className = "banner";
    $("#reveal").hidden = true;
    $("#next-row").hidden = true; $("#next-row").innerHTML = "";
    render();
  }

  function render() {
    $("#pos-line").textContent = posName(S.mystery.pos);
    const cl = $("#clues");
    cl.innerHTML = "";
    S.clues.forEach((c, i) => {
      const shown = i < S.revealed;
      const div = document.createElement("div");
      div.className = "clue" + (shown ? "" : " locked");
      div.innerHTML = shown
        ? `<span class="c-icon">${c.icon}</span><div><div class="c-k">${c.k}</div><div class="c-v">${c.v}</div></div>`
        : `<span class="c-icon">🔒</span><div><div class="c-k">${c.k}</div><div class="c-v">hidden</div></div>`;
      cl.appendChild(div);
    });
    $("#clue-btn").hidden = S.solved || S.revealed >= S.clues.length;

    const ol = $("#options");
    ol.innerHTML = "";
    S.options.forEach((o) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.textContent = o.name;
      if (S.solved) {
        b.disabled = true;
        if (o.id === S.mystery.id) b.classList.add("correct");
        else if (S.eliminated.has(o.id)) b.classList.add("wrong");
      } else if (S.eliminated.has(o.id)) {
        b.disabled = true; b.classList.add("wrong");
      } else {
        b.addEventListener("click", () => guess(o.id));
      }
      ol.appendChild(b);
    });
  }

  function revealNext() { if (!S.solved && S.revealed < S.clues.length) { S.revealed++; render(); } }

  function guess(id) {
    if (S.solved) return;
    const c = S.mystery;
    if (id === c.id) {
      S.solved = true;
      const pts = PTS[Math.min(S.revealed - 1, PTS.length - 1)];
      S.score += pts;
      const sc = $("#score"); sc.textContent = S.score;
      sc.classList.remove("pop"); void sc.offsetWidth; sc.classList.add("pop");
      if (S.score > S.best) { S.best = S.score; setBest(S.best); $("#best").textContent = S.best; }
      S.revealed = S.clues.length;
      render();
      const banner = $("#banner"); banner.textContent = `Correct! +${pts}`; banner.className = "banner good";
      showReveal(c);
      addBtn("Next player ›", "primary", nextRound);
      addBtn("Back to EBK", "ghost", () => (location.href = "/"));
    } else {
      S.eliminated.add(id);
      if (S.revealed < S.clues.length) S.revealed++;
      render();
      const banner = $("#banner"); banner.textContent = "Not that one — here's another clue."; banner.className = "banner bad";
    }
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

  function posName(p) {
    return { QB: "Quarterback", RB: "Running Back", FB: "Fullback", HB: "Running Back", WR: "Wide Receiver", TE: "Tight End" }[p] || p;
  }

  $("#clue-btn").addEventListener("click", () => { if (!S.locked) revealNext(); });

  load();
})();
