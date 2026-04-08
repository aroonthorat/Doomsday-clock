import React, { useState, useEffect } from 'react';
import newsData from './data/news.json';
import clockStatus from './data/clockStatus.json';

const App = () => {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [timeLeft, setTimeLeft] = useState(clockStatus.secondsToMidnight);
  const [articles, setArticles] = useState(newsData.articles);

  // Sync with clockStatus
  useEffect(() => {
    setTimeLeft(clockStatus.secondsToMidnight);
  }, [clockStatus.secondsToMidnight]);

  // Countdown logic
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const categories = ['Nuclear', 'Climate', 'AI', 'Pandemic', 'Economy'];
  
  const getCount = (cat) => articles.filter(a => a.category === cat).length;

  const filteredArticles = selectedCategory === 'All' 
    ? articles 
    : articles.filter(a => a.category === selectedCategory);

  return (
    <div className="container">
      <div className="bg-glow">
        <div className="glow-orb" style={{ top: '10%', right: '10%' }}></div>
        <div className="glow-orb" style={{ bottom: '20%', left: '5%', background: 'radial-gradient(circle, rgba(0, 210, 255, 0.05) 0%, transparent 70%)' }}></div>
      </div>

      <header>
        <div className="brand">Doomsday<span>Clock</span></div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          LAST SYNC: {new Date(clockStatus.lastUpdated).toLocaleString()}
        </div>
      </header>

      <main>
        <section className="clock-section">
          <div className="clock-telemetry">
            <div className="clock-status-tag">Status: Critical</div>
            <h1>The World is Currently at</h1>
            <div className="clock-timer">{formatTime(timeLeft)}</div>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '400px' }}>
              {clockStatus.reason}
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {/* Visual Clock Representation could go here */}
            <svg width="300" height="300" viewBox="0 0 100 100">
               <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
               <line x1="50" y1="50" x2="50" y2="15" stroke="var(--accent-nuclear)" strokeWidth="2" strokeLinecap="round">
                  <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="60s" repeatCount="indefinite" />
               </line>
               <line x1="50" y1="50" x2="80" y2="50" stroke="white" strokeWidth="1" strokeLinecap="round" />
            </svg>
          </div>
        </section>

        <section className="categories-grid">
          <div 
            className={`category-card ${selectedCategory === 'All' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('All')}
          >
            <h3>Global Risk</h3>
            <div className="count">{articles.length}</div>
          </div>
          {categories.map(cat => (
            <div 
              key={cat} 
              className={`category-card ${cat.toLowerCase()} ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              <h3>{cat}</h3>
              <div className="count">{getCount(cat)}</div>
            </div>
          ))}
        </section>

        <section className="news-section">
          <div className="news-header">
            <h2>{selectedCategory} Watchlist</h2>
            <div style={{ color: 'var(--text-secondary)' }}>Showing {filteredArticles.length} active threats</div>
          </div>
          <div className="news-grid">
            {filteredArticles.map(article => (
              <a key={article.id} href={article.link} target="_blank" rel="noopener noreferrer" className="article-link">
                <div className="article-card">
                  <div className="article-category" style={{ color: `var(--accent-${article.category.toLowerCase()})` }}>{article.category}</div>
                  <div className="article-title">{article.title}</div>
                  <div className="article-meta">
                    <span>{article.source}</span>
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
    </div>
  );
};

export default App;
