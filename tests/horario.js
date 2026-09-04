/* Pruebas de la corrección del horario en cascada (⤓ ajustar siguientes).
   Requiere el servidor local: python3 -m http.server 8787
   Ejecutar con: node tests/horario.js */

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
  await p.goto(BASE);
  await p.waitForTimeout(900);

  const hora = n => p.evaluate(k => {
    const planas = [];
    modelo.secciones.forEach(s => s.filas.forEach(f => planas.push(f)));
    return planas[k].hora;
  }, n);
  const duraciones = () => p.evaluate(() => {
    const planas = [];
    modelo.secciones.forEach(s => s.filas.forEach(f => planas.push(f)));
    return planas.map(f => (parsearRango(f.hora) || {}).dur || null);
  });

  console.log('Mover el primer espacio media hora antes:');
  const duracionesAntes = await duraciones();
  await p.evaluate(() => {
    const campo = document.querySelector('[data-f="0.0.hora"]');
    campo.textContent = '8:30 – 8:35';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(600);
  await p.click('td.hora button.ajustar');   /* el de la primera fila */
  await p.waitForTimeout(400);
  ok('el segundo espacio arranca donde termina el primero', (await hora(1)).startsWith('8:35'));
  const duracionesDespues = await duraciones();
  ok('todas las duraciones se conservan', JSON.stringify(duracionesAntes.slice(1)) === JSON.stringify(duracionesDespues.slice(1)),
     JSON.stringify(duracionesAntes) + ' vs ' + JSON.stringify(duracionesDespues));
  ok('la cadena queda continua', await p.evaluate(() => {
    const planas = [];
    modelo.secciones.forEach(s => s.filas.forEach(f => planas.push(f)));
    for (let k = 1; k < planas.length; k++) {
      const a = parsearRango(planas[k - 1].hora), b = parsearRango(planas[k].hora);
      if (!a || !b) return false;
      if (b.ini % (12 * 60) !== a.fin % (12 * 60)) return false;
    }
    return true;
  }));

  console.log('Un espacio con hora ilegible se salta sin romper la cadena:');
  await p.evaluate(() => {
    const planas = [];
    modelo.secciones.forEach(s => s.filas.forEach(f => planas.push(f)));
    planas[2].hora = 'a las que se pueda';
    render();
  });
  await p.click('td.hora button.ajustar');
  await p.waitForTimeout(400);
  ok('la fila ilegible queda igual', (await hora(2)) === 'a las que se pueda');
  ok('la siguiente sigue la cadena desde la anterior legible', await p.evaluate(() => {
    const planas = [];
    modelo.secciones.forEach(s => s.filas.forEach(f => planas.push(f)));
    const a = parsearRango(planas[1].hora), b = parsearRango(planas[3].hora);
    return a && b && (b.ini % (12 * 60)) === (a.fin % (12 * 60));
  }));

  console.log('Deshacer devuelve el horario:');
  const antesDeDeshacer = await hora(3);
  await p.keyboard.press('Control+z');
  await p.waitForTimeout(400);
  ok('Ctrl+Z devuelve la última cascada', (await hora(3)) !== antesDeDeshacer, 'fila 3 sigue en ' + antesDeDeshacer);

  console.log('El botón no existe para el lector ni sale en la impresión:');
  const lectora = await navegador.newPage();
  await lectora.goto(BASE + '?ver');
  await lectora.waitForTimeout(700);
  ok('en ?ver no se ve', !(await lectora.isVisible('button.ajustar')));
  await lectora.emulateMedia({ media: 'print' });
  ok('en papel no se ve', !(await lectora.isVisible('button.ajustar')));

  await navegador.close();
  console.log('\n' + pasan + ' pasan, ' + fallan + ' fallan');
  process.exit(fallan ? 1 : 0);
})().catch(e => { console.error('Error de las pruebas:', e); process.exit(1); });
