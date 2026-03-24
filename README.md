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

## License
This project is provided under the underlying open-source license. See `LICENSE-2.0.txt` for more details.
