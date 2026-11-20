/**
 * Recorta solo el código QR de una captura (la tarjeta de Plin, Binance o del
 * banco trae logos, nombres y márgenes alrededor). Se hace en el navegador
 * antes de subir la imagen: el servidor recibe un PNG con el QR y un margen
 * blanco. Si no encuentra un QR legible, devuelve la imagen tal cual.
 */
export async function recortarQr(archivo: File): Promise<{ archivo: File; recortado: boolean }> {
  try {
    const { default: jsQR } = await import('jsqr');
    const imagen = await createImageBitmap(archivo);
    // Se busca en versiones reducidas (más rápido y más robusto con logos al centro).
    for (const maximo of [1000, 700, 1400]) {
      const escala = Math.min(1, maximo / Math.max(imagen.width, imagen.height));
      const ancho = Math.round(imagen.width * escala);
      const alto = Math.round(imagen.height * escala);
      const lienzo = new OffscreenCanvas(ancho, alto);
      const ctx = lienzo.getContext('2d', { willReadFrequently: true });
      if (!ctx) break;
      ctx.drawImage(imagen, 0, 0, ancho, alto);
      const pixeles = ctx.getImageData(0, 0, ancho, alto);
      const qr = jsQR(pixeles.data, ancho, alto, { inversionAttempts: 'attemptBoth' });
      if (!qr) continue;
      // Centros de los 3 patrones de las esquinas: de ahí sale el tamaño de cada
      // módulo y el borde real del código (3,5 módulos más allá de cada centro).
      const l = qr.location;
      const dim = 17 + 4 * qr.version;
      const modulo =
        Math.hypot(
          l.topRightFinderPattern.x - l.topLeftFinderPattern.x,
          l.topRightFinderPattern.y - l.topLeftFinderPattern.y,
        ) /
        (dim - 7);
      const xs = [l.topLeftFinderPattern.x, l.topRightFinderPattern.x, l.bottomLeftFinderPattern.x];
      const ys = [l.topLeftFinderPattern.y, l.topRightFinderPattern.y, l.bottomLeftFinderPattern.y];
      // Solo el código (3,5 módulos más allá de cada centro, más uno de holgura por si la
      // captura está un poco torcida): lo de alrededor se descarta.
      const borde = modulo * 4.5;
      const x0 = (Math.min(...xs) - borde) / escala;
      const y0 = (Math.min(...ys) - borde) / escala;
      const lado = (modulo * (dim + 2)) / escala;
      // Salida de al menos 640 px agrandando por un factor entero (los módulos no se
      // deforman) y con 3 módulos de margen blanco: con la holgura suman la zona de silencio.
      const factor = Math.max(1, Math.ceil(640 / lado));
      const codigo = Math.round(lado * factor);
      const margen = Math.round((modulo / escala) * factor * 3);
      const salida = codigo + margen * 2;
      const final = new OffscreenCanvas(salida, salida);
      const fctx = final.getContext('2d');
      if (!fctx) break;
      fctx.fillStyle = '#ffffff';
      fctx.fillRect(0, 0, salida, salida);
      // Sin suavizado: los módulos quedan nítidos al agrandar capturas pequeñas.
      fctx.imageSmoothingEnabled = false;
      fctx.drawImage(imagen, x0, y0, lado, lado, margen, margen, codigo, codigo);
      // Comprueba que el recorte se sigue leyendo; si no, mejor la imagen original.
      if (!legible(jsQR, final)) continue;
      const blob = await final.convertToBlob({ type: 'image/png' });
      imagen.close();
      const nombre = archivo.name.replace(/\.[^.]+$/, '') || 'qr';
      return {
        archivo: new File([blob], `${nombre}-qr.png`, { type: 'image/png' }),
        recortado: true,
      };
    }
    imagen.close();
  } catch {
    // Navegador sin OffscreenCanvas o imagen ilegible: se sube la original.
  }
  return { archivo, recortado: false };
}

/** El recorte se sigue leyendo (se prueba en varios tamaños, como lo haría una cámara). */
function legible(jsQR: typeof import('jsqr').default, lienzo: OffscreenCanvas): boolean {
  for (const lado of [lienzo.width, 800, 500]) {
    const l = Math.min(lado, lienzo.width);
    const c = new OffscreenCanvas(l, l);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    ctx.drawImage(lienzo, 0, 0, l, l);
    if (jsQR(ctx.getImageData(0, 0, l, l).data, l, l)) return true;
  }
  return false;
}
