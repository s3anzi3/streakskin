"""
build_players.py — Pull NFL season stats from nflverse and bundle into players.json.

Data source: nflverse-data "stats_player" release, files `stats_player_reg_{year}.csv`
(regular-season totals, one row per player-season), 1999-present.
    https://github.com/nflverse/nflverse-data/releases/tag/stats_player

No third-party dependencies — uses only the Python standard library.

Inclusivity model (EBK):
    Include EVERY skill-position player-season (QB/RB/FB/WR/TE), starters and
    backups, good or bad. A player-season qualifies for a stat category only when
    that stat actually *applied* to them that year (they threw / ran / were
    targeted / played) — no quality threshold. This keeps pools deep and full of
    role players and "bums" without surfacing irrelevant zeros (e.g. a QB with no
    targets never lands in the receptions pool).

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

FIRST_SEASON = 1999
LAST_SEASON = 2025

BASE_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/"
    "stats_player/stats_player_reg_{year}.csv"
)
PLAYERS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
)

HERE = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, "raw")
OUT_PATH = os.path.normpath(os.path.join(HERE, "..", "public", "data", "players.json"))

# Offensive skill positions only.
SKILL_POS = {"QB", "RB", "FB", "HB", "WR", "TE"}

# Stat categories. Each: (csv_column, label, decimals, icon, opportunity_col, positions)
#   opportunity_col: a player-season qualifies for this category only if this
#                    column is > 0 (None => qualifies whenever they played).
#   positions:       restrict the category to these positions (None => any skill pos).
CATEGORIES = [
    ("passing_yards",      "Passing Yards",        0, "\U0001F3AF", "attempts", {"QB"}),
    ("passing_tds",        "Passing TDs",          0, "\U0001F680", "attempts", {"QB"}),
    ("rushing_yards",      "Rushing Yards",        0, "\U0001F3C3", "carries",  None),
    ("rushing_tds",        "Rushing TDs",          0, "\U0001F4A8", "carries",  None),
    ("receiving_yards",    "Receiving Yards",      0, "\U0001F64C", "targets",  None),
    ("receptions",         "Receptions",           0, "\U0001F9E4", "targets",  None),
    ("receiving_tds",      "Receiving TDs",        0, "\U0001F525", "targets",  None),
    ("fantasy_points",     "Fantasy Points (Std)", 1, "\U0001F3C8", None,       None),
    ("fantasy_points_ppr", "Fantasy Points (PPR)", 1, "⭐",     None,       None),
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
    req = urllib.request.Request(url, headers={"User-Agent": "ebk/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8")
    with open(cache, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def fetch_players_csv():
    """Return the players.csv text (player bios: college, draft, etc.), cached."""
    os.makedirs(RAW_DIR, exist_ok=True)
    cache = os.path.join(RAW_DIR, "players.csv")
    if os.path.exists(cache) and os.path.getsize(cache) > 0:
        with open(cache, "r", encoding="utf-8") as f:
            return f.read()
    req = urllib.request.Request(PLAYERS_URL, headers={"User-Agent": "ebk/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode("utf-8")
    with open(cache, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def to_int(raw):
    n = to_num(raw)
    return int(n) if n is not None else None


def build_people(used_ids):
    """Map player_id -> bio dict (college + draft) for the ids we actually use."""
    try:
        text = fetch_players_csv()
    except Exception as exc:  # noqa: BLE001
        print(f"  ! players.csv download failed ({exc}) — people map will be empty")
        return {}
    people = {}
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        pid = row.get("gsis_id")
        if pid not in used_ids:
            continue
        college = (row.get("college_name") or "").strip()
        people[pid] = {
            "college": college,
            "draftYear": to_int(row.get("draft_year")),
            "draftRound": to_int(row.get("draft_round")),
            "draftPick": to_int(row.get("draft_pick")),
            "draftTeam": (row.get("draft_team") or "").strip(),
        }
    return people


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
            pos = (row.get("position") or "").upper()
            if pos not in SKILL_POS:
                continue

            key = (row.get("player_id"), row.get("season"))
            if key in seen:
                continue

            games = to_num(row.get("games")) or 0

            stats = {}
            for col, _label, decimals, _icon, opp_col, positions in CATEGORIES:
                if positions and pos not in positions:
                    continue
                if opp_col is not None:
                    if (to_num(row.get(opp_col)) or 0) <= 0:
                        continue
                elif games <= 0:          # fantasy categories: must have played
                    continue
                value = to_num(row.get(col))
                if value is None:
                    continue
                stats[col] = round_stat(value, decimals)
                cat_counts[col] += 1

            if not stats:
                continue

            seen.add(key)
            record = {
                "id": row.get("player_id") or "",
                "name": row.get("player_display_name") or row.get("player_name"),
                "pos": pos,
                "season": int(row["season"]),
                "team": row.get("recent_team") or "",
                "games": int(games),
                "stats": stats,
            }
            headshot = (row.get("headshot_url") or "").strip()
            if headshot:
                record["headshot"] = headshot
            players.append(record)
            kept += 1

        print(f"  {year}: kept {kept} player-seasons")

    players.sort(key=lambda r: (r["season"], r["name"]))

    used_ids = {r["id"] for r in players if r["id"]}
    people = build_people(used_ids)
    print(f"  people (bio: college/draft) matched: {len(people):,}/{len(used_ids):,}")

    out = {
        "generated": date.today().isoformat(),
        "source": "nflverse-data / stats_player_reg + players",
        "seasons": [start, end],
        "categories": [
            {"key": k, "label": lbl, "decimals": dec, "icon": icon}
            for k, lbl, dec, icon, _opp, _pos in CATEGORIES
        ],
        "players": players,
        "people": people,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = os.path.getsize(OUT_PATH) / 1e6
    print()
    print(f"Wrote {len(players):,} player-seasons -> {OUT_PATH} ({size_mb:.1f} MB)")
    print("Pool size per category:")
    for key, label, *_ in CATEGORIES:
        print(f"  {label:<24} {cat_counts[key]:>7,}")


if __name__ == "__main__":
    build()
