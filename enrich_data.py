import json
import os

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

def process_file():
    input_path = r'e:\Codespace\Doomsday Clock\src\data\news.json'
    with open(input_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    for category in data['categories']:
        for article in data['categories'][category]:
            article['ai_analysis'] = classify_article(article)
            
    with open(input_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

if __name__ == "__main__":
    process_file()
