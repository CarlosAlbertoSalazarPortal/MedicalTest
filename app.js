import { VitalsDemo } from './vitals-demo.js';

const modal = document.getElementById('demoModal');
const btnOpenDemo = document.getElementById('btnOpenDemo');
const btnOpenDemo2 = document.getElementById('btnOpenDemo2');
const btnCloseDemo = document.getElementById('btnCloseDemo');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const cameraSelect = document.getElementById('cameraSelect');
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
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

function openDemo() {
  modal.classList.add('show');
  demoController.reset();
  demoController.refreshCameras();
}

async function closeDemo() {
  modal.classList.remove('show');
  await demoController.stop();
  demoController.reset();
}

btnOpenDemo?.addEventListener('click', openDemo);
btnOpenDemo2?.addEventListener('click', openDemo);
btnCloseDemo?.addEventListener('click', closeDemo);

modal?.addEventListener('click', (event) => {
  if (event.target === modal) {
    closeDemo();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal.classList.contains('show')) {
    closeDemo();
  }
});

window.addEventListener('pagehide', () => {
  demoController.stop();
});
