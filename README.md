# Programas Tierra Linda

Aplicación para armar, imprimir y compartir el programa del servicio de la Iglesia
Adventista del Séptimo Día de Tierra Linda. Sirve para el culto del sábado, Sociedad de
Jóvenes, vísperas o cualquier otro programa.

- **Aplicación:** https://programas-tierra-linda.pages.dev
- **Manual para los usuarios:** https://programas-tierra-linda.pages.dev/manual.html
- **Modo publicación (solo yo):** https://programas-tierra-linda.pages.dev/?publicar

## Quién usa esto y quién lo mantiene

| Rol | Quién | Qué hace |
|---|---|---|
| **Autor** | Ancianos, junta, directores de ministerio | Abre el enlace y escribe encima. Nunca ve nada técnico: ni JSON, ni archivos, ni el repositorio. |
| **Lector** | Cualquiera con el enlace `?ver` | Ve el programa cerrado, lo imprime o lo guarda en PDF. Solo tiene dos botones: Imprimir y Manual. |
| **Mantenedor** | Camilo (solo yo) | Edita el código, publica el programa vigente y despliega. Único que necesita `?publicar`, git y la terminal. |

Esa separación es una decisión de diseño, no una casualidad: la barra de herramientas
esconde las acciones de mantenimiento salvo que la dirección lleve `?publicar`, y el
manual está escrito sin una sola palabra técnica.

## Estado del proyecto

Sin dependencias en tiempo de ejecución, sin paso de compilación, sin servidor y sin base
de datos. `index.html` es la fuente: se edita a mano. No existe ningún generador.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La aplicación completa: HTML, CSS y JavaScript en un archivo (~57 KB). |
| `manual.html` | Manual de uso para autores. Doce secciones, sin lenguaje técnico. |
| `programas/AAAA-MM-DD.json` | Un archivo por programa publicado. |
| `programas/index.json` | Índice generado. **El primero de la lista es el vigente.** |
| `programa-actual.json` | Respaldo del vigente por si el índice falta. |
| `logo-tl.png`, `logo-sda.png` | Logos del encabezado, a 2x del tamaño en que se muestran. |
| `tests/horas.js` | 19 casos del cálculo de duración. |
| `tests/modelo.js` | Serialización, estados dañados y filtrado de HTML. |
| `tests/vistas.js` | Tarjetas y hoja en cuatro pantallas, más impresión. Necesita servidor local. |
| `tools/indexar.js` | Regenera `programas/index.json`. |
| `tools/capturas.js` | Vuelve a tomar las imágenes del manual desde la aplicación real. |
| `tools/optimizar-capturas.py` | Reduce el peso de esas imágenes. |
| `capturas/` | Las 11 imágenes que ilustran el manual. |
| `mantenimiento.html` | Mi manual: versiones, publicación, casos especiales y guion de la demo. Enlazado solo en `?publicar`. |
| `tools/pre-commit` | Bloquea líneas de más de 2.000 caracteres. |

## Publicar el programa de la semana

```bash
# 1. Armar el programa en https://programas-tierra-linda.pages.dev/?publicar
# 2. Botón "⬇️ Publicar JSON": descarga 2026-09-05.json (el nombre sale de la fecha)
mv ~/Downloads/2026-09-05.json programas/
node tools/indexar.js
git add -A && git commit -m "Programa del 5 de septiembre" && git push
```

Cloudflare Pages despliega en menos de un minuto. Desde ese momento, quien entre a la
página ve ese programa, **salvo** que tenga uno propio guardado o venga por un enlace
compartido: el vigente nunca pisa el trabajo de nadie.

## Cómo decide la aplicación qué mostrar

Orden de precedencia al abrir:

1. **Enlace compartido** (`#...` en la dirección). Si la persona ya tiene un programa
   guardado, se le pregunta antes de reemplazarlo. En `?ver` no se pregunta ni se guarda.
