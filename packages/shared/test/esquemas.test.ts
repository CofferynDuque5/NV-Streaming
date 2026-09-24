import { describe, expect, it } from 'vitest';
import { contrasenaSchema, registroSchema, verificar2faSchema } from '../src/index.js';

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
