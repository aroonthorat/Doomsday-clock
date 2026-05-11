const CATEGORY_WEIGHTS = {
  nuclear: 0.35,
  climate: 0.25,
  ai: 0.15,
  pandemic: 0.15,
  economy: 0.10
};

const CATEGORIES = {
  nuclear: {
    query: '(nuclear OR ICBM OR "nuclear weapon" OR "nuclear plant" OR "arms control" OR "missile test")',
    negative: ['nuclear strike', 'missile strike', 'icbm', 'nuclear weapon', 'arms race', 'radiation leak'],
    positive: ['arms control', 'treaty', 'de-escalation', 'inspections', 'disarmament']
  },
  climate: {
    query: '("climate change" OR "global warming" OR wildfire OR flood OR drought OR hurricane OR "extreme weather")',
    negative: ['record heat', 'wildfire', 'flood', 'drought', 'hurricane', 'food insecurity'],
    positive: ['emissions cut', 'clean energy', 'climate agreement', 'adaptation funding']
  },
  ai: {
    query: '("artificial intelligence" OR "AI safety" OR "machine learning" OR OpenAI OR "AI regulation" OR "autonomous weapons")',
    negative: ['autonomous weapons', 'deepfake', 'cyberattack', 'model leak', 'loss of control'],
    positive: ['safety standard', 'ai regulation', 'alignment', 'evaluation', 'guardrails']
  },
  pandemic: {
    query: '(pandemic OR outbreak OR epidemic OR "infectious disease" OR "avian flu" OR "public health emergency")',
    negative: ['pandemic', 'outbreak', 'epidemic', 'avian flu', 'public health emergency'],
    positive: ['vaccine', 'contained', 'treatment', 'preparedness', 'surveillance']
  },
  economy: {
    query: '(recession OR inflation OR "global economy" OR "financial crisis" OR sanctions OR "food insecurity")',
    negative: ['recession', 'inflation', 'financial crisis', 'market crash', 'debt crisis', 'sanctions'],
    positive: ['recovery', 'stabilizes', 'rate cut', 'growth', 'agreement']
  }
};

