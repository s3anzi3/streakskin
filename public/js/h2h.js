/* EBK · Head-to-Head play engine (lobby + match) for Higher/Lower and Career
   Path. Both players generate the IDENTICAL question sequence from the match
   seed, so the contest is fair; Firestore only syncs each side's live streak.
   The higher final streak wins. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const sfx = (n) => { try { window.EBKS && EBKS.play(n); } catch (e) {} };
  const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));

  // load firebase + h2h api
  (function () {
    if (!window.EBKF) { const s = document.createElement("script"); s.src = "/js/ebk-firebase.js"; document.head.appendChild(s); }
    if (!window.EBKH) { const s = document.createElement("script"); s.src = "/js/ebk-h2h.js"; document.head.appendChild(s); }
  })();

  // ---- deterministic RNG (matches player-grid's) ----
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
  const TIME_LIMIT = 7000;
  const SPORTS = ["nfl", "nba", "mlb", "nhl", "cfb", "soccer"];
  const SEQ_MAX = 50;

  // ---- per-sport Career Path config (mirrors career-path.js) ----
  const CP = {
    nfl: { icon: "🏈", fmt: (y) => "" + y, facts: ["position", "draft", "college", "career", "teampath"],
      posNames: { QB: "Quarterback", RB: "Running Back", FB: "Fullback", HB: "Running Back", WR: "Wide Receiver", TE: "Tight End", DE: "Defensive End", DT: "Defensive Tackle", NT: "Nose Tackle", DL: "Defensive Lineman", EDGE: "Edge Rusher", LB: "Linebacker", OLB: "Outside Linebacker", ILB: "Inside Linebacker", MLB: "Middle Linebacker", CB: "Cornerback", S: "Safety", FS: "Free Safety", SS: "Strong Safety", DB: "Defensive Back" },
      notable: [["fantasy_points_ppr", 60], ["passing_yards", 1200], ["rushing_yards", 450], ["receiving_yards", 450], ["def_sacks", 5], ["tackles", 75], ["def_interceptions", 3], ["def_fumbles_forced", 3], ["def_pass_defended", 12]] },
    nba: { icon: "🏀", fmt: (y) => (y - 1) + "-" + ("" + y).slice(2), facts: ["position", "career", "teampath"],
      posNames: { PG: "Point Guard", SG: "Shooting Guard", SF: "Small Forward", PF: "Power Forward", C: "Center", G: "Guard", F: "Forward" },
      notable: [["ppg", 10], ["pts", 500], ["rpg", 6], ["apg", 4]] },
    mlb: { icon: "⚾", fmt: (y) => "" + y, facts: ["position", "career", "teampath"],
      posNames: { P: "Pitcher", C: "Catcher", "1B": "First Base", "2B": "Second Base", "3B": "Third Base", SS: "Shortstop", OF: "Outfield", DH: "Designated Hitter" },
      notable: [["hr", 12], ["hits", 120], ["rbi", 60], ["runs", 60], ["sb", 20], ["w", 8], ["k", 100], ["sv", 10]] },
    nhl: { icon: "🏒", fmt: (y) => (y - 1) + "-" + ("" + y).slice(2), facts: ["position", "career", "teampath"],
      posNames: { C: "Center", L: "Left Wing", R: "Right Wing", D: "Defense", G: "Goalie", F: "Forward" },
      notable: [["pts", 30], ["g", 15], ["a", 20], ["w", 15], ["sv", 600], ["so", 3]] },
    cfb: { icon: "🏈", fmt: (y) => "" + y, facts: ["position", "career", "teampath"],
      posNames: { QB: "Quarterback", RB: "Running Back", FB: "Fullback", WR: "Wide Receiver", TE: "Tight End", DL: "Defensive Line", DE: "Defensive End", DT: "Defensive Tackle", LB: "Linebacker", OLB: "Outside Linebacker", ILB: "Inside Linebacker", CB: "Cornerback", S: "Safety", SS: "Strong Safety", FS: "Free Safety", DB: "Defensive Back", ATH: "Athlete" },
      notable: [["pyd", 1500], ["ptd", 12], ["ryd", 600], ["rtd", 8], ["recyd", 600], ["rec", 40], ["rectd", 6], ["tkl", 60], ["sk", 6]] },
    soccer: { icon: "⚽", fmt: (y) => (y - 1) + "-" + ("" + y).slice(2), facts: ["position", "career", "teampath"],
      posNames: { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" },
      notable: [["goals", 3], ["assists", 3], ["minutes", 1500], ["saves", 40], ["pts", 80], ["cs", 8]] },
  };

  const dataCache = {};
  async function loadData(sport) {
    if (dataCache[sport]) return dataCache[sport];
    const url = sport === "nfl" ? "/data/players.json" : "/data/" + sport + "/players.json";
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error("data " + res.status);
    const d = await res.json();
    dataCache[sport] = d;
    return d;
  }
  let colleges = null;
  async function loadColleges() {
    if (colleges) return colleges;
    try { const r = await fetch("/data/colleges.json", { cache: "force-cache" }); colleges = r.ok ? await r.json() : {}; }
    catch (e) { colleges = {}; }
    return colleges;
  }

  // ===================== STATE =====================
  const M = {
    id: null, role: null, unsub: null, match: null,
    sport: null, mode: null, cat: null, league: null,
    data: null, seq: [], idx: 0, streak: 0, done: false, locked: false,
    started: false, ended: false,
  };

  // ===================== LOBBY =====================
  function authReady(cb) {
    const tick = () => { (window.EBKF && EBKF.onChange) ? EBKF.onChange(cb) : setTimeout(tick, 60); };
    tick();
  }

  function renderLobby() {
    const params = new URLSearchParams(location.search);
    const preSport = SPORTS.includes(params.get("sport")) ? params.get("sport") : "nfl";
    const lobby = $("#lobby");
    lobby.innerHTML =
      '<div class="h2h-intro"><h1>⚔️ Head-to-Head</h1>' +
      '<p class="muted">Challenge a friend in real time. You both get the exact same questions. Highest streak wins.</p></div>' +
      '<div id="signgate" class="center" hidden><p class="muted">Sign in to play head-to-head.</p>' +
      '<button class="gbtn primary" id="h2h-signin">Sign in</button></div>' +
      '<div id="setup" hidden>' +
      '  <div class="h2h-field"><label>Mode</label><div class="seg" id="seg-mode">' +
      '    <button class="segbtn active" data-mode="higher-lower">Higher / Lower</button>' +
      '    <button class="segbtn" data-mode="career-path">Career Path</button></div></div>' +
      '  <div class="h2h-field"><label>Sport</label><select id="sel-sport" class="search">' +
      SPORTS.map((s) => `<option value="${s}"${s === preSport ? " selected" : ""}>${s.toUpperCase()}</option>`).join("") +
      '  </select></div>' +
      '  <div class="h2h-field" id="cat-field"><label>Category</label><select id="sel-cat" class="search"></select></div>' +
      '  <div class="h2h-actions">' +
      '    <button class="gbtn primary" id="btn-quick">⚡ Quick match</button>' +
      '    <button class="gbtn" id="btn-create">＋ Create match (get a code)</button>' +
      '  </div>' +
      '  <div class="h2h-join"><input id="join-code" class="search" placeholder="Enter code" maxlength="6" autocapitalize="characters" />' +
      '    <button class="gbtn" id="btn-join">Join</button></div>' +
      '  <p class="h2h-msg" id="lobby-msg"></p>' +
      '</div>' +
      '<div id="waiting" hidden class="center"><h2>Waiting for an opponent…</h2>' +
      '  <p class="muted">Share this code:</p><div class="h2h-code" id="wait-code"></div>' +
      '  <p class="muted" id="wait-sub"></p><button class="gbtn ghost" id="btn-cancel">Cancel</button></div>';

    $("#h2h-signin") && $("#h2h-signin").addEventListener("click", () => window.EBKopenAuth && EBKopenAuth());
    $("#seg-mode").addEventListener("click", (e) => {
      const b = e.target.closest(".segbtn"); if (!b) return;
      $$(".segbtn").forEach((x) => x.classList.toggle("active", x === b));
      M._mode = b.dataset.mode;
      $("#cat-field").style.display = M._mode === "higher-lower" ? "" : "none";
      if (M._mode === "higher-lower") refreshCats();
    });
    $("#sel-sport").addEventListener("change", () => { if (curMode() === "higher-lower") refreshCats(); });
    $("#btn-quick").addEventListener("click", () => act("quick"));
    $("#btn-create").addEventListener("click", () => act("create"));
    $("#btn-join").addEventListener("click", () => act("join"));
    M._mode = "higher-lower";
    refreshCats();
  }
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const curMode = () => M._mode || "higher-lower";

  async function refreshCats() {
    const sport = $("#sel-sport").value;
    const sel = $("#sel-cat");
    sel.innerHTML = '<option>loading…</option>';
    try {
      const d = await loadData(sport);
      sel.innerHTML = (d.categories || []).map((c) => `<option value="${c.key}">${c.icon || ""} ${esc(c.label)}</option>`).join("");
    } catch (e) { sel.innerHTML = '<option value="">(couldn\'t load)</option>'; }
  }

  function lobbyMsg(t, bad) { const el = $("#lobby-msg"); if (el) { el.textContent = t || ""; el.className = "h2h-msg" + (bad ? " bad" : ""); } }

  async function act(kind) {
    const mode = curMode(), sport = $("#sel-sport").value;
    let cat = "", catLabel = "";
    if (mode === "higher-lower") {
      cat = $("#sel-cat").value;
      catLabel = $("#sel-cat").selectedOptions[0] ? $("#sel-cat").selectedOptions[0].textContent.trim() : cat;
      if (!cat) return lobbyMsg("Pick a category.", true);
    }
    lobbyMsg("…");
    try {
      let res;
      if (kind === "quick") res = await EBKH.quickMatch(mode, sport, cat, catLabel);
      else if (kind === "create") res = await EBKH.createMatch(mode, sport, cat, catLabel);
      else {
        const code = $("#join-code").value;
        if (!code) return lobbyMsg("Enter a code to join.", true);
        res = await EBKH.joinByCode(code);
      }
      enterMatch(res.id, res.role);
    } catch (e) { lobbyMsg(e.message || "Something went wrong.", true); }
  }

  function showWaiting(match) {
    $("#setup").hidden = true;
    $("#waiting").hidden = false;
    $("#wait-code").textContent = match.code;
    $("#wait-sub").textContent = match.catLabel ? (match.sport.toUpperCase() + " · " + match.catLabel) : match.sport.toUpperCase() + " · Career Path";
    $("#btn-cancel").onclick = () => { if (M.unsub) M.unsub(); EBKH.cancel(M.id); location.reload(); };
  }

  // ===================== MATCH =====================
  function enterMatch(id, role) {
    M.id = id; M.role = role;
    M.unsub = EBKH.listen(id, onMatch);
  }

  async function onMatch(match) {
    M.match = match;
    // lobby waiting state for an open host match
    if (match.status === "open") { $("#lobby").hidden = false; $("#match").hidden = true; showWaiting(match); return; }

    if (!M.started && match.status === "active") {
      M.started = true;
      $("#lobby").hidden = true; $("#match").hidden = false;
      try { await beginMatch(match); }
      catch (e) { $("#match").innerHTML = '<p class="center muted" style="padding:2rem">Couldn\'t start the match: ' + esc(e.message) + "</p>"; return; }
    }
    paintOpponent();
    maybeResult();
  }

  function oppFields() {
    return M.role === "host"
      ? { name: M.match.guestName, streak: M.match.guestStreak, done: M.match.guestDone }
      : { name: M.match.hostName, streak: M.match.hostStreak, done: M.match.hostDone };
  }
  function meDone() { return M.role === "host" ? M.match.hostDone : M.match.guestDone; }

  function paintOpponent() {
    const o = oppFields();
    const on = $("#opp-name"), os = $("#opp-streak");
    if (on) on.textContent = o.name || "Opponent";
    if (os) os.textContent = o.streak || 0;
    const od = $("#opp-done");
    if (od) od.hidden = !o.done;
  }

  async function beginMatch(match) {
    M.sport = match.sport; M.mode = match.mode; M.cat = match.cat;
    M.league = window[match.sport.toUpperCase()];
    M.data = await loadData(match.sport);
    if (match.mode === "career-path" && CP[match.sport].facts.includes("college")) await loadColleges();
    M.seq = match.mode === "higher-lower" ? genHL(match) : genCP(match);
    M.idx = 0; M.streak = 0; M.done = false; M.ended = false;
    try { window.__H2H = M; } catch (e) {}   // test/debug hook

    $("#match").innerHTML =
      '<div class="vs-head">' +
      '  <div class="vs-side me"><div class="vs-name">You</div><div class="vs-streak" id="me-streak">0</div></div>' +
      '  <div class="vs-mid">VS</div>' +
      '  <div class="vs-side opp"><div class="vs-name" id="opp-name">Opponent</div><div class="vs-streak" id="opp-streak">0</div>' +
      '    <div class="vs-flag" id="opp-done" hidden>done</div></div>' +
      '</div>' +
      '<div class="round-timer h2h-timer"><div class="fill"></div></div>' +
      '<div class="h2h-sub center muted" id="h2h-sub"></div>' +
      '<div id="stage"></div>' +
      '<div id="result" class="center" hidden></div>';
    $("#h2h-sub").textContent = (match.catLabel ? match.catLabel + " · " : "") + match.sport.toUpperCase() +
      " · " + (match.mode === "higher-lower" ? "Higher / Lower" : "Career Path");
    paintOpponent();
    nextRound();
  }

  // ---- timer ----
  let tTO = null, tLowTO = null;
  function timerStart() {
    const fill = $(".h2h-timer .fill"); if (!fill) return;
    clearTimeout(tTO); clearTimeout(tLowTO);
    fill.classList.remove("low");
    fill.style.transition = "none"; fill.style.width = "100%"; void fill.offsetWidth;
    fill.style.transition = `width ${TIME_LIMIT}ms linear`; fill.style.width = "0%";
    tLowTO = setTimeout(() => { if (!M.locked) fill.classList.add("low"); }, TIME_LIMIT - 2500);
    tTO = setTimeout(() => onAnswer(null), TIME_LIMIT);
  }
  function timerStop() {
    clearTimeout(tTO); clearTimeout(tLowTO);
    const fill = $(".h2h-timer .fill"); if (!fill) return;
    fill.style.transition = "none"; fill.style.width = getComputedStyle(fill).width;
  }

  function nextRound() {
    if (M.done) return;
    if (M.idx >= M.seq.length - (M.mode === "higher-lower" ? 1 : 0)) { bust(true); return; } // ran out (capped win)
    M.locked = false;
    (M.mode === "higher-lower" ? renderHL() : renderCP());
    timerStart();
  }

  function onAnswer(choice) {
    if (M.locked) return;
    M.locked = true;
    timerStop();
    const correct = (M.mode === "higher-lower") ? checkHL(choice) : checkCP(choice);
    if (correct) {
      M.streak++; sfx("correct");
      $("#me-streak").textContent = M.streak;
      EBKH.update(M.id, M.role, { streak: M.streak });
      revealAndAdvance();
    } else {
      sfx("wrong");
      revealWrong();
      setTimeout(() => bust(false), 1100);
    }
  }

  function bust(completed) {
    if (M.done) return;
    M.done = true;
    timerStop();
    sfx(completed ? "best" : "over");
    EBKH.update(M.id, M.role, { streak: M.streak, done: true });
    const stage = $("#stage");
    if (stage) stage.innerHTML = `<div class="h2h-bust">${completed ? "Cleared the board!" : "Streak ended"} — you reached <b>${M.streak}</b>.</div>`;
    maybeResult();
  }

  function maybeResult() {
    if (!M.match) return;
    const iAmDone = meDone() || M.done;
    const o = oppFields();
    const r = $("#result"); if (!r) return;
    if (!iAmDone) return;
    if (!o.done) {
      r.hidden = false;
      r.innerHTML = `<div class="h2h-wait">You scored <b>${M.streak}</b>. Waiting for ${esc(o.name || "opponent")}… <span class="muted">(live: ${o.streak || 0})</span></div>`;
      return;
    }
    // both done
    if (M.ended) return;
    M.ended = true;
    const mine = Math.max(M.streak, (M.role === "host" ? M.match.hostStreak : M.match.guestStreak) || 0);
    const theirs = o.streak || 0;
    let verdict, cls;
    if (mine > theirs) { verdict = "You win! 🏆"; cls = "win"; sfx("best"); }
    else if (mine < theirs) { verdict = "You lost."; cls = "lose"; sfx("over"); }
    else { verdict = "Tie game."; cls = "tie"; }
    // the host records the official result once
    if (M.role === "host" && !M.match.winner)
      EBKH.update(M.id, M.role, { winner: mine > theirs ? "host" : mine < theirs ? "guest" : "tie", status: "done" });
    r.hidden = false;
    r.innerHTML =
      `<div class="h2h-verdict ${cls}">${verdict}</div>` +
      `<div class="h2h-final">You ${mine} · ${esc(o.name || "Opponent")} ${theirs}</div>` +
      '<div class="row-btns" style="justify-content:center;margin-top:var(--sp-md)">' +
      '<button class="gbtn primary" onclick="location.href=\'/h2h\'">Play again</button>' +
      `<button class="gbtn ghost" onclick="location.href='/${M.sport}'">Back to ${M.sport.toUpperCase()}</button></div>`;
  }

  // ===================== HIGHER / LOWER =====================
  function genHL(match) {
    const rng = seededRng(match.seed + "|hl|" + match.cat);
    const pool = M.data.players.filter((p) => p.stats[match.cat] != null);
    const cat = (M.data.categories || []).find((c) => c.key === match.cat) || { key: match.cat, label: match.cat, decimals: 0 };
    M._cat = cat;
    const chain = [];
    let prev = null, prevVal = null;
    for (let i = 0; i < SEQ_MAX + 1 && pool.length; i++) {
      let pick = null;
      for (let t = 0; t < 80; t++) {
        const c = pool[(rng() * pool.length) | 0];
        if (c !== prev && c.stats[match.cat] !== prevVal) { pick = c; break; }
      }
      if (!pick) pick = pool[(rng() * pool.length) | 0];
      chain.push(pick); prev = pick; prevVal = pick.stats[match.cat];
    }
    return chain;
  }
  const fmtN = (v, d) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d || 0 });
  function hlCard(p, revealedVal) {
    const L = M.league, cat = M._cat;
    const team = L ? `<img class="tlogo" src="${L.logo(p.team)}" alt="" onerror="this.remove()"> ${esc(L.name(p.team))}` : esc(p.team || "");
    const val = revealedVal != null
      ? `<div class="hl2-stat">${fmtN(revealedVal, cat.decimals)} <span>${esc(cat.label)}</span></div>` : "";
    return `<img class="hl2-ph" src="${p.headshot || "/img/avatar.svg"}" alt="" onerror="this.src='/img/avatar.svg'">` +
      `<div class="hl2-name">${esc(p.name)}</div><div class="hl2-meta">${team}</div>${val}`;
  }
  function renderHL() {
    const a = M.seq[M.idx], c = M.seq[M.idx + 1], cat = M._cat;
    $("#stage").innerHTML =
      `<div class="hl2"><div class="hl2-card anchor">${hlCard(a, a.stats[cat.key])}</div>` +
      `<div class="hl2-q">Did <b>${esc(c.name)}</b> have <b>higher</b> or <b>lower</b> ${esc(cat.label)}?</div>` +
      `<div class="hl2-card challenger" id="hl-ch">${hlCard(c, null)}` +
      '<div class="hl2-btns"><button class="gbtn primary" data-dir="higher">▲ Higher</button>' +
      '<button class="gbtn primary" data-dir="lower">▼ Lower</button></div></div></div>';
    $$("#hl-ch .hl2-btns button").forEach((b) => b.addEventListener("click", () => onAnswer(b.dataset.dir)));
  }
  function checkHL(choice) {
    const a = M.seq[M.idx], c = M.seq[M.idx + 1], k = M._cat.key;
    if (choice == null) return false; // timeout
    const higher = c.stats[k] > a.stats[k];
    return (choice === "higher") === higher;
  }
  function revealAndAdvance() {
    if (M.mode === "higher-lower") {
      const c = M.seq[M.idx + 1], ch = $("#hl-ch");
      if (ch) {
        const btns = ch.querySelector(".hl2-btns"); if (btns) btns.remove();
        ch.insertAdjacentHTML("beforeend", `<div class="hl2-stat reveal">${fmtN(c.stats[M._cat.key], M._cat.decimals)} <span>${esc(M._cat.label)}</span></div>`);
      }
    } else {
      markCP(true);
    }
    M.idx++;
    setTimeout(() => { if (!M.done) nextRound(); }, 900);
  }
  function revealWrong() {
    if (M.mode === "higher-lower") {
      const c = M.seq[M.idx + 1], ch = $("#hl-ch");
      if (ch) { ch.querySelector(".hl2-btns") && ch.querySelector(".hl2-btns").remove(); ch.insertAdjacentHTML("beforeend", `<div class="hl2-stat reveal bad">${fmtN(c.stats[M._cat.key], M._cat.decimals)} <span>${esc(M._cat.label)}</span></div>`); }
    } else markCP(false);
  }

  // ===================== CAREER PATH =====================
  function buildCareers() {
    const cfg = CP[M.sport], people = M.data.people || {}, L = M.league;
    const careers = new Map();
    for (const p of M.data.players) {
      if (!p.id) continue;
      let c = careers.get(p.id);
      if (!c) { const bio = people[p.id] || {};
        c = { id: p.id, name: p.name, pos: p.pos, headshot: p.headshot, college: bio.college || "", dy: bio.draftYear, dr: bio.draftRound, dp: bio.draftPick, dt: bio.draftTeam || "", years: new Map(), notable: false };
        careers.set(p.id, c); }
      c.years.set(p.season, p.team);
      if (p.headshot && !c.headshot) c.headshot = p.headshot;
      if (cfg.notable.some(([k, thr]) => (p.stats[k] || 0) >= thr)) c.notable = true;
    }
    const pool = [];
    for (const c of careers.values()) {
      if (!c.notable) continue;
      const yrs = [...c.years.keys()].sort((a, b) => a - b);
      c.min = yrs[0]; c.max = yrs[yrs.length - 1]; c.count = yrs.length;
      const path = []; for (const y of yrs) { const k = L.keyOf(c.years.get(y)); if (path[path.length - 1] !== k) path.push(k); }
      c.path = path; pool.push(c);
    }
    pool.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // deterministic
    return pool;
  }
  function genCP(match) {
    const rng = seededRng(match.seed + "|cp");
    const pool = buildCareers(); M._pool = pool;
    const cfg = CP[match.sport];
    const take = (arr) => arr.splice((rng() * arr.length) | 0, 1)[0];
    const shuf = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const seq = []; const used = new Set();
    for (let i = 0; i < SEQ_MAX && pool.length; i++) {
      let m = null;
      for (let t = 0; t < 60; t++) { const c = pool[(rng() * pool.length) | 0]; if (!used.has(c.id)) { m = c; break; } }
      if (!m) m = pool[(rng() * pool.length) | 0];
      used.add(m.id);
      // options: prefer same position + overlapping era
      let cand = pool.filter((o) => o.id !== m.id && o.max >= m.min - 8 && o.min <= m.max + 8);
      if (cand.length < 6) cand = pool.filter((o) => o.id !== m.id);
      const byPos = {}; cand.forEach((o) => { (byPos[o.pos] = byPos[o.pos] || []).push(o); });
      const picks = [];
      if (byPos[m.pos] && byPos[m.pos].length) picks.push(take(byPos[m.pos]));
      for (const pk of shuf(Object.keys(byPos).filter((p) => p !== m.pos))) { if (picks.length >= 3) break; if (byPos[pk].length) picks.push(take(byPos[pk])); }
      const rest = cand.filter((o) => !picks.includes(o));
      while (picks.length < 3 && rest.length) picks.push(take(rest));
      const opts = shuf(picks.concat([m]).map((o) => ({ id: o.id, name: o.name })));
      seq.push({ m: m, hiddenIdx: (rng() * cfg.facts.length) | 0, opts: opts });
    }
    return seq;
  }
  const teamTag = (k) => { const L = M.league; return `<img class="tlogo" src="${L.logo(k)}" alt="" onerror="this.remove()"> ${esc(L.name(k))}`; };
  function collegeTag(name) { if (!name) return "Unknown"; const u = colleges && colleges[name]; return u ? `<img class="tlogo" src="${u}" alt="" onerror="this.remove()"> ${esc(name)}` : esc(name); }
  function cpFacts(c) {
    const cfg = CP[M.sport];
    const draft = c.dy ? `${c.dy} · Round ${c.dr || "?"} · Pick ${c.dp || "?"}${c.dt ? " · " + teamTag(c.dt) : ""}` : "Undrafted";
    const all = {
      position: { icon: cfg.icon, k: "Position", v: cfg.posNames[c.pos] || c.pos },
      draft: { icon: "🎟️", k: "Draft", v: draft },
      college: { icon: "🎓", k: "College", v: collegeTag(c.college) },
      career: { icon: "📅", k: "Career", v: `${cfg.fmt(c.min)}–${cfg.fmt(c.max)} · ${c.count} season${c.count > 1 ? "s" : ""}` },
      teampath: { icon: "🧭", k: "Team path", v: c.path.map(teamTag).join("  →  ") },
    };
    return cfg.facts.map((key) => all[key]);
  }
  function renderCP() {
    const q = M.seq[M.idx], fs = cpFacts(q.m);
    const clues = fs.map((f, i) => {
      const hidden = i === q.hiddenIdx;
      return `<div class="clue${hidden ? " locked" : ""}"><span class="c-icon">${hidden ? "🔒" : f.icon}</span>` +
        `<div><div class="c-k">${f.k}</div><div class="c-v">${hidden ? "hidden" : f.v}</div></div></div>`;
    }).join("");
    const opts = q.opts.map((o) => `<button class="opt" data-id="${o.id}">${esc(o.name)}</button>`).join("");
    $("#stage").innerHTML = `<div class="cp2"><div class="clues">${clues}</div><div class="opt-list">${opts}</div></div>`;
    $$("#stage .opt").forEach((b) => b.addEventListener("click", () => onAnswer(b.dataset.id)));
  }
  function checkCP(choice) { if (choice == null) return false; return choice === M.seq[M.idx].m.id; }
  function markCP(correct) {
    const q = M.seq[M.idx];
    $$("#stage .opt").forEach((b) => { b.disabled = true; if (b.dataset.id === q.m.id) b.classList.add("correct"); });
    // reveal hidden clue
    const cl = $$("#stage .clue")[q.hiddenIdx];
    if (cl) { const fs = cpFacts(q.m), f = fs[q.hiddenIdx]; cl.classList.remove("locked"); cl.innerHTML = `<span class="c-icon">${f.icon}</span><div><div class="c-k">${f.k}</div><div class="c-v">${f.v}</div></div>`; }
  }
  // ===================== BOOT =====================
  function boot() {
    renderLobby();
    authReady((user) => {
      $("#signgate").hidden = !!user;
      $("#setup").hidden = !user;
      if (!user) { $("#waiting").hidden = true; }
    });
  }
  boot();
})();
