/* EBK · Leaderboards — rankings from Firestore.
   Categories: best run per sport+game, per-sport totals, per-game totals
   (across sports), overall total, most games played. Totals = sum of a
   player's best runs in each mode they've played. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var catSel = $("#cat"), sportSel = $("#sport"), gameSel = $("#game"),
      board = $("#board"), status = $("#status"), metricTh = $("#metric");

  var METRIC = { "higher-lower": "Best streak", "stat-line": "Best score",
                 "career-path": "Best score", "player-grid": "Best (of 9)" };

  function liveSports() { return EBK.sports.filter(function (s) { return EBK.sportLive(s.key); }); }
  function liveGames(sport) {
    return EBK.games.filter(function (g) {
      return g.slug !== "team" && (!sport || EBK.isLive(sport, g.slug));
    });
  }

  function fillSports() {
    sportSel.innerHTML = liveSports().map(function (s) {
      return '<option value="' + s.key + '">' + s.emoji + " " + s.name + "</option>";
    }).join("");
  }
  function fillGames() {
    var sport = catSel.value === "game" ? sportSel.value : null;
    gameSel.innerHTML = liveGames(sport).map(function (g) {
      return '<option value="' + g.slug + '">' + g.title + "</option>";
    }).join("");
  }

  function applyCat() {
    var cat = catSel.value;
    $("#sport-field").style.display = (cat === "game" || cat === "sport") ? "" : "none";
    $("#game-field").style.display = (cat === "game" || cat === "game-all") ? "" : "none";
    fillGames();
    load();
  }

  function rowHTML(r, i, me, valueOf) {
    var mine = me && r.uid === me;
    var rep = mine ? "" : ' <button class="rep-btn" title="Report name" data-uid="' +
      esc(r.uid || "") + '" data-name="' + esc(r.name || "") + '">⚑</button>';
    var v = valueOf(r);
    var medal = ["🥇", "🥈", "🥉"][i];
    return "<tr" + (mine ? ' class="me"' : "") +
      '><td class="rank' + (medal ? " medal" : "") + '">' + (medal || (i + 1)) +
      '</td><td class="pname">' + esc(r.name || "Player") + (mine ? " <small>(you)</small>" : "") + rep +
      '</td><td class="metric">' + (v != null ? Number(v).toLocaleString() : "—") +
      "</td><td>" + (r.plays || 0) + "</td></tr>";
  }

  function load() {
    var cat = catSel.value, sport = sportSel.value, game = gameSel.value;
    board.innerHTML = "";
    status.textContent = "Loading…";
    if (!window.EBKF) { status.textContent = "Connecting…"; return setTimeout(load, 200); }

    var p, valueOf;
    if (cat === "game") {
      metricTh.textContent = METRIC[game] || "Best";
      valueOf = function (r) { return r.best; };
      p = EBKF.leaderboard(sport, game, 100);
    } else {
      var field = cat === "sport" ? "s_" + sport
        : cat === "game-all" ? EBKF.gameField(game)
        : cat === "plays" ? "plays" : "overall";
      metricTh.textContent = cat === "plays" ? "Games played" : "Total";
      valueOf = function (r) { return r[field]; };
      p = EBKF.topTotals(field, 100).then(function (rows) {
        return rows.filter(function (r) { return (r[field] || 0) > 0; });
      });
    }

    p.then(function (rows) {
      var me = EBKF.user && EBKF.user.uid;
      if (!rows.length) { status.textContent = "No scores here yet — be the first to play!"; return; }
      status.textContent = rows.length + " player" + (rows.length === 1 ? "" : "s");
      board.innerHTML = rows.map(function (r, i) { return rowHTML(r, i, me, valueOf); }).join("");
    }).catch(function (e) {
      status.textContent = "Leaderboards aren't available yet. " + (e && e.message ? "(" + e.message + ")" : "");
    });
  }
  function esc(s) { return String(s).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  board.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".rep-btn");
    if (!b) return;
    if (!(window.EBKF && EBKF.user)) { window.EBKopenAuth && EBKopenAuth(); return; }
    var reason = prompt("Report \"" + b.dataset.name + "\" as an inappropriate name?\nOptional reason:", "");
    if (reason === null) return;
    EBKF.reportName(b.dataset.uid, b.dataset.name, reason)
      .then(function () { b.textContent = "✓"; b.disabled = true; b.title = "Reported"; })
      .catch(function () { alert("Couldn't submit the report — try again."); });
  });

  fillSports(); fillGames(); applyCat();
  catSel.addEventListener("change", applyCat);
  sportSel.addEventListener("change", function () { fillGames(); load(); });
  gameSel.addEventListener("change", load);
  // refresh once auth resolves (to highlight the user's row)
  var t = setInterval(function () { if (window.EBKF && EBKF.onChange) { clearInterval(t); EBKF.onChange(function () { load(); }); } }, 100);
})();
