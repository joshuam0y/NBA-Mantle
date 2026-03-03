import React, { useState, useEffect } from 'react';

const NBAGuessGame = () => {
  const [targetPlayer, setTargetPlayer] = useState('');
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

  // Fallback modern NBA players (only used if API loading fails)
  const modernPlayers = [
    'LeBron James', 'Stephen Curry', 'Kevin Durant', 'Giannis Antetokounmpo',
    'Luka Dončić', 'Jayson Tatum', 'Joel Embiid', 'Nikola Jokić', 'Damian Lillard',
    'Jimmy Butler', 'Kawhi Leonard', 'Anthony Davis', 'Russell Westbrook',
    'James Harden', 'Chris Paul', 'Klay Thompson', 'Draymond Green',
    'Paul George', 'Kyrie Irving', 'Bradley Beal', 'Devin Booker',
    'Donovan Mitchell', 'Ja Morant', 'Trae Young', 'Zion Williamson',
    'Pascal Siakam', 'Bam Adebayo', 'Jaylen Brown', 'Tyler Herro'
  ];

  // Get the base API URL - in production it will be the same domain
  const getApiUrl = (endpoint) => {
    const isDevelopment = window.location.hostname === 'localhost';
    const baseUrl = isDevelopment ? 'http://127.0.0.1:5000' : '';
    return `${baseUrl}/api${endpoint}`;
  };

  const startNewGame = () => {
    // Use allPlayers if available, otherwise fall back to modernPlayers
    const playersToUse = allPlayers.length > 0 ? allPlayers : modernPlayers;
    const randomPlayer = playersToUse[Math.floor(Math.random() * playersToUse.length)];
    
    setTargetPlayer(randomPlayer);
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
    
    // Immediately start a new game with the random player
    console.log('New game started with:', randomPlayer);
  };

  useEffect(() => {
    const loadPlayerNames = async () => {
      try {
        // Try to load from the API first
        const response = await fetch(getApiUrl('/players'));
        
        if (response.ok) {
          const playerNames = await response.json();
          setAllPlayers(playerNames.sort());
          
          // Once players are loaded, start the game with a random one
          const randomPlayer = playerNames[Math.floor(Math.random() * playerNames.length)];
          setTargetPlayer(randomPlayer);
        } else {
          throw new Error('Failed to load players from API');
        }
      } catch (error) {
        console.error('Could not load players from API, using fallback', error);
        // fallback to modern players
        const fallback = modernPlayers;
        setAllPlayers(fallback);

        const randomPlayer = fallback[Math.floor(Math.random() * fallback.length)];
        setTargetPlayer(randomPlayer);
      }

      // Reset game state
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

    loadPlayerNames();
  }, []);

  const makeGuess = async () => {
    if (!guess.trim()) return;
    
    // Hide suggestions when making a guess
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedSuggestionIndex(-1);
    
    setLoading(true);
    setError('');

    try {
      const response = await fetch(getApiUrl('/guess'), {
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

        // Check if this exact player (by matched_name) has already been guessed
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
      setError('Connection error. Please check your internet connection.');
    }

    setLoading(false);
  };

  const revealAnswer = async () => {
    if (!targetPlayer) return;
    
    setLoading(true);
    try {
      const response = await fetch(getApiUrl('/guess'), {
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
    if (score >= 80) return '#10b981'; // green
    if (score >= 60) return '#f59e0b'; // yellow
    if (score >= 40) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  const ScoreBar = ({ score, showLabel = true }) => {
    const percentage = Math.max(0, Math.min(100, score));
    const color = getScoreColor(score);
    
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        width: '100%'
      }}>
        <div style={{
          flex: 1,
          height: '1.5rem',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '0.75rem',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{
            height: '100%',
            width: `${percentage}%`,
            background: `linear-gradient(90deg, ${color}dd, ${color})`,
            borderRadius: '0.75rem',
            transition: 'width 0.8s ease-out',
            boxShadow: `0 0 10px ${color}40`
          }} />
          {showLabel && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '0.75rem',
              transform: 'translateY(-50%)',
              fontSize: '0.75rem',
              fontWeight: 'bold',
              color: percentage > 30 ? 'white' : color,
              textShadow: percentage > 30 ? '0 1px 2px rgba(0,0,0,0.8)' : 'none'
            }}>
              {score}
            </div>
          )}
        </div>
        <div style={{
          fontSize: '0.9rem',
          fontWeight: 'bold',
          color: color,
          minWidth: '3rem',
          textAlign: 'right'
        }}>
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
      franchise_overlap: 'Team Overlap',
      franchise_tenure_bonus: 'Tenure Bonus',
      archetype: 'Archetype',
      position: 'Position',
      draft_diff: 'Draft Era',
      era_diff: 'Career Era',
      career_end_proximity: 'Career End',
      career_length: 'Career Length'
    };
    return labels[key] || key;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e40af 100%)',
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '2rem 1rem'
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            <span style={{ fontSize: '2rem' }}>🏀</span>
            <h1 style={{
              fontSize: '3rem',
              fontWeight: 'bold',
              background: 'linear-gradient(45deg, #f97316, #ef4444)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0
            }}>
              NBA-MANTLE
            </h1>
            <span style={{ fontSize: '2rem' }}>🎯</span>
          </div>
          
          <p style={{ 
            fontSize: '1.2rem', 
            color: '#cbd5e1',
            marginBottom: '1rem'
          }}>
            Guess the mystery NBA player by finding similar players and tracking how close each guess is.
          </p>
          
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2rem',
            fontSize: '0.9rem',
            color: '#94a3b8'
          }}>
            <span>⚡ Attempt #{guessCount}</span>
            {!gameWon && !showAnswer && (
              <span style={{ color: '#64748b' }}>Mystery Player: ???</span>
            )}
            {(gameWon || showAnswer) && (
              <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                Answer: {targetPlayer}
              </span>
            )}
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: window.innerWidth > 1024 ? '1fr 2fr' : '1fr',
          gap: '2rem'
        }}>
          {/* Left Panel - Game Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Input Section */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: '1rem',
              padding: '1.5rem',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <h3 style={{
                fontSize: '1.5rem',
                fontWeight: '600',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                🔍 Make Your Guess
              </h3>
              
              {!gameWon && !showAnswer && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
                  <input
                    type="text"
                    value={guess}
                    onChange={(e) => {
                      const value = e.target.value;
                      setGuess(value);
                      setSelectedSuggestionIndex(-1); // Reset selection when typing
                      
                      if (value.length > 0) {
                        const filtered = allPlayers.filter(name =>
                          name.toLowerCase().includes(value.toLowerCase()) &&
                          !name.includes('?') // Filter out names with question marks
                        ).slice(0, 8);
                        setSuggestions(filtered);
                        setShowSuggestions(true);
                      } else {
                        setSuggestions([]);
                        setShowSuggestions(false);
                      }
                      
                      // Clear any previous error when user starts typing
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
                      // Delay hiding suggestions to allow for clicks
                      setTimeout(() => {
                        setShowSuggestions(false);
                        setSuggestions([]);
                        setSelectedSuggestionIndex(-1);
                      }, 150);
                    }}
                    placeholder="Enter NBA player name..."
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '0.5rem',
                      color: 'white',
                      fontSize: '1rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    disabled={loading}
                  />
                  {showSuggestions && suggestions.length > 0 && (
                    <ul style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: '0.25rem',
                      background: 'white',
                      borderRadius: '0.5rem',
                      padding: '0.5rem 0',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      color: 'black',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      zIndex: 1000,
                      listStyle: 'none',
                      margin: 0,
                      fontFamily: 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif'
                    }}>
                      {suggestions.map((suggestion, index) => (
                        <li
                          key={index}
                          onMouseDown={(e) => {
                            e.preventDefault(); // Prevent blur from firing
                            handleSuggestionSelect(suggestion);
                          }}
                          onMouseEnter={() => setSelectedSuggestionIndex(index)}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: index === selectedSuggestionIndex ? '#f0f0f0' : 'white',
                            cursor: 'pointer',
                            borderRadius: index === selectedSuggestionIndex ? '0.25rem' : '0',
                            margin: index === selectedSuggestionIndex ? '0 0.25rem' : '0',
                            fontSize: '1rem',
                            fontWeight: '400'
                          }}
                          dangerouslySetInnerHTML={{ __html: suggestion }}
                        />
                      ))}
                    </ul>
                  )}
                  <button
                    onClick={makeGuess}
                    disabled={loading || !guess.trim()}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      background: loading || !guess.trim() 
                        ? 'linear-gradient(45deg, #6b7280, #4b5563)'
                        : 'linear-gradient(45deg, #3b82f6, #8b5cf6)',
                      border: 'none',
                      borderRadius: '0.5rem',
                      color: 'white',
                      fontSize: '1rem',
                      fontWeight: '600',
                      cursor: loading || !guess.trim() ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {loading ? 'Searching...' : 'Submit Guess'}
                  </button>
                </div>

              )}

              {error && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '0.5rem',
                  color: '#fca5a5'
                }}>
                  {error}
                </div>
              )}

              {gameWon && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
                  <p style={{ color: '#10b981', fontWeight: '600', fontSize: '1.2rem' }}>
                    Congratulations! You found {targetPlayer} in {guessCount} guesses!
                  </p>
                </div>
              )}

              {showAnswer && !gameWon && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
                  <p style={{ color: '#3b82f6', fontWeight: '600', fontSize: '1.2rem' }}>
                    The answer was {targetPlayer}
                  </p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  onClick={startNewGame}
                  style={{
                    flex: 1,
                    padding: '0.5rem 1rem',
                    background: 'linear-gradient(45deg, #10b981, #059669)',
                    border: 'none',
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}
                >
                  🔄 New Game
                </button>
                
                {!gameWon && !showAnswer && (
                  <button
                    onClick={revealAnswer}
                    style={{
                      flex: 1,
                      padding: '0.5rem 1rem',
                      background: 'linear-gradient(45deg, #f97316, #ef4444)',
                      border: 'none',
                      borderRadius: '0.5rem',
                      color: 'white',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    👁️ Reveal
                  </button>
                )}
              </div>
            </div>

            {/* Top 5 Similar Players */}
            {top5Players.length > 0 && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                borderRadius: '1rem',
                padding: '1.5rem',
                border: '1px solid rgba(255, 255, 255, 0.2)'
              }}>
                <h3 style={{
                  fontSize: '1.5rem',
                  fontWeight: '600',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  📈 Top 5 Most Similar
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {top5Players.map(([name, score], index) => (
                    <div key={name} style={{
                      padding: '1rem',
                      background: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '0.75rem'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        marginBottom: '0.75rem'
                      }}>
                        <span style={{
                          width: '1.5rem',
                          height: '1.5rem',
                          background: 'linear-gradient(45deg, #f59e0b, #f97316)',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 'bold',
                          color: 'black'
                        }}>
                          {index + 1}
                        </span>
                        <span style={{ fontWeight: '500', flex: 1 }}>{name}</span>
                      </div>
                      <ScoreBar score={score} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Guess History */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(10px)',
            borderRadius: '1rem',
            padding: '1.5rem',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: '600',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              👥 Guess History ({guessHistory.length})
            </h3>
            
            {guessHistory.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '3rem 0', 
                color: '#94a3b8'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>🔍</div>
                <p>No guesses yet. Start by entering a player name!</p>
              </div>
            ) : (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1rem',
                maxHeight: '500px',
                overflowY: 'auto'
              }}>
                {guessHistory.map((item, index) => (
                  <div key={index} style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '0.75rem',
                    padding: '1rem',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '1rem'
                    }}>
                      <h4 style={{ 
                        fontSize: '1.1rem', 
                        fontWeight: '600',
                        margin: 0,
                        flex: 1
                      }}>
                        {item.name}
                      </h4>
                    </div>
                    
                    <div style={{ marginBottom: '1rem' }}>
                      <ScoreBar score={item.score} />
                    </div>
                    
                    {item.breakdown && Object.keys(item.breakdown).length > 0 && (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '0.5rem',
                        fontSize: '0.8rem'
                      }}>
                        {Object.entries(item.breakdown)
                          .filter(([key, value]) => 
                            key !== 'total' && 
                            key !== 'shared_seasons_detail' && 
                            value > 0
                          )
                          .map(([key, value]) => (
                            <div key={key} style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '0.4rem 0.6rem',
                              background: 'rgba(255, 255, 255, 0.05)',
                              borderRadius: '0.25rem'
                            }}>
                              <span style={{ color: '#cbd5e1' }}>
                                {formatBreakdownKey(key)}
                              </span>
                              <span style={{ color: 'white', fontWeight: '500' }}>
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