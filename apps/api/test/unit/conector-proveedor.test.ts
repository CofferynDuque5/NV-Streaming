import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  accionesDelProveedor,
  enlaceAprobacion,
  esDelProveedor,
} from '../../src/codigos/conector.service.js';
import {
  leerRespuestaProveedor,
  tapar,
  textosDeJson,
} from '../../src/codigos/extraer-proveedor.js';
import { ErrorRobot, RobotProveedor } from '../../src/codigos/robot-proveedor.js';

const HOST = 'ikercuentas.com';

describe('respuesta del panel del proveedor', () => {
  it('lee el aviso «Código 4 dígitos: 5090» del botón Code', () => {
    expect(leerRespuestaProveedor('code', ['Código 4 dígitos: 5090'], HOST)).toEqual({
      codigo: '5090',
      enlace: null,
      mensaje: null,
    });
  });

  it('Code6 exige 6 dígitos', () => {
    expect(leerRespuestaProveedor('code6', ['Code6: 482 913'], HOST).codigo).toBe('482913');
    expect(leerRespuestaProveedor('code6', ['Código: 5090'], HOST).codigo).toBeNull();
  });

  it('Link devuelve el enlace de Netflix, no los del propio panel', () => {
    const r = leerRespuestaProveedor(
      'link',
      [
        'https://ikercuentas.com/assets/app.js',
        'Enlace: https://www.netflix.com/password?g=abc&lnktrk=EMP',
      ],
      HOST,
    );
    expect(r.enlace).toEqual({
      url: 'https://www.netflix.com/password?g=abc&lnktrk=EMP',
      tipo: 'restablecer',
    });
  });

  it('Hogar acepta código o enlace', () => {
    expect(
      leerRespuestaProveedor('hogar', ['https://www.max.com/travel/verify?t=1'], HOST).enlace?.tipo,
    ).toBe('hogar');
    expect(leerRespuestaProveedor('hogar', ['Código: 123456'], HOST).codigo).toBe('123456');
  });

  it('el último aviso manda y se informa cuando no hay código', () => {
    expect(leerRespuestaProveedor('sobre', ['Código: 1111', 'Código: 2222'], HOST).codigo).toBe(
      '2222',
    );
    expect(
      leerRespuestaProveedor('sobre', ['No se encontraron códigos recientes'], HOST).mensaje,
    ).toBe('No se encontraron códigos recientes');
    expect(leerRespuestaProveedor('code', ['Cargando…'], HOST)).toEqual({
      codigo: null,
      enlace: null,
      mensaje: null,
    });
  });

  it('del JSON solo toma claves útiles, no listados', () => {
    expect(textosDeJson('{"ok":true,"code":"5090"}')).toEqual(['5090']);
    expect(textosDeJson('{"data":{"message":"Código: 4411"}}')).toEqual(['Código: 4411']);
    expect(
      textosDeJson(JSON.stringify({ cuentas: [1, 2, 3, 4, 5, 6].map((n) => ({ code: n })) })),
    ).toEqual([]);
    expect(textosDeJson('<html>')).toEqual([]);
  });

  it('tapa números, correos y enlaces al guardar el diagnóstico', () => {
    expect(tapar('Código 4 dígitos: 5090 para ana@gmail.com https://x.com/a')).toBe(
      'Código 4 dígitos: ••• para •••@•••',
    );
  });
});

describe('aprobación de IP y cuentas del proveedor', () => {
  it('solo acepta enlaces approve-ip del panel', () => {
    const base = 'https://ikercuentas.com';
    expect(
      enlaceAprobacion(
        '<a href="https://ikercuentas.com/api/auth/approve-ip?token=abc&amp;x=1">Aprobar</a>',
        base,
      ),
    ).toBe('https://ikercuentas.com/api/auth/approve-ip?token=abc&x=1');
    expect(enlaceAprobacion('https://evil.com/api/auth/approve-ip?token=abc', base)).toBeNull();
    expect(enlaceAprobacion('https://ikercuentas.com/otra?token=abc', base)).toBeNull();
    expect(
      enlaceAprobacion('https://ikercuentas.com.evil.com/api/auth/approve-ip?t=1', base),
    ).toBeNull();
  });

  it('reconoce las cuentas por el campo «Proveedor»', () => {
    expect(esDelProveedor('Iker Cuentas', 'iker')).toBe(true);
    expect(esDelProveedor('ikercuentas.com', 'Iker')).toBe(true);
    expect(esDelProveedor('Otro', 'Iker')).toBe(false);
    expect(esDelProveedor(null, 'Iker')).toBe(false);
  });

  it('botones según la plataforma y lo que el negocio permite a clientes', () => {
    const conector = {
      activo: true,
      marcaProveedor: 'Iker',
      accionesCliente: ['code', 'code6', 'link', 'sobre', 'hogar'],
    };
    const cuenta = (nombre: string, proveedor: string | null = 'Iker') => ({
      proveedor,
      servicio: { nombre },
    });
    expect(accionesDelProveedor(conector, cuenta('Netflix Individual'))).toEqual([
      'code',
      'code6',
      'link',
    ]);
    expect(accionesDelProveedor(conector, cuenta('Disney+ Premium'))).toEqual(['sobre']);
    expect(accionesDelProveedor(conector, cuenta('HBO Max'))).toEqual(['sobre', 'hogar']);
    expect(accionesDelProveedor(conector, cuenta('Spotify'))).toEqual([]);
    expect(accionesDelProveedor(conector, cuenta('Netflix', 'Otro'))).toEqual([]);
    expect(
      accionesDelProveedor({ ...conector, activo: false }, cuenta('Netflix Individual')),
    ).toEqual([]);
    expect(
      accionesDelProveedor({ ...conector, accionesCliente: ['code'] }, cuenta('Netflix')),
    ).toEqual(['code']);
  });
});

