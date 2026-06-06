"""
build_nhl.py — NHL player-season dataset for EBK (stdlib only).
Source: official NHL stats REST API (season-aggregated skater + goalie summary).
Usage: python build_nhl.py [startEndYear endEndYear]   e.g. 2001 2024
"""
import os, sys, json, urllib.request
from datetime import date

FIRST, LAST = 2001, 2024        # end-years (2000-01 .. 2023-24)
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "nhl")
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data", "nhl", "players.json"))
API = ("https://api.nhle.com/stats/rest/en/{kind}/summary?isAggregate=false&isGame=false"
       "&start=0&limit=-1&cayenneExp=seasonId={sid}%20and%20gameTypeId=2")

CATEGORIES = [
    ("g",  "Goals",         0, "\U0001F3D2"), ("a", "Assists", 0, "\U0001F91D"),
    ("pts", "Points",       0, "\U0001F3AF"), ("ppg", "Points / Game", 1, "\U0001F4C8"),
    ("plus", "Plus / Minus", 0, "➕"), ("shots", "Shots", 0, "\U0001F3AF"),
    ("ppg_g", "Power-Play Goals", 0, "⚡"),
    ("w", "Wins",           0, "\U0001F947"), ("sv", "Saves", 0, "\U0001F9E4"),
    ("svpct", "Save %",     3, "\U0001F6E1️"), ("gaa", "GAA", 2, "\U0001F9CA"),
    ("so", "Shutouts",      0, "\U0001F512"),
]


def fetch(kind, sid):
    os.makedirs(RAW, exist_ok=True)
    cache = os.path.join(RAW, f"{kind}_{sid}.json")
    if not (os.path.exists(cache) and os.path.getsize(cache) > 0):
        req = urllib.request.Request(API.format(kind=kind, sid=sid), headers={"User-Agent": "ebk/1.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(cache, "wb") as f:
            f.write(r.read())
    with open(cache, encoding="utf-8") as f:
        return json.load(f).get("data", [])


def lastteam(s):
    return (s or "").split(",")[-1].strip()


def build():
    start, end = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) == 3 else (FIRST, LAST)
    players = []
    for y in range(start, end + 1):
        sid = f"{y-1}{y}"
        label = f"{y-1}-{str(y)[2:]}"
        sk = fetch("skater", sid)
        go = fetch("goalie", sid)
        if not sk and not go:
            print(f"  {label}: (no data — skipped)"); continue
        for r in sk:
            team = lastteam(r.get("teamAbbrevs"))
            pos = r.get("positionCode") or "F"
            gp = r.get("gamesPlayed") or 0
            players.append({
                "id": "s" + str(r["playerId"]), "name": r.get("skaterFullName"),
                "pos": pos, "grp": "D" if pos == "D" else "F",
                "season": y, "seasonLabel": label, "team": team, "games": gp,
                "headshot": f"https://assets.nhle.com/mugs/nhl/{sid}/{team}/{r['playerId']}.png",
                "stats": {
                    "g": r.get("goals") or 0, "a": r.get("assists") or 0, "pts": r.get("points") or 0,
                    "plus": r.get("plusMinus") or 0, "shots": r.get("shots") or 0,
                    "ppg_g": r.get("ppGoals") or 0,
                    "ppg": round(r.get("pointsPerGame") or 0, 2),
                },
            })
        for r in go:
            team = lastteam(r.get("teamAbbrevs"))
            gp = r.get("gamesPlayed") or 0
            st = {"w": r.get("wins") or 0, "sv": r.get("saves") or 0, "so": r.get("shutouts") or 0}
            if r.get("savePct") is not None: st["svpct"] = round(r["savePct"], 3)
            if r.get("goalsAgainstAverage") is not None: st["gaa"] = round(r["goalsAgainstAverage"], 2)
            players.append({
                "id": "g" + str(r["playerId"]), "name": r.get("goalieFullName"),
                "pos": "G", "grp": "G", "season": y, "seasonLabel": label,
                "team": team, "games": gp,
                "headshot": f"https://assets.nhle.com/mugs/nhl/{sid}/{team}/{r['playerId']}.png",
                "stats": st,
            })
        print(f"  {label}: {len(sk)} skaters + {len(go)} goalies")

    players.sort(key=lambda r: (r["season"], r["name"] or ""))
    out = {
        "generated": date.today().isoformat(), "source": "NHL stats API",
        "sport": "nhl", "seasons": [start, end],
        "categories": [{"key": k, "label": l, "decimals": d, "icon": i} for k, l, d, i in CATEGORIES],
        "players": players, "people": {},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nWrote {len(players):,} player-seasons -> {OUT} ({os.path.getsize(OUT)/1e6:.1f} MB)")


if __name__ == "__main__":
    build()
