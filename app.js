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

let audioCtx, analyser, dataArray, smoothedArray;
const FFT_SIZE = 4096;
const MAX_FREQ = 20000;
const MIN_FREQ = 20;

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function getNoteFromFreq(freq) {
  if (freq <= 0) return { text: "", midi: 0 };
  const midi = Math.round(69 + 12 * Math.log2(freq / 440.0));
  const octave = Math.floor(midi / 12) - 1;
  const note = NOTES[midi % 12];
  return { text: `${note}${octave}`, midi };
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

toggleSidebarBtn.addEventListener('click', () => {
  sidebar.classList.toggle('hidden');
  // Need to resize canvas slightly after flex shift finishes to prevent squished drawing
  setTimeout(resize, 350); 
});

startBtn.addEventListener('click', async () => {
  overlay.classList.add('hidden');
  appContainer.classList.add('visible');
  resize();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.6; // Filters out raw flutter
    
    source.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Float32Array(bufferLength);
    smoothedArray = new Float32Array(bufferLength);
    
    // Initialize 8 DOM elements for peak labels
    for(let i=0; i<8; i++) {
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
  
  // Reduced attack ignores quick taps (transients); slower release holds sung notes better.
  const alphaAttack = 0.15;
  const alphaRelease = 0.02;
  const minDb = analyser.minDecibels;
  const maxDb = analyser.maxDecibels;
  
  for (let i = 0; i < binCount; i++) {
    // Normalize dB values to a 0.0 - 1.0 linear amplitude
    let amplitude = (dataArray[i] - minDb) / (maxDb - minDb);
    amplitude = Math.max(0, Math.min(1, amplitude));
    
    // Apply Peak Hold Smoothing
    if (amplitude > smoothedArray[i]) {
      smoothedArray[i] += alphaAttack * (amplitude - smoothedArray[i]);
    } else {
      smoothedArray[i] += alphaRelease * (amplitude - smoothedArray[i]);
    }
  }
  
  const minLog = Math.log10(MIN_FREQ);
  const maxLog = Math.log10(MAX_FREQ);
  const logRange = maxLog - minLog;
  const zoom = parseFloat(zoomSlider.value);
  
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
    if (freq < MIN_FREQ || freq > MAX_FREQ) continue;
    
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
    if (freq < MIN_FREQ || freq > MAX_FREQ) continue;
    
    const x = ((Math.log10(freq) - minLog) / logRange) * width;
    const y = Math.max(0, height - (smoothedArray[i] * height * zoom));
    
    points.push({x, y, freq, mag: smoothedArray[i], index: i});
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = gradSmoothed;
  ctx.lineWidth = window.devicePixelRatio * 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  
  // 3. Peak Detection Logic (finding resonant harmonics)
  const peaks = [];
  // Increased threshold ignores quiet breathing and background noise
  const threshold = Math.max(0.15, Math.max(...smoothedArray) * 0.25);
  
  for (let i = 1; i < points.length - 1; i++) {
    if (points[i].mag > threshold &&
        points[i].mag > points[i-1].mag && 
        points[i].mag > points[i+1].mag) {
      peaks.push(points[i]);
    }
  }
  
  peaks.sort((a, b) => b.mag - a.mag);
  const topPeaks = peaks.slice(0, 8); // We take more peaks now that we have a sidebar
  
  // 4. Fundamental Frequency Logic
  let rootMidi = null;
  let displayPeaks = [];
  if (topPeaks.length > 0) {
    // Sort peaks by frequency to find the fundamental (lowest harmonic)
    displayPeaks = [...topPeaks].sort((a, b) => a.freq - b.freq);
    rootMidi = getNoteFromFreq(displayPeaks[0].freq).midi;
  }
  
  // 5. Update the DOM peak-labels on the Canvas
  // To avoid DOM redraw stutters, we just iterate statically placed divs array
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
      
      // We must inject custom dynamic CSS for the pseudo-element triangle
      // Since pseudo-elements can't be styled directly via inline-styles nicely without CSS variables
      el.style.setProperty('--label-color', themeColor);
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
      el.style.opacity = '1';
    } else {
      el.style.opacity = '0';
    }
  });

  // 6. Update Sidebar
  listEl.innerHTML = '';
  displayPeaks.forEach(p => {
    const noteInfo = getNoteFromFreq(p.freq);
    const themeColor = getHarmonicColor(noteInfo.midi, rootMidi);
    
    const li = document.createElement('li');
    li.className = 'harmonic-item';
    li.style.borderLeftColor = themeColor;
    li.style.color = themeColor;
    
    li.innerHTML = `<span>${noteInfo.text}</span> <span style="font-weight:300; opacity:0.8; font-size: 0.8rem; color: white;">${Math.round(p.freq)} Hz</span>`;
    listEl.appendChild(li);
  });

  // 7. Draw Reference Grid
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.textAlign = 'center';
  ctx.font = `${10 * window.devicePixelRatio}px Outfit`;
  
  const refFrequencies = [65.41, 130.81, 261.63, 523.25, 1046.50, 2093.00, 4186.01, 8372.02];
  const refLabels = ["C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9"];
  
  refFrequencies.forEach((f, index) => {
    if (f < MIN_FREQ || f > MAX_FREQ) return;
    const x = ((Math.log10(f) - minLog) / logRange) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.fillText(refLabels[index], x, height - (10 * window.devicePixelRatio));
  });
}
