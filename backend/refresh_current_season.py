"""
Pull a season's real NBA rosters from stats.nba.com (via the free, unofficial
nba_api package - no key required) and merge them into players_awards.json, so
the game's player pool and similarity data extend to the latest completed
season without a manual re-scrape. Meant to run periodically - see
.github/workflows/refresh-data.yml.

Run: python backend/refresh_current_season.py --season-label 2025-26 --season-year 2026

Limitations (accepted trade-offs for a lightweight periodic job, not silently
papered over):
  - No accolades (All-Star/All-NBA/awards) are pulled here. Those aren't settled
    through this endpoint and, for an in-progress season, don't exist yet - same
    as in real life. Add them by hand once announced, the same way the rest of
    this dataset was built season by season.
  - No position data. The per-season league stats endpoint used here doesn't
    carry position cheaply across hundreds of players in one call, and a
    per-player lookup for all of them isn't worth it for a periodic refresh.
    New players get position "" - every existing position-aware code path
    already treats a blank position as "unknown" and scores it as 0, not wrong.
  - A traded player is recorded on only their most recent team for that season.
    The historical dataset keeps a row per stint; reconstructing that here would
    need a per-player call for everyone who got traded, each run.
"""
import argparse
import json
import sys
from pathlib import Path

from nba_api.stats.endpoints import leaguedashplayerstats

BACKEND_DIR = Path(__file__).resolve().parent
PLAYERS_FILE = BACKEND_DIR / "players_awards.json"


def fetch_season_rosters(season_label):
    r = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season_label, per_mode_detailed="PerGame", timeout=30
    )
    df = r.get_data_frames()[0]
    return [
        {"name": row.PLAYER_NAME, "team": row.TEAM_ABBREVIATION}
        for row in df.itertuples()
    ]


def merge_season(db, season_year, rosters):
    """season_year follows the dataset's own convention: the 2025-26 season is
    stored as 2026 throughout players_awards.json (see any existing player's
    "seasons" list), not 2025."""
    by_team = {}
    for entry in rosters:
        by_team.setdefault(entry["team"], []).append(entry["name"])

    added_players = 0
    updated_players = 0

    for team, names in by_team.items():
        for name in names:
            player = db.get(name)
            if player is None:
                db[name] = {
                    "teams": [team],
                    "seasons": [{"team": team, "season": season_year}],
                    "teammates": [],
                    "position": "",
                    "start_year": season_year,
                    "career_length": 1,
                    "all_star_seasons": [],
                    "all_team_selections": [],
                    "awards_won": [],
                }
                added_players += 1
                player = db[name]
            else:
                already_has_season = any(
                    s.get("season") == season_year for s in player.get("seasons", [])
                )
                if not already_has_season:
                    player.setdefault("seasons", []).append({"team": team, "season": season_year})
                    updated_players += 1
                if team not in player.get("teams", []):
                    player.setdefault("teams", []).append(team)

            teammates = set(player.get("teammates", []))
            teammates.update(n for n in names if n != name)
            player["teammates"] = sorted(teammates)

    return added_players, updated_players


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--season-label", default="2025-26", help="nba_api season string, e.g. 2025-26")
    parser.add_argument("--season-year", type=int, default=2026, help="this dataset's season number for that season")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with open(PLAYERS_FILE, encoding="utf-8") as f:
        db = json.load(f)

    print(f"Fetching {args.season_label} rosters from stats.nba.com...", file=sys.stderr)
    rosters = fetch_season_rosters(args.season_label)
    print(f"Got {len(rosters)} player rows.", file=sys.stderr)

    if not rosters:
        print("No rows returned (season likely hasn't started yet). Nothing to merge.")
        sys.exit(0)

    added, updated = merge_season(db, args.season_year, rosters)
    print(f"New players added: {added}")
    print(f"Existing players updated with season {args.season_year}: {updated}")

    if args.dry_run:
        print("Dry run - not writing file.")
    else:
        with open(PLAYERS_FILE, "w", encoding="utf-8") as f:
            json.dump(db, f, indent=2, ensure_ascii=False)
        print(f"Wrote {PLAYERS_FILE}")
