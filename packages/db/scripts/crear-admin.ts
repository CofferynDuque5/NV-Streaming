/**
 * Crea la PRIMERA cuenta de administración en producción (o una nueva invitación
 * si la cuenta existe y todavía no la aceptó). No usa datos de demostración.
 *
 *   tsx scripts/crear-admin.ts --correo tu@correo.com --nombre "Tu nombre"
 *
 * La cuenta nace SIN contraseña: el script imprime un enlace de invitación de un
 * solo uso (vence en 72 horas) en el que la persona elige su propia contraseña. Al
 * entrar por primera vez la web le obliga a configurar la verificación en dos pasos
 * (2FA), como a todo el equipo. Nadie más conoce la contraseña, ni este script.
 *
 * Necesita DATABASE_URL y WEB_ORIGEN (lo lanza infra/crear-admin.sh dentro del
 * contenedor «migrar» con el .env.produccion).
 */
import { createHash, randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { crearClientePrisma } from '../src/index.js';

/** Igual que la API (auth/tokens.service.ts): 72 horas y solo se guarda el hash. */
const INVITACION_MINUTOS = 72 * 60;
const CORREO_VALIDO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

function salir(mensaje: string): never {
  console.error(`✗ ${mensaje}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: { correo: { type: 'string' }, nombre: { type: 'string' } },
});
const correo = values.correo?.trim().toLowerCase() ?? '';
const nombre = values.nombre?.trim() ?? '';
if (!CORREO_VALIDO.test(correo) || correo.length > 254)
  salir('Indica un correo válido con --correo.');
if (nombre.length < 2 || nombre.length > 120)
  salir('Indica un nombre (2 a 120 letras) con --nombre.');

const url = process.env['DATABASE_URL'];
const origen = process.env['WEB_ORIGEN'];
if (!url) salir('Falta DATABASE_URL.');
if (!origen || !URL.canParse(origen)) salir('Falta WEB_ORIGEN (la dirección pública de la web).');

const prisma = crearClientePrisma(url);

try {
  const existente = await prisma.usuario.findUnique({ where: { correo } });
  if (existente && existente.rol !== 'admin') {
    salir(`Ya existe una cuenta con ${correo} y no es de administración. Usa otro correo.`);
  }
  if (existente?.hashContrasena) {
    salir(
      `La cuenta ${correo} ya está activa. Si olvidaste la contraseña, usa «¿Olvidaste tu contraseña?» en la página de ingreso.`,
    );
  }

  const token = randomBytes(32).toString('base64url');
  const ahora = new Date();
  await prisma.$transaction(async (tx) => {
    const usuario =
      existente ?? (await tx.usuario.create({ data: { correo, nombre, rol: 'admin' } }));
    // Invalida invitaciones anteriores sin usar y emite una nueva.
    await tx.tokenUnUso.updateMany({
      where: { usuarioId: usuario.id, tipo: 'invitacion', usadoEn: null },
      data: { usadoEn: ahora },
    });
    await tx.tokenUnUso.create({
      data: {
        usuarioId: usuario.id,
        tipo: 'invitacion',
        tokenHash: createHash('sha256').update(token, 'utf8').digest('hex'),
        expiraEn: new Date(ahora.getTime() + INVITACION_MINUTOS * 60_000),
      },
    });
    await tx.auditoria.create({
      data: {
        actorTipo: 'sistema',
        accion: existente ? 'usuario.invitacion_reenviada_instalador' : 'usuario.creado_instalador',
        entidad: 'usuario',
        entidadId: usuario.id,
        despues: { correo, rol: 'admin' },
      },
    });
  });

  const enlace = new URL('/invitacion', origen);
  enlace.searchParams.set('token', token);
  console.log(
    existente ? '✓ Invitación renovada.' : `✓ Cuenta de administración creada: ${correo}`,
  );
  console.log(
    '\nAbre este enlace (vence en 72 horas y sirve una sola vez) para elegir tu contraseña:',
  );
  console.log(`\n  ${enlace.toString()}\n`);
  console.log('Después entra en /ingresar y configura la verificación en dos pasos (2FA).');
} finally {
  await prisma.$disconnect();
}
