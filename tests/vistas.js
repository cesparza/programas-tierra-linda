// Prueba de las dos vistas y de la impresion. Necesita un servidor local porque la
// pagina descarga programa-actual.json y los logos, y con file:// esas peticiones fallan.
//
//   python3 -m http.server 8787 --directory .   (desde la raiz del proyecto)
//   node tests/vistas.js
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8787/index.html';

const PANTALLAS = [
  ['iPhone 13', devices['iPhone 13'], true],
  ['iPad vertical', { viewport: { width: 820, height: 1180 }, screen: { width: 820, height: 1180 }, isMobile: true, hasTouch: true }, true],
  ['iPad horizontal', { viewport: { width: 1180, height: 820 }, screen: { width: 1180, height: 820 }, isMobile: true, hasTouch: true }, false],
  ['Escritorio', { viewport: { width: 1440, height: 900 }, screen: { width: 1440, height: 900 } }, false],
];

(async () => {
  const navegador = await chromium.launch();
  let fallos = 0;
  for (const [nombre, config, esperaTarjetas] of PANTALLAS) {
    const pagina = await (await navegador.newContext(config)).newPage();
    const errores = [];
    pagina.on('pageerror', e => errores.push(e.message));
    await pagina.goto(BASE);
    await pagina.waitForTimeout(400);
    const r = await pagina.evaluate(() => ({
      tarjetas: document.body.classList.contains('tarjetas'),
      desborda: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      logos: [...document.querySelectorAll('header img')].every(i => i.complete && i.naturalWidth > 0),
      filas: document.querySelectorAll('tbody tr').length,
    }));
    const bien = r.tarjetas === esperaTarjetas && !r.desborda && r.logos && r.filas > 0 && !errores.length;
    if (!bien) fallos++;
    console.log((bien ? '  ok  ' : ' FALLA') + '  ' + nombre.padEnd(16) + ' -> ' + JSON.stringify(r) + (errores.length ? ' errores: ' + errores : ''));
  }

  // impresion: una sola pagina carta horizontal, sin controles
  const pagina = await (await navegador.newContext(devices['iPhone 13'])).newPage();
  await pagina.goto(BASE);
  await pagina.waitForTimeout(300);
  const pdf = await pagina.pdf({ width: '11in', height: '8.5in', printBackground: true });
  const texto = pdf.toString('latin1');
  const bienPdf = pdf.length > 20000 && !texto.includes('/Count 2');
  if (!bienPdf) fallos++;
  console.log((bienPdf ? '  ok  ' : ' FALLA') + '  impresion en una pagina carta horizontal');

  await navegador.close();
  console.log(fallos ? `\n${fallos} fallo(s)` : '\ntodo bien');
  process.exit(fallos ? 1 : 0);
})();
