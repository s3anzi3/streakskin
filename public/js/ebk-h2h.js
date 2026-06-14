/* EBK · Head-to-Head matchmaking + realtime sync (Firestore). Exposes window.EBKH.
   Rooms hold a shared `seed`; every client generates the IDENTICAL question
   sequence locally from it (see h2h.js), so only live streaks sync.
   - Ranked Quick Match: rated 1v1, random mode+category, per-sport Elo.
   - Private Room: host picks the mode, multiple players, unrated.
   A room doc carries a `players` map { uid: {name, streak, done, elo} }. */
(function () {
  "use strict";
  if (window.EBKH) return;
  if (!window.EBKF) { var s = document.createElement("script"); s.src = "/js/ebk-firebase.js"; document.head.appendChild(s); }

  var CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function code5() { var s = ""; for (var i = 0; i < 5; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; return s; }
  function seedHex() { var s = ""; for (var i = 0; i < 6; i++) s += ("000" + ((Math.random() * 65536) | 0).toString(16)).slice(-4); return s; }
  function fv() { return firebase.firestore.FieldValue; }

  var EBKH = (window.EBKH = {});
  var db = function () { return EBKF.db; };
  var me = function () { return EBKF.user; };
  function myName() { return (EBKF.profileName) || (me() && me().displayName) || "Player"; }
  EBKH.myName = myName;
  EBKH.uid = function () { return me() && me().uid; };

  // ---------------- Elo (per sport) ----------------
  var DEFAULT_ELO = 1000, K = 24;
  function expected(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }
  EBKH.eloDoc = async function (uid) {
    await EBKF.ready;
    var d = await db().collection("elo").doc(uid).get();
    return d.exists ? d.data() : null;
  };
  EBKH.myEloFor = async function (sport) {
    if (!me()) return DEFAULT_ELO;
    var d = await EBKH.eloDoc(me().uid);
    return (d && typeof d["e_" + sport] === "number") ? d["e_" + sport] : DEFAULT_ELO;
  };
  // result: 1 win, 0.5 tie, 0 loss. Each client updates only its own elo doc
  // from the shared pre-match ratings, so the math agrees on both sides.
  EBKH.applyElo = async function (sport, myPre, oppPre, result) {
    await EBKF.ready;
    if (!me()) return null;
    var nw = Math.max(100, Math.round(myPre + K * (result - expected(myPre, oppPre))));
    var patch = { uid: me().uid, name: myName(), updated: Date.now() };
    patch["e_" + sport] = nw;
    patch["g_" + sport] = fv().increment(1);
    await db().collection("elo").doc(me().uid).set(patch, { merge: true }).catch(function (e) { console.warn("elo", e); });
    return nw;
  };

  // ---------------- Rooms ----------------
  EBKH.createRoom = async function (opts) {
    await EBKF.ready;
    if (!me()) throw new Error("Sign in to play head-to-head.");
    var elo = opts.rated ? await EBKH.myEloFor(opts.sport) : DEFAULT_ELO;
    var players = {}; players[me().uid] = { name: myName(), streak: 0, done: false, elo: elo };
    var ref = db().collection("rooms").doc();
    var data = {
      code: code5(), hostUid: me().uid, hostName: myName(),
      mode: opts.mode, sport: opts.sport, cat: opts.cat || "", catLabel: opts.catLabel || "",
      seed: seedHex(), rated: !!opts.rated, cap: opts.cap || (opts.rated ? 2 : 8),
      status: "lobby", hostElo: elo, players: players,
      created: fv().serverTimestamp(),
    };
    await ref.set(data);
    return Object.assign({ id: ref.id, role: "host" }, data);
  };

  async function joinRoomRef(ref, rated, sport) {
    var elo = rated ? await EBKH.myEloFor(sport) : DEFAULT_ELO;
    var uid = me().uid, nm = myName(), role = "guest";
    await db().runTransaction(async function (tx) {
      var d = await tx.get(ref);
      if (!d.exists) throw new Error("Room not found.");
      var m = d.data();
      if (m.hostUid === uid) { role = "host"; return; }
      if (m.players && m.players[uid]) { return; } // rejoin
      if (m.status !== "lobby") throw new Error("That match already started.");
      var n = m.players ? Object.keys(m.players).length : 0;
      if (n >= (m.cap || 2)) throw new Error("That room is full.");
      var patch = {}; patch["players." + uid] = { name: nm, streak: 0, done: false, elo: elo };
      tx.update(ref, patch);
    });
    return role;
  }

  EBKH.joinByCode = async function (codeStr) {
    await EBKF.ready;
    if (!me()) throw new Error("Sign in to play head-to-head.");
    codeStr = (codeStr || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
    if (codeStr.length < 4) throw new Error("Enter the full room code.");
    var q = await db().collection("rooms").where("code", "==", codeStr).limit(5).get();
    var doc = null;
    q.forEach(function (d) { var m = d.data(); if (!doc && (m.status === "lobby" || (m.players && m.players[me().uid]))) doc = d; });
    if (!doc) throw new Error("No open room with that code.");
    var role = await joinRoomRef(doc.ref, doc.data().rated, doc.data().sport);
    return { id: doc.id, role: role };
  };

  // ranked: join the closest-Elo open rated 1v1 for this sport, else null
  EBKH.findRanked = async function (sport) {
    await EBKF.ready;
    var q = await db().collection("rooms").where("status", "==", "lobby").limit(40).get();
    var myElo = await EBKH.myEloFor(sport);
    var best = null, bestD = 1e9;
    q.forEach(function (d) {
      var m = d.data();
      if (!m.rated || m.sport !== sport || m.hostUid === me().uid) return;
      var n = m.players ? Object.keys(m.players).length : 0;
      if (n >= (m.cap || 2)) return;
      var dist = Math.abs((m.hostElo || DEFAULT_ELO) - myElo);
      if (dist < bestD) { bestD = dist; best = d; }
    });
    if (!best) return null;
    try { var role = await joinRoomRef(best.ref, true, sport); return { id: best.id, role: role }; }
    catch (e) { return null; }
  };

  // host-only: change room config while in the lobby
  EBKH.setConfig = function (id, cfg) {
    var patch = {};
    ["mode", "sport", "cat", "catLabel"].forEach(function (k) { if (k in cfg) patch[k] = cfg[k]; });
    return db().collection("rooms").doc(id).update(patch).catch(function (e) { console.warn("setConfig", e); });
  };
  EBKH.start = function (id) {
    return db().collection("rooms").doc(id).update({ status: "active", startedAt: fv().serverTimestamp() })
      .catch(function (e) { console.warn("start", e); });
  };
  EBKH.finishRoom = function (id) {
    return db().collection("rooms").doc(id).update({ status: "done" }).catch(function () {});
  };

  EBKH.progress = function (id, fields) {
    if (!me()) return Promise.resolve();
    var uid = me().uid, patch = {};
    if ("streak" in fields) patch["players." + uid + ".streak"] = fields.streak;
    if ("done" in fields) patch["players." + uid + ".done"] = fields.done;
    return db().collection("rooms").doc(id).update(patch).catch(function (e) { console.warn("progress", e); });
  };

  EBKH.listen = function (id, cb) {
    return db().collection("rooms").doc(id).onSnapshot(function (d) {
      if (d.exists) cb(Object.assign({ id: d.id }, d.data()));
    }, function (e) { console.warn("h2h listen", e); });
  };
  EBKH.get = async function (id) {
    await EBKF.ready;
    var d = await db().collection("rooms").doc(id).get();
    return d.exists ? Object.assign({ id: d.id }, d.data()) : null;
  };
  EBKH.cancel = function (id) { return db().collection("rooms").doc(id).delete().catch(function () {}); };
})();
