/* EBK · admin portal — review reported names, rename or dismiss. Admin-gated. */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s).replace(/[<>&"']/g, function (c) { return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function render(groups) {
    $("#loading").hidden = true;
    var keys = Object.keys(groups).sort(function (a, b) { return groups[b].count - groups[a].count; });
    if (!keys.length) { $("#none").hidden = false; $("#reports").innerHTML = ""; return; }
    $("#none").hidden = true;
    $("#reports").innerHTML = keys.map(function (k) {
      var g = groups[k];
      var reasons = g.reasons.filter(Boolean);
      var rename = g.uid ? '<button class="hero-cta rename" data-uid="' + esc(g.uid) + '" data-name="' + esc(g.name || "") + '">Change name</button>' : "";
      var wipe = g.uid ? '<button class="ebk-signin wipe" data-uid="' + esc(g.uid) + '" data-name="' + esc(g.name || "") + '">Wipe scores</button>' : "";
      return '<div class="rep-card"><h3>' + esc(g.name || "(unknown)") +
        ' <span class="cnt">' + g.count + " report" + (g.count > 1 ? "s" : "") + "</span></h3>" +
        (reasons.length ? '<div class="reasons">“' + reasons.map(esc).join("” · “") + "”</div>" : "") +
        '<div class="acts">' + rename + wipe +
        '<button class="ebk-signin dismiss" data-uid="' + esc(g.uid) + '" data-name="' + esc(g.name || "") + '">Dismiss</button>' +
        "</div></div>";
    }).join("");
  }

  function load() {
    $("#loading").hidden = false; $("#none").hidden = true;
    EBKF.listReports().then(function (rows) {
      var g = {};
      rows.forEach(function (r) {
        var key = r.targetUid || ("name:" + (r.targetName || ""));
        var e = g[key] || (g[key] = { uid: r.targetUid || "", name: r.targetName || "", count: 0, reasons: [] });
        e.count++;
        if (r.reason) e.reasons.push(r.reason);
        if (!e.name && r.targetName) e.name = r.targetName;
      });
      render(g);
    }).catch(function (e) { $("#loading").textContent = "Couldn't load reports. " + (e && e.message || ""); });
  }

  document.addEventListener("click", function (e) {
    var rn = e.target.closest && e.target.closest(".rename");
    var dm = e.target.closest && e.target.closest(".dismiss");
    if (rn) {
      var nn = prompt("New display name for “" + (rn.dataset.name || "this user") + "”:", "");
      if (nn == null) return;
      nn = nn.trim();
      if (!nn) return;
      EBKF.adminRename(rn.dataset.uid, nn)
        .then(function () { alert("Renamed to “" + nn + "”."); load(); })
        .catch(function (err) { alert("Couldn't rename: " + (err && err.message || err)); });
    }
    if (dm) {
      if (!confirm("Dismiss all reports for “" + (dm.dataset.name || "this name") + "”?")) return;
      EBKF.dismissReports(dm.dataset.uid || ("name:" + dm.dataset.name)).then(load)
        .catch(function () { alert("Couldn't dismiss reports."); });
    }
    var wp = e.target.closest && e.target.closest(".wipe");
    if (wp) {
      if (!confirm("Wipe ALL leaderboard scores + totals for “" + (wp.dataset.name || "this user") + "”? (For cheaters — can't be undone.)")) return;
      EBKF.adminWipeScores(wp.dataset.uid)
        .then(function () { alert("Scores wiped."); })
        .catch(function (err) { alert("Couldn't wipe: " + (err && err.message || err)); });
    }
  });

  var bf = $("#backfill");
  if (bf) bf.addEventListener("click", function () {
    if (!confirm("Rebuild totals for every player from their score docs?")) return;
    bf.disabled = true;
    $("#backfill-msg").textContent = "Working…";
    EBKF.adminBackfillTotals()
      .then(function (n) { $("#backfill-msg").textContent = "Done — " + n + " player totals rebuilt."; })
      .catch(function (e) { $("#backfill-msg").textContent = "Failed: " + (e && e.message || e); })
      .finally(function () { bf.disabled = false; });
  });

  function start() {
    if (!(window.EBKF && EBKF.onChange)) return setTimeout(start, 60);
    EBKF.onChange(function () {
      var admin = EBKF.isAdmin();
      $("#tools").hidden = !admin;
      if (!admin) {
        $("#loading").hidden = true; $("#none").hidden = true;
        $("#reports").innerHTML = ""; $("#denied").hidden = false;
        return;
      }
      $("#denied").hidden = true; load();
    });
  }
  start();
})();
