export class CameraVitalsSDK extends EventTarget {
  constructor({ videoElement, overlayCanvas } = {}) {
    super();
    if (!videoElement) {
      throw new Error('videoElement is required');
    }
    this.video = videoElement;
    this.overlay = overlayCanvas || null;
    this.ctx = this.overlay ? this.overlay.getContext('2d') : null;

    this.stream = null;
    this.track = null;
    this.running = false;
    this.rafId = null;

    this._times = [];
    this._rawVals = [];
    this._filtVals = [];
    this._breathVals = [];
    this._peakTimes = [];

    this._bpState = { hp: 0, lp: 0, prev: 0 };
    this._brState = { lp: 0 };

    this._onResize = () => this._fitCanvas();
  }

  async listCameras({ requestAccess = false } = {}) {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error('Camera enumeration is not supported in this browser');
    }

    if (requestAccess) {
      try {
        const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        tmp.getTracks().forEach((track) => track.stop());
      } catch (err) {
        this._dispatchError('camera-permission', err);
        throw err;
      }
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((d) => d.kind === 'videoinput');
    this.dispatchEvent(new CustomEvent('cameralist', { detail: cameras }));
    return cameras;
  }

  async start({ deviceId } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('getUserMedia is not supported in this browser');
    }

    await this.stop();
    this._dispatchStatus('Requesting camera access…');

