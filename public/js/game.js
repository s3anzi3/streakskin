/* NFL Higher / Lower — static front-end. Reads data/players.json. */
(() => {
  "use strict";

  const BEST_KEY = "nflhl_best";        // localStorage: best streak per category
  const REVEAL_MS = 750;                // pause to show the revealed number
  const $ = (sel, root = document) => root.querySelector(sel);

  const state = {
    data: null,
    category: null,   // {key,label,min,decimals,icon}
    pool: [],         // player-seasons eligible for the chosen category
    anchor: null,
    challenger: null,
    streak: 0,
    best: 0,
    locked: false,    // ignore input during reveal animation
  };

  // ---- utilities ------------------------------------------------------------

  const randItem = (arr) => arr[(Math.random() * arr.length) | 0];

  function fmt(value, decimals) {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
  }

  function bestStore() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; }
    catch { return {}; }
  }
  function getBest(catKey) { return bestStore()[catKey] || 0; }
  function setBest(catKey, value) {
    const store = bestStore();
    store[catKey] = value;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(store)); } catch { /* ignore */ }
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("is-active"));
    $("#" + id).classList.add("is-active");
  }

  // ---- data load ------------------------------------------------------------

  async function load() {
    try {
      const res = await fetch("data/players.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
      buildCategoryGrid();
    } catch (err) {
      $("#loading").textContent =
        "Couldn't load player data. Run a local server from /public (see README): " + err.message;
    }
  }

  function eligibleCount(catKey) {
    return state.data.players.reduce(
      (n, p) => (p.stats[catKey] != null ? n + 1 : n), 0);
  }

  function buildCategoryGrid() {
    const grid = $("#category-grid");
    grid.innerHTML = "";
    state.data.categories.forEach((cat) => {
      const count = eligibleCount(cat.key);
      const el = document.createElement("button");
      el.className = "cat-card";
      el.innerHTML =
        `<span class="cat-icon">${cat.icon}</span>` +
        `<span class="cat-label">${cat.label}</span>` +
        `<span class="cat-count">${count.toLocaleString()} seasons</span>`;
      el.addEventListener("click", () => startRun(cat));
      grid.appendChild(el);
    });
    $("#loading").hidden = true;
    grid.hidden = false;
    $("#start-best").textContent = Math.max(
      0, ...state.data.categories.map((c) => getBest(c.key)));
  }

  // ---- game flow ------------------------------------------------------------

  function startRun(cat) {
    state.category = cat;
    state.pool = state.data.players.filter((p) => p.stats[cat.key] != null);
    state.streak = 0;
    state.best = getBest(cat.key);
    state.anchor = randItem(state.pool);
    state.challenger = pickChallenger(state.anchor);

    $("#hud-cat").textContent = `${cat.icon} ${cat.label}`;
    $("#streak").textContent = "0";
    $("#best").textContent = state.best;
    showScreen("screen-game");
    renderRound();
  }

  // Pick a different player-season whose value isn't an exact tie with the anchor.
  function pickChallenger(anchor) {
    const key = state.category.key;
    let pick;
    for (let i = 0; i < 50; i++) {
      pick = randItem(state.pool);
      if (pick !== anchor &&
          pick.stats[key] !== anchor.stats[key]) {
        return pick;
      }
    }
    return pick; // fallback (tiny pools)
  }

  function statValue(p) { return p.stats[state.category.key]; }

  function fillCard(cardSel, p, revealed) {
    const card = $(cardSel);
    const dec = state.category.decimals;
    card.classList.remove("correct", "wrong");
    $(".card-name", card).textContent = p.name;
    $(".card-meta", card).textContent =
      `${p.season} • ${p.team || "—"} • ${p.pos || "—"}`;

    const img = $(".card-photo img", card);
    if (p.headshot) { img.src = p.headshot; img.style.display = ""; }
    else { img.removeAttribute("src"); img.style.display = "none"; }

    const valEl = $(".stat-value", card);
    const lblEl = $(".stat-label", card);
    if (revealed) {
      valEl.textContent = fmt(statValue(p), dec);
      lblEl.textContent = state.category.label;
    } else {
      valEl.textContent = "";
      lblEl.textContent = "";
    }
  }

  function renderRound() {
    state.locked = false;
    fillCard("#card-anchor", state.anchor, true);
    fillCard("#card-challenger", state.challenger, false);

    $(".hl-stat", $("#prompt")).textContent =
      state.category.label.toLowerCase();
    $("#prompt").classList.remove("hidden");
    $(".guess-btns", $("#card-challenger")).classList.remove("hidden");
    $(".card-stat.reveal", $("#card-challenger")).classList.remove("show");
    $("#verdict").textContent = "";
    $("#verdict").className = "verdict";
  }

  function guess(direction) {
    if (state.locked) return;
    state.locked = true;

    const a = statValue(state.anchor);
    const c = statValue(state.challenger);
    const correct = (direction === "higher") ? c > a : c < a;

    // reveal challenger's number
    $("#prompt").classList.add("hidden");
    $(".guess-btns", $("#card-challenger")).classList.add("hidden");
    const reveal = $(".card-stat.reveal", $("#card-challenger"));
    $(".stat-value", reveal).textContent = fmt(c, state.category.decimals);
    $(".stat-label", reveal).textContent = state.category.label;
    reveal.classList.add("show");

    const challengerCard = $("#card-challenger");
    challengerCard.classList.add(correct ? "correct" : "wrong");

    const verdict = $("#verdict");
    if (correct) {
      state.streak += 1;
      $("#streak").textContent = state.streak;
      if (state.streak > state.best) {
        state.best = state.streak;
        setBest(state.category.key, state.best);
        $("#best").textContent = state.best;
      }
      verdict.textContent = "Correct!";
      verdict.className = "verdict good";
      setTimeout(advance, REVEAL_MS);
    } else {
      verdict.textContent = "Wrong!";
      verdict.className = "verdict bad";
      setTimeout(gameOver, REVEAL_MS);
    }
  }

  function advance() {
    // challenger becomes the new anchor; draw a fresh challenger
    state.anchor = state.challenger;
    state.challenger = pickChallenger(state.anchor);
    renderRound();
  }

  function gameOver() {
    const cat = state.category;
    const a = state.anchor, c = state.challenger;
    $("#final-streak").textContent = state.streak;
    const isBest = state.streak > 0 && state.streak >= getBest(cat.key) &&
                   state.streak === state.best;
    $("#new-best").hidden = !(isBest && state.streak > 0);
    $("#over-detail").innerHTML =
      `<strong>${c.name}</strong> (${c.season}) had ` +
      `<strong>${fmt(statValue(c), cat.decimals)}</strong> ${cat.label.toLowerCase()}, ` +
      `vs <strong>${a.name}</strong> (${a.season}) with ` +
      `<strong>${fmt(statValue(a), cat.decimals)}</strong>.`;
    showScreen("screen-over");
  }

  // ---- wiring ---------------------------------------------------------------

  document.querySelectorAll(".guess-btn").forEach((b) =>
    b.addEventListener("click", () => guess(b.dataset.dir)));
  $("#again-btn").addEventListener("click", () => startRun(state.category));
  $("#menu-btn").addEventListener("click", () => { buildCategoryGrid(); showScreen("screen-start"); });
  $("#quit-btn").addEventListener("click", () => { buildCategoryGrid(); showScreen("screen-start"); });

  // keyboard: arrow up = higher, arrow down = lower
  document.addEventListener("keydown", (e) => {
    if (!$("#screen-game").classList.contains("is-active")) return;
    if (e.key === "ArrowUp") guess("higher");
    if (e.key === "ArrowDown") guess("lower");
  });

  load();
})();
