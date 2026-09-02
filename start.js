#!/usr/bin/env node
/**
 * start.js — Equivalente multiplataforma de setup.sh (Windows/macOS/Linux).
 *
 * Prepara y arranca el backend de NV Streaming con un solo comando:
 *   node start.js               # build + migrate + arranca en producción
 *   node start.js --seed        # además siembra catálogo + admin
 *   node start.js --build-only   # solo prepara/compila (CI / Docker)
 *   node start.js --dev          # desarrollo (tsx watch)
 *
 * No requiere bash. Útil en Windows o en hosts que ejecutan `node start.js`.
 */
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const AGENT = path.join(__dirname, 'whatsapp-agent');
const args = new Set(process.argv.slice(2));
const MODE = args.has('--dev') ? 'dev' : args.has('--build-only') ? 'build' : 'prod';
const DO_SEED = args.has('--seed');
const DO_INSTALL = !args.has('--no-install');

const C = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
const say = (s) => console.log(`\n${C('1;36', '»')} ${C('1;37', s)}`);
const ok = (s) => console.log(`  ${C('1;32', '✓')} ${s}`);
const warn = (s) => console.log(`  ${C('1;33', '!')} ${s}`);
function die(s) { console.error(`\n${C('1;31', '✗')} ${s}`); process.exit(1); }

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: AGENT, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) die(`Falló: ${cmd} ${cmdArgs.join(' ')}`);
}

// 0) Requisitos
say('Verificando requisitos…');
if (Number(process.versions.node.split('.')[0]) < 20) die(`Se requiere Node 20+. Tienes ${process.version}.`);
if (!fs.existsSync(AGENT)) die('No encuentro whatsapp-agent/ junto a start.js.');
ok(`Node ${process.version}`);

// 1) .env + secretos
say('Configurando variables de entorno (.env)…');
const envPath = path.join(AGENT, '.env');
const examplePath = path.join(AGENT, '.env.example');
if (!fs.existsSync(envPath)) {
  if (!fs.existsSync(examplePath)) die('Falta whatsapp-agent/.env.example.');
  fs.copyFileSync(examplePath, envPath);
  ok('Creado whatsapp-agent/.env desde .env.example');
} else ok('.env ya existe (no se sobrescribe)');

function ensureSecret(key, bytes) {
  let t = fs.readFileSync(envPath, 'utf8');
  const m = t.match(new RegExp(`^${key}=(.*)$`, 'm'));
  const val = m ? m[1] : '';
  if (!val || /cambia|change|xxxx|tu-|your-/i.test(val)) {
    const secret = crypto.randomBytes(bytes).toString('base64');
    t = m ? t.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${secret}`) : `${t}\n${key}=${secret}`;
    fs.writeFileSync(envPath, t);
    ok(`Generado ${key} (secreto aleatorio)`);
  }
}
ensureSecret('JWT_SECRET', 48);
ensureSecret('CREDENTIALS_ENC_KEY', 32);

const dbUrl = process.env.DATABASE_URL || (fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL=(.*)$/m) || [])[1] || '';
if (!dbUrl || /usuario:password|cambia/i.test(dbUrl)) {
  warn('DATABASE_URL no parece configurada. Edita whatsapp-agent/.env o expórtala.');
  if (MODE !== 'build') die('Sin DATABASE_URL válida no puedo migrar ni arrancar.');
} else ok('DATABASE_URL detectada');

// 2) Dependencias
if (DO_INSTALL) {
  say('Instalando dependencias (npm ci)…');
  run('npm', [fs.existsSync(path.join(AGENT, 'package-lock.json')) ? 'ci' : 'install', '--no-audit', '--no-fund']);
  ok('Dependencias instaladas');
}

// dev
if (MODE === 'dev') { say('Arrancando en DESARROLLO (tsx watch)…'); run('npm', ['run', 'dev']); process.exit(0); }

// 3) build
say('Compilando (build)…');
run('npm', ['run', 'build']);
ok('Compilado a dist/');

// build-only: no se toca la BD (CI / construcción de imagen sin BD)
if (MODE === 'build') { say('Preparación completada (--build-only). Migra y arranca con: npm run migrate:prod && npm start'); process.exit(0); }

// 4) migrate (+ seed)
say('Aplicando migraciones…');
run('npm', ['run', 'migrate']);
ok('Esquema aplicado');
if (DO_SEED) { say('Sembrando catálogo + admin…'); run('npm', ['run', 'seed']); ok('Datos iniciales listos'); }

// 5) arranque
say('Arrancando el servidor en PRODUCCIÓN…');
run('node', ['dist/index.js'], { env: { ...process.env, NODE_ENV: 'production' } });
