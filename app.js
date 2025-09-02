// Minimal demo app: rPPG (cara), HR + Estrés estimado. No médico.
(() => {
  // Elements
  const btnOpenDemo = document.getElementById('btnOpenDemo');
  const btnOpenDemo2 = document.getElementById('btnOpenDemo2');
  const btnOpenDemo3 = document.getElementById('btnOpenDemo3');
  const modal = document.getElementById('demoModal');
  const btnCloseDemo = document.getElementById('btnCloseDemo');
  const btnStart = document.getElementById('btnStart');
  const btnStop = document.getElementById('btnStop');
  const cameraSelect = document.getElementById('cameraSelect');
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const roiDiv = document.getElementById('roi');
  const hrEl = document.getElementById('hrVal');
  const stressEl = document.getElementById('stressVal');
  const stressBadge = document.getElementById('stressBadge');
  const pulseDot = document.getElementById('pulseDot');
  const statusEl = document.getElementById('status');

  const openDemo = () => { modal.classList.add('show'); };
  const closeDemo = () => { modal.classList.remove('show'); stopMeasurement(); };

  btnOpenDemo?.addEventListener('click', openDemo);
  btnOpenDemo2?.addEventListener('click', openDemo);
  btnOpenDemo3?.addEventListener('click', openDemo);
  btnCloseDemo?.addEventListener('click', closeDemo);

  // Camera state
  let stream = null, track = null, running = false, rafId = null;
  const ctx = overlay.getContext('2d');

  // Buffers
  const times=[], rawVals=[], filtVals=[], breathVals=[], peakTimes=[];
  const MAX_SECONDS=20, MIN_IBI=0.33, MAX_IBI=1.5;

  // Filters state
  const bpState = { hp:0, lp:0, prev:0 };
  const brState = { lp:0 };

  // Helpers
  function fitCanvas(){ overlay.width = video.clientWidth; overlay.height = video.clientHeight; }
  window.addEventListener('resize', fitCanvas);

  async function listCameras(){
    cameraSelect.innerHTML = '';
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === 'videoinput');
    const preferred = cams.find(d => /front|user|frontal/i.test(d.label)) || cams[0];
    cams.forEach((d,i)=>{
      const opt=document.createElement('option');
      opt.value=d.deviceId; opt.textContent=d.label || `Cámara ${i+1}`;
      cameraSelect.appendChild(opt);
    });
    if (preferred) cameraSelect.value = preferred.deviceId;
  }

  async function startCamera(){
    if (stream) stopCamera();
    const deviceId = cameraSelect.value || undefined;
    const facingMode = deviceId ? undefined : 'user';
    stream = await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{ width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30,max:60},
              deviceId: deviceId ? {exact:deviceId} : undefined, facingMode }
    });
    video.srcObject = stream;
    track = stream.getVideoTracks()[0];
    await video.play();
    fitCanvas();

    // Mirror if front camera
    try {
      const s = track.getSettings?.() || {};
      const isFront = (s.facingMode === 'user' || s.facingMode === 'front');
      video.style.transform = isFront ? 'scaleX(-1)' : 'none';
    } catch(e){/*noop*/}
  }
  function stopCamera(){
    if (stream) { stream.getTracks().forEach(t=>t.stop()); stream=null; track=null; }
  }

  // Simple filters
  function bandpass(v, dt, s){
    const fcHP=0.7, rcHP=1/(2*Math.PI*fcHP), aHP=rcHP/(rcHP+dt);
    s.hp = aHP*(s.hp + v - s.prev); s.prev = v;
    const fcLP=3.0, rcLP=1/(2*Math.PI*fcLP), aLP=dt/(rcLP+dt);
    s.lp = s.lp + aLP*(s.hp - s.lp);
    return s.lp;
  }
  function lowpass(v, dt, s, fc=0.35){
    const rc=1/(2*Math.PI*fc), a=dt/(rc+dt); s.lp = s.lp + a*(v - s.lp); return s.lp;
  }
  function detectPeaks(series, timeSeries, minDist){
    const n=series.length; if(n<5) return [];
    const mean=series.reduce((a,b)=>a+b,0)/n;
    const sd=Math.sqrt(series.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n)||1;
    const thr=mean+0.5*sd;
    const peaks=[];
    for(let i=2;i<n-2;i++){
      const v=series[i];
      if(v>thr && v>series[i-1] && v>series[i+1] && v>=series[i-2] && v>=series[i+2]){
        const t=timeSeries[i];
        if(!peaks.length || (t - peaks[peaks.length-1]) >= minDist) peaks.push(t);
      }
    }
    return peaks;
  }
  const median = arr => { const s=[...arr].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):NaN; };
  function rmssd(ibiSec){ if(ibiSec.length<3) return NaN; let sum=0,c=0; for(let i=1;i<ibiSec.length;i++){const d=(ibiSec[i]-ibiSec[i-1]); sum+=d*d; c++;} return Math.sqrt(sum/Math.max(c,1))*1000; }
  function stressScore(rmssdMs){ if(!isFinite(rmssdMs)) return NaN; const cl=Math.max(15,Math.min(100,rmssdMs)); return Math.round(100-((cl-15)/(100-15))*100); }

  function roiRect(){
    const w=overlay.width, h=overlay.height;
    const rw=w*0.45, rh=h*0.18, rx=(w-rw)/2, ry=h*0.22 - rh/2;
    return {x:rx,y:ry,w:rw,h:rh};
  }
  function drawOverlay(){
    const w=overlay.width,h=overlay.height; const ctx2=ctx;
    ctx2.clearRect(0,0,w,h);
    const r=roiRect();
    ctx2.strokeStyle='rgba(96,165,250,.85)'; ctx2.lineWidth=2; ctx2.setLineDash([6,6]); ctx2.strokeRect(r.x,r.y,r.w,r.h); ctx2.setLineDash([]);
    ctx2.fillStyle='rgba(20,20,20,.6)'; ctx2.fillRect(8,8,70,24);
    ctx2.fillStyle='#e5e7eb'; ctx2.font='12px system-ui'; ctx2.fillText('LIVE',38,24);
    ctx2.fillStyle='#f87171'; ctx2.beginPath(); ctx2.arc(20,20,6,0,Math.PI*2); ctx2.fill();
  }

  function pushSample(t, raw, filt, br){
    times.push(t); rawVals.push(raw); filtVals.push(filt); breathVals.push(br);
    const limit=t - MAX_SECONDS;
    while(times.length && times[0] < limit){ times.shift(); rawVals.shift(); filtVals.shift(); breathVals.shift(); }
  }

  function computeMetrics(){
    const now = times[times.length-1] || 0;

    // Heart peaks
    const pks = detectPeaks(filtVals, times, MIN_IBI);
    const merged = [...peakTimes];
    for(const p of pks) if(!merged.length || p - merged[merged.length-1] > 0.25) merged.push(p);
    const keep = merged.filter(t => now - t <= 15);
    peakTimes.length=0; peakTimes.push(...keep);
    const ibis=[];
    for(let i=1;i<peakTimes.length;i++){
      const ibi = peakTimes[i] - peakTimes[i-1];
      if(ibi>=MIN_IBI && ibi<=MAX_IBI) ibis.push(ibi);
    }
    const mIbi = median(ibis);
    const hr = mIbi ? Math.round(60/mIbi) : NaN;

    const hrvMs = rmssd(ibis);
    const stress = stressScore(hrvMs);

    // UI
    hrEl.textContent = isFinite(hr) ? hr : '–';
    if (isFinite(stress)){
      stressEl.textContent = stress;
      stressBadge.textContent = stress>=66?'Alto':(stress>=33?'Medio':'Bajo');
      stressBadge.style.borderColor = stress>=66?'#f87171':(stress>=33?'#fbbf24':'#34d399');
      stressBadge.style.color = stress>=66?'#fca5a5':(stress>=33?'#fde68a':'#86efac');
    } else {
      stressEl.textContent = '–'; stressBadge.textContent='—';
      stressBadge.style.color = ''; stressBadge.style.borderColor = '';
    }

    // Pulse dot animation
    if (isFinite(hr) && peakTimes.length){
      const lastPeak = peakTimes[peakTimes.length-1];
      const dt = (now - lastPeak) * (hr/60); // 1 around next beat
      const scale = Math.max(0, 1 - dt);
      pulseDot.style.boxShadow = `0 0 0 ${Math.round(scale*18)}px rgba(52,211,153,0.6)`;
      pulseDot.style.background = '#34d399';
    } else {
      pulseDot.style.boxShadow = '0 0 0 0 rgba(52,211,153,0.6)';
      pulseDot.style.background = '#334155';
    }
  }

  function getRoiOnVideo(){
    const vw = video.videoWidth, vh = video.videoHeight;
    const ow = overlay.clientWidth, oh = overlay.clientHeight;
    const r = roiRect();
    return {
      sx: Math.max(0, Math.floor(r.x * vw / ow)),
      sy: Math.max(0, Math.floor(r.y * vh / oh)),
      sw: Math.min(vw, Math.floor(r.w * vw / ow)),
      sh: Math.min(vh, Math.floor(r.h * vh / oh))
    };
  }

  function sampleLoop(){
    if(!running) return;
    const vw = video.videoWidth, vh = video.videoHeight;
    if(!vw || !vh){ rafId = requestAnimationFrame(sampleLoop); return; }

    const tmp = sampleLoop._tmp || (sampleLoop._tmp = document.createElement('canvas'));
    tmp.width = vw; tmp.height = vh;
    const tctx = tmp.getContext('2d', { willReadFrequently:true });
    tctx.drawImage(video, 0, 0, vw, vh);

    const {sx,sy,sw,sh} = getRoiOnVideo();
    const frame = tctx.getImageData(sx,sy,sw,sh).data;

    let sumG=0;
    for(let i=0;i<frame.length;i+=4) sumG += frame[i+1];
    const avgG = sumG / (frame.length/4);

    const t = performance.now()/1000;
    const dt = times.length ? (t - times[times.length-1]) : 1/30;

    const filt = bandpass(avgG, dt, bpState);      // cardiac component
    const br   = lowpass(avgG, dt, brState, 0.35); // slow component (not shown)

    pushSample(t, avgG, filt, br);

    if(!sampleLoop._acc || (t - sampleLoop._acc) > 0.3){
      computeMetrics();
      drawOverlay();
      sampleLoop._acc = t;
    }
    rafId = requestAnimationFrame(sampleLoop);
  }

  function resetBuffers(){
    times.length=rawVals.length=filtVals.length=breathVals.length=peakTimes.length=0;
    bpState.hp=bpState.lp=bpState.prev=0; brState.lp=0;
  }

  async function startMeasurement(){
    // iOS needs a user gesture: this is triggered by button clicks
    statusEl.textContent = 'Solicitando cámara…';
    try {
      // pre-permission trick to list devices
      await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(s => s.getTracks().forEach(t => t.stop()))
        .catch(()=>{});
      await listCameras();
      await startCamera();
      resetBuffers();
      running = true; sampleLoop();
      btnStart.disabled = true;
      btnStop.disabled = false;
      statusEl.textContent = 'Calibrando… mantén la cara estable (10–20 s).';
    } catch (e){
      alert('No se pudo acceder a la cámara. Usa HTTPS o localhost y permite el acceso.');
      statusEl.textContent = 'Error: sin cámara.';
      btnStart.disabled = false;
    }
  }

  function stopMeasurement(){
    running = false; cancelAnimationFrame(rafId);
    stopCamera();
    btnStart.disabled = false;
    btnStop.disabled = true;
    statusEl.textContent = '';
    hrEl.textContent = '–'; stressEl.textContent = '–'; stressBadge.textContent = '—';
    pulseDot.style.boxShadow = '0 0 0 0 rgba(52,211,153,0.6)';
  }

  btnStart?.addEventListener('click', startMeasurement);
  btnStop?.addEventListener('click', stopMeasurement);

  // Close modal on ESC or background click
  document.addEventListener('keydown', (e)=>{
    if (e.key === 'Escape' && modal.classList.contains('show')) closeDemo();
  });
  modal.addEventListener('click', (e)=>{
    if (e.target === modal) closeDemo();
  });
})();