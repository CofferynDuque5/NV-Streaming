'use client';

import { formatearMonto, type IntentoPagoPublico } from '@nv/shared';
import clsx from 'clsx';
import {
  CircleCheckBig,
  CircleSlash,
  CircleX,
  Clock,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton, BotonEnlace } from '@/componentes/ui/boton';
import { type ErrorLlamada, llamarApi } from '@/lib/api-cliente';
import { nombrePasarela } from '@/lib/pagos-en-linea';

const CONSULTAS_MAXIMAS = 6;
const ESPERA_MS = 2_500;

type Fase = { tipo: 'confirmando' } | { tipo: 'listo'; intento: IntentoPagoPublico };

const ABIERTOS = new Set(['creado', 'pendiente']);

/**
 * Vuelta desde la pasarela: manda a la API todo lo que la pasarela puso en la
 * URL para que confirme el pago y, si aún está pendiente, consulta unas veces más.
 */
export function RetornoPago({
  intentoId,
  parametros,
}: {
  intentoId: string;
  parametros: Record<string, string>;
}) {
  const [fase, setFase] = useState<Fase>({ tipo: 'confirmando' });
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [consultas, setConsultas] = useState(0);
  const [consultando, setConsultando] = useState(false);
  const enviado = useRef(false);

  const consultar = useCallback(async () => {
    setConsultando(true);
    const r = await llamarApi<IntentoPagoPublico>('GET', `/mi/pagos-en-linea/${intentoId}`);
    setConsultando(false);
    setConsultas((n) => n + 1);
    if (r.ok) {
      setError(null);
      setFase({ tipo: 'listo', intento: r.datos });
    } else setError(r.error);
  }, [intentoId]);

  // Confirmación inicial (una sola vez, también con el doble montaje del modo estricto).
  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    void (async () => {
      // Si el cliente canceló en la pasarela, se cancela el intento (la API comprueba antes
      // con la pasarela: si el pago sí se hizo, vuelve aprobado).
      const r =
        parametros.cancelado === '1'
          ? await llamarApi<IntentoPagoPublico>('POST', `/mi/pagos-en-linea/${intentoId}/cancelar`)
          : await llamarApi<IntentoPagoPublico>('POST', `/mi/pagos-en-linea/${intentoId}/retorno`, {
              parametros,
            });
      if (r.ok && r.datos?.estado) setFase({ tipo: 'listo', intento: r.datos });
      else if (r.ok) await consultar();
      else {
        setError(r.error);
        // Aunque la confirmación falle, puede que el aviso de la pasarela ya lo resolviera.
        await consultar();
      }
    })();
  }, [intentoId, parametros, consultar]);

  // Pendiente: vuelve a preguntar unas cuantas veces.
  const pendiente = fase.tipo === 'listo' && ABIERTOS.has(fase.intento.estado);
  useEffect(() => {
    if (!pendiente || consultas >= CONSULTAS_MAXIMAS) return;
    const t = setTimeout(() => void consultar(), ESPERA_MS);
    return () => clearTimeout(t);
  }, [pendiente, consultas, consultar]);

  if (fase.tipo === 'confirmando' && error && consultas > 0) {
    return (
      <Panel icono={CircleX} tono="peligro" titulo="No pudimos confirmar el pago">
        <p>{error.mensaje}</p>
        <p className="mt-2">
          Si la pasarela te cobró, el pago se registrará solo en unos minutos. Revisa tus facturas
          antes de volver a pagar.
        </p>
        <Acciones>
          <BotonEnlace href="/cuenta/facturas">Facturas y pagos</BotonEnlace>
        </Acciones>
      </Panel>
    );
  }

  if (fase.tipo === 'confirmando') {
    return (
      <Panel icono={LoaderCircle} tono="marca" girar titulo="Confirmando tu pago…">
        Estamos consultando el resultado con la pasarela. No cierres esta página.
      </Panel>
    );
  }

  const i = fase.intento;
  const factura = `/cuenta/facturas/${i.facturaId}`;
  const monto = formatearMonto(i.monto, i.moneda);
  const pasarela = nombrePasarela(i.pasarela);

  if (i.estado === 'aprobado') {
    return (
      <Panel icono={CircleCheckBig} tono="exito" titulo="¡Pago aprobado!">
        <p>
          Recibimos {monto} con {pasarela} (código {i.referencia}). Tu factura quedó pagada y el
          servicio se activa o renueva al momento. Te enviamos el comprobante por correo.
        </p>
        {i.guardarMetodo && (
          <Alerta tono="info" titulo="Guardamos tu método de pago" className="mt-4 text-left">
            Quedó autorizado para cobros automáticos. Actívalo en las suscripciones que quieras
            desde «Mis servicios», o revócalo cuando quieras en «Mis métodos de pago».
          </Alerta>
        )}
        <Acciones>
          <BotonEnlace href={factura}>Ver la factura</BotonEnlace>
          {i.guardarMetodo && (
            <BotonEnlace href="/cuenta/metodos-pago" variante="secundario">
              Mis métodos de pago
            </BotonEnlace>
          )}
          <BotonEnlace href="/cuenta" variante="secundario">
            Mis servicios
          </BotonEnlace>
        </Acciones>
      </Panel>
    );
  }

  if (ABIERTOS.has(i.estado)) {
    const agotado = consultas >= CONSULTAS_MAXIMAS;
    return (
      <Panel
        icono={agotado ? Clock : LoaderCircle}
        girar={!agotado}
        tono="aviso"
        titulo="Tu pago está pendiente"
      >
        <p>
          {pasarela} aún no confirma el pago de {monto}.{' '}
          {agotado
            ? 'Algunas formas de pago tardan unos minutos. Te avisaremos por correo en cuanto se confirme; no hace falta que pagues otra vez.'
            : 'Lo estamos consultando de nuevo…'}
        </p>
        <Acciones>
          {agotado && (
            <Boton
              variante="secundario"
              cargando={consultando}
              onClick={() => {
                setConsultas(CONSULTAS_MAXIMAS - 1);
                void consultar();
              }}
            >
              Consultar de nuevo
            </Boton>
          )}
          <BotonEnlace href={factura} variante={agotado ? 'primario' : 'secundario'}>
            Volver a la factura
          </BotonEnlace>
        </Acciones>
      </Panel>
    );
  }

  if (i.estado === 'rechazado') {
    return (
      <Panel icono={CircleX} tono="peligro" titulo="El pago fue rechazado">
        <p>
          {i.error ??
            `${pasarela} no aprobó el pago de ${monto}. No se te cobró nada por este intento.`}
        </p>
        <p className="mt-2">
          Puedes intentarlo de nuevo con otra tarjeta o cuenta, o pagar por transferencia y enviar
          el comprobante.
        </p>
        <Acciones>
          <BotonEnlace href={factura}>Volver a intentarlo</BotonEnlace>
          <BotonEnlace href="/cuenta/soporte/nueva" variante="secundario">
            Pedir ayuda
          </BotonEnlace>
        </Acciones>
      </Panel>
    );
  }

  return (
    <Panel
      icono={CircleSlash}
      tono="neutro"
      titulo={i.estado === 'expirado' ? 'El enlace de pago expiró' : 'Cancelaste el pago'}
    >
      <p>
        No se te cobró nada. La factura sigue pendiente: puedes pagarla en línea otra vez o por
        transferencia cuando quieras.
      </p>
      <Acciones>
        <BotonEnlace href={factura}>Volver a la factura</BotonEnlace>
      </Acciones>
    </Panel>
  );
}

const TONOS = {
  marca: 'bg-marca-suave text-marca border-marca/25',
  exito: 'bg-exito-suave text-exito border-exito/25',
  aviso: 'bg-aviso-suave text-aviso border-aviso/25',
  peligro: 'bg-peligro-suave text-peligro border-peligro/25',
  neutro: 'bg-hundida text-tinta-suave border-borde',
};

function Panel({
  icono: Icono,
  tono,
  girar,
  titulo,
  children,
}: {
  icono: LucideIcon;
  tono: keyof typeof TONOS;
  girar?: boolean;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div
      className="grid justify-items-center gap-4 px-5 py-10 text-center sm:px-10"
      role="status"
      aria-live="polite"
    >
      <span className={clsx('grid size-14 place-items-center rounded-2xl border', TONOS[tono])}>
        <Icono className={clsx('size-6', girar && 'animate-spin')} aria-hidden="true" />
      </span>
      <h2 className="text-xl font-semibold">{titulo}</h2>
      <div className="grid max-w-lg gap-0 text-sm text-tinta-suave">{children}</div>
    </div>
  );
}

function Acciones({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>;
}
