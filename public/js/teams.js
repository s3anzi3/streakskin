/* Shared NFL franchise helper. Canonicalizes historical abbreviations
   (OAK->Raiders, SD->Chargers, STL/LA->Rams, JAC->Jaguars) and gives names. */
window.NFL = (function () {
  "use strict";
  const FRANCHISES = [
    { key: "ARI", name: "Cardinals",  abbrs: ["ARI"] },
    { key: "ATL", name: "Falcons",    abbrs: ["ATL"] },
    { key: "BAL", name: "Ravens",     abbrs: ["BAL"] },
    { key: "BUF", name: "Bills",      abbrs: ["BUF"] },
    { key: "CAR", name: "Panthers",   abbrs: ["CAR"] },
    { key: "CHI", name: "Bears",      abbrs: ["CHI"] },
    { key: "CIN", name: "Bengals",    abbrs: ["CIN"] },
    { key: "CLE", name: "Browns",     abbrs: ["CLE"] },
    { key: "DAL", name: "Cowboys",    abbrs: ["DAL"] },
    { key: "DEN", name: "Broncos",    abbrs: ["DEN"] },
    { key: "DET", name: "Lions",      abbrs: ["DET"] },
    { key: "GB",  name: "Packers",    abbrs: ["GB"] },
    { key: "HOU", name: "Texans",     abbrs: ["HOU"] },
    { key: "IND", name: "Colts",      abbrs: ["IND"] },
    { key: "JAX", name: "Jaguars",    abbrs: ["JAX", "JAC"] },
    { key: "KC",  name: "Chiefs",     abbrs: ["KC"] },
    { key: "LV",  name: "Raiders",    abbrs: ["LV", "OAK"] },
    { key: "LAC", name: "Chargers",   abbrs: ["LAC", "SD"] },
    { key: "LAR", name: "Rams",       abbrs: ["LAR", "LA", "STL"] },
    { key: "MIA", name: "Dolphins",   abbrs: ["MIA"] },
    { key: "MIN", name: "Vikings",    abbrs: ["MIN"] },
    { key: "NE",  name: "Patriots",   abbrs: ["NE"] },
    { key: "NO",  name: "Saints",     abbrs: ["NO"] },
    { key: "NYG", name: "Giants",     abbrs: ["NYG"] },
    { key: "NYJ", name: "Jets",       abbrs: ["NYJ"] },
    { key: "PHI", name: "Eagles",     abbrs: ["PHI"] },
    { key: "PIT", name: "Steelers",   abbrs: ["PIT"] },
    { key: "SF",  name: "49ers",      abbrs: ["SF"] },
    { key: "SEA", name: "Seahawks",   abbrs: ["SEA"] },
    { key: "TB",  name: "Buccaneers", abbrs: ["TB"] },
    { key: "TEN", name: "Titans",     abbrs: ["TEN"] },
    { key: "WAS", name: "Commanders", abbrs: ["WAS", "WSH"] },
  ];
  const toKey = {}, nameByKey = {};
  FRANCHISES.forEach((f) => {
    nameByKey[f.key] = f.name;
    f.abbrs.forEach((a) => (toKey[a] = f.key));
  });
  return {
    franchises: FRANCHISES,
    keyOf: (abbr) => toKey[abbr] || abbr,
    name: (abbr) => nameByKey[toKey[abbr] || abbr] || abbr,
  };
})();
