"""
build_players.py — Pull NFL season stats from nflverse and bundle into players.json.

Data source: nflverse-data "stats_player" release, files `stats_player_reg_{year}.csv`
(regular-season totals, one row per player-season), 1999-present.
    https://github.com/nflverse/nflverse-data/releases/tag/stats_player

No third-party dependencies — uses only the Python standard library.

Usage:
    python build_players.py                # default season range
    python build_players.py 2015 2025      # custom start/end (inclusive)
"""

import csv
import io
import json
import os
import sys
import urllib.request
from datetime import date

# --- config ------------------------------------------------------------------

FIRST_SEASON = 1999          # earliest season nflverse publishes for this release
LAST_SEASON = 2025           # most recent completed season

BASE_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_player/stats_player_reg_{year}.csv"
)

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")
OUT_PATH = os.path.normpath(os.path.join(HERE, "..", "public", "data", "players.json"))

# Stat categories the game offers. Each: (csv_column, label, min_threshold,
# decimals, icon). A player-season is only kept for a category when its value
# meets the threshold ("meaningful"), which also keeps players.json small.
CATEGORIES = [
    ("passing_yards",      "Passing Yards",        1500, 0, "\U0001F3AF"),
    ("passing_tds",        "Passing TDs",            10, 0, "\U0001F680"),
    ("rushing_yards",      "Rushing Yards",         300, 0, "\U0001F3C3"),
    ("rushing_tds",        "Rushing TDs",             3, 0, "\U0001F4A8"),
    ("receiving_yards",    "Receiving Yards",       300, 0, "\U0001F64C"),
    ("receptions",         "Receptions",             25, 0, "\U0001F9E4"),
    ("receiving_tds",      "Receiving TDs",           3, 0, "\U0001F525"),
    ("fantasy_points",     "Fantasy Points (Std)",   75, 1, "\U0001F3C8"),
    ("fantasy_points_ppr", "Fantasy Points (PPR)",   75, 1, "⭐"),
]

# -----------------------------------------------------------------------------


def fetch_season_csv(year):
    """Return the CSV text for a season, caching the raw download under raw/."""
    os.makedirs(RAW_DIR, exist_ok=True)
    cache = os.path.join(RAW_DIR, f"stats_player_reg_{year}.csv")
    if os.path.exists(cache) and os.path.getsize(cache) > 0:
        with open(cache, "r", encoding="utf-8") as f:
            return f.read()

    url = BASE_URL.format(year=year)
    req = urllib.request.Request(url, headers={"User-Agent": "nfl-higher-lower/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8")
    with open(cache, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def to_num(raw):
    """Parse a CSV cell into a float, or None if blank/non-numeric."""
    if raw is None:
        return None
    raw = raw.strip()
    if raw == "" or raw.upper() == "NA":
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def round_stat(value, decimals):
    """Store whole numbers as int, otherwise round to the category's precision."""
    if decimals == 0:
        return int(round(value))
    rounded = round(value, decimals)
    return int(rounded) if rounded.is_integer() else rounded


def build():
    start = FIRST_SEASON
    end = LAST_SEASON
    if len(sys.argv) == 3:
        start, end = int(sys.argv[1]), int(sys.argv[2])

    players = []
    seen = set()                 # (player_id, season) guard against dupes
    cat_counts = {key: 0 for key, *_ in CATEGORIES}

    for year in range(start, end + 1):
        try:
            text = fetch_season_csv(year)
        except Exception as exc:  # noqa: BLE001 — surface and continue
            print(f"  ! {year}: download failed ({exc}) — skipping")
            continue

        reader = csv.DictReader(io.StringIO(text))
        kept = 0
        for row in reader:
            key = (row.get("player_id"), row.get("season"))
            if key in seen:
                continue

            stats = {}
            for col, _label, threshold, decimals, _icon in CATEGORIES:
                value = to_num(row.get(col))
                if value is not None and value >= threshold:
                    stats[col] = round_stat(value, decimals)
                    cat_counts[col] += 1

            if not stats:            # not meaningful in any category -> drop
                continue

            seen.add(key)
            record = {
                "name": row.get("player_display_name") or row.get("player_name"),
                "pos": row.get("position") or "",
                "season": int(row["season"]),
                "team": row.get("recent_team") or "",
                "games": int(to_num(row.get("games")) or 0),
                "stats": stats,
            }
            headshot = (row.get("headshot_url") or "").strip()
            if headshot:
                record["headshot"] = headshot
            players.append(record)
            kept += 1

        print(f"  {year}: kept {kept} player-seasons")

    players.sort(key=lambda r: (r["season"], -max(r["stats"].values())))

    out = {
        "generated": date.today().isoformat(),
        "source": "nflverse-data / stats_player_reg",
        "seasons": [start, end],
        "categories": [
            {"key": k, "label": lbl, "min": mn, "decimals": dec, "icon": icon}
            for k, lbl, mn, dec, icon in CATEGORIES
        ],
        "players": players,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(OUT_PATH) / 1e6
    print()
    print(f"Wrote {len(players):,} player-seasons -> {OUT_PATH} ({size_mb:.1f} MB)")
    print("Pool size per category:")
    for key, label, *_ in CATEGORIES:
        print(f"  {label:<24} {cat_counts[key]:>6,}")


if __name__ == "__main__":
    build()
