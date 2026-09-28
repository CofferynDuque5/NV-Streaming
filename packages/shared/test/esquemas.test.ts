import { describe, expect, it } from 'vitest';
import {
  actualizarServicioSchema,
  CATEGORIAS_SERVICIO,
  contrasenaSchema,
  INFO_CATEGORIA,
  registroSchema,
  servicioSchema,
  verificar2faSchema,
} from '../src/index.js';

describe('contraseñas', () => {
  it.each(['corta', 'aaaaaaaaaaaa', 'password123', 'contraseña1'])('rechaza "%s"', (c) => {
    expect(contrasenaSchema.safeParse(c).success).toBe(false);
  });

  it('acepta frases largas', () => {
    expect(contrasenaSchema.safeParse('caballo correcto batería grapa').success).toBe(true);
  });
});

describe('registro', () => {
  const base = {
    nombre: 'Ana',
    correo: ' ANA@Correo.TEST ',
    contrasena: 'Una-Clave-Larga-9',
    aceptaTerminos: true,
  };

  it('normaliza el correo', () => {
    expect(registroSchema.parse(base).correo).toBe('ana@correo.test');
  });

  it('exige aceptar los términos', () => {
    expect(registroSchema.safeParse({ ...base, aceptaTerminos: false }).success).toBe(false);
  });
});

describe('verificación en dos pasos', () => {
  it('acepta un código de 6 dígitos o uno de respaldo', () => {
    expect(verificar2faSchema.safeParse({ codigo: '123456' }).success).toBe(true);
    expect(verificar2faSchema.safeParse({ codigoRespaldo: 'ABCDE-23456' }).success).toBe(true);
    expect(verificar2faSchema.safeParse({ codigo: '12345' }).success).toBe(false);
  });
});

describe('categoría del servicio', () => {
  const base = {
    proveedorId: '8f0d9c1e-3b2a-4c5d-9e8f-7a6b5c4d3e2f',
    nombre: 'NV Cine',
    slug: 'nv-cine',
  };

  it('acepta los universos de la tienda y vacío como «sin categoría»', () => {
    for (const c of CATEGORIAS_SERVICIO) {
      expect(servicioSchema.parse({ ...base, categoria: c }).categoria).toBe(c);
      expect(INFO_CATEGORIA[c].nombre).not.toBe('');
    }
    expect(servicioSchema.parse({ ...base, categoria: '' }).categoria).toBeNull();
    expect(servicioSchema.parse(base).categoria).toBeUndefined();
  });

  it('rechaza una categoría desconocida y no la toca si no se envía al editar', () => {
    expect(servicioSchema.safeParse({ ...base, categoria: 'cocina' }).success).toBe(false);
    expect(actualizarServicioSchema.parse({ nombre: 'Otro' })).not.toHaveProperty('categoria');
  });
});
