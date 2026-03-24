# Vocal Resonator

A sleek, real-time 12-TET audio spectrum and harmonic analyzer built as a Progressive Web App (PWA).

## Features
- **Real-Time FFT:** Low-latency frequency visualization using the native Web Audio API.
- **Peak Hold & Time Smoothing:** A custom "Fast Attack, Slow Release" algorithm visually holds the most prominent vocal resonances so they are easier to read.
- **Dynamic Note Labeling:** Automatically detects the loudest harmonics and overlays their exact 12-TET musical note (e.g., `C4`, `A4`).
- **Glassmorphism UI:** A stunning, modern dark-mode interface optimized for both desktop and mobile devices.

## Live Demo
Check out the live version here: [https://noise42.github.io/resonant](https://noise42.github.io/resonant)

## Local Development
To run the analyzer locally on your machine, you must host it via a local web server (because modern browsers restrict microphone access on the `file://` protocol for security reasons).

1. Clone the repository:
   ```bash
   git clone https://github.com/noise42/resonant.git
   cd resonant
   ```

2. Start a local HTTP server:
   ```bash
   # Using Python 3
   python3 -m http.server 8000
   ```

3. Open your browser and navigate to [http://localhost:8000](http://localhost:8000).

## Scientific References
The acoustic features (NHR, HNR, and Harmonic Cleanliness/Richness) implemented in this analyzer draw upon established vocal quality measurement algorithms and normative thresholds from the following literature:

1. **Yumoto, E., Sasaki, Y., & Okamura, H.** — *Harmonics-to-noise ratio and psychophysical measurement of the degree of hoarseness* — Relevant for identifying pathological thresholds (HNR > 7.4 dB).
2. **Boersma, P. (1993)** — *Accurate short-term analysis of the fundamental frequency and the harmonics-to-noise ratio of a sampled sound* (Proceedings of the Institute of Phonetic Sciences, Amsterdam) — Foundational method for HNR calculation in Praat.
3. **Brockmann-Bauser, M. et al.** — Research on jitter/shimmer/NHR algorithms and influencing factors (SPL, voice usage).
4. **Marques de Medeiros, M. et al. (2006)** — *Standardization of acoustic measures for normal voice patterns* (Brazilian Journal of Otorhinolaryngology) — Direct source for normative values: jitter (0.49–0.62%) and HNR (~9.5–11 dB).
5. **Sederholm, E. et al. (1999)** — *Acoustic analysis of the normal voice in nonsmoking adults* — Source for jitter threshold < 0.5% and healthy HNR at 95th percentile ~18 dB.
6. **de Araújo Pernambuco, L. et al.** — *Noise-to-Harmonics Ratio as an Acoustic Measure of Voice Disorders in Boys* (Journal of Voice) — Source for the 1.92 odds ratio for every 0.01 increase in NHR.
7. **Orlikoff, R.F. (2003)** — *Harmonics-to-Noise Ratio: An Index of Vocal Aging* (Journal of Voice) — Source for normal adult HNR ranges of 11–13 dB.

## License
This project is provided under the underlying open-source license. See `LICENSE-2.0.txt` for more details.