// ── Navegador real contra un panel falso ─────────────────────────────────────

const NAVEGADOR = [
  process.env['NAVEGADOR_PRUEBAS'],
  '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
].find((r) => r && existsSync(r));

/** Panel parecido al de ikercuentas: acceso, aprobación de IP, «#cuentas» y «#plataformas». */
function panelFalso() {
  const estado = { ipAprobada: false, sesion: 'cookie-buena' };
  const pagina = `<!doctype html><html><body>
<div id="app"></div>
<script>
const logueado = document.cookie.includes('sesion=cookie-buena');
const app = document.getElementById('app');
function toast(t){const d=document.createElement('div');d.setAttribute('data-sonner-toast','');d.textContent=t;document.body.appendChild(d);}
function fila(correo, botones){
  return '<tr><td><span title="'+correo+'">'+correo.slice(0,8)+'…</span></td><td>'+botones+'</td></tr>';
}
function cuentas(){
  app.innerHTML = '<h1>Cuentas</h1><input placeholder="Buscar por email..." id="q"><table><tbody id="t"></tbody></table>';
  const datos=[['ana@platonuma.com'],['luis@platonuma.com']];
  const pintar=()=>{const q=document.getElementById('q').value;document.getElementById('t').innerHTML=datos.filter(d=>!q||d[0].includes(q)).map(d=>fila(d[0],
    '<button>Code</button><button>Code6</button><button>Link</button><button>Pais</button><button>ActivarTV</button><button>Renovar</button>')).join('');};
  document.getElementById('q').addEventListener('input',pintar);pintar();
  document.getElementById('t').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
    const r=await fetch('/api/accion?b='+b.textContent).then(r=>r.json());toast(r.message);});
}
function plataformas(){
  app.innerHTML = '<h1>Plataformas</h1><button>Disney+</button><button>HBO Max</button><button>Spotify</button><input placeholder="Buscar por email..." id="q"><table><tbody id="t"></tbody></table>';
  app.querySelectorAll('h1 ~ button').forEach(b=>b.addEventListener('click',()=>{
    document.getElementById('t').innerHTML = b.textContent==='HBO Max'
      ? '<tr><td>max@platonuma.com</td><td><button title="Ver código"><svg class="lucide-mail"></svg></button><button>Hogar</button><button>Renovar</button></td></tr>'
      : '<tr><td>dis@platonuma.com</td><td><button><svg class="lucide-mail"></svg></button><button>Renovar</button></td></tr>';
  }));
  document.getElementById('t').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    setTimeout(()=>toast(b.textContent==='Hogar'?'Enlace: https://www.max.com/travel/verify?t=9':'Código de acceso: 778899'),300);});
}
if(!logueado){
  app.innerHTML='<h1>Panel VIP</h1><form id="f"><input type="email" name="email"><input type="password" name="p"><button type="submit">Entrar</button></form><p id="m"></p>';
  document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();
    const r=await fetch('/api/login',{method:'POST',body:new FormData(e.target)}).then(r=>r.json());
    if(r.ok){location.reload();} else document.getElementById('m').textContent=r.message;});
} else {
  const nav='<nav><a href="#cuentas">Cuentas</a><a href="#plataformas">Plataformas</a></nav>';
  const ruta=()=>{ (location.hash==='#plataformas'?plataformas:cuentas)(); app.insertAdjacentHTML('afterbegin',nav); };
  window.addEventListener('hashchange',ruta); ruta();
}
</script></body></html>`;
  const servidor = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/api/login') {
      let cuerpo = '';
      req.on('data', (c) => (cuerpo += c));
      req.on('end', () => {
        const bien = cuerpo.includes('nathan@ejemplo.com') && cuerpo.includes('clave-secreta');
        res.setHeader('content-type', 'application/json');
        if (!bien)
          return res.end(JSON.stringify({ ok: false, message: 'Credenciales incorrectas' }));
        if (!estado.ipAprobada) {
          return res.end(
            JSON.stringify({
              ok: false,
              message:
                'Nuevo dispositivo detectado. Revisa tu correo y aprueba la IP para continuar.',
            }),
          );
        }
        res.setHeader('set-cookie', `sesion=${estado.sesion}; Path=/`);
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    if (url.pathname === '/api/auth/approve-ip') {
      estado.ipAprobada = url.searchParams.get('token') === 'tok123';
      return res.end('IP aprobada');
    }
    if (url.pathname === '/api/accion') {
      const b = url.searchParams.get('b');
      const message =
        b === 'Code'
          ? 'Código 4 dígitos: 5090'
          : b === 'Code6'
            ? 'Código 6 dígitos: 123456'
            : 'Enlace: https://www.netflix.com/password?g=zz';
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ ok: true, message }));
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(pagina);
  });
  return { servidor, estado };
}

