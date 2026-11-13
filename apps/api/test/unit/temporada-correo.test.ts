import { describe, expect, it } from 'vitest';
import { adornarTemporada, Plantillas } from '../../src/correo/plantillas.js';

describe('correos de temporada', () => {
  const correo = Plantillas.avisoPrueba('Ana');

  it('sin temporada el correo queda igual', () => {
    expect(adornarTemporada(correo, null)).toBe(correo);
  });

  it('en Navidad suma el saludo junto al nombre y cambia el color del botón', () => {
    const conBoton = Plantillas.tareaAsignada('Ana', 'Luis', 'Entregar', null, 'https://nv.test/x');
    const navidad = adornarTemporada(conBoton, 'navidad');
    expect(navidad.html).toContain('NV Streaming <span');
    expect(navidad.html).toContain('🎄 Felices fiestas');
    expect(navidad.html).toContain('background:#c81e1e;');
    expect(navidad.html).not.toContain('background:#6d4aff;');
    // El texto plano y el asunto no cambian.
    expect(navidad.texto).toBe(conBoton.texto);
    expect(navidad.asunto).toBe(conBoton.asunto);
  });
});
