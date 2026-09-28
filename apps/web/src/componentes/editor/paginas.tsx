'use client';

import {
  type ContactoSitio,
  contactoSitioSchema,
  type PaginaSitioDetalle,
  PALETAS_SITIO,
  type PaletaSitio,
  type TemaSitio,
} from '@nv/shared';
import clsx from 'clsx';
import { Check, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { refrescarSitio } from '@/app/(paneles)/admin/sitio/acciones';
import { ErrorGeneral, PanelFormulario, textoDe, useAccion } from '@/componentes/admin/piezas';
import { Alerta } from '@/componentes/ui/alerta';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';

/** Alta de una página: ruta, título y descripción. Después se abre el editor. */
export function NuevaPagina() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const r = await ejecutar<PaginaSitioDetalle>('POST', '/sitio/paginas', {
      ruta: textoDe(d, 'ruta') ?? '',
      titulo: textoDe(d, 'titulo') ?? '',
      descripcion: textoDe(d, 'descripcion'),
    });
    if (r) router.push(`/admin/sitio/${r.datos.id}`);
  }

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)} icono={<Plus className="size-4" />}>
        Nueva página
      </Boton>
    );
  }
  return (
    <PanelFormulario
      titulo="Nueva página"
      descripcion="Empieza vacía y como borrador: nadie la verá hasta que se publique."
      onCerrar={() => setAbierto(false)}
    >
      <form onSubmit={enviar} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Ruta"
            name="ruta"
            required
            placeholder="/nosotros"
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            ayuda="Minúsculas, números y guiones. No puede usar rutas de la aplicación."
            error={campos.ruta}
          />
          <Campo
            etiqueta="Título"
            name="titulo"
            required
            maxLength={120}
            placeholder="Quiénes somos"
            error={campos.titulo}
          />
        </div>
        <Campo
          etiqueta="Descripción para buscadores (opcional)"
          name="descripcion"
          maxLength={300}
          error={campos.descripcion}
        />
        <ErrorGeneral error={error} />
        <div className="flex flex-wrap gap-2">
          <Boton type="submit" cargando={cargando}>
            Crear y editar
          </Boton>
          <Boton variante="fantasma" onClick={() => setAbierto(false)}>
            Cancelar
          </Boton>
        </div>
      </form>
    </PanelFormulario>
  );
}

/** Muestra de los colores de una paleta en el modo claro y el oscuro. */
export function MuestraPaleta({ paleta }: { paleta: PaletaSitio }) {
  const p = PALETAS_SITIO[paleta];
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[p.oscuro.marca, p.oscuro.acento, p.claro.marca, p.claro.acento].map((c, i) => (
        <span
          key={i}
          className="size-5 rounded-full border border-borde-fuerte"
          style={{ background: c }}
        />
      ))}
    </span>
  );
}