    try {
      const facingMode = deviceId ? undefined : 'user';
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 60 },
          deviceId: deviceId ? { exact: deviceId } : undefined,
          facingMode,
        },
      });
      this.video.srcObject = this.stream;
      this.track = this.stream.getVideoTracks()[0] || null;
      await this.video.play();

      if (this.overlay) {
        this._fitCanvas();
        window.addEventListener('resize', this._onResize);
      }

      this._mirrorVideoIfNeeded();
      this._resetBuffers();
      this.running = true;
      this._dispatchStatus('Calibrating… hold still.');
      this._sampleLoop();
    } catch (err) {
      this._dispatchError('camera-start', err);
      this._dispatchStatus('Camera error. Allow permissions and use HTTPS.');
      throw err;
    }
  }

  async stop() {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
    }
    this.stream = null;
    this.track = null;

    if (this.overlay) {
      window.removeEventListener('resize', this._onResize);
      this._clearOverlay();
    }

    if (this.video) {
      this.video.srcObject = null;
    }

    this._resetBuffers();
    this._dispatchStatus('Stopped.');
  }

  /* Internal helpers */
  _fitCanvas() {
    if (!this.overlay) return;
    this.overlay.width = this.video?.clientWidth || this.overlay.width;
    this.overlay.height = this.video?.clientHeight || this.overlay.height;
  }

  _clearOverlay() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  _mirrorVideoIfNeeded() {
    if (!this.track) return;
    try {
      const settings = this.track.getSettings?.() || {};
      const isFront = settings.facingMode === 'user' || settings.facingMode === 'front';
      this.video.style.transform = isFront ? 'scaleX(-1)' : 'none';
    } catch (err) {
      console.warn('Cannot read facing mode', err);
    }
  }

  _sampleLoop() {
    if (!this.running) return;
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;

    if (!vw || !vh) {
      this.rafId = requestAnimationFrame(() => this._sampleLoop());
      return;
    }

    if (!this._scratch) {
      this._scratch = document.createElement('canvas');
      this._scratchCtx = this._scratch.getContext('2d', { willReadFrequently: true });
    }
    this._scratch.width = vw;
    this._scratch.height = vh;

    this._scratchCtx.drawImage(this.video, 0, 0, vw, vh);
    const { sx, sy, sw, sh } = this._roiOnVideo();
    const frame = this._scratchCtx.getImageData(sx, sy, sw, sh).data;

    let sum = 0;
    for (let i = 0; i < frame.length; i += 4) {
      sum += frame[i + 1];
    }
    const avgGreen = sum / (frame.length / 4 || 1);

    const now = performance.now() / 1000;
    const dt = this._times.length ? now - this._times[this._times.length - 1] : 1 / 30;

    const cardiac = this._bandpass(avgGreen, dt, this._bpState);
    const breath = this._lowpass(avgGreen, dt, this._brState, 0.33);

    this._pushSample(now, avgGreen, cardiac, breath);

    if (!this._lastOverlay || now - this._lastOverlay > 0.25) {
      this._drawOverlay();
      this._lastOverlay = now;
    }

    if (!this._lastMetrics || now - this._lastMetrics > 0.3) {
      const metrics = this._computeMetrics();
      this.dispatchEvent(new CustomEvent('metrics', { detail: metrics }));
      this._lastMetrics = now;
    }

    this.rafId = requestAnimationFrame(() => this._sampleLoop());
  }

  _roiRect() {
    if (!this.overlay) {
      return { x: 0.27, y: 0.2, w: 0.46, h: 0.18 };
    }
    const w = this.overlay.width;
    const h = this.overlay.height;
    const rw = w * 0.46;
    const rh = h * 0.18;
    const rx = (w - rw) / 2;
    const ry = h * 0.22 - rh / 2;
    return { x: rx, y: ry, w: rw, h: rh };
  }

  _roiOnVideo() {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const ow = this.overlay?.clientWidth || this.video.clientWidth || vw;
    const oh = this.overlay?.clientHeight || this.video.clientHeight || vh;
    const r = this._roiRect();
    return {
      sx: Math.max(0, Math.floor(r.x * vw / ow)),
      sy: Math.max(0, Math.floor(r.y * vh / oh)),
      sw: Math.max(1, Math.floor(r.w * vw / ow)),
      sh: Math.max(1, Math.floor(r.h * vh / oh)),
    };
  }

  _drawOverlay() {
    if (!this.ctx || !this.overlay) return;
    const w = this.overlay.width;
    const h = this.overlay.height;
    this.ctx.clearRect(0, 0, w, h);

    const r = this._roiRect();
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(96,165,250,0.85)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 6]);
    this.ctx.strokeRect(r.x, r.y, r.w, r.h);
    this.ctx.restore();

    this.ctx.fillStyle = 'rgba(20,27,45,0.75)';
    this.ctx.fillRect(12, 12, 72, 26);
    this.ctx.fillStyle = '#60a5fa';
    this.ctx.font = '12px system-ui';
    this.ctx.fillText('LIVE', 40, 28);
    this.ctx.beginPath();
    this.ctx.fillStyle = '#34d399';
    this.ctx.arc(24, 25, 6, 0, Math.PI * 2);
    this.ctx.fill();
  }

  _pushSample(time, raw, filtered, breath) {
    const MAX_SECONDS = 25;
    this._times.push(time);
    this._rawVals.push(raw);
    this._filtVals.push(filtered);
    this._breathVals.push(breath);

    const limit = time - MAX_SECONDS;
    while (this._times.length && this._times[0] < limit) {
      this._times.shift();
      this._rawVals.shift();
      this._filtVals.shift();
      this._breathVals.shift();
    }
  }

  _resetBuffers() {
    this._times.length = 0;
    this._rawVals.length = 0;
    this._filtVals.length = 0;
    this._breathVals.length = 0;
    this._peakTimes.length = 0;
    this._bpState.hp = this._bpState.lp = this._bpState.prev = 0;
    this._brState.lp = 0;
  }

  _bandpass(value, dt, state) {
    const fcHP = 0.7;
    const rcHP = 1 / (2 * Math.PI * fcHP);
    const aHP = rcHP / (rcHP + dt);
    state.hp = aHP * (state.hp + value - state.prev);
    state.prev = value;

    const fcLP = 3.0;
    const rcLP = 1 / (2 * Math.PI * fcLP);
    const aLP = dt / (rcLP + dt);
    state.lp = state.lp + aLP * (state.hp - state.lp);
    return state.lp;
  }

  _lowpass(value, dt, state, fc = 0.35) {
    const rc = 1 / (2 * Math.PI * fc);
    const a = dt / (rc + dt);
    state.lp = state.lp + a * (value - state.lp);
    return state.lp;
  }

  _computeMetrics() {
    const now = this._times[this._times.length - 1] || 0;

    const peaks = this._detectPeaks(this._filtVals, this._times, 0.33);
    const merged = [...this._peakTimes];
    for (const peak of peaks) {
      if (!merged.length || peak - merged[merged.length - 1] > 0.25) {
        merged.push(peak);
      }
    }
    const keep = merged.filter((t) => now - t <= 18);
    this._peakTimes.length = 0;
    this._peakTimes.push(...keep);

    const ibis = [];
    for (let i = 1; i < this._peakTimes.length; i++) {
      const interval = this._peakTimes[i] - this._peakTimes[i - 1];
      if (interval >= 0.33 && interval <= 1.6) {
        ibis.push(interval);
      }
    }

    const medianIbi = this._median(ibis);
    const heartRate = medianIbi ? Math.round(60 / medianIbi) : NaN;

    const hrvMs = this._rmssd(ibis);
    const stressScore = this._stressFromRmssd(hrvMs);

    const breathingRate = this._estimateBreathing();

    const signalStrength = this._signalQuality();

    const lastBeat = this._peakTimes.length ? this._peakTimes[this._peakTimes.length - 1] : null;
    const beatPhase = lastBeat ? (now - lastBeat) * (heartRate ? heartRate / 60 : 0) : null;

    if (Number.isFinite(heartRate) && this._peakTimes.length >= 4) {
      this._dispatchStatus('Capturing in real time.');
    }

    return {
      timestamp: now,
      heartRate: Number.isFinite(heartRate) ? heartRate : null,
      stressScore: Number.isFinite(stressScore) ? stressScore : null,
      hrvMs: Number.isFinite(hrvMs) ? Math.round(hrvMs) : null,
      breathingRate: Number.isFinite(breathingRate) ? Math.round(breathingRate) : null,
      beatPhase,
      signalQuality: signalStrength,
      samplesCollected: this._times.length,
    };
  }

  _estimateBreathing() {
    if (this._breathVals.length < 30) return NaN;
    const breathPeaks = this._detectPeaks(this._breathVals, this._times, 1.6, 0.2);
    if (breathPeaks.length < 2) return NaN;
    const intervals = [];
    for (let i = 1; i < breathPeaks.length; i++) {
      const interval = breathPeaks[i] - breathPeaks[i - 1];
      if (interval > 1 && interval < 10) intervals.push(interval);
    }
    const medianBreath = this._median(intervals);
    return medianBreath ? 60 / medianBreath : NaN;
  }

  _signalQuality() {
    if (this._filtVals.length < 30) return 0;
    const slice = this._filtVals.slice(-120);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / slice.length;
    const std = Math.sqrt(Math.max(variance, 0));
    const normalized = Math.max(0, Math.min(1, std / 20));
    return Math.round(normalized * 100) / 100;
  }

  _detectPeaks(series, timeSeries, minDistance, thresholdScale = 0.5) {
    const n = series.length;
    if (n < 5) return [];
    const mean = series.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(series.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n) || 1;
    const threshold = mean + thresholdScale * sd;
    const peaks = [];
    for (let i = 2; i < n - 2; i++) {
      const v = series[i];
      if (v > threshold && v > series[i - 1] && v > series[i + 1] && v >= series[i - 2] && v >= series[i + 2]) {
        const t = timeSeries[i];
        if (!peaks.length || t - peaks[peaks.length - 1] >= minDistance) {
          peaks.push(t);
        }
      }
    }
    return peaks;
  }

  _median(values) {
    if (!values.length) return NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  _rmssd(ibis) {
    if (ibis.length < 3) return NaN;
    let sum = 0;
    let count = 0;
    for (let i = 1; i < ibis.length; i++) {
      const diff = ibis[i] - ibis[i - 1];
      sum += diff * diff;
      count++;
    }
    return Math.sqrt(sum / Math.max(count, 1)) * 1000;
  }

  _stressFromRmssd(rmssdMs) {
    if (!Number.isFinite(rmssdMs)) return NaN;
    const clamped = Math.max(15, Math.min(100, rmssdMs));
    return Math.round(100 - ((clamped - 15) / (100 - 15)) * 100);
  }

  _dispatchStatus(message) {
    this.dispatchEvent(new CustomEvent('status', { detail: message }));
  }

  _dispatchError(type, error) {
    this.dispatchEvent(new CustomEvent('error', { detail: { type, error } }));
  }
}
