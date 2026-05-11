import fs from 'node:fs';
import path from 'node:path';

/**
 * Data ingestion for the Global Risk Clock.
 *
 * Default provider: GDELT 2.1 Doc API (free, keyless, near-real-time).
 * Optional provider: NewsData.io when NEWS_PROVIDER=newsdata or hybrid and
 * NEWSDATA_API_KEY is configured. Hybrid mode uses GDELT first and fills gaps
 * with NewsData so the paid/free quota is not the bottleneck.
 */

const API_KEY = process.env.NEWSDATA_API_KEY;
const DATA_FILE = path.join(process.cwd(), 'src/data/news.json');
const CACHE_HOURS = Number(process.env.NEWS_CACHE_HOURS ?? 3);
const PROVIDER = (process.env.NEWS_PROVIDER ?? 'gdelt').toLowerCase();
const FORCE_REFRESH = process.env.FORCE_NEWS_REFRESH === '1';
const PER_CATEGORY_LIMIT = Number(process.env.NEWS_PER_CATEGORY_LIMIT ?? 50);
const GDELT_TIMESPAN = process.env.GDELT_TIMESPAN ?? '24h';

const categories = {
  nuclear: {
    gdeltQuery: '(nuclear OR ICBM OR "nuclear weapon" OR "nuclear plant" OR "arms control" OR "missile test")',
    newsDataQuery: 'nuclear OR "atomic energy" OR "nuclear weapons" OR ICBM OR "missile test"',
    newsDataCategory: 'science,politics'
  },
  climate: {
    gdeltQuery: '("climate change" OR "global warming" OR wildfire OR flood OR drought OR hurricane OR "extreme weather")',
    newsDataQuery: '"climate change" OR "global warming" OR wildfire OR flood OR drought OR hurricane',
    newsDataCategory: 'environment'
  },
  ai: {
    gdeltQuery: '("artificial intelligence" OR "AI safety" OR "machine learning" OR OpenAI OR "AI regulation" OR "autonomous weapons")',
    newsDataQuery: '"artificial intelligence" OR "AI safety" OR "machine learning" OR OpenAI OR "AI regulation"',
    newsDataCategory: 'technology'
  },
  pandemic: {
    gdeltQuery: '(pandemic OR outbreak OR epidemic OR "infectious disease" OR "avian flu" OR "public health emergency")',
    newsDataQuery: 'pandemic OR "infectious disease" OR outbreak OR epidemic OR "avian flu"',
    newsDataCategory: 'health'
  },
  economy: {
    gdeltQuery: '(recession OR inflation OR "global economy" OR "financial crisis" OR sanctions OR "food insecurity")',
    newsDataQuery: 'recession OR inflation OR "global economy" OR "financial crisis" OR sanctions',
    newsDataCategory: 'business'
  }
};

function readExistingData() {
  if (!fs.existsSync(DATA_FILE)) return null;

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function shouldUseCache() {
  if (FORCE_REFRESH || !fs.existsSync(DATA_FILE)) return false;

  try {
    const data = readExistingData();
    if (!data) throw new Error('Invalid cache file');
    const lastFetched = new Date(data.lastFetched);
    const hoursSince = (Date.now() - lastFetched.getTime()) / (1000 * 60 * 60);

    if (Number.isFinite(hoursSince) && hoursSince < CACHE_HOURS) {
      console.log(`✅ Cache is fresh (${hoursSince.toFixed(1)} hours old). Skipping API calls.`);
      return true;
    }
  } catch {
    console.warn('⚠️ Could not read cache file, proceeding with fresh fetch.');
  }

  return false;
}

function normalizeTitle(title) {
  return title?.toLowerCase().replace(/\s+/g, ' ').trim() ?? '';
}

function dedupeArticles(articles, seen) {
  const unique = [];

  for (const article of articles) {
    if (!article.title || !article.link) continue;

    const linkKey = article.link.split('?')[0].replace(/\/$/, '').toLowerCase();
    const titleKey = normalizeTitle(article.title);
    const key = linkKey || titleKey;

    if (seen.has(key) || seen.has(titleKey)) continue;

    seen.add(key);
    seen.add(titleKey);
    unique.push(article);
  }

  return unique;
}

function gdeltDateToIso(seendate) {
  if (!seendate) return new Date().toISOString();

  // GDELT seendate format: YYYYMMDDTHHMMSSZ
  const match = String(seendate).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!match) return seendate;

  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

async function fetchGdeltCategory(category, config, limit) {
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', `${config.gdeltQuery} sourcelang:english`);
  url.searchParams.set('mode', 'ArtList');
  url.searchParams.set('format', 'json');
  url.searchParams.set('sort', 'HybridRel');
  url.searchParams.set('maxrecords', String(Math.min(250, Math.max(10, limit))));
  url.searchParams.set('timespan', GDELT_TIMESPAN);

  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`GDELT HTTP ${response.status}`);
  }

  const data = await response.json();
  return (data.articles ?? []).map(article => ({
    title: article.title,
    source: article.sourceCommonName || article.domain || 'gdelt',
    domain: article.domain,
    date: gdeltDateToIso(article.seendate),
    category,
    link: article.url,
    provider: 'gdelt'
  }));
}