const DEFAULT_LIMIT = Number(process.env.REFRESH_PER_CATEGORY_LIMIT ?? 12);
const COOLDOWN_MINUTES = Number(process.env.PUBLIC_REFRESH_COOLDOWN_MINUTES ?? 20);
const GDELT_TIMESPAN = process.env.GDELT_TIMESPAN ?? '24h';
const NEGATIONS = ['denies', 'not planning', 'no evidence', 'false', 'hoax', 'rejects', 'rules out'];
const TRUSTED_SOURCES = ['reuters', 'apnews.com', 'bbc', 'npr.org', 'theguardian.com', 'politico', 'ft.com'];

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function gdeltDateToIso(seendate) {
  const match = String(seendate ?? '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return new Date().toISOString();
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

function scoreArticle(article, category) {
  const profile = CATEGORIES[category];
  const text = `${article.title ?? ''} ${article.description ?? ''}`.toLowerCase();
  const negated = NEGATIONS.some(term => text.includes(term));
  const threatMatches = profile.negative.filter(term => text.includes(term));
  const positiveMatches = profile.positive.filter(term => text.includes(term));
  const threatSignal = Math.max(0, threatMatches.length * (negated ? 0.3 : 0.75));
  const positiveSignal = positiveMatches.length * 0.35;
  const sourceText = `${article.sourceCommonName ?? ''} ${article.domain ?? ''}`.toLowerCase();
  const credibility = TRUSTED_SOURCES.some(source => sourceText.includes(source)) ? 0.95 : 0.8;
  const polarity = Math.max(-1, Math.min(1, positiveSignal - threatSignal));
  const severity = Math.max(1, Math.min(10, 3 + Math.ceil(threatSignal * 3) - Math.floor(positiveSignal)));
  const score = Number((polarity * severity * credibility * CATEGORY_WEIGHTS[category] * (polarity < 0 ? 1.15 : 1)).toFixed(4));

  return {
    polarity: Number(polarity.toFixed(2)),
    severity,
    credibility: `${Math.round(credibility * 100)}%`,
    score
  };
}

async function fetchCategory(category, limit, seen) {
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', `${CATEGORIES[category].query} sourcelang:english`);
  url.searchParams.set('mode', 'ArtList');
  url.searchParams.set('format', 'json');
  url.searchParams.set('sort', 'HybridRel');
  url.searchParams.set('maxrecords', String(Math.min(250, Math.max(10, limit))));
  url.searchParams.set('timespan', GDELT_TIMESPAN);

  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`GDELT HTTP ${response.status}`);

  const data = await response.json();
  const accepted = [];

  for (const article of data.articles ?? []) {
    const link = article.url;
    const title = article.title;
    if (!title || !link) continue;

    const key = link.split('?')[0].replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const analysis = scoreArticle(article, category);
    accepted.push({
      title,
      source: article.sourceCommonName || article.domain || 'GDELT',
      published_at: gdeltDateToIso(article.seendate),
      category,
      url: link,
      polarity: analysis.polarity,
      severity: analysis.severity,
      credibility: analysis.credibility,
      score: analysis.score
    });

    if (accepted.length >= limit) break;
  }

  return accepted;
}

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${response.status}: ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function getLatestClockStatus() {
  const rows = await supabaseRequest('clock_status?select=seconds_to_midnight,created_at&order=created_at.desc&limit=1');
  return rows?.[0] ?? null;
}

function shouldSkipForCooldown(latestStatus, force) {
  if (force || !latestStatus?.created_at) return false;
  const ageMinutes = (Date.now() - new Date(latestStatus.created_at).getTime()) / 60000;
  return Number.isFinite(ageMinutes) && ageMinutes < COOLDOWN_MINUTES;
}

async function refreshNews({ force = false } = {}) {
  const latestStatus = await getLatestClockStatus();
  if (shouldSkipForCooldown(latestStatus, force)) {
    return { skipped: true, reason: `Recently refreshed. Public refresh cooldown is ${COOLDOWN_MINUTES} minutes.` };
  }

  const seen = new Set();
  const rows = [];

  for (const category of Object.keys(CATEGORIES)) {
    rows.push(...await fetchCategory(category, DEFAULT_LIMIT, seen));
  }

  if (rows.length === 0) {
    throw new Error('No articles returned from GDELT; refusing to update Supabase with empty data.');
  }

  await supabaseRequest('news_articles?on_conflict=url', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows)
  });

  const categoryScores = Object.keys(CATEGORIES).map(category => {
    const categoryRows = rows.filter(row => row.category === category);
    const avg = categoryRows.reduce((sum, row) => sum + row.score, 0) / Math.max(1, categoryRows.length);
    return { category, avg };
  });
  const globalScore = categoryScores.reduce((sum, item) => sum + item.avg, 0);
  const delta = Math.max(-10, Math.min(10, (globalScore / 4) * 10));
  const previousSeconds = Number(latestStatus?.seconds_to_midnight ?? 85);
  const secondsToMidnight = Math.max(10, Math.min(600, Number((previousSeconds + delta).toFixed(2))));

  await supabaseRequest('clock_status', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      seconds_to_midnight: secondsToMidnight,
      reason: globalScore < -0.75
        ? 'Visitor-triggered refresh found elevated global risk in current news.'
        : 'Visitor-triggered refresh completed; global risk indicators remain mixed.'
    })
  });

  return {
    skipped: false,
    articles: rows.length,
    secondsToMidnight,
    globalScore: Number(globalScore.toFixed(4)),
    categories: categoryScores.map(item => ({ ...item, avg: Number(item.avg.toFixed(4)) }))
  };
}

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return sendJson(response, 405, { error: 'Method not allowed' });
  }

  try {
    const force = request.query?.force === '1' || request.headers['x-refresh-force'] === '1';
    const result = await refreshNews({ force });
    return sendJson(response, 200, { ok: true, ...result, refreshedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Refresh failed:', error);
    return sendJson(response, 500, { ok: false, error: error.message });
  }
}