/** Elección de la paleta del sitio público (solo quien puede publicar). */
export function SelectorTema({ tema, puedeCambiar }: { tema: TemaSitio; puedeCambiar: boolean }) {
  const [elegida, setElegida] = useState<PaletaSitio>(tema.paleta);
  const [hecho, setHecho] = useState(false);
  const { cargando, error, ejecutar } = useAccion();
  const ids = Object.keys(PALETAS_SITIO) as PaletaSitio[];

  async function guardar() {
    setHecho(false);
    const r = await ejecutar('PUT', '/sitio/tema', { paleta: elegida });
    if (r) {
      await refrescarSitio();
      setHecho(true);
    }
  }

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" disabled={!puedeCambiar}>
        <legend className="sr-only">Paleta del sitio</legend>
        {ids.map((id) => {
          const p = PALETAS_SITIO[id];
          const activa = elegida === id;
          return (
            <label
              key={id}
              className={clsx(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-foco',
                activa ? 'border-marca bg-marca-suave' : 'border-borde hover:border-borde-fuerte',
                !puedeCambiar && 'cursor-default',
              )}
            >
              <input
                type="radio"
                name="paleta"
                value={id}
                checked={activa}
                onChange={() => {
                  setElegida(id);
                  setHecho(false);
                }}
                className="sr-only"
              />
              <span className="grid min-w-0 flex-1 gap-1.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{p.nombre}</span>
                  {tema.paleta === id && (
                    <span className="text-xs text-tinta-tenue">
                      <Check className="inline size-3.5" aria-hidden="true" /> En uso
                    </span>
                  )}
                </span>
                <MuestraPaleta paleta={id} />
                <span className="text-xs text-tinta-suave">{p.descripcion}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <ErrorGeneral error={error} />
      {hecho && <Alerta tono="exito">Paleta aplicada al sitio público.</Alerta>}
      {puedeCambiar ? (
        <Boton
          className="w-fit"
          onClick={guardar}
          cargando={cargando}
          disabled={elegida === tema.paleta}
        >
          Aplicar paleta
        </Boton>
      ) : (
        <p className="text-sm text-tinta-tenue">Solo administración puede cambiar la paleta.</p>
      )}
    </div>
  );
}

type CampoContacto = keyof ContactoSitio;

const CAMPOS_CONTACTO: {
  campo: CampoContacto;
  etiqueta: string;
  ayuda: string;
  tipo: 'tel' | 'url' | 'email';
  ejemplo: string;
}[] = [
  {
    campo: 'whatsapp',
    etiqueta: 'WhatsApp de soporte',
    ayuda: 'Con el código de país. Activa el botón de ayuda y los enlaces de WhatsApp.',
    tipo: 'tel',
    ejemplo: '58 414 000 0000',
  },
  {
    campo: 'canalWhatsapp',
    etiqueta: 'Canal de WhatsApp',
    ayuda: 'Enlace de invitación del canal. Sin él, la portada no muestra la sección del canal.',
    tipo: 'url',
    ejemplo: 'https://whatsapp.com/channel/…',
  },
  {
    campo: 'instagram',
    etiqueta: 'Instagram',
    ayuda: 'Enlace al perfil; aparece en el pie del sitio.',
    tipo: 'url',
    ejemplo: 'https://instagram.com/…',
  },
  {
    campo: 'tiktok',
    etiqueta: 'TikTok',
    ayuda: 'Enlace al perfil; aparece en el pie del sitio.',
    tipo: 'url',
    ejemplo: 'https://tiktok.com/@…',
  },
  {
    campo: 'correo',
    etiqueta: 'Correo de contacto',
    ayuda: 'Se muestra en el pie y en el botón de ayuda.',
    tipo: 'email',
    ejemplo: 'soporte@tudominio.com',
  },
];

/** Valida un solo campo de contacto con el mismo esquema que usa la API. */
function errorDeCampo(campo: CampoContacto, valor: string): string | undefined {
  const forma = contactoSitioSchema.shape[campo];
  const r = forma.safeParse(valor);
  return r.success ? undefined : r.error.issues[0]?.message;
}

/** Datos de contacto y redes del sitio público. Lo que queda vacío no se muestra. */
export function ContactoSitioFormulario({
  contacto,
  puedeCambiar,
}: {
  contacto: ContactoSitio;
  puedeCambiar: boolean;
}) {
  const inicial = Object.fromEntries(
    CAMPOS_CONTACTO.map(({ campo }) => [campo, contacto[campo] ?? '']),
  ) as Record<CampoContacto, string>;
  const [valores, setValores] = useState(inicial);
  const [tocados, setTocados] = useState<Partial<Record<CampoContacto, boolean>>>({});
  const [hecho, setHecho] = useState(false);
  const { cargando, error, campos, ejecutar } = useAccion();

  const errores = Object.fromEntries(
    CAMPOS_CONTACTO.map(({ campo }) => [campo, errorDeCampo(campo, valores[campo])]),
  ) as Record<CampoContacto, string | undefined>;
  const hayErrores = Object.values(errores).some(Boolean);
  const cambiado = CAMPOS_CONTACTO.some(({ campo }) => valores[campo] !== inicial[campo]);

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setHecho(false);
    setTocados(Object.fromEntries(CAMPOS_CONTACTO.map(({ campo }) => [campo, true])));
    if (hayErrores) return;
    const r = await ejecutar('PUT', '/sitio/contacto', valores);
    if (r) {
      await refrescarSitio();
      setHecho(true);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={guardar} noValidate>
      <fieldset className="grid gap-4 sm:grid-cols-2" disabled={!puedeCambiar}>
        <legend className="sr-only">Contacto y redes</legend>
        {CAMPOS_CONTACTO.map(({ campo, etiqueta, ayuda, tipo, ejemplo }) => (
          <Campo
            key={campo}
            name={campo}
            etiqueta={etiqueta}
            ayuda={ayuda}
            type={tipo}
            inputMode={tipo === 'tel' ? 'tel' : undefined}
            placeholder={ejemplo}
            autoComplete="off"
            value={valores[campo]}
            onChange={(ev) => {
              const v = ev.currentTarget.value;
              setValores((a) => ({ ...a, [campo]: v }));
              setHecho(false);
            }}
            onBlur={() => setTocados((a) => ({ ...a, [campo]: true }))}
            error={
              (tocados[campo] || valores[campo] !== inicial[campo] ? errores[campo] : undefined) ??
              campos[campo]
            }
          />
        ))}
      </fieldset>
      <ErrorGeneral error={error} />
      {hecho && <Alerta tono="exito">Datos de contacto guardados en el sitio público.</Alerta>}
      {puedeCambiar ? (
        <Boton
          type="submit"
          className="w-fit"
          cargando={cargando}
          disabled={!cambiado || hayErrores}
        >
          Guardar contacto
        </Boton>
      ) : (
        <p className="text-sm text-tinta-tenue">Solo administración puede cambiar el contacto.</p>
      )}
    </form>
  );
}
