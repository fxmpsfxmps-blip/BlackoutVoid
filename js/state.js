/* Constantes y estado compartido. Sin dependencias de otros módulos. */
window.EV = window.EV || {};

(function(){
  "use strict";

  var BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];

  var PRESETS = {
    puerta:    [ 5,  3,  0, -4,  -8, -12, -17],
    grabadora: [-2,  1,  3,  5,   5,   2,  -5],
    pleno:     [ 9,  6,  2, -3, -10, -16, -22],
    cristal:   [-4, -1,  2,  4,   2,  -2, -10],
    plano:     [ 0,  0,  0,  0,   0,   0,   0]
  };

  var STORAGE_KEY = "enmascarador";

  function defaults(){
    return {
      master: -18,
      babble: 40,
      wander: 1.5,
      noiseColor: 0,
      ultrasonicEnabled: false,
      ultrasonicIntensity: 35,
      antiDenoiserEnabled: false,
      antiDenoiserIntensity: 45,
      bands: PRESETS.puerta.slice(),
      preset: "puerta",
      calOffset: null,
      calReading: null,
      calReferenceDbfs: null
    };
  }

  var state = defaults();

  function load(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return;
      var o = JSON.parse(raw);
      if(!o || typeof o !== "object") return;
      if(typeof o.master === "number") state.master = o.master;
      if(typeof o.babble === "number") state.babble = o.babble;
      if(typeof o.wander === "number") state.wander = o.wander;
      if(typeof o.noiseColor === "number") state.noiseColor = o.noiseColor;
      if(typeof o.ultrasonicEnabled === "boolean") state.ultrasonicEnabled = o.ultrasonicEnabled;
      if(typeof o.ultrasonicIntensity === "number") state.ultrasonicIntensity = o.ultrasonicIntensity;
      if(typeof o.antiDenoiserEnabled === "boolean") state.antiDenoiserEnabled = o.antiDenoiserEnabled;
      if(typeof o.antiDenoiserIntensity === "number") state.antiDenoiserIntensity = o.antiDenoiserIntensity;
      if(Array.isArray(o.bands) && o.bands.length === BANDS.length) state.bands = o.bands.slice();
      if(typeof o.preset === "string" || o.preset === null) state.preset = o.preset;
      if(typeof o.calOffset === "number") state.calOffset = o.calOffset;
      if(typeof o.calReading === "number") state.calReading = o.calReading;
      if(typeof o.calReferenceDbfs === "number") state.calReferenceDbfs = o.calReferenceDbfs;
    }catch(e){
      /* localStorage puede fallar en modo privado o con cuota agotada; se sigue con los valores por defecto. */
    }
  }

  function save(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){
      /* si falla, la sesión sigue funcionando; solo no persiste entre visitas. */
    }
  }

  load();

  window.EV.constants = { BANDS: BANDS, PRESETS: PRESETS };
  window.EV.state = state;
  window.EV.persistence = { save: save, load: load };
})();
