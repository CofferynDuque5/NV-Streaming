/**
 * Datos de demostración para DESARROLLO. Crea un usuario por rol con el correo
 * verificado. Se niega a ejecutarse en producción.
 *
 * El equipo y los revendedores deberán configurar la verificación en dos pasos
 * la primera vez que entren, igual que en producción.
 */
import { hash } from '@node-rs/argon2';
import { config } from 'dotenv';
import { crearClientePrisma, type Rol } from '../src/index.js';

config({ path: ['../../.env', '.env'], quiet: true });

if (process.env['NODE_ENV'] === 'production') {
  console.error('La semilla de demostración no se ejecuta en producción.');
  process.exit(1);
}

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('Falta DATABASE_URL.');
  process.exit(1);
}

export const CONTRASENA_DEMO = 'NvDemo-2026!';

const USUARIOS: { correo: string; nombre: string; rol: Rol }[] = [
  { correo: 'admin@nv.test', nombre: 'Administración NV', rol: 'admin' },
  { correo: 'operador@nv.test', nombre: 'Operador NV', rol: 'operador' },
  { correo: 'ventas@nv.test', nombre: 'Ventas NV', rol: 'ventas' },
  { correo: 'revendedor@nv.test', nombre: 'Revendedor Demo', rol: 'revendedor' },
  { correo: 'cliente@nv.test', nombre: 'Cliente Demo', rol: 'cliente' },
];

const prisma = crearClientePrisma(url);

async function main() {
  const hashContrasena = await hash(CONTRASENA_DEMO, {
    algorithm: 2, // Argon2id
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  for (const u of USUARIOS) {
    const existente = await prisma.usuario.findUnique({ where: { correo: u.correo } });
    if (existente) {
      console.log(`· ${u.correo} ya existe`);
      continue;
    }
    const creado = await prisma.usuario.create({
      data: { ...u, hashContrasena, correoVerificadoEn: new Date() },
    });
    await prisma.auditoria.create({
      data: {
        actorTipo: 'sistema',
        accion: 'usuario.creado_semilla',
        entidad: 'usuario',
        entidadId: creado.id,
        despues: { correo: u.correo, rol: u.rol },
      },
    });
    console.log(`✓ ${u.correo} (${u.rol})`);
  }
  console.log(`\nContraseña de todos los usuarios de demostración: ${CONTRASENA_DEMO}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
