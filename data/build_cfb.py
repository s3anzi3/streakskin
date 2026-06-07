"""
build_cfb.py — College Football player-season dataset for EBK.
Source: CollegeFootballData API (free key, read from raw/cfbd.key; build-time only).
Writes public/data/cfb/players.json AND a generated public/js/cfb-teams.js (131 FBS schools).

Usage: python build_cfb.py [start end]
"""
import os, sys, json, time, urllib.request
from collections import defaultdict
from datetime import date

FIRST, LAST = 2014, 2024
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw", "cfb")
OUT = os.path.normpath(os.path.join(HERE, "..", "public", "data", "cfb", "players.json"))
TEAMS_JS = os.path.normpath(os.path.join(HERE, "..", "public", "js", "cfb-teams.js"))
KEYFILE = os.path.join(HERE, "raw", "cfbd.key")
API = "https://api.collegefootballdata.com"

# statType -> our stat key, per category
MAP = {
    "passing":   {"YDS": "pyd", "TD": "ptd", "INT": "pint"},
    "rushing":   {"YDS": "ryd", "TD": "rtd", "CAR": "car"},
    "receiving": {"YDS": "recyd", "TD": "rectd", "REC": "rec"},
    "defensive": {"TOT": "tkl", "SACKS": "sk", "TFL": "tfl"},
}
CATEGORIES = [
    ("pyd", "Passing Yards", 0, "\U0001F3AF"), ("ptd", "Passing TDs", 0, "\U0001F680"),
    ("ryd", "Rushing Yards", 0, "\U0001F3C3"), ("rtd", "Rushing TDs", 0, "\U0001F4A8"),
    ("recyd", "Receiving Yards", 0, "\U0001F64C"), ("rec", "Receptions", 0, "\U0001F9E4"),
    ("rectd", "Receiving TDs", 0, "\U0001F525"), ("tkl", "Tackles", 0, "\U0001F6D1"),
    ("sk", "Sacks", 1, "\U0001F4A5"),
]
INT_KEYS = {"pyd", "ptd", "pint", "ryd", "rtd", "car", "recyd", "rectd", "rec", "tkl", "tfl"}


def grp_of(pos):
    p = (pos or "").upper()
    if p == "QB": return "QB"
    if p in ("RB", "FB", "HB", "TB"): return "RB"
    if p == "WR": return "WR"
    if p == "TE": return "TE"
    if p in ("DL", "DE", "DT", "NT", "EDGE"): return "DL"
    if p in ("LB", "OLB", "ILB", "MLB"): return "LB"
    if p in ("CB", "S", "SS", "FS", "DB", "SAF"): return "DB"
    return "ATH"


def api_get(path, key):
    req = urllib.request.Request(API + path, headers={
        "Authorization": "Bearer " + key, "User-Agent": "ebk/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


def cached(name, fn):
    os.makedirs(RAW, exist_ok=True)
    p = os.path.join(RAW, name)
    if os.path.exists(p) and os.path.getsize(p) > 0:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    data = fn()
    with open(p, "w", encoding="utf-8") as f:
        json.dump(data, f)
    return data


def build():
    start, end = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv) == 3 else (FIRST, LAST)
    key = open(KEYFILE, encoding="utf-8").read().strip()

    # FBS schools + logos (union across years)
    schools = {}
    for y in range(start, end + 1):
        for t in cached(f"teams_{y}.json", lambda y=y: api_get(f"/teams/fbs?year={y}", key)):
            logos = t.get("logos") or []
            logo = (logos[0] if logos else "").replace("http://", "https://")
            schools[t["school"]] = {"name": t["school"], "logo": logo, "conf": t.get("conference")}

    # pivot stats
    rec = defaultdict(lambda: {"stats": {}})
    for y in range(start, end + 1):
        for cat in MAP:
            rows = cached(f"{cat}_{y}.json",
                          lambda y=y, cat=cat: api_get(f"/stats/player/season?year={y}&category={cat}", key))
            for r in rows:
                school = r["team"]
                if school not in schools:
                    continue
                stmap = MAP[cat]
                if r["statType"] not in stmap:
                    continue
                k = (r["playerId"], y)
                e = rec[k]
                e["name"] = r["player"]; e["pos"] = r["position"] or "ATH"
                e["team"] = school; e["conf"] = schools[school]["conf"]; e["season"] = y
                e["pid"] = r["playerId"]
                val = float(r["stat"] or 0)
                key2 = stmap[r["statType"]]
                e["stats"][key2] = int(round(val)) if key2 in INT_KEYS else round(val, 1)
        print(f"  {y}: cumulative players {len(rec)}")

    players = []
    cat_counts = defaultdict(int)
    for (pid, y), e in rec.items():
        if not e["stats"]:
            continue
        for k in e["stats"]:
            cat_counts[k] += 1
        players.append({
            "id": str(pid), "name": e["name"], "pos": e["pos"], "grp": grp_of(e["pos"]),
            "season": y, "team": e["team"], "conf": e.get("conf"), "games": 0,
            "headshot": f"https://a.espncdn.com/i/headshots/college-football/players/full/{pid}.png",
            "stats": e["stats"],
        })

    players.sort(key=lambda r: (r["season"], r["name"] or ""))
    out = {
        "generated": date.today().isoformat(), "source": "CollegeFootballData API",
        "sport": "cfb", "seasons": [start, end],
        "categories": [{"key": k, "label": l, "decimals": d, "icon": i} for k, l, d, i in CATEGORIES],
        "players": players, "people": {},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    # generate cfb-teams.js
    F = sorted(schools.values(), key=lambda s: s["name"])
    arr = ",\n".join('    {key:%s,name:%s,logo:%s}' % (json.dumps(s["name"]), json.dumps(s["name"]), json.dumps(s["logo"])) for s in F)
    js = ("/* generated by build_cfb.py — CFB schools + ESPN logos */\n"
          "window.CFB=(function(){\n  var F=[\n" + arr + "\n  ];\n"
          "  var byKey={};F.forEach(function(f){byKey[f.key]=f;});\n"
          "  return {franchises:F, keyOf:function(a){return a;},\n"
          "    name:function(a){return byKey[a]?byKey[a].name:a;},\n"
          "    logo:function(a){return byKey[a]?byKey[a].logo:'';}};\n})();\n")
    with open(TEAMS_JS, "w", encoding="utf-8") as f:
        f.write(js)

    print(f"\nWrote {len(players):,} player-seasons -> {OUT} ({os.path.getsize(OUT)/1e6:.1f} MB)")
    print(f"Generated {TEAMS_JS} ({len(F)} schools)")
    for k, l, *_ in CATEGORIES:
        print(f"  {l:<16} {cat_counts[k]:>7,}")


if __name__ == "__main__":
    build()
