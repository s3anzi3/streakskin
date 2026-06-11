/* Renders a per-sport hub page from the EBK catalog. Set <body data-sport="nba">. */
(function () {
  "use strict";
  var key = document.body.dataset.sport;
  var S = window.EBK && EBK.sport(key);
  if (!S) return;

  if (S.accent) document.documentElement.style.setProperty("--accent", S.accent);
  document.title = S.name + " · EBK";

  // league-flavored sting on the visitor's first tap/click (autoplay-safe)
  document.addEventListener("pointerdown", function () {
    setTimeout(function () { try { window.EBKS && EBKS.jingle(key); } catch (e) {} }, 60);
  }, { once: true, passive: true });

  var titleEl = document.getElementById("sport-title");
  var tagEl = document.getElementById("sport-tag");
  var grid = document.getElementById("games");
  if (titleEl) titleEl.innerHTML =
    (EBK.logoTag ? EBK.logoTag(S, "xl") : S.emoji) + " <span>" + S.name + "</span>";
  if (tagEl) {
    tagEl.textContent = EBK.sportLive(key)
      ? "Pick a game and prove your knowledge."
      : S.name + " games are in the works — here's what's coming.";
  }
  if (!grid) return;

  EBK.games.forEach(function (g) {
    var live = EBK.isLive(key, g.slug);
    var el = document.createElement(live ? "a" : "div");
    el.className = "game-card " + (live ? "live" : "soon");
    if (live) el.href = EBK.href(key, g.slug);
    else el.setAttribute("aria-disabled", "true");
    el.innerHTML =
      '<span class="badge ' + (live ? "play" : "soon") + '">' + (live ? "Play" : "Soon") + "</span>" +
      '<span class="game-emoji">' + g.emoji + "</span>" +
      '<h3 class="game-title">' + g.title + "</h3>" +
      '<p class="game-desc">' + g.desc + "</p>" +
      '<span class="game-foot">' + (live ? "Play now" : "In development") + "</span>";
    grid.appendChild(el);
  });
})();
