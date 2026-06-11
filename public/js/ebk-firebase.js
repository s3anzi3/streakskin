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
        EBKF.profileName = u ? (u.displayName || null) : null;
        if (u) EBKF.db.collection("users").doc(u.uid).get()
          .then(function (d) { if (d.exists && d.data().name) EBKF.profileName = d.data().name; })
          .catch(function () {});
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
  // returns an error code or null. Allows letters/numbers/spaces, basic
  // punctuation, accented Latin and emoji; blocks "fancy"/zalgo/other glyphs.
  function nameIssues(name) {
    var chars = Array.from(name || "");
    if (chars.length < 2) return "ebk/name-short";
    if (chars.length > 20) return "ebk/name-long";
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      if (/[A-Za-z0-9 _\-.'’,]/.test(ch)) continue;                  // basic
      if (/[À-ɏ]/.test(ch)) continue;                           // accented Latin
      if (ch === "‍" || ch === "️") continue;                   // ZWJ / VS16
      if (/[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/u.test(ch)) continue; // flags / skin tones
      if (/\p{Extended_Pictographic}/u.test(ch)) continue;               // emoji
      return "ebk/name-invalid";
    }
    if (!nameClean(name)) return "ebk/name-profane";
    return null;
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
    var issue = nameIssues(name);
    if (issue) throw nameErr(issue, "Invalid display name.");
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
    // record acceptance of Terms/Privacy alongside the profile
    await EBKF.db.collection("users").doc(c.user.uid)
      .set({ name: name, updated: Date.now(), agreedTerms: Date.now() }, { merge: true })
      .catch(function () {});
    try { c.user.sendEmailVerification(); } catch (e) {}
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

  // record a finished run: keep best + running totals per (sport, game), and
  // roll the player's totals doc (overall / per-sport / per-game sums of bests)
  // for the aggregate leaderboards. Client-side throttle backs the rules-side
  // rate limit.
  var gameField = function (game) { return "g_" + String(game).replace(/-/g, "_"); };
  EBKF.recordScore = async function (sport, game, score) {
    try {
      await EBKF.ready;
      var u = EBKF.user;
      if (!u || score == null || isNaN(score)) return;
      score = Math.max(0, Math.min(100000, Math.floor(score)));
      var now = Date.now();
      if (EBKF._lastRec && now - EBKF._lastRec < 3000) return;   // throttle
      EBKF._lastRec = now;
      var name = EBKF.profileName || u.displayName || "Player";
      var ts = firebase.firestore.FieldValue.serverTimestamp();
      var ref = EBKF.db.collection("scores").doc(u.uid + "_" + sport + "_" + game);
      var tref = EBKF.db.collection("totals").doc(u.uid);
      await EBKF.db.runTransaction(async function (tx) {
        var d = await tx.get(ref);
        var t = await tx.get(tref);
        var p = d.exists ? d.data() : { best: 0, plays: 0, sumScore: 0 };
        var newBest = Math.max(p.best || 0, score);
        var delta = newBest - (p.best || 0);
        tx.set(ref, {
          uid: u.uid, name: name, sport: sport, game: game,
          best: newBest, plays: (p.plays || 0) + 1,
          sumScore: (p.sumScore || 0) + score, updated: ts,
        }, { merge: true });
        var td = t.exists ? t.data() : {};
        var patch = {
          uid: u.uid, name: name, updated: ts,
          overall: (td.overall || 0) + delta,
          plays: (td.plays || 0) + 1,
          score: (td.score || 0) + score,
        };
        patch["s_" + sport] = (td["s_" + sport] || 0) + delta;
        patch[gameField(game)] = (td[gameField(game)] || 0) + delta;
        tx.set(tref, patch, { merge: true });
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
  // aggregate boards from the totals collection. field: "overall" | "plays" |
  // "s_<sport>" | "g_<game-with-underscores>"
  EBKF.topTotals = async function (field, n) {
    await EBKF.ready;
    var q = await EBKF.db.collection("totals")
      .orderBy(field, "desc").limit(n || 100).get();
    return q.docs.map(function (d) { return d.data(); });
  };
  EBKF.gameField = gameField;
  EBKF.myScores = async function () {
    await EBKF.ready;
    if (!EBKF.user) return [];
    var q = await EBKF.db.collection("scores").where("uid", "==", EBKF.user.uid).get();
    return q.docs.map(function (d) { return d.data(); });
  };

  // ---- self-service account management ----
  EBKF.renameSelf = async function (newName) {
    await EBKF.ready;
    var u = EBKF.user;
    if (!u) throw new Error("Sign in first.");
    newName = (newName || "").trim();
    var issue = nameIssues(newName);
    if (issue) throw nameErr(issue, "Invalid display name.");
    var oldName = EBKF.profileName || u.displayName || "";
    var oldKey = nameKeyOf(oldName), newKey = nameKeyOf(newName);
    if (newName === oldName) return;
    if (newKey !== oldKey) {
      if ((await EBKF.db.collection("usernames").doc(newKey).get()).exists)
        throw nameErr("ebk/name-taken", "That display name is taken.");
      await EBKF.db.collection("usernames").doc(newKey)
        .set({ uid: u.uid, name: newName, created: Date.now() });
      if (oldKey) {
        try { await EBKF.db.collection("usernames").doc(oldKey).delete(); } catch (e) {}
      }
    }
    await u.updateProfile({ displayName: newName });
    await EBKF.db.collection("users").doc(u.uid)
      .set({ name: newName, updated: Date.now() }, { merge: true });
    EBKF.profileName = newName;
    // propagate to the public leaderboards
    var q = await EBKF.db.collection("scores").where("uid", "==", u.uid).get();
    if (!q.empty) {
      var batch = EBKF.db.batch();
      q.docs.forEach(function (d) { batch.update(d.ref, { name: newName }); });
      await batch.commit();
    }
    await EBKF.db.collection("totals").doc(u.uid)
      .set({ name: newName }, { merge: true }).catch(function () {});
    EBKF._cbs.forEach(function (cb) { try { cb(u); } catch (e) {} });
    return newName;
  };

  // full self-service deletion (the privacy policy promises this)
  EBKF.deleteAccount = async function (password) {
    await EBKF.ready;
    var u = EBKF.user;
    if (!u) throw new Error("Sign in first.");
    if (password) {
      var cred = firebase.auth.EmailAuthProvider.credential(u.email, password);
      await u.reauthenticateWithCredential(cred);
    }
    var uid = u.uid;
    var name = EBKF.profileName || u.displayName || "";
    async function wipe(coll) {
      var q = await EBKF.db.collection(coll).where("uid", "==", uid).get();
      if (q.empty) return;
      var batch = EBKF.db.batch();
      q.docs.forEach(function (d) { batch.delete(d.ref); });
      await batch.commit();
    }
    await wipe("scores");
    await wipe("gridPlays").catch(function () {});
    try { await EBKF.db.collection("totals").doc(uid).delete(); } catch (e) {}
    try { if (name) await EBKF.db.collection("usernames").doc(nameKeyOf(name)).delete(); } catch (e) {}
    try { await EBKF.db.collection("users").doc(uid).delete(); } catch (e) {}
    await u.delete();   // throws auth/requires-recent-login if reauth needed
  };

  EBKF.resendVerification = async function () {
    await EBKF.ready;
    if (EBKF.user) return EBKF.user.sendEmailVerification();
  };

  // ---- daily grid: community answer counts + one play per day ----
  // gridStats/{g}_{cell}_{pid} = { g: "<sport>_<date>", cell, pid, name, n }
  // Rarity of an answer = its count / all counts for that cell.
  EBKF.recordGridAnswer = async function (sport, date, cell, player) {
    await EBKF.ready;
    if (!EBKF.user) return;
    var g = sport + "_" + date;
    var ref = EBKF.db.collection("gridStats").doc(g + "_" + cell + "_" + player.id);
    return ref.set({
      g: g, cell: cell, pid: String(player.id),
      name: String(player.name || "").slice(0, 60),
      n: firebase.firestore.FieldValue.increment(1),
    }, { merge: true });
  };
  EBKF.gridStats = async function (sport, date) {
    await EBKF.ready;
    var q = await EBKF.db.collection("gridStats")
      .where("g", "==", sport + "_" + date).get();
    return q.docs.map(function (d) { return d.data(); });
  };
  EBKF.saveGridPlay = async function (sport, date, data) {
    await EBKF.ready;
    if (!EBKF.user) return;
    var id = EBKF.user.uid + "_" + sport + "_" + date;
    data.uid = EBKF.user.uid; data.sport = sport; data.date = date;
    return EBKF.db.collection("gridPlays").doc(id).set(data).catch(function () {});
  };
  EBKF.getGridPlay = async function (sport, date) {
    await EBKF.ready;
    if (!EBKF.user) return null;
    var d = await EBKF.db.collection("gridPlays")
      .doc(EBKF.user.uid + "_" + sport + "_" + date).get();
    return d.exists ? d.data() : null;
  };

  // ---- admin + reporting ----
  var ADMIN_NAMES = ["seanzie"];
  EBKF.isAdmin = function () { return !!(EBKF.user && ADMIN_NAMES.indexOf(EBKF.user.displayName) > -1); };

  EBKF.reportName = async function (targetUid, targetName, reason) {
    await EBKF.ready;
    if (!EBKF.user) throw new Error("Sign in to report.");
    return EBKF.db.collection("reports").add({
      targetUid: targetUid || "", targetName: targetName || "",
      reporter: EBKF.user.uid, reporterName: EBKF.user.displayName || "",
      reason: String(reason || "").slice(0, 200), ts: Date.now(),
    });
  };
  EBKF.listReports = async function () {
    await EBKF.ready;
    var q = await EBKF.db.collection("reports").get();
    return q.docs.map(function (d) { var o = d.data(); o.id = d.id; return o; });
  };
  EBKF.adminRename = async function (targetUid, newName) {
    await EBKF.ready;
    var issue = nameIssues(newName);
    if (issue) throw nameErr(issue, "Invalid name.");
    await EBKF.db.collection("users").doc(targetUid)
      .set({ name: newName, renamedByAdmin: true, updated: Date.now() }, { merge: true });
    var q = await EBKF.db.collection("scores").where("uid", "==", targetUid).get();
    if (!q.empty) {
      var batch = EBKF.db.batch();
      q.docs.forEach(function (d) { batch.update(d.ref, { name: newName }); });
      await batch.commit();
    }
    await EBKF.db.collection("totals").doc(targetUid)
      .set({ name: newName }, { merge: true }).catch(function () {});
  };

  // one-time backfill: rebuild every user's totals doc from their score docs
  // (for accounts that played before aggregate leaderboards existed)
  EBKF.adminBackfillTotals = async function () {
    await EBKF.ready;
    var q = await EBKF.db.collection("scores").get();
    var byUid = {};
    q.docs.forEach(function (d) {
      var r = d.data();
      if (!r.uid) return;
      var t = byUid[r.uid] || (byUid[r.uid] = {
        uid: r.uid, name: r.name || "Player", overall: 0, plays: 0, score: 0,
      });
      t.overall += r.best || 0;
      t.plays += r.plays || 0;
      t.score += r.sumScore || 0;
      t["s_" + r.sport] = (t["s_" + r.sport] || 0) + (r.best || 0);
      t[gameField(r.game)] = (t[gameField(r.game)] || 0) + (r.best || 0);
    });
    var uids = Object.keys(byUid), n = 0;
    for (var i = 0; i < uids.length; i += 400) {
      var batch = EBKF.db.batch();
      uids.slice(i, i + 400).forEach(function (uid) {
        var t = byUid[uid];
        t.updated = firebase.firestore.FieldValue.serverTimestamp();
        batch.set(EBKF.db.collection("totals").doc(uid), t);
        n++;
      });
      await batch.commit();
    }
    return n;
  };
  // admin: wipe a cheater's leaderboard presence (scores + totals)
  EBKF.adminWipeScores = async function (targetUid) {
    await EBKF.ready;
    var q = await EBKF.db.collection("scores").where("uid", "==", targetUid).get();
    if (!q.empty) {
      var batch = EBKF.db.batch();
      q.docs.forEach(function (d) { batch.delete(d.ref); });
      await batch.commit();
    }
    try { await EBKF.db.collection("totals").doc(targetUid).delete(); } catch (e) {}
  };

  EBKF.dismissReports = async function (targetUid) {
    await EBKF.ready;
    var q = await EBKF.db.collection("reports").where("targetUid", "==", targetUid).get();
    if (q.empty) return;
    var batch = EBKF.db.batch();
    q.docs.forEach(function (d) { batch.delete(d.ref); });
    return batch.commit();
  };
})();
