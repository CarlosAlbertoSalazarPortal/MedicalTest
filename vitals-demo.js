import { CameraVitalsSDK } from './sdk.js';

export class VitalsDemo {
  constructor({
    videoElement,
    overlayCanvas,
    startButton,
    stopButton,
    cameraSelect,
    hrEl,
    stressEl,
    stressBadge,
    hrvEl,
    rrEl,
    statusEl,
    qualityEl,
    pulseDot,
  }) {
    this.videoElement = videoElement;
    this.overlayCanvas = overlayCanvas;
    this.startButton = startButton;
    this.stopButton = stopButton;
    this.cameraSelect = cameraSelect;
    this.hrEl = hrEl;
    this.stressEl = stressEl;
    this.stressBadge = stressBadge;
    this.hrvEl = hrvEl;
    this.rrEl = rrEl;
    this.statusEl = statusEl;
    this.qualityEl = qualityEl;
    this.pulseDot = pulseDot;

    this.sdk = new CameraVitalsSDK({
      videoElement: this.videoElement,
      overlayCanvas: this.overlayCanvas,
    });

    this.camerasCache = [];

    this.startMeasurement = this.startMeasurement.bind(this);
    this.stopMeasurement = this.stopMeasurement.bind(this);

    this.startButton?.addEventListener('click', this.startMeasurement);
    this.stopButton?.addEventListener('click', this.stopMeasurement);

    this.sdk.addEventListener('status', (event) => {
      if (this.statusEl) {
        this.statusEl.textContent = event.detail || '';
      }
    });

    this.sdk.addEventListener('error', (event) => {
      const { type, error } = event.detail || {};
      console.error('CameraVitalsSDK error:', type, error);
      if (this.statusEl) {
        this.statusEl.textContent = 'An error occurred. Check permissions and lighting.';
      }
    });

    this.sdk.addEventListener('metrics', (event) => {
      this.updateMetrics(event.detail || {});
    });

    this.reset();
  }

  reset() {
    if (this.hrEl) this.hrEl.textContent = '–';
    if (this.stressEl) this.stressEl.textContent = '–';
    if (this.stressBadge) {
      this.stressBadge.textContent = '—';
      this.stressBadge.style.color = '';
      this.stressBadge.style.borderColor = '';
    }
    if (this.hrvEl) this.hrvEl.textContent = '–';
    if (this.rrEl) this.rrEl.textContent = '–';
    if (this.qualityEl) {
      this.qualityEl.textContent = 'Signal quality: —';
      this.qualityEl.style.borderColor = '';
    }
    if (this.pulseDot) {
      this.pulseDot.style.boxShadow = '0 0 0 0 rgba(52, 211, 153, 0.6)';
      this.pulseDot.style.background = '#334155';
    }
    if (this.statusEl) {
      this.statusEl.textContent = '';
    }
    if (this.startButton) this.startButton.disabled = false;
    if (this.stopButton) this.stopButton.disabled = true;
  }

