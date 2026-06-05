/* EBK catalog — single source of truth for sports + games. */
window.EBK = {
  sports: [
    { key: "nfl",    name: "NFL",        emoji: "\u{1F3C8}", accent: "#3ddc97", status: "live", blurb: "Pro football, 1999–present." },
    { key: "cfb",    name: "College FB", emoji: "\u{1F3DF}️", accent: "#f4a300", status: "soon", blurb: "Saturdays in the fall." },
    { key: "nba",    name: "NBA",        emoji: "\u{1F3C0}", accent: "#ff7a3c", status: "soon", blurb: "Pro basketball." },
    { key: "mlb",    name: "MLB",        emoji: "⚾",    accent: "#4aa3ff", status: "soon", blurb: "America's pastime." },
    { key: "nhl",    name: "NHL",        emoji: "\u{1F3D2}", accent: "#5fd0e6", status: "soon", blurb: "Pro hockey." },
    { key: "soccer", name: "Soccer",     emoji: "⚽",    accent: "#8ee04a", status: "soon", blurb: "The world's game." },
  ],

  // shared game types offered for every sport
  games: [
    { slug: "higher-lower", title: "Higher / Lower", emoji: "\u{1F4C8}",
      desc: "Two player-seasons, one stat — call higher or lower and run the streak." },
    { slug: "stat-line", title: "Guess the Stat Line", emoji: "\u{1F9FE}",
      desc: "Name the player from a mystery season's numbers." },
    { slug: "career-path", title: "Career Path", emoji: "\u{1F5FA}️",
      desc: "Trace draft, college and team clues to the player." },
    { slug: "player-grid", title: "Player Grid", emoji: "\u{1F532}",
      desc: "Name a player for every team-and-stat square." },
    { slug: "team", title: "Team Study", emoji: "\u{1F4CA}",
      desc: "Browse, filter and sort every player-season for a team." },
  ],

  // which game slugs are live per sport key
  live: {
    nfl: ["higher-lower", "stat-line", "career-path", "player-grid", "team"],
  },

  sport: function (key) { return this.sports.find(function (s) { return s.key === key; }); },
  isLive: function (sportKey, slug) { return (this.live[sportKey] || []).indexOf(slug) !== -1; },
  // a sport is playable if it has any live game
  sportLive: function (key) { return (this.live[key] || []).length > 0; },
  href: function (sportKey, slug) {
    return slug === "team" ? "/" + sportKey + "/teams" : "/" + sportKey + "/" + slug;
  },
};
