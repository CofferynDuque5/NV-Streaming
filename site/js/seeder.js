/**
 * seeder.js — Completa la base de datos de PostgreSQL con las colecciones que
 * faltaban del blueprint. Idempotente: usa setDoc con id fijo, de modo que
 * re-ejecutarlo no duplica documentos.
 *
 * Se dispara desde el Back Office (botón "Completar base de datos") o desde la
 * consola: `import('./js/seeder.js').then(m => m.sembrarTodo())`.
 */

import NVCore from "./core.js";
import SEED from "./seed.js";

const { DB } = NVCore;

// Separa `_id` (id de documento) del resto de campos.
function partir(docObj) {
  const { _id, id, ...campos } = docObj;
  return { id: _id || id, campos };
}

export async function sembrarColeccion(coll, docs, onProgress) {
  let n = 0;
  for (const d of docs) {
    const { id, campos } = partir(d);
    try {
      if (id) await DB.setOne(coll, id, campos, true);
      else await DB.add(coll, campos);
      n++;
      if (onProgress) onProgress(coll, n, docs.length);
    } catch (e) {
      console.warn("[seeder]", coll, id, e && e.message);
    }
  }
  return n;
}

export async function sembrarTodo(onProgress) {
  if (!DB.online) throw new Error("Firebase no disponible: no se puede sembrar en modo offline.");
  const resultado = {};

  // configuracion_sistema: 3 documentos de id fijo.
  const cfg = SEED.configuracion_sistema;
  await DB.setOne("configuracion_sistema", "parametros", cfg.parametros, true);
  await DB.setOne("configuracion_sistema", "tema_interfaz", cfg.tema_interfaz, true);
  await DB.setOne("configuracion_sistema", "plantillas_mensajes", cfg.plantillas_mensajes, true);
  resultado.configuracion_sistema = 3;
  if (onProgress) onProgress("configuracion_sistema", 3, 3);

  // Resto de colecciones (arrays).
  for (const [coll, docs] of Object.entries(SEED)) {
    if (coll === "configuracion_sistema") continue;
    resultado[coll] = await sembrarColeccion(coll, docs, onProgress);
  }
  return resultado;
}

if (typeof window !== "undefined") {
  window.NVSeeder = { sembrarTodo, sembrarColeccion };
}

export default { sembrarTodo, sembrarColeccion };
