import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export interface ConexionBuzon {
  host: string;
  puerto: number;
  seguro: boolean;
  usuario: string;
  clave: string;
  carpeta: string;
}

export interface CorreoLeido {
  asunto: string;
  de: string;
  fecha: Date;
  texto: string | null;
  html: string | null;
}

/** Error al hablar con el buzón, con un mensaje que se puede mostrar (sin datos sensibles). */
export class ErrorBuzon extends Error {}

/** Máximo de correos que se descargan por buzón y consulta. */
const MAX_CORREOS = 15;

/** Un buzón no puede apuntar a la red interna del servidor. */
export function esDireccionInterna(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return esDireccionInterna(v.slice(7));
    return v === '::1' || v === '::' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function mensajeDe(err: unknown): string {
  const e = err as { authenticationFailed?: boolean; code?: string; message?: string };
  if (e instanceof ErrorBuzon) return e.message;
  if (e?.authenticationFailed) {
    return 'El servidor rechazó el correo o la clave. En Gmail usa una contraseña de aplicación.';
  }
  if (e?.code === 'ENOTFOUND' || e?.code === 'EAI_AGAIN') return 'No se encontró ese servidor.';
  if (e?.code === 'ECONNREFUSED') return 'El servidor no acepta conexiones en ese puerto.';
  if (e?.code === 'ETIMEDOUT' || /timeout/i.test(e?.message ?? '')) {
    return 'El servidor tardó demasiado en responder.';
  }
  if (/mailbox|NONEXISTENT|doesn.t exist/i.test(e?.message ?? '')) {
    return 'No existe esa carpeta en el buzón.';
  }
  if (/certificate|self.signed|TLS|SSL/i.test(e?.message ?? '')) {
    return 'Falló la conexión segura (TLS). Revisa el puerto y la opción de conexión segura.';
  }
  return 'No se pudo leer el buzón.';
}

/**
 * Lee correos por IMAP en modo solo lectura (no marca nada como leído).
 * En las pruebas se reemplaza por uno falso.
 */
@Injectable()
export class LectorImap {
  private async cliente(c: ConexionBuzon): Promise<ImapFlow> {
    const ips = isIP(c.host)
      ? [c.host]
      : await lookup(c.host, { all: true })
          .then((r) => r.map((x) => x.address))
          .catch(() => {
            throw new ErrorBuzon('No se encontró ese servidor.');
          });
    if (ips.some(esDireccionInterna)) {
      throw new ErrorBuzon('Ese servidor apunta a una red interna: no se permite.');
    }
    const imap = new ImapFlow({
      host: c.host,
      port: c.puerto,
      secure: c.seguro,
      auth: { user: c.usuario, pass: c.clave },
      logger: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      disableAutoIdle: true,
    });
    // Sin este manejador, un error de socket tumbaría el proceso.
    imap.on('error', () => undefined);
    await imap.connect();
    return imap;
  }

  /** Conecta, abre la carpeta y sale. Lanza ErrorBuzon con un mensaje legible. */
  async probar(c: ConexionBuzon): Promise<void> {
    let imap: ImapFlow | null = null;
    try {
      imap = await this.cliente(c);
      await imap.mailboxOpen(c.carpeta, { readOnly: true });
    } catch (err) {
      throw new ErrorBuzon(mensajeDe(err));
    } finally {
      await imap?.logout().catch(() => undefined);
    }
  }

  /** Correos dirigidos a `para` desde `desde`, del más reciente al más antiguo. */
  async buscar(c: ConexionBuzon, para: string, desde: Date): Promise<CorreoLeido[]> {
    let imap: ImapFlow | null = null;
    try {
      imap = await this.cliente(c);
      await imap.mailboxOpen(c.carpeta, { readOnly: true });
      // SINCE solo mira el día: se filtra la hora exacta después.
      const uids = await imap.search(
        {
          since: new Date(desde.getTime() - 86_400_000),
          or: [{ to: para }, { header: { 'delivered-to': para } }],
        },
        { uid: true },
      );
      if (!uids || uids.length === 0) return [];
      const ultimos = [...uids].sort((a, b) => b - a).slice(0, MAX_CORREOS);
      const correos: CorreoLeido[] = [];
      for await (const m of imap.fetch(
        ultimos,
        { source: true, internalDate: true },
        { uid: true },
      )) {
        if (!m.source) continue;
        const p = await simpleParser(m.source);
        const fecha = p.date ?? (m.internalDate instanceof Date ? m.internalDate : new Date(0));
        if (fecha < desde) continue;
        correos.push({
          asunto: p.subject ?? '',
          de: p.from?.text ?? '',
          fecha,
          texto: p.text ?? null,
          html: typeof p.html === 'string' ? p.html : null,
        });
      }
      return correos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    } catch (err) {
      throw new ErrorBuzon(mensajeDe(err));
    } finally {
      await imap?.logout().catch(() => undefined);
    }
  }
}
