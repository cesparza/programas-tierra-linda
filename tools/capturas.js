// Genera las imágenes del manual a partir de la aplicación real, no de maquetas.
// Así el manual no se desactualiza en silencio: si cambia la interfaz, se vuelven a correr.
//
//   python3 -m http.server 8787    (desde la raíz del proyecto)
//   node tools/capturas.js
const { chromium, devices } = require('playwright');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:8787/index.html';
const SALIDA = path.resolve(__dirname, '../capturas');

/* Recorta un ancho fijo a partir de un elemento, para incluir columnas vecinas. */
async function recortarAncho(pagina, selector, nombre, ancho, margen = 10) {
  const caja = await pagina.locator(selector).first().boundingBox();
  if (!caja) throw new Error('no se encontró ' + selector);
  await pagina.screenshot({
    path: require('path').join(SALIDA, nombre),
    clip: { x: Math.max(0, caja.x - margen), y: Math.max(0, caja.y - margen), width: ancho, height: caja.height + margen * 2 },
  });
  console.log('  ' + nombre);
}

/* Recorta alrededor de un elemento, con margen, para que la imagen tenga contexto. */
async function recortar(pagina, selector, nombre, margen = 14) {
  const caja = await pagina.locator(selector).first().boundingBox();
  if (!caja) throw new Error('no se encontró ' + selector);
  const vista = pagina.viewportSize();
  await pagina.screenshot({
    path: path.join(SALIDA, nombre),
    clip: {
      x: Math.max(0, caja.x - margen),
      y: Math.max(0, caja.y - margen),
      width: Math.min(vista.width - Math.max(0, caja.x - margen), caja.width + margen * 2),
      height: Math.min(vista.height - Math.max(0, caja.y - margen), caja.height + margen * 2),
    },
  });
  console.log('  ' + nombre);
}

(async () => {
  const navegador = await chromium.launch();

  // ---------- escritorio ----------
  const escritorio = await navegador.newContext({
    viewport: { width: 1400, height: 1000 }, screen: { width: 1400, height: 1000 }, deviceScaleFactor: 2,
  });
  const p = await escritorio.newPage();
  await p.goto(BASE);
  await p.waitForTimeout 
    ? await p.waitForTimeout(600) : null;

  await recortar(p, '.hoja', '01-general.png', 6);
  await recortar(p, 'header', '07-encabezado.png');
  await recortarAncho(p, 'tbody tr:nth-child(2) .hora', '05-minutos.png', 560);
  await recortarAncho(p, 'tbody tr:nth-child(2) .spine', '04-secciones.png', 620);
  await recortar(p, 'tbody tr:nth-child(2) .ops', '03-botones.png', 10);

  // campo con el cursor puesto, para mostrar cómo se ve al editar
  await p.click('tbody tr:nth-child(3) .espacio .tit');
  await p.waitForTimeout(200);
  await recortar(p, 'tbody tr:nth-child(3) .espacio', '02-editar.png', 12);

  // deshacer habilitado
  await p.click('tbody tr:nth-child(3) .ops button[title="Bajar este espacio"]');
  await p.waitForTimeout(300);
  await recortar(p, '#btn-deshacer', '06-deshacer.png', 10);
  await recortar(p, 'button[onclick="copiarEnlace(false)"]', '10-compartir.png', 10);

  // panel del histórico
  await p.click('#btn-historico');
  await p.waitForTimeout(400);
  await recortar(p, '#panel-programas', '11-historico.png', 8);

  // ---------- celular ----------
  const telefono = await navegador.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  const m = await telefono.newPage();
  await m.goto(BASE);
  await m.waitForTimeout(700);
  await m.screenshot({ path: path.join(SALIDA, '08-celular.png') });
  console.log('  08-celular.png');

  await navegador.close();
  console.log('listo. Optimizar con: python3 tools/optimizar-capturas.py');
})();
