/**
 * Destinos de los avisos: normalización de teléfonos para WhatsApp y
 * enmascarado de correos y teléfonos para mostrarlos en el panel.
 */

/**
 * Teléfono en formato internacional (+584141234567) o null si no es válido.
 * Acepta los formatos venezolanos habituales: 0414-1234567 y 414 1234567.
 */
export function normalizarTelefono(valor: string): string | null {
  const texto = valor.trim();
  let d = texto.replace(/\D/g, '');
  if (!texto.startsWith('+')) {
    if (d.startsWith('00')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = `58${d.slice(1)}`;
    else if (d.length === 10 && d.startsWith('4')) d = `58${d}`;
  }
  if (d.length < 10 || d.length > 15 || d.startsWith('0')) return null;
  return `+${d}`;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const esCorreo = (v: string) => CORREO.test(v.trim());

/** "maria@gmail.com" → "ma***@gmail.com"; "+584141234567" → "+58 ***-***-4567". */
export function enmascararDestino(destino: string): string {
  const v = destino.trim();
  if (!v) return '';
  const arroba = v.lastIndexOf('@');
  if (arroba > 0) {
    const local = v.slice(0, arroba);
    const visibles = local.length <= 2 ? 1 : 2;
    return `${local.slice(0, visibles)}***${v.slice(arroba)}`;
  }
  const d = v.replace(/\D/g, '');
  if (d.length < 6) return '***';
  const pais = v.startsWith('+') ? (d.startsWith('1') ? '1' : d.slice(0, 2)) : null;
  return `${pais ? `+${pais} ` : ''}***-***-${d.slice(-4)}`;
}
