// Prueba del calculo de duracion a partir del rango de horas.
// Es la unica logica con heuristicas del programa (12 horas sin am/pm, cruce del
// mediodia, un solo sufijo que aplica a las dos horas), y una regresion aqui imprime
// una duracion equivocada en el papel sin que nadie lo note.
//
//   npm i -D playwright
//   node tests/horas.js
const { chromium } = require('playwright');
const path = require('path');

const CASOS = [
  ['9:00 – 9:05', '5 min'],
  ['9:30 – 10:30', '60 min'],
  ['11:35 – 12:20', '45 min'],      // cruza el mediodia
  ['12:20 – 12:25', '5 min'],
  ['12:45 – 1:15', '30 min'],       // cruza a la tarde
  ['6:30 – 7:30 pm', '60 min'],     // sufijo solo en el final
  ['6:30 pm – 7:30 pm', '60 min'],
  ['6:30 p.m. - 8:00 p.m.', '90 min'],
  ['3:00 PM – 5:00 PM', '120 min'],
  ['9:00 am – 5:00 pm', '480 min'],
  ['9:00 am – 1:00', '240 min'],
  ['9:00 – 5:00', '480 min'],
  ['5:00 a 6:30', '90 min'],
  ['9:00 AM – 12:25 PM', '205 min'],
  ['texto raro', null],
  ['9:05 – 9:05', null],            // duracion cero
  ['9:75 – 9:90', null],            // minutos que no existen
  ['25:00 – 26:00', null],          // horas que no existen
  ['10:00 pm – 6:00 am', null],     // cruza la medianoche: no aplica a un programa
];

(async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  const errores = [];
  pagina.on('pageerror', e => errores.push(e.message));
  await pagina.goto('file://' + path.resolve(__dirname, '../index.html'));

  let fallos = 0;
  for (const [entrada, esperado] of CASOS) {
    const obtenido = await pagina.evaluate(r => calcularMins(r), entrada);
    const bien = obtenido === esperado;
    if (!bien) fallos++;
    console.log((bien ? '  ok  ' : ' FALLA') + '  ' + entrada.padEnd(24) + ' -> ' + obtenido + (bien ? '' : '  (esperado ' + esperado + ')'));
  }
  if (errores.length) { console.log('errores de javascript:', errores); fallos++; }
  await navegador.close();
  console.log(fallos ? `\n${fallos} fallo(s)` : `\n${CASOS.length} casos, todos bien`);
  process.exit(fallos ? 1 : 0);
})();
