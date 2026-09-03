# Programas Tierra Linda

Aplicación para armar, imprimir y compartir el programa del servicio de la Iglesia
Adventista del Séptimo Día de Tierra Linda. Trae cargado el culto del sábado en la mañana, y
sirve igual para el programa de la tarde, la Sociedad de Jóvenes, el culto del miércoles o el
del viernes en la noche.

- **Aplicación:** https://programas-tierra-linda.pages.dev
- **Manual para los usuarios:** https://programas-tierra-linda.pages.dev/manual.html
- **Modo publicación (solo yo):** https://programas-tierra-linda.pages.dev/?publicar
- **Manual de mantenimiento (solo yo):** https://programas-tierra-linda.pages.dev/mantenimiento.html

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

Página estática sin dependencias ni compilación, más una pieza de servidor mínima: un
Pages Function (`/api/*`) y una base D1 para que los autores publiquen sin pasar por
Git. `index.html` es la fuente: se edita a mano. No existe ningún generador. Sin la
base, la página funciona igual que la versión estática.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La aplicación completa: HTML, CSS y JavaScript en un archivo (~60 KB). |
| `functions/api/[[ruta]].js` | El API de publicación (~190 líneas). Ver "La base de datos y el API". |
| `migrations/0001_inicial.sql` | Esquema de la base D1 `programas-tl`. |
| `wrangler.toml` | Binding de la base al proyecto de Pages. |
| `manual.html` | Manual de uso para autores. Sin lenguaje técnico. |
| `programas/AAAA-MM-DD.json` | Un archivo por programa publicado. |
| `programas/index.json` | Índice generado. **El primero de la lista es el vigente.** |
| `programa-actual.json` | Respaldo del vigente por si el índice falta. |
| `logo-tl.png`, `logo-sda.png` | Logos del encabezado, a 2x del tamaño en que se muestran. |
| `tests/horas.js` | 19 casos del cálculo de duración. |
| `tests/modelo.js` | Serialización, estados dañados y filtrado de HTML. |
| `tests/vistas.js` | Tarjetas y hoja en cuatro pantallas, más impresión. Necesita servidor local. |
| `tests/api.js` | 18 casos del API: publicar, autores, rechazos, revocación y límite de intentos. |
| `tests/publicar.js` | El flujo de publicar desde la página, con navegador real. |
| `tools/indexar.js` | Regenera `programas/index.json`. |
| `tools/capturas.js` | Vuelve a tomar las imágenes del manual desde la aplicación real. |
| `tools/optimizar-capturas.py` | Reduce el peso de esas imágenes. |
| `capturas/` | Las 11 imágenes que ilustran el manual. |
| `mantenimiento.html` | Mi manual: versiones, publicación, casos especiales y guion de la demo. Enlazado solo en `?publicar`. |
| `tools/pre-commit` | Bloquea líneas de más de 2.000 caracteres. |

## Publicar el programa de la semana

Desde la versión con base de datos, publicar es un botón dentro de la página: el autor
abre su enlace de autor una vez (queda guardado en su navegador), arma el programa y
toca **☁️ Publicar**. El servidor valida su código, guarda el programa por fecha en D1
y desde ese momento es lo que ve quien abra la página, **salvo** que tenga uno propio
guardado o venga por un enlace compartido: el vigente nunca pisa el trabajo de nadie.

El flujo por Git sigue existiendo como respaldo (y es lo que ve quien abre el sitio si
la base no responde):

```bash
# 1. Botón "⬇️ Descargar JSON": descarga 2026-09-05.json (el nombre sale de la fecha)
mv ~/Downloads/2026-09-05.json programas/
node tools/indexar.js
git add -A && git commit -m "Programa del 5 de septiembre" && git push
```

## La base de datos y el API

- **D1 `programas-tl`** (cuenta personal de Cloudflare), binding `DB` declarado en
  `wrangler.toml`. Esquema en `migrations/0001_inicial.sql`: `programa` (una fila por
  fecha, upsert), `autor` (nombre + SHA-256 del código, revocable con `activo`) e
  `intento` (fallos de autenticación por IP).
- **`functions/api/[[ruta]].js`** atiende `/api/*`:

| Ruta | Método | Auth | Qué hace |
|---|---|---|---|
| `/api/vigente` | GET | pública | El programa de la fecha más próxima que no ha pasado (día de Colombia); si no hay futuros, el más reciente. Permite dejar publicados varios sábados: cada uno se estrena solo |
| `/api/programas` | GET | pública | Lista de fechas publicadas |
| `/api/programa/AAAA-MM-DD` | GET | pública | Un programa puntual |
| `/api/publicar` | POST | código de autor | Guarda/actualiza el programa de su fecha |
| `/api/autores` | GET/POST | clave de mantenedor | Lista / crea autores (el código se muestra una sola vez) |
| `/api/autores/estado` | POST | clave de mantenedor | Activa o desactiva un autor |

