/* EBK · user dashboard — aggregate stats from the user's Firestore scores. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var sportName = {}, sportEmoji = {}, gameName = {};
  (window.EBK ? EBK.sports : []).forEach(function (s) {
    sportName[s.key] = s.name;
    sportEmoji[s.key] = EBK.logoTag ? EBK.logoTag(s) : s.emoji;
  });
  (window.EBK ? EBK.games : []).forEach(function (g) { gameName[g.slug] = g.title; });

  $("#signin-cta") && $("#signin-cta").addEventListener("click", function () { window.EBKopenAuth && EBKopenAuth(); });

  function show(id) { ["signedout", "loading", "stats"].forEach(function (x) { $("#" + x).hidden = x !== id; }); }

  function render(rows, user) {
    $("#hello").textContent = "Hey, " + (user.displayName || "Player");
    if (!rows.length) {
      show("stats"); $("#cards").innerHTML = ""; $("#bysport").innerHTML = "";
      $("#gametable").innerHTML = ""; $("#empty").hidden = false;
      $("#subline").textContent = "No games logged yet.";
      return;
    }
    $("#empty").hidden = true;
    var totalPlays = 0, totalScore = 0, best = null, bySport = {};
    rows.forEach(function (r) {
      totalPlays += r.plays || 0; totalScore += r.sumScore || 0;
      if (!best || r.best > best.best) best = r;
      var s = bySport[r.sport] || (bySport[r.sport] = { plays: 0, best: 0, score: 0 });
      s.plays += r.plays || 0; s.best = Math.max(s.best, r.best || 0); s.score += r.sumScore || 0;
    });
    var topSport = Object.keys(bySport).sort(function (a, b) { return bySport[b].plays - bySport[a].plays; })[0];
    var avg = totalPlays ? (totalScore / totalPlays) : 0;

    $("#subline").textContent = "Across " + rows.length + " game mode" + (rows.length === 1 ? "" : "s") + ".";
    $("#cards").innerHTML =
      card(totalPlays.toLocaleString(), "Games played") +
      card(avg.toFixed(1), "Avg score / run") +
      card(best ? best.best.toLocaleString() : "—", "Best run", best ? (gameName[best.game] + " · " + sportName[best.sport]) : "") +
      card(topSport ? sportEmoji[topSport] + " " + sportName[topSport] : "—", "Top sport", topSport ? bySport[topSport].plays + " games" : "");

    $("#bysport").innerHTML = Object.keys(bySport).sort(function (a, b) { return bySport[b].plays - bySport[a].plays; })
      .map(function (k) {
        var s = bySport[k];
        return '<div class="stat-card sportcard"><span class="em">' + (sportEmoji[k] || "") + '</span>' +
          '<div><div class="nm">' + (sportName[k] || k) + '</div>' +
          '<div class="mt">' + s.plays + " games · best " + s.best + "</div></div></div>";
      }).join("");

    $("#gametable").innerHTML = rows.slice().sort(function (a, b) { return (b.best || 0) - (a.best || 0); })
      .map(function (r) {
        var a = r.plays ? (r.sumScore / r.plays).toFixed(1) : "—";
        return "<tr><td>" + (sportEmoji[r.sport] || "") + " " + (sportName[r.sport] || r.sport) +
          "</td><td>" + (gameName[r.game] || r.game) + "</td><td>" + (r.best != null ? r.best.toLocaleString() : "—") +
          "</td><td>" + (r.plays || 0) + "</td><td>" + a + "</td></tr>";
      }).join("");
    show("stats");
  }
  function card(v, k, sub) {
    return '<div class="stat-card"><div class="v">' + v + '</div><div class="k">' + k + "</div>" +
      (sub ? '<div class="sub">' + sub + "</div>" : "") + "</div>";
  }

  // ---- account management ----
  function msg(t, ok) {
    var el = $("#acct-msg");
    if (el) { el.textContent = t || ""; el.style.color = ok ? "var(--accent)" : ""; }
  }
  function renderAccount(user) {
    $("#acct-name").textContent = (EBKF.profileName || user.displayName || "Player");
    var verified = user.emailVerified;
    $("#acct-email").innerHTML = esc(user.email || "") +
      ' <span class="acct-badge ' + (verified ? "ok" : "warn") + '">' +
      (verified ? "verified" : "unverified") + "</span>";
    $("#acct-verify").hidden = verified;
  }
  function esc(s) { return String(s).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  $("#acct-rename") && $("#acct-rename").addEventListener("click", function () {
    var nn = prompt("New display name (2-20 characters, shown on public leaderboards):",
                    EBKF.profileName || "");
    if (nn == null) return;
    msg("Renaming…");
    EBKF.renameSelf(nn)
      .then(function (name) { msg("Done — you're now " + name + ".", true); renderAccount(EBKF.user); })
      .catch(function (e) {
        var c = (e && e.code) || "";
        msg(c === "ebk/name-taken" ? "That name is taken." :
            c.indexOf("name") > -1 ? "That name isn't allowed (2-20 simple characters)." :
            "Couldn't rename: " + (e && e.message || e));
      });
  });

  $("#acct-verify") && $("#acct-verify").addEventListener("click", function () {
    msg("Sending…");
    EBKF.resendVerification()
      .then(function () { msg("Verification email sent — check your inbox.", true); })
      .catch(function (e) { msg("Couldn't send: " + (e && e.message || e)); });
  });

  $("#acct-delete") && $("#acct-delete").addEventListener("click", function () {
    if (!confirm("Delete your EBK account?\n\nThis permanently removes your account, scores, and leaderboard entries. There is no undo.")) return;
    var pw = prompt("Confirm your password to delete the account:");
    if (pw == null) return;
    msg("Deleting account…");
    EBKF.deleteAccount(pw)
      .then(function () { alert("Your account and data have been deleted."); location.href = "/"; })
      .catch(function (e) {
        var c = (e && e.code) || "";
        msg(c.indexOf("wrong-password") > -1 || c.indexOf("invalid-credential") > -1
          ? "Wrong password — account not deleted."
          : "Couldn't delete: " + (e && e.message || e));
      });
  });

  function start() {
    if (!(window.EBKF && EBKF.onChange)) return setTimeout(start, 60);
    EBKF.onChange(function (user) {
      if (!user) { show("signedout"); return; }
      show("loading");
      renderAccount(user);
      EBKF.myScores().then(function (rows) { render(rows, user); })
        .catch(function () { render([], user); });
    });
  }
  start();
})();
