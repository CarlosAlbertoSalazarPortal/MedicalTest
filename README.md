# OpenVitals Monitor

OpenVitals Monitor is a lightweight web experience that demonstrates camera-based vital sign extraction without any proprietary branding. It includes a reusable JavaScript SDK (`sdk.js`) so you can embed remote photoplethysmography (rPPG) capture inside your own applications.

The demo highlights:

- **Heart rate** derived from per-frame skin color fluctuations.
- **Stress index** computed from short-term heart-rate variability (RMSSD).
- **Respiratory trend** estimated from the low-frequency component of the signal.
- **Signal quality feedback** so operators can guide users in real time.

> ⚠️ This project is for wellness, experimentation and research. It is **not** a medical device and does not provide diagnoses.

## Project structure

| File | Description |
| --- | --- |
| `index.html` | Landing page + live capture modal. |
| `demo.html` | Standalone page that runs the live capture experience. |
| `app.js` | Landing page modal wiring built on the shared controller. |
| `demo.js` | Entry file for the standalone demo page. |
| `vitals-demo.js` | Reusable UI controller that connects DOM elements to the SDK. |
| `sdk.js` | Standalone CameraVitalsSDK implementation. |
| `styles.css` | Shared styling for the landing page, modal and demo page. |
| `manifest.webmanifest`, `sw.js` | Minimal PWA setup for install/offline caching. |

## Running locally

1. Serve the folder over HTTPs or `localhost` (camera access is restricted otherwise). Examples:
   - Python 3: `python -m http.server 8000`
   - Node.js: `npx http-server`
2. Open `http://localhost:8000` in Chrome, Edge or Safari.
3. Either:
   - Click **Launch live capture** → **Start** in the modal, or
   - Navigate to [`/demo.html`](demo.html) for the fullscreen demo experience.
   Keep your face still for ~20 seconds while the signal calibrates.

For iOS/Android devices open the site via HTTPS (or `localhost` if debugging) to allow the browser to access the camera.

## SDK quick start

```js
import { CameraVitalsSDK } from './sdk.js';

const sdk = new CameraVitalsSDK({
  videoElement: document.querySelector('#video'),
  overlayCanvas: document.querySelector('#overlay'),
});

const cameras = await sdk.listCameras({ requestAccess: true });
await sdk.start({ deviceId: cameras[0]?.deviceId });

sdk.addEventListener('metrics', (event) => {
  const { heartRate, stressScore, breathingRate, hrvMs, signalQuality } = event.detail;
  console.log({ heartRate, stressScore, breathingRate, hrvMs, signalQuality });
});
```

### Events

- `metrics` → Fired roughly 3× per second with the latest readings.
- `status` → Textual updates (requesting permission, calibrating, capturing, etc.).
- `error` → When something goes wrong (permission denied, unsupported browser…).
- `cameralist` → Emitted after `listCameras()` resolves.

### Methods

- `listCameras({ requestAccess })` → Returns available `MediaDeviceInfo` camera entries. Set `requestAccess` to `true` to proactively ask for permission so device labels are populated.
- `start({ deviceId })` → Requests `getUserMedia`, plays the provided video element and starts sampling.
- `stop()` → Stops the camera, clears buffers and detaches resize listeners.

Each `metrics` event includes:

- `heartRate` (bpm) if stable peaks are detected.
- `stressScore` (0–100) mapped from RMSSD.
- `hrvMs` (ms) rounded RMSSD.
- `breathingRate` (rpm) based on slow oscillations.
- `signalQuality` (0–1) from the filter amplitude.
- `beatPhase` (0–1) estimating time since the last beat.

## Deployment

Any static hosting service (GitHub Pages, Netlify, Vercel, S3+CloudFront, etc.) works—just ensure the site is served over HTTPS.

## License

MIT.
