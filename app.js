const startBtn = document.getElementById('start-btn');
const overlay = document.getElementById('start-overlay');
const appContainer = document.getElementById('app-container');
const canvas = document.getElementById('spectrum-canvas');
const ctx = canvas.getContext('2d');
const labelsContainer = document.getElementById('labels-container');
const zoomSlider = document.getElementById('zoom-slider');
const toggleSidebarBtn = document.getElementById('toggle-sidebar');
const sidebar = document.getElementById('harmonics-sidebar');
const listEl = document.getElementById('harmonics-list');

// Settings DOM mapping
const settingsBtn = document.getElementById('settings-btn');
const settingsOverlay = document.getElementById('settings-overlay');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const cfgNoiseGate = document.getElementById('cfg-noise-gate');
const cfgSmoothing = document.getElementById('cfg-smoothing');
const cfgAttack = document.getElementById('cfg-attack');
const cfgRelease = document.getElementById('cfg-release');
const cfgThreshold = document.getElementById('cfg-threshold');

let audioCtx, analyser, dataArray, smoothedArray;
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function getNoteFromFreq(freq) {
  if (freq <= 0) return { text: "", midi: 0 };
  const midi = Math.round(69 + 12 * Math.log2(freq / 440.0));
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTES[midi % 12];
  return { text: `${note}${octave}`, midi };
}

let smoothedNHR = 0;
const cleanValEl = document.getElementById('cleanliness-val');
const cleanBarEl = document.getElementById('cleanliness-bar');
const nhrValEl = document.getElementById('nhr-val');

function calculateHarmonicCleanliness(peaks, f0) {
  if (!f0 || peaks.length <= 1) return 0;
  let totalWeightedDeviation = 0;
  let totalMagnitude = 0;

  for (let i = 1; i < peaks.length; i++) {
    const peakFreq = peaks[i].freq;
    const mag = peaks[i].mag;
    
    const ratio = peakFreq / f0;
    const expectedMultiple = Math.max(1, Math.round(ratio)); 
    const expectedFreq = expectedMultiple * f0;
    const deviationHz = Math.abs(peakFreq - expectedFreq);
    
    const maxDeviation = f0 / 2;
    let deviationScore = 1 - (deviationHz / maxDeviation);
    deviationScore = Math.max(0, Math.min(1, deviationScore)); 
    
    totalWeightedDeviation += deviationScore * mag;
    totalMagnitude += mag;
  }
  
  if (totalMagnitude === 0) return 0;
  return (totalWeightedDeviation / totalMagnitude) * 100;
}

function calculateNHRState(points, validPeaks) {
  let harmonicEnergy = 0;
  const coveredBins = new Set();
  
  // Extract energy correctly tracking multi-bin spectral bleed
  validPeaks.forEach(p => {
    for(let w = -2; w <= 2; w++) {
      const idx = p.index + w;
      if(idx >= 0 && idx < points.length && !coveredBins.has(idx)) {
        harmonicEnergy += points[idx].mag;
        coveredBins.add(idx);
      }
    }
  });
  
  let totalEnergy = 0;
  points.forEach(p => { totalEnergy += p.mag; });
  
  let noiseEnergy = Math.max(0, totalEnergy - harmonicEnergy);
  let currentNHR = noiseEnergy / Math.max(0.0001, harmonicEnergy);
  
  const alpha = 0.33; // ~80ms window assuming 60fps
  smoothedNHR = (alpha * currentNHR) + ((1 - alpha) * smoothedNHR);
  return smoothedNHR;
}

function getHarmonicColor(midi, rootMidi) {
  if (rootMidi === null || midi === null) return 'white';
  let diff = (midi - rootMidi) % 12;
  while(diff < 0) diff += 12; // ensure positive modulo
  
  if (diff === 0) return 'white'; // Root / Octaves
  if (diff === 7) return '#3b82f6'; // Perfect 5th (Blue)
  if (diff === 3 || diff === 4) return '#22c55e'; // Minor/Major 3rd (Green)
  
  return '#ef4444'; // All others (Red)
}

function resize() {
  canvas.width = canvas.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.clientHeight * window.devicePixelRatio;
}

window.addEventListener('resize', resize);

// Setup initial config hooks
zoomSlider.value = AppConfig.zoom;
zoomSlider.addEventListener('input', (e) => AppConfig.zoom = parseFloat(e.target.value));

toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.toggle('hidden');
  setTimeout(resize, 350); 
});

