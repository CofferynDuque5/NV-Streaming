import { createCipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { normalizarCodigo } from '@nv/shared';
import type { PrismaClient } from '../../src/index.js';

/**
 * Entregas de demostración (fase 6):
 *
 * - «NV Originals»: servicio propio con licencia de NV, entrega manual (el
 *   equipo completa cada entrega con los pasos para activar).
 * - El «Distribuidor de demostración» entrega con códigos de inventario: se le
 *   cargan códigos FALSOS (DEMO-XXXX-0001…) en su plan de tarjetas.
 *
 * Los códigos se cifran con CLAVE_CIFRADO igual que lo hace la API (AES-256-GCM
 * con el contexto `codigo:<id>` y huella HMAC). Sin CLAVE_CIFRADO no se cargan
 * códigos. Idempotente: solo crea lo que falta.
 */

const CODIGOS_DEMO = Array.from(
  { length: 10 },
  (_, i) => `DEMO-XXXX-${String(i + 1).padStart(4, '0')}`,
);
const NOMBRE_DISTRIBUIDOR = 'Distribuidor de demostración';
const NOMBRE_LOTE = 'Lote de demostración (códigos falsos)';

/** Mismo formato que `Cifrador.cifrar` de la API: v1.<idClave>.<iv>.<tag>.<cifrado>. */
function cifrar(clave: Buffer, texto: string, contexto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave, iv);
  c.setAAD(Buffer.from(contexto, 'utf8'));
  const cifrado = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', 'k1', iv, c.getAuthTag(), cifrado]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
    .join('.');
}

/** Mismo cálculo que `Cifrador.huella(normalizarCodigo(c), 'codigos-inventario')`. */
function huella(clave: Buffer, codigo: string): string {
  const derivada = createHmac('sha256', clave).update('nv:huella:codigos-inventario').digest();
  return createHmac('sha256', derivada).update(normalizarCodigo(codigo), 'utf8').digest('hex');
}

export async function sembrarEntregas(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.usuario.findUnique({ where: { correo: 'admin@nv.test' } });

  // 1. NV Originals: servicio propio, entrega manual.
  const originals = await prisma.proveedor.upsert({
    where: { nombre: 'NV Originals' },
    update: {},
    create: {
      nombre: 'NV Originals',
      tipo: 'propio',
      adaptador: 'manual',
      notasAcuerdo: 'Contenido propio con licencia de NV. Entrega manual por el equipo.',
      configuracion: {
        entregarRenovaciones: false,
        instrucciones:
          'Descarga la app NV Originals, entra con tu propia cuenta de NV y sigue los pasos que te indicamos aquí.',
      },
    },
  });
  const servicio = await prisma.servicio.upsert({
    where: { slug: 'nv-originals' },
    update: {},
    create: {
      proveedorId: originals.id,
      nombre: 'NV Originals',
      slug: 'nv-originals',
      descripcion: 'Series y documentales producidos por NV, con licencia propia.',
    },
  });
  if (!(await prisma.plan.findFirst({ where: { servicioId: servicio.id } }))) {
    const plan = await prisma.plan.create({
      data: {
        servicioId: servicio.id,
        nombre: 'Pase 30 días',
        descripcion: 'Acceso a todo el catálogo de NV Originals durante 30 días.',
        precioUsd: '2.99',
        duracionCantidad: 30,
        duracionUnidad: 'dia',
        renovable: false,
        orden: 10,
        skuProveedor: 'NVO-PASE-30',
        beneficios: ['Contenido propio con licencia', 'Sin anuncios'],
      },
    });
    if (admin) {
      await prisma.historialPrecio.create({
        data: { planId: plan.id, moneda: 'USD', nuevo: plan.precioUsd, autorId: admin.id },
      });
    }
    console.log('✓ NV Originals (entrega manual)');
  } else {
    console.log('· NV Originals ya existe');
  }

  // 2. Distribuidor de demostración con códigos de inventario.
  const distribuidor = await prisma.proveedor.findUnique({
    where: { nombre: NOMBRE_DISTRIBUIDOR },
  });
  if (!distribuidor) {
    console.log('· no hay distribuidor de demostración: no se cargan códigos');
    return;
  }
  if (distribuidor.adaptador === 'manual') {
    await prisma.proveedor.update({
      where: { id: distribuidor.id },
      data: {
        adaptador: 'codigos',
        configuracion: {
          entregarRenovaciones: true,
          instrucciones:
            'Abre la app del servicio, elige «Canjear código» y escribe el código tal como aparece. (Demostración: el código es falso.)',
        },
      },
    });
  }
  const plan = await prisma.plan.findFirst({
    where: { servicio: { proveedorId: distribuidor.id } },
    orderBy: { orden: 'asc' },
  });
  if (!plan) return;
  if (!plan.skuProveedor) {
    await prisma.plan.update({ where: { id: plan.id }, data: { skuProveedor: 'DEMO-TARJETA-30' } });
  }
  if (await prisma.loteCodigos.findFirst({ where: { planId: plan.id, nombre: NOMBRE_LOTE } })) {
    console.log('· los códigos de demostración ya existen');
    return;
  }
  const claveTexto = process.env['CLAVE_CIFRADO'];
  const clave = claveTexto ? Buffer.from(claveTexto, 'base64') : null;
  if (!admin || !clave || clave.length !== 32) {
    console.log('· sin CLAVE_CIFRADO válida: no se cargan códigos de demostración');
    return;
  }
  const lote = await prisma.loteCodigos.create({
    data: {
      planId: plan.id,
      nombre: NOMBRE_LOTE,
      subidoPorId: admin.id,
      cantidad: CODIGOS_DEMO.length,
    },
  });
  const creados = await prisma.codigoInventario.createMany({
    data: CODIGOS_DEMO.map((codigo) => {
      const id = randomUUID();
      return {
        id,
        planId: plan.id,
        loteId: lote.id,
        codigoCifrado: cifrar(clave, codigo, `codigo:${id}`),
        huella: huella(clave, codigo),
      };
    }),
    skipDuplicates: true,
  });
  if (creados.count !== CODIGOS_DEMO.length) {
    await prisma.loteCodigos.update({
      where: { id: lote.id },
      data: { cantidad: creados.count, repetidos: CODIGOS_DEMO.length - creados.count },
    });
  }
  console.log(`✓ ${creados.count} códigos falsos de demostración en «${plan.nombre}»`);
}
