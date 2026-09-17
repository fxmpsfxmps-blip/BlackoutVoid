/* Motores DSP avanzados de BlackoutVoid. No acceden al DOM. */
window.EV = window.EV || {};

(function(){
  "use strict";

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  function makeWhiteNoiseBuffer(ctx, seconds){
    var frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for(var i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /* Buffer sample-and-hold real: cada valor aleatorio se mantiene durante
     stepSeconds y el BufferSource puede acelerarse/frenarse con playbackRate. */
  function makeSampleHoldBuffer(ctx, seconds, stepSeconds){
    var frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    var hold = Math.max(1, Math.floor(ctx.sampleRate * stepSeconds));
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var value = Math.random() * 2 - 1;
    for(var i = 0; i < frames; i++){
      if(i % hold === 0) value = Math.random() * 2 - 1;
      data[i] = value;
    }
    return buffer;
  }

  class UltrasonicEngine {
    constructor(ctx, destination){
      this.ctx = ctx;
      this.destination = destination;
      this.enabled = false;
      this.intensity = 0;
      this.nodes = [];

      var nyquist = ctx.sampleRate * 0.5;
      this.minCarrier = Math.min(21000, nyquist * 0.90);
      this.maxCarrier = Math.min(40000, nyquist * 0.965);
      if(this.maxCarrier <= this.minCarrier){
        this.minCarrier = Math.max(16000, nyquist * 0.82);
        this.maxCarrier = Math.max(this.minCarrier + 50, nyquist * 0.965);
      }

      this.outputGain = ctx.createGain();
      this.outputGain.gain.value = 0;

      this.highpass = ctx.createBiquadFilter();
      this.highpass.type = "highpass";
      this.highpass.frequency.value = Math.min(20000, nyquist * 0.90);
      this.highpass.Q.value = 0.707;
      this.highpass.connect(this.outputGain);
      this.outputGain.connect(destination);

      this.carrier = ctx.createOscillator();
      this.carrier.type = "sine";
      this.carrier.frequency.value = this.minCarrier;

      // AM: LFO dentro del rango solicitado 100..1000 Hz.
      this.amVca = ctx.createGain();
      this.amVca.gain.value = 0.55;
      this.amLfo = ctx.createOscillator();
      this.amLfo.type = "sine";
      this.amLfo.frequency.value = 360;
      this.amDepth = ctx.createGain();
      this.amDepth.gain.value = 0.45;
      this.amLfo.connect(this.amDepth);
      this.amDepth.connect(this.amVca.gain);

      // FM: LFO lento dentro del rango solicitado 1..10 Hz.
      this.fmLfo = ctx.createOscillator();
      this.fmLfo.type = "sine";
      this.fmLfo.frequency.value = 3.2;
      this.fmDepth = ctx.createGain();
      this.fmDepth.gain.value = Math.min(1200, Math.max(120, (this.maxCarrier - this.minCarrier) * 0.18));
      this.fmLfo.connect(this.fmDepth);
      this.fmDepth.connect(this.carrier.frequency);

      this.carrier.connect(this.amVca);
      this.amVca.connect(this.highpass);

      this._scheduleSweep(ctx.currentTime + 0.03);
      this.carrier.start();
      this.amLfo.start();
      this.fmLfo.start();
    }

    _scheduleSweep(startTime){
      var p = this.carrier.frequency;
      var halfSweep = 18.0;
      var t = startTime;
      p.cancelScheduledValues(t);
      p.setValueAtTime(this.minCarrier, t);
      // Preprograma ~30 min de barrido triangular lento y continuo.
      for(var i = 0; i < 50; i++){
        t += halfSweep;
        p.linearRampToValueAtTime(this.maxCarrier, t);
        t += halfSweep;
        p.linearRampToValueAtTime(this.minCarrier, t);
      }
    }

    setIntensity(percent){
      this.intensity = clamp(percent, 0, 100);
      this._applyGain();
    }

    setEnabled(enabled){
      this.enabled = !!enabled;
      this._applyGain();
    }

    _applyGain(){
      var normalized = this.enabled ? Math.pow(this.intensity / 100, 1.7) * 0.32 : 0;
      this.outputGain.gain.setTargetAtTime(normalized, this.ctx.currentTime, 0.05);
    }

    setAMRate(hz){
      this.amLfo.frequency.setTargetAtTime(clamp(hz, 100, 1000), this.ctx.currentTime, 0.05);
    }

    setFMRate(hz){
      this.fmLfo.frequency.setTargetAtTime(clamp(hz, 1, 10), this.ctx.currentTime, 0.05);
    }
  }

  class AntiDenoiserEngine {
    constructor(ctx, destination, options){
      options = options || {};
      this.ctx = ctx;
      this.destination = destination;
      this.detune = options.detune || 0;
      this.delaySeconds = options.delaySeconds || 0;
      this.modSources = [];
      this.filters = [];

      this.output = ctx.createGain();
      this.output.gain.value = 0.42;

      this.delay = ctx.createDelay(0.2);
      this.delay.delayTime.value = clamp(this.delaySeconds, 0, 0.2);
      this.output.connect(this.delay);
      this.delay.connect(destination);

      this.vca = ctx.createGain();
      this.vca.gain.value = 0.65;
      this.vca.connect(this.output);

      var noise = ctx.createBufferSource();
      noise.buffer = makeWhiteNoiseBuffer(ctx, 8);
      noise.loop = true;
      if(noise.detune) noise.detune.value = this.detune;
      this.noise = noise;

      this.formantBus = ctx.createGain();
      this.formantBus.gain.value = 0.34;
      this.formantBus.connect(this.vca);

      var formants = [500, 900, 1500, 2500, 3500];
      var qBase = [4.2, 3.7, 4.6, 5.2, 4.5];
      for(var i = 0; i < formants.length; i++){
        this._addFormant(noise, formants[i], qBase[i], i);
      }

      // Fluctuación aleatoria de volumen independiente.
      this.ampMod = this._makeModulator(0.20, 0.28);
      this.ampMod.gainNode.connect(this.vca.gain);

      noise.start(ctx.currentTime + Math.random() * 0.05);
      this.setDrift(1.5);
    }

    _makeModulator(stepSeconds, amount){
      var src = this.ctx.createBufferSource();
      src.buffer = makeSampleHoldBuffer(this.ctx, 18, stepSeconds);
      src.loop = true;
      var gain = this.ctx.createGain();
      gain.gain.value = amount;
      src.connect(gain);
      src.start(this.ctx.currentTime + Math.random() * 0.15);
      this.modSources.push(src);
      return { source: src, gainNode: gain };
    }

    _addFormant(noise, baseFreq, baseQ, index){
      var filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = baseFreq;
      filter.Q.value = baseQ;
      noise.connect(filter);
      filter.connect(this.formantBus);
      this.filters.push(filter);

      // Deriva de frecuencia: +/- 18..24 % según banda.
      var freqAmount = baseFreq * (0.18 + index * 0.015);
      var freqMod = this._makeModulator(0.20 + index * 0.012, freqAmount);
      freqMod.gainNode.connect(filter.frequency);

      // Deriva de Q: cambios cortos y no estacionarios.
      var qMod = this._makeModulator(0.18 + index * 0.015, Math.min(1.7, baseQ * 0.28));
      qMod.gainNode.connect(filter.Q);
    }

    setDrift(wander){
      // 0..4 del control existente -> pasos efectivos 300..100 ms.
      var t = clamp(wander / 4, 0, 1);
      var playbackRate = 0.67 + t * 1.33;
      for(var i = 0; i < this.modSources.length; i++){
        this.modSources[i].playbackRate.setTargetAtTime(playbackRate, this.ctx.currentTime, 0.08);
      }
    }
  }

  window.EV.UltrasonicEngine = UltrasonicEngine;
  window.EV.AntiDenoiserEngine = AntiDenoiserEngine;
})();
