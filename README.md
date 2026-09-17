# BlackoutVoid

Aplicación web de privacidad acústica para reducir la inteligibilidad de voz que se fuga de una sala de reuniones.

Genera ruido conformado a la banda de la voz, una capa de murmullo sintético y módulos avanzados opcionales para escenarios más exigentes. Todo corre localmente en el navegador mediante Web Audio API. No graba, no analiza micrófono, no envía audio a ningún servidor y no requiere backend.

## Usar sin instalar nada

Descarga o clona el repositorio y abre `index.html` con doble clic en cualquier navegador moderno.

No hay build, no hay dependencias de Node y no hay empaquetador. El proyecto está hecho con HTML, CSS y JavaScript clásico, por lo que funciona tanto abierto como archivo local (`file://`) como servido desde internet.

## Publicarlo con GitHub Pages

1. Sube este repositorio a GitHub.
2. En **Settings → Pages**, elige la rama principal y la carpeta raíz (`/`).
3. GitHub generará una URL pública. Cualquier persona con el enlace podrá abrir la aplicación desde el navegador, sin instalar nada.

## Desplegarlo en Vercel

El repositorio incluye `vercel.json` para publicarlo como sitio estático, sin proceso de build.

Dos formas:

* **Dashboard:** importa el repositorio de GitHub en Vercel, usa el framework preset `"Other"`, deja el build command vacío y el output directory en la raíz.
* **CLI:** desde la carpeta del proyecto, ejecuta `npx vercel` o `vercel --prod` para producción.

Cada push a la rama conectada genera un deploy nuevo automáticamente.

## Estructura

```text
index.html             estructura de la página y carga ordenada de scripts
vercel.json            configuración mínima para desplegar como sitio estático

css/styles.css         tokens visuales, layout, paneles, sliders, switches,
                       tema tipo terminal y estilos de módulos avanzados

js/state.js            constantes, bandas, presets, estado persistido en localStorage
                       y flags de módulos avanzados

js/dsp.js              generación base de ruido blanco, ruido rosa y envolventes
                       silábicas para murmullo estándar

js/audio-engine.js     grafo principal de Web Audio: mezcla audible, filtros por banda,
                       murmullo estándar, nodos de análisis, limitador, transporte
                       y conexión con módulos avanzados

js/advanced-engines.js motores DSP avanzados:
                       UltrasonicEngine y AntiDenoiserEngine

js/scope.js            render del espectro en canvas usando el analizador audible

js/ui.js               conexión de controles DOM con estado, audio, calibración,
                       presets y panel de módulos avanzados

js/main.js             arranque de la aplicación
```

Cada archivo de `js/` se carga como script clásico, no como ES module, y expone su parte bajo el espacio de nombres compartido `window.EV`.

Orden de carga:

```text
state → dsp → audio-engine → advanced-engines → scope → ui → main
```

Se evita `import` / `export` a propósito, porque los módulos ES cargados desde `file://` pueden ser bloqueados por CORS en navegadores. El objetivo del proyecto es que pueda abrirse con doble clic sin servidor local.

## La interfaz

La aplicación usa una interfaz tipo terminal flotante estilo macOS: fondo oscuro, tipografía monoespaciada, alto contraste, paneles compactos y cabecera ASCII.

La UI incluye:

* Nivel de salida
* Color de ruido
* Murmullo
* Deriva
* Calibración dBA
* Espectro gráfico
* Selector de presets
* Panel `$ Módulos Avanzados`

El banner ASCII usa `aria-hidden`, para evitar que lectores de pantalla intenten leer caracteres decorativos. El título real se mantiene en el `h1`.

La hoja `css/styles.css` también conserva tokens alternativos para tema claro/oscuro bajo `:root` sin `data-ui="terminal"`. Actualmente la interfaz usa la piel terminal, pero los tokens quedan disponibles si en el futuro se reintroduce un selector visual.

## Qué hace

