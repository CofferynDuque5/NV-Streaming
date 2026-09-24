'use client';

import { DESCUENTO_MAXIMO_VENTAS, type PlanPublico, type TipoCupon } from '@nv/shared';
import { Plus, Power, PowerOff } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { Casilla, Selector } from '@/componentes/ui/selector';
import { formatearDuracion } from '@/lib/formato';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from './piezas';

/** Fecha de un `<input type="date">` al inicio o al final de ese día, en hora local. */
function fechaLocal(valor: string | undefined, finDelDia: boolean): string | undefined {
  if (!valor) return undefined;
  const d = new Date(`${valor}T${finDelDia ? '23:59:59' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function NuevoCupon({ planes, esVentas }: { planes: PlanPublico[]; esVentas: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [tipo, setTipo] = useState<TipoCupon>('porcentaje');
  const [creado, setCreado] = useState<string | null>(null);
  const { cargando, error, campos, ejecutar } = useAccion();

  // Planes agrupados por servicio para las casillas.
  const grupos = new Map<string, PlanPublico[]>();
  for (const p of planes)
    grupos.set(p.servicio.nombre, [...(grupos.get(p.servicio.nombre) ?? []), p]);
  const errorPlanes =
    campos.planIds ?? Object.entries(campos).find(([k]) => k.startsWith('planIds.'))?.[1];

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formulario = e.currentTarget;
    const d = new FormData(formulario);
    const r = await ejecutar('POST', '/cupones', {
      codigo: codigo.trim(),
      tipo,
      valor: textoDe(d, 'valor') ?? '',
      validoDesde: fechaLocal(textoDe(d, 'validoDesde'), false),
      validoHasta: fechaLocal(textoDe(d, 'validoHasta'), true),
      usosMaximos: textoDe(d, 'usosMaximos'),
      soloAltas: d.get('soloAltas') === 'on',
      planIds: d.getAll('planIds').map(String),
    });
    if (r) {
      setCreado(codigo.trim());
      setCodigo('');
      formulario.reset();
      setTipo('porcentaje');
    }
  }

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)} icono={<Plus className="size-4" />}>
        Nuevo cupón
      </Boton>
    );
  }

  return (
    <PanelFormulario
      titulo="Nuevo cupón"
      descripcion="El descuento se aplica al crear la factura. Los montos fijos se indican en USD y se convierten con la tasa del día."
      onCerrar={() => {
        setAbierto(false);
        setCreado(null);
      }}
    >
      {esVentas && (
        <Alerta tono="info" className="mb-5">
          Como parte de ventas puedes crear cupones de porcentaje de hasta {DESCUENTO_MAXIMO_VENTAS}{' '}
          % y siempre debes indicar cuántas veces se pueden usar. Para descuentos mayores, pídelo a
          administración.
        </Alerta>
      )}
      <form onSubmit={enviar} className="grid gap-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            etiqueta="Código"
            name="codigo"
            required
            value={codigo}
            onChange={(e) => setCodigo(e.currentTarget.value.toUpperCase().replace(/\s/g, ''))}
            placeholder="BIENVENIDA10"
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            ayuda="Letras, números, guiones. 3 a 40."
            error={campos.codigo}
          />
          {esVentas ? (
            <div className="grid content-start gap-1.5">
              <span className="text-sm font-medium">Tipo</span>
              <p className="flex h-11 items-center rounded-xl border border-borde bg-hundida px-3.5 text-[0.95rem] text-tinta-suave">
                Porcentaje
              </p>
            </div>
          ) : (
            <Selector
              etiqueta="Tipo"
              name="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.currentTarget.value as TipoCupon)}
              error={campos.tipo}
            >
              <option value="porcentaje">Porcentaje</option>
              <option value="monto">Monto fijo en USD</option>
            </Selector>
          )}
          <Campo
            etiqueta={tipo === 'porcentaje' ? 'Descuento (%)' : 'Descuento (USD)'}
            name="valor"
            inputMode="decimal"
            required
            placeholder={tipo === 'porcentaje' ? '10' : '5.00'}
            ayuda={
              tipo === 'porcentaje'
                ? esVentas
                  ? `Máximo ${DESCUENTO_MAXIMO_VENTAS} %.`
                  : 'Entre 1 y 100.'
                : 'Se descuenta del total en USD.'
            }
            error={campos.valor}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Campo
            etiqueta="Válido desde (opcional)"
            name="validoDesde"
            type="date"
            error={campos.validoDesde}
          />
          <Campo
            etiqueta="Válido hasta (opcional)"
            name="validoHasta"
            type="date"
            ayuda="Incluye todo ese día."
            error={campos.validoHasta}
          />
          <Campo
            etiqueta={esVentas ? 'Usos máximos' : 'Usos máximos (opcional)'}
            name="usosMaximos"
            type="number"
            min={1}
            max={100000}
            required={esVentas}
            ayuda={esVentas ? 'Obligatorio para ventas.' : 'Vacío: sin límite.'}
            error={campos.usosMaximos}
          />
        </div>

        <Casilla
          name="soloAltas"
          defaultChecked
          etiqueta="Solo para altas"
          ayuda="No se aplica a las renovaciones."
        />

        <fieldset className="grid gap-3 rounded-xl border border-borde bg-hundida/50 p-4">
          <legend className="px-1 text-sm font-medium">Planes</legend>
          <p className="text-xs text-tinta-tenue">
            Si no marcas ninguno, el cupón vale para todos los planes.
          </p>
          {planes.length === 0 ? (
            <p className="text-sm text-tinta-suave">No hay planes en el catálogo.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {[...grupos].map(([servicio, lista]) => (
                <div key={servicio} className="grid content-start gap-2">
                  <p className="text-xs font-semibold tracking-wide text-tinta-tenue uppercase">
                    {servicio}
                  </p>
                  {lista.map((p) => (
                    <Casilla
                      key={p.id}
                      name="planIds"
                      value={p.id}
                      etiqueta={p.nombre}
                      ayuda={`${formatearDuracion(p.duracionCantidad, p.duracionUnidad)}${p.activo ? '' : ' · inactivo'}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
          {errorPlanes && <p className="text-xs font-medium text-peligro">{errorPlanes}</p>}
        </fieldset>

        <ErrorGeneral error={error} />
        {creado && !error && (
          <Alerta tono="exito">
            Cupón <span className="font-mono">{creado}</span> creado y activo.
          </Alerta>
        )}
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={cargando}>
            Crear cupón
          </Boton>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cerrar
          </Boton>
        </div>
      </form>
    </PanelFormulario>
  );
}

/** Activa o desactiva un cupón. */
export function InterruptorCupon({
  id,
  codigo,
  activo,
}: {
  id: string;
  codigo: string;
  activo: boolean;
}) {
  const { cargando, error, ejecutar } = useAccion();
  return (
    <div className="grid justify-items-end gap-1">
      <Boton
        tamano="sm"
        variante={activo ? 'fantasma' : 'secundario'}
        cargando={cargando}
        icono={activo ? <PowerOff className="size-3.5" /> : <Power className="size-3.5" />}
        onClick={() => void ejecutar('POST', `/cupones/${id}/${activo ? 'desactivar' : 'activar'}`)}
        aria-label={`${activo ? 'Desactivar' : 'Activar'} el cupón ${codigo}`}
      >
        {activo ? 'Desactivar' : 'Activar'}
      </Boton>
      {error && <p className="max-w-48 text-right text-xs text-peligro">{error.mensaje}</p>}
    </div>
  );
}
