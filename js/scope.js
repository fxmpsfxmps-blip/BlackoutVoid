/* Osciloscopio de espectro + cascada (waterfall). Lee los colores desde las
   variables CSS activas para el trazo y la rejilla; la cascada usa su propia
   rampa de color (negro -> azul -> cian -> verde -> amarillo), igual que un
   waterfall de SDR clásico. */
window.EV = window.EV || {};

(function(){
  "use strict";

  var FMIN = 60, FMAX = 16000;

  function xOf(f, w){ return (Math.log(f / FMIN) / Math.log(FMAX / FMIN)) * w; }

  // Rampa de color de la cascada. t en [0,1] (0 = piso de ruido, 1 = pico).
  var WF_STOPS = [
    [0.00,   4,   5,  12],
    [0.30,  10,  40,  78],
    [0.55,  18, 110, 128],
    [0.75,  60, 175, 120],
    [0.90, 205, 215,  80],
    [1.00, 255, 232, 120]
  ];
  function waterfallColor(t){
    if(t <= 0) t = 0; if(t >= 1) t = 1;
    for(var i = 1; i < WF_STOPS.length; i++){
      var a = WF_STOPS[i - 1], b = WF_STOPS[i];
      if(t <= b[0]){
        var span = b[0] - a[0] || 1;
        var f = (t - a[0]) / span;
        var r = a[1] + (b[1] - a[1]) * f;
        var gg = a[2] + (b[2] - a[2]) * f;
        var bb = a[3] + (b[3] - a[3]) * f;
        return "rgb(" + (r | 0) + "," + (gg | 0) + "," + (bb | 0) + ")";
      }
    }
    return "rgb(255,232,120)";
  }

  // Piso de ruido en reposo: se ve antes de encender y mientras arranca el
  // motor, con deriva lenta por bin. Al encender se sustituye por los datos
  // reales del analyser.
  var IDLE_N = 96, IDLE_TOP = -20, IDLE_BOT = -110, IDLE_FLOOR = -93;
  var idleCur = null, idleTgt = null, idleNextShift = 0;

  function idleBins(){
    if(!idleCur){
      idleCur = new Float32Array(IDLE_N);
      idleTgt = new Float32Array(IDLE_N);
      for(var i = 0; i < IDLE_N; i++) idleCur[i] = idleTgt[i] = IDLE_FLOOR;
    }
    return idleCur;
  }

  function stepIdle(ts){
    var cur = idleBins();
    if(!idleNextShift || ts - idleNextShift > 0){
      idleNextShift = (ts || 0) + 420 + Math.random() * 380;
      for(var i = 0; i < IDLE_N; i++){
        var blip = Math.random() < 0.05 ? Math.random() * 9 : 0;
        idleTgt[i] = IDLE_FLOOR + (Math.random() * 7 - 3.5) + blip;
      }
    }
    for(var j = 0; j < IDLE_N; j++){
      cur[j] += (idleTgt[j] - cur[j]) * 0.10 + (Math.random() - 0.5) * 0.5;
    }
    return cur;
  }

  function start(canvas, wfCanvas, meterEl, engine){
    var g = canvas.getContext("2d");
    var wg = wfCanvas.getContext("2d");
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var lastDraw = 0;
    var lastWf = 0;

    function frame(ts){
      requestAnimationFrame(frame);
      if(reduced && ts - lastDraw < 150) return;
      lastDraw = ts || 0;

      // ---------- trazo de espectro (igual que antes) ----------
      var dpr = window.devicePixelRatio || 1;
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if(canvas.width !== w * dpr || canvas.height !== h * dpr){
        canvas.width = w * dpr; canvas.height = h * dpr;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      var cs = getComputedStyle(document.body);
      var line = cs.getPropertyValue("--line-fine").trim();
      var soft = cs.getPropertyValue("--ink-soft").trim();
      var trace = cs.getPropertyValue("--trace").trim();
      var band = cs.getPropertyValue("--speechband").trim();
      var sig = cs.getPropertyValue("--signal").trim();

      // banda de la voz
      var x1 = xOf(200, w), x2 = xOf(6000, w);
      g.fillStyle = band; g.fillRect(x1, 0, x2 - x1, h - 16);
      g.strokeStyle = sig; g.globalAlpha = 0.45; g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x1 + 0.5, 0); g.lineTo(x1 + 0.5, h - 16);
      g.moveTo(x2 - 0.5, 0); g.lineTo(x2 - 0.5, h - 16);
      g.stroke();
      g.globalAlpha = 1;

      // rejilla
      var ticks = [100, 250, 500, 1000, 2000, 4000, 8000, 16000];
      g.strokeStyle = line; g.fillStyle = soft;
      g.font = '11px "IBM Plex Mono", monospace'; g.textAlign = "center";
      ticks.forEach(function(f){
        var x = xOf(f, w);
        g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h - 16); g.stroke();
        g.fillText(f >= 1000 ? (f / 1000) + "k" : f, x, h - 3);
      });

      // ---------- cascada: tamaño del canvas (1:1 con CSS px, sin escalar por dpr) ----------
      var wfw = wfCanvas.clientWidth, wfh = wfCanvas.clientHeight;
      if(wfCanvas.width !== wfw || wfCanvas.height !== wfh){
        wfCanvas.width = wfw; wfCanvas.height = wfh;
        wg.fillStyle = "#000"; wg.fillRect(0, 0, wfw, wfh);
      }

      var live = engine.isBuilt() && engine.isRunning();
      var n, data, sr, top = IDLE_TOP, bot = IDLE_BOT;

      if(live){
        var analyser = engine.getSpectrumAnalyser ? engine.getSpectrumAnalyser() : engine.getAnalyser();
        n = analyser.frequencyBinCount;
        data = new Float32Array(n);
        analyser.getFloatFrequencyData(data);
        sr = engine.getContext().sampleRate;
      }else{
        data = stepIdle(ts);
        n = data.length;
      }

      g.beginPath();
      var started = false;
      if(live){
        for(var i = 1; i < n; i++){
          var f = (i * sr) / 2 / n;
          if(f < FMIN || f > FMAX) continue;
          var x = xOf(f, w);
          var db = Math.max(bot, Math.min(top, data[i]));
          var y = (h - 16) * (1 - (db - bot) / (top - bot));
          if(!started){ g.moveTo(x, y); started = true; } else g.lineTo(x, y);
        }
      }else{
        for(var ii = 0; ii < n; ii++){
          var frac = ii / (n - 1);
          var ff = FMIN * Math.pow(FMAX / FMIN, frac);
          var xi = xOf(ff, w);
          var dbi = Math.max(bot, Math.min(top, data[ii]));
          var yi = (h - 16) * (1 - (dbi - bot) / (top - bot));
          if(!started){ g.moveTo(xi, yi); started = true; } else g.lineTo(xi, yi);
        }
      }
      g.strokeStyle = trace; g.lineWidth = 1.5; g.lineJoin = "round";
      g.globalAlpha = live ? 1 : 0.6; g.stroke(); g.globalAlpha = 1;
      g.lineTo(w, h - 16); g.lineTo(0, h - 16); g.closePath();
      g.globalAlpha = live ? 0.12 : 0.06; g.fillStyle = trace; g.fill(); g.globalAlpha = 1;

      // ---------- cascada: nueva franja arriba cada ~40ms, empuja lo anterior hacia abajo ----------
      if(!lastWf || ts - lastWf >= 40){
        lastWf = ts || 0;
        wg.drawImage(wfCanvas, 0, 0, wfw, wfh - 1, 0, 1, wfw, wfh - 1);
        var step = Math.max(1, Math.round(wfw / 260));
        for(var x2px = 0; x2px < wfw; x2px += step){
          var t;
          if(live){
            var freq = FMIN * Math.pow(FMAX / FMIN, x2px / wfw);
            var bin = Math.round((freq * 2 * n) / sr);
            if(bin < 0) bin = 0; if(bin >= n) bin = n - 1;
            var dbv = Math.max(bot, Math.min(top, data[bin]));
            t = (dbv - bot) / (top - bot);
          }else{
            var idx = Math.min(n - 1, Math.round((x2px / wfw) * (n - 1)));
            var dbw = Math.max(bot, Math.min(top, data[idx]));
            t = (dbw - bot) / (top - bot);
          }
          wg.fillStyle = waterfallColor(t);
          wg.fillRect(x2px, 0, step, 1);
        }
      }

      if(live){
        var levelAnalyser = engine.getLevelAnalyser ? engine.getLevelAnalyser() : analyser;
        var td = new Float32Array(levelAnalyser.fftSize);
        levelAnalyser.getFloatTimeDomainData(td);
        var sum = 0;
        for(var k = 0; k < td.length; k++) sum += td[k] * td[k];
        var rms = Math.sqrt(sum / td.length);
        var dbfs = 20 * Math.log10(rms || 1e-9);
        meterEl.textContent = dbfs.toFixed(1) + " dBFS";
      }else{
        var avg = 0;
        for(var m = 0; m < n; m++) avg += data[m];
        avg /= n;
        meterEl.textContent = avg.toFixed(1) + " dBFS (reposo)";
      }
    }

    requestAnimationFrame(frame);
  }

  window.EV.scope = { start: start };
})();
