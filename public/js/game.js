/* StreakSkin — static front-end. Reads data/players.json.
   Enhanced motion via anime.js when present; degrades to CSS/instant otherwise. */
(() => {
  "use strict";

  const SPORT = document.body.dataset.sport || "nfl";
  const LEAGUE = window[SPORT.toUpperCase()] || window.NFL; // team logo/name helper
  const DATA_URL = SPORT === "nfl" ? "/data/players.json" : "/data/" + SPORT + "/players.json";
  const BEST_KEY = SPORT === "nfl" ? "ebk_best" : "ebk_" + SPORT + "_best";
  (function () { if (!window.EBKF) { var s = document.createElement("script"); s.src = "/js/ebk-firebase.js"; document.head.appendChild(s); } })();
  const ebkRecord = (score) => { try { window.EBKF && EBKF.recordScore(SPORT, "higher-lower", score); } catch (e) {} };
  const REVEAL_PAUSE = 1100;            // ms to admire the reveal before advancing
  const TIME_LIMIT = 10000;             // ms to make each higher/lower guess
  const $ = (sel, root = document) => root.querySelector(sel);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const A = () => (reduceMotion ? null : window.anime); // anime.js if loaded & motion allowed

  const state = {
    data: null,
    category: null,   // {key,label,min,decimals,icon}
    pool: [],
    anchor: null,
    challenger: null,
    streak: 0,
    best: 0,
    locked: false,
  };

  // ---- utilities ------------------------------------------------------------

  const randItem = (arr) => arr[(Math.random() * arr.length) | 0];

  function fmt(value, decimals) {
    return Number(value).toLocaleString("en-US", {
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

  // Count a number element from 0 -> value with anime.js, or set instantly.
  function countTo(el, value, decimals) {
    const anime = A();
    if (!anime) { el.textContent = fmt(value, decimals); return; }
    const obj = { n: 0 };
    anime({
      targets: obj,
      n: value,
      round: decimals === 0 ? 1 : Math.pow(10, decimals),
      duration: 900,
      easing: "easeOutExpo",
      update: () => { el.textContent = fmt(obj.n, decimals); },
    });
  }

  // ---- data load ------------------------------------------------------------

  async function load() {
    try {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.data = await res.json();
      buildCategoryGrid();
    } catch (err) {
      $("#loading").textContent =
        "Couldn't load player data. Serve /public over HTTP (see README): " + err.message;
    }
  }

  const eligibleCount = (catKey) =>
    state.data.players.reduce((n, p) => (p.stats[catKey] != null ? n + 1 : n), 0);

  function buildCategoryGrid() {
    const grid = $("#category-grid");
    grid.innerHTML = "";
    state.data.categories.forEach((cat) => {
      const el = document.createElement("button");
      el.className = "cat-card";
      el.innerHTML =
        `<span class="cat-icon">${cat.icon}</span>` +
        `<span class="cat-label">${cat.label}</span>` +
        `<span class="cat-count">${eligibleCount(cat.key).toLocaleString()} seasons</span>`;
      el.addEventListener("click", () => startRun(cat));
      grid.appendChild(el);
    });
    $("#loading").hidden = true;
    grid.hidden = false;
    $("#start-best").textContent = Math.max(
      0, ...state.data.categories.map((c) => getBest(c.key)));

    // staggered entrance
    const anime = A();
    if (anime) {
      anime({
        targets: grid.children,
        opacity: [0, 1],
        translateY: [16, 0],
        delay: anime.stagger(45),
        duration: 420,
        easing: "easeOutCubic",
      });
    }
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
    renderRound(true);
  }

  // Different player-season whose value isn't an exact tie with the anchor.
  function pickChallenger(anchor) {
    const key = state.category.key;
    let pick;
    for (let i = 0; i < 60; i++) {
      pick = randItem(state.pool);
      if (pick !== anchor && pick.stats[key] !== anchor.stats[key]) return pick;
    }
    return pick;
  }

  const statValue = (p) => p.stats[state.category.key];

  // ---- guess timer ----------------------------------------------------------

  let timerTO = null, timerLowTO = null, timerEl = null;

  function ensureTimer() {
    if (timerEl) return timerEl;
    const sg = $("#screen-game");
    sg.style.position = "relative";
    const wrap = document.createElement("div");
    wrap.className = "hl-timer";
    wrap.innerHTML = '<div class="fill"></div>';
    sg.appendChild(wrap);
    timerEl = wrap;
    return wrap;
  }

  function startTimer() {
    const fill = $(".fill", ensureTimer());
    clearTimeout(timerTO); clearTimeout(timerLowTO);
    fill.classList.remove("low");
    fill.style.transition = "none";
    fill.style.width = "100%";
    void fill.offsetWidth;                       // flush so the transition restarts
    fill.style.transition = `width ${TIME_LIMIT}ms linear`;
    fill.style.width = "0%";
    timerLowTO = setTimeout(() => { if (!state.locked) fill.classList.add("low"); }, TIME_LIMIT - 3000);
    timerTO = setTimeout(timeUp, TIME_LIMIT);
  }

  function stopTimer() {
    clearTimeout(timerTO); clearTimeout(timerLowTO);
    if (!timerEl) return;
    const fill = $(".fill", timerEl);
    const w = getComputedStyle(fill).width;     // freeze at current position
    fill.style.transition = "none";
    fill.style.width = w;
  }

  function timeUp() {
    if (state.locked) return;
    state.locked = true;
    stopTimer();
    const c = statValue(state.challenger);
    $("#ask").classList.add("hide");
    const reveal = $("#challenger-reveal");
    reveal.classList.add("show");
    countTo($(".stat-value", reveal), c, state.category.decimals);
    const panel = $("#panel-challenger");
    panel.classList.add("result-wrong");
    if (!reduceMotion) panel.classList.add("shake");
    const verdict = $("#verdict");
    verdict.textContent = "⏱ Time's up!";
    verdict.className = "verdict bad show";
    setTimeout(gameOver, REVEAL_PAUSE + 200);
  }

  function fillPanel(sel, p, revealed) {
    const panel = $(sel);
    const dec = state.category.decimals;
    panel.classList.remove("result-correct", "result-wrong", "shake");

    $(".panel-name", panel).textContent = p.name;
    const logo = (p.team && LEAGUE) ? `<img class="tlogo" src="${LEAGUE.logo(p.team)}" alt="" /> ` : "";
    $(".panel-meta", panel).innerHTML = `${p.seasonLabel || p.season} · ${logo}${p.team || "—"} · ${p.pos || "—"}`;

    const img = $(".panel-photo img", panel);
    const bg = $(".panel-bg", panel);
    img.style.display = "";
    img.onerror = () => { img.onerror = null; img.src = "/img/avatar.svg"; };
    img.src = p.headshot || "/img/avatar.svg";
    bg.style.backgroundImage = p.headshot ? `url("${p.headshot}")` : "";

    if (revealed) {
      $(".stat-value", panel).textContent = fmt(statValue(p), dec);
      $(".stat-label", panel).textContent = state.category.label;
    }
  }

  function renderRound(animateIn) {
    state.locked = false;

    fillPanel("#panel-anchor", state.anchor, true);
    fillPanel("#panel-challenger", state.challenger, false);

    // challenger back to "ask" mode
    $(".hl-stat", $("#ask")).textContent = state.category.label;
    $("#ask").classList.remove("hide");
    const reveal = $("#challenger-reveal");
    reveal.classList.remove("show");
    $(".stat-value", reveal).textContent = "0";
    $(".stat-label", reveal).textContent = state.category.label;

    $("#verdict").className = "verdict";

    const anime = A();
    if (animateIn && anime) {
      anime({
        targets: ["#panel-anchor .panel-body", "#panel-challenger .panel-body"],
        opacity: [0, 1],
        translateY: [18, 0],
        delay: anime.stagger(90),
        duration: 420,
        easing: "easeOutCubic",
      });
    }
    startTimer();
  }

  function guess(direction) {
    if (state.locked) return;
    state.locked = true;
    stopTimer();

    const a = statValue(state.anchor);
    const c = statValue(state.challenger);
    const correct = (direction === "higher") ? c > a : c < a;

    // swap challenger to reveal mode + count up
    $("#ask").classList.add("hide");
    const reveal = $("#challenger-reveal");
    reveal.classList.add("show");
    countTo($(".stat-value", reveal), c, state.category.decimals);

    const panel = $("#panel-challenger");
    panel.classList.add(correct ? "result-correct" : "result-wrong");

    const verdict = $("#verdict");
    if (correct) {
      state.streak += 1;
      bumpStreak();
      verdict.textContent = "Correct! +1";
      verdict.className = "verdict good show";
      setTimeout(advance, REVEAL_PAUSE);
    } else {
      if (!reduceMotion) panel.classList.add("shake");
      verdict.textContent = "Wrong!";
      verdict.className = "verdict bad show";
      setTimeout(gameOver, REVEAL_PAUSE + 200);
    }
  }

  function bumpStreak() {
    const el = $("#streak");
    el.textContent = state.streak;
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
    if (state.streak > state.best) {
      state.best = state.streak;
      setBest(state.category.key, state.best);
      $("#best").textContent = state.best;
    }
  }

  function advance() {
    state.anchor = state.challenger;          // challenger becomes the new anchor
    state.challenger = pickChallenger(state.anchor);
    const anime = A();
    if (anime) {
      // slide the round upward: anchor takes over, fresh challenger enters
      anime({
        targets: "#panel-challenger .panel-body",
        opacity: [1, 0],
        translateY: [0, -12],
        duration: 180,
        easing: "easeInCubic",
        complete: () => renderRound(true),
      });
    } else {
      renderRound(true);
    }
  }

  function gameOver() {
    stopTimer();
    ebkRecord(state.streak);
    const cat = state.category;
    const a = state.anchor, c = state.challenger;
    $("#final-streak").textContent = state.streak;
    $("#new-best").hidden = !(state.streak > 0 && state.streak === state.best &&
                              state.streak === getBest(cat.key));
    $("#over-detail").innerHTML =
      `<strong>${c.name}</strong> (${c.seasonLabel || c.season}) had ` +
      `<strong>${fmt(statValue(c), cat.decimals)}</strong> ${cat.label.toLowerCase()} — ` +
      `vs <strong>${a.name}</strong> (${a.seasonLabel || a.season}) with ` +
      `<strong>${fmt(statValue(a), cat.decimals)}</strong>.`;
    showScreen("screen-over");
    const anime = A();
    if (anime) {
      anime({
        targets: "#screen-over .over-inner > *",
        opacity: [0, 1],
        translateY: [16, 0],
        delay: anime.stagger(60),
        duration: 380,
        easing: "easeOutCubic",
      });
    }
  }

  // ---- wiring ---------------------------------------------------------------

  document.querySelectorAll(".guess-btn").forEach((b) =>
    b.addEventListener("click", () => guess(b.dataset.dir)));
  $("#again-btn").addEventListener("click", () => startRun(state.category));
  const toMenu = () => { stopTimer(); state.locked = true; showScreen("screen-start"); buildCategoryGrid(); };
  $("#menu-btn").addEventListener("click", toMenu);
  $("#quit-btn").addEventListener("click", toMenu);

  document.addEventListener("keydown", (e) => {
    if (!$("#screen-game").classList.contains("is-active")) return;
    if (e.key === "ArrowUp") { e.preventDefault(); guess("higher"); }
    if (e.key === "ArrowDown") { e.preventDefault(); guess("lower"); }
  });

  load();
})();