describe.skipIf(!NAVEGADOR)('navegador automático contra un panel de prueba', () => {
  let servidor: Server;
  let estado: { ipAprobada: boolean };
  let base: string;
  const robot = new RobotProveedor();
  let sesion: string | null = null;
  let aprobaciones = 0;

  beforeAll(async () => {
    process.env['NAVEGADOR_RUTA'] = NAVEGADOR!;
    ({ servidor, estado } = panelFalso());
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await robot.onModuleDestroy();
    await new Promise((r) => servidor.close(r));
  });

  const pedido = (extra: Record<string, unknown> = {}) => ({
    urlBase: base,
    usuario: 'nathan@ejemplo.com',
    clave: 'clave-secreta',
    sesion,
    aprobar: async () => {
      aprobaciones++;
      return `${base}/api/auth/approve-ip?token=tok123`;
    },
    ...extra,
  });

  it('con clave mala avisa sin pedir aprobación', async () => {
    await expect(robot.entrar({ ...pedido(), clave: 'otra' })).rejects.toMatchObject({
      motivo: 'CREDENCIALES',
    });
    expect(aprobaciones).toBe(0);
  }, 60_000);

  it('aprueba la IP con el enlace del correo, entra y guarda la sesión', async () => {
    const r = await robot.entrar(pedido());
    expect(estado.ipAprobada).toBe(true);
    expect(aprobaciones).toBe(1);
    expect(r.sesion).toContain('cookie-buena');
    sesion = r.sesion;
  }, 60_000);

  it('Netflix: busca el correo y pulsa Code, Code6 y Link', async () => {
    for (const [accion, esperado] of [
      ['code', 'Código 4 dígitos: 5090'],
      ['code6', 'Código 6 dígitos: 123456'],
      ['link', 'https://www.netflix.com/password?g=zz'],
    ] as const) {
      const r = await robot.pulsar({
        ...pedido(),
        correoCuenta: 'luis@platonuma.com',
        plataforma: 'netflix',
        accion,
      });
      expect(r.textos.join('\n')).toContain(esperado);
      expect(r.diagnostico.botones).toContain('Code6');
    }
    expect(aprobaciones).toBe(1);
  }, 120_000);

  it('Disney (sobre) y HBO (sobre y Hogar) desde Plataformas', async () => {
    const disney = await robot.pulsar({
      ...pedido(),
      correoCuenta: 'dis@platonuma.com',
      plataforma: 'disney',
      accion: 'sobre',
    });
    expect(leerRespuestaProveedor('sobre', disney.textos, '127.0.0.1').codigo).toBe('778899');
    const hogar = await robot.pulsar({
      ...pedido(),
      correoCuenta: 'max@platonuma.com',
      plataforma: 'hbo',
      accion: 'hogar',
    });
    expect(leerRespuestaProveedor('hogar', hogar.textos, '127.0.0.1').enlace?.url).toBe(
      'https://www.max.com/travel/verify?t=9',
    );
  }, 120_000);

  it('una cuenta que no está en el panel', async () => {
    const e = await robot
      .pulsar({
        ...pedido(),
        correoCuenta: 'nadie@platonuma.com',
        plataforma: 'netflix',
        accion: 'code',
      })
      .catch((err: unknown) => err);
    expect(e).toBeInstanceOf(ErrorRobot);
    expect((e as ErrorRobot).motivo).toBe('NO_ENCONTRADA');
  }, 60_000);
});
