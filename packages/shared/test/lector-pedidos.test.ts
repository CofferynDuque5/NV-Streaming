import { describe, expect, it } from 'vitest';
import { leerPedido, type PlanLector, type ServicioLector } from '../src/index.js';

const SERVICIOS: ServicioLector[] = [
  { id: 'netflix', nombre: 'Netflix', slug: 'netflix' },
  { id: 'disney', nombre: 'Disney+', slug: 'disney-plus' },
  { id: 'spotify', nombre: 'Spotify', slug: 'spotify' },
  { id: 'max', nombre: 'Max', slug: 'max' },
];
const PLANES: PlanLector[] = [
  {
    id: 'nf-1',
    servicioId: 'netflix',
    nombre: 'Perfil 1 mes',
    duracionCantidad: 1,
    duracionUnidad: 'mes',
  },
  {
    id: 'nf-3',
    servicioId: 'netflix',
    nombre: 'Perfil 3 meses',
    duracionCantidad: 3,
    duracionUnidad: 'mes',
  },
  {
    id: 'nf-4k',
    servicioId: 'netflix',
    nombre: 'Premium 4K',
    duracionCantidad: 1,
    duracionUnidad: 'mes',
  },
  {
    id: 'ds-1',
    servicioId: 'disney',
    nombre: 'Mensual',
    duracionCantidad: 1,
    duracionUnidad: 'mes',
  },
  {
    id: 'sp-1',
    servicioId: 'spotify',
    nombre: 'Individual',
    duracionCantidad: 1,
    duracionUnidad: 'mes',
  },
];

describe('leerPedido', () => {
  it('lee cantidad, servicio, meses y cliente de varias líneas', () => {
    const r = leerPedido(
      'Hola! necesito 2 netflix 3 meses para Ana Pérez\nuna disney plus, y 1 spotify',
      SERVICIOS,
      PLANES,
    );
    expect(r.pedidos.map((p) => [p.servicioId, p.planId, p.cantidad, p.meses, p.cliente])).toEqual([
      ['netflix', 'nf-3', 2, 3, 'Ana Pérez'],
      ['disney', 'ds-1', 1, null, null],
      ['spotify', 'sp-1', 1, null, null],
    ]);
    expect(r.pedidos[0]!.dudas).toEqual([]);
  });

  it('usa el nombre del plan, detecta renovaciones y correos', () => {
    const r = leerPedido('Renovar netflix 4k de juan@example.com', SERVICIOS, PLANES);
    expect(r.pedidos[0]).toMatchObject({
      servicioId: 'netflix',
      planId: 'nf-4k',
      renovar: true,
      correo: 'juan@example.com',
    });
  });

  it('marca duda cuando hay varios planes posibles', () => {
    const r = leerPedido('3 netflix', SERVICIOS, PLANES);
    expect(r.pedidos[0]!.cantidad).toBe(3);
    expect(r.pedidos[0]!.dudas).toContain('Hay varios planes posibles: revisa cuál es.');
  });

  it('entiende palabras enseñadas y propone las nuevas', () => {
    const r = leerPedido(
      'cuando diga plus es Spotify\n2 plus para Luis\n1 hbo',
      SERVICIOS,
      PLANES,
      [{ palabra: 'plus', servicioId: 'spotify' }],
    );
    expect(r.alias).toEqual([
      { palabra: 'plus', servicioId: 'spotify', texto: 'cuando diga plus es Spotify' },
    ]);
    expect(r.pedidos.map((p) => [p.servicioId, p.cantidad, p.cliente])).toEqual([
      ['spotify', 2, 'Luis'],
    ]);
    expect(r.sinServicio).toEqual(['1 hbo']);
  });

  it('«disney plus» no se confunde con la palabra «plus»', () => {
    const r = leerPedido('1 disney plus', SERVICIOS, PLANES, [
      { palabra: 'plus', servicioId: 'spotify' },
    ]);
    expect(r.pedidos[0]!.servicioId).toBe('disney');
  });

  it('un «para» suelto completa el pedido anterior', () => {
    const r = leerPedido('2 max 1 mes\npara Carla Ruiz', SERVICIOS, PLANES);
    expect(r.pedidos).toHaveLength(1);
    expect(r.pedidos[0]).toMatchObject({ servicioId: 'max', planId: null, cliente: 'Carla Ruiz' });
    expect(r.pedidos[0]!.dudas).toEqual(['El servicio no tiene planes activos.']);
  });
});
