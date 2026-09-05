/* API de publicación directa de programas.
   Una sola función atiende /api/*. Guarda en D1 (binding DB). Sin sesiones ni cookies:
   los autores publican con su token personal; la administración de autores usa la
   clave del mantenedor (variable CLAVE_MANTENEDOR del proyecto Pages).
   Lo aprendido en la app de jóvenes se aplica desde el día uno: placeholders en todo
   SQL, verificación de Origin en escrituras y límite de intentos por IP. */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

/* ---- arranque de la base ----
   Las tablas se crean solas la primera vez que el API corre en producción, así el
   despliegue no depende de aplicar migraciones a mano (migrations/0001_inicial.sql
   queda como documentación del esquema). El hash inicial de la clave del mantenedor
   solo se siembra si la fila no existe: cambiar la clave después (UPDATE en config)
   es definitivo, el código nunca la revierte. Publicar el hash es seguro: la clave
   es aleatoria de 144 bits y no hay diccionario que la alcance. */
const HASH_MANTENEDOR_INICIAL = '2de6a4a9b208b44a945ed1e9e2bdcc4a8a0dbe0fef0d17a18c1b6aa29d5e578f';
let baseLista = false;
async function prepararBase(db) {
  if (baseLista) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS programa (
      fecha TEXT PRIMARY KEY, titulo TEXT NOT NULL DEFAULT '', json TEXT NOT NULL,
      espacios INTEGER NOT NULL DEFAULT 0, publicado_por TEXT NOT NULL DEFAULT '',
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS autor (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE, activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare('CREATE TABLE IF NOT EXISTS intento (ip TEXT NOT NULL, momento INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_intento ON intento (ip, momento)'),
    db.prepare('CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)'),
    db.prepare("INSERT OR IGNORE INTO config (clave, valor) VALUES ('clave_mantenedor_hash', ?1)").bind(HASH_MANTENEDOR_INICIAL),
    /* Una fecha puede tener más de un programa: el culto del sábado en la mañana y la
       Sociedad de Jóvenes de esa tarde son dos cosas distintas. Por eso la llave es
       fecha + tipo, no la fecha sola. `programa` (una fila por fecha) se queda como
       estaba y sus filas se copian aquí una sola vez: es el respaldo de la migración. */
    db.prepare(`CREATE TABLE IF NOT EXISTS publicacion (
      clave TEXT PRIMARY KEY, fecha TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT '',
      titulo TEXT NOT NULL DEFAULT '', json TEXT NOT NULL,
      espacios INTEGER NOT NULL DEFAULT 0, publicado_por TEXT NOT NULL DEFAULT '',
      actualizado_en TEXT NOT NULL DEFAULT (datetime('now')))`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_publicacion_fecha ON publicacion (fecha)'),
    db.prepare(`INSERT OR IGNORE INTO publicacion (clave, fecha, tipo, titulo, json, espacios, publicado_por, actualizado_en)
      SELECT fecha, fecha, '', titulo, json, espacios, publicado_por, actualizado_en FROM programa`)
  ]);
  baseLista = true;
}
const TOPE_BODY = 200 * 1024;        // un programa sin logos pesa ~6 KB; 200 KB es holgura
const FALLOS_MAX = 10;               // intentos fallidos por IP...
const FALLOS_VENTANA = 15 * 60e3;    // ...en 15 minutos

const responder = (datos, status = 200) => new Response(JSON.stringify(datos), { status, headers: JSON_HEADERS });
const error = (mensaje, status) => responder({ error: mensaje }, status);

/* "Sábado 19 de septiembre de 2026" -> "2026-09-19". Misma lógica del index.html:
   la clave del programa se deriva en el servidor, nunca se confía en la del cliente. */
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function claveDeFecha(fecha) {
  const t = String(fecha || '').toLowerCase();
  const dia = (t.match(/\b(\d{1,2})\b/) || [])[1];
  const anio = (t.match(/\b(20\d{2})\b/) || [])[1];
  const mes = MESES.findIndex(m => t.includes(m)) + 1;
  if (!dia || !anio || !mes) return null;
  return anio + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
}

/* El tipo es texto libre del autor ("Sociedad de Jóvenes", "Culto del miércoles").
   Vacío = el programa principal de esa fecha, el que abre por defecto.
   Del tipo sale un sufijo legible para la llave y para la dirección de lectura. */
const TIPO_MAX = 40;
function limpiarTipo(tipo) {
  return String(tipo || '').replace(/\s+/g, ' ').trim().slice(0, TIPO_MAX);
}
function sufijoDeTipo(tipo) {
  const base = limpiarTipo(tipo).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   /* fuera las tildes */
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base;
}
function claveDe(fecha, tipo) {
  const sufijo = sufijoDeTipo(tipo);
  return sufijo ? fecha + '-' + sufijo : fecha;
}

async function sha256hex(texto) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/* La clave del mantenedor vive como hash en la tabla config (fila
   'clave_mantenedor_hash'); si no está sembrada, cae a la variable de entorno
   CLAVE_MANTENEDOR (útil en desarrollo local). Solo se comparan hashes. */
async function esClaveMantenedor(db, env, clave) {
  if (typeof clave !== 'string' || !clave) return false;
  const hash = await sha256hex(clave);
  const fila = await db.prepare("SELECT valor FROM config WHERE clave = 'clave_mantenedor_hash'").first().catch(() => null);
  if (fila && fila.valor) return hash === fila.valor;
  if (!env.CLAVE_MANTENEDOR) return false;
  return hash === (await sha256hex(env.CLAVE_MANTENEDOR));
}

function ipDe(request) {
  return request.headers.get('cf-connecting-ip') || 'local';
}

/* El Origin solo se exige cuando el navegador lo manda: curl y las pruebas no lo mandan,
   pero un formulario ajeno en otro dominio sí, y ahí se corta. */
function origenValido(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).host === new URL(request.url).host; } catch (e) { return false; }
}

