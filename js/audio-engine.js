/* Motor de audio: construye el grafo de Web Audio y expone controles de transporte y parámetros. */
window.EV = window.EV || {};

(function(){
  "use strict";

  var BANDS = window.EV.constants.BANDS;
  var dsp = window.EV.dsp;

  function dbDelta(d){ return (Math.pow(10, d / 20) - 1) * 0.5; }
  function babbleCurve(pct){ return Math.pow(pct / 100, 1.6) * 0.75; }
  function antiCurve(pct){ return Math.pow(pct / 100, 1.3) * 0.95; }
  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  function createEngine(){
    var ctx = null;
    var built = false;
    var running = false;
    var master, limiter, levelAnalyser, spectrumAnalyser, spectrumTapGain, analysisSink, streamDest;
    var audibleBus, eq = [], wanderGain, babbleGain, maskGain;
    var colorPinkGain, colorWhiteGain;
    var ultrasonic = null, ultrasonicEnabled = false;
    var antiEngines = [], antiBus = null, antiEnabled = false;
    var stateRef = null;
    var requestedMasterDb = -18;
    var ULTRASONIC_MASTER_CAP_DB = 20 * Math.log10(0.70);

    function applyColor(pct){
      if(!colorPinkGain) return;
      var theta = (clamp(pct, 0, 100) / 100) * (Math.PI / 2);
      colorPinkGain.gain.setTargetAtTime(Math.cos(theta), ctx.currentTime, 0.05);
      colorWhiteGain.gain.setTargetAtTime(Math.sin(theta), ctx.currentTime, 0.05);
    }

    function effectiveMasterDb(db){
      return ultrasonicEnabled ? Math.min(db, ULTRASONIC_MASTER_CAP_DB) : db;
    }

    function applyMaster(db, tau){
      if(!built || !running) return;
      var safeDb = effectiveMasterDb(db);
      var linear = Math.pow(10, safeDb / 20);
      master.gain.setTargetAtTime(linear, ctx.currentTime, tau || 0.05);
      spectrumTapGain.gain.setTargetAtTime(linear, ctx.currentTime, tau || 0.05);
    }

    function makeVoice(pink, bus){
      var src = ctx.createBufferSource();
      src.buffer = pink;
      src.loop = true;
      src.playbackRate.value = 0.85 + Math.random() * 0.35;

      var f1 = 280 + Math.random() * 420;
      var f2 = 900 + Math.random() * 1700;
      var bp1 = ctx.createBiquadFilter(); bp1.type = "bandpass"; bp1.frequency.value = f1; bp1.Q.value = 2.2;
      var bp2 = ctx.createBiquadFilter(); bp2.type = "bandpass"; bp2.frequency.value = f2; bp2.Q.value = 1.6;
      var mixg = ctx.createGain(); mixg.gain.value = 0.9;

      src.connect(bp1); src.connect(bp2);
      bp1.connect(mixg); bp2.connect(mixg);

      var vca = ctx.createGain(); vca.gain.value = 0;
      mixg.connect(vca);

      var pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if(pan){
        pan.pan.value = (Math.random() * 2 - 1) * 0.8;
        vca.connect(pan); pan.connect(bus);
      }else{
        vca.connect(bus);
      }

      var env = ctx.createBufferSource();
      env.buffer = dsp.makeEnvBuffer(ctx, 26 + Math.random() * 8);
      env.loop = true;
      var envAmt = ctx.createGain(); envAmt.gain.value = 0.55;
      env.connect(envAmt); envAmt.connect(vca.gain);

      src.start(ctx.currentTime + Math.random() * 0.4);
      env.start(ctx.currentTime + Math.random() * 3);
    }

    function build(state){
      stateRef = state;
      requestedMasterDb = state.master;
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      try{
        ctx = new AudioContextClass({ latencyHint: "playback" });
      }catch(e){
        ctx = new AudioContextClass();
      }
      var pink = dsp.makePinkBuffer(ctx, 18);
      var white = dsp.makeWhiteBuffer(ctx, 18);

      master = ctx.createGain(); master.gain.value = 0;
      limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3; limiter.knee.value = 0;
      limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.1;

      levelAnalyser = ctx.createAnalyser();
      levelAnalyser.fftSize = 4096; levelAnalyser.smoothingTimeConstant = 0.75;

      spectrumAnalyser = ctx.createAnalyser();
      spectrumAnalyser.fftSize = 4096; spectrumAnalyser.smoothingTimeConstant = 0.75;
      spectrumTapGain = ctx.createGain(); spectrumTapGain.gain.value = 0;
      analysisSink = ctx.createGain(); analysisSink.gain.value = 0;

      audibleBus = ctx.createGain(); audibleBus.gain.value = 1;
      audibleBus.connect(master);
      audibleBus.connect(spectrumTapGain);
      spectrumTapGain.connect(spectrumAnalyser);
      spectrumAnalyser.connect(analysisSink);
      analysisSink.connect(master); // rama silenciosa: mantiene activo el analyser sin duplicar audio.

      master.connect(limiter);
      limiter.connect(levelAnalyser);

      if(ctx.createMediaStreamDestination){
        streamDest = ctx.createMediaStreamDestination();
        levelAnalyser.connect(streamDest);
      }else{
        levelAnalyser.connect(ctx.destination);
      }

      // --- capa de enmascaramiento ---
      maskGain = ctx.createGain(); maskGain.gain.value = 1;
      var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 85; hp.Q.value = 0.7;
      var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 11000; lp.Q.value = 0.7;

      var node = hp;
      eq = [];
      BANDS.forEach(function(f, i){
        var b = ctx.createBiquadFilter();
        b.type = "peaking"; b.frequency.value = f; b.Q.value = 1.1; b.gain.value = state.bands[i];
        node.connect(b); node = b; eq.push(b);
      });
      node.connect(lp); lp.connect(maskGain); maskGain.connect(audibleBus);

      var pinkSrc = ctx.createBufferSource();
      pinkSrc.buffer = pink; pinkSrc.loop = true;
      var whiteSrc = ctx.createBufferSource();
      whiteSrc.buffer = white; whiteSrc.loop = true;
      colorPinkGain = ctx.createGain(); colorWhiteGain = ctx.createGain();
      pinkSrc.connect(colorPinkGain); whiteSrc.connect(colorWhiteGain);
      colorPinkGain.connect(hp); colorWhiteGain.connect(hp);
      applyColor(state.noiseColor || 0);
      pinkSrc.start(); whiteSrc.start();

      var wanderOsc = ctx.createOscillator(); wanderOsc.frequency.value = 0.07;
      wanderGain = ctx.createGain(); wanderGain.gain.value = dbDelta(state.wander);
      wanderOsc.connect(wanderGain); wanderGain.connect(maskGain.gain);
      wanderOsc.start();

      // --- murmullo estándar ---
      babbleGain = ctx.createGain();
      babbleGain.gain.value = babbleCurve(state.babble);
      babbleGain.connect(audibleBus);
      for(var v = 0; v < 8; v++) makeVoice(pink, babbleGain);

      // --- anti-denoiser / babble avanzado: 3 instancias en paralelo ---
      antiBus = ctx.createGain(); antiBus.gain.value = 0;
      antiBus.connect(audibleBus);
      var antiCfg = [
        { delaySeconds: 0.000, detune: -18 },
        { delaySeconds: 0.024, detune:  11 },
        { delaySeconds: 0.051, detune:  27 }
      ];
      antiEngines = antiCfg.map(function(cfg){
        return new window.EV.AntiDenoiserEngine(ctx, antiBus, cfg);
      });
      antiEngines.forEach(function(e){ e.setDrift(state.wander); });

      // --- interferencia ultrasónica: fuera del tap de espectro audible ---
      ultrasonic = new window.EV.UltrasonicEngine(ctx, master);
      ultrasonic.setIntensity(typeof state.ultrasonicIntensity === "number" ? state.ultrasonicIntensity : 35);
      ultrasonic.setEnabled(!!state.ultrasonicEnabled);
      ultrasonicEnabled = !!state.ultrasonicEnabled;

      antiEnabled = !!state.antiDenoiserEnabled;
      antiBus.gain.value = antiEnabled ? antiCurve(typeof state.antiDenoiserIntensity === "number" ? state.antiDenoiserIntensity : 45) : 0;
      babbleGain.gain.value = antiEnabled ? 0 : babbleCurve(state.babble);

      built = true;
    }

    function getOutputDbfs(){
      if(!built || !running || !levelAnalyser) return null;
      var td = new Float32Array(levelAnalyser.fftSize);
      levelAnalyser.getFloatTimeDomainData(td);
      var sum = 0;
      for(var i = 0; i < td.length; i++) sum += td[i] * td[i];
      var rms = Math.sqrt(sum / td.length);
      return 20 * Math.log10(rms || 1e-9);
    }

    return {
      isBuilt: function(){ return built; },
      isRunning: function(){ return running; },
      getContext: function(){ return ctx; },
      getAnalyser: function(){ return levelAnalyser; },
      getLevelAnalyser: function(){ return levelAnalyser; },
      getSpectrumAnalyser: function(){ return spectrumAnalyser || levelAnalyser; },
      getStream: function(){ return streamDest ? streamDest.stream : null; },
      getOutputDbfs: getOutputDbfs,
      getUltrasonicMasterCapDb: function(){ return ULTRASONIC_MASTER_CAP_DB; },
      getUltrasonicRange: function(){ return ultrasonic ? ultrasonic.getRange() : null; },
      isUltrasonicEnabled: function(){ return ultrasonicEnabled; },
      isAntiDenoiserEnabled: function(){ return antiEnabled; },

      build: build,

      start: function(masterDb){
        if(!built) return;
        if(ctx.state === "suspended") ctx.resume().catch(function(){});
        running = true;
        requestedMasterDb = masterDb;
        applyMaster(masterDb, 0.4);
      },

      stop: function(){
        if(!built) return;
        running = false;
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
        spectrumTapGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
      },

      setMasterDb: function(db){
        requestedMasterDb = db;
        applyMaster(db, 0.05);
      },

      setBandGain: function(i, db){
        if(!built) return;
        eq[i].gain.setTargetAtTime(db, ctx.currentTime, 0.02);
      },

      setBabble: function(pct){
        if(!built || antiEnabled) return;
        babbleGain.gain.setTargetAtTime(babbleCurve(pct), ctx.currentTime, 0.1);
      },

      setWander: function(db){
        if(!built) return;
        wanderGain.gain.setTargetAtTime(dbDelta(db), ctx.currentTime, 0.1);
        antiEngines.forEach(function(e){ e.setDrift(db); });
      },

      setNoiseColor: function(pct){ if(built) applyColor(pct); },

      setUltrasonicEnabled: function(enabled){
        ultrasonicEnabled = !!enabled;
        if(stateRef) stateRef.ultrasonicEnabled = ultrasonicEnabled;
        if(ultrasonic) ultrasonic.setEnabled(ultrasonicEnabled);
        applyMaster(requestedMasterDb, 0.08);
      },

      setUltrasonicIntensity: function(pct){
        if(ultrasonic) ultrasonic.setIntensity(pct);
      },

      setAntiDenoiserEnabled: function(enabled){
        antiEnabled = !!enabled;
        if(stateRef) stateRef.antiDenoiserEnabled = antiEnabled;
        if(!built) return;
        antiBus.gain.setTargetAtTime(antiEnabled ? antiCurve(typeof stateRef.antiDenoiserIntensity === "number" ? stateRef.antiDenoiserIntensity : 45) : 0, ctx.currentTime, 0.08);
        babbleGain.gain.setTargetAtTime(antiEnabled ? 0 : babbleCurve(stateRef.babble), ctx.currentTime, 0.08);
      },

      setAntiDenoiserIntensity: function(pct){
        if(!built || !antiEnabled) return;
        antiBus.gain.setTargetAtTime(antiCurve(pct), ctx.currentTime, 0.08);
      }
    };
  }

  window.EV.engine = createEngine();
})();
