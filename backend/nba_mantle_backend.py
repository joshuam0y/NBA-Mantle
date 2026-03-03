from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
from difflib import get_close_matches
import json
import os

app = Flask(__name__, static_folder='build', static_url_path='')
CORS(app)  # Enable CORS for all routes

# Load players database
def load_players_db():
    try:
        with open('players_awards.json', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print("Warning: players_awards.json not found. Using empty database.")
        return {}

players_db = load_players_db()
guess_counter = {}

MULTI_TEAM_MARKERS = {"2TM", "3TM", "4TM", "5TM", "6TM", "TOT"}


def _filtered_seasons(player):
    """Return seasons excluding aggregate multi-team rows like '2TM', '3TM'."""
    seasons = player.get("seasons", [])
    return [
        s for s in seasons
        if s.get("team") not in MULTI_TEAM_MARKERS and "season" in s
    ]


def _filtered_teams(player):
    """Return team list without aggregate entries like 'TOT', '2TM', etc."""
    return [
        t for t in player.get("teams", [])
        if t not in MULTI_TEAM_MARKERS
    ]


def compute_similarity(player1, player2, name1=None, name2=None):
    """
    Core similarity scoring between two players.

    High-level ideas:
    - Big points: actually played together (shared seasons), repeated teammates, same franchises.
    - Medium points: same position, similar era, similar career length.
    - Extra flavor: overlapping All-Star / All-NBA / other awards.
    - No streak bonus.
    """
    score = 0
    breakdown = {}

    # 1. Shared seasons on the same team (main signal)
    p1_seasons = set((s["team"], s["season"]) for s in _filtered_seasons(player1))
    p2_seasons = set((s["team"], s["season"]) for s in _filtered_seasons(player2))
    shared_seasons = p1_seasons & p2_seasons
    shared_season_count = len(shared_seasons)

    if shared_season_count >= 6:
        pts = 60
    elif shared_season_count >= 4:
        pts = 50
    elif shared_season_count >= 2:
        pts = 40
    elif shared_season_count == 1:
        pts = 30
    else:
        pts = 0

    score += pts
    breakdown["shared_seasons"] = pts

    # 2. Shared teammates (indirect connection signal)
    teammates1 = set(player1.get("teammates", []))
    teammates2 = set(player2.get("teammates", []))
    shared_teammates = teammates1 & teammates2
    shared_teammates_count = len(shared_teammates)

    if shared_teammates_count >= 12:
        tm_pts = 8
    elif shared_teammates_count >= 6:
        tm_pts = 5
    elif shared_teammates_count >= 3:
        tm_pts = 3
    elif shared_teammates_count >= 1:
        tm_pts = 1
    else:
        tm_pts = 0

    score += tm_pts
    breakdown["shared_teammates"] = tm_pts

    # 3. Shared franchises (even if not same seasons)
    overlap_teams = set(_filtered_teams(player1)) & set(_filtered_teams(player2))
    if len(overlap_teams) >= 3:
        team_pts = 10
    elif len(overlap_teams) == 2:
        team_pts = 8
    elif len(overlap_teams) == 1:
        team_pts = 5
    else:
        team_pts = 0
    score += team_pts
    breakdown["shared_teams"] = team_pts

    # 4. Position similarity
    p1_pos = (player1.get("position") or "").strip()
    p2_pos = (player2.get("position") or "").strip()
    if p1_pos and p1_pos == p2_pos:
        pts = 10
    elif p1_pos[:2] and p1_pos[:2] == p2_pos[:2]:
        pts = 4
    else:
        pts = 0
    score += pts
    breakdown["position_match"] = pts

    # 5. Era proximity (start year)
    start1 = player1.get("start_year", 0)
    start2 = player2.get("start_year", 0)
    era_pts = 0
    if start1 and start2:
        era_diff = abs(start1 - start2)
        if era_diff == 0:
            era_pts = 10
        elif era_diff <= 5:
            era_pts = 7
        elif era_diff <= 10:
            era_pts = 4
    score += era_pts
    breakdown["era_similarity"] = era_pts

    # 6. Career length similarity
    cl1 = calculate_career_length(player1)
    cl2 = calculate_career_length(player2)
    cl_diff = abs(cl1 - cl2)
    if cl_diff <= 3:
        cl_pts = 6
    elif cl_diff <= 5:
        cl_pts = 3
    else:
        cl_pts = 0
    score += cl_pts
    breakdown["career_length_similarity"] = cl_pts

    # 7. Star power / accolades overlap
    all_star_pts = 0
    if set(player1.get("all_star_seasons", [])) & set(player2.get("all_star_seasons", [])):
        all_star_pts = 5
    score += all_star_pts
    breakdown["all_star_overlap"] = all_star_pts

    all_team_pts = 0
    for sel1 in player1.get("all_team_selections", []):
        for sel2 in player2.get("all_team_selections", []):
            if sel1["season"] == sel2["season"] and sel1["type"] == sel2["type"]:
                all_team_pts = 5
                break
        if all_team_pts:
            break
    score += all_team_pts
    breakdown["all_team_overlap"] = all_team_pts

    award_pts = 0
    if set(player1.get("awards_won", [])) & set(player2.get("awards_won", [])):
        award_pts = 8
    score += award_pts
    breakdown["award_overlap"] = award_pts

    # Clamp non-exact matches below 100
    breakdown["total"] = min(score, 99)
    return breakdown["total"], breakdown

def get_player(name):
    name = name.strip().lower()
    for player in players_db:
        if player.lower() == name:
            return players_db[player], player
    close = get_close_matches(name, players_db.keys(), n=1, cutoff=0.8)
    if close:
        return players_db[close[0]], close[0]
    return None, None

def calculate_career_length(player_data):
    """
    Calculate career length from seasons data only.

    We ignore any pre-computed "career_length" fields in the JSON so that
    edge cases like inactive / did-not-play years don't inflate the count.
    """
    seasons = _filtered_seasons(player_data)
    if not seasons:
        # Fall back to stored career_length if we truly have no usable seasons data
        return max(player_data.get("career_length", 0), 0)

    unique_seasons = {s["season"] for s in seasons if "season" in s}
    return len(unique_seasons)

def get_draft_year(player_data):
    """Extract draft year from player data"""
    # Try to get draft year from explicit field
    if "draft_year" in player_data:
        return player_data["draft_year"]
    
    # Try to calculate from start_year (assuming drafted year before or same as start)
    start_year = player_data.get("start_year", 0)
    if start_year > 0:
        return start_year - 1  # Most players are drafted year before they start
    
    # Fallback: get earliest season year
    seasons = player_data.get("seasons", [])
    if seasons:
        earliest_season = min(s["season"] for s in seasons)
        return earliest_season - 1
    
    return 0

def create_players_summary():
    """Create a summary of all players with filtering data"""
    summary = {}
    
    for player_name, player_data in players_db.items():
        summary[player_name] = {
            "start_year": player_data.get("start_year", 0),
            "draft_year": get_draft_year(player_data),
            "career_length": calculate_career_length(player_data),
            "position": player_data.get("position", ""),
            "teams": _filtered_teams(player_data),
            "seasons_count": calculate_career_length(player_data),
        }
    
    return summary

# Serve React App
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

# API Routes
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'Server is running', 'players_loaded': len(players_db)})

