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
import { sembrarRevendedores } from './semillas/revendedores.js';
import { sembrarSitio } from './semillas/sitio.js';

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
  await sembrarNegocio();
  await sembrarRevendedores(prisma);
  await sembrarSitio(prisma);
  console.log(`\nContraseña de todos los usuarios de demostración: ${CONTRASENA_DEMO}`);
}

const DIA = 24 * 3600_000;

/** Catálogo, tasas, métodos de cobro y algunos clientes de ejemplo (fase 1). */
async function sembrarNegocio() {
  if (await prisma.proveedor.findFirst()) {
    console.log('· el catálogo de demostración ya existe');
    return;
  }
  const admin = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'admin@nv.test' } });
  const ventas = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'ventas@nv.test' } });
  const clienteUsuario = await prisma.usuario.findUniqueOrThrow({
    where: { correo: 'cliente@nv.test' },
  });

  const propio = await prisma.proveedor.create({
    data: { nombre: 'NV Streaming', tipo: 'propio', permiteReventa: true },
  });
  const distribuidor = await prisma.proveedor.create({
    data: {
      nombre: 'Distribuidor de demostración',
      tipo: 'distribuidor',
      notasAcuerdo: 'Proveedor ficticio para pruebas. Sustitúyelo por un acuerdo real.',
    },
  });
  const cine = await prisma.servicio.create({
    data: {
      proveedorId: propio.id,
      nombre: 'NV Cine',
      slug: 'nv-cine',
      descripcion: 'Películas y series con licencia, en alta definición.',
    },
  });
  const musica = await prisma.servicio.create({
    data: {
      proveedorId: propio.id,
      nombre: 'NV Música',
      slug: 'nv-musica',
      descripcion: 'Música sin anuncios y descargas para escuchar sin conexión.',
    },
  });
  const tarjetas = await prisma.servicio.create({
    data: {
      proveedorId: distribuidor.id,
      nombre: 'Tarjetas de regalo',
      slug: 'tarjetas-regalo',
      descripcion: 'Códigos de activación de un distribuidor oficial (demostración).',
    },
  });
  const planes = [
    {
      servicioId: cine.id,
      nombre: 'Mensual',
      precioUsd: '5.99',
      duracionCantidad: 1,
      orden: 1,
      revendible: true,
      beneficios: ['Alta definición', '2 pantallas a la vez', 'Sin anuncios'],
    },
    {
      servicioId: cine.id,
      nombre: 'Trimestral',
      precioUsd: '15.99',
      duracionCantidad: 3,
      orden: 2,
      revendible: true,
      beneficios: ['Alta definición', '2 pantallas a la vez', 'Ahorras un 11 %'],
    },
    {
      servicioId: cine.id,
      nombre: 'Anual',
      precioUsd: '54.99',
      duracionCantidad: 12,
      orden: 3,
      beneficios: ['4K cuando esté disponible', '4 pantallas a la vez', 'Ahorras un 23 %'],
    },
    {
      servicioId: musica.id,
      nombre: 'Individual',
      precioUsd: '3.49',
      duracionCantidad: 1,
      orden: 4,
      beneficios: ['Sin anuncios', 'Descargas sin conexión'],
    },
    {
      servicioId: tarjetas.id,
      nombre: 'Tarjeta 30 días',
      precioUsd: '4.50',
      duracionCantidad: 1,
      orden: 5,
      visible: false,
      beneficios: ['Código de activación'],
    },
  ];
  const creados = [];
  for (const p of planes) {
    const plan = await prisma.plan.create({ data: { ...p, duracionUnidad: 'mes' } });
    await prisma.historialPrecio.create({
      data: { planId: plan.id, moneda: 'USD', nuevo: plan.precioUsd, autorId: admin.id },
    });
    creados.push(plan);
  }

  // Tasas de EJEMPLO: actualízalas desde el panel con las del día.
  for (const [moneda, valor] of [
    ['VES', '150'],
    ['ARS', '1200'],
    ['COP', '4000'],
    ['PEN', '3.70'],
    ['EUR', '0.92'],
  ] as const) {
    await prisma.tasaCambio.create({ data: { moneda, valor, autorId: admin.id } });
  }
  const metodos = [
    {
      nombre: 'Pago Móvil',
      moneda: 'VES',
      orden: 1,
      instrucciones:
        'DATOS DE EJEMPLO. Banco: 0000 · Teléfono: 0414-000-0000 · RIF: J-00000000-0. Usa como concepto el número de factura.',
    },
    {
      nombre: 'Transferencia en dólares',
      moneda: 'USD',
      orden: 1,
      requiereReferencia: false,
      instrucciones:
        'DATOS DE EJEMPLO. Titular: NV Streaming · Correo: pagos@example.com. Indica el número de factura en la nota.',
    },
    {
      nombre: 'Transferencia bancaria',
      moneda: 'COP',
      orden: 1,
      instrucciones: 'DATOS DE EJEMPLO. Cuenta de ahorros 000-000000-00 a nombre de NV Streaming.',
    },
    {
      nombre: 'Transferencia bancaria',
      moneda: 'ARS',
      orden: 1,
      instrucciones: 'DATOS DE EJEMPLO. CBU 0000000000000000000000 · Alias NV.DEMO.PAGOS.',
    },
    {
      nombre: 'Billetera digital',
      moneda: 'PEN',
      orden: 1,
      instrucciones: 'DATOS DE EJEMPLO. Número 900 000 000 a nombre de NV Streaming.',
    },
    {
      nombre: 'Transferencia SEPA',
      moneda: 'EUR',
      orden: 1,
      instrucciones: 'DATOS DE EJEMPLO. IBAN ES00 0000 0000 0000 0000 0000.',
    },
  ] as const;
  const creadosMetodos = [];
  for (const m of metodos) creadosMetodos.push(await prisma.metodoCobro.create({ data: m }));

  // Clientes: la ficha de cliente@nv.test con un servicio activo y otros de la cartera de ventas.
  const ahora = new Date();
  const fichaDemo = await prisma.cliente.upsert({
    where: { usuarioId: clienteUsuario.id },
    update: {},
    create: {
      usuarioId: clienteUsuario.id,
      nombre: clienteUsuario.nombre,
      correo: clienteUsuario.correo,
      pais: 'VE',
      monedaPreferida: 'VES',
      origen: 'registro_web',
    },
  });
  const mensual = creados[0]!;
  const sus = await prisma.suscripcion.create({
    data: {
      clienteId: fichaDemo.id,
      planId: mensual.id,
      estado: 'activa',
      moneda: 'USD',
      inicioEn: new Date(ahora.getTime() - 20 * DIA),
      venceEn: new Date(ahora.getTime() + 10 * DIA),
      eventos: { create: [{ tipo: 'alta' }, { tipo: 'activacion' }] },
    },
  });
  const factura = await prisma.factura.create({
    data: {
      clienteId: fichaDemo.id,
      suscripcionId: sus.id,
      concepto: 'alta',
      estado: 'pagada',
      moneda: 'USD',
      subtotal: '5.99',
      total: '5.99',
      tasa: '1',
      totalUsd: '5.99',
      venceEn: new Date(ahora.getTime() - 17 * DIA),
      pagadaEn: new Date(ahora.getTime() - 20 * DIA),
      lineas: {
        create: {
          planId: mensual.id,
          descripcion: 'Alta: NV Cine · Mensual (1 mes)',
          cantidad: 1,
          precioUnitario: '5.99',
          total: '5.99',
        },
      },
    },
  });
  await prisma.pago.create({
    data: {
      referencia: 'P-DEMO0001',
      facturaId: factura.id,
      clienteId: fichaDemo.id,
      metodoCobroId: creadosMetodos[1]!.id,
      moneda: 'USD',
      montoDeclarado: '5.99',
      montoRecibido: '5.99',
      fechaPago: new Date(ahora.getTime() - 20 * DIA),
      estado: 'confirmado',
      revisadoPorId: admin.id,
      revisadoEn: new Date(ahora.getTime() - 20 * DIA),
    },
  });
  for (const [nombre, pais, moneda] of [
    ['María Rodríguez', 'CO', 'COP'],
    ['Jorge Castillo', 'PE', 'PEN'],
  ] as const) {
    await prisma.cliente.create({
      data: {
        nombre,
        pais,
        monedaPreferida: moneda,
        asignadoAId: ventas.id,
        creadoPorId: ventas.id,
      },
    });
  }
  await prisma.auditoria.create({
    data: {
      actorTipo: 'sistema',
      accion: 'catalogo.semilla',
      entidad: 'catalogo',
      despues: { planes: creados.length },
    },
  });
  console.log(
    `✓ catálogo de demostración: ${creados.length} planes, 5 tasas, ${metodos.length} métodos de cobro`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