async function fallosRecientes(db, ip) {
  const desde = Date.now() - FALLOS_VENTANA;
  const fila = await db.prepare('SELECT COUNT(*) AS n FROM intento WHERE ip = ?1 AND momento > ?2').bind(ip, desde).first();
  return fila ? fila.n : 0;
}
async function anotarFallo(db, ip) {
  await db.prepare('INSERT INTO intento (ip, momento) VALUES (?1, ?2)').bind(ip, Date.now()).run();
  /* limpieza oportunista de intentos viejos, para que la tabla no crezca sin fin */
  if (Math.random() < 0.05) {
    await db.prepare('DELETE FROM intento WHERE momento < ?1').bind(Date.now() - 24 * 60 * 60e3).run();
  }
}

/* Devuelve el autor activo del token, o null (y anota el fallo). */
async function autorDelToken(db, ip, token) {
  if (typeof token !== 'string' || token.length < 8) { await anotarFallo(db, ip); return null; }
  const hash = await sha256hex(token);
  const autor = await db.prepare('SELECT id, nombre FROM autor WHERE token_hash = ?1 AND activo = 1').bind(hash).first();
  if (!autor) await anotarFallo(db, ip);
  return autor;
}

async function leerBody(request) {
  const texto = await request.text();
  if (texto.length > TOPE_BODY) return { error: 'El programa es demasiado grande.' };
  try { return { datos: JSON.parse(texto) }; } catch (e) { return { error: 'El cuerpo no es JSON válido.' }; }
}

/* Deja el programa listo para guardar: objeto plano, sin logos (pesan y ya viven
   como archivos del sitio), con fecha derivable. El saneado fino del contenido lo
   hace la página al pintar (esc + DOMParser); aquí solo se acota forma y tamaño. */
