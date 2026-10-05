import { Prisma, type PrismaClient } from '../../src/index.js';

const NIVELES = [
  { nombre: 'Bronce', orden: 1, descripcion: 'Nivel de entrada.', factor: '0.85' },
  {
    nombre: 'Plata',
    orden: 2,
    descripcion: 'Para revendedores con ventas constantes.',
    factor: '0.80',
  },
  {
    nombre: 'Oro',
    orden: 3,
    descripcion: 'El mejor precio, para grandes volúmenes.',
    factor: '0.75',
  },
] as const;

/** Saldo inicial del revendedor de demostración, acreditado con una recarga confirmada. */
const SALDO_DEMO_USD = '25.00';

const redondear2 = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

/**
 * Niveles, precios mayoristas y el revendedor de demostración (fase 2).
 * Se puede ejecutar varias veces: solo crea lo que falta.
 */
export async function sembrarRevendedores(prisma: PrismaClient): Promise<void> {
  const admin = await prisma.usuario.findUnique({ where: { correo: 'admin@nv.test' } });

  // 1. Niveles.
  const niveles = [];
  for (const n of NIVELES) {
    niveles.push({
      ...n,
      fila: await prisma.nivelRevendedor.upsert({
        where: { nombre: n.nombre },
        update: {},
        create: { nombre: n.nombre, orden: n.orden, descripcion: n.descripcion },
      }),
    });
  }

  // 2. Planes revendibles: si el catálogo no tiene ninguno, se marcan los dos primeros.
  const revendibles = { revendible: true, servicio: { proveedor: { permiteReventa: true } } };
  if ((await prisma.plan.count({ where: revendibles })) === 0) {
    const candidatos = await prisma.plan.findMany({
      where: { activo: true },
      orderBy: { orden: 'asc' },
      take: 2,
      include: { servicio: true },
    });
    for (const p of candidatos) {
      await prisma.proveedor.update({
        where: { id: p.servicio.proveedorId },
        data: { permiteReventa: true },
      });
      await prisma.plan.update({ where: { id: p.id }, data: { revendible: true } });
    }
  }
  const planes = await prisma.plan.findMany({ where: revendibles });
  for (const plan of planes) {
    // Costo de EJEMPLO (la mitad del precio público): ajústalo en el catálogo.
    let costo = plan.costoUsd;
    if (costo === null) {
      costo = redondear2(plan.precioUsd.mul('0.5'));
      await prisma.plan.update({ where: { id: plan.id }, data: { costoUsd: costo } });
    }
    for (const n of niveles) {
      const calculado = redondear2(plan.precioUsd.mul(n.factor));
      const precio = calculado.lt(costo) ? costo : calculado;
      if (precio.lte(0)) continue;
      await prisma.precioMayorista.upsert({
        where: { planId_nivelId: { planId: plan.id, nivelId: n.fila.id } },
        update: {},
        create: {
          planId: plan.id,
          nivelId: n.fila.id,
          precioUsd: precio,
          actualizadoPorId: admin?.id ?? null,
        },
      });
    }
  }

  // 3. revendedor@nv.test: aprobado en Plata y con saldo de una recarga confirmada.
  const usuario = await prisma.usuario.findUnique({ where: { correo: 'revendedor@nv.test' } });
  if (!usuario) return;
  const plata = niveles.find((n) => n.nombre === 'Plata')!.fila;
  const ficha = await prisma.revendedor.upsert({
    where: { usuarioId: usuario.id },
    update: {},
    create: {
      usuarioId: usuario.id,
      estado: 'aprobado',
      nivelId: plata.id,
      nombreComercial: 'Streaming Demo C.A.',
      documento: 'J-00000000-0',
      telefono: '+584140000000',
      pais: 'VE',
      mensaje: 'Revendedor de demostración.',
      revisadoPorId: admin?.id ?? null,
      revisadoEn: new Date(),
    },
  });
  if ((await prisma.movimientoSaldo.count({ where: { revendedorId: ficha.id } })) > 0) {
    console.log('· el revendedor de demostración ya tiene saldo');
    return;
  }
  const metodo =
    (await prisma.metodoCobro.findFirst({ where: { moneda: 'VES', activo: true } })) ??
    (await prisma.metodoCobro.findFirst({ where: { moneda: 'USD', activo: true } }));
  if (!metodo) return;
  const tasa =
    metodo.moneda === 'USD'
      ? new Prisma.Decimal(1)
      : ((
          await prisma.tasaCambio.findFirst({
            where: { moneda: metodo.moneda, vigenteDesde: { lte: new Date() } },
            orderBy: { vigenteDesde: 'desc' },
          })
        )?.valor ?? null);
  if (!tasa) return;
  const montoUsd = new Prisma.Decimal(SALDO_DEMO_USD);
  const monto = redondear2(montoUsd.mul(tasa));
  const hace2Dias = new Date(Date.now() - 2 * 24 * 3600_000);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM revendedores WHERE id = ${ficha.id}::uuid FOR UPDATE`;
    const recarga = await tx.recargaSaldo.create({
      data: {
        referencia: 'R-DEMO0001',
        revendedorId: ficha.id,
        metodoCobroId: metodo.id,
        moneda: metodo.moneda,
        montoDeclarado: monto,
        montoRecibido: monto,
        tasa,
        montoUsd,
        referenciaExterna: 'DEMO-0001',
        fechaPago: hace2Dias,
        estado: 'confirmada',
        notas: 'Recarga de demostración.',
        revisadoPorId: admin?.id ?? null,
        revisadoEn: hace2Dias,
      },
    });
    const actual = await tx.revendedor.findUniqueOrThrow({ where: { id: ficha.id } });
    const saldo = actual.saldoUsd.add(montoUsd);
    await tx.revendedor.update({ where: { id: ficha.id }, data: { saldoUsd: saldo } });
    await tx.movimientoSaldo.create({
      data: {
        revendedorId: ficha.id,
        tipo: 'recarga',
        montoUsd,
        saldoResultanteUsd: saldo,
        recargaId: recarga.id,
        autorId: admin?.id ?? null,
      },
    });
    await tx.auditoria.create({
      data: {
        actorTipo: 'sistema',
        accion: 'revendedor.semilla',
        entidad: 'revendedor',
        entidadId: ficha.id,
        despues: { nivel: plata.nombre, saldoUsd: saldo.toFixed(2) },
      },
    });
  });
  console.log(
    `✓ revendedores: ${niveles.length} niveles, precios para ${planes.length} planes y revendedor@nv.test con ${SALDO_DEMO_USD} USD`,
  );
}
