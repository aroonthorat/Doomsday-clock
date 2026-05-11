import hashlib
import json
import importlib
import importlib.util
import math
import os
from datetime import datetime, timezone
from pathlib import Path

if importlib.util.find_spec("dotenv"):
    importlib.import_module("dotenv").load_dotenv()

ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "src" / "data"
NEWS_PATH = DATA_DIR / "news.json"
HISTORY_PATH = DATA_DIR / "historical_scores.json"
STATUS_PATH = DATA_DIR / "clockStatus.json"
CRISIS_LOG_PATH = DATA_DIR / "crises.json"

CATEGORY_WEIGHTS = {
    "nuclear": 0.35,
    "climate": 0.25,
    "ai": 0.15,
    "pandemic": 0.15,
    "economy": 0.10,
}

CATEGORY_PROFILES = {
    "nuclear": {
        "negative": {
            "nuclear strike": 1.0,
            "missile strike": 0.9,
            "icbm": 0.85,
            "nuclear weapon": 0.8,
            "uranium enrichment": 0.55,
            "arms race": 0.55,
            "radiation leak": 0.75,
        },
        "positive": ["arms control", "treaty", "de-escalation", "inspections", "disarmament"],
    },
    "climate": {
        "negative": {
            "record heat": 0.55,
            "wildfire": 0.65,
            "flood": 0.60,
            "drought": 0.60,
            "hurricane": 0.60,
            "climate tipping": 0.85,
            "food insecurity": 0.70,
        },
        "positive": ["emissions cut", "clean energy", "climate agreement", "adaptation funding"],
    },
    "ai": {
        "negative": {
            "ai safety": 0.30,
            "autonomous weapons": 0.85,
            "deepfake": 0.50,
            "cyberattack": 0.65,
            "model leak": 0.45,
            "loss of control": 0.90,
        },
        "positive": ["safety standard", "ai regulation", "alignment", "evaluation", "guardrails"],
    },
    "pandemic": {
        "negative": {
            "pandemic": 0.85,
            "outbreak": 0.65,
            "epidemic": 0.70,
            "avian flu": 0.70,
            "public health emergency": 0.80,
            "infectious disease": 0.45,
        },
        "positive": ["vaccine", "contained", "treatment", "preparedness", "surveillance"],
    },
    "economy": {
        "negative": {
            "recession": 0.65,
            "inflation": 0.45,
            "financial crisis": 0.85,
            "market crash": 0.85,
            "debt crisis": 0.70,
            "sanctions": 0.45,
            "food insecurity": 0.65,
        },
        "positive": ["recovery", "stabilizes", "rate cut", "growth", "agreement"],
    },
}

CRISIS_TRIGGERS = {
    "WAR": {
        "keywords": ["war breaks out", "invasion begins", "missile strike", "invades", "major attack"],
        "shift": -35,
    },
    "NUCLEAR": {
        "keywords": ["nuclear strike", "uses nuclear", "icbm launched", "radiation leak", "nuclear accident"],
        "shift": -50,
    },
    "PANDEMIC": {
        "keywords": ["who declares pandemic", "public health emergency", "pandemic declared"],
        "shift": -25,
    },
}

NEGATION_TERMS = ["denies", "not planning", "no evidence", "false", "hoax", "rejects", "rules out"]
HIGH_CREDIBILITY_SOURCES = {
    "apnews.com",
    "bbc",
    "bbc.com",
    "reuters",
    "reuters.com",
    "theguardian.com",
    "npr.org",
    "politico",
    "politico.eu",
    "ft.com",
    "financialpost",
}
LOW_CREDIBILITY_SOURCES = {"thepoke", "rawstory", "bitcoinworld"}


def load_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return default


