import React, { useState, useEffect } from 'react';
import './App.css';

const DAILY_STORAGE_KEY = 'nba-mantle-daily-state';

const NBAGuessGame = () => {
  const [mode, setMode] = useState('daily'); // 'daily' | 'hardcore'
  const [modesInfo, setModesInfo] = useState(null);
  const [targetPlayer, setTargetPlayer] = useState('');
  const [dailyDate, setDailyDate] = useState('');
  const [guess, setGuess] = useState('');
  const [guessHistory, setGuessHistory] = useState([]);
  const [gameWon, setGameWon] = useState(false);
  const [guessCount, setGuessCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [top5Players, setTop5Players] = useState([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [allPlayers, setAllPlayers] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);

  // API base URL - updated to match your backend
  const API_BASE = 'https://nba-mantle-6-5.onrender.com/api';

  const resetRoundState = () => {
    setGuess('');
    setGuessHistory([]);
    setGameWon(false);
    setGuessCount(0);
    setError('');
    setTop5Players([]);
    setShowAnswer(false);
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  const loadDailyTarget = async () => {
    try {
      const saved = JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY) || 'null');
      const response = await fetch(`${API_BASE}/daily-target`);
      const data = await response.json();

      if (saved && saved.date === data.date) {
        // Same calendar day: keep whatever progress they already made today.
        setTargetPlayer(saved.target);
        setDailyDate(saved.date);
        setGuessHistory(saved.guessHistory || []);
        setGuessCount(saved.guessCount || 0);
        setGameWon(saved.gameWon || false);
        setTop5Players(saved.top5Players || []);
        return;
      }

      localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify({
        date: data.date,
        target: data.target,
        guessHistory: [],
        guessCount: 0,
        gameWon: false,
        top5Players: [],
      }));
      setTargetPlayer(data.target);
      setDailyDate(data.date);
      resetRoundState();
    } catch (err) {
      console.error('Could not load daily target:', err);
      setError('Could not reach the server for today\'s player.');
    }
  };

  const loadHardcoreTarget = async () => {
    try {
      const response = await fetch(`${API_BASE}/hardcore-target`);
      const data = await response.json();
      setTargetPlayer(data.target);
      resetRoundState();
    } catch (err) {
      console.error('Could not load hardcore target:', err);
      setError('Could not reach the server for a new player.');
    }
  };

  const startNewGame = () => {
    if (mode === 'daily') {
      // The daily target is shared by everyone; "New Game" only clears your guesses.
      const saved = JSON.parse(localStorage.getItem(DAILY_STORAGE_KEY) || 'null');
      if (saved) {
        localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify({
          ...saved, guessHistory: [], guessCount: 0, gameWon: false, top5Players: [],
        }));
      }
      resetRoundState();
    } else {
      loadHardcoreTarget();
    }
  };

  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    resetRoundState();
    if (nextMode === 'daily') {
      loadDailyTarget();
    } else {
      loadHardcoreTarget();
    }
  };

  useEffect(() => {
    const persistDailyProgress = () => {
      if (mode !== 'daily' || !dailyDate) return;
      localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify({
        date: dailyDate, target: targetPlayer, guessHistory, guessCount, gameWon, top5Players,
      }));
    };
    persistDailyProgress();
  }, [mode, dailyDate, targetPlayer, guessHistory, guessCount, gameWon, top5Players]);

  useEffect(() => {
    const loadPlayerNames = async () => {
      try {
        const response = await fetch(`${API_BASE}/players`);
        if (response.ok) {
          const playerNames = await response.json();
          setAllPlayers(playerNames.sort());
        }
      } catch (err) {
        console.error('Could not load player list from API:', err);
      }
    };

    const loadModesInfo = async () => {
      try {
        const response = await fetch(`${API_BASE}/modes`);
        if (response.ok) setModesInfo(await response.json());
      } catch (err) {
        console.error('Could not load mode info:', err);
      }
    };

    loadPlayerNames();
    loadModesInfo();
    loadDailyTarget();
    // Mount-only: these loaders read state via closures but must run exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const makeGuess = async () => {
    if (!guess.trim()) return;
    
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedSuggestionIndex(-1);
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/guess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          guess: guess.trim(),
          target: targetPlayer
        })
      });

      if (response.ok) {
        const result = await response.json();
        const { score, matched_name, breakdown, top_5 } = result;

        const newGuess = {
          name: matched_name || guess.trim(),
          score: score,
          breakdown: breakdown || {}
        };

        const alreadyGuessed = guessHistory.some(g => g.name === newGuess.name);
        
        if (!alreadyGuessed) {
          setGuessHistory(prev => {
            const updated = [...prev, newGuess];
            return updated.sort((a, b) => b.score - a.score).slice(0, 15);
          });

          setGuessCount(prev => prev + 1);

          if (score === 100) {
            setGameWon(true);
            setTop5Players(top_5 || []);
          }
        } else {
          setError('You have already guessed this player!');
        }

        setGuess('');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Unknown error occurred');
      }
    } catch (err) {
      setError('Connection error. Please check your internet connection and try again.');
      console.error('API Error:', err);
    }

    setLoading(false);
  };

  const revealAnswer = async () => {
    if (!targetPlayer) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/guess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          guess: targetPlayer,
          target: targetPlayer
        })
      });

      if (response.ok) {
        const result = await response.json();
        setTop5Players(result.top_5 || []);
      }
    } catch (err) {
      console.error('Error fetching top 5:', err);
    }
    
    setShowAnswer(true);
    setLoading(false);
  };

  const handleSuggestionSelect = (selectedName) => {
    setGuess(selectedName);
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#f59e0b';
    if (score >= 40) return '#f97316';
    return '#ef4444';
  };

  const ScoreBar = ({ score, showLabel = true }) => {
    const percentage = Math.max(0, Math.min(100, score));
    const color = getScoreColor(score);
    
    return (
      <div className="score-bar-container">
        <div className="score-bar-track">
          <div 
            className="score-bar-fill"
            style={{
              width: `${percentage}%`,
              background: `linear-gradient(90deg, ${color}dd, ${color})`,
              boxShadow: `0 0 10px ${color}40`
            }}
          />
          {showLabel && (
            <div 
              className="score-bar-label"
              style={{
                color: percentage > 30 ? 'white' : color,
                textShadow: percentage > 30 ? '0 1px 2px rgba(0,0,0,0.8)' : 'none'
              }}
            >
              {score}
            </div>
          )}
        </div>
        <div 
          className="score-bar-value"
          style={{ color: color }}
        >
          {score}/100
        </div>
      </div>
    );
  };

  const formatBreakdownKey = (key) => {
    const labels = {
      shared_seasons: 'Shared Seasons',
      shared_streak_bonus: 'Streak Bonus',
      teammate_years: 'Teammate Years',
      shared_teams: 'Team Overlap',
      team_tenure: 'Tenure Bonus',
      position_match: 'Position',
      start_year_diff: 'Draft Era',
      shared_all_star: 'All-Star',
      shared_all_team: 'All-Team',
      shared_awards: 'Awards'
    };
    return labels[key] || key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="game-container">
      <div className="game-content">
        {/* Header */}
        <div className="header panel">
          <div className="title-section">
            <span>🏀</span>
            <h1>NBA-MANTLE v2</h1>
            <span>🎯</span>
          </div>
          
          <p className="subtitle">
            Guess the mystery NBA player by finding similar players!
          </p>

          <div className="mode-toggle">
            <button
              className={`mode-btn ${mode === 'daily' ? 'active' : ''}`}
              onClick={() => switchMode('daily')}
            >
              📅 Daily
            </button>
            <button
              className={`mode-btn ${mode === 'hardcore' ? 'active' : ''}`}
              onClick={() => switchMode('hardcore')}
            >
              🔥 Hardcore
            </button>
          </div>

          {modesInfo && (
            <p className="mode-info">
              {mode === 'daily'
                ? `One shared player for everyone each day, drawn from ${modesInfo.daily.pool_size} recognizable names (All-Stars, award winners, multi-time All-NBA/Defense/Rookie selections). Resets at midnight UTC.`
                : `Unlimited replays from a much wider pool of ${modesInfo.hardcore.pool_size} real rotation players, no accolades required. A real challenge.`}
            </p>
          )}

          <div className="stats">
            <span>⚡ Attempt #{guessCount}</span>
            {!gameWon && !showAnswer && (
              <span className="mystery">Mystery Player: ???</span>
            )}
            {(gameWon || showAnswer) && (
              <span className="answer">Answer: {targetPlayer}</span>
            )}
          </div>
        </div>

        {/* How to Play */}
        <div className="panel how-to-play">
          <h3>📘 How to Play</h3>
          <ul className="how-to-play-list">
            <li>We secretly pick a current or historical NBA player as the mystery target.</li>
            <li>Type any NBA player and submit your guess to see a similarity score from 0–100.</li>
            <li>Higher scores mean the guess is closer in teammates, teams, era, accolades, and more.</li>
            <li>Use the breakdown under each guess to understand why it scored that way and adjust.</li>
            <li>Keep guessing until you hit 100 and reveal the mystery player, or press Reveal to give up.</li>
          </ul>
        </div>

        <div className="main-layout">
          {/* Left Panel */}
          <div className="left-panel">
            {/* Input Section */}
            <div className="panel">
              <h3>🔍 Make Your Guess</h3>
              
              {!gameWon && !showAnswer && (
                <div className="input-section">
                  <div className="input-container">
                    <input
                      type="text"
                      className="player-input"
                      value={guess}
                      onChange={(e) => {
                        const value = e.target.value;
                        setGuess(value);
                        setSelectedSuggestionIndex(-1);
                        
                        if (value.length > 0) {
                          const filtered = allPlayers.filter(name =>
                            name.toLowerCase().includes(value.toLowerCase()) &&
                            !name.includes('?')
                          ).slice(0, 8);
                          setSuggestions(filtered);
                          setShowSuggestions(true);
                        } else {
                          setSuggestions([]);
                          setShowSuggestions(false);
                        }
                        
                        if (error) setError('');
                      }}
                      onKeyDown={(e) => {
                        if (showSuggestions && suggestions.length > 0) {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setSelectedSuggestionIndex(prev => 
                              prev < suggestions.length - 1 ? prev + 1 : 0
                            );
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setSelectedSuggestionIndex(prev => 
                              prev > 0 ? prev - 1 : suggestions.length - 1
                            );
                          } else if (e.key === 'Enter') {
                            e.preventDefault();
                            if (selectedSuggestionIndex >= 0) {
                              handleSuggestionSelect(suggestions[selectedSuggestionIndex]);
                            } else {
                              makeGuess();
                            }
                          } else if (e.key === 'Escape') {
                            setShowSuggestions(false);
                            setSuggestions([]);
                            setSelectedSuggestionIndex(-1);
                          }
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          makeGuess();
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setShowSuggestions(false);
                          setSuggestions([]);
                          setSelectedSuggestionIndex(-1);
                        }, 150);
                      }}
                      placeholder="Enter NBA player name..."
                      disabled={loading}
                    />
                    
                    {showSuggestions && suggestions.length > 0 && (
                      <ul className="suggestions">
                        {suggestions.map((suggestion, index) => (
                          <li
                            key={index}
                            className={`suggestion-item ${index === selectedSuggestionIndex ? 'selected' : ''}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              handleSuggestionSelect(suggestion);
                            }}
                            onMouseEnter={() => setSelectedSuggestionIndex(index)}
                          >
                            {suggestion}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  
                  <button
                    onClick={makeGuess}
                    disabled={loading || !guess.trim()}
                    className={`submit-btn ${loading || !guess.trim() ? 'disabled' : ''}`}
                  >
                    {loading ? 'Searching...' : 'Submit Guess'}
                  </button>
                </div>
              )}

              {error && (
                <div className="error">
                  {error}
                </div>
              )}

              {gameWon && (
                <div className="win-message panel">
                  <div className="emoji">🎉</div>
                  <p>
                    Congratulations! You found {targetPlayer} in {guessCount} guesses!
                  </p>
                </div>
              )}

              {showAnswer && !gameWon && (
                <div className="reveal-message panel">
                  <div className="emoji">🎯</div>
                  <p>
                    The answer was {targetPlayer}
                  </p>
                </div>
              )}

              <div className="button-group">
                <button className="new-game-btn" onClick={startNewGame}>
                  {mode === 'daily' ? '🔄 Retry Today\'s Player' : '🔄 New Player'}
                </button>
                
                {!gameWon && !showAnswer && (
                  <button className="reveal-btn" onClick={revealAnswer}>
                    👁️ Reveal
                  </button>
                )}
              </div>
            </div>

            {/* Top 5 Similar Players */}
            {top5Players.length > 0 && (
              <div className="panel">
                <h3>📈 Top 5 Most Similar</h3>
                <div className="top5-list">
                  {top5Players.map(([name, score], index) => (
                    <div key={name} className="top5-item">
                      <div className="top5-header">
                        <span className="rank">{index + 1}</span>
                        <span className="name">{name}</span>
                      </div>
                      <ScoreBar score={score} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Guess History */}
          <div className="panel right-panel">
            <h3>👥 Guess History ({guessHistory.length})</h3>
            
            {guessHistory.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <p>No guesses yet. Start by entering a player name!</p>
              </div>
            ) : (
              <div className="guess-list">
                {guessHistory.map((item, index) => (
                  <div key={index} className="guess-item">
                    <div className="guess-header">
                      <h4>{item.name}</h4>
                    </div>
                    
                    <div className="guess-score">
                      <ScoreBar score={item.score} />
                    </div>
                    
                    {item.breakdown && Object.keys(item.breakdown).length > 0 && (
                      <div className="breakdown">
                        {Object.entries(item.breakdown)
                          .filter(([key, value]) => 
                            key !== 'total' && 
                            key !== 'shared_seasons_detail' && 
                            value > 0
                          )
                          .map(([key, value]) => (
                            <div key={key} className="breakdown-item">
                              <span className="breakdown-label">
                                {formatBreakdownKey(key)}
                              </span>
                              <span className="breakdown-value">
                                +{value}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NBAGuessGame;