# Daily vs. Hardcore difficulty baseline

Target selection used to be a single uniform-random pick across all 5,266+
players ever recorded (1947-2025), so a round could hand you LeBron James or
an anonymous 1958 bench player with equal odds. `nba_mantle_backend.py` now
builds two criteria-based pools instead:

- **Daily** (`MODE_POOLS["daily_pool"]`): top ~7% by a notability score built
  from All-Star appearances, All-NBA/All-Defense/All-Rookie selections, major
  awards, and career length, with a hard floor requiring at least one real
  accolade. One shared target per UTC calendar date (seeded by date, so
  everyone gets the same player).
- **Hardcore** (`MODE_POOLS["hardcore_pool"]`): a much wider pool (3+ seasons
  played, no accolade requirement), replayable on demand.

See `compute_notability()` and `build_mode_pools()` for the exact formula and
thresholds.

## Measuring it empirically

`calibrate_difficulty.py` runs a simulated explore/exploit bot against a
random sample from each pool and reports solve rate and guesses-to-win,
instead of trusting the thresholds by inspection alone. The bot:

1. Explores (guesses the next most notable untried player) until something
   scores above a threshold.
2. Exploits by guessing whichever untried player is most similar to the best
   3 guesses so far, weighted by their scores - the same signal the in-game
   score breakdown gives a real player.
3. Falls back to exploring again if exploiting stalls for a few guesses, so it
   doesn't get stuck mining one team/era forever.

It is a reasonable, not omniscient, stand-in for a knowledgeable human - it
has no real-world basketball knowledge to shortcut the search with, so these
numbers are an upper bound on real difficulty, not a prediction of exact
human guess counts. What matters is the **relative** comparison between pools.

### Results (seed 7, max 40 guesses)

| Pool      | n  | Solved        | Avg guesses (solved) | Median |
|-----------|----|---------------|-----------------------|--------|
| Daily     | 50 | 35/50 (70%)   | 23.6                  | 25.0   |
| Hardcore  | 50 | 32/50 (64%)   | 26.2                  | 25.5   |
| Daily     | 25 | 18/25 (72%)   | 23.0                  | 22.0   |
| Hardcore  | 25 | 17/25 (68%)   | 25.8                  | 24.0   |

Daily is consistently easier to solve (higher solve rate, fewer average
guesses) than Hardcore across both runs, with Hardcore clearly the harder,
longer grind without being unsolvable (roughly two-thirds still solve it
within 40 guesses). If the gap ever needs to be wider, tighten
`daily_floor`'s percentile in `build_mode_pools()` (currently the 93rd) and
re-run this script.

Re-run after changing the notability formula or thresholds:

```
cd backend
python calibrate_difficulty.py --games 50 --max-guesses 40
```
