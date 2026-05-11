import React, { useState, useEffect, useMemo } from 'react';
import './index.css';
import { supabase } from './supabaseClient';
import baselineClock from './data/baselineClock.json';

const TREND_DATA = [
  { date: '04/02', seconds: 120 },
  { date: '04/03', seconds: 95 },
  { date: '04/04', seconds: 110 },
  { date: '04/05', seconds: 82 },
  { date: '04/06', seconds: 135 },
  { date: '04/07', seconds: 90 },
  { date: '04/08', seconds: 71 },
];

const TrendGraph = ({ data }) => {
  const width = 1000;
  const height = 150;
  const padding = 40;

  const minVal = Math.min(...data.map(d => d.seconds));
  const maxVal = Math.max(...data.map(d => d.seconds));

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * (width - padding * 2) + padding,
    y: height - ((d.seconds - minVal) / (maxVal - minVal)) * (height - padding * 2) - padding,
    val: d.seconds,
    date: d.date,
    isDanger: d.seconds === minVal,
    isSafe: d.seconds === maxVal
  }));

  const pathData = points.reduce((acc, p, i) => 
    i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, ''
  );

  const areaData = `${pathData} L ${points[points.length-1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <div className="trend-container">
      <div className="trend-header">
        <h3>7-Day Risk Trend</h3>
        <p>Movement in seconds to midnight</p>
      </div>
      <div className="trend-viz">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--neon-cyan)" />
              <stop offset="100%" stopColor="var(--accent-nuclear)" />
            </linearGradient>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0, 242, 255, 0.1)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          
          <path d={areaData} fill="url(#areaGradient)" />
          <path d={pathData} fill="none" stroke="url(#lineGradient)" strokeWidth="3" strokeLinecap="round" className="trend-path" />
          
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="var(--bg-card)" stroke="white" strokeWidth="2" />
              {(p.isDanger || p.isSafe) && (
                <g>
                  <circle cx={p.x} cy={p.y} r="10" fill={p.isDanger ? 'var(--accent-nuclear)' : 'var(--accent-tech)'} opacity="0.2" className="pulse-marker" />
                  <text x={p.x} y={p.y - 15} textAnchor="middle" className={`marker-label ${p.isDanger ? 'danger' : 'safe'}`}>
                    {p.isDanger ? 'MAX RISK' : 'STABLE'}
                  </text>
                </g>
              )}
              <text x={p.x} y={height - 5} textAnchor="middle" className="axis-label">{p.date}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

const CONFIG_ERROR = !supabase;
const CATEGORY_LABELS = {
  'nuclear': 'Nuclear',
  'climate': 'Climate',
  'ai': 'Artificial Intelligence',
  'disruptive_tech': 'Disruptive Tech',
  'fragile_state': 'Fragile States',
  'pandemic': 'Pandemic',
  'other': 'Other'
};


function App() {
  const [timeLeft, setTimeLeft] = useState(90);
  const [syncData, setSyncData] = useState({ 
    seconds: 90, 
    timestamp: Date.now() 
  });
  const [articles, setArticles] = useState([]);
  const [currentStatus, setCurrentStatus] = useState({ 
    secondsToMidnight: 90, 
    lastUpdated: new Date().toISOString(), 
    reason: 'Authenticating with Command Center...' 
  });
  const [loading, setLoading] = useState(true);
  const [dailyChange, setDailyChange] = useState(0);
  const [isCrisisActive, setIsCrisisActive] = useState(false);
  const [crisisReason, setCrisisReason] = useState("No active emergency override");

  const [isGlowActive, setIsGlowActive] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showExplanation, setShowExplanation] = useState(false);
  const [refreshState, setRefreshState] = useState({ status: 'idle', message: 'Auto refresh ready' });

  // Emergency Crisis States
  const [emergencyOffset, setEmergencyOffset] = useState(0);
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [showEmergencyAlert, setShowEmergencyAlert] = useState(false);
  const [lastEmergencyTime, setLastEmergencyTime] = useState(0);

  // Global Risk Calculation System
  const globalRiskScore = Math.max(0, Math.min(100, 100 - (timeLeft / 20))); // Scaled for dashboard visual
  const riskStatus = useMemo(() => {
    if (globalRiskScore > 75) return { label: 'CRITICAL', color: 'var(--accent-nuclear)' };
    if (globalRiskScore > 40) return { label: 'ELEVATED', color: 'var(--accent-fragile)' };
    return { label: 'STABLE', color: 'var(--accent-tech)' };
  }, [globalRiskScore]);

  useEffect(() => {
    if (CONFIG_ERROR) return;

    fetchData().then(() => maybeAutoRefreshOnVisit());
    
    // Subscribe to real-time updates
    const statusSubscription = supabase
      .channel('public:clock_status')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clock_status' }, payload => {
        const serverTime = new Date(payload.new.created_at).getTime();
        setSyncData({ 
          seconds: payload.new.seconds_to_midnight, 
          timestamp: serverTime 
        });
        setCurrentStatus(payload.new);
        fetchStatus(); // Re-fetch to update daily change
      })
      .subscribe();

    const newsSubscription = supabase
      .channel('public:news_articles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'news_articles' }, () => {
        fetchArticles();
      })
      .subscribe();

    return () => {
      if (statusSubscription) supabase.removeChannel(statusSubscription);
      if (newsSubscription) supabase.removeChannel(newsSubscription);
    };
  }, []);

  // Emergency Trigger Listener - only animate verified crisis rows, never random visitor jumps.
  useEffect(() => {
    if (isCrisisActive && Date.now() - lastEmergencyTime > 60000) {
      setEmergencyOffset(prev => prev + 10);
      setIsEmergencyActive(true);
      setShowEmergencyAlert(true);
      setLastEmergencyTime(Date.now());

      setTimeout(() => setIsEmergencyActive(false), 2000);
      setTimeout(() => setShowEmergencyAlert(false), 5000);
    }
  }, [isCrisisActive]);

  async function fetchData() {
    if (CONFIG_ERROR) return;
    setLoading(true);
    await Promise.all([fetchStatus(), fetchArticles()]);
    setLoading(false);
  }

  async function requestFreshData({ automatic = false } = {}) {
    if (CONFIG_ERROR || refreshState.status === 'loading') return;

    setRefreshState({
      status: 'loading',
      message: automatic ? 'Auto-refreshing public data...' : 'Requesting latest news pull...'
    });

    try {
      const response = await fetch('/api/refresh-news', { method: 'POST' });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Refresh failed');
      }

      localStorage.setItem('doomsday_last_public_refresh', Date.now().toString());
      await fetchData();

      setRefreshState({
        status: result.skipped ? 'skipped' : 'success',
        message: result.skipped
          ? result.reason
          : `Updated ${result.articles} live articles and recalculated the clock.`
      });
    } catch (error) {
      setRefreshState({
        status: 'error',
        message: error.message || 'Unable to refresh data right now.'
      });
    }
  }

  function maybeAutoRefreshOnVisit() {
    const lastRefresh = Number(localStorage.getItem('doomsday_last_public_refresh') || 0);
    const minutesSinceRefresh = (Date.now() - lastRefresh) / 60000;

    if (!lastRefresh || minutesSinceRefresh > 30) {
      window.setTimeout(() => requestFreshData({ automatic: true }), 1200);
    }
  }

  async function fetchStatus() {
    const { data, error } = await supabase
      .from('clock_status')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (data) {
      setCurrentStatus(data);
      const emergencyReason = data.reason || '';
      const activeEmergency = emergencyReason.toLowerCase().includes('emergency trigger');
      setIsCrisisActive(activeEmergency);
      setCrisisReason(activeEmergency ? emergencyReason : 'No active emergency override');
      const serverTime = new Date(data.created_at).getTime();
      setSyncData({ 
        seconds: data.seconds_to_midnight, 
        timestamp: serverTime 
      });

      // Fetch status from 24h ago
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: pastData } = await supabase
        .from('clock_status')
        .select('seconds_to_midnight')
        .lt('created_at', yesterday)
        .order('created_at', { ascending: false })
        .limit(1);

      let prevSeconds = data.seconds_to_midnight;
      if (pastData && pastData.length > 0) {
        prevSeconds = pastData[0].seconds_to_midnight;
      } else {
        // Fallback: earliest record
        const { data: firstData } = await supabase
          .from('clock_status')
          .select('seconds_to_midnight')
          .order('created_at', { ascending: true })
          .limit(1);
        if (firstData && firstData.length > 0) prevSeconds = firstData[0].seconds_to_midnight;
      }

      const delta = data.seconds_to_midnight - prevSeconds;
      if (delta !== dailyChange) {
        setDailyChange(delta);
        setIsGlowActive(true);
        setTimeout(() => setIsGlowActive(false), 1500);
      }
    }
  }

  async function fetchArticles() {
    const { data, error } = await supabase
      .from('news_articles')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) {
      // Map Supabase snake_case to app structure if necessary
      const mapped = data.map(a => ({
        ...a,
        ai_analysis: {
          polarity: a.polarity,
          severity: a.severity,
          credibility: a.credibility,
          score: a.score
        }
      }));
      setArticles(mapped);
    }
  }

  const categoryMap = CATEGORY_LABELS;

  // Top 5 IMPACTFUL articles (most negative score)
  const topImpactfulNews = [...articles]
    .filter(a => a.ai_analysis)
    .sort((a, b) => (a.ai_analysis.score || 0) - (b.ai_analysis.score || 0))
    .slice(0, 5);

  // Category Contributions
  const categoryContributions = Object.keys(categoryMap).map(catKey => {
    const catArticles = articles.filter(a => a.category === catKey);
    const avgScore = catArticles.length > 0
      ? catArticles.reduce((acc, curr) => acc + (curr.ai_analysis?.score || 0), 0) / catArticles.length
      : 0;
    return {
      key: catKey,
      label: categoryMap[catKey],
      score: avgScore,
      count: catArticles.length
    };
  }).sort((a, b) => a.score - b.score);

  const totalImpact = categoryContributions.reduce((acc, curr) => acc + Math.abs(curr.score), 0);

  // Calculate Data Confidence System
  const confidenceScore = useMemo(() => {
    if (articles.length === 0) return 0;
    
    const validArticles = articles.filter(a => a.ai_analysis && a.ai_analysis.credibility);
    if (validArticles.length === 0) return 50;

    const avgCredibility = validArticles.reduce((acc, a) => {
      const credStr = a.ai_analysis.credibility.toString();
      const num = parseInt(credStr.replace(/[^0-9]/g, '')) || 85;
      return acc + num;
    }, 0) / validArticles.length;

    // Weight: 70% Quality (Credibility), 30% Quantity (Volume)
    const volumeFactor = Math.min(1, articles.length / 50); // 50 articles for max volume bonus
    const finalScore = (avgCredibility * 0.7) + (volumeFactor * 30);
    
    return Math.round(Math.min(99, finalScore));
  }, [articles]);

  // Risk Category Breakdown Data derived from analyzed articles. Negative article scores mean higher risk.
  const riskCategories = ['nuclear', 'climate', 'ai', 'pandemic', 'economy'].map(key => {
    const contribution = categoryContributions.find(cat => cat.key === key);
    const riskScore = Math.max(0, Math.min(100, 50 - ((contribution?.score || 0) * 18)));
    const colorMap = {
      nuclear: 'var(--accent-nuclear)',
      climate: 'var(--accent-climate)',
      ai: 'var(--accent-ai)',
      pandemic: 'var(--accent-pandemic)',
      economy: 'var(--accent-economy)'
    };

    return {
      label: categoryMap[key] || key,
      score: Math.round(riskScore),
      color: colorMap[key],
      key
    };
  });

  const baselineDifference = Math.round(timeLeft - baselineClock.currentOfficial.secondsToMidnight);
  const worstHumanityDays = [...baselineClock.badHumanityDays].sort((a, b) => b.points - a.points);

  const getRiskLevelClass = (score) => {
    if (score >= 70) return 'risk-high';
    if (score >= 40) return 'risk-med';
    return 'risk-low';
  };

  // Continuous Real-Time Engine
  useEffect(() => {
    const ticker = setInterval(() => {
      const elapsed = (Date.now() - syncData.timestamp) / 1000;
      const current = Math.max(0, syncData.seconds - elapsed - emergencyOffset);
      setTimeLeft(current);
    }, 100);
    return () => clearInterval(ticker);
  }, [syncData]);

  // Update localStorage every second
  useEffect(() => {
    localStorage.setItem('doomsday_clock_time', timeLeft.toString());
    localStorage.setItem('doomsday_clock_timestamp', Date.now().toString());
  }, [timeLeft]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const categoryKeys = Object.keys(categoryMap);
  
  const getCount = (catKey) => articles.filter(a => a.category === catKey).length;

  const filteredArticles = selectedCategory === 'All' 
    ? articles 
    : articles.filter(a => a.category === selectedCategory);
  const divergenceFactors = [
    { id: 1, category: 'Nuclear', impact: -12, text: 'Increased readiness in regional missile silos detected by satellite telemetry.' },
    { id: 2, category: 'Climate', impact: 5, text: 'Global reforestation treaty signed by 140 nations showing promise for carbon capture.' },
    { id: 3, category: 'AI', impact: -8, text: 'Deployment of offensive autonomous cyber-units by non-state actors in Europe.' },
    { id: 4, category: 'Geo-Political', impact: -4, text: 'Diplomatic breakdown in the Arctic over resource extraction rights.' }
  ];

  if (CONFIG_ERROR) {
    return (
      <div className="container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', textAlign: 'center', padding: '2rem' }}>
        <div className="brand" style={{ marginBottom: '2rem' }}>DOOMSDAY<span>CLOCK</span></div>
        <div style={{ background: 'rgba(255, 45, 85, 0.1)', border: '1px solid var(--accent-nuclear)', padding: '2rem', borderRadius: '12px', maxWidth: '600px' }}>
          <h2 style={{ color: 'var(--accent-nuclear)', marginBottom: '1rem' }}>CONFIGURATION ERROR</h2>
          <p style={{ color: 'var(--text-primary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            The application is missing required environment variables to connect to the Global Risk Database.
          </p>
          <div style={{ textAlign: 'left', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', fontSize: '0.9rem', fontFamily: 'monospace' }}>
            <div style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>// Required Variables:</div>
            <div style={{ color: '#fff' }}>VITE_SUPABASE_URL</div>
            <div style={{ color: '#fff' }}>VITE_SUPABASE_ANON_KEY</div>
          </div>
          <p style={{ marginTop: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Please add these to your Vercel project settings and redeploy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`container ${isCrisisActive ? 'crisis-active' : ''}`}>
      {loading && (
        <div className="loading-overlay">
          <div className="loader"></div>
          <div style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', letterSpacing: '2px' }}>
            INITIALIZING SECURE LINK...
          </div>
        </div>
      )}

      <div className="bg-glow">
        <div className="glow-orb" style={{ top: '10%', left: '20%' }}></div>
        <div className="glow-orb" style={{ bottom: '10%', right: '20%', background: 'radial-gradient(circle, rgba(112, 0, 255, 0.05) 0%, transparent 70%)' }}></div>
      </div>

      {isEmergencyActive && <div className="emergency-flash-overlay" />}
      {showEmergencyAlert && (
        <div className="emergency-alert-banner">
          ⚠️ Emergency Adjustment Applied
        </div>
      )}

      {isCrisisActive && (
        <div className="crisis-banner">
          <div className="crisis-banner-content">
            <span className="crisis-icon">🚨</span>
            <span className="crisis-label">Crisis Detected:</span>
            <span className="crisis-reason">{crisisReason}</span>
          </div>
        </div>
      )}

      <TrendGraph data={TREND_DATA} />

      <header>
        <div className="brand">DOOMSDAY<span>CLOCK</span></div>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <button className="explanation-toggle" onClick={() => setShowExplanation(true)}>
            WHY IS IT MOVING?
          </button>
          <button
            className={`refresh-button ${refreshState.status}`}
            onClick={() => requestFreshData()}
            disabled={refreshState.status === 'loading'}
          >
            {refreshState.status === 'loading' ? 'REFRESHING...' : 'REFRESH LIVE DATA'}
          </button>
          <div className="status-badge">
            COMMAND CENTER LIVE
            <div className="status-dot"></div>
            <span style={{ marginLeft: '1rem', opacity: 0.6 }}>
              SYNC: {new Date(currentStatus?.lastUpdated || currentStatus?.created_at || Date.now()).toLocaleTimeString()}
            </span>
          </div>
        </div>
      </header>

      <main>
        <section className="clock-section">
          <div className="clock-telemetry">
            <div className="clock-status-tag">Live Risk Assessment</div>
            <h1>The World is at</h1>
            <div 
              key={`${Math.floor(timeLeft)}-${isEmergencyActive}`} 
              className={`clock-timer ticking ${isEmergencyActive ? 'crisis-jump' : ''}`}
            >
              {formatTime(timeLeft)}
            </div>
            
            <div className="confidence-system">
              <div className="confidence-header">
                <span className="confidence-label">Confidence: {confidenceScore}%</span>
                <div className="confidence-meter">
                  <div className="confidence-fill" style={{ width: `${confidenceScore}%` }}></div>
                </div>
              </div>
              <span className="confidence-tag">Based on analyzed global news</span>
            </div>

            <div className="risk-dashboard-widget">
              <div className="risk-stat-card">
                <span className="risk-stat-label">Global Risk Score</span>
                <span className="risk-stat-value" style={{ color: riskStatus.color }}>
                  {globalRiskScore.toFixed(1)}
                </span>
                <div className="risk-stat-footer">
                  <span className="status-dot" style={{ backgroundColor: riskStatus.color }}></span>
                  <span style={{ color: riskStatus.color }}>{riskStatus.label}</span>
                </div>
              </div>

              <div className="risk-stat-card">
                <span className="risk-stat-label">Net Impact Today</span>
                <span className="risk-stat-value">
                  {dailyChange > 0 ? '+' : ''}{dailyChange.toFixed(1)}s
                </span>
                <div className="risk-stat-footer">
                   <span className={`impact-badge ${dailyChange >= 0 ? 'positive' : 'negative'}`}>
                    {dailyChange >= 0 ? '↑ BUFFER' : '↓ DRIFT'}
                  </span>
                </div>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, maxWidth: '500px' }}>
              {currentStatus.reason}
            </p>

            <div className="ai-meta">
              <div className="ai-chip">Reliability: <span>High</span></div>
              <div className="ai-chip">Sources: <span>Verified</span></div>
              <div className="ai-chip">Entropy: <span>Rising</span></div>
            </div>
            <div className={`refresh-status ${refreshState.status}`}>{refreshState.message}</div>

            <div className="baseline-panel">
              <div className="panel-header">
                <h3>Official Doomsday Clock Baseline</h3>
                <span className="panel-date">{baselineClock.currentOfficial.year}</span>
              </div>
              <div className="baseline-grid">
                <div className="baseline-primary">
                  <span className="baseline-value">{baselineClock.currentOfficial.label}</span>
                  <a className="baseline-source" href={baselineClock.officialSourceUrl} target="_blank" rel="noopener noreferrer">{baselineClock.officialSource}</a>
                </div>
                <div className="baseline-delta">
                  <span className={baselineDifference >= 0 ? 'positive' : 'negative'}>
                    {baselineDifference >= 0 ? '+' : ''}{baselineDifference}s
                  </span>
                  <small>live model vs official baseline</small>
                </div>
              </div>
              <p>{baselineClock.currentOfficial.note}</p>
            </div>

            <div className="divergence-panel">
              <div className="panel-header">
                <h3>Today's Divergence Factors</h3>
                <span className="panel-date">{new Date().toLocaleDateString()}</span>
              </div>
              <div className="factor-list">
                {divergenceFactors.map(factor => (
                  <div key={factor.id} className="factor-item">
                    <div className="factor-meta">
                      <span className={`factor-category ${factor.category.toLowerCase().replace(' ', '-')}`}>
                        {factor.category}
                      </span>
                      <span className={`factor-impact ${factor.impact < 0 ? 'negative' : 'positive'}`}>
                        {factor.impact > 0 ? '+' : ''}{factor.impact}s
                      </span>
                    </div>
                    <p className="factor-explanation">{factor.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="impact-events-panel">
              <div className="panel-header">
                <h3>Top Impact Events</h3>
                <span className="panel-badge">REAL-TIME DATA</span>
              </div>
              <div className="impact-list">
                {topImpactfulNews.map((event, index) => (
                  <div key={`${event.title}-${index}`} className="impact-item">
                    <div className="impact-info">
                      <span className="impact-title">{event.title}</span>
                      <span className={`impact-category-chip ${event.category}`}>
                        {categoryMap[event.category] || event.category}
                      </span>
                    </div>
                    <div className={`impact-score-box ${(event.ai_analysis?.score || 0) < 0 ? 'negative' : 'positive'}`}>
                      {(event.ai_analysis?.score || 0).toFixed(2)} pts
                    </div>
                  </div>
                ))}
              </div>
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
               <line 
                 x1="50" y1="50" x2="50" y2="15" 
                 stroke="var(--accent-nuclear)" strokeWidth="1.5" strokeLinecap="round" 
                 style={{ 
                   filter: 'drop-shadow(0 0 5px var(--accent-nuclear))',
                   transformOrigin: '50px 50px',
                   transform: `rotate(${-timeLeft * 6}deg)`,
                   transition: 'transform 0.1s linear'
                 }} 
               />
               <line 
                 x1="50" y1="50" x2="50" y2="25" 
                 stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.9"
                 style={{ 
                   transformOrigin: '50px 50px',
                   transform: `rotate(${-timeLeft / 10}deg)`,
                   transition: 'transform 0.1s linear'
                 }} 
               />
                <circle cx="50" cy="50" r="2" fill="white" />
             </svg>
          </div>
        </section>

        <section className="risk-breakdown">
          <div className="section-label">Critical Domain Analysis</div>
          <div className="risk-grid">
            {riskCategories.map((cat) => (
              <div key={cat.label} className={`risk-card ${getRiskLevelClass(cat.score)}`}>
                <div className="risk-card-header">
                  <span className="risk-label">{cat.label}</span>
                  <span className="risk-score">{cat.score}</span>
                </div>
                <div className="risk-bar-bg">
                  <div 
                    className="risk-bar-fill" 
                    style={{ 
                      width: `${cat.score}%`,
                      backgroundColor: cat.color,
                      boxShadow: `0 0 10px ${cat.color}44`
                    }}
                  ></div>
                </div>
                <div className="risk-status">
                  {cat.score >= 70 ? 'HIGH ALERT' : cat.score >= 40 ? 'ELEVATED' : 'STABLE'}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="humanity-calendar">
          <div className="section-label">Calendar Risk Memory</div>
          <div className="calendar-layout">
            <div className="official-timeline">
              <h3>Official Clock Baseline Timeline</h3>
              <div className="timeline-list">
                {baselineClock.timeline.slice(-6).map(item => (
                  <div key={item.year} className="timeline-row">
                    <span className="timeline-year">{item.year}</span>
                    <span className="timeline-seconds">{item.label}</span>
                    <span className="timeline-context">{item.context}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bad-days">
              <h3>Bad Days for Humanity</h3>
              <div className="bad-day-list">
                {worstHumanityDays.map(day => (
                  <div key={day.date} className="bad-day-card">
                    <div className="bad-day-score">{day.points}</div>
                    <div className="bad-day-content">
                      <div className="bad-day-meta">
                        <span>{new Date(`${day.date}T00:00:00Z`).toLocaleDateString()}</span>
                        <span>{day.category}</span>
                      </div>
                      <h4>{day.title}</h4>
                      <p>{day.summary}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                        Impact: <span style={{ color: 'var(--text-primary)' }}>{(article.ai_analysis?.score || 0).toFixed(2)}</span>
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
                    <div className="news-score">Impact: {(article.ai_analysis?.score || 0).toFixed(2)}</div>
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
