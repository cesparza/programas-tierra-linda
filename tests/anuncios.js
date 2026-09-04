/* Pruebas de la hoja de anuncios: edición, viaje redondo en el enlace, impresión.
   Requiere el servidor local: python3 -m http.server 8787
   Ejecutar con: node tests/anuncios.js */

const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8787/index.html';

let pasan = 0, fallan = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { pasan++; console.log('  ✓ ' + nombre); }
  else { fallan++; console.log('  ✗ ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

(async () => {
  const navegador = await chromium.launch();
  const p = await navegador.newPage();
  p.on('dialog', d => d.accept());
  const errores = [];
  p.on('pageerror', e => errores.push(String(e)));
  await p.goto(BASE);
  await p.waitForTimeout(800);

  console.log('La hoja de anuncios va y viene:');
  ok('al abrir se ve el programa, no los anuncios', await p.isVisible('.hoja.programa') && !(await p.isVisible('.anuncios-hoja')));
  await p.click('#btn-anuncios');
  await p.waitForTimeout(300);
  ok('el botón lleva a los anuncios', await p.isVisible('.anuncios-hoja') && !(await p.isVisible('.hoja.programa')));
  ok('el botón cambia de nombre', (await p.textContent('#btn-anuncios')).includes('Programa'));

  console.log('Agregar, escribir, mover y quitar:');
  await p.click('.agregar-anuncio');
  await p.waitForTimeout(400);
  await p.click('.agregar-anuncio');
  await p.waitForTimeout(400);
  ok('se agregan dos anuncios', (await p.evaluate(() => modelo.anuncios.length)) === 2);
  await p.evaluate(() => {
    const campos = document.querySelectorAll('[data-a$=".tit"]');
    campos[0].textContent = 'Semana de evangelismo';
    campos[1].textContent = 'Campaña presencial';
    campos[0].dispatchEvent(new Event('input', { bubbles: true }));
    campos[1].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(700);
  ok('lo escrito llega al modelo', (await p.evaluate(() => modelo.anuncios[0].tit)) === 'Semana de evangelismo');
  await p.click('.anuncio:first-child button[title="Bajar este anuncio"]');
  await p.waitForTimeout(400);
  ok('bajar reordena', (await p.evaluate(() => modelo.anuncios[0].tit)) === 'Campaña presencial');
  ok('la numeración se rehace', (await p.textContent('.anuncio:first-child .num')).trim() === '1.');
  await p.click('.anuncio:first-child button[title="Quitar este anuncio"]');
  await p.waitForTimeout(400);
  ok('quitar deja uno', (await p.evaluate(() => modelo.anuncios.length)) === 1);
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(400);
  ok('deshacer devuelve el que se quitó', (await p.evaluate(() => modelo.anuncios.length)) === 2);

  console.log('Impresión: se imprime la hoja que se está viendo:');
  const pdfAnuncios = await p.pdf({ width: '11in', height: '8.5in', printBackground: true });
  const textoA = pdfAnuncios.toString('latin1');
  ok('la hoja de anuncios sale en una sola página', pdfAnuncios.length > 15000 && !textoA.includes('/Count 2'));
  await p.click('#btn-anuncios');
  await p.waitForTimeout(300);
  const pdfPrograma = await p.pdf({ width: '11in', height: '8.5in', printBackground: true });
  ok('el programa sigue saliendo en una sola página', pdfPrograma.length > 20000 && !pdfPrograma.toString('latin1').includes('/Count 2'));
  ok('los dos PDF son distintos', pdfAnuncios.length !== pdfPrograma.length);

  console.log('Viaje redondo por el enlace compartido:');
  const hash = await p.evaluate(async () => {
    leerDOM();
    return await comprimir(JSON.stringify(modelo));
  });
  const otra = await navegador.newPage();
  await otra.goto(BASE + '#' + hash);
  await otra.waitForTimeout(900);
  ok('los anuncios viajan en el enlace', (await otra.evaluate(() => modelo.anuncios.length)) === 2);
  ok('con su texto', (await otra.evaluate(() => modelo.anuncios[0].tit)) === 'Campaña presencial');
  await otra.close();

  console.log('Un programa viejo, sin anuncios, no se rompe:');
  const viejo = await p.evaluate(async () => {
    const m = JSON.parse(JSON.stringify(modelo));
    delete m.anuncios; delete m.anunciosTitulo; delete m.anunciosCierre;
    return await comprimir(JSON.stringify(m));
  });
  const antigua = await navegador.newPage();
  const erroresViejo = [];
  antigua.on('pageerror', e => erroresViejo.push(String(e)));
  antigua.on('dialog', d => d.accept());
  await antigua.goto(BASE + '#' + viejo);
  await antigua.waitForTimeout(900);
  ok('abre sin errores', erroresViejo.length === 0, erroresViejo.join(' | '));
  ok('queda con la lista vacía', (await antigua.evaluate(() => modelo.anuncios.length)) === 0);
  await antigua.close();

  console.log('El lector ve los anuncios pero no los edita:');
  const lectora = await navegador.newPage();
  await lectora.goto(BASE + '?ver#' + hash);
  await lectora.waitForTimeout(900);
  await lectora.click('#btn-anuncios');
  await lectora.waitForTimeout(300);
  ok('puede verlos', await lectora.isVisible('.anuncios-hoja'));
  ok('sin botones de edición', !(await lectora.isVisible('.agregar-anuncio')) && !(await lectora.isVisible('.anuncio .ops-a')));
  ok('sin campos editables', (await lectora.evaluate(() => document.querySelectorAll('.anuncios-hoja [contenteditable]').length)) === 0);
  await lectora.close();

  ok('cero errores de JavaScript en toda la sesión', errores.length === 0, errores.join(' | '));

  await navegador.close();
  console.log('\n' + pasan + ' pasan, ' + fallan + ' fallan');
  process.exit(fallan ? 1 : 0);
})().catch(e => { console.error('Error de las pruebas:', e); process.exit(1); });
