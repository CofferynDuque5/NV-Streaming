export interface CorreoRenderizado {
  asunto: string;
  texto: string;
  html: string;
}

const envolver = (titulo: string, parrafos: string[], boton?: { texto: string; url: string }) => {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cuerpo = parrafos
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${esc(p)}</p>`)
    .join('');
  const cta = boton
    ? `<p style="margin:24px 0"><a href="${esc(boton.url)}" style="background:#6d4aff;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${esc(boton.texto)}</a></p><p style="font-size:13px;color:#667085;word-break:break-all">Si el botón no funciona, copia este enlace: ${esc(boton.url)}</p>`
    : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f5f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#101828"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="font-weight:800;font-size:18px;letter-spacing:.02em;margin-bottom:24px">NV Streaming</div><div style="background:#fff;border-radius:16px;padding:28px"><h1 style="font-size:20px;margin:0 0 16px">${esc(titulo)}</h1>${cuerpo}${cta}</div><p style="font-size:12px;color:#98a2b3;margin-top:20px">Recibes este correo por una acción en tu cuenta de NV Streaming. Si no fuiste tú, ignóralo o escribe a soporte.</p></div></body></html>`;
};

const texto = (parrafos: string[], enlace?: string) =>
  [...parrafos, ...(enlace ? ['', enlace] : []), '', '— NV Streaming'].join('\n');

export const Plantillas = {
  verificarCorreo(nombre: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      'Confirma tu correo para activar tu cuenta de NV Streaming. El enlace vence en 24 horas.',
    ];
    return {
      asunto: 'Confirma tu correo',
      texto: texto(p, url),
      html: envolver('Confirma tu correo', p, { texto: 'Confirmar correo', url }),
    };
  },
  cuentaExistente(nombre: string, urlRecuperar: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      'Alguien intentó crear una cuenta con este correo, pero ya tienes una. Si fuiste tú y no recuerdas la contraseña, puedes restablecerla.',
    ];
    return {
      asunto: 'Ya tienes una cuenta en NV Streaming',
      texto: texto(p, urlRecuperar),
      html: envolver('Ya tienes una cuenta', p, {
        texto: 'Restablecer contraseña',
        url: urlRecuperar,
      }),
    };
  },
  recuperarContrasena(nombre: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      'Recibimos una solicitud para restablecer tu contraseña. El enlace vence en 30 minutos y solo se puede usar una vez.',
    ];
    return {
      asunto: 'Restablece tu contraseña',
      texto: texto(p, url),
      html: envolver('Restablece tu contraseña', p, { texto: 'Elegir nueva contraseña', url }),
    };
  },
  contrasenaCambiada(nombre: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      'Tu contraseña de NV Streaming se cambió y cerramos las demás sesiones abiertas. Si no fuiste tú, restablécela de inmediato y escribe a soporte.',
    ];
    return {
      asunto: 'Tu contraseña se cambió',
      texto: texto(p),
      html: envolver('Tu contraseña se cambió', p),
    };
  },
  invitacion(nombreRol: string, url: string): CorreoRenderizado {
    const p = [
      `Te invitaron a NV Streaming con el rol de ${nombreRol}.`,
      'Acepta la invitación para crear tu contraseña. El enlace vence en 72 horas.',
    ];
    return {
      asunto: 'Te invitaron a NV Streaming',
      texto: texto(p, url),
      html: envolver('Tienes una invitación', p, { texto: 'Aceptar invitación', url }),
    };
  },
  invitacionCliente(nombre: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      'Creamos tu acceso al panel de cliente de NV Streaming. Desde allí verás tus servicios, pagarás tus facturas y hablarás con soporte.',
      'Acepta la invitación para crear tu contraseña. El enlace vence en 72 horas.',
    ];
    return {
      asunto: 'Tu acceso a NV Streaming',
      texto: texto(p, url),
      html: envolver('Tu acceso a NV Streaming', p, { texto: 'Crear mi contraseña', url }),
    };
  },
  pagoConfirmado(nombre: string, factura: string, monto: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Confirmamos tu pago de ${monto} de la factura ${factura}. Gracias.`,
    ];
    return {
      asunto: `Pago confirmado: ${factura}`,
      texto: texto(p, url),
      html: envolver('Pago confirmado', p, { texto: 'Ver mis servicios', url }),
    };
  },
  pagoRechazado(nombre: string, factura: string, motivo: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `No pudimos confirmar el pago que reportaste para la factura ${factura}.`,
      `Motivo: ${motivo}`,
      'Puedes reportarlo de nuevo con el comprobante correcto o escribir a soporte.',
    ];
    return {
      asunto: `Revisa tu pago: ${factura}`,
      texto: texto(p, url),
      html: envolver('Revisa tu pago', p, { texto: 'Ver la factura', url }),
    };
  },
  ticketRespondido(nombre: string, numero: number, asunto: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Respondimos a tu solicitud #${numero}: "${asunto}".`,
      'Por seguridad, lee la respuesta en tu panel.',
    ];
    return {
      asunto: `Respuesta a tu solicitud #${numero}`,
      texto: texto(p, url),
      html: envolver('Tienes una respuesta', p, { texto: 'Ver la respuesta', url }),
    };
  },
  dosPasosDesactivados(nombre: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      'La verificación en dos pasos de tu cuenta se desactivó o se restableció. Si no fuiste tú, cambia tu contraseña y escribe a soporte.',
    ];
    return {
      asunto: 'Cambió la verificación en dos pasos',
      texto: texto(p),
      html: envolver('Cambió la verificación en dos pasos', p),
    };
  },
};

export type NombrePlantilla = keyof typeof Plantillas;
