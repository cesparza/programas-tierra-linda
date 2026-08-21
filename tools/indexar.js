// Regenera programas/index.json a partir de los archivos de la carpeta programas/.
// La aplicacion lee ese indice para saber cual es el programa vigente (el mas reciente)
// y para poder abrir los de sabados anteriores. Cloudflare Pages no lista carpetas, por
// eso el indice es un archivo y no una consulta.
//
// Uso, despues de agregar el JSON de un sabado:
//   node tools/indexar.js
const fs = require('fs');
const path = require('path');

const carpeta = path.resolve(__dirname, '../programas');
const archivos = fs.readdirSync(carpeta)
  .filter(n => n.endsWith('.json') && n !== 'index.json')
  .sort()
  .reverse();   // el mas reciente primero

const entradas = archivos.map(nombre => {
  const datos = JSON.parse(fs.readFileSync(path.join(carpeta, nombre), 'utf8'));
  return {
    archivo: nombre,
    fecha: datos.fecha || nombre.replace('.json', ''),
    titulo: datos.titulo || 'Programa',
    espacios: (datos.secciones || []).reduce((n, s) => n + (s.filas || []).length, 0),
  };
});

fs.writeFileSync(path.join(carpeta, 'index.json'), JSON.stringify(entradas, null, 2) + '\n');
console.log(`index.json actualizado con ${entradas.length} programa(s):`);
entradas.forEach(e => console.log(`  ${e.archivo}  ${e.fecha}  (${e.espacios} espacios)`));
