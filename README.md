# Programas Tierra Linda

Página para armar, imprimir y compartir el programa del servicio de la Iglesia Adventista
del Séptimo Día de Tierra Linda. Sirve para el culto del sábado, Sociedad de Jóvenes,
vísperas o cualquier otro programa.

**En línea:** https://programas-tierra-linda.pages.dev
**Manual de uso:** https://programas-tierra-linda.pages.dev/manual.html

## Qué es, en una línea

Una sola página estática, sin dependencias, sin build y sin servidor: se edita con clic
directo sobre el documento y se imprime en una hoja carta horizontal.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La aplicación. Es la fuente, se edita a mano. No hay generador. |
| `manual.html` | Manual de uso para los ancianos y la junta. |
| `programas/AAAA-MM-DD.json` | Los programas publicados. El más reciente es el vigente. |
| `programas/index.json` | Índice de los programas. Lo genera `tools/indexar.js`. |
| `programa-actual.json` | Respaldo del vigente, por si el índice no existe. |
| `logo-tl.png`, `logo-sda.png` | Los dos logos del encabezado. |
| `tests/` | Pruebas con Playwright. |
| `tools/pre-commit` | Guardia que bloquea líneas de más de 2.000 caracteres. |
| `tools/indexar.js` | Regenera el índice de programas. |

## Publicar el programa de la semana

1. Armar el programa en la página.
2. Botón **⬇️ Publicar JSON**: descarga el archivo ya con el nombre de la fecha,
   por ejemplo `2026-09-05.json`.
3. Mover ese archivo a `programas/`.
4. `node tools/indexar.js`
5. Commit y push. Cloudflare Pages despliega solo, y desde ese momento quien entre a la
   página ve ese programa.

El programa vigente nunca pisa el trabajo de nadie: solo se carga si la persona no tiene
un programa propio guardado ni abrió un enlace compartido.

## Compartir

- **🔗 Enlace editable**: lleva el programa comprimido dentro de la dirección. Quien lo
  abre puede seguir editándolo, y la página le pregunta antes de reemplazar el suyo.
- **👁️ Enlace de solo lectura**: el mismo enlace con `?ver`. No se puede editar y no
  guarda nada en el navegador de quien lo abre. Sirve para repartir el programa ya cerrado.
- **🖨️ Imprimir / Guardar PDF**: carta horizontal, márgenes en ninguno.
- **💾 Descargar copia**: un HTML con el programa y los logos incrustados, que funciona
  sin internet.

## Pruebas

```bash
npm i -D playwright
node tests/horas.js      # 19 casos del cálculo de minutos
node tests/modelo.js     # serialización, estados dañados y filtrado de HTML
python3 -m http.server 8787   # en otra terminal, desde la raíz
node tests/vistas.js     # tarjetas vs hoja en cuatro pantallas, e impresión
```

Activar el guardia de líneas largas, una vez por copia del repositorio:

```bash
chmod +x tools/pre-commit
git config core.hooksPath tools
```

## Decisiones de diseño

- **Un solo archivo para la aplicación.** El CSS va dentro porque la copia descargable
  tiene que conservar el diseño sin depender de la carpeta del sitio.
- **Los logos son archivos, no base64.** Así los diffs se pueden leer; al descargar una
  copia se incrustan al vuelo.
- **Sin servidor ni base de datos.** El programa vigente es un JSON del repositorio, y
  Git da el historial de cada sábado gratis.
- **El texto del usuario se escapa siempre**, y el campo de recomendaciones se filtra con
  `DOMParser` sobre un documento inerte, porque el estado viaja en enlaces compartidos.
- **Dos vistas**: tarjetas en celular para editar con el dedo, y hoja carta para revisar
  e imprimir. Las reglas de tarjetas viven en `@media screen`, así el papel nunca cambia.

## Pendiente

- Logo en SVG o PNG de 900 px con transparencia (el actual salió de una captura).
- Prellenar el programa del sábado siguiente desde la lista de predicación.
