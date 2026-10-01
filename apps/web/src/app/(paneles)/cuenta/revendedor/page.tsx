import type { MiSolicitudRevendedor } from '@nv/shared';
import { Tag, UserRound, Wallet } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { LineaTiempo, PildoraEstado } from '@/componentes/cliente/pago';
import { CabeceraCuenta, claseCaja, fechaLarga, PAISES } from '@/componentes/cliente/piezas-cuenta';
import { SolicitudRevendedor } from '@/componentes/cliente/revendedor-cuenta';
import { Alerta } from '@/componentes/ui/alerta';
import { leerApi } from '@/lib/api-servidor';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Ser revendedor' };

const VENTAJAS = [
  {
    icono: Tag,
    color: '#22c55e',
    titulo: 'Precio mayorista',
    texto: 'Compras los planes revendibles con el precio de tu nivel.',
  },
  {
    icono: Wallet,
    color: '#4f8dff',
    titulo: 'Pagas con tu saldo',
    texto: 'Recargas una vez y compras para tus clientes al momento.',
  },
  {
    icono: UserRound,
    color: '#a855f7',
    titulo: 'Tu propio panel',
    texto: 'Tu cartera de clientes y sus renovaciones, en un solo lugar.',
  },
];

function Ventajas() {
  return (
    <ul className="grid gap-2.5 md:grid-cols-3" aria-label="Qué obtienes">
      {VENTAJAS.map(({ icono: Icono, color, titulo, texto }) => (
        <li
          key={titulo}
          className="grid gap-1.5 rounded-[1.125rem] border border-borde bg-[rgb(10_14_32/0.6)] p-3.5"
        >
          <span
            className="orbe orbe-sm size-[2.375rem] after:hidden"
            style={{ '--c': color } as CSSProperties}
            aria-hidden="true"
          >
            <Icono className="size-4" />
          </span>
          <b className="text-[0.92rem]">{titulo}</b>
          <span className="text-[0.82rem] text-tinta-suave">{texto}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function SerRevendedor() {
  const sesion = await requerirSesion({ permiso: 'revendedor.solicitar' });
  const { datos, estado } = await leerApi<{ solicitud: MiSolicitudRevendedor | null }>(
    '/revendedor/solicitud',
  );
  const s = datos?.solicitud ?? null;

  if (s?.estado === 'solicitud') {
    return (
      <>
        <CabeceraCuenta
          titulo="Ser revendedor"
          descripcion="Vende servicios NV con precio mayorista."
        />
        <section aria-labelledby="titulo-revision" className={claseCaja}>
          <header className="flex flex-wrap items-center justify-between gap-2.5">
            <h2 id="titulo-revision" className="text-lg">
              Recibimos tu solicitud
            </h2>
            <PildoraEstado texto="En revisión" tono="cian" />
          </header>
          <p className="text-[0.9rem] text-tinta-suave">
            El equipo la revisa y te avisa a {sesion.usuario.correo}. Cuando la aprueben, vuelve a
            ingresar para ver tu panel de revendedor.
          </p>
          <LineaTiempo
            etiqueta="Estado de tu solicitud"
            pasos={[
              {
                estado: 'hecho',
                titulo: 'Solicitud enviada',
                texto: `${s.nombreComercial} · ${fechaLarga(s.creadoEn)}`,
              },
              {
                estado: 'ahora',
                titulo: 'El equipo la está revisando',
                texto: 'Verificamos tus datos',
              },
              {
                estado: 'luego',
                titulo: 'Cuenta de revendedor activa',
                texto: 'Ingresa de nuevo y verás tu panel',
              },
            ]}
          />
          <dl className="grid gap-3 border-t border-borde pt-3.5 text-sm sm:grid-cols-2">
            <Dato etiqueta="Negocio" valor={s.nombreComercial} />
            <Dato etiqueta="Documento" valor={s.documento} />
            <Dato etiqueta="Teléfono" valor={s.telefono} />
            <Dato etiqueta="País" valor={s.pais ? (PAISES[s.pais] ?? s.pais) : null} />
            {s.mensaje && (
              <div className="sm:col-span-2">
                <Dato etiqueta="Mensaje" valor={s.mensaje} />
              </div>
            )}
          </dl>
        </section>
      </>
    );
  }

  if (s?.estado === 'aprobado' || s?.estado === 'suspendido') {
    return (
      <>
        <CabeceraCuenta
          titulo="Ser revendedor"
          descripcion="Vende servicios NV con precio mayorista."
        />
        <section aria-labelledby="titulo-aprobada" className={claseCaja}>
          <header className="flex flex-wrap items-center justify-between gap-2.5">
            <h2 id="titulo-aprobada" className="text-lg">
              Tu solicitud fue aprobada
            </h2>
            <PildoraEstado
              texto={s.estado === 'aprobado' ? 'Aprobada' : 'Suspendida'}
              tono={s.estado === 'aprobado' ? 'exito' : 'aviso'}
            />
          </header>
          <p className="text-[0.9rem] text-tinta-suave">
            Cierra sesión y vuelve a entrar para abrir tu panel de revendedor.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <CabeceraCuenta
        titulo="Ser revendedor"
        descripcion="Vende servicios NV con precio mayorista y gestiona a tus clientes."
      />
      {!datos && estado !== 404 && (
        <Alerta tono="peligro">No pudimos cargar tu solicitud. Recarga la página.</Alerta>
      )}
      <Ventajas />
      {s?.estado === 'rechazado' && (
        <Alerta tono="aviso" titulo="Tu solicitud anterior no fue aprobada">
          {s.motivoEstado ? `Motivo: ${s.motivoEstado}. ` : ''}Puedes corregir los datos y enviarla
          otra vez.
        </Alerta>
      )}
      <SolicitudRevendedor previa={s} />
      <p className="text-[0.8rem] text-tinta-tenue">
        Tus servicios actuales como cliente se mantienen igual.
      </p>
    </>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-tinta-tenue">{etiqueta}</dt>
      <dd className="break-words">{valor || '—'}</dd>
    </div>
  );
}
