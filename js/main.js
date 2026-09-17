/* Arranque. Todo lo demás ya se cargó (state, dsp, audio-engine, scope, ui) como scripts clásicos,
   en ese orden, así que EV está completo cuando esto corre. */
(function(){
  "use strict";
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", window.EV.ui.init);
  }else{
    window.EV.ui.init();
  }
})();
