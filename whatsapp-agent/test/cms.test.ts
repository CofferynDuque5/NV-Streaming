/**
 * Smoke test del CMS (Fase 2a) con Postgres en memoria (pg-mem, adaptador pg
 * real → parámetros y JSONB de verdad). Ejecuta el MISMO SQL que CmsRepository.
 *
 *   npm run test:cms
 */
import { newDb } from 'pg-mem';

let fallos = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fallos++; console.error('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

async function main() {
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  await pool.query(`
    CREATE TABLE cms_documentos (
      coleccion VARCHAR(60) NOT NULL,
      doc_id VARCHAR(120) NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      orden INTEGER NOT NULL DEFAULT 0,
      activo BOOLEAN NOT NULL DEFAULT true,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (coleccion, doc_id)
    );`);

  // Helpers que replican EXACTAMENTE el SQL de CmsRepository.
  const upsert = (coleccion: string, docId: string, data: Record<string, unknown>, orden = 0, activo = true) =>
    pool.query(
      `INSERT INTO cms_documentos (coleccion, doc_id, data, orden, activo)
       VALUES ($1,$2,$3::jsonb,$4,$5)
       ON CONFLICT (coleccion, doc_id)
       DO UPDATE SET data = EXCLUDED.data, orden = EXCLUDED.orden, activo = EXCLUDED.activo
       RETURNING doc_id, data`,
      [coleccion, docId, JSON.stringify(data), orden, activo]);
  const listar = (coleccion: string) =>
    pool.query(`SELECT doc_id, data FROM cms_documentos WHERE coleccion=$1 ORDER BY orden ASC, doc_id ASC`, [coleccion]);
  const obtener = (coleccion: string, id: string) =>
    pool.query(`SELECT doc_id, data FROM cms_documentos WHERE coleccion=$1 AND doc_id=$2 LIMIT 1`, [coleccion, id]);
  const borrar = (coleccion: string, id: string) =>
    pool.query(`DELETE FROM cms_documentos WHERE coleccion=$1 AND doc_id=$2 RETURNING doc_id`, [coleccion, id]);

  // 1) Insertar catálogo con órdenes desordenados
  await upsert('servicios_sistema', 'netflix', { nombre_display: 'Netflix', precio: 9.99, categoria: 'STREAMING' }, 2);
  await upsert('servicios_sistema', 'spotify', { nombre_display: 'Spotify', precio: 5.99, categoria: 'MUSICA' }, 1);
  await upsert('servicios_sistema', 'disney', { nombre_display: 'Disney+', precio: 8.99, categoria: 'STREAMING' }, 3);

  const lista = (await listar('servicios_sistema')).rows;
  ok(lista.length === 3, 'lista devuelve los 3 documentos');
  ok(lista[0].doc_id === 'spotify' && lista[2].doc_id === 'disney', 'ordena por `orden` (spotify=1 … disney=3)');
  ok(lista[0].data.nombre_display === 'Spotify' && Number(lista[0].data.precio) === 5.99, 'JSONB round-trip: campos intactos (precio decimal correcto)');

  // 2) Upsert del mismo id = actualiza (no duplica)
  await upsert('servicios_sistema', 'netflix', { nombre_display: 'Netflix Premium', precio: 12.99 }, 2);
  const again = (await listar('servicios_sistema')).rows;
  ok(again.length === 3, 'upsert del mismo id NO duplica');
  const nf = (await obtener('servicios_sistema', 'netflix')).rows[0];
  ok(nf.data.nombre_display === 'Netflix Premium' && Number(nf.data.precio) === 12.99, 'upsert actualiza los campos');

  // 3) Aislamiento entre colecciones
  await upsert('metodos_pago_config', 'zelle', { tipo_banco: 'Zelle', titular: 'NV' }, 1);
  ok((await listar('metodos_pago_config')).rows.length === 1, 'colecciones aisladas (metodos_pago_config solo tiene 1)');
  ok((await listar('servicios_sistema')).rows.length === 3, 'servicios_sistema sigue con 3');

  // 4) Borrado
  ok((await borrar('servicios_sistema', 'disney')).rows.length === 1, 'borrar devuelve la fila borrada');
  ok((await listar('servicios_sistema')).rows.length === 2, 'tras borrar quedan 2');
  ok((await borrar('servicios_sistema', 'inexistente')).rows.length === 0, 'borrar inexistente no afecta');

  console.log(fallos === 0 ? '\n✅ CMS smoke test: TODO OK' : `\n❌ CMS smoke test: ${fallos} fallo(s)`);
  process.exit(fallos === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
