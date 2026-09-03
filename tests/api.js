/* Pruebas del API de publicación. Requiere el servidor local corriendo:
     npx wrangler d1 execute programas-tl --local --file migrations/0001_inicial.sql
     npx wrangler pages dev . --port 8788 --binding CLAVE_MANTENEDOR=clave-prueba-123
   Ejecutar con: node tests/api.js
   OJO: usa la base local; los fallos de autenticación cuentan para el límite por IP,
   así que las pruebas de rechazo van al final. */

const BASE = 'http://127.0.0.1:8788/api/';
const CLAVE = process.env.CLAVE_MANTENEDOR || 'clave-prueba-123';
const fs = require('fs');
const path = require('path');

let pasan = 0, fallan = 0;
function ok(nombre, condicion, detalle) {
  if (condicion) { pasan++; console.log('  ✓ ' + nombre); }
  else { fallan++; console.log('  ✗ ' + nombre + (detalle ? ' — ' + detalle : '')); }
}
async function llamar(ruta, opciones) {
  const r = await fetch(BASE + ruta, opciones);
  let json = null;
  try { json = await r.json(); } catch (e) {}
  return { status: r.status, json };
}
const post = (ruta, cuerpo, headers) => llamar(ruta, {
  method: 'POST',
  headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
  body: JSON.stringify(cuerpo)
});

(async () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'programas', '2026-08-22.json'), 'utf8'));

  console.log('Autores (mantenedor):');
  let r = await post('autores', { nombre: 'Prueba' }, { authorization: 'Bearer clave-mala' });
  ok('clave mala → 401', r.status === 401);
  r = await post('autores', { nombre: 'Autor de prueba' }, { authorization: 'Bearer ' + CLAVE });
  ok('crear autor devuelve token', r.status === 200 && r.json.token && r.json.token.length >= 20, JSON.stringify(r.json));
  const token = r.json.token;
  r = await llamar('autores', { headers: { authorization: 'Bearer ' + CLAVE } });
  ok('lista de autores sin tokens', r.status === 200 && r.json.length >= 1 && !('token' in r.json[0]) && !('token_hash' in r.json[0]));

  console.log('Publicar:');
  const conLogos = Object.assign({}, fixture, { logos: { tl: 'data:image/png;base64,AAAA' } });
  r = await post('publicar', { token, programa: conLogos });
  ok('publica el programa de prueba', r.status === 200 && r.json.fecha === '2026-08-22', JSON.stringify(r.json));
  r = await llamar('vigente');
  ok('vigente es el publicado', r.status === 200 && r.json.fecha === '2026-08-22' && r.json.programa.titulo === fixture.titulo);
  ok('los logos no se guardan', !('logos' in r.json.programa));
  ok('viaje redondo de secciones', JSON.stringify(r.json.programa.secciones) === JSON.stringify(fixture.secciones));
  r = await llamar('programa/2026-08-22');
  ok('lectura por fecha', r.status === 200 && r.json.titulo === fixture.titulo);
  r = await post('publicar', { token, programa: fixture });
  ok('republicar la misma fecha no duplica', r.status === 200);
  r = await llamar('programas');
  ok('la lista tiene una sola entrada', r.status === 200 && r.json.length === 1 && r.json[0].publicado_por === undefined);

  console.log('Rechazos:');
  r = await post('publicar', { token, programa: Object.assign({}, fixture, { fecha: 'un día cualquiera' }) });
  ok('fecha ilegible → 400', r.status === 400);
  r = await post('publicar', { token, programa: { fecha: fixture.fecha, secciones: [] } });
  ok('sin secciones → 400', r.status === 400);
  r = await post('publicar', { token, programa: fixture }, { origin: 'https://malo.example.com' });
  ok('Origin ajeno → 403', r.status === 403);
  r = await llamar('cualquier-cosa');
  ok('ruta inexistente → 404', r.status === 404);

  console.log('Revocación:');
  const lista = (await llamar('autores', { headers: { authorization: 'Bearer ' + CLAVE } })).json;
  const id = lista[lista.length - 1].id;
  r = await post('autores/estado', { id, activo: false }, { authorization: 'Bearer ' + CLAVE });
  ok('desactivar autor', r.status === 200);
  r = await post('publicar', { token, programa: fixture });
  ok('token desactivado → 401', r.status === 401);
  r = await post('autores/estado', { id, activo: true }, { authorization: 'Bearer ' + CLAVE });
  ok('reactivar autor', r.status === 200);

  console.log('Límite de intentos (va de último, ensucia el contador):');
  let ultimo = 0;
  for (let i = 0; i < 12; i++) {
    ultimo = (await post('publicar', { token: 'token-invalido-' + i, programa: fixture })).status;
  }
  ok('tras 10 fallos responde 429', ultimo === 429, 'último status: ' + ultimo);

  console.log('\n' + pasan + ' pasan, ' + fallan + ' fallan');
  process.exit(fallan ? 1 : 0);
})().catch(e => { console.error('Error de las pruebas:', e); process.exit(1); });
