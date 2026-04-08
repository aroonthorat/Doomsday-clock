import json
import os
from datetime import datetime

CATEGORY_WEIGHTS = {
    'nuclear': 0.35,
    'climate': 0.25,
    'ai': 0.15,
    'pandemic': 0.15,
    'economy': 0.10
}

def classify_article(article):
    title = article['title'].lower()
    
    # Defaults
    polarity = 0.0
    severity = 5
    credibility = 85 # Default for known sources
    
    # Keywords for Severity / Polarity
    threat_keywords = ['war', 'nuclear', 'strike', 'die', 'genocide', 'wipe out', 'threatens', 'crisis', 'deadline', 'ultimatum', 'wildfire', 'floods', 'extinction', 'poverty', 'famine', 'fraud']
    positive_keywords = ['freedom', 'discovery', 'solution', 'launched', 'raises', 'funding', 'success', 'protect', 'innovation', 'training', 'safety']
    
    # Severity adjustments
    if 'nuclear' in title or 'genocide' in title or 'wipe out' in title or 'civilization will die' in title:
        severity = 9
        polarity = -0.9
    elif 'war' in title or 'strike' in title or 'crisis' in title:
        severity = 8
        polarity = -0.7
    elif 'wildfire' in title or 'floods' in title or 'starve' in title:
        severity = 7
        polarity = -0.6
    
    if any(k in title for k in positive_keywords):
        polarity += 0.5
        severity -= 2
        
    # Polarity clamping
    polarity = max(-1.0, min(1.0, polarity))
    # Severity clamping
    severity = max(1, min(10, severity))
    
    # Credibility logic (simplified)
    low_cred_sources = ['thepoke', 'rawstory', 'bitcoinworld']
    if article['source'] in low_cred_sources:
        credibility = 40
    elif article['source'] in ['bbc', 'reuters', 'nycharibnews', 'financialpost', 'politico_eu', 'thestar']:
        credibility = 95
        
    return {
        "polarity": round(polarity, 2),
        "severity": severity,
        "credibility": f"{credibility}%"
    }

def calculate_article_score(analysis, category):
    polarity = analysis['polarity']
    severity = analysis['severity']
    credibility = float(analysis['credibility'].replace('%', '')) / 100.0
    weight = CATEGORY_WEIGHTS.get(category, 0.1)
    
    score = polarity * severity * credibility * weight
    
    # Bias logic
    if score < 0:
        score *= 1.2
    else:
        score *= 1.0
        
    return round(score, 4)

def update_historical_scores(category_averages, global_score):
    history_path = r'e:\Codespace\Doomsday Clock\src\data\historical_scores.json'
    today = datetime.now().strftime('%Y-%m-%d')
    
    history = []
    if os.path.exists(history_path):
        with open(history_path, 'r', encoding='utf-8') as f:
            try:
                history = json.load(f)
            except json.JSONDecodeError:
                history = []
                
    # Create or update today's entry
    today_entry = next((e for e in history if e['date'] == today), None)
    if today_entry:
        today_entry['global_score'] = round(global_score, 4)
        today_entry['categories'] = {cat: round(avg, 4) for cat, avg in category_averages.items()}
    else:
        today_entry = {
            "date": today,
            "global_score": round(global_score, 4),
            "categories": {cat: round(avg, 4) for cat, avg in category_averages.items()}
        }
        history.append(today_entry)
    
    # Sort history by date to ensure window is correct
    history.sort(key=lambda x: x['date'])
    
    # Calculate smoothed scores (3-day moving average)
    for i in range(len(history)):
        window = history[max(0, i-2) : i+1]
        window_scores = [e['global_score'] for e in window]
        history[i]['smoothed_score'] = round(sum(window_scores) / len(window_scores), 4)
    
    os.makedirs(os.path.dirname(history_path), exist_ok=True)
    with open(history_path, 'w', encoding='utf-8') as f:
        json.dump(history, f, indent=2)

def update_clock_time():
    status_path = r'e:\Codespace\Doomsday Clock\src\data\clockStatus.json'
    history_path = r'e:\Codespace\Doomsday Clock\src\data\historical_scores.json'
    
    if not os.path.exists(history_path) or not os.path.exists(status_path):
        return
        
    with open(history_path, 'r', encoding='utf-8') as f:
        try:
            history = json.load(f)
        except json.JSONDecodeError:
            return
        
    if not history:
        return
        
    latest_entry = history[-1]
    smoothed_score = latest_entry.get('smoothed_score', 0)
    
    with open(status_path, 'r', encoding='utf-8') as f:
        try:
            status = json.load(f)
        except json.JSONDecodeError:
            status = {"secondsToMidnight": 90}
        
    current_seconds = status.get('secondsToMidnight', 90)
    
    # Scaling: Max +/- 5.0 score maps to +/- 20 seconds
    MAX_SCORE_THRESHOLD = 5.0
    MAX_MOVEMENT = 20.0
    
    delta = (smoothed_score / MAX_SCORE_THRESHOLD) * MAX_MOVEMENT
    
    # Clamp delta
    delta = max(-MAX_MOVEMENT, min(MAX_MOVEMENT, delta))
    
    new_seconds = current_seconds + delta
    
    # Safeguard: Minimum 10 seconds to midnight
    new_seconds = max(10, new_seconds)
    
    status['secondsToMidnight'] = round(new_seconds, 2)
    status['lastUpdated'] = datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
    
    # Dynamic reason based on score
    if smoothed_score < -1:
        status['reason'] = "Heightened global risk detected through news sentiment analysis."
    elif smoothed_score > 1:
        status['reason'] = "Minor de-escalation in global threat categories."
    else:
        status['reason'] = "Sustained global tension with stable metrics."
        
    with open(status_path, 'w', encoding='utf-8') as f:
        json.dump(status, f, indent=2)
    
    print(f"Clock Updated: {current_seconds} -> {status['secondsToMidnight']} (Delta: {delta:.2f}s)")

def process_file():
    input_path = r'e:\Codespace\Doomsday Clock\src\data\news.json'
    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found.")
        return

    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    category_totals = {}
    category_counts = {}
    
    for category in data['categories']:
        category_totals[category] = 0.0
        category_counts[category] = 0
        
        for article in data['categories'][category]:
            analysis = classify_article(article)
            article['ai_analysis'] = analysis
            
            score = calculate_article_score(analysis, category)
            article['ai_analysis']['score'] = score
            
            category_totals[category] += score
            category_counts[category] += 1
            
    # Calculate averages
    category_averages = {}
    for cat in category_totals:
        if category_counts[cat] > 0:
            category_averages[cat] = category_totals[cat] / category_counts[cat]
        else:
            category_averages[cat] = 0.0
            
    # Global score is the sum of category averages (weighted by their presence)
    # Actually, let's just use the sum of category averages since weights are already in the score
    global_score = sum(category_averages.values())
    
    # Save enriched news
    with open(input_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        
    # Persist historical data
    update_historical_scores(category_averages, global_score)
    
    # Finally, move the clock
    update_clock_time()
    print(f"Scores calculated: Global={global_score:.4f}")

if __name__ == "__main__":
    process_file()