BlackoutVoid aumenta el piso acústico en bandas relevantes para la voz humana, de forma que una conversación filtrada hacia un pasillo, puerta, conducto, cristal o falso techo sea más difícil de entender.

La señal principal mezcla:

* Ruido rosa
* Ruido blanco
* Ecualización por bandas
* Murmullo sintético opcional
* Módulos avanzados opcionales

El control **Color de ruido** hace un crossfade de potencia constante entre ruido rosa y ruido blanco. Por defecto queda en 0 %, equivalente a 100 % rosa, para conservar el comportamiento original.

La mezcla audible pasa por el ecualizador de 7 bandas y por los presets existentes.

## Qué no hace

BlackoutVoid no cancela sonido.

No elimina físicamente una conversación del aire, no bloquea micrófonos dentro de la sala y no sustituye una política de dispositivos en reuniones sensibles.

La cancelación activa de una conversación completa en una sala real no es viable de forma general: solo puede funcionar en puntos muy concretos del espacio y con condiciones controladas.

El uso previsto es colocar el generador fuera de la sala o cerca del punto de fuga acústica:

* Pasillo
* Puerta
* Cristal
* Pleno de falso techo
* Conducto de clima
* Zona donde escucharía un posible intruso

Contra un micrófono colocado dentro de la sala, la solución correcta es control físico, política de dispositivos o inspección técnica.

## Presets

La aplicación conserva los presets operativos existentes, como:

* Puerta y pasillo
* Contra grabadora
* Pleno y conductos
* Otros perfiles definidos en `js/state.js`

Cada preset ajusta la mezcla, bandas de ecualización, nivel relativo de murmullo y comportamiento general del generador para un escenario concreto.

Los módulos avanzados no sustituyen los presets. Funcionan como capas adicionales que pueden activarse encima de la configuración actual.

## Módulos avanzados

El panel `$ Módulos Avanzados` añade dos capas DSP opcionales:

* **Ultrasónico**
* **Anti-Denoiser**

Cada módulo tiene su propio interruptor y su propio control de intensidad.

### Ultrasónico

El módulo ultrasónico genera una portadora de alta frecuencia con barrido automático lento.

Características:

* Clase principal: `UltrasonicEngine`
* Barrido nominal: 21 kHz a 40 kHz
* Límite automático según el Nyquist real del `AudioContext`
* Modulación AM mediante LFO de baja frecuencia
* Modulación FM mediante LFO lento
* Filtro `highpass` antes de salida
* Ganancia independiente con el control **Intensidad Ultrasónica**

Cuando se activa, el sistema limita automáticamente el nivel maestro a un máximo de 70 % para evitar saturación excesiva del hardware de reproducción.

El módulo se conecta al `GainNode` maestro, pero el análisis visual de espectro se mantiene separado para que el gráfico siga mostrando la zona audible relacionada con voz.

### Anti-Denoiser

El módulo Anti-Denoiser genera ruido no estacionario con forma similar a voz, pensado para dificultar algoritmos de reducción de ruido, separación de voz o supresión de fondo.

Características:

* Clase principal: `AntiDenoiserEngine`
* Fuente base de ruido blanco
* Banco de filtros tipo formante
* Filtros `bandpass` / `peaking` centrados en zonas típicas de vocales humanas
* Deriva aleatoria de frecuencia central
* Deriva aleatoria de Q
* Fluctuación aleatoria de volumen
* Modo tipo `babble` con 3 instancias paralelas
* Retardos y detune distintos por instancia

Cuando **Anti-Denoiser** está activo, reemplaza automáticamente el generador de **Murmullo** estándar. Esto evita superponer dos capas speech-like que podrían generar cancelaciones, exceso de densidad o un resultado menos controlable.

El control existente **Deriva** afecta directamente la velocidad de los LFOs aleatorios del Anti-Denoiser. Más deriva produce cambios más rápidos en formantes y volumen.

## Análisis de nivel y espectro

La aplicación usa rutas de análisis separadas:

