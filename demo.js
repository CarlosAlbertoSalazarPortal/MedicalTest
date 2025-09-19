import { VitalsDemo } from './vitals-demo.js';

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const cameraSelect = document.getElementById('cameraSelect');
const hrEl = document.getElementById('hrVal');
const stressEl = document.getElementById('stressVal');
const stressBadge = document.getElementById('stressBadge');
const hrvEl = document.getElementById('hrvVal');
const rrEl = document.getElementById('rrVal');
const statusEl = document.getElementById('status');
const qualityEl = document.getElementById('quality');
const pulseDot = document.getElementById('pulseDot');

const demoController = new VitalsDemo({
  videoElement: video,
  overlayCanvas: overlay,
  startButton: btnStart,
  stopButton: btnStop,
  cameraSelect,
  hrEl,
  stressEl,
  stressBadge,
  hrvEl,
  rrEl,
  statusEl,
  qualityEl,
  pulseDot,
});

demoController.refreshCameras();

window.addEventListener('pagehide', () => {
  demoController.stop();
});
