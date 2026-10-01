import { describe, expect, it } from 'vitest';
import { detectarTipo, nombreSeguro } from '../../src/almacen/tipos-archivo.js';
import { nuevaReferencia } from '../../src/cobros/pagos.service.js';

describe('comprobantes', () => {
  it('detecta el tipo por el contenido, no por el nombre', () => {
    expect(detectarTipo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(detectarTipo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(
      'image/png',
    );
    expect(detectarTipo(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
    expect(detectarTipo(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
    expect(detectarTipo(Buffer.from('<svg onload="alert(1)">'))).toBeNull();
    expect(detectarTipo(Buffer.from('<html>'))).toBeNull();
    expect(detectarTipo(Buffer.alloc(0))).toBeNull();
  });

  it('limpia el nombre y le pone la extensión real', () => {
    expect(nombreSeguro('../../etc/passwd', 'image/png')).toBe('passwd.png');
    expect(nombreSeguro('C:\\fotos\\pago mayo.jpeg', 'image/jpeg')).toBe('pago mayo.jpg');
    expect(nombreSeguro('factura"<script>.pdf', 'application/pdf')).toBe('facturascript.pdf');
    expect(nombreSeguro(undefined, 'image/webp')).toBe('comprobante.webp');
  });

  it('genera referencias de pago legibles y sin caracteres confusos', () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const r = nuevaReferencia();
      expect(r).toMatch(/^P-[2-9A-HJ-KM-NP-Z]{8}$/);
      vistas.add(r);
    }
    expect(vistas.size).toBe(500);
  });
});
