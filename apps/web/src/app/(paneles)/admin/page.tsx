import {
  ETIQUETAS_ROL,
  limitadoACartera,
  type MetricasPanel,
  type Pagina,
  type Permiso,
  type RegistroAuditoria,
} from '@nv/shared';
import { X } from 'lucide-react';
import type { Metadata } from 'next';
import { Aviso } from '@/componentes/cliente/piezas-cuenta';
import {
  Actividad,
  AvisosCentro,
  CabeceraCentro,
  EstadoSistema,
  EsteMes,
  ParaAtender,
  PorEstado,
  Proximos,
} from '@/componentes/equipo/centro';
import { Modulos } from '@/componentes/equipo/modulos';
import { leerApi } from '@/lib/api-servidor';
import { colaEquipo, estadoModulo, pendientesPorModulo } from '@/lib/equipo';
import { GRUPOS_EQUIPO, modulosDe } from '@/lib/navegacion';
import { leerCentro } from '@/lib/panel-equipo';
import { requerirSesion } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Centro de módulos' };

/**
 * Centro de módulos del equipo: lo que espera por atender, las cifras del mes,
 * los módulos del rol, lo que vence, la actividad y el estado del sistema.
 * Todo sale de la API con los permisos de quien entra (ventas, su cartera).
 */
export default async function CentroModulos() {
  const sesion = await requerirSesion();
  const { usuario, permisos } = sesion;
  const puede = (p: Permiso) => permisos.includes(p);
  const [centro, metricas, actividad] = await Promise.all([
    leerCentro(),
    puede('metricas.ver')
      ? leerApi<MetricasPanel>('/metricas/panel').then((r) => r.datos)
      : Promise.resolve(null),
    puede('auditoria.ver')
      ? leerApi<Pagina<RegistroAuditoria>>('/auditoria?porPagina=6').then(
          (r) => r.datos?.elementos ?? [],
        )
      : Promise.resolve(null),
  ]);
  const nombre = usuario.nombre.split(' ')[0]!;
  const rol = ETIQUETAS_ROL[usuario.rol];

  if (!centro) {
    return (
      <>
        <CabeceraCentro nombre={nombre} rol={rol} />
        <Aviso
          tono="peligro"
          icono={<X className="size-4" aria-hidden="true" />}
          titulo="No pudimos cargar el centro"
        >
          Recarga la página en unos segundos.
        </Aviso>
      </>
    );
  }

  const items = colaEquipo(centro, limitadoACartera(usuario.rol));
  const pendientes = pendientesPorModulo(items);
  const modulos = modulosDe(permisos).map((m) => ({
    clave: m.clave,
    grupo: m.grupo,
    nombre: m.nombre,
    descripcion: m.descripcion,
    color: m.color,
    href: m.href,
    estado: estadoModulo(m.clave, centro, metricas),
    pendientes: pendientes[m.clave] ?? 0,
  }));

  return (
    <>
      <CabeceraCentro nombre={nombre} rol={rol} />
      <AvisosCentro centro={centro} puede={puede} />
      <ParaAtender centro={centro} items={items} />
      {metricas && <EsteMes m={metricas} />}
      <Modulos modulos={modulos} grupos={GRUPOS_EQUIPO} />
      {metricas && (
        <div className="grid gap-5.5 min-[68.75rem]:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <Proximos
            suscripciones={metricas.proximosVencimientos}
            puedeVer={puede('suscripciones.ver')}
          />
          <PorEstado estados={metricas.suscripcionesPorEstado} />
        </div>
      )}
      {actividad && <Actividad registros={actividad} />}
      <EstadoSistema centro={centro} />
    </>
  );
}
