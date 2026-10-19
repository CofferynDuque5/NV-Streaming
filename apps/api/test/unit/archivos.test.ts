import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AlmacenService } from '../../src/almacen/almacen.service.js';
import type { Entorno } from '../../src/config/entorno.js';
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

describe('almacén de archivos', () => {
  it('el servicio de copias (grupo de la API) puede leer lo que se sube', async () => {
    // Las copias corren con otro usuario del servidor y el grupo de la API (1000):
    // carpetas y archivos legibles por el grupo, nunca por el resto.
    const raiz = await mkdtemp(join(tmpdir(), 'nv-almacen-'));
    try {
      const almacen = new AlmacenService({
        ALMACEN_DIR: raiz,
        COMPROBANTE_MAX_MB: 5,
      } as Entorno);
      let clave = '';
      const tx = {
        archivo: {
          create: async ({ data }: { data: { clave: string } }) => {
            clave = data.clave;
            return data;
          },
        },
      };
      const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
      await almacen.guardar(tx as never, { buffer: jpg, nombre: 'pago.jpg' }, 'usuario');
      expect((await stat(join(raiz, 'comprobantes'))).mode & 0o777).toBe(0o750);
      expect((await stat(join(raiz, clave))).mode & 0o777).toBe(0o640);
    } finally {
      await rm(raiz, { recursive: true, force: true });
    }
  });
});
