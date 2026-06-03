# NFL Higher / Lower

An endless NFL "higher or lower" streak game built on real player-season stats.
Pick a stat (passing yards, receptions, fantasy points, …), then guess whether each
new player-season is higher or lower than the current one. Right = streak continues
and the challenger becomes the new anchor. Wrong = game over.

The game ships as static files (HTML/CSS/JS + a bundled `players.json`) — no backend
required to play. Firebase Hosting + an optional Firestore leaderboard can come later.

## Data

Stats come from **[nflverse](https://github.com/nflverse/nflverse-data)** — the
`stats_player` release, `stats_player_reg_{year}.csv` files (regular-season totals,
one row per player-season), covering 1999–2025.

`data/build_players.py` downloads those CSVs (caching them under `data/raw/`),
keeps only player-seasons that are "meaningful" in at least one stat category
(per-category minimums you can tune at the top of the script), and writes a compact
`public/data/players.json` that the app ships with. It uses only the Python standard
library — no `pip install` needed.

### Rebuild the dataset

```powershell
cd C:\Users\panky\nfl-higher-lower\data
python build_players.py            # full 1999–2025
python build_players.py 2010 2025  # custom season range (inclusive)
```

Tune the stat categories and their "meaningful" thresholds in the `CATEGORIES`
list near the top of `build_players.py`.

## Play locally

`fetch()` can't read `players.json` from a `file://` URL, so serve `public/` over HTTP:

```powershell
cd C:\Users\panky\nfl-higher-lower\public
python -m http.server 8000
```

Then open <http://localhost:8000> and play. Use the **▲/▼ buttons** or the
**Up/Down arrow keys**. Best streak per stat is saved in your browser (localStorage).

## Project layout

```
nfl-higher-lower/
├── data/
│   ├── build_players.py   # nflverse CSV -> players.json
│   └── raw/               # cached downloads (gitignored)
└── public/                # static site root (-> Firebase Hosting later)
    ├── index.html
    ├── css/styles.css
    ├── js/game.js
    └── data/players.json  # bundled dataset
```
