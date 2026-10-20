"""
Empirical difficulty baseline for Daily vs Hardcore mode.

Mirrors the idea of a live-play audit (score a large sample of real games with a
reasonably skilled simulated player) rather than trusting the pool-selection
criteria to "feel right" by inspection alone. Run after changing the notability
formula or the pool thresholds in nba_mantle_backend.py.

Bot strategy (approximates a knowledgeable human, not an omniscient solver):
  1. While nothing has scored above EXPLOIT_THRESHOLD yet, explore: guess the
     most notable untried player, same as a human starting with famous names.
  2. Once a guess clears that threshold, exploit: rank untried players by their
     similarity to the best 3 guesses so far, weighted by each one's own score
     (so a strong clue on team/era pulls harder than a weak one on position
     alone), same signal the in-game score breakdown gives a real player.
  3. If exploiting stalls for a few guesses without improving the best score,
     fall back to a fresh exploration guess rather than mining a dead-end
     neighborhood forever (a single-anchor-only bot gets stuck exactly there).
  4. Stop at the target (score 100) or at max_guesses (counted as not solved).

Usage: python backend/calibrate_difficulty.py [--games 60] [--max-guesses 50]
"""
import argparse
import statistics
import sys
import time

import nba_mantle_backend as be


EXPLOIT_THRESHOLD = 20   # minimum score before switching from pure exploration
TOP_K_ANCHORS = 3        # blend similarity to the best few guesses, not just one
PLATEAU_LIMIT = 4        # exploit guesses without improvement before a fresh explore


def simulate_game(target_name, max_guesses):
    db = be.players_db
    target = db[target_name]
    all_names = list(db.keys())
    notability = be.MODE_POOLS["notability"]
    notable_order = sorted(all_names, key=lambda n: notability[n], reverse=True)

    guessed = set()
    scored_guesses = []  # list of (name, score), best-first
    best_score = -1
    stale = 0
    notable_idx = 0

    def next_fresh_candidate():
        nonlocal notable_idx
        while notable_idx < len(notable_order) and notable_order[notable_idx] in guessed:
            notable_idx += 1
        return notable_order[notable_idx] if notable_idx < len(notable_order) else None

    next_guess = next_fresh_candidate()

    for attempt in range(1, max_guesses + 1):
        guessed.add(next_guess)
        score, _ = be.compute_similarity(db[next_guess], target, next_guess, target_name)

        if next_guess == target_name or score == 100:
            return attempt

        scored_guesses.append((next_guess, score))
        scored_guesses.sort(key=lambda t: t[1], reverse=True)
        scored_guesses[:] = scored_guesses[:TOP_K_ANCHORS]

        if score > best_score:
            best_score = score
            stale = 0
        else:
            stale += 1

        remaining = [n for n in all_names if n not in guessed]
        if not remaining:
            break

        explore = best_score < EXPLOIT_THRESHOLD or stale >= PLATEAU_LIMIT
        if explore:
            fresh = next_fresh_candidate()
            if fresh is not None:
                next_guess = fresh
                if stale >= PLATEAU_LIMIT:
                    stale = 0
                continue

        anchors = [(db[name], sc) for name, sc in scored_guesses]
        next_guess = max(
            remaining,
            key=lambda n: sum(
                sc * be.compute_similarity(db[n], anchor_data, n, None)[0]
                for anchor_data, sc in anchors
            ),
        )

    return None  # did not solve within max_guesses


def run_pool(pool_name, pool, games, max_guesses, seed):
    import random
    rng = random.Random(seed)
    sample_size = min(games, len(pool))
    targets = rng.sample(pool, sample_size)

    results = []
    t0 = time.time()
    for i, target in enumerate(targets, 1):
        guesses = simulate_game(target, max_guesses)
        results.append(guesses)
        if i % 10 == 0 or i == sample_size:
            print(f"  [{pool_name}] {i}/{sample_size} simulated...", file=sys.stderr)

    solved = [g for g in results if g is not None]
    failed = len(results) - len(solved)
    elapsed = time.time() - t0

    print(f"\n=== {pool_name} ({sample_size} games, max {max_guesses} guesses, {elapsed:.1f}s) ===")
    print(f"  solved: {len(solved)}/{sample_size} ({100*len(solved)/sample_size:.0f}%)")
    if solved:
        print(f"  avg guesses to win: {statistics.mean(solved):.1f}")
        print(f"  median guesses to win: {statistics.median(solved):.1f}")
        print(f"  min / max guesses: {min(solved)} / {max(solved)}")
    print(f"  did not solve within cap: {failed}")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--games", type=int, default=60)
    parser.add_argument("--max-guesses", type=int, default=50)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    print(f"Daily pool: {len(be.MODE_POOLS['daily_pool'])} players")
    print(f"Hardcore pool: {len(be.MODE_POOLS['hardcore_pool'])} players")

    run_pool("DAILY", be.MODE_POOLS["daily_pool"], args.games, args.max_guesses, args.seed)
    run_pool("HARDCORE", be.MODE_POOLS["hardcore_pool"], args.games, args.max_guesses, args.seed)
