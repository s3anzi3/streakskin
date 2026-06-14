/* EBK · Head-to-Head play engine (rooms model).
   - Ranked Quick Match: rated 1v1, random mode + category, per-sport Elo.
   - Private Room: host picks the mode, multiple players, unrated, share a code.
   Everyone in a room generates the IDENTICAL question sequence from the room
   seed; only live streaks sync. Highest final streak wins. The per-question
   timer is deadline-based so tabbing out / lagging cannot buy extra time. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sfx = (n) => { try { window.EBKS && EBKS.play(n); } catch (e) {} };
  const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]));

  (function () {
    if (!window.EBKF) { const s = document.createElement("script"); s.src = "/js/ebk-firebase.js"; document.head.appendChild(s); }
    if (!window.EBKH) { const s = document.createElement("script"); s.src = "/js/ebk-h2h.js"; document.head.appendChild(s); }
  })();

  function seededRng(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    let a = (h ^= h >>> 16) >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const TIME_LIMIT = 7000;
  const SPORTS = ["nfl", "nba", "mlb", "nhl", "cfb", "soccer"];
  const SEQ_MAX = 50;

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
    dataCache[sport] = await res.json();
    return dataCache[sport];
  }
  let colleges = null;
  async function loadColleges() {
    if (colleges) return colleges;
    try { const r = await fetch("/data/colleges.json", { cache: "force-cache" }); colleges = r.ok ? await r.json() : {}; }
    catch (e) { colleges = {}; }
    return colleges;
  }
  const MODE_LABEL = { "higher-lower": "Higher / Lower", "career-path": "Career Path" };

  const M = {
    id: null, role: null, unsub: null, room: null,
    sport: null, mode: null, cat: null, league: null,
    data: null, seq: [], idx: 0, streak: 0, done: false, locked: false,
    started: false, ended: false, eloApplied: false, deadline: 0, _cat: null, _pool: null,
  };

  function authReady(cb) { const tick = () => { (window.EBKF && EBKF.onChange) ? EBKF.onChange(cb) : setTimeout(tick, 60); }; tick(); }
  const uid = () => (window.EBKH && EBKH.uid && EBKH.uid()) || (window.EBKF && EBKF.user && EBKF.user.uid);

  // ===================== LOBBY =====================
  function renderLobby() {
    const params = new URLSearchParams(location.search);
    const preSport = SPORTS.includes(params.get("sport")) ? params.get("sport") : "nfl";
    $("#lobby").innerHTML =
      '<div class="h2h-intro"><h1>⚔️ Head-to-Head</h1>' +
      '<p class="muted">Same questions for everyone. Highest streak wins.</p></div>' +
      '<div id="signgate" class="center" hidden><p class="muted">Sign in to play head-to-head.</p>' +
      '<button class="gbtn primary" id="h2h-signin">Sign in</button></div>' +
      '<div id="setup" hidden>' +
      '  <div class="h2h-panel"><h2>⚡ Ranked Quick Match</h2>' +
      '    <p class="muted h2h-note">Random mode &amp; category. Win to climb your per-sport Elo.</p>' +
      '    <div class="h2h-field"><label>Sport</label><select id="rk-sport" class="search">' +
      SPORTS.map((s) => `<option value="${s}"${s === preSport ? " selected" : ""}>${s.toUpperCase()}</option>`).join("") + "</select></div>" +
      '    <p class="h2h-elo" id="rk-elo"></p>' +
      '    <button class="gbtn primary" id="btn-ranked">Find ranked match</button></div>' +
      '  <div class="h2h-panel"><h2>🔒 Private Room</h2>' +
      '    <p class="muted h2h-note">Create a room, share the code, and the host picks the mode. Multiple players welcome.</p>' +
      '    <button class="gbtn" id="btn-create">Create a room</button>' +
      '    <div class="h2h-join"><input id="join-code" class="search" placeholder="Enter code" maxlength="6" autocapitalize="characters" />' +
      '      <button class="gbtn" id="btn-join">Join</button></div></div>' +
      '  <p class="h2h-msg" id="lobby-msg"></p>' +
      "</div>";
    $("#h2h-signin") && $("#h2h-signin").addEventListener("click", () => window.EBKopenAuth && EBKopenAuth());
    $("#btn-ranked").addEventListener("click", () => act("ranked"));
    $("#btn-create").addEventListener("click", () => act("create"));
    $("#btn-join").addEventListener("click", () => act("join"));
    $("#rk-sport").addEventListener("change", showElo);
    showElo();
  }
  async function showElo() {
    const el = $("#rk-elo"); if (!el || !window.EBKH) return;
    try { const e = await EBKH.myEloFor($("#rk-sport").value); el.textContent = "Your " + $("#rk-sport").value.toUpperCase() + " Elo: " + e; }
    catch (e) { el.textContent = ""; }
  }
  function lobbyMsg(t, bad) { const el = $("#lobby-msg"); if (el) { el.textContent = t || ""; el.className = "h2h-msg" + (bad ? " bad" : ""); } }

  async function randomConfig(sport) {
    const data = await loadData(sport);
    const mode = Math.random() < 0.5 ? "higher-lower" : "career-path";
    if (mode === "higher-lower") {
      const cats = data.categories || [];
      const c = cats[(Math.random() * cats.length) | 0] || { key: "", label: "" };
      return { mode, sport, cat: c.key, catLabel: (c.icon ? c.icon + " " : "") + c.label };
    }
    return { mode, sport, cat: "", catLabel: "" };
  }

  async function act(kind) {
    lobbyMsg("…");
    try {
      let res;
      if (kind === "ranked") {
        const sport = $("#rk-sport").value;
        res = await EBKH.findRanked(sport);
        if (!res) { const cfg = await randomConfig(sport); res = await EBKH.createRoom(Object.assign({ rated: true, cap: 2 }, cfg)); }
      } else if (kind === "create") {
        res = await EBKH.createRoom({ mode: "higher-lower", sport: $("#rk-sport") ? $("#rk-sport").value : "nfl", cat: "", catLabel: "", rated: false, cap: 8 });
      } else {
        const code = $("#join-code").value;
        if (!code) return lobbyMsg("Enter a code to join.", true);
        res = await EBKH.joinByCode(code);
      }
      enterRoom(res.id, res.role);
    } catch (e) { lobbyMsg(e.message || "Something went wrong.", true); }
  }

  // ===================== ROOM CONTROL =====================
  function enterRoom(id, role) { M.id = id; M.role = role; if (M.unsub) M.unsub(); M.unsub = EBKH.listen(id, onRoom); }

  function onRoom(room) {
    M.room = room;
    if (room.status === "lobby") {
      $("#lobby").hidden = false; $("#match").hidden = true;
      renderRoomLobby(room);
      // ranked auto-starts once two players are in
      if (M.role === "host" && room.rated && room.players && Object.keys(room.players).length >= (room.cap || 2))
        EBKH.start(M.id);
      return;
    }
    if (room.status !== "lobby" && !M.started) { M.started = true; $("#lobby").hidden = true; $("#match").hidden = false; beginMatch(room).catch((e) => { $("#match").innerHTML = '<p class="center muted" style="padding:2rem">Couldn\'t start: ' + esc(e.message) + "</p>"; }); }
    if (M.started) { renderStandings(); maybeResult(); }
  }

  function playerList(room) { const ps = room.players || {}; return Object.keys(ps).map((u) => Object.assign({ uid: u }, ps[u])); }

  function renderRoomLobby(room) {
    const isHost = M.role === "host";
    const players = playerList(room);
    let html = '<div class="h2h-intro"><h1>' + (room.rated ? "⚡ Ranked Match" : "🔒 Private Room") + "</h1></div>" +
      '<div class="center"><p class="muted">Room code</p><div class="h2h-code">' + esc(room.code) + "</div></div>" +
      '<div class="h2h-players"><h3>Players (' + players.length + ")</h3>" +
      players.map((p) => `<div class="stand${p.uid === uid() ? " me" : ""}"><span class="st-name">${esc(p.name)}${p.uid === room.hostUid ? " 👑" : ""}</span></div>`).join("") + "</div>";

    if (room.rated) {
      html += '<p class="center muted">' + (players.length < 2 ? "Waiting for an opponent…" : "Starting…") + "</p>";
    } else if (isHost) {
      html += '<div class="h2h-panel"><h3>Host setup</h3>' +
        '<div class="h2h-field"><label>Mode</label><div class="seg" id="seg-mode">' +
        Object.keys(MODE_LABEL).map((m) => `<button class="segbtn${room.mode === m ? " active" : ""}" data-mode="${m}">${MODE_LABEL[m]}</button>`).join("") + "</div></div>" +
        '<div class="h2h-field"><label>Sport</label><select id="cfg-sport" class="search">' +
        SPORTS.map((s) => `<option value="${s}"${room.sport === s ? " selected" : ""}>${s.toUpperCase()}</option>`).join("") + "</select></div>" +
        '<div class="h2h-field" id="cfg-cat-field"' + (room.mode === "higher-lower" ? "" : ' style="display:none"') + '><label>Category</label><select id="cfg-cat" class="search"></select></div>' +
        '<button class="gbtn primary" id="btn-start"' + (players.length < 2 ? " disabled" : "") + ">Start match</button>" +
        (players.length < 2 ? '<p class="muted center" style="margin-top:8px">Need at least one more player.</p>' : "") + "</div>";
    } else {
      html += '<p class="center muted">Mode: <b>' + MODE_LABEL[room.mode] + "</b>" + (room.catLabel ? " · " + esc(room.catLabel) : "") + " · " + room.sport.toUpperCase() + "<br>Waiting for the host to start…</p>";
    }
    html += '<div class="center" style="margin-top:var(--sp-md)"><button class="gbtn ghost" id="btn-leave">Leave</button></div>';
    $("#lobby").innerHTML = html;

    $("#btn-leave").addEventListener("click", () => { if (M.unsub) M.unsub(); if (isHost) EBKH.cancel(M.id); location.href = "/h2h"; });
    if (room.rated) return;
    if (isHost) {
      $("#seg-mode").addEventListener("click", (e) => { const b = e.target.closest(".segbtn"); if (!b) return; EBKH.setConfig(M.id, { mode: b.dataset.mode }); });
      $("#cfg-sport").addEventListener("change", (e) => EBKH.setConfig(M.id, { sport: e.target.value, cat: "", catLabel: "" }));
      $("#btn-start").addEventListener("click", () => { if (playerList(room).length >= 2) EBKH.start(M.id); });
      if (room.mode === "higher-lower") fillCfgCats(room);
    }
  }
  async function fillCfgCats(room) {
    const sel = $("#cfg-cat"); if (!sel) return;
    try {
      const d = await loadData(room.sport);
      sel.innerHTML = (d.categories || []).map((c) => `<option value="${c.key}"${room.cat === c.key ? " selected" : ""}>${c.icon || ""} ${esc(c.label)}</option>`).join("");
      sel.onchange = () => { const o = sel.selectedOptions[0]; EBKH.setConfig(M.id, { cat: sel.value, catLabel: o ? o.textContent.trim() : sel.value }); };
    } catch (e) {}
  }

  // ===================== MATCH =====================
  async function beginMatch(room) {
    M.sport = room.sport; M.mode = room.mode; M.cat = room.cat;
    M.league = window[room.sport.toUpperCase()];
    M.data = await loadData(room.sport);
    if (room.mode === "career-path" && CP[room.sport].facts.includes("college")) await loadColleges();
    M.seq = room.mode === "higher-lower" ? genHL(room) : genCP(room);
    M.idx = 0; M.streak = 0; M.done = false; M.ended = false; M.eloApplied = false;
    try { window.__H2H = M; } catch (e) {}
    $("#match").innerHTML =
      '<div class="h2h-standings" id="standings"></div>' +
      '<div class="round-timer h2h-timer"><div class="fill"></div></div>' +
      '<div class="h2h-sub center muted" id="h2h-sub"></div>' +
      '<div id="stage"></div><div id="result" class="center" hidden></div>';
    $("#h2h-sub").textContent = (room.catLabel ? room.catLabel + " · " : "") + room.sport.toUpperCase() + " · " + MODE_LABEL[room.mode] + (room.rated ? " · Ranked" : "");
    renderStandings();
    nextRound();
  }

  function renderStandings() {
    const el = $("#standings"); if (!el || !M.room) return;
    const arr = playerList(M.room).sort((a, b) => (b.streak || 0) - (a.streak || 0));
    el.innerHTML = arr.map((p) =>
      `<div class="stand${p.uid === uid() ? " me" : ""}${p.done ? " done" : ""}"><span class="st-name">${esc(p.name)}</span>` +
      `<span class="st-streak">${p.streak || 0}</span>${p.done ? '<span class="st-flag">done</span>' : ""}</div>`).join("");
  }

  // ---- hardened timer (deadline-based: tabbing out can't pause it) ----
  let tTO = null, tLowTO = null, tTick = null;
  function timerStart() {
    M.deadline = Date.now() + TIME_LIMIT;
    const fill = $(".h2h-timer .fill");
    if (fill) {
      fill.classList.remove("low"); fill.style.transition = "none"; fill.style.width = "100%"; void fill.offsetWidth;
      fill.style.transition = `width ${TIME_LIMIT}ms linear`; fill.style.width = "0%";
      tLowTO = setTimeout(() => { if (!M.locked) fill.classList.add("low"); }, TIME_LIMIT - 2500);
    }
    clearTimeout(tTO); clearInterval(tTick);
    tTO = setTimeout(() => onAnswer(null), TIME_LIMIT + 40);
    tTick = setInterval(() => { if (!M.locked && Date.now() >= M.deadline) onAnswer(null); }, 250);
  }
  function timerStop() {
    clearTimeout(tTO); clearTimeout(tLowTO); clearInterval(tTick);
    const fill = $(".h2h-timer .fill"); if (fill) { fill.style.transition = "none"; fill.style.width = getComputedStyle(fill).width; }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !M.locked && M.deadline && Date.now() >= M.deadline) onAnswer(null); });

  function nextRound() {
    if (M.done) return;
    if (M.idx >= M.seq.length - (M.mode === "higher-lower" ? 1 : 0)) { bust(true); return; }
    M.locked = false;
    (M.mode === "higher-lower" ? renderHL() : renderCP());
    timerStart();
  }

  function onAnswer(choice) {
    if (M.locked) return;
    M.locked = true;
    timerStop();
    if (choice != null && Date.now() > M.deadline + 250) choice = null; // late click = timeout
    const correct = (M.mode === "higher-lower") ? checkHL(choice) : checkCP(choice);
    if (correct) {
      M.streak++; sfx("correct");
      EBKH.progress(M.id, { streak: M.streak });
      revealAndAdvance();
    } else { sfx("wrong"); revealWrong(); setTimeout(() => bust(false), 1100); }
  }

  function bust(completed) {
    if (M.done) return;
    M.done = true; timerStop();
    sfx(completed ? "best" : "over");
    EBKH.progress(M.id, { streak: M.streak, done: true });
    const stage = $("#stage");
    if (stage) stage.innerHTML = `<div class="h2h-bust">${completed ? "Cleared the board!" : "Streak ended"} — you reached <b>${M.streak}</b>.</div>`;
    maybeResult();
  }

  function maybeResult() {
    if (!M.room) return;
    const ps = M.room.players || {};
    const meEntry = ps[uid()];
    const iDone = (meEntry && meEntry.done) || M.done;
    const r = $("#result"); if (!r) return;
    if (!iDone) return;
    const arr = playerList(M.room);
    const allDone = arr.length >= 2 && arr.every((p) => p.done);
    if (!allDone) {
      r.hidden = false;
      r.innerHTML = `<div class="h2h-wait">You scored <b>${M.streak}</b>. Waiting for the others to finish…</div>`;
      return;
    }
    if (M.ended) return; M.ended = true;
    arr.sort((a, b) => (b.streak || 0) - (a.streak || 0));
    const top = arr[0].streak || 0;
    const mine = meEntry ? (meEntry.streak || 0) : M.streak;
    const winners = arr.filter((p) => (p.streak || 0) === top);
    let verdict, cls;
    if (mine === top && winners.length === 1) { verdict = "You win! 🏆"; cls = "win"; sfx("best"); }
    else if (mine === top) { verdict = "Tie at the top."; cls = "tie"; }
    else { verdict = "You lost."; cls = "lose"; sfx("over"); }

    let eloHtml = "";
    if (M.room.rated && arr.length === 2 && !M.eloApplied) {
      M.eloApplied = true;
      const opp = arr.find((p) => p.uid !== uid());
      const myPre = (meEntry && meEntry.elo) || 1000, oppPre = (opp && opp.elo) || 1000;
      const result = mine > (opp ? opp.streak : 0) ? 1 : mine < (opp ? opp.streak : 0) ? 0 : 0.5;
      EBKH.applyElo(M.sport, myPre, oppPre, result).then((nw) => {
        if (nw != null) { const d = nw - myPre; const e = $("#elo-line"); if (e) e.textContent = `${M.sport.toUpperCase()} Elo: ${nw} (${d >= 0 ? "+" : ""}${d})`; }
      });
      eloHtml = '<div class="h2h-elo" id="elo-line">Updating Elo…</div>';
    }
    if (M.role === "host") EBKH.finishRoom(M.id);

    r.hidden = false;
    r.innerHTML =
      `<div class="h2h-verdict ${cls}">${verdict}</div>` +
      '<div class="h2h-board">' + arr.map((p, i) =>
        `<div class="stand${p.uid === uid() ? " me" : ""}"><span class="st-rank">${["🥇", "🥈", "🥉"][i] || (i + 1)}</span><span class="st-name">${esc(p.name)}</span><span class="st-streak">${p.streak || 0}</span></div>`).join("") + "</div>" +
      eloHtml +
      '<div class="row-btns" style="justify-content:center;margin-top:var(--sp-md)">' +
      '<button class="gbtn primary" onclick="location.href=\'/h2h\'">Play again</button>' +
      `<button class="gbtn ghost" onclick="location.href='/${M.sport}'">Back to ${M.sport.toUpperCase()}</button></div>`;
  }

  // ===================== HIGHER / LOWER =====================
  function genHL(room) {
    const rng = seededRng(room.seed + "|hl|" + room.cat);
    const pool = M.data.players.filter((p) => p.stats[room.cat] != null);
    M._cat = (M.data.categories || []).find((c) => c.key === room.cat) || { key: room.cat, label: room.cat, decimals: 0 };
    const chain = []; let prev = null, prevVal = null;
    for (let i = 0; i < SEQ_MAX + 1 && pool.length; i++) {
      let pick = null;
      for (let t = 0; t < 80; t++) { const c = pool[(rng() * pool.length) | 0]; if (c !== prev && c.stats[room.cat] !== prevVal) { pick = c; break; } }
      if (!pick) pick = pool[(rng() * pool.length) | 0];
      chain.push(pick); prev = pick; prevVal = pick.stats[room.cat];
    }
    return chain;
  }
  const fmtN = (v, d) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d || 0 });
  function hlCard(p, revealedVal) {
    const L = M.league, cat = M._cat;
    const team = L ? `<img class="tlogo" src="${L.logo(p.team)}" alt="" onerror="this.remove()"> ${esc(L.name(p.team))}` : esc(p.team || "");
    const val = revealedVal != null ? `<div class="hl2-stat">${fmtN(revealedVal, cat.decimals)} <span>${esc(cat.label)}</span></div>` : "";
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
    if (choice == null) return false;
    const a = M.seq[M.idx], c = M.seq[M.idx + 1], k = M._cat.key;
    return (choice === "higher") === (c.stats[k] > a.stats[k]);
  }
  function revealAndAdvance() {
    if (M.mode === "higher-lower") {
      const c = M.seq[M.idx + 1], ch = $("#hl-ch");
      if (ch) { const b = ch.querySelector(".hl2-btns"); if (b) b.remove(); ch.insertAdjacentHTML("beforeend", `<div class="hl2-stat reveal">${fmtN(c.stats[M._cat.key], M._cat.decimals)} <span>${esc(M._cat.label)}</span></div>`); }
    } else markCP(true);
    M.idx++;
    setTimeout(() => { if (!M.done) nextRound(); }, 900);
  }
  function revealWrong() {
    if (M.mode === "higher-lower") {
      const c = M.seq[M.idx + 1], ch = $("#hl-ch");
      if (ch) { const b = ch.querySelector(".hl2-btns"); if (b) b.remove(); ch.insertAdjacentHTML("beforeend", `<div class="hl2-stat reveal bad">${fmtN(c.stats[M._cat.key], M._cat.decimals)} <span>${esc(M._cat.label)}</span></div>`); }
    } else markCP(false);
  }

  // ===================== CAREER PATH =====================
  function buildCareers() {
    const cfg = CP[M.sport], people = M.data.people || {}, L = M.league;
    const careers = new Map();
    for (const p of M.data.players) {
      if (!p.id) continue;
      let c = careers.get(p.id);
      if (!c) { const bio = people[p.id] || {}; c = { id: p.id, name: p.name, pos: p.pos, headshot: p.headshot, college: bio.college || "", dy: bio.draftYear, dr: bio.draftRound, dp: bio.draftPick, dt: bio.draftTeam || "", years: new Map(), notable: false }; careers.set(p.id, c); }
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
    pool.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return pool;
  }
  function genCP(room) {
    const rng = seededRng(room.seed + "|cp");
    const pool = buildCareers(); M._pool = pool;
    const cfg = CP[room.sport];
    const take = (arr) => arr.splice((rng() * arr.length) | 0, 1)[0];
    const shuf = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    const seq = []; const used = new Set();
    for (let i = 0; i < SEQ_MAX && pool.length; i++) {
      let m = null;
      for (let t = 0; t < 60; t++) { const c = pool[(rng() * pool.length) | 0]; if (!used.has(c.id)) { m = c; break; } }
      if (!m) m = pool[(rng() * pool.length) | 0];
      used.add(m.id);
      let cand = pool.filter((o) => o.id !== m.id && o.max >= m.min - 8 && o.min <= m.max + 8);
      if (cand.length < 6) cand = pool.filter((o) => o.id !== m.id);
      const byPos = {}; cand.forEach((o) => { (byPos[o.pos] = byPos[o.pos] || []).push(o); });
      const picks = [];
      if (byPos[m.pos] && byPos[m.pos].length) picks.push(take(byPos[m.pos]));
      for (const pk of shuf(Object.keys(byPos).filter((p) => p !== m.pos))) { if (picks.length >= 3) break; if (byPos[pk].length) picks.push(take(byPos[pk])); }
      const rest = cand.filter((o) => !picks.includes(o));
      while (picks.length < 3 && rest.length) picks.push(take(rest));
      seq.push({ m: m, hiddenIdx: (rng() * cfg.facts.length) | 0, opts: shuf(picks.concat([m]).map((o) => ({ id: o.id, name: o.name }))) });
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
    const clues = fs.map((f, i) => { const hid = i === q.hiddenIdx; return `<div class="clue${hid ? " locked" : ""}"><span class="c-icon">${hid ? "🔒" : f.icon}</span><div><div class="c-k">${f.k}</div><div class="c-v">${hid ? "hidden" : f.v}</div></div></div>`; }).join("");
    const opts = q.opts.map((o) => `<button class="opt" data-id="${o.id}">${esc(o.name)}</button>`).join("");
    $("#stage").innerHTML = `<div class="cp2"><div class="clues">${clues}</div><div class="opt-list">${opts}</div></div>`;
    $$("#stage .opt").forEach((b) => b.addEventListener("click", () => onAnswer(b.dataset.id)));
  }
  function checkCP(choice) { return choice != null && choice === M.seq[M.idx].m.id; }
  function markCP(correct) {
    const q = M.seq[M.idx];
    $$("#stage .opt").forEach((b) => { b.disabled = true; if (b.dataset.id === q.m.id) b.classList.add("correct"); });
    const cl = $$("#stage .clue")[q.hiddenIdx];
    if (cl) { const f = cpFacts(q.m)[q.hiddenIdx]; cl.classList.remove("locked"); cl.innerHTML = `<span class="c-icon">${f.icon}</span><div><div class="c-k">${f.k}</div><div class="c-v">${f.v}</div></div>`; }
  }

  // ===================== BOOT =====================
  renderLobby();
  authReady((user) => { const sg = $("#signgate"), su = $("#setup"); if (sg) sg.hidden = !!user; if (su) su.hidden = !user; if (user) showElo(); });
})();