2. **Lo guardado en el equipo** (`localStorage`, clave `programa-editable-v1`).
3. **El vigente** (`programas/index.json` → primer archivo; si falla, `programa-actual.json`).
4. **El ejemplo interno** que va dentro de `index.html`, para que la página nunca abra vacía.

## Modos y parámetros de la dirección

| Parámetro | Efecto |
|---|---|
| `?ver` | Solo lectura: sin campos editables, sin guardar nada, y la barra reducida a Imprimir y Manual (más el cambio de vista en celular). |
| `?publicar` | Muestra "Publicar JSON" y "Descargar copia", con un sello ⚙️ en la barra. |
| `#z.…` | Programa comprimido con deflate (formato actual, ~2.000 caracteres). |
| `#…` | Programa sin comprimir (formato viejo). Se sigue leyendo para no romper enlaces ya repartidos. |

## Modelo de datos

Es el mismo objeto en los tres lugares: el JSON publicado, el `localStorage` y el enlace.

```jsonc
{
  "v": 1,                       // versión del esquema, la pone normalizar()
  "kicker": "Iglesia Adventista del Séptimo Día",
  "titulo": "Programación del Servicio · Tierra Linda",
  "fecha": "Sábado 22 de agosto de 2026",
  "meta": [["Lideran:", "Ministerio Infantil"], ["Anciano de turno:", "Andrés Torres"]],
  "secciones": [
    {
      "nombre": "APERTURA",
      "filas": [
        {
          "hora": "9:00 – 9:05",   // el rango; los minutos se calculan de aquí
          "mins": "5 min",          // derivado, se guarda solo para la copia impresa
          "tit": "Oración inicial y bienvenida",
          "sub": "",                // detalle opcional: himnos, video, notas
          "nom": "Andrés Torres",
          "rol": "",                // cargo, se muestra si no hay sello
          "chip": true,             // sello dorado en vez del cargo
          "chipText": "Anciano de turno"
        }
      ]
    }
  ],
  "recosTitulo": "Recomendaciones",
  "recos": "<b>1.</b> …",         // único campo con HTML, filtrado a b/i/strong/em/br/u
  "cita": "“Dios es un Dios de orden…”",
  "autor": "Elena G. de White · Patriarcas y Profetas, p. 391",
  "logos": { "tl": "data:image/png;base64,…" }  // opcional, solo si alguien reemplazó un logo
}
```

`normalizar()` completa lo que falte y descarta lo que no tenga forma de programa, así que
un archivo a medias o un enlace viejo nunca dejan la página en blanco.

## Reglas y límites que están en el código

| Constante | Valor | Por qué |
|---|---|---|
| `ESQUEMA` | 1 | Versión del modelo. Subirla obliga a migrar enlaces viejos. |
| `ANCHO_TARJETAS` | 900 px | Hasta ahí se usa la vista de tarjetas. Se mide con `screen.width`, no con `clientWidth`, porque Safari infla ese valor según `initial-scale`. |
| `TOPE_LOGO` | 400 KB | Más grande no cabe en `localStorage` y rompía todo guardado posterior. |
| `TOPE_HISTORIAL` | 40 | Pasos de deshacer. |
| Enlace | 8.000 caracteres | Pasado ese punto avisa en vez de copiar un enlace que WhatsApp cortaría. |

## Pruebas

```bash
npm i -D playwright
node tests/horas.js
node tests/modelo.js
python3 -m http.server 8787      # en otra terminal, desde la raíz
node tests/vistas.js
```

`tests/vistas.js` necesita servidor porque la página pide `programas/index.json` y los
logos, y con `file://` esas peticiones fallan.

Guardia de líneas largas, una vez por copia del repositorio:

```bash
chmod +x tools/pre-commit
git config core.hooksPath tools
```

## Regenerar las imágenes del manual

El manual se ilustra con capturas de la aplicación real, no con maquetas, así que si cambia
la interfaz hay que volver a tomarlas:

