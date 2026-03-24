const startBtn = document.getElementById('start-btn');
const overlay = document.getElementById('start-overlay');
const appContainer = document.getElementById('app-container');
const canvas = document.getElementById('spectrum-canvas');
const ctx = canvas.getContext('2d');
const labelsContainer = document.getElementById('labels-container');

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

function resize() {
  canvas.width = canvas.clientWidth * window.devicePixelRatio;
  canvas.height = canvas.clientHeight * window.devicePixelRatio;
}

window.addEventListener('resize', resize);

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
    analyser.smoothingTimeConstant = 0.0; // We handle smoothing custom logic mathematically
    
    source.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Float32Array(bufferLength);
    smoothedArray = new Float32Array(bufferLength);
    
    // Initialize exactly 5 DOM elements for the peak labels
    for(let i=0; i<5; i++) {
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
  
  // Custom Smoothing Math (Fast Attack, Slow Release)
  const alphaAttack = 0.6;
  const alphaRelease = 0.04;
  
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
  
  // Gradients for aesthetics
  const gradInstant = ctx.createLinearGradient(0, height, 0, 0);
  gradInstant.addColorStop(0, 'rgba(139, 92, 246, 0.0)');
  gradInstant.addColorStop(1, 'rgba(236, 72, 153, 0.3)'); // Faint
  
  const gradSmoothed = ctx.createLinearGradient(0, height, 0, 0);
  gradSmoothed.addColorStop(0, '#8b5cf6'); // Purple bottom
  gradSmoothed.addColorStop(1, '#ec4899'); // Pink peak
  
  // 1. Draw Instantaneous Spectrum Shape (Faint)
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let i = 0; i < binCount; i++) {
    const freq = i * sampleRate / (2 * binCount);
    if (freq < MIN_FREQ || freq > MAX_FREQ) continue;
    
    let amplitude = (dataArray[i] - minDb) / (maxDb - minDb);
    amplitude = Math.max(0, Math.min(1, amplitude));
    
    const x = ((Math.log10(freq) - minLog) / logRange) * width;
    const y = height - (amplitude * height);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(width, height);
  ctx.fillStyle = gradInstant;
  ctx.fill();
  
  // 2. Draw Smoothed Spectrum Line (Bold)
  ctx.beginPath();
  ctx.moveTo(0, height);
  const points = [];
  for (let i = 0; i < binCount; i++) {
    const freq = i * sampleRate / (2 * binCount);
    if (freq < MIN_FREQ || freq > MAX_FREQ) continue;
    
    const x = ((Math.log10(freq) - minLog) / logRange) * width;
    const y = height - (smoothedArray[i] * height);
    
    points.push({x, y, freq, mag: smoothedArray[i], index: i});
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = gradSmoothed;
  ctx.lineWidth = window.devicePixelRatio * 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  
  // 3. Peak Detection Logic
  const peaks = [];
  const threshold = Math.max(0.08, Math.max(...smoothedArray) * 0.15); // Dynamic Noise Threshold
  
  for (let i = 1; i < points.length - 1; i++) {
    // Local Maximum Check
    if (points[i].mag > threshold &&
        points[i].mag > points[i-1].mag && 
        points[i].mag > points[i+1].mag) {
      peaks.push(points[i]);
    }
  }
  
  // Sort by Magnitude Descending
  peaks.sort((a, b) => b.mag - a.mag);
  const topPeaks = peaks.slice(0, 5);
  
  // 4. Update the DOM peak-labels (translate Canvas coordinates to CSS %)
  const labelEls = document.querySelectorAll('.peak-label');
  labelEls.forEach((el, i) => {
    if (i < topPeaks.length) {
      const p = topPeaks[i];
      const noteInfo = getNoteFromFreq(p.freq);
      
      let labelText = noteInfo.text;
      if (labelText === "A4") labelText = "A4 (440Hz)";
      
      el.textContent = labelText;
      
      const displayX = (p.x / width) * 100;
      const displayY = (p.y / height) * 100;
      
      el.style.left = `${displayX}%`;
      el.style.top = `${displayY}%`;
      el.style.opacity = '1';
    } else {
      el.style.opacity = '0';
    }
  });

  // 5. Draw simple Reference Grid (octave marker 'C' approximations)
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.textAlign = 'center';
  ctx.font = `${10 * window.devicePixelRatio}px Outfit`;
  
  // Octaves of C roughly: C2(65), C3(130), C4(261), C5(523), C6(1046), C7(2093)
  const refFrequencies = [65.41, 130.81, 261.63, 523.25, 1046.50, 2093.00, 4186.01, 8372.02];
  const refLabels = ["C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9"];
  
  refFrequencies.forEach((f, index) => {
    if (f < MIN_FREQ || f > MAX_FREQ) return;
    const x = ((Math.log10(f) - minLog) / logRange) * width;
    
    // Grid Line
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    
    // Label
    ctx.fillText(refLabels[index], x, height - (10 * window.devicePixelRatio));
  });
}
