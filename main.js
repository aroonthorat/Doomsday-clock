import './style.css'

const clockTicks = document.getElementById('clock-ticks');
const timeToMidnight = document.getElementById('time-to-midnight');
const needle = document.getElementById('needle');
const riskScore = document.getElementById('risk-score');
const app = document.getElementById('risk-clock');

// State
let secondsRemaining = 300; // 5:00 default
let currentScore = 0;

// Initialize ticks
const initTicks = () => {
  for (let i = 0; i < 60; i++) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const angle = (i * 6) * (Math.PI / 180);
    const length = i % 5 === 0 ? 10 : 5;
    const r1 = 90;
    const r2 = r1 - length;
    
    line.setAttribute('x1', 100 + r1 * Math.sin(angle));
    line.setAttribute('y1', 100 - r1 * Math.cos(angle));
    line.setAttribute('x2', 100 + r2 * Math.sin(angle));
    line.setAttribute('y2', 100 - r2 * Math.cos(angle));
    
    if (i % 5 === 0) {
      line.style.stroke = 'rgba(255, 255, 255, 0.4)';
      line.style.strokeWidth = '1.5';
    }
    
    clockTicks.appendChild(line);
  }
}

// Format time
const formatTime = (totalSeconds) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// Update UI
const updateUI = () => {
  // Update time text
  timeToMidnight.innerText = formatTime(secondsRemaining);
  
  // Calculate angle (Top is 0 degrees, clockwise)
  // We want to show how close we are to midnight.
  // Let's map 60 mins -> 360 degrees.
  // 5 mins to midnight -> angle should be at 11:55 position.
  const angle = (secondsRemaining / 3600) * 360;
  needle.style.transform = `rotate(${-angle}deg)`;
  
  // Update Color Logic
  let colorClass = '#00ff9c'; // Safe (Green)
  let shadowColor = 'rgba(0, 255, 156, 0.2)';
  
  if (secondsRemaining <= 120) { // < 2 mins (Danger)
    colorClass = '#ff4b5c';
    shadowColor = 'rgba(255, 75, 92, 0.4)';
  } else if (secondsRemaining <= 600) { // < 10 mins (Moderate)
    colorClass = '#ffd93d';
    shadowColor = 'rgba(255, 217, 61, 0.3)';
  }
  
  document.documentElement.style.setProperty('--primary-color', colorClass);
  app.style.filter = `drop-shadow(0 0 30px ${shadowColor})`;
  timeToMidnight.style.color = colorClass;
  needle.style.stroke = colorClass;
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initTicks();
  updateUI();
  
  // Subtle animation: random flicker/micro-adjustment to state
  setInterval(() => {
    // Current Risk Score could oscillate slightly to feel "alive"
    const scoreVariation = (Math.random() * 0.1).toFixed(2);
    riskScore.innerText = currentScore + (parseFloat(scoreVariation) % 10);
  }, 2000);
});