- Defensas (las tres lecciones de la app de jóvenes, desde el día uno): placeholders en
  todo SQL, `Origin` propio exigido en cada POST cuando el navegador lo manda, y 429
  tras 10 fallos de autenticación por IP en 15 minutos. La fecha-clave se deriva en el
  servidor y los logos nunca se guardan en la base.
- `CLAVE_MANTENEDOR` es una variable secreta del proyecto en Pages
  (Settings → Environment variables). No vive en el repositorio.
- Si el API no responde (base sin configurar, sitio abierto como archivo), **todo cae
  al flujo anterior** sin error visible: índice del repositorio y `programa-actual.json`.

## Cómo decide la aplicación qué mostrar

Orden de precedencia al abrir:

1. **Enlace compartido** (`#...` en la dirección). Si la persona ya tiene un programa
   guardado, se le pregunta antes de reemplazarlo. En `?ver` no se pregunta ni se guarda.
2. **Lo guardado en el equipo** (`localStorage`, clave `programa-editable-v1`).
3. **El vigente de la base** (`GET /api/vigente`).
4. **El vigente del repositorio** (`programas/index.json` → primer archivo; si falla,
   `programa-actual.json`).
5. **El ejemplo interno** que va dentro de `index.html`, para que la página nunca abra vacía.

El histórico (🗂️ Programas) une la base y el repositorio: la base manda cuando una
fecha existe en ambos.

## Modos y parámetros de la dirección

| Parámetro | Efecto |
|---|---|
| `?ver` | Solo lectura: sin campos editables, sin guardar nada, y la barra reducida a Imprimir y Manual (más el cambio de vista en celular). |
| `?publicar` | Muestra "Descargar JSON", "Descargar copia" y "👥 Autores", con un sello ⚙️ en la barra. |
| `?a=CÓDIGO` | Enlace de autor: guarda el código en el navegador, se limpia de la dirección y habilita ☁️ Publicar. |
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
| `TOPE_BODY` (API) | 200 KB | Un programa sin logos pesa ~6 KB; más que esto no es un programa. |
| `FALLOS_MAX` (API) | 10 en 15 min | Fallos de autenticación por IP antes del 429. |

## Pruebas

```bash
npm i -D playwright
node tests/horas.js
node tests/modelo.js
python3 -m http.server 8787      # en otra terminal, desde la raíz
node tests/vistas.js
```

Las del API y el flujo de publicar necesitan el servidor local con base:

```bash
npx wrangler d1 execute programas-tl --local --file migrations/0001_inicial.sql
npx wrangler pages dev . --port 8788 --binding CLAVE_MANTENEDOR=clave-prueba-123   # otra terminal
node tests/publicar.js
node tests/api.js      # va de último: sus fallos a propósito activan el 429 local
# para repetir la tanda: npx wrangler d1 execute programas-tl --local --command "DELETE FROM intento"
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
4. **Backend mínimo, y solo para publicar.** La primera versión fue 100% estática: se
   evaluó un Worker con KV y se descartó porque publicar por Git alcanzaba. El cuello de
   botella real apareció después: cada publicación pasaba por el mantenedor. La versión
   actual agrega exactamente esa pieza — D1 + un Function corto para `POST /api/publicar`
   y sus lecturas — copiando los patrones de la app de jóvenes pero no su plataforma:
   sin cuentas, sin cookies, sin OAuth. Todo lo demás sigue siendo estático, y sin base
   la página funciona igual que antes.
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
| El programa vigente no aparece | Con base: revisar `GET /api/vigente` (404 = nada publicado; 503 = binding DB sin configurar). Sin base: falta `node tools/indexar.js` o el JSON quedó mal formado. La aplicación cae al respaldo y al ejemplo. |
| "El enlace de autor no es válido" | El código fue desactivado en 👥 Autores o se pegó incompleto. Crear uno nuevo y reenviar el enlace `?a=`. |
| 429 "Demasiados intentos" | Diez fallos de autenticación desde esa IP en 15 minutos. Esperar 15 minutos; si es un ataque de adivinación, ya está haciendo su trabajo. |

## Pendientes

- Logo en SVG, o PNG de 900 px con transparencia. El actual salió de una captura de
  pantalla y ese es su techo de calidad.
- Prellenar el programa del sábado siguiente desde la lista de predicación del trimestre.
- Comprimir también los logos personalizados para que viajen en el enlace.
