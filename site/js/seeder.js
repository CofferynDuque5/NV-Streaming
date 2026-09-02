/**
 * seeder.js — DESACTIVADO por seguridad de datos (QA de integración).
 *
 * Antes empujaba el dataset de demostración (`seed.js`) a la base de datos real:
 * usuarios, pedidos, credenciales y datos de contacto FICTICIOS. Eso contamina
 * producción con datos falsos y NO debe ocurrir jamás.
 *
 * La hidratación con datos REALES se hace ahora SOLO desde el backend, con datos
 * versionados y auditables:
 *     cd whatsapp-agent
 *     npm run migrate        # esquema
 *     npm run seed           # catálogo real (planes) + CMS + admin (por ENV)
 *
 * Se conservan las firmas para no romper llamadas existentes, pero rechazan.
 */

const MENSAJE =
  "Sembrado desde el frontend deshabilitado. Usa el seeder del backend " +
  "(cd whatsapp-agent && npm run seed) para hidratar con datos reales.";

export async function sembrarTodo() {
  console.warn("[seeder] " + MENSAJE);
  throw new Error(MENSAJE);
}

export async function sembrarColeccion() {
  console.warn("[seeder] " + MENSAJE);
  throw new Error(MENSAJE);
}

if (typeof window !== "undefined") {
  window.NVSeeder = { sembrarTodo, sembrarColeccion, deshabilitado: true };
}

export default { sembrarTodo, sembrarColeccion };
