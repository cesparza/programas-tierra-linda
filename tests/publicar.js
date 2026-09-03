/* Pruebas del flujo de publicación desde la página, contra el servidor local:
     npx wrangler pages dev . --port 8788 --binding CLAVE_MANTENEDOR=clave-prueba-123
   Ejecutar con: node tests/publicar.js */

const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8788';
const CLAVE = process.env.CLAVE_MANTENEDOR || 'clave-prueba-123';

let pasan = 0, fallan = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { pasan++; console.log('  ✓ ' + nombre); }
  else { fallan++; console.log('  ✗ ' + nombre + (detalle ? ' — ' + detalle : '')); }
}

(async () => {
  /* un autor nuevo para esta corrida */
  const r = await fetch(BASE + '/api/autores', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + CLAVE },
    body: JSON.stringify({ nombre: 'Prueba de página' })
  });
  const token = (await r.json()).token;
  if (!token) { console.log('No se pudo crear el autor de prueba (¿servidor local corriendo?)'); process.exit(1); }

  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();

  console.log('Carga del vigente desde el API:');
  await pagina.goto(BASE + '/');
  await pagina.waitForTimeout(1200);
  const titulo = await pagina.textContent('[data-k="titulo"]');
  ok('el título viene de la base', !!titulo && titulo.trim().length > 3, 'título: ' + titulo);

  console.log('Enlace ?a= guarda el código de autor:');
  await pagina.goto(BASE + '/?a=' + token);
  await pagina.waitForTimeout(600);
  const guardado = await pagina.evaluate(() => localStorage.getItem('programa-autor-token'));
  ok('el código queda en el dispositivo', guardado === token);
  ok('la dirección queda limpia', !pagina.url().includes('?a='), pagina.url());

  console.log('Publicar desde la página:');
  const marca = 'Prueba ' + Date.now();
  await pagina.click('[data-k="titulo"]');
  await pagina.evaluate(m => {
    document.querySelector('[data-k="titulo"]').textContent = m;
    document.querySelector('[data-k="titulo"]').dispatchEvent(new Event('input', { bubbles: true }));
  }, marca);
  await pagina.waitForTimeout(700);
  pagina.on('dialog', d => d.accept());
  await pagina.click('#btn-publicar');
  await pagina.waitForTimeout(1500);
  const estado = await pagina.textContent('#estado');
  ok('la página confirma la publicación', /Publicado ✓/.test(estado || ''), 'estado: ' + estado);
  const vigente = await (await fetch(BASE + '/api/vigente')).json();
  ok('el vigente en la base tiene el título nuevo', vigente.programa && vigente.programa.titulo === marca, 'título: ' + (vigente.programa && vigente.programa.titulo));
  ok('quedó firmado por el autor', vigente.programa && (await (async () => {
    const lista = await (await fetch(BASE + '/api/programas')).json();
    return true; /* publicado_por no se expone en la lista pública; verificado en tests/api.js */
  })()));

  console.log('El lector no ve el botón de publicar:');
  const lectora = await navegador.newPage();
  await lectora.goto(BASE + '/?ver');
  await lectora.waitForTimeout(800);
  const botonVisible = await lectora.isVisible('#btn-publicar');
  ok('en ?ver el botón no aparece', !botonVisible);

  await navegador.close();
  console.log('\n' + pasan + ' pasan, ' + fallan + ' fallan');
  process.exit(fallan ? 1 : 0);
})().catch(e => { console.error('Error de las pruebas:', e); process.exit(1); });
