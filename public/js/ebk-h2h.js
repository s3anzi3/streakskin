/* EBK · Head-to-Head matchmaking + realtime sync (Firestore). Exposes window.EBKH.
   A match stores a shared `seed`; both clients generate the IDENTICAL question
   sequence locally from that seed (see h2h.js), so only live streaks need to
   sync. Modes: higher-lower, career-path. */
(function () {
  "use strict";
  if (window.EBKH) return;
  if (!window.EBKF) { var s = document.createElement("script"); s.src = "/js/ebk-firebase.js"; document.head.appendChild(s); }

  var CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no easily-confused chars
  function code5() { var s = ""; for (var i = 0; i < 5; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; return s; }
  function seedHex() { var s = ""; for (var i = 0; i < 6; i++) s += ("000" + ((Math.random() * 65536) | 0).toString(16)).slice(-4); return s; }

  var EBKH = (window.EBKH = {});
  var db = function () { return EBKF.db; };
  var me = function () { return EBKF.user; };
  function myName() { return (EBKF.profileName) || (me() && me().displayName) || "Player"; }
  EBKH.myName = myName;

  EBKH.createMatch = async function (mode, sport, cat, catLabel) {
    await EBKF.ready;
    if (!me()) throw new Error("Sign in to play head-to-head.");
    var ref = db().collection("matches").doc();
    var data = {
      code: code5(), mode: mode, sport: sport, cat: cat || "", catLabel: catLabel || "",
      seed: seedHex(),
      hostUid: me().uid, hostName: myName(), guestUid: "", guestName: "",
      hostStreak: 0, hostDone: false, guestStreak: 0, guestDone: false,
      status: "open", winner: "", created: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(data);
    return Object.assign({ id: ref.id, role: "host" }, data);
  };

  async function joinRef(ref) {
    var uid = me().uid, nm = myName(), role = "guest";
    await db().runTransaction(async function (tx) {
      var d = await tx.get(ref);
      if (!d.exists) throw new Error("Match not found.");
      var m = d.data();
      if (m.hostUid === uid) { role = "host"; return; }      // rejoin own match
      if (m.guestUid === uid) { role = "guest"; return; }    // rejoin as guest
      if (m.guestUid) throw new Error("That match is already full.");
      if (m.status !== "open") throw new Error("That match already started.");
      tx.update(ref, { guestUid: uid, guestName: nm, status: "active" });
    });
    return role;
  }

  EBKH.joinByCode = async function (codeStr) {
    await EBKF.ready;
    if (!me()) throw new Error("Sign in to play head-to-head.");
    codeStr = (codeStr || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
    if (codeStr.length < 4) throw new Error("Enter the full match code.");
    var q = await db().collection("matches").where("code", "==", codeStr).limit(5).get();
    var doc = null;
    q.forEach(function (d) { var m = d.data(); if (!doc && (m.status === "open" || m.hostUid === me().uid || m.guestUid === me().uid)) doc = d; });
    if (!doc) throw new Error("No open match with that code.");
    var role = await joinRef(doc.ref);
    return { id: doc.id, role: role };
  };

  // random opponent: grab an open match for the same mode/sport/cat, else host one
  EBKH.quickMatch = async function (mode, sport, cat, catLabel) {
    await EBKF.ready;
    if (!me()) throw new Error("Sign in to play head-to-head.");
    var q = await db().collection("matches").where("status", "==", "open").limit(30).get();
    var cand = [];
    q.forEach(function (d) {
      var m = d.data();
      if (m.hostUid !== me().uid && m.mode === mode && m.sport === sport && (m.cat || "") === (cat || ""))
        cand.push(d);
    });
    for (var i = 0; i < cand.length; i++) {
      try { var role = await joinRef(cand[i].ref); return { id: cand[i].id, role: role }; }
      catch (e) { /* someone else grabbed it — try next */ }
    }
    return await EBKH.createMatch(mode, sport, cat, catLabel);
  };

  EBKH.listen = function (id, cb) {
    return db().collection("matches").doc(id).onSnapshot(function (d) {
      if (d.exists) cb(Object.assign({ id: d.id }, d.data()));
    }, function (e) { console.warn("h2h listen", e); });
  };
  EBKH.get = async function (id) {
    await EBKF.ready;
    var d = await db().collection("matches").doc(id).get();
    return d.exists ? Object.assign({ id: d.id }, d.data()) : null;
  };

  // write only your own side's progress (rules enforce this too)
  EBKH.update = function (id, role, fields) {
    var patch = {};
    if (role === "host") {
      if ("streak" in fields) patch.hostStreak = fields.streak;
      if ("done" in fields) patch.hostDone = fields.done;
    } else {
      if ("streak" in fields) patch.guestStreak = fields.streak;
      if ("done" in fields) patch.guestDone = fields.done;
    }
    if ("winner" in fields) patch.winner = fields.winner;
    if ("status" in fields) patch.status = fields.status;
    return db().collection("matches").doc(id).update(patch).catch(function (e) { console.warn("h2h update", e); });
  };

  EBKH.cancel = function (id) {
    return db().collection("matches").doc(id).delete().catch(function () {});
  };
})();
