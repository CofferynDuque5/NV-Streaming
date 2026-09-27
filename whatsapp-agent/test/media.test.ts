/**
 * Test de la biblioteca de medios: MediaService contra un STUB local de ImgBB
 * (no toca la red real) + validaciones. Sin base de datos.
 *
 *   npm run test:media
 */
process.env['WHATSAPP_VERIFY_TOKEN'] ||= 'test';
process.env['WHATSAPP_APP_SECRET'] ||= 'test';
process.env['DATABASE_URL'] ||= 'postgres://nv@127.0.0.1:5433/nv_streaming';

import { createServer } from 'node:http';

const { MediaService, normalizarImagen, ImgBBNoConfiguradoError } = await import('../src/modules/media/media.service.js');

let fallos = 0;
const ok = (c: boolean, msg: string) => { if (!c) { fallos++; console.error('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

// PNG 1×1 real (base64).
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function main() {
  // ── normalizarImagen ──
  const n1 = normalizarImagen('data:image/png;base64,' + PNG);
  ok(n1.mime === 'image/png' && n1.base64 === PNG, 'dataURL → {mime, base64}');
  ok(normalizarImagen(PNG).mime === '' && normalizarImagen(PNG).base64 === PNG, 'base64 crudo aceptado');
  let err: any = null; try { normalizarImagen('data:text/html;base64,' + PNG); } catch (e) { err = e; }
  ok(err && err.statusCode === 400, 'MIME no permitido → 400');
  err = null; try { normalizarImagen('%%%no-base64%%%'); } catch (e) { err = e; }
  ok(err && err.statusCode === 400, 'base64 inválido → 400');
  err = null; try { normalizarImagen(''); } catch (e) { err = e; }
  ok(err && err.statusCode === 400, 'imagen vacía → 400');

  // ── sin clave → 503 claro ──
  const sinClave = new MediaService({ apiKey: '', endpoint: 'http://127.0.0.1:1/upload' });
  ok(sinClave.configurado === false, 'sin IMGBB_API_KEY: configurado=false');
  err = null; try { await sinClave.subir(PNG, 'x'); } catch (e) { err = e; }
  ok(err instanceof ImgBBNoConfiguradoError && err.statusCode === 503, 'subir sin clave → 503 imgbb_no_configurado');

  // ── stub de ImgBB: verifica que la clave viaja en el form y responde como ImgBB ──
  let recibido: { key?: string; image?: string; name?: string } = {};
  let modo: 'ok' | 'rechazo' | 'caido' = 'ok';
  const stub = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString('latin1');
    const campo = (n: string) => { const m = new RegExp('name="' + n + '"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--').exec(raw); return m ? m[1] : undefined; };
    recibido = { key: campo('key'), image: campo('image'), name: campo('name') };
    if (modo === 'caido') { req.socket.destroy(); return; }
    if (modo === 'rechazo') { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ success: false, error: { message: 'Invalid API v1 key.' }, status_code: 400 })); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, status: 200, data: {
      id: 'abc123', title: 'logo', url_viewer: 'https://ibb.co/abc123', url: 'https://i.ibb.co/abc123/logo.png',
      display_url: 'https://i.ibb.co/abc123/logo.png', width: 1, height: 1, size: 68, time: 1, expiration: 0,
      image: { filename: 'logo.png', name: 'logo', mime: 'image/png', extension: 'png', url: 'https://i.ibb.co/abc123/logo.png' },
      thumb: { filename: 'logo.png', name: 'logo', mime: 'image/png', extension: 'png', url: 'https://i.ibb.co/thumb/logo.png' },
      delete_url: 'https://ibb.co/abc123/deletehash',
    } }));
  });
  await new Promise<void>((r) => stub.listen(0, '127.0.0.1', r));
  const port = (stub.address() as any).port;
  const svc = new MediaService({ apiKey: 'clave-de-prueba', endpoint: `http://127.0.0.1:${port}/1/upload` });
  ok(svc.configurado, 'con clave: configurado=true');

  const r = await svc.subir('data:image/png;base64,' + PNG, 'logo-nv');
  ok(recibido.key === 'clave-de-prueba', 'la API key viaja en el form al endpoint (solo servidor)');
  ok(recibido.image === PNG && recibido.name === 'logo-nv', 'imagen base64 + nombre enviados');
  ok(r.url === 'https://i.ibb.co/abc123/logo.png' && r.thumb_url === 'https://i.ibb.co/thumb/logo.png', 'contrato: url + thumb_url');
  ok(r.delete_url === 'https://ibb.co/abc123/deletehash' && r.imgbb_id === 'abc123', 'contrato: delete_url + imgbb_id');
  ok(r.mime === 'image/png' && r.tamano === 68 && r.ancho === 1 && r.alto === 1, 'contrato: mime/tamaño/dimensiones');

  modo = 'rechazo';
  err = null; try { await svc.subir(PNG, 'x'); } catch (e) { err = e; }
  ok(err && err.statusCode === 502 && /Invalid API v1 key/.test(err.message), 'rechazo de ImgBB → 502 con el motivo');

  modo = 'caido';
  err = null; try { await svc.subir(PNG, 'x'); } catch (e) { err = e; }
  ok(err && err.statusCode === 502 && err.code === 'imgbb_red', 'ImgBB inalcanzable → 502 imgbb_red');

  stub.close();
  console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ media OK');
  process.exit(fallos ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