// Settings Overlay Logic
function loadConfigToUI() {
  cfgNoiseGate.value = AppConfig.minDecibels;
  cfgSmoothing.value = AppConfig.smoothingTimeConstant;
  cfgAttack.value = AppConfig.alphaAttack;
  cfgRelease.value = AppConfig.alphaRelease;
  cfgThreshold.value = AppConfig.peakThresholdBase;
}
settingsBtn.addEventListener('click', () => {
  loadConfigToUI();
  settingsOverlay.classList.remove('hidden');
});
closeSettingsBtn.addEventListener('click', () => {
  settingsOverlay.classList.add('hidden');
});
cfgNoiseGate.addEventListener('input', (e) => {
  AppConfig.minDecibels = parseFloat(e.target.value);
  if(analyser) analyser.minDecibels = AppConfig.minDecibels;
});
cfgSmoothing.addEventListener('input', (e) => {
  AppConfig.smoothingTimeConstant = parseFloat(e.target.value);
  if(analyser) analyser.smoothingTimeConstant = AppConfig.smoothingTimeConstant;
});
cfgAttack.addEventListener('input', (e) => AppConfig.alphaAttack = parseFloat(e.target.value));
cfgRelease.addEventListener('input', (e) => AppConfig.alphaRelease = parseFloat(e.target.value));
cfgThreshold.addEventListener('input', (e) => AppConfig.peakThresholdBase = parseFloat(e.target.value));

// Audio Init
startBtn.addEventListener('click', async () => {
  overlay.classList.add('hidden');
  appContainer.classList.add('visible');
  resize();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = AppConfig.FFT_SIZE;
    analyser.smoothingTimeConstant = AppConfig.smoothingTimeConstant;
    analyser.minDecibels = AppConfig.minDecibels;
    
    source.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Float32Array(bufferLength);
    smoothedArray = new Float32Array(bufferLength);
    
    for(let i=0; i<AppConfig.maxPeaks; i++) {
       const el = document.createElement('div');
       el.className = 'peak-label';
       el.style.opacity = '0';
       labelsContainer.appendChild(el);
    }
    
    requestAnimationFrame(draw);
  } catch (err) {
    console.error("Microphone access denied or error: ", err);
    alert("Could not access microphone. Please ensure permissions are granted.");
  }
});

