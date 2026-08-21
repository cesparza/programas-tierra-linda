// Prueba del modelo: viaje redondo de la serializacion y tolerancia a estados dañados.
// Protege los enlaces que ya circulan por WhatsApp: si esto se rompe, un enlace enviado
// hace meses deja de abrir bien. Cada cambio de esquema debe agregar su caso aqui.
//
//   node tests/modelo.js
const { chromium } = require('playwright');
const path = require('path');

const ROTOS = [
  ['sin secciones', { titulo: 'X' }],
  ['secciones sin filas', { secciones: [{ nombre: 'X' }] }],
  ['secciones no es arreglo', { secciones: 'nada' }],
  ['meta en nulo', { meta: null }],
  ['fila incompleta', { secciones: [{ nombre: 'P', filas: [{ tit: 'Solo titulo' }] }] }],
  ['etiquetas basura', { meta: [1, 'dos', ['tres', 'cuatro']] }],
];

(async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  const errores = [];
  pagina.on('pageerror', e => errores.push(e.message));
  await pagina.goto('file://' + path.resolve(__dirname, '../index.html'));
  let fallos = 0;

  // 1. viaje redondo: modelo -> base64 -> modelo debe dar lo mismo
  const redondo = await pagina.evaluate(() => {
    leerDOM();
    const antes = JSON.stringify(normalizar(modelo));
    const texto = btoa(unescape(encodeURIComponent(antes)));
    const despues = JSON.stringify(normalizar(JSON.parse(decodeURIComponent(escape(atob(texto))))));
    return antes === despues;
  });
  console.log((redondo ? '  ok  ' : ' FALLA') + '  viaje redondo del modelo');
  if (!redondo) fallos++;

  // 2. el esquema queda marcado con version
  const version = await pagina.evaluate(() => normalizar({}).v);
  console.log((version === 1 ? '  ok  ' : ' FALLA') + '  version de esquema = ' + version);
  if (version !== 1) fallos++;

  // 3. ningun estado dañado debe dejar la pagina sin filas ni con la palabra undefined
  for (const [nombre, roto] of ROTOS) {
    const r = await pagina.evaluate(estado => {
      modelo = normalizar(estado);
      render();
      const texto = document.querySelector('table').textContent;
      return { filas: document.querySelectorAll('tbody tr').length, undef: texto.includes('undefined') };
    }, roto);
    const bien = r.filas > 0 && !r.undef;
    if (!bien) fallos++;
    console.log((bien ? '  ok  ' : ' FALLA') + '  ' + nombre.padEnd(24) + ' -> filas: ' + r.filas + (r.undef ? ' CON undefined' : ''));
  }

  // 4. el texto del usuario no se pierde ni ejecuta codigo
  const seguro = await pagina.evaluate(() => {
    modelo = normalizar({ secciones: [{ nombre: 'S', filas: [{ hora: '9:00 – 9:30', tit: 'Tema <por confirmar> & Fe', nom: 'A' }] }],
                          recos: '<b>1.</b> ok <img src=x onerror="window.__x=true">' });
    render();
    return { texto: document.querySelector('.espacio .tit').textContent,
             negrita: !!document.querySelector('[data-k="recos"] b'),
             imagen: !!document.querySelector('[data-k="recos"] img'),
             ejecuto: !!window.__x };
  });
  const bienSeguro = seguro.texto === 'Tema <por confirmar> & Fe' && seguro.negrita && !seguro.imagen && !seguro.ejecuto;
  if (!bienSeguro) fallos++;
  console.log((bienSeguro ? '  ok  ' : ' FALLA') + '  texto conservado y html filtrado -> ' + JSON.stringify(seguro));

  if (errores.length) { console.log('errores de javascript:', errores); fallos++; }
  await navegador.close();
  console.log(fallos ? `\n${fallos} fallo(s)` : '\ntodo bien');
  process.exit(fallos ? 1 : 0);
})();