async function fetchNewsDataCategory(category, config, limit) {
  if (!API_KEY) return [];

  const articles = [];
  let nextPage = null;
  const pageSize = 10;
  const maxPages = Math.ceil(limit / pageSize);

  for (let page = 0; page < maxPages && articles.length < limit; page += 1) {
    const url = new URL('https://newsdata.io/api/1/latest');
    url.searchParams.set('apikey', API_KEY);
    url.searchParams.set('q', config.newsDataQuery);
    url.searchParams.set('category', config.newsDataCategory);
    url.searchParams.set('language', 'en');
    url.searchParams.set('size', String(pageSize));
    if (nextPage) url.searchParams.set('page', nextPage);

    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const data = await response.json();

    if (data.status !== 'success') {
      throw new Error(data.results?.message || data.message || 'NewsData API error');
    }

    articles.push(...(data.results ?? []).map(article => ({
      title: article.title,
      source: article.source_id || article.source_name || 'newsdata',
      domain: article.source_url,
      date: article.pubDate,
      category,
      link: article.link,
      provider: 'newsdata'
    })));

    nextPage = data.nextPage;
    if (!nextPage) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return articles.slice(0, limit);
}

async function fetchCategory(category, config, seen) {
  const providerOrder = PROVIDER === 'newsdata'
    ? ['newsdata']
    : PROVIDER === 'hybrid'
      ? ['gdelt', 'newsdata']
      : ['gdelt'];

  let collected = [];

  for (const provider of providerOrder) {
    const remaining = PER_CATEGORY_LIMIT - collected.length;
    if (remaining <= 0) break;

    try {
      const results = provider === 'gdelt'
        ? await fetchGdeltCategory(category, config, remaining)
        : await fetchNewsDataCategory(category, config, remaining);
      const unique = dedupeArticles(results, seen);
      collected = collected.concat(unique).slice(0, PER_CATEGORY_LIMIT);
      console.log(`   - ${provider}: received ${results.length}, accepted ${unique.length}`);
    } catch (error) {
      console.error(`   ❌ ${provider} failed for ${category}: ${error.message}`);
    }
  }

  return collected;
}

async function fetchNews() {
  console.log('--- Starting News Ingestion ---');
  console.log(`Provider mode: ${PROVIDER}; per-category limit: ${PER_CATEGORY_LIMIT}; cache: ${CACHE_HOURS}h`);

  if ((PROVIDER === 'newsdata' || PROVIDER === 'hybrid') && !API_KEY) {
    console.warn('⚠️ NEWSDATA_API_KEY not found. NewsData will be skipped; use NEWS_PROVIDER=gdelt for keyless pulls.');
  }

  if (shouldUseCache()) return;

  const allArticles = {};
  const staleFallbackCategories = [];
  const existingData = readExistingData();
  const seen = new Set();

  for (const [category, config] of Object.entries(categories)) {
    console.log(`🔍 Fetching articles for category: [${category.toUpperCase()}]...`);
    const fetchedArticles = await fetchCategory(category, config, seen);

    if (fetchedArticles.length === 0 && existingData?.categories?.[category]?.length) {
      allArticles[category] = existingData.categories[category].slice(0, PER_CATEGORY_LIMIT);
      staleFallbackCategories.push(category);
      console.warn(`   ⚠️ No fresh ${category} articles accepted; preserved stale cache for this category.`);
    } else {
      allArticles[category] = fetchedArticles;
    }
  }

  const totalCount = Object.values(allArticles).flat().length;

  if (totalCount === 0) {
    console.error('❌ No articles were fetched and no stale cache exists. Refusing to overwrite news data.');
    process.exit(1);
  }
  const output = {
    lastFetched: new Date().toISOString(),
    totalArticles: totalCount,
    provider: PROVIDER,
    sourceStrategy: {
      primary: PROVIDER === 'newsdata' ? 'newsdata' : 'gdelt',
      fallback: PROVIDER === 'hybrid' ? 'newsdata' : null,
      gdeltTimespan: GDELT_TIMESPAN,
      perCategoryLimit: PER_CATEGORY_LIMIT,
      staleFallbackCategories
    },
    categories: allArticles
  };

  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2));
  console.log(`\n🎉 Success! Stored ${totalCount} articles in ${DATA_FILE}`);
}

fetchNews().catch(error => {
  console.error('💥 Fatal error in ingestion script:', error);
  process.exit(1);
});
