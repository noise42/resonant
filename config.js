window.AppConfig = {
  // Audio Input & FFT Limits
  FFT_SIZE: 4096,
  MIN_FREQ: 20,
  MAX_FREQ: 20000,
  minDecibels: -90,           // Noise gate cutoff (dB)

  // Smoothing & Attack behavior
  smoothingTimeConstant: 0.6, // Browser-level FFT temporal smoothing
  alphaAttack: 0.15,          // Custom peak-hold attack speed (lower = filters taps)
  alphaRelease: 0.02,         // Custom peak-hold decay speed (holds notes longer)

  // Peak Detection parameters
  peakThresholdBase: 0.15,    // Absolute volume required to even register a peak (0 to 1)
  peakThresholdRelative: 0.25,// Ratio of maximum peak to register secondary peaks
  maxPeaks: 8,                // Number of peaks tracked in Sidebar

  // Visualization State
  zoom: 0.5,                  // Current Y-scaling multiplier
  offsetY: 0                  // Current Y-panning (drag offset) in pixels
};