  async refreshCameras({ requestAccess = true } = {}) {
    if (!this.cameraSelect) return;

    try {
      this.camerasCache = await this.sdk.listCameras({ requestAccess });
      this.cameraSelect.innerHTML = '';
      this.camerasCache.forEach((camera, index) => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        option.textContent = camera.label || `Camera ${index + 1}`;
        this.cameraSelect.appendChild(option);
      });

      const preferred = this.camerasCache.find((camera) =>
        /front|user|frontal|face/i.test(camera.label || '')
      );
      if (preferred) {
        this.cameraSelect.value = preferred.deviceId;
      }

      if (!this.camerasCache.length) {
        if (this.statusEl) {
          this.statusEl.textContent = 'No cameras detected. Connect a camera and reload.';
        }
        if (this.startButton) this.startButton.disabled = true;
      } else if (this.stopButton?.disabled) {
        if (this.startButton) this.startButton.disabled = false;
      }
    } catch (error) {
      if (this.statusEl) {
        this.statusEl.textContent = 'Unable to list cameras. Check permissions and HTTPS.';
      }
    }
  }

  async startMeasurement() {
    if (this.startButton) this.startButton.disabled = true;
    if (this.stopButton) this.stopButton.disabled = false;
    if (this.statusEl) this.statusEl.textContent = 'Starting camera…';

    try {
      await this.sdk.start({ deviceId: this.cameraSelect?.value || undefined });
    } catch (error) {
      if (this.startButton) this.startButton.disabled = false;
      if (this.stopButton) this.stopButton.disabled = true;
      if (this.statusEl) {
        this.statusEl.textContent = 'Unable to start capture. Verify camera permissions and availability.';
      }
    }
  }

  async stopMeasurement() {
    if (this.startButton) this.startButton.disabled = false;
    if (this.stopButton) this.stopButton.disabled = true;
    await this.sdk.stop();
  }

  async stop() {
    await this.sdk.stop();
    if (this.startButton) this.startButton.disabled = false;
    if (this.stopButton) this.stopButton.disabled = true;
  }

  updateMetrics({ heartRate, stressScore, hrvMs, breathingRate, beatPhase, signalQuality }) {
    if (Number.isFinite(heartRate)) {
      if (this.hrEl) this.hrEl.textContent = heartRate;
    } else if (this.hrEl) {
      this.hrEl.textContent = '–';
    }

    if (Number.isFinite(stressScore)) {
      if (this.stressEl) this.stressEl.textContent = stressScore;
      if (this.stressBadge) {
        this.stressBadge.textContent = stressScore >= 66 ? 'High' : stressScore >= 33 ? 'Medium' : 'Low';
        const color = stressScore >= 66 ? '#f87171' : stressScore >= 33 ? '#fbbf24' : '#34d399';
        const border = stressScore >= 66 ? '#fca5a5' : stressScore >= 33 ? '#fde68a' : '#86efac';
        this.stressBadge.style.color = border;
        this.stressBadge.style.borderColor = color;
      }
    } else {
      if (this.stressEl) this.stressEl.textContent = '–';
      if (this.stressBadge) {
        this.stressBadge.textContent = '—';
        this.stressBadge.style.color = '';
        this.stressBadge.style.borderColor = '';
      }
    }

    if (Number.isFinite(hrvMs)) {
      if (this.hrvEl) this.hrvEl.textContent = hrvMs;
    } else if (this.hrvEl) {
      this.hrvEl.textContent = '–';
    }

    if (Number.isFinite(breathingRate)) {
      if (this.rrEl) this.rrEl.textContent = breathingRate;
    } else if (this.rrEl) {
      this.rrEl.textContent = '–';
    }

    if (beatPhase != null && Number.isFinite(beatPhase) && this.pulseDot) {
      const scale = Math.max(0, 1 - Math.min(beatPhase, 1));
      const radius = Math.round(scale * 18);
      this.pulseDot.style.boxShadow = `0 0 0 ${radius}px rgba(52,211,153,0.65)`;
      this.pulseDot.style.background = '#34d399';
    } else if (this.pulseDot) {
      this.pulseDot.style.boxShadow = '0 0 0 0 rgba(52,211,153,0.6)';
      this.pulseDot.style.background = '#334155';
    }

    if (Number.isFinite(signalQuality)) {
      const qualityPercent = Math.round(signalQuality * 100);
      if (this.qualityEl) {
        this.qualityEl.textContent = `Signal quality: ${qualityPercent}%`;
        this.qualityEl.style.borderColor = signalQuality > 0.6 ? '#34d399' : signalQuality > 0.3 ? '#fbbf24' : '#f87171';
      }
    } else if (this.qualityEl) {
      this.qualityEl.textContent = 'Signal quality: —';
      this.qualityEl.style.borderColor = '';
    }
  }
}