def save_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def parse_article_date(article):
    raw_date = article.get("date") or article.get("published_at") or article.get("pubDate")
    if not raw_date:
        return None

    normalized = str(raw_date).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized).astimezone(timezone.utc)
    except ValueError:
        try:
            return datetime.strptime(str(raw_date), "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            return None


def age_multiplier(article):
    published = parse_article_date(article)
    if not published:
        return 0.85

    age_hours = max(0.0, (datetime.now(timezone.utc) - published).total_seconds() / 3600)
    if age_hours <= 6:
        return 1.0
    if age_hours <= 24:
        return 0.9
    if age_hours <= 72:
        return 0.7
    return 0.45


def source_credibility(article):
    source = str(article.get("source") or "").lower()
    domain = str(article.get("domain") or article.get("link") or "").lower()

    if any(low in source or low in domain for low in LOW_CREDIBILITY_SOURCES):
        return 0.40
    if any(high in source or high in domain for high in HIGH_CREDIBILITY_SOURCES):
        return 0.95
    return 0.80


def classify_article(article, category):
    text = " ".join(
        str(article.get(field) or "") for field in ("title", "description", "summary")
    ).lower()
    profile = CATEGORY_PROFILES.get(category, {"negative": {}, "positive": []})

    threat_signal = 0.0
    matched_terms = []
    for phrase, strength in profile["negative"].items():
        if phrase in text:
            threat_signal += strength
            matched_terms.append(phrase)

    positive_signal = sum(0.35 for phrase in profile["positive"] if phrase in text)
    if any(term in text for term in NEGATION_TERMS):
        threat_signal *= 0.45

    polarity = max(-1.0, min(1.0, positive_signal - threat_signal))
    severity = 3 + min(7, math.ceil(threat_signal * 4)) - min(2, math.floor(positive_signal * 2))
    severity = max(1, min(10, severity))
    credibility = source_credibility(article)
    recency = age_multiplier(article)

    return {
        "polarity": round(polarity, 2),
        "severity": severity,
        "credibility": f"{round(credibility * 100)}%",
        "recency": round(recency, 2),
        "matched_terms": matched_terms[:5],
    }


def calculate_article_score(analysis, category):
    polarity = analysis["polarity"]
    severity = analysis["severity"]
    credibility = float(analysis["credibility"].replace("%", "")) / 100.0
    recency = analysis.get("recency", 1.0)
    weight = CATEGORY_WEIGHTS.get(category, 0.1)

    score = polarity * severity * credibility * recency * weight
    if score < 0:
        score *= 1.15
    return round(score, 4)


def update_historical_scores(category_averages, global_score):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    history = load_json(HISTORY_PATH, [])

    today_entry = next((entry for entry in history if entry.get("date") == today), None)
    payload = {
        "date": today,
        "global_score": round(global_score, 4),
        "categories": {cat: round(avg, 4) for cat, avg in category_averages.items()},
    }

    if today_entry:
        today_entry.update(payload)
    else:
        history.append(payload)

    history.sort(key=lambda item: item.get("date", ""))
    for index in range(len(history)):
        window = history[max(0, index - 2) : index + 1]
        window_scores = [entry.get("global_score", 0) for entry in window]
        history[index]["smoothed_score"] = round(sum(window_scores) / len(window_scores), 4)

    save_json(HISTORY_PATH, history)


def get_crisis_id(title):
    return hashlib.md5(title.lower().encode()).hexdigest()


def is_negated_crisis(text):
    return any(term in text for term in NEGATION_TERMS)


def detect_crises(articles):
    detected = []
    log = load_json(CRISIS_LOG_PATH, [])
    seen_ids = {entry.get("id") for entry in log}

    for article in articles:
        text = str(article.get("title") or "").lower()
        if is_negated_crisis(text):
            continue

        for category, config in CRISIS_TRIGGERS.items():
            if any(keyword in text for keyword in config["keywords"]):
                crisis_id = get_crisis_id(article.get("title", ""))
                if crisis_id in seen_ids:
                    continue
                detected.append(
                    {
                        "id": crisis_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "category": category,
                        "title": article.get("title", "Untitled"),
                        "shift": config["shift"],
                    }
                )
                seen_ids.add(crisis_id)
                break

    return detected


def update_crises_log(new_crises):
    if not new_crises:
        return
    log = load_json(CRISIS_LOG_PATH, [])
    log.extend(new_crises)
    save_json(CRISIS_LOG_PATH, log)


def update_clock_time(articles):
    history = load_json(HISTORY_PATH, [])
    if not history:
        return

    latest_entry = history[-1]
    smoothed_score = latest_entry.get("smoothed_score", 0)
    status = load_json(STATUS_PATH, {"secondsToMidnight": 90})
    current_seconds = float(status.get("secondsToMidnight", 90))

    new_crises = detect_crises(articles)
    if new_crises:
        delta = min(crisis["shift"] for crisis in new_crises)
        update_crises_log(new_crises)
        reason = f"Emergency trigger detected: {new_crises[0]['title']}"
        print(f"!!! CRISIS DETECTED: Applying instant shift of {delta}s")
    else:
        # Negative scores move closer to midnight; positive scores move away.
        max_score_threshold = 4.0
        max_daily_movement = 12.0
        delta = (smoothed_score / max_score_threshold) * max_daily_movement
        delta = max(-max_daily_movement, min(max_daily_movement, delta))

        if smoothed_score < -0.75:
            reason = "Heightened global risk detected through recency-weighted news analysis."
        elif smoothed_score > 0.75:
            reason = "Measured de-escalation detected across global threat categories."
        else:
            reason = "Global threat indicators remain mixed and relatively stable."

    new_seconds = max(10, min(600, current_seconds + delta))
    status["secondsToMidnight"] = round(new_seconds, 2)
    status["lastUpdated"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    status["reason"] = reason
    status["lastScore"] = round(smoothed_score, 4)
    status["lastDelta"] = round(delta, 2)
    save_json(STATUS_PATH, status)

    sync_clock_status(status)
    print(f"Clock Updated: {current_seconds} -> {status['secondsToMidnight']} (Delta: {delta:.2f}s)")


def sync_clock_status(status):
    supabase_url = os.environ.get("VITE_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key or not importlib.util.find_spec("supabase"):
        return

    try:
        create_client = importlib.import_module("supabase").create_client
        supabase = create_client(supabase_url, supabase_key)
        supabase.table("clock_status").insert(
            {
                "seconds_to_midnight": status["secondsToMidnight"],
                "reason": status["reason"],
            }
        ).execute()
    except Exception as exc:
        print(f"Supabase Error (Clock Status): {exc}")


def sync_articles(data):
    supabase_url = os.environ.get("VITE_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not supabase_key or not importlib.util.find_spec("supabase"):
        return

    try:
        create_client = importlib.import_module("supabase").create_client
        supabase = create_client(supabase_url, supabase_key)
        rows = []
        for category, articles in data.get("categories", {}).items():
            for article in articles:
                analysis = article["ai_analysis"]
                rows.append(
                    {
                        "title": article["title"],
                        "source": article["source"],
                        "published_at": article.get("date") or article.get("pubDate"),
                        "category": category,
                        "url": article["link"],
                        "polarity": analysis["polarity"],
                        "severity": analysis["severity"],
                        "credibility": analysis["credibility"],
                        "score": analysis["score"],
                    }
                )

        if rows:
            supabase.table("news_articles").upsert(rows, on_conflict="url").execute()
    except Exception as exc:
        print(f"Supabase Error (Articles): {exc}")


def process_file():
    if not NEWS_PATH.exists():
        print(f"Error: {NEWS_PATH} not found.")
        return

    data = load_json(NEWS_PATH, {})
    category_totals = {}
    category_counts = {}

    for category, articles in data.get("categories", {}).items():
        category_totals[category] = 0.0
        category_counts[category] = 0

        for article in articles:
            analysis = classify_article(article, category)
            analysis["score"] = calculate_article_score(analysis, category)
            article["ai_analysis"] = analysis
            category_totals[category] += analysis["score"]
            category_counts[category] += 1

    category_averages = {
        category: (category_totals[category] / category_counts[category] if category_counts[category] else 0.0)
        for category in category_totals
    }
    global_score = sum(category_averages.values())

    save_json(NEWS_PATH, data)
    update_historical_scores(category_averages, global_score)
    sync_articles(data)

    all_articles = [article for articles in data.get("categories", {}).values() for article in articles]
    update_clock_time(all_articles)
    print(f"Scores calculated: Global={global_score:.4f}")


if __name__ == "__main__":
    process_file()