function prepararPrograma(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { error: 'El programa no tiene forma de programa.' };
  const copia = Object.assign({}, p);
  delete copia.logos;
  const fecha = claveDeFecha(copia.fecha);
  if (!fecha) return { error: 'La fecha del programa no se entiende. Debe decir día, mes y año, por ejemplo "Sábado 19 de septiembre de 2026".' };
  if (!Array.isArray(copia.secciones) || !copia.secciones.length) return { error: 'El programa no tiene secciones.' };
  const espacios = copia.secciones.reduce((n, s) => n + ((s && Array.isArray(s.filas)) ? s.filas.length : 0), 0);
  const tipo = limpiarTipo(copia.tipo);
  copia.tipo = tipo;
  return { fecha, tipo, clave: claveDe(fecha, tipo), espacios, titulo: String(copia.titulo || ''), json: JSON.stringify(copia) };
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;
  if (!db) return error('La base de datos no está configurada.', 503);
  try { await prepararBase(db); } catch (e) { return error('La base no se pudo preparar: ' + e.message, 500); }
  const url = new URL(request.url);
  const ruta = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const metodo = request.method;

  try {
    /* ---- lecturas públicas ---- */
    if (metodo === 'GET' && ruta === 'vigente') {
      /* El vigente es el del sábado que viene, no el último publicado: la fecha más
         próxima que aún no pasa (día de Colombia, UTC-5). Así se pueden dejar
         publicados varios sábados futuros y cada uno se estrena solo, a medianoche
         del anterior. Si no hay ninguno por venir, se muestra el más reciente.
         Cuando una fecha tiene varios programas (el culto y la Sociedad de Jóvenes,
         por ejemplo), abre el principal: el que se publicó sin tipo. */
      const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
      const campos = 'clave, fecha, tipo, titulo, espacios, actualizado_en, json';
      let fila = await db.prepare(`SELECT ${campos} FROM publicacion WHERE fecha >= ?1
        ORDER BY fecha ASC, (tipo <> '') ASC, actualizado_en ASC LIMIT 1`).bind(hoy).first();
      if (!fila) fila = await db.prepare(`SELECT ${campos} FROM publicacion
        ORDER BY fecha DESC, (tipo <> '') ASC, actualizado_en ASC LIMIT 1`).first();
      if (!fila) return error('Todavía no hay programas publicados.', 404);
      return responder({ clave: fila.clave, fecha: fila.fecha, tipo: fila.tipo, titulo: fila.titulo,
        espacios: fila.espacios, actualizado_en: fila.actualizado_en, programa: JSON.parse(fila.json) });
    }
    if (metodo === 'GET' && ruta === 'programas') {
      const filas = await db.prepare(`SELECT clave, fecha, tipo, titulo, espacios, actualizado_en
        FROM publicacion ORDER BY fecha DESC, (tipo <> '') ASC, actualizado_en ASC LIMIT 200`).all();
      return responder(filas.results || []);
    }
    if (metodo === 'GET' && /^programa\/\d{4}-\d{2}-\d{2}(-[a-z0-9-]{1,60})?$/.test(ruta)) {
      const clave = ruta.split('/')[1];
      const fila = await db.prepare('SELECT json FROM publicacion WHERE clave = ?1').bind(clave).first();
      if (!fila) return error('No hay programa con esa fecha.', 404);
      return responder(JSON.parse(fila.json));
    }

    /* ---- de aquí para abajo todo escribe: Origin y límite de intentos ---- */
    if (metodo !== 'POST' && metodo !== 'GET') return error('Método no permitido.', 405);
    if (metodo === 'POST' && !origenValido(request)) return error('Origen no permitido.', 403);
    const ip = ipDe(request);
    if (metodo === 'POST' && (await fallosRecientes(db, ip)) >= FALLOS_MAX) {
      return error('Demasiados intentos. Espera 15 minutos.', 429);
    }

    if (metodo === 'POST' && ruta === 'publicar') {
      const body = await leerBody(request);
      if (body.error) return error(body.error, 400);
      const autor = await autorDelToken(db, ip, body.datos.token);
      if (!autor) return error('El enlace de autor no es válido o fue desactivado. Pídele uno nuevo a Camilo.', 401);
      const prep = prepararPrograma(body.datos.programa);
      if (prep.error) return error(prep.error, 400);
      await db.prepare(`INSERT INTO publicacion (clave, fecha, tipo, titulo, json, espacios, publicado_por, actualizado_en)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
        ON CONFLICT(clave) DO UPDATE SET fecha = ?2, tipo = ?3, titulo = ?4, json = ?5,
          espacios = ?6, publicado_por = ?7, actualizado_en = datetime('now')`)
        .bind(prep.clave, prep.fecha, prep.tipo, prep.titulo, prep.json, prep.espacios, autor.nombre).run();
      return responder({ ok: true, clave: prep.clave, fecha: prep.fecha, tipo: prep.tipo, publicado_por: autor.nombre });
    }

    /* ---- administración de autores: solo con la clave del mantenedor ---- */
    if (ruta === 'autores' || ruta === 'autores/estado') {
      const clave = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!(await esClaveMantenedor(db, env, clave))) {
        if (metodo === 'POST') await anotarFallo(db, ip);
        return error('Clave de mantenedor incorrecta.', 401);
      }
      if (metodo === 'GET' && ruta === 'autores') {
        const filas = await db.prepare('SELECT id, nombre, activo, creado_en FROM autor ORDER BY id').all();
        return responder(filas.results || []);
      }
      if (metodo === 'POST' && ruta === 'autores') {
        const body = await leerBody(request);
        if (body.error) return error(body.error, 400);
        const nombre = String(body.datos.nombre || '').trim().slice(0, 80);
        if (!nombre) return error('Falta el nombre del autor.', 400);
        /* token aleatorio, se muestra una sola vez; solo el hash toca la base */
        const bytes = new Uint8Array(18);
        crypto.getRandomValues(bytes);
        const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        await db.prepare('INSERT INTO autor (nombre, token_hash) VALUES (?1, ?2)').bind(nombre, await sha256hex(token)).run();
        return responder({ ok: true, nombre, token });
      }
      if (metodo === 'POST' && ruta === 'autores/estado') {
        const body = await leerBody(request);
        if (body.error) return error(body.error, 400);
        const id = Number(body.datos.id), activo = body.datos.activo ? 1 : 0;
        if (!Number.isInteger(id)) return error('Falta el id del autor.', 400);
        await db.prepare('UPDATE autor SET activo = ?1 WHERE id = ?2').bind(activo, id).run();
        return responder({ ok: true });
      }
    }

    return error('No existe esa ruta.', 404);
  } catch (e) {
    return error('Error interno: ' + (e && e.message ? e.message : 'desconocido'), 500);
  }
}