* El **Espectro** muestra la mezcla audible.
* El **Nivel de salida** mide la energía total de salida después del limitador.

Esto permite que el gráfico siga siendo útil para ver las bandas de voz, incluso si el módulo ultrasónico está activo.

La calibración dBA, en cambio, toma como referencia la suma total de señales activas:

* Ruido base
* Murmullo estándar, si está activo
* Anti-Denoiser, si está activo
* Ultrasónico, si está activo
* Ganancia maestra

## Calibración y verificación

El panel de calibración permite fijar una referencia usando una lectura externa de sonómetro con ponderación A y respuesta lenta.

Flujo recomendado:

1. Coloca el generador en el punto de fuga o cerca de él.
2. Coloca el sonómetro en el punto donde escucharía una persona fuera de la sala.
3. Ajusta el nivel general.
4. Introduce la lectura real del sonómetro.
5. Pulsa **Fijar referencia**.
6. A partir de ese punto, la aplicación estima el dBA relativo mientras se ajustan los controles.

El rango útil suele estar alrededor de 45 a 48 dBA en el punto de escucha, aunque depende mucho del ruido ambiente, distancia, puerta, paredes, conductos y sensibilidad del entorno.

Para comprobar efectividad:

1. Una persona lee dentro de la sala una lista de palabras sueltas, sin relación entre sí.
2. Otra persona escucha fuera, desde el punto crítico.
3. La persona fuera anota únicamente las palabras que entiende.
4. Si entiende menos del 10 %, la privacidad práctica es razonable.

No se recomienda probar con frases completas, porque el contexto permite adivinar palabras aunque la señal esté parcialmente enmascarada.

## Seguridad de uso

No uses niveles innecesariamente altos.

El objetivo no es que el ruido sea molesto, sino que cubra la inteligibilidad de la voz en el punto de fuga. La aplicación incluye limitación de salida y reducción automática del master al activar el módulo ultrasónico, pero el nivel final también depende de los altavoces, amplificador, sala y distancia.

El módulo ultrasónico puede no reproducirse correctamente en muchos altavoces convencionales. Algunos dispositivos filtran esas frecuencias, otros generan distorsión audible y otros simplemente no emiten nada útil en esa zona.

Para uso real, valida siempre con escucha externa y medición básica.

## Privacidad

BlackoutVoid no solicita permisos de micrófono.

No captura audio.
No transmite audio.
No guarda grabaciones.
No usa servidor.
No depende de APIs externas.

El audio se genera localmente en el navegador mediante Web Audio API.

El estado de algunos controles puede guardarse en `localStorage` para conservar la configuración entre sesiones.

## Compatibilidad

Funciona en navegadores modernos con soporte para Web Audio API.

Recomendado:

* Chrome
* Edge
* Brave
* Firefox reciente

Safari puede funcionar, pero algunos detalles de Web Audio pueden variar según versión y dispositivo.

La aplicación está diseñada para funcionar abierta directamente desde `index.html`, sin servidor local.

## Desarrollo

No hay instalación de dependencias.

Para modificar:

1. Edita HTML, CSS o JS directamente.
2. Abre `index.html` en el navegador.
3. Recarga la página.
4. Prueba audio y controles.

Para validación rápida de sintaxis JavaScript, puede usarse:

```bash
node --check js/state.js
node --check js/dsp.js
node --check js/audio-engine.js
node --check js/advanced-engines.js
node --check js/scope.js
node --check js/ui.js
node --check js/main.js
```

## Estado actual

Versión actual: BlackoutVoid con módulos avanzados integrados.

Incluye:

* Generador base de ruido conformado a voz
* Murmullo estándar
* Control de deriva
* Presets por escenario
* Calibración dBA relativa
* Espectro gráfico audible
* `UltrasonicEngine`
* `AntiDenoiserEngine`
* Panel `$ Módulos Avanzados`
* Análisis separado para espectro y nivel total
* Límite automático de master al activar ultrasonido
* Sustitución automática de murmullo por Anti-Denoiser
