/* NHL franchise helper + ESPN logos (canonicalizes PHX->ARI, ATL->WPG). */
window.NHL = (function () {
  "use strict";
  const F = [
    ["ANA", "Ducks", "ana", ["ANA"]], ["ARI", "Coyotes", "ari", ["ARI", "PHX"]],
    ["BOS", "Bruins", "bos", ["BOS"]], ["BUF", "Sabres", "buf", ["BUF"]],
    ["CGY", "Flames", "cgy", ["CGY"]], ["CAR", "Hurricanes", "car", ["CAR"]],
    ["CHI", "Blackhawks", "chi", ["CHI"]], ["COL", "Avalanche", "col", ["COL"]],
    ["CBJ", "Blue Jackets", "cbj", ["CBJ"]], ["DAL", "Stars", "dal", ["DAL"]],
    ["DET", "Red Wings", "det", ["DET"]], ["EDM", "Oilers", "edm", ["EDM"]],
    ["FLA", "Panthers", "fla", ["FLA"]], ["LAK", "Kings", "la", ["LAK"]],
    ["MIN", "Wild", "min", ["MIN"]], ["MTL", "Canadiens", "mtl", ["MTL"]],
    ["NSH", "Predators", "nsh", ["NSH"]], ["NJD", "Devils", "nj", ["NJD"]],
    ["NYI", "Islanders", "nyi", ["NYI"]], ["NYR", "Rangers", "nyr", ["NYR"]],
    ["OTT", "Senators", "ott", ["OTT"]], ["PHI", "Flyers", "phi", ["PHI"]],
    ["PIT", "Penguins", "pit", ["PIT"]], ["SJS", "Sharks", "sj", ["SJS"]],
    ["SEA", "Kraken", "sea", ["SEA"]], ["STL", "Blues", "stl", ["STL"]],
    ["TBL", "Lightning", "tb", ["TBL"]], ["TOR", "Maple Leafs", "tor", ["TOR"]],
    ["VAN", "Canucks", "van", ["VAN"]], ["VGK", "Golden Knights", "vgk", ["VGK"]],
    ["WSH", "Capitals", "wsh", ["WSH"]], ["WPG", "Jets", "wpg", ["WPG", "ATL"]],
  ];
  const nameByKey = {}, espnByKey = {}, toKey = {}, franchises = [];
  F.forEach(([key, name, espn, abbrs]) => {
    nameByKey[key] = name; espnByKey[key] = espn;
    abbrs.forEach((a) => (toKey[a] = key));
    franchises.push({ key, name, abbrs });
  });
  const keyOf = (a) => toKey[a] || a;
  return {
    franchises, keyOf,
    name: (a) => nameByKey[keyOf(a)] || a,
    logo: (a) => "https://a.espncdn.com/i/teamlogos/nhl/500/" + (espnByKey[keyOf(a)] || String(keyOf(a)).toLowerCase()) + ".png",
  };
})();