```bash
python3 -m http.server 8787        # en otra terminal, desde la raíz
node tools/capturas.js
python3 tools/optimizar-capturas.py
```

## Despliegue

Cloudflare Pages conectado a este repositorio: framework **None**, build command vacío,
output directory `/`, rama de producción `main`.

Si los push dejan de desplegar, revisar el banner del proyecto en Cloudflare: cuando dice
*"This project is disconnected from your Git account"*, la integración de la GitHub App se
cayó. Se arregla en Settings → Git repository → **Manage**, o dando acceso al repositorio
en https://github.com/settings/installations. Después, un commit vacío dispara el build:

```bash
git commit --allow-empty -m "Forzar despliegue" && git push
```

## Alcance real del enlace de solo lectura

No es un candado, es una señal. El programa viaja completo dentro de la dirección, así que
cualquiera que le quite el `?ver` a mano puede editarlo en su propia copia. Lo que el modo
logra es lo que importa en la práctica: quien recibe el enlace no puede cambiar nada por
accidente, no le queda guardado, y le llega el mensaje de que ese programa ya está cerrado.

Se quitó a propósito el botón "Editar una copia" que había al principio: contradecía el
propósito del enlace y abría la puerta a que circularan dos versiones del mismo sábado.
Quien necesite editar pide el enlace editable, o usa el histórico desde la página normal.

## Decisiones de diseño

1. **`index.html` es la fuente, no un artefacto generado.** Hubo un generador en Python;
   se eliminó porque no aportaba lógica y no estaba versionado.
2. **CSS y JS van dentro del HTML.** El CSS es obligatorio para que la copia descargable
   conserve el diseño; separar el JS no se justifica con un solo mantenedor.
3. **Los logos son archivos, no base64.** Con el base64 embebido, el HTML tenía líneas de
   78.000 caracteres y ningún visor de diff lo abría. Al descargar una copia se incrustan
   al vuelo con `fetch` y `FileReader`.
4. **Sin servidor.** Se evaluó un Worker con KV para tener una versión compartida y se
   descartó: agrega despliegue aparte, secretos, autorización y consistencia eventual para
   un grupo que se coordina por WhatsApp. Con el JSON en el repositorio, Git da además el
   historial de cada sábado.
5. **Todo el texto del usuario se escapa al pintar**, y `recos` se filtra con `DOMParser`
   sobre un documento inerte, no con un `div` temporal: asignarle `innerHTML` a un `div`
   ya dispara la carga de imágenes y con eso un `onerror`.
6. **Dos vistas, una sola hoja.** Las reglas de tarjetas viven en `@media screen`, así el
   papel nunca cambia. La impresión siempre es carta horizontal en una página.
7. **Los tamaños y colores pequeños existen para el papel.** En pantalla se agrandan y se
   oscurecen dentro de `@media screen`: el dorado de marca mide 2,95:1 sobre blanco y no
   sirve para texto.

## Problemas conocidos y qué hacer

| Síntoma | Causa y salida |
|---|---|
| SmartGit no muestra el diff de un archivo | Alguna línea pasa de 10.000 caracteres. El hook lo bloquea antes; si se cuela, partir el contenido o sacarlo a un archivo. |
| "No se pudo guardar en este navegador" | `localStorage` lleno, casi siempre por un logo pesado. La aplicación reintenta guardando sin logos. |
| Un push no despliega | Integración de Git desconectada en Cloudflare. Ver la sección de despliegue. |
| El programa vigente no aparece | Falta correr `node tools/indexar.js`, o el JSON quedó mal formado. La aplicación cae al respaldo y al ejemplo. |

## Pendientes

- Logo en SVG, o PNG de 900 px con transparencia. El actual salió de una captura de
  pantalla y ese es su techo de calidad.
- Prellenar el programa del sábado siguiente desde la lista de predicación del trimestre.
- Comprimir también los logos personalizados para que viajen en el enlace.
