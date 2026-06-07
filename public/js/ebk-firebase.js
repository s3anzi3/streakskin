/* EBK · Firebase client (compat SDK, self-loading). Exposes window.EBKF. */
(function () {
  "use strict";
  if (window.EBKF) return;

  // Config is NOT hardcoded — it's served by Firebase Hosting at runtime
  // (/__/firebase/init.json). Keeps the (public-by-design) web apiKey out of
  // source control. Only resolves on the deployed Firebase Hosting domain.
  var SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

  var EBKF = (window.EBKF = { user: undefined, auth: null, db: null, _cbs: [] });

  function load(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  EBKF.ready = (async function () {
    try {
      var res = await fetch("/__/firebase/init.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("Firebase config unavailable (run on the live site)");
      var CONFIG = await res.json();
      if (!window.firebase) await load(SDK + "firebase-app-compat.js");
      await load(SDK + "firebase-auth-compat.js");
      await load(SDK + "firebase-firestore-compat.js");
      firebase.initializeApp(CONFIG);
      EBKF.auth = firebase.auth();
      EBKF.db = firebase.firestore();
      try { await EBKF.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}
      EBKF.auth.onAuthStateChanged(function (u) {
        EBKF.user = u;
        EBKF._cbs.forEach(function (cb) { try { cb(u); } catch (e) {} });
      });
      return EBKF;
    } catch (e) {
      console.warn("EBKF init failed", e);
      EBKF.user = null;
      EBKF._cbs.forEach(function (cb) { try { cb(null); } catch (e) {} });
      throw e;
    }
  })();

  EBKF.onChange = function (cb) {
    EBKF._cbs.push(cb);
    if (EBKF.user !== undefined) cb(EBKF.user);
  };

  function saveUser(u, name) {
    return EBKF.db.collection("users").doc(u.uid)
      .set({ name: name || u.displayName || "Player", updated: Date.now() }, { merge: true })
      .catch(function () {});
  }

  function nameErr(code, msg) { var e = new Error(msg); e.code = code; return e; }
  function nameKeyOf(name) { return (name || "").trim().toLowerCase(); }

  // profanity / slur filter (client-side). Normalizes leetspeak + strips
  // separators so "sh1t", "f.u.c.k", "f@g" are caught. List favors clearly
  // offensive terms to avoid false-positives on normal names.
  var BAD_WORDS = [
    "fuck", "motherfuck", "shit", "bullshit", "bitch", "bastard", "asshole",
    "cunt", "pussy", "slut", "whore", "cock", "wank", "twat", "prick", "bollock",
    "nigger", "nigga", "faggot", "retard", "spic", "chink", "kike", "wetback",
    "tranny", "dyke", "coon", "nazi", "hitler", "rapist", "rape", "pedo",
    "molest", "porn", "jizz", "dildo",
  ];
  function nameClean(name) {
    var map = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i", "|": "i" };
    var s = String(name).toLowerCase()
      .replace(/[013457@$!|]/g, function (c) { return map[c] || c; })
      .replace(/[^a-z]/g, "");
    for (var i = 0; i < BAD_WORDS.length; i++) if (s.indexOf(BAD_WORDS[i]) > -1) return false;
    return true;
  }

  EBKF.nameAvailable = async function (name) {
    await EBKF.ready;
    var key = nameKeyOf(name);
    if (key.length < 2) return false;
    var s = await EBKF.db.collection("usernames").doc(key).get();
    return !s.exists;
  };

  EBKF.signUp = async function (email, pw, name) {
    await EBKF.ready;
    name = (name || "").trim();
    var key = nameKeyOf(name);
    if ((pw || "").length < 6) throw nameErr("ebk/weak-password", "Password must be at least 6 characters.");
    if (key.length < 2) throw nameErr("ebk/name-short", "Display name must be at least 2 characters.");
    if (/[\/.#$\[\]]/.test(key)) throw nameErr("ebk/name-invalid", "Display name has invalid characters.");
    if (!nameClean(name)) throw nameErr("ebk/name-profane", "Please choose a different display name.");
    // pre-check (avoids creating an account for an obviously-taken name)
    if ((await EBKF.db.collection("usernames").doc(key).get()).exists)
      throw nameErr("ebk/name-taken", "That display name is taken.");

    var c = await EBKF.auth.createUserWithEmailAndPassword(email, pw);
    try {
      // atomic claim: a second user claiming the same key hits update(=denied)
      await EBKF.db.collection("usernames").doc(key).set({ uid: c.user.uid, name: name, created: Date.now() });
    } catch (err) {
      try { await c.user.delete(); } catch (e) {}
      throw nameErr("ebk/name-taken", "That display name was just taken — try another.");
    }
    await c.user.updateProfile({ displayName: name });
    await saveUser(c.user, name);
    return c.user;
  };
  EBKF.signIn = async function (email, pw) {
    await EBKF.ready;
    return (await EBKF.auth.signInWithEmailAndPassword(email, pw)).user;
  };
  EBKF.signInGoogle = async function () {
    await EBKF.ready;
    var p = new firebase.auth.GoogleAuthProvider();
    var c = await EBKF.auth.signInWithPopup(p);
    await saveUser(c.user, c.user.displayName);
    return c.user;
  };
  EBKF.signOut = async function () { await EBKF.ready; return EBKF.auth.signOut(); };
  EBKF.resetPassword = async function (email) { await EBKF.ready; return EBKF.auth.sendPasswordResetEmail(email); };

  // record a finished run: keep best + running totals per (sport, game)
  EBKF.recordScore = async function (sport, game, score) {
    try {
      await EBKF.ready;
      var u = EBKF.user;
      if (!u || score == null || isNaN(score)) return;
      var ref = EBKF.db.collection("scores").doc(u.uid + "_" + sport + "_" + game);
      await EBKF.db.runTransaction(async function (tx) {
        var d = await tx.get(ref);
        var p = d.exists ? d.data() : { best: 0, plays: 0, sumScore: 0 };
        tx.set(ref, {
          uid: u.uid, name: u.displayName || "Player", sport: sport, game: game,
          best: Math.max(p.best || 0, score), plays: (p.plays || 0) + 1,
          sumScore: (p.sumScore || 0) + score, updated: Date.now(),
        }, { merge: true });
      });
    } catch (e) { console.warn("recordScore failed", e); }
  };

  // read helpers
  EBKF.leaderboard = async function (sport, game, n) {
    await EBKF.ready;
    var q = await EBKF.db.collection("scores")
      .where("sport", "==", sport).where("game", "==", game)
      .orderBy("best", "desc").limit(n || 100).get();
    return q.docs.map(function (d) { return d.data(); });
  };
  EBKF.myScores = async function () {
    await EBKF.ready;
    if (!EBKF.user) return [];
    var q = await EBKF.db.collection("scores").where("uid", "==", EBKF.user.uid).get();
    return q.docs.map(function (d) { return d.data(); });
  };
})();
