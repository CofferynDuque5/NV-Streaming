'use client';

import { INFO_MONEDA, MONEDAS, type Moneda } from '@nv/shared';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Casilla, Selector } from '@/componentes/ui/selector';
import { type ErrorLlamada, erroresPorCampo, llamarApi } from '@/lib/api-cliente';

const PAISES: Record<string, string> = {
  VE: 'Venezuela',
  AR: 'Argentina',
  CO: 'Colombia',
  PE: 'Perú',
  ES: 'España',
  CL: 'Chile',
  EC: 'Ecuador',
  MX: 'México',
  PA: 'Panamá',
  DO: 'República Dominicana',
  US: 'Estados Unidos',
};

export interface DatosFacturacionIniciales {
  documento: string | null;
  pais: string | null;
  monedaPreferida: Moneda;
  whatsapp: string | null;
  aceptaWhatsapp: boolean;
}

/** Datos que el cliente mantiene para sus facturas y avisos. */
export function DatosFacturacion({ inicial }: { inicial: DatosFacturacionIniciales }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<ErrorLlamada | null>(null);
  const [guardado, setGuardado] = useState(false);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setCargando(true);
    setError(null);
    setGuardado(false);
    const r = await llamarApi('PATCH', '/mi/perfil', {
      documento: String(d.get('documento') ?? ''),
      pais: String(d.get('pais') ?? ''),
      monedaPreferida: String(d.get('monedaPreferida')),
      whatsapp: String(d.get('whatsapp') ?? ''),
      aceptaWhatsapp: d.get('aceptaWhatsapp') === 'on',
    });
    setCargando(false);
    if (!r.ok) return setError(r.error);
    setGuardado(true);
    router.refresh();
  }

  const campos = erroresPorCampo(error);
  const paises =
    inicial.pais && !PAISES[inicial.pais] ? { ...PAISES, [inicial.pais]: inicial.pais } : PAISES;

  return (
    <form onSubmit={guardar} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          etiqueta="Documento de identidad o RIF"
          name="documento"
          defaultValue={inicial.documento ?? ''}
          maxLength={40}
          autoComplete="off"
          error={campos.documento}
          ayuda="Opcional. Aparece en tus facturas."
        />
        <Selector etiqueta="País" name="pais" defaultValue={inicial.pais ?? ''} error={campos.pais}>
          <option value="">Sin indicar</option>
          {Object.entries(paises).map(([codigo, nombre]) => (
            <option key={codigo} value={codigo}>
              {nombre}
            </option>
          ))}
        </Selector>
        <Selector
          etiqueta="Moneda en la que prefieres pagar"
          name="monedaPreferida"
          defaultValue={inicial.monedaPreferida}
          error={campos.monedaPreferida}
        >
          {MONEDAS.map((m) => (
            <option key={m} value={m}>
              {INFO_MONEDA[m].nombre} ({m})
            </option>
          ))}
        </Selector>
        <Campo
          etiqueta="WhatsApp"
          name="whatsapp"
          type="tel"
          defaultValue={inicial.whatsapp ?? ''}
          placeholder="+58 412 0000000"
          autoComplete="tel"
          error={campos.whatsapp}
        />
      </div>
      <Casilla
        name="aceptaWhatsapp"
        defaultChecked={inicial.aceptaWhatsapp}
        etiqueta="Acepto recibir avisos de pagos y vencimientos por WhatsApp"
        ayuda="Puedes retirar tu permiso cuando quieras desmarcando esta casilla."
      />
      {error && !error.campos && <Alerta tono="peligro">{error.mensaje}</Alerta>}
      {guardado && <Alerta tono="exito">Guardamos tus datos.</Alerta>}
      <Boton type="submit" cargando={cargando} className="sm:justify-self-start">
        Guardar datos
      </Boton>
    </form>
  );
}
