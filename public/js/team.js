/* EBK · Team Study — browse / filter / sort every player-season for a team.
   Sport-aware via <body data-sport>. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const fmt = (v, d = 0) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));

  const SPORT = document.body.dataset.sport || "nfl";
  const LEAGUE = window[SPORT.toUpperCase()] || window.NFL;
  const DATA_URL = SPORT === "nfl" ? "/data/players.json" : "/data/" + SPORT + "/players.json";

  const CFG = {
    nfl: {
      seasons: "1999–2025",
      groups: ["all", "QB", "RB", "WR", "TE", "DL", "LB", "DB"],
      labels: {
        games: "G", passing_yards: "Pass Yds", passing_tds: "Pass TD",
        rushing_yards: "Rush Yds", rushing_tds: "Rush TD", receptions: "Rec",
        receiving_yards: "Rec Yds", receiving_tds: "Rec TD",
        fantasy_points: "Std", fantasy_points_ppr: "PPR",
        def_sacks: "Sacks", tackles: "Tack", def_interceptions: "INT",
        def_pass_defended: "PD", def_fumbles_forced: "FF",
      },
      dec: { def_sacks: 1, fantasy_points: 1, fantasy_points_ppr: 1 },
      colsets: {
        all: ["games", "fantasy_points_ppr"],
        QB: ["games", "passing_yards", "passing_tds", "rushing_yards", "rushing_tds", "fantasy_points_ppr"],
        RB: ["games", "rushing_yards", "rushing_tds", "receptions", "receiving_yards", "receiving_tds", "fantasy_points_ppr"],
        WR: ["games", "receptions", "receiving_yards", "receiving_tds", "rushing_yards", "fantasy_points_ppr"],
        TE: ["games", "receptions", "receiving_yards", "receiving_tds", "fantasy_points_ppr"],
        DL: ["games", "def_sacks", "tackles", "def_interceptions", "def_pass_defended", "def_fumbles_forced"],
        LB: ["games", "tackles", "def_sacks", "def_interceptions", "def_pass_defended", "def_fumbles_forced"],
        DB: ["games", "def_interceptions", "def_pass_defended", "tackles", "def_sacks", "def_fumbles_forced"],
      },
    },
    nba: {
      seasons: "2002–2023",
      groups: ["all", "G", "F", "C"],
      labels: {
        games: "G", pts: "PTS", ppg: "PPG", reb: "REB", rpg: "RPG",
        ast: "AST", apg: "APG", stl: "STL", blk: "BLK", tpm: "3PM",
      },
      dec: { ppg: 1, rpg: 1, apg: 1 },
      colsets: {
        all: ["games", "pts", "ppg", "reb", "ast"],
        G: ["games", "pts", "ppg", "ast", "apg", "stl", "tpm"],
        F: ["games", "pts", "ppg", "reb", "rpg", "ast", "tpm"],
        C: ["games", "pts", "ppg", "reb", "rpg", "blk", "stl"],
      },
    },
    mlb: {
      seasons: "2000–2021",
      groups: ["all", "H", "P"],
      labels: { games: "G", hr: "HR", rbi: "RBI", hits: "H", runs: "R", sb: "SB", avg: "AVG",
                w: "W", k: "K", sv: "SV", era: "ERA" },
      dec: { avg: 3, era: 2 },
      colsets: {
        all: ["games", "hr", "rbi", "avg"],
        H: ["games", "hr", "rbi", "hits", "runs", "sb", "avg"],
        P: ["games", "w", "k", "sv", "era"],
      },
    },
    nhl: {
      seasons: "2000–2024",
      groups: ["all", "F", "D", "G"],
      labels: { games: "GP", g: "G", a: "A", pts: "P", plus: "+/-", shots: "S",
                ppg_g: "PPG", ppg: "P/G", w: "W", sv: "SV", svpct: "SV%", gaa: "GAA", so: "SO" },
      dec: { ppg: 1, svpct: 3, gaa: 2 },
      colsets: {
        all: ["games", "g", "a", "pts"],
        F: ["games", "g", "a", "pts", "plus", "shots", "ppg_g"],
        D: ["games", "g", "a", "pts", "plus", "shots"],
        G: ["games", "w", "sv", "svpct", "gaa", "so"],
      },
    },
  }[SPORT];

  const S = { rows: [], teamKey: "", group: "all", from: 0, to: 9999, q: "",
              sortKey: "season", sortDir: -1 };

  function val(r, key) {
    if (key === "season") return r.season;
    if (key === "name") return r.name;
    if (key === "pos") return r.pos;
    if (key === "games") return r.games;
    return r.stats[key];
  }

  async function load() {
    S.teamKey = new URLSearchParams(location.search).get("t") || "";
    try {
      const res = await fetch(DATA_URL, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      S.rows = data.players.filter((p) => LEAGUE.keyOf(p.team) === S.teamKey);
      if (!S.rows.length) { $("#loading").textContent = "Unknown team."; return; }
      const seasons = S.rows.map((r) => r.season);
      S.from = Math.min(...seasons); S.to = Math.max(...seasons);
      buildHead();
      buildControls(Math.min(...seasons), Math.max(...seasons));
      $("#loading").hidden = true;
      $("#content").hidden = false;
      render();
    } catch (e) {
      $("#loading").textContent = "Couldn't load data. " + e.message;
    }
  }

  function buildHead() {
    $("#team-head").innerHTML =
      `<img src="${LEAGUE.logo(S.teamKey)}" alt="" />` +
      `<div><h1>${LEAGUE.name(S.teamKey)}</h1>` +
      `<div class="sub">Every player-season in the EBK pool · ${CFG.seasons}</div></div>`;
    document.title = LEAGUE.name(S.teamKey) + " · Team Study · EBK";
  }

  function buildControls(minY, maxY) {
    const chips = $("#pos-chips");
    chips.innerHTML = "";
    CFG.groups.forEach((g) => {
      const b = document.createElement("button");
      b.className = "chip-btn" + (g === S.group ? " active" : "");
      b.textContent = g === "all" ? "All" : g;
      b.addEventListener("click", () => {
        S.group = g; S.sortKey = "season"; S.sortDir = -1;
        [...chips.children].forEach((c) => c.classList.remove("active"));
        b.classList.add("active");
        render();
      });
      chips.appendChild(b);
    });

    const from = $("#from"), to = $("#to");
    for (let y = maxY; y >= minY; y--) { from.add(new Option(y, y)); to.add(new Option(y, y)); }
    from.value = minY; to.value = maxY;
    from.addEventListener("change", () => { S.from = +from.value; if (S.from > S.to) { to.value = from.value; S.to = S.from; } render(); });
    to.addEventListener("change", () => { S.to = +to.value; if (S.to < S.from) { from.value = to.value; S.from = S.to; } render(); });
    $("#search").addEventListener("input", (e) => { S.q = e.target.value.trim().toLowerCase(); render(); });
  }

  function columns() {
    const cols = [{ key: "name", label: "Player", type: "text" }];
    if (S.group === "all") cols.push({ key: "pos", label: "Pos", type: "text" });
    cols.push({ key: "season", label: "Season", type: "num" });
    for (const k of CFG.colsets[S.group]) cols.push({ key: k, label: CFG.labels[k], type: "num", dec: CFG.dec[k] || 0 });
    return cols;
  }

  function filtered() {
    return S.rows.filter((r) =>
      r.season >= S.from && r.season <= S.to &&
      (S.group === "all" || r.grp === S.group) &&
      (!S.q || r.name.toLowerCase().includes(S.q)));
  }

  function sortRows(rows) {
    const k = S.sortKey, dir = S.sortDir;
    return rows.sort((a, b) => {
      let va = val(a, k), vb = val(b, k);
      if (typeof va === "string" || typeof vb === "string") {
        return dir * String(va ?? "").localeCompare(String(vb ?? ""));
      }
      va = va == null ? -Infinity : va; vb = vb == null ? -Infinity : vb;
      if (va === vb) return a.season - b.season;
      return dir * (va - vb);
    });
  }

  function render() {
    const cols = columns();
    const thead = $("#thead");
    thead.innerHTML = "<tr>" + cols.map((c) => {
      const cls = c.key === S.sortKey ? (S.sortDir > 0 ? "sort-asc" : "sort-desc") : "";
      return `<th class="${cls}" data-k="${c.key}">${c.label}</th>`;
    }).join("") + "</tr>";
    [...thead.querySelectorAll("th")].forEach((th) => {
      th.addEventListener("click", () => {
        const k = th.dataset.k;
        if (S.sortKey === k) S.sortDir = -S.sortDir;
        else { S.sortKey = k; S.sortDir = (k === "name") ? 1 : -1; }
        render();
      });
    });

    const rows = sortRows(filtered());
    $("#count").textContent = `${rows.length.toLocaleString()} player-season${rows.length === 1 ? "" : "s"}`;
    const tbody = $("#tbody");
    if (!rows.length) { tbody.innerHTML = `<tr><td class="empty" colspan="${cols.length}">No players match these filters.</td></tr>`; return; }
    tbody.innerHTML = rows.map((r) =>
      "<tr>" + cols.map((c) => {
        if (c.key === "name") return `<td><span class="pname">${r.name}</span></td>`;
        if (c.key === "pos") return `<td class="ppos">${r.pos}</td>`;
        if (c.key === "season") return `<td>${r.seasonLabel || r.season}</td>`;
        return `<td>${fmt(val(r, c.key), c.dec)}</td>`;
      }).join("") + "</tr>"
    ).join("");
  }

  load();
})();