@app.route('/api/players', methods=['GET'])
def get_players():
    """Return list of all player names"""
    return jsonify(list(players_db.keys()))

@app.route('/api/player_awards', methods=['GET'])
def get_player_awards():
    """Return list of all player names (for compatibility with frontend)"""
    return jsonify(list(players_db.keys()))

@app.route('/api/players_data', methods=['GET'])
def get_players_data():
    """Return summary data for all players (used for filtering)"""
    try:
        summary = create_players_summary()
        return jsonify(summary)
    except Exception as e:
        print(f"Error creating players summary: {e}")
        return jsonify({"error": "Failed to create players summary"}), 500

@app.route('/api/player/<player_name>', methods=['GET'])
def get_single_player(player_name):
    """Return detailed data for a specific player"""
    player_data, matched_name = get_player(player_name)
    if not player_data:
        return jsonify({"error": "Player not found"}), 404
    
    # Add calculated fields
    enhanced_data = dict(player_data)
    enhanced_data["career_length"] = calculate_career_length(player_data)
    enhanced_data["draft_year"] = get_draft_year(player_data)
    
    return jsonify({
        "name": matched_name,
        "data": enhanced_data
    })

@app.route('/api/guess', methods=['POST'])
def guess():
    data = request.json
    guess_input = data['guess']
    target_input = data['target']

    guess_player, guess_key = get_player(guess_input)
    target_player, target_key = get_player(target_input)

    if not guess_player or not target_player:
        return jsonify({"error": "Invalid player name."}), 400

    guess_counter[target_key] = guess_counter.get(target_key, 0) + 1

    if guess_key == target_key:
        similarities = []
        for other_name, other_data in players_db.items():
            if other_name == target_key:
                continue
            sim_score, _ = compute_similarity(other_data, target_player, other_name, target_key)
            similarities.append((other_name, sim_score))
        top_5 = sorted(similarities, key=lambda x: x[1], reverse=True)[:5]

        return jsonify({
            "score": 100,
            "message": "🔥 You got it!",
            "matched_name": guess_key,
            "top_5": top_5
        })

    score, breakdown = compute_similarity(guess_player, target_player, guess_key, target_key)

    return jsonify({
        "score": score,
        "matched_name": guess_key,
        "breakdown": breakdown
    })

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Return game statistics"""
    return jsonify({
        "total_players": len(players_db),
        "total_guesses": sum(guess_counter.values()),
        "games_played": len(guess_counter)
    })

if __name__ == '__main__':
    print("Starting NBA Similarity Game Backend...")
    print(f"Loaded {len(players_db)} players from database")
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
    