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
  ok('cada entrada trae su clave y su tipo', r.json[0].clave === '2026-08-22' && r.json[0].tipo === '');

  console.log('Programas futuros (el vigente es el más próximo que no ha pasado):');
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fechaTexto = d => 'Sábado ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  const iso = d => d.toISOString().slice(0, 10);
  const cercano = new Date(Date.now() + 2 * 86400e3);      /* pasado mañana */
  const lejano = new Date(Date.now() + 60 * 86400e3);      /* en dos meses */
  r = await post('publicar', { token, programa: Object.assign({}, fixture, { fecha: fechaTexto(lejano) }) });
  ok('publica un programa a dos meses', r.status === 200 && r.json.fecha === iso(lejano), JSON.stringify(r.json));
  r = await post('publicar', { token, programa: Object.assign({}, fixture, { fecha: fechaTexto(cercano) }) });
  ok('publica el de esta semana', r.status === 200);
  r = await llamar('vigente');
  ok('el vigente es el próximo, no el más lejano', r.status === 200 && r.json.fecha === iso(cercano), 'vigente: ' + (r.json && r.json.fecha));
  r = await llamar('programas');
  ok('la lista trae los tres', r.status === 200 && r.json.length === 3);

  console.log('Dos programas el mismo día (fecha + tipo):');
  const mismaFecha = Object.assign({}, fixture, { fecha: fechaTexto(cercano) });
  r = await post('publicar', { token, programa: Object.assign({}, mismaFecha, { tipo: 'Sociedad de Jóvenes' }) });
  ok('publica el segundo programa de esa fecha', r.status === 200 && r.json.clave === iso(cercano) + '-sociedad-de-jovenes', JSON.stringify(r.json));
  r = await llamar('programa/' + iso(cercano));
  ok('el principal sigue intacto', r.status === 200 && !r.json.tipo);
  r = await llamar('programa/' + iso(cercano) + '-sociedad-de-jovenes');
  ok('el segundo se lee por su propia dirección', r.status === 200 && r.json.tipo === 'Sociedad de Jóvenes');
  r = await llamar('vigente');
  ok('el vigente sigue siendo el principal', r.status === 200 && r.json.tipo === '' && r.json.fecha === iso(cercano), JSON.stringify(r.json && r.json.tipo));
  r = await llamar('programas');
  ok('la lista trae los cuatro (3 fechas + 1 tipo)', r.status === 200 && r.json.length === 4, 'trae ' + (r.json && r.json.length));
  r = await post('publicar', { token, programa: Object.assign({}, mismaFecha, { tipo: 'Sociedad de Jóvenes', titulo: 'Jóvenes v2' }) });
  ok('republicar el mismo tipo lo reemplaza', r.status === 200);
  r = await llamar('programas');
  ok('y no agrega una fila nueva', r.json.length === 4);
  r = await post('publicar', { token, programa: Object.assign({}, mismaFecha, { tipo: '  Culto  del   miércoles  ' }) });
  ok('el tipo se limpia de espacios y tildes en la llave', r.status === 200 && r.json.clave === iso(cercano) + '-culto-del-miercoles' && r.json.tipo === 'Culto del miércoles', JSON.stringify(r.json));

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
