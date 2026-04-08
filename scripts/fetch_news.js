import fs from 'node:fs';
import path from 'node:path';

/**
 * Data Ingestion Script for Global Risk Clock
 * Fetches 200 articles daily across 5 risk categories using NewsData.io API.
 */

const API_KEY = process.env.NEWSDATA_API_KEY;
const DATA_FILE = path.join(process.cwd(), 'src/data/news.json');

const categories = {
  nuclear: { q: 'nuclear OR "atomic energy" OR "nuclear weapons"', category: 'science,politics' },
  climate: { q: '"climate change" OR "global warming"', category: 'environment' },
  ai: { q: '"artificial intelligence" OR "machine learning" OR OpenAI', category: 'technology' },
  pandemic: { q: 'pandemic OR "infectious disease" OR outbreak', category: 'health' },
  economy: { q: 'recession OR inflation OR "global economy"', category: 'business' }
};

const CACHE_HOURS = 24;

async function fetchNews() {
  console.log('--- Starting News Ingestion ---');
  
  if (!API_KEY) {
    console.error('❌ Error: NEWSDATA_API_KEY not found in environment.');
    console.log('Please ensure you are running with: node --env-file=.env scripts/fetch_news.js');
    process.exit(1);
  }

  // Check cache to avoid burning credits
  if (fs.existsSync(DATA_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const lastFetched = new Date(data.lastFetched);
      const now = new Date();
      const hoursSince = (now - lastFetched) / (1000 * 60 * 60);

      if (hoursSince < CACHE_HOURS) {
        console.log(`✅ Cache is fresh (${hoursSince.toFixed(1)} hours old). Skipping API calls.`);
        return;
      }
    } catch (e) {
      console.warn('⚠️ Could not read cache file, proceeding with fresh fetch.');
    }
  }

  const allArticles = {};

  for (const [catName, config] of Object.entries(categories)) {
    console.log(`🔍 Fetching articles for category: [${catName.toUpperCase()}]...`);
    let catArticles = [];
    let nextPage = null;

    // Fetch up to 40 articles (4 pages of 10)
    for (let i = 0; i < 4; i++) {
      const url = new URL('https://newsdata.io/api/1/latest');
      url.searchParams.append('apikey', API_KEY);
      url.searchParams.append('q', config.q);
      url.searchParams.append('category', config.category);
      url.searchParams.append('language', 'en');
      url.searchParams.append('size', '10');
      if (nextPage) url.searchParams.append('page', nextPage);

      try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'success') {
          if (!data.results || data.results.length === 0) {
            console.log(`   - No more results for ${catName}`);
            break;
          }

          catArticles.push(...data.results.map(art => ({
            title: art.title,
            source: art.source_id,
            date: art.pubDate,
            category: catName,
            link: art.link
          })));

          console.log(`   - Page ${i + 1}: Received ${data.results.length} articles`);
          
          nextPage = data.nextPage;
          if (!nextPage) break;
          
          // Small delay between pages to be a good citizen
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          console.error(`   ❌ Error fetching ${catName}: ${data.results?.message || 'API Error'}`);
          break;
        }
      } catch (err) {
        console.error(`   ❌ Network error for ${catName}:`, err.message);
        break;
      }
    }
    allArticles[catName] = catArticles;
  }

  const totalCount = Object.values(allArticles).flat().length;

  const output = {
    lastFetched: new Date().toISOString(),
    totalArticles: totalCount,
    categories: allArticles
  };

  // Ensure directory exists
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2));
  console.log(`\n🎉 Success! Stored ${totalCount} articles in ${DATA_FILE}`);
}

fetchNews().catch(err => {
  console.error('💥 Fatal error in ingestion script:', err);
  process.exit(1);
});
