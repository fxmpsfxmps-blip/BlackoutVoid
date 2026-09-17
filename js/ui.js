/* Cablea los controles del DOM al estado y al motor de audio. */
window.EV = window.EV || {};

(function(){
  "use strict";

  var BANDS = window.EV.constants.BANDS;
  var PRESETS = window.EV.constants.PRESETS;
  var state = window.EV.state;
  var persistence = window.EV.persistence;
  var engine = window.EV.engine;

  function init(){
    var bandsEl = document.getElementById("bands");
    var bandInputs = [], bandVals = [];

    function paintPct(el, v){
      var min = parseFloat(el.min), max = parseFloat(el.max);
      el.style.setProperty("--pct", ((v - min) / (max - min)) * 100 + "%");
    }

    BANDS.forEach(function(f, i){
      var row = document.createElement("div");
      row.className = "fader";

      var label = document.createElement("label");
      label.className = "fader-label";
      label.htmlFor = "b" + i;
      label.textContent = f >= 1000 ? (f / 1000) + " kHz" : f + " Hz";

      var inp = document.createElement("input");
      inp.type = "range"; inp.id = "b" + i;
      inp.min = -24; inp.max = 12; inp.step = 1; inp.value = state.bands[i];

      var val = document.createElement("span");
      val.className = "fader-val";

      row.appendChild(label); row.appendChild(inp); row.appendChild(val);
      bandsEl.appendChild(row);
      bandInputs.push(inp); bandVals.push(val);

      inp.addEventListener("input", function(){
        state.bands[i] = parseFloat(inp.value);
        state.preset = null;
        engine.setBandGain(i, state.bands[i]);
        paintBandVal(i);
        paintPresets();
        persistence.save();
      });
    });

    function paintBandVal(i){
      var v = state.bands[i];
      bandVals[i].textContent = (v > 0 ? "+" : "") + v.toFixed(0) + " dB";
      paintPct(bandInputs[i], v);
    }
    function paintBands(){
      for(var i = 0; i < BANDS.length; i++){ bandInputs[i].value = state.bands[i]; paintBandVal(i); }
    }

    var presetButtons = document.querySelectorAll("#presets button");
    function paintPresets(){
      presetButtons.forEach(function(b){
        b.setAttribute("aria-pressed", b.dataset.preset === state.preset ? "true" : "false");
      });
    }
    document.getElementById("presets").addEventListener("click", function(e){
      var b = e.target.closest("button[data-preset]");
      if(!b) return;
      state.preset = b.dataset.preset;
      state.bands = PRESETS[state.preset].slice();
      paintBands(); paintPresets();
      for(var i = 0; i < BANDS.length; i++) engine.setBandGain(i, state.bands[i]);
      persistence.save();
    });

    // ---------- transporte ----------
    var powerBtn = document.getElementById("power");
    var statusEl = document.getElementById("status");
    var ledEl = document.getElementById("led");
    var bgAudio = document.getElementById("bgAudio");

    function setStatus(text){ statusEl.textContent = text; }
    function setLed(on){ ledEl.classList.toggle("on", !!on); }

    function playBgAudio(){
      var stream = engine.getStream();
      if(!stream) return;
      if(bgAudio.srcObject !== stream) bgAudio.srcObject = stream;
      bgAudio.play().catch(function(){});
    }

    function setMediaSession(playing){
      if(!("mediaSession" in navigator)) return;
      if(!navigator.mediaSession.metadata){
        navigator.mediaSession.metadata = new MediaMetadata({ title: "Enmascarador de voz", artist: "FxMps" });
      }
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    }

    function enforceUltrasonicMasterCap(){
      if(!state.ultrasonicEnabled) return;
      var cap = engine.getUltrasonicMasterCapDb();
      if(state.master > cap){
        state.master = cap;
        mCtl.el.value = state.master;
        mCtl.paint(state.master);
      }
    }

    function turnOn(){
      enforceUltrasonicMasterCap();
      engine.start(state.master);
      playBgAudio();
      powerBtn.textContent = "Apagar";
      powerBtn.classList.remove("primary");
      setStatus("");
      setLed(true);
      setMediaSession(true);
    }

    function turnOff(){
      engine.stop();
      bgAudio.pause();
      powerBtn.textContent = "Encender";
      powerBtn.classList.add("primary");
      setStatus("");
      setLed(false);
      setMediaSession(false);
    }

    if("mediaSession" in navigator){
      navigator.mediaSession.setActionHandler("play", function(){ if(engine.isBuilt() && !engine.isRunning()) turnOn(); });
      navigator.mediaSession.setActionHandler("pause", function(){ if(engine.isRunning()) turnOff(); });
      navigator.mediaSession.setActionHandler("stop", function(){ if(engine.isRunning()) turnOff(); });
    }

    powerBtn.addEventListener("click", function(){
      if(engine.isRunning()){ turnOff(); return; }
      if(!engine.isBuilt()){
        setStatus("Generando el ruido…");
        powerBtn.disabled = true;
        setTimeout(function(){
          try{
            engine.build(state);
          }catch(err){
            console.error(err);
            setStatus("El audio no arrancó. Recarga la página y vuelve a intentarlo.");
            powerBtn.disabled = false;
            return;
          }
          powerBtn.disabled = false;
          turnOn();
        }, 30);
        return;
      }
      turnOn();
    });

    // ---------- faders principales ----------
    function bind(id, valId, fmt, onChange){
      var el = document.getElementById(id), out = document.getElementById(valId);
      function paint(v){ out.textContent = fmt(v); paintPct(el, v); }
      el.addEventListener("input", function(){
        var v = parseFloat(el.value);
        paint(v); onChange(v); persistence.save();
      });
      return { el: el, paint: paint };
    }

    var mCtl = bind("master", "masterVal", function(v){ return v.toFixed(1) + " dB"; }, function(v){
      if(state.ultrasonicEnabled){
        var cap = engine.getUltrasonicMasterCapDb();
        if(v > cap){
          v = cap;
          mCtl.el.value = v;
          mCtl.paint(v);
        }
      }
      state.master = v;
      engine.setMasterDb(v);
      paintCal();
    });
    var bCtl = bind("babble", "babbleVal", function(v){ return v.toFixed(0) + " %"; }, function(v){
      state.babble = v; engine.setBabble(v);
    });
    var wCtl = bind("wander", "wanderVal", function(v){ return v.toFixed(1) + " dB"; }, function(v){
      state.wander = v; engine.setWander(v);
    });
    var colCtl = bind("noiseColor", "noiseColorVal", function(v){ return v.toFixed(0) + " % blanco"; }, function(v){
      state.noiseColor = v; engine.setNoiseColor(v);
    });
    var uCtl = bind("ultrasonicIntensity", "ultrasonicIntensityVal", function(v){ return v.toFixed(0) + " %"; }, function(v){
      state.ultrasonicIntensity = v; engine.setUltrasonicIntensity(v); paintCal();
    });
    var aCtl = bind("antiDenoiserIntensity", "antiDenoiserIntensityVal", function(v){ return v.toFixed(0) + " %"; }, function(v){
      state.antiDenoiserIntensity = v; engine.setAntiDenoiserIntensity(v); paintCal();
    });

    // ---------- módulos avanzados ----------
    var ultraToggle = document.getElementById("ultrasonicToggle");
    var antiToggle = document.getElementById("antiDenoiserToggle");

    function paintAdvancedState(){
      ultraToggle.checked = !!state.ultrasonicEnabled;
      antiToggle.checked = !!state.antiDenoiserEnabled;
      bCtl.el.disabled = !!state.antiDenoiserEnabled;
      bCtl.el.closest(".big-ctrl").classList.toggle("is-disabled", !!state.antiDenoiserEnabled);
      document.getElementById("ultrasonicIntensity").disabled = !state.ultrasonicEnabled;
      document.getElementById("antiDenoiserIntensity").disabled = !state.antiDenoiserEnabled;
      document.getElementById("ultrasonicIntensity").closest(".big-ctrl").classList.toggle("is-disabled", !state.ultrasonicEnabled);
      document.getElementById("antiDenoiserIntensity").closest(".big-ctrl").classList.toggle("is-disabled", !state.antiDenoiserEnabled);
    }

    ultraToggle.addEventListener("change", function(){
      state.ultrasonicEnabled = ultraToggle.checked;
      if(state.ultrasonicEnabled) enforceUltrasonicMasterCap();
      engine.setUltrasonicEnabled(state.ultrasonicEnabled);
      engine.setMasterDb(state.master);
      paintAdvancedState();
      paintCal();
      persistence.save();
    });

    antiToggle.addEventListener("change", function(){
      state.antiDenoiserEnabled = antiToggle.checked;
      engine.setAntiDenoiserEnabled(state.antiDenoiserEnabled);
      paintAdvancedState();
      paintCal();
      persistence.save();
    });

    // ---------- calibración total ----------
    var calOut = document.getElementById("calOut");
    document.getElementById("calBtn").addEventListener("click", function(){
      var v = parseFloat(document.getElementById("calIn").value);
      if(isNaN(v)){ calOut.textContent = "Escribe la lectura del sonómetro en dBA."; return; }
      var totalDbfs = engine.getOutputDbfs();
      if(totalDbfs === null || !isFinite(totalDbfs)){
        calOut.textContent = "Enciende la salida antes de fijar la referencia.";
        return;
      }
      state.calReading = v;
      state.calReferenceDbfs = totalDbfs;
      state.calOffset = null;
      persistence.save();
      paintCal();
    });

    function paintCal(){
      if(typeof state.calReading === "number" && typeof state.calReferenceDbfs === "number"){
        var now = engine.getOutputDbfs();
        if(now !== null && isFinite(now)){
          var estTotal = state.calReading + (now - state.calReferenceDbfs);
          var verdictTotal = estTotal < 42 ? "bajo: apenas enmascara" : estTotal > 48 ? "alto: va a molestar" : "en rango";
          calOut.innerHTML = "Estimado en el punto medido: <strong>" + estTotal.toFixed(1) + " dBA</strong> — " + verdictTotal;
        }else{
          calOut.innerHTML = "Referencia fijada: <strong>" + state.calReading.toFixed(1) + " dBA</strong>";
        }
        return;
      }
      if(state.calOffset === null){ calOut.textContent = "Sin calibrar"; return; }
      var est = state.master + state.calOffset;
      var verdict = est < 42 ? "bajo: apenas enmascara" : est > 48 ? "alto: va a molestar" : "en rango";
      calOut.innerHTML = "Estimado en el punto medido: <strong>" + est.toFixed(1) + " dBA</strong> — " + verdict;
    }

    document.documentElement.setAttribute("data-ui", "terminal");

    document.addEventListener("visibilitychange", function(){
      if(document.visibilityState !== "visible" || !engine.isRunning()) return;
      var ctx = engine.getContext();
      if(ctx && ctx.state === "suspended") ctx.resume();
      playBgAudio();
    });

    // ---------- estado inicial ----------
    paintBands(); paintPresets();
    mCtl.el.value = state.master; mCtl.paint(state.master);
    bCtl.el.value = state.babble; bCtl.paint(state.babble);
    wCtl.el.value = state.wander; wCtl.paint(state.wander);
    colCtl.el.value = state.noiseColor; colCtl.paint(state.noiseColor);
    uCtl.el.value = state.ultrasonicIntensity; uCtl.paint(state.ultrasonicIntensity);
    aCtl.el.value = state.antiDenoiserIntensity; aCtl.paint(state.antiDenoiserIntensity);
    paintAdvancedState();
    paintCal();

    // Mantiene la estimación SPL sincronizada con la energía total real.
    setInterval(function(){ if(engine.isRunning()) paintCal(); }, 350);

    window.EV.scope.start(
      document.getElementById("scope"),
      document.getElementById("waterfall"),
      document.getElementById("meter"),
      engine
    );
  }

  window.EV.ui = { init: init };
})();
