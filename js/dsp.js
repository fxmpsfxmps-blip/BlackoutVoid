/* Generadores de buffers: ruido blanco, ruido rosa y envolvente silábica. Puro DSP, sin tocar el DOM. */
window.EV = window.EV || {};

(function(){
  "use strict";

  // Ruido blanco (muestras independientes) con el mismo bucle sin clic que el rosa.
  function makeWhiteBuffer(ac, seconds){
    var sr = ac.sampleRate;
    var fade = Math.floor(0.3 * sr);
    var len = Math.floor(seconds * sr);
    var buf = ac.createBuffer(2, len, sr);

    for(var ch = 0; ch < 2; ch++){
      var tmp = new Float32Array(len + fade);
      for(var i = 0; i < tmp.length; i++) tmp[i] = Math.random() * 2 - 1;
      var d = buf.getChannelData(ch);
      d.set(tmp.subarray(0, len));
      for(var j = 0; j < fade; j++){
        var t = j / fade;
        d[j] = tmp[j] * Math.sin(t * Math.PI / 2) + tmp[len + j] * Math.cos(t * Math.PI / 2);
      }
    }
    return buf;
  }

  // Ruido rosa (filtro de Paul Kellet) con bucle sin clic por crossfade de potencia constante.
  function makePinkBuffer(ac, seconds){
    var sr = ac.sampleRate;
    var fade = Math.floor(0.3 * sr);
    var len = Math.floor(seconds * sr);
    var buf = ac.createBuffer(2, len, sr);

    for(var ch = 0; ch < 2; ch++){
      var tmp = new Float32Array(len + fade);
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for(var i = 0; i < tmp.length; i++){
        var w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
      var d = buf.getChannelData(ch);
      d.set(tmp.subarray(0, len));
      for(var j = 0; j < fade; j++){
        var t = j / fade;
        d[j] = tmp[j] * Math.sin(t * Math.PI / 2) + tmp[len + j] * Math.cos(t * Math.PI / 2);
      }
    }
    return buf;
  }

  // Envolvente silábica: sílabas de 60-190 ms separadas por pausas, con respiraciones ocasionales.
  function makeEnvBuffer(ac, seconds){
    var sr = 8000;
    var len = Math.floor(seconds * sr);
    var buf = ac.createBuffer(1, len, sr);
    var d = buf.getChannelData(0);
    var i = 0;
    while(i < len){
      var gap = Math.floor((0.02 + Math.random() * 0.16) * sr);
      if(Math.random() < 0.13) gap = Math.floor((0.5 + Math.random() * 0.9) * sr);
      i += gap;
      if(i >= len) break;
      var syl = Math.floor((0.06 + Math.random() * 0.13) * sr);
      var amp = 0.35 + Math.random() * 0.65;
      for(var k = 0; k < syl && i + k < len; k++){
        var t = k / syl;
        d[i + k] = amp * Math.pow(Math.sin(t * Math.PI), 0.7);
      }
      i += syl;
    }
    return buf;
  }

  window.EV.dsp = { makeWhiteBuffer: makeWhiteBuffer, makePinkBuffer: makePinkBuffer, makeEnvBuffer: makeEnvBuffer };
})();
