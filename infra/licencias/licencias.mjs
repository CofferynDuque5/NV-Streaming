#!/usr/bin/env node
/**
 * Licencias de instalación del Gestor (G8). Se usa en TU computadora, nunca en el
 * servidor de un negocio: la clave privada no sale de aquí. Solo necesita Node 22.
 *
 *   node infra/licencias/licencias.mjs claves --salida ~/nv-licencias
 *       Crea el par de claves. Guarda la privada (no la compartas, no la subas a git)
 *       e imprime la pública para LICENCIA_CLAVE_PUBLICA de cada instalación.
 *
 *   node infra/licencias/licencias.mjs emitir --clave ~/nv-licencias/privada.pem \
 *       --negocio "Streaming Pérez" --origen https://panel.perez.com \
 *       --plan Mensual --hasta 2026-12-31 [--prueba] [--id lic-perez]
 *       Imprime la licencia (NVL1.…) para pegarla en Licencia del panel del negocio.
 *       Para renovar, emite otra con la nueva fecha y el mismo --id.
 *
 *   node infra/licencias/licencias.mjs ver NVL1.…
 *       Muestra lo que dice una licencia (sin comprobar la firma).
 */
import { createPrivateKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function salir(mensaje) {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}

function fechaValida(d) {
  if (!FECHA.test(d)) return false;
  const f = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(f.getTime()) && f.toISOString().startsWith(d);
}

function hoy() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
}

const [orden, ...resto] = process.argv.slice(2);

if (orden === 'claves') {
  const { values } = parseArgs({ args: resto, options: { salida: { type: 'string' } } });
  if (!values.salida) salir('Indica la carpeta con --salida.');
  const privada = join(values.salida, 'privada.pem');
  if (existsSync(privada)) salir(`Ya existe ${privada}: no la sobrescribo.`);
  mkdirSync(values.salida, { recursive: true, mode: 0o700 });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(privada, privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  const publica = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  writeFileSync(join(values.salida, 'publica.txt'), `${publica}\n`);
  console.log(`✓ Clave privada en ${privada} (guárdala con copia de seguridad; no la compartas).`);
  console.log('\nPon esta línea en el .env.produccion de cada negocio:\n');
  console.log(`LICENCIA_CLAVE_PUBLICA=${publica}`);
} else if (orden === 'emitir') {
  const { values } = parseArgs({
    args: resto,
    options: {
      clave: { type: 'string' },
      negocio: { type: 'string' },
      origen: { type: 'string' },
      plan: { type: 'string' },
      hasta: { type: 'string' },
      prueba: { type: 'boolean', default: false },
      id: { type: 'string' },
    },
  });
  if (!values.clave) salir('Indica la clave privada con --clave.');
  const negocio = values.negocio?.trim() ?? '';
  if (negocio.length < 2 || negocio.length > 120) salir('Indica el negocio con --negocio.');
  if (!values.origen || !URL.canParse(values.origen)) {
    salir('Indica la dirección del panel del negocio con --origen (https://…).');
  }
  const origen = new URL(values.origen).origin;
  const plan = values.plan?.trim() ?? '';
  if (!plan || plan.length > 60) salir('Indica el plan con --plan (p. ej. Mensual).');
  if (!values.hasta || !fechaValida(values.hasta)) salir('Indica --hasta AAAA-MM-DD.');
  const id = values.id?.trim() || `lic-${randomUUID().slice(0, 8)}`;
  if (id.length < 6 || id.length > 64) salir('El --id debe tener entre 6 y 64 caracteres.');
  const datos = {
    v: 1,
    id,
    negocio,
    origen,
    plan,
    prueba: values.prueba,
    emitida: hoy(),
    vence: values.hasta,
  };
  const clave = createPrivateKey(readFileSync(values.clave));
  if (clave.asymmetricKeyType !== 'ed25519') salir('La clave no es Ed25519.');
  const firmado = `NVL1.${Buffer.from(JSON.stringify(datos)).toString('base64url')}`;
  const firma = sign(null, Buffer.from(firmado), clave).toString('base64url');
  console.error(
    `✓ ${datos.prueba ? 'Prueba gratis' : `Plan ${plan}`} para ${negocio} (${origen}) hasta el ${datos.vence}. Id: ${id}\n`,
  );
  console.log(`${firmado}.${firma}`);
} else if (orden === 'ver') {
  const partes = (resto[0] ?? '').trim().split('.');
  if (partes.length !== 3 || partes[0] !== 'NVL1') salir('Eso no es una licencia NVL1.');
  console.log(JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8')));
} else {
  console.log(
    'Uso: node infra/licencias/licencias.mjs claves | emitir | ver  (detalles al inicio del archivo)',
  );
  process.exit(orden ? 1 : 0);
}
