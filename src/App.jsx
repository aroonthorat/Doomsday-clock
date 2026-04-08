import React, { useState, useEffect } from 'react';
import newsData from './data/news.json';
import clockStatus from './data/clockStatus.json';

const App = () => {
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Support both object and array structure
  const currentStatus = (Array.isArray(clockStatus) ? clockStatus[0] : clockStatus) || { 
    secondsToMidnight: 90, 
    lastUpdated: new Date().toISOString(), 
    reason: 'Data synchronization pending...' 
  };
  
  const [timeLeft, setTimeLeft] = useState(currentStatus.secondsToMidnight || 90);
  
  // Process news data into a flat array of articles with categories
  const allArticles = Object.entries(newsData.categories).flatMap(([catKey, articles]) => 
    articles.map(article => ({ ...article, category: catKey }))
  );
  
  const [articles] = useState(allArticles);
  const [showExplanation, setShowExplanation] = useState(false);

  const categoryMap = {
    'nuclear': 'Nuclear',
    'climate': 'Climate',
    'ai': 'Artificial Intelligence',
    'disruptive_tech': 'Disruptive Tech',
    'fragile_state': 'Fragile States'
  };

  // Top 5 IMPACTFUL articles (most negative score)
  const topImpactfulNews = [...articles]
    .filter(a => a.ai_analysis)
    .sort((a, b) => (a.ai_analysis.score || 0) - (b.ai_analysis.score || 0))
    .slice(0, 5);

  // Category Contributions
  const categoryContributions = Object.keys(newsData.categories).map(catKey => {
    const catArticles = articles.filter(a => a.category === catKey);
    const avgScore = catArticles.length > 0
      ? catArticles.reduce((acc, curr) => acc + (curr.ai_analysis?.score || 0), 0) / catArticles.length
      : 0;
    return {
      key: catKey,
      label: categoryMap?.[catKey] || catKey,
      score: avgScore,
      count: catArticles.length
    };
  }).sort((a, b) => a.score - b.score);

  const totalImpact = categoryContributions.reduce((acc, curr) => acc + Math.abs(curr.score), 0);

  // Countdown logic
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  
  const categoryKeys = Object.keys(newsData.categories);
  
  const getCount = (catKey) => articles.filter(a => a.category === catKey).length;

  const filteredArticles = selectedCategory === 'All' 
    ? articles 
    : articles.filter(a => a.category === selectedCategory);

  return (
    <div className="container">
      <div className="bg-glow">
        <div className="glow-orb" style={{ top: '10%', right: '10%', opacity: 0.15 }}></div>
        <div className="glow-orb" style={{ bottom: '20%', left: '5%', background: 'radial-gradient(circle, rgba(0, 242, 255, 0.08) 0%, transparent 70%)' }}></div>
      </div>

      <header>
        <div className="brand">DOOMSDAY<span>CLOCK</span></div>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <button className="explanation-toggle" onClick={() => setShowExplanation(true)}>
            WHY IS IT MOVING?
          </button>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--text-primary)', fontSize: '0.75rem', fontWeight: 800, letterSpacing: '1px' }}>SYSTEM ONLINE</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>
              SYNC: {new Date(currentStatus.lastUpdated).toLocaleTimeString()}
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="clock-section">
          <div className="clock-telemetry">
            <div className="clock-status-tag">Live Risk Assessment</div>
            <h1>The World is at</h1>
            <div className="clock-timer">{formatTime(timeLeft)}</div>
            
            <div className="risk-level">
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-nuclear)' }}>CRITICAL</span>
              <div className="risk-meter">
                <div className="risk-fill" style={{ width: '92%' }}></div>
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>92%</span>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, maxWidth: '500px' }}>
              {currentStatus.reason}
            </p>

            <div className="ai-meta">
              <div className="ai-chip">Reliability: <span>High</span></div>
              <div className="ai-chip">Sources: <span>Verified</span></div>
              <div className="ai-chip">Entropy: <span>Rising</span></div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '350px', height: '350px', background: 'radial-gradient(circle, rgba(255, 45, 85, 0.05) 0%, transparent 70%)', borderRadius: '50%' }}></div>
            <svg width="320" height="320" viewBox="0 0 100 100">
               {/* Outer Rings */}
               <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.2" />
               <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
               <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.2" />
               
               {/* Ticks */}
               {[...Array(12)].map((_, i) => {
                 const angle = (i * 30) * Math.PI / 180;
                 const x1 = 50 + 42 * Math.cos(angle);
                 const y1 = 50 + 42 * Math.sin(angle);
                 const x2 = 50 + 45 * Math.cos(angle);
                 const y2 = 50 + 45 * Math.sin(angle);
                 return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
               })}

               {/* Radar Sweep */}
               <circle cx="50" cy="50" r="45" fill="none" stroke="url(#radarGradient)" strokeWidth="2" strokeDasharray="1, 282" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4s" repeatCount="indefinite" />
               </circle>
               <defs>
                 <linearGradient id="radarGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                   <stop offset="0%" stopColor="var(--accent-nuclear)" stopOpacity="1" />
                   <stop offset="100%" stopColor="var(--accent-nuclear)" stopOpacity="0" />
                 </linearGradient>
               </defs>

               {/* Hands */}
               <line x1="50" y1="50" x2="50" y2="15" stroke="var(--accent-nuclear)" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 5px var(--accent-nuclear))' }}>
                  <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="60s" repeatCount="indefinite" />
               </line>
               <line x1="50" y1="50" x2="75" y2="50" stroke="white" strokeWidth="1" strokeLinecap="round" opacity="0.8">
                  <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3600s" repeatCount="indefinite" />
               </line>
               <circle cx="50" cy="50" r="2" fill="white" />
            </svg>
          </div>
        </section>

        <section className="categories-grid">
          <div 
            className={`category-card ${selectedCategory === 'All' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('All')}
          >
            <h3>Global Threat</h3>
            <div className="count">{articles.length}</div>
          </div>
          {categoryKeys.map(catKey => (
            <div 
              key={catKey} 
              className={`category-card ${catKey.toLowerCase()} ${selectedCategory === catKey ? 'active' : ''}`}
              onClick={() => setSelectedCategory(catKey)}
            >
              <h3>{categoryMap[catKey] || catKey}</h3>
              <div className="count">{getCount(catKey)}</div>
            </div>
          ))}
        </section>

        <section className="news-section">
          <div className="news-header">
            <div>
              <div style={{ color: 'var(--accent-nuclear)', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>THREAT FEED</div>
              <h2>{selectedCategory === 'All' ? 'Consolidated' : categoryMap[selectedCategory]} Watch</h2>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 500 }}>
              <span style={{ color: 'var(--text-primary)' }}>{filteredArticles.length}</span> Active Vectors
            </div>
          </div>
          <div className="news-grid">
            {filteredArticles.map((article, idx) => (
              <a key={`${article.title}-${idx}`} href={article.link} target="_blank" rel="noopener noreferrer" className="article-link">
                <div className="article-card">
                  <div className={`article-category ${article.category.toLowerCase()}`}>
                    {categoryMap[article.category] || article.category}
                  </div>
                  <div className="article-title">{article.title}</div>
                  
                  {article.ai_analysis && (
                    <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.75rem' }}>
                      <div style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                        Severity: <span style={{ color: 'var(--text-primary)' }}>{article.ai_analysis.severity}/10</span>
                      </div>
                      <div style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                        Impact: <span style={{ color: 'var(--text-primary)' }}>{article.ai_analysis.score.toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  <div className="article-meta">
                    <span className="article-source">{article.source}</span>
                    <span>{article.date}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      </main>

      <footer style={{ marginTop: '5rem', padding: '2rem 0', borderTop: '1px solid var(--glass-border)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
        &copy; 2026 DOOMSDAY CLOCK TRACKER • DATA SUBJECT TO VOLATILITY
      </footer>

      {/* Explanation Panel */}
      <div className={`explanation-panel ${showExplanation ? 'open' : ''}`}>
        <div className="explanation-header">
          <h2>Risk Analysis</h2>
          <button className="close-btn" onClick={() => setShowExplanation(false)}>&times;</button>
        </div>
        
        <div className="explanation-content">
          <div className="explanation-block">
            <h3>Why the clock moved today</h3>
            <p>{currentStatus.reason}</p>
          </div>

          <div className="explanation-block">
            <h3>Category Contributions</h3>
            <div className="contribution-list">
              {categoryContributions.map(cat => (
                <div key={cat.key} className="contribution-item">
                  <div className="contribution-label">
                    <span>{cat.label}</span>
                    <span>{Math.round((Math.abs(cat.score) / (totalImpact || 1)) * 100)}%</span>
                  </div>
                  <div className="contribution-bar-bg">
                    <div 
                      className={`contribution-bar-fill ${cat.key}`} 
                      style={{ width: `${(Math.abs(cat.score) / (totalImpact || 1)) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="explanation-block">
            <h3>Top 5 Impactful News</h3>
            <div className="top-news-list">
              {topImpactfulNews.map((article, i) => (
                <a key={i} href={article.link} target="_blank" rel="noopener noreferrer" className="top-news-item">
                  <div className="news-rank">#{i+1}</div>
                  <div className="news-info">
                    <div className="news-title">{article.title}</div>
                    <div className="news-score">Impact: {article.ai_analysis.score.toFixed(2)}</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
