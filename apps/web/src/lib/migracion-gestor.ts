import {
  type ArchivoMigracionGestor,
  canonicoGestor,
  type CredencialesMigracion,
} from '@nv/shared';

/**
 * Verificación y descifrado de la «Migración a NV Streaming» del Gestor, en este
 * navegador: la frase y las claves nunca salen de aquí.
 */

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function sha256(texto: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(h), (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Secciones cuyo SHA-256 no coincide con el manifiesto (vacío = archivo íntegro). */
export async function verificarMigracion(a: ArchivoMigracionGestor): Promise<string[]> {
  const malas: string[] = [];
  const { sha256: firma, ...resto } = a.manifiesto;
  if ((await sha256(canonicoGestor(resto))) !== firma) malas.push('manifiesto');
  for (const [nombre, s] of Object.entries(a.manifiesto.secciones)) {
    if ((await sha256(canonicoGestor(a.secciones[nombre]))) !== s.sha256) malas.push(nombre);
  }
  if ((await sha256(a.credenciales)) !== a.manifiesto.credenciales.sha256)
    malas.push('credenciales');
  return malas;
}

/** Descifra las credenciales con la frase; lanza un error claro si la frase no es. */
export async function descifrarMigracion(
  a: ArchivoMigracionGestor,
  frase: string,
): Promise<CredencialesMigracion> {
  const s = a.manifiesto.credenciales;
  if (s.alg !== 'AES-256-GCM' || s.kdf !== 'PBKDF2-SHA256')
    throw new Error('El cifrado de la copia no es el que espera NV Streaming.');
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(frase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const clave = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: bytes(s.sal), iterations: s.iteraciones },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  let claro: ArrayBuffer;
  try {
    claro = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes(s.iv) },
      clave,
      bytes(a.credenciales),
    );
  } catch {
    throw new Error('La frase no es la correcta.');
  }
  return JSON.parse(new TextDecoder().decode(claro)) as CredencialesMigracion;
}

/** Icono de una plataforma en la migración (base64 de PNG, JPG, SVG…). */
export interface IconoMigracion {
  plataformaId: string;
  tipo: string;
  base64: string;
}

/** Lo convierte a PNG de 256 px (la biblioteca del sitio acepta PNG, JPG o WebP). */
export async function iconoComoPng(icono: IconoMigracion): Promise<Blob> {
  const url = `data:${icono.tipo};base64,${icono.base64}`;
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const lado = 256;
  const lienzo = document.createElement('canvas');
  lienzo.width = lado;
  lienzo.height = lado;
  const ctx = lienzo.getContext('2d');
  if (!ctx) throw new Error('El navegador no pudo preparar el icono.');
  const escala = Math.min(lado / (img.naturalWidth || lado), lado / (img.naturalHeight || lado));
  const w = (img.naturalWidth || lado) * escala;
  const h = (img.naturalHeight || lado) * escala;
  ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
  return new Promise((listo, fallo) =>
    lienzo.toBlob(
      (b) => (b ? listo(b) : fallo(new Error('No se pudo convertir el icono.'))),
      'image/png',
    ),
  );
}
