/*
 * Reglas de la contraseña sin dependencias (ni zod): las usan los esquemas de
 * validación y también los formularios del navegador (requisitos en vivo) sin
 * cargar zod.
 */

/** Contraseñas muy comunes que se rechazan aunque cumplan la longitud. */
export const CONTRASENAS_COMUNES = new Set([
  '1234567890',
  '12345678910',
  'contraseña1',
  'contrasena1',
  'contraseña123',
  'contrasena123',
  'password123',
  'password1234',
  'qwertyuiop',
  'qwerty1234',
  'qwerty12345',
  '123456789a',
  'abc1234567',
  'abcd123456',
  'nvstreaming',
  'nvstreaming123',
  'administrador',
  'iloveyou123',
]);

export const LONGITUD_MINIMA_CONTRASENA = 10;

export interface RequisitoContrasena {
  clave: 'largo' | 'variedad' | 'comun' | 'correo';
  texto: string;
  cumple: boolean;
}

/** Si la contraseña contiene la parte del correo antes de la @ (regla del registro). */
export function contrasenaContieneCorreo(contrasena: string, correo: string): boolean {
  const usuario = correo.trim().toLowerCase().split('@')[0] ?? '';
  return usuario.length > 0 && contrasena.toLowerCase().includes(usuario);
}

/**
 * Requisitos de la contraseña para mostrarlos en vivo al escribirla. Son las
 * mismas reglas de `contrasenaSchema` (la API vuelve a validarlas). Con
 * `correo` suma la regla del registro: no contener el correo.
 */
export function requisitosContrasena(valor: string, correo?: string): RequisitoContrasena[] {
  const reglas: RequisitoContrasena[] = [
    {
      clave: 'largo',
      texto: `Al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`,
      cumple: valor.length >= LONGITUD_MINIMA_CONTRASENA && valor.length <= 128,
    },
    {
      clave: 'variedad',
      texto: 'Al menos 5 caracteres distintos',
      cumple: new Set(valor).size >= 5,
    },
    {
      clave: 'comun',
      texto: 'No es una contraseña común',
      cumple: valor.length > 0 && !CONTRASENAS_COMUNES.has(valor.toLowerCase()),
    },
  ];
  if (correo !== undefined)
    reglas.push({
      clave: 'correo',
      texto: 'No contiene tu correo',
      cumple: valor.length > 0 && !contrasenaContieneCorreo(valor, correo),
    });
  return reglas;
}