function draw() {
  requestAnimationFrame(draw);
  if (!analyser) return;
  
  analyser.getFloatFrequencyData(dataArray);
  
  const width = canvas.width;
  const height = canvas.height;
  const sampleRate = audioCtx.sampleRate;
  const binCount = analyser.frequencyBinCount;
  
  ctx.clearRect(0, 0, width, height);
  
  const alphaAttack = AppConfig.alphaAttack;
  const alphaRelease = AppConfig.alphaRelease;
  const minDb = analyser.minDecibels;
  const maxDb = analyser.maxDecibels;
  
  for (let i = 0; i < binCount; i++) {
    let amplitude = (dataArray[i] - minDb) / (maxDb - minDb);
    amplitude = Math.max(0, Math.min(1, amplitude));
    
    if (amplitude > smoothedArray[i]) {
      smoothedArray[i] += alphaAttack * (amplitude - smoothedArray[i]);
    } else {
      smoothedArray[i] += alphaRelease * (amplitude - smoothedArray[i]);
    }
  }
  
  const minLog = Math.log10(AppConfig.MIN_FREQ);
  const maxLog = Math.log10(AppConfig.MAX_FREQ);
  const logRange = maxLog - minLog;
  const zoom = AppConfig.zoom;
  
  const gradInstant = ctx.createLinearGradient(0, height, 0, 0);
  gradInstant.addColorStop(0, 'rgba(139, 92, 246, 0.0)');
  gradInstant.addColorStop(1, 'rgba(236, 72, 153, 0.3)');
  
  const gradSmoothed = ctx.createLinearGradient(0, height, 0, 0);
  gradSmoothed.addColorStop(0, '#8b5cf6');
  gradSmoothed.addColorStop(1, '#ec4899');
  
  // 1. Draw Instantaneous Spectrum Shape
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let i = 0; i < binCount; i++) {
    const freq = i * sampleRate / (2 * binCount);
    if (freq < AppConfig.MIN_FREQ || freq > AppConfig.MAX_FREQ) continue;
    
    let amplitude = (dataArray[i] - minDb) / (maxDb - minDb);
    amplitude = Math.max(0, Math.min(1, amplitude));
    
    const x = ((Math.log10(freq) - minLog) / logRange) * width;
    const y = height - (amplitude * height * zoom);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, height);
  ctx.fillStyle = gradInstant;
  ctx.fill();
  
  // 2. Draw Smoothed Spectrum Line
  ctx.beginPath();
  ctx.moveTo(0, height);
  const points = [];
  for (let i = 0; i < binCount; i++) {
    const freq = i * sampleRate / (2 * binCount);
    if (freq < AppConfig.MIN_FREQ || freq > AppConfig.MAX_FREQ) continue;
    
    const x = ((Math.log10(freq) - minLog) / logRange) * width;
    const y = height - (smoothedArray[i] * height * zoom);
    
    points.push({x, y, freq, mag: smoothedArray[i], index: i});
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = gradSmoothed;
  ctx.lineWidth = window.devicePixelRatio * 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  
  // 3. Peak Detection Logic
  const peaks = [];
  const threshold = Math.max(AppConfig.peakThresholdBase, Math.max(...smoothedArray) * AppConfig.peakThresholdRelative);
  
  for (let i = 1; i < points.length - 1; i++) {
    if (points[i].mag > threshold &&
        points[i].mag > points[i-1].mag && 
        points[i].mag > points[i+1].mag) {
      peaks.push(points[i]);
    }
  }
  
  peaks.sort((a, b) => b.mag - a.mag);
  const topPeaks = peaks.slice(0, AppConfig.maxPeaks);
  
  let rootMidi = null;
  let displayPeaks = [];
  let f0 = null;
  
  if (topPeaks.length > 0) {
    displayPeaks = [...topPeaks].sort((a, b) => a.freq - b.freq);
    f0 = displayPeaks[0].freq;
    rootMidi = getNoteFromFreq(f0).midi;
  }
  
  // 4. Harmonic & Noise Analytics
  if (f0 && peaks.length > 0) {
    const cleanliness = calculateHarmonicCleanliness(displayPeaks, f0);
    const nhr = calculateNHRState(points, peaks); // Use ALL robust peaks for rigorous NHR 
    
    cleanValEl.textContent = cleanliness.toFixed(1);
    cleanBarEl.style.width = `${cleanliness}%`;
    if (cleanliness > 85) cleanBarEl.style.background = '#22c55e';
    else if (cleanliness > 60) cleanBarEl.style.background = '#eab308';
    else cleanBarEl.style.background = '#ef4444';
    
    nhrValEl.textContent = nhr.toFixed(3);
    if (nhr < 0.5) nhrValEl.style.color = '#22c55e';
    else if (nhr < 1.5) nhrValEl.style.color = '#eab308';
    else nhrValEl.style.color = '#ef4444';
  } else {
    cleanValEl.textContent = '--';
    cleanBarEl.style.width = '0%';
    nhrValEl.textContent = '--';
    nhrValEl.style.color = 'inherit';
  }
  
  // 5. Update UI labels
  const labelEls = document.querySelectorAll('.peak-label');
  labelEls.forEach((el, i) => {
    if (i < topPeaks.length) {
      const p = topPeaks[i];
      const noteInfo = getNoteFromFreq(p.freq);
      
      let labelText = noteInfo.text;
      if (labelText === "A4") labelText = "A4 (440Hz)";
      const themeColor = getHarmonicColor(noteInfo.midi, rootMidi);
      
      el.textContent = labelText;
      el.style.color = themeColor;
      el.style.borderColor = themeColor;
      
      let existingStyle = document.getElementById(`dynamic-style-${i}`);
      if (!existingStyle) {
        existingStyle = document.createElement('style');
        existingStyle.id = `dynamic-style-${i}`;
        document.head.appendChild(existingStyle);
      }
      existingStyle.innerHTML = `.peak-label:nth-child(${i+1})::after { border-color: ${themeColor} transparent transparent transparent; }`;

      const displayX = (p.x / width) * 100;
      const displayY = (p.y / height) * 100;
      
      el.style.left = `${displayX}%`;
      el.style.top = `${displayY}%`;
      // Don't show labels if they get dragged under the screen
      el.style.opacity = (p.y > height) ? '0' : '1'; 
    } else {
      el.style.opacity = '0';
    }
  });

  listEl.innerHTML = '';
  displayPeaks.forEach(p => {
    const noteInfo = getNoteFromFreq(p.freq);
    const themeColor = getHarmonicColor(noteInfo.midi, rootMidi);
    
    const li = document.createElement('li');
    li.className = 'harmonic-item';
    li.style.borderLeftColor = themeColor;
    li.style.color = themeColor;
    
    li.innerHTML = `<span>${noteInfo.text}</span>`;
    listEl.appendChild(li);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.textAlign = 'center';
  ctx.font = `${10 * window.devicePixelRatio}px Outfit`;
  
  const refFrequencies = [65.41, 130.81, 261.63, 523.25, 1046.50, 2093.00, 4186.01, 8372.02];
  const refLabels = ["C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9"];
  
  refFrequencies.forEach((f, index) => {
    if (f < AppConfig.MIN_FREQ || f > AppConfig.MAX_FREQ) return;
    const x = ((Math.log10(f) - minLog) / logRange) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.fillText(refLabels[index], x, height - (10 * window.devicePixelRatio));
  });
}
