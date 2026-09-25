export interface CorreoRenderizado {
  asunto: string;
  texto: string;
  html: string;
}

const PIE_CUENTA =
  'Recibes este correo por una acción en tu cuenta de NV Streaming. Si no fuiste tú, ignóralo o escribe a soporte.';
const PIE_SERVICIO =
  'Recibes este aviso porque tienes un servicio activo con NV Streaming. Si tienes dudas, escribe a soporte desde tu cuenta.';
const PIE_RECORDATORIO =
  'Recibes este recordatorio porque tienes un servicio con NV Streaming. Puedes dejar de recibir recordatorios desde tu cuenta; los avisos de pago y suspensión seguirán llegando.';
const PIE_EQUIPO = 'Aviso automático del sistema de NV Streaming para el equipo.';

const envolver = (
  titulo: string,
  parrafos: string[],
  boton?: { texto: string; url: string },
  pie = PIE_CUENTA,
) => {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cuerpo = parrafos
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${esc(p)}</p>`)
    .join('');
  const cta = boton
    ? `<p style="margin:24px 0"><a href="${esc(boton.url)}" style="background:#6d4aff;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block">${esc(boton.texto)}</a></p><p style="font-size:13px;color:#667085;word-break:break-all">Si el botón no funciona, copia este enlace: ${esc(boton.url)}</p>`
    : '';
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f5f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#101828"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="font-weight:800;font-size:18px;letter-spacing:.02em;margin-bottom:24px">NV Streaming</div><div style="background:#fff;border-radius:16px;padding:28px"><h1 style="font-size:20px;margin:0 0 16px">${esc(titulo)}</h1>${cuerpo}${cta}</div><p style="font-size:12px;color:#98a2b3;margin-top:20px">${esc(pie)}</p></div></body></html>`;
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

  // ── Fase 3: avisos automáticos ─────────────────────────────────────────────

  recordatorioVencimiento(
    nombre: string,
    servicio: string,
    vence: string,
    dias: number,
    url: string,
    conFactura: boolean,
  ): CorreoRenderizado {
    const cuando = dias === 1 ? 'mañana' : `en ${dias} días`;
    const p = [
      `Hola, ${nombre}.`,
      `Tu servicio ${servicio} vence ${cuando}, el ${vence}.`,
      conFactura
        ? 'Ya tienes la factura de renovación: págala a tiempo para no perder el acceso.'
        : 'Renuévalo desde tu cuenta para no perder el acceso.',
    ];
    const boton = { texto: conFactura ? 'Pagar la factura' : 'Renovar mi servicio', url };
    return {
      asunto: `Tu servicio ${servicio} vence ${cuando}`,
      texto: texto(p, url),
      html: envolver(`Tu servicio vence ${cuando}`, p, boton, PIE_RECORDATORIO),
    };
  },
  facturaRenovacion(
    nombre: string,
    servicio: string,
    factura: string,
    total: string,
    pagarAntes: string,
    metodos: { nombre: string; instrucciones: string }[],
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Emitimos la factura ${factura} para renovar tu servicio ${servicio}. Total: ${total}. Págala antes del ${pagarAntes}.`,
      ...(metodos.length
        ? [
            'Puedes pagar por:',
            ...metodos.map((m) => `• ${m.nombre}: ${m.instrucciones.replace(/\s+/g, ' ')}`),
            'Después de pagar, reporta el pago con tu comprobante desde la factura.',
          ]
        : ['Entra a la factura para ver cómo pagar y reportar tu pago.']),
    ];
    return {
      asunto: `Factura de renovación ${factura}: ${total}`,
      texto: texto(p, url),
      html: envolver(
        'Tu factura de renovación',
        p,
        { texto: 'Ver y pagar la factura', url },
        PIE_SERVICIO,
      ),
    };
  },
  avisoGracia(
    nombre: string,
    servicio: string,
    suspension: string,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Tu servicio ${servicio} venció sin pago. Sigue funcionando por unos días de gracia, pero se suspenderá el ${suspension} si no recibimos el pago.`,
    ];
    return {
      asunto: `Tu servicio ${servicio} venció: paga para no perderlo`,
      texto: texto(p, url),
      html: envolver('Tu servicio venció', p, { texto: 'Pagar ahora', url }, PIE_SERVICIO),
    };
  },
  avisoSuspension(nombre: string, servicio: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Suspendimos tu servicio ${servicio} porque no recibimos el pago de la renovación.`,
      'Paga la factura pendiente y lo reactivaremos en cuanto confirmemos el pago.',
    ];
    return {
      asunto: `Tu servicio ${servicio} está suspendido`,
      texto: texto(p, url),
      html: envolver(
        'Servicio suspendido',
        p,
        { texto: 'Reactivar mi servicio', url },
        PIE_SERVICIO,
      ),
    };
  },
  avisoRecuperacion(
    nombre: string,
    servicio: string,
    vence: string,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Confirmamos tu pago: tu servicio ${servicio} vuelve a estar activo hasta el ${vence}. Gracias.`,
    ];
    return {
      asunto: `Tu servicio ${servicio} está activo de nuevo`,
      texto: texto(p, url),
      html: envolver('Servicio reactivado', p, { texto: 'Ver mis servicios', url }, PIE_SERVICIO),
    };
  },
  saldoBajoRevendedor(
    nombre: string,
    saldo: string,
    umbral: string,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Tu saldo de revendedor quedó en ${saldo}, por debajo de ${umbral}.`,
      'Recarga para seguir activando servicios a tus clientes sin interrupciones.',
    ];
    return {
      asunto: `Tu saldo quedó en ${saldo}`,
      texto: texto(p, url),
      html: envolver('Tu saldo está bajo', p, { texto: 'Recargar saldo', url }, PIE_SERVICIO),
    };
  },
  escaladoSuspension(
    nombre: string,
    numero: number,
    cliente: string,
    servicio: string,
    dias: number,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Abrimos el ticket #${numero}: la suscripción ${servicio} de ${cliente} lleva ${dias} ${dias === 1 ? 'día' : 'días'} suspendida sin pago.`,
      'Contacta al cliente para ayudarle a reactivarla o confirma si desea cancelarla.',
    ];
    return {
      asunto: `Ticket #${numero}: suscripción suspendida sin pago`,
      texto: texto(p, url),
      html: envolver(
        'Suscripción para seguimiento',
        p,
        { texto: 'Abrir el ticket', url },
        PIE_EQUIPO,
      ),
    };
  },
  alertaSla(
    nombre: string,
    numero: number,
    asunto: string,
    cliente: string,
    plazo: string,
    asignado: boolean,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `El ticket #${numero} de ${cliente} ("${asunto}") pasó su plazo de primera respuesta (${plazo}) y sigue sin respuesta.`,
      asignado ? 'Está asignado a ti.' : 'No tiene a nadie asignado: tómalo o asígnalo.',
    ];
    return {
      asunto: `Ticket #${numero} fuera de plazo`,
      texto: texto(p, url),
      html: envolver('Ticket fuera de plazo', p, { texto: 'Responder el ticket', url }, PIE_EQUIPO),
    };
  },
  pagosPendientes(
    nombre: string,
    horas: number,
    pagos: string[],
    recargas: string[],
    url: string,
  ): CorreoRenderizado {
    const total = pagos.length + recargas.length;
    const p = [
      `Hola, ${nombre}.`,
      `Hay ${total} ${total === 1 ? 'pago' : 'pagos'} esperando revisión desde hace más de ${horas} ${horas === 1 ? 'hora' : 'horas'}.`,
      ...(pagos.length ? ['Pagos de clientes:', ...pagos.map((x) => `• ${x}`)] : []),
      ...(recargas.length ? ['Recargas de revendedores:', ...recargas.map((x) => `• ${x}`)] : []),
    ];
    return {
      asunto: `${total} ${total === 1 ? 'pago espera' : 'pagos esperan'} conciliación`,
      texto: texto(p, url),
      html: envolver('Pagos por conciliar', p, { texto: 'Ir a cobros', url }, PIE_EQUIPO),
    };
  },
  tasaNoAplicada(
    nombre: string,
    fuente: string,
    nueva: string,
    vigente: string,
    variacion: string,
    maximo: number,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `La tasa automática (${fuente}) trajo ${nueva} Bs. por dólar, un ${variacion} % distinta de la vigente (${vigente} Bs.). El máximo permitido es ${maximo} %, así que no se aplicó.`,
      'Revisa la fuente y, si el valor es correcto, regístralo a mano en Finanzas.',
    ];
    return {
      asunto: 'Tasa del bolívar sin aplicar: revisa el valor',
      texto: texto(p, url),
      html: envolver('Tasa sin aplicar', p, { texto: 'Ir a Finanzas', url }, PIE_EQUIPO),
    };
  },
  // ── Fase 4: pagos en línea y cobros autorizados ───────────────────────────

  cobroAutomaticoProximo(
    nombre: string,
    servicio: string,
    monto: string,
    metodo: string,
    fecha: string,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Mañana, ${fecha}, cobraremos ${monto} con ${metodo} para renovar tu servicio ${servicio}, como autorizaste.`,
      'No tienes que hacer nada. Si prefieres pagar de otra forma, desactiva el cobro automático o revoca la autorización desde tu cuenta antes del cobro.',
    ];
    return {
      asunto: `Mañana cobraremos ${monto} con ${metodo}`,
      texto: texto(p, url),
      html: envolver(
        'Cobro automático programado',
        p,
        { texto: 'Ver mis métodos de pago', url },
        PIE_SERVICIO,
      ),
    };
  },
  cobroAutomaticoRealizado(
    nombre: string,
    servicio: string,
    factura: string,
    monto: string,
    metodo: string,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Cobramos ${monto} con ${metodo} y pagamos la factura ${factura}: tu servicio ${servicio} quedó renovado. Gracias.`,
      'Puedes revocar la autorización cuando quieras desde "Mis métodos de pago".',
    ];
    return {
      asunto: `Renovamos tu servicio ${servicio}`,
      texto: texto(p, url),
      html: envolver('Servicio renovado', p, { texto: 'Ver mis servicios', url }, PIE_SERVICIO),
    };
  },
  cobroAutomaticoFallido(
    nombre: string,
    servicio: string,
    monto: string,
    metodo: string,
    motivo: string,
    proximoIntento: string | null,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `No pudimos cobrar ${monto} con ${metodo} para renovar tu servicio ${servicio}.`,
      `Motivo: ${motivo}`,
      proximoIntento
        ? `Lo intentaremos de nuevo el ${proximoIntento}. Para no esperar, puedes pagar la factura ahora.`
        : 'Ya no lo intentaremos de nuevo. Paga la factura para no perder el servicio.',
    ];
    return {
      asunto: `No pudimos cobrar la renovación de ${servicio}`,
      texto: texto(p, url),
      html: envolver(
        'No pudimos cobrar la renovación',
        p,
        { texto: 'Pagar la factura', url },
        PIE_SERVICIO,
      ),
    };
  },
  metodoAutorizadoGuardado(nombre: string, metodo: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Guardamos ${metodo} y tu autorización para cobrar solo las renovaciones de los servicios en los que actives el cobro automático.`,
      'Te avisaremos antes y después de cada cobro. Puedes revocar la autorización cuando quieras desde tu cuenta.',
    ];
    return {
      asunto: 'Autorizaste el cobro automático',
      texto: texto(p, url),
      html: envolver('Cobro automático autorizado', p, { texto: 'Ver mis métodos de pago', url }),
    };
  },
  metodoAutorizadoRevocado(nombre: string, metodo: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Revocamos la autorización de cobro con ${metodo}. No haremos más cobros automáticos con ese método.`,
      'Tus servicios siguen activos: te avisaremos para que pagues cada renovación a mano.',
    ];
    return {
      asunto: 'Revocaste la autorización de cobro',
      texto: texto(p, url),
      html: envolver('Autorización revocada', p, { texto: 'Ver mis métodos de pago', url }),
    };
  },
  metodoAutorizadoInvalido(nombre: string, metodo: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `La pasarela nos indicó que ${metodo} ya no se puede usar (por ejemplo, la tarjeta venció o cancelaste el acuerdo). Desactivamos el cobro automático con ese método.`,
      'Paga tu próxima renovación a mano o guarda un método nuevo al pagar en línea.',
    ];
    return {
      asunto: 'Tu método de pago guardado ya no es válido',
      texto: texto(p, url),
      html: envolver(
        'Método de pago no válido',
        p,
        { texto: 'Ver mis servicios', url },
        PIE_SERVICIO,
      ),
    };
  },
  reembolsoRealizado(
    nombre: string,
    factura: string,
    monto: string,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Te devolvimos ${monto} del pago de la factura ${factura}. Según tu banco o billetera, puede tardar unos días en verse.`,
    ];
    return {
      asunto: `Devolución de ${monto}`,
      texto: texto(p, url),
      html: envolver('Te devolvimos un pago', p, { texto: 'Ver la factura', url }, PIE_SERVICIO),
    };
  },
  pagoEnLineaEnRevision(
    nombre: string,
    cliente: string,
    factura: string,
    detalle: string,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Un pago en línea de ${cliente} (factura ${factura}) no se confirmó solo: ${detalle}`,
      'Quedó en la cola de conciliación. Confírmalo si corresponde o recházalo y devuélvelo desde el pago.',
    ];
    return {
      asunto: `Pago en línea para revisar: ${factura}`,
      texto: texto(p, url),
      html: envolver('Pago en línea para revisar', p, { texto: 'Ir a cobros', url }, PIE_EQUIPO),
    };
  },
  // ── Entregas (fase 6). Nunca llevan el código ni el enlace: se ven en el panel. ──
  servicioListo(nombre: string, servicio: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Tu servicio ${servicio} está listo.`,
      'Entra en «Mis accesos» de tu cuenta para ver cómo activarlo. Por seguridad, el código o el enlace de activación solo se muestra dentro de tu cuenta: no lo compartas con nadie.',
    ];
    return {
      asunto: 'Tu servicio está listo',
      texto: texto(p, url),
      html: envolver('Tu servicio está listo', p, { texto: 'Ver mis accesos', url }, PIE_SERVICIO),
    };
  },
  accesoListoRevendedor(
    nombre: string,
    cliente: string,
    servicio: string,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `La activación de ${servicio} para tu cliente ${cliente} está lista.`,
      'Entra en «Accesos de clientes» de tu panel para ver cómo activarla y entrégasela a tu cliente. El código solo se muestra dentro del panel.',
    ];
    return {
      asunto: `Activación lista: ${cliente}`,
      texto: texto(p, url),
      html: envolver('Activación lista', p, { texto: 'Ver accesos de clientes', url }),
    };
  },
  entregaPendiente(
    nombre: string,
    cliente: string,
    servicio: string,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `${cliente} pagó ${servicio} y su entrega es manual: falta que alguien del equipo la complete.`,
      'Escribe los pasos para activar el servicio y, si corresponde, el enlace o el código oficial. Nunca se entregan usuarios ni contraseñas de cuentas.',
    ];
    return {
      asunto: `Entrega pendiente: ${servicio}`,
      texto: texto(p, url),
      html: envolver('Entrega pendiente', p, { texto: 'Completar la entrega', url }, PIE_EQUIPO),
    };
  },
  entregaSinStock(nombre: string, plan: string, cliente: string, url: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `No quedan códigos disponibles de ${plan} y la entrega de ${cliente} está esperando.`,
      'Sube un lote nuevo en el inventario: las entregas pendientes se harán solas.',
    ];
    return {
      asunto: `Sin códigos: ${plan}`,
      texto: texto(p, url),
      html: envolver(
        'Sin códigos en inventario',
        p,
        { texto: 'Ir al inventario', url },
        PIE_EQUIPO,
      ),
    };
  },
  entregaFallida(
    nombre: string,
    cliente: string,
    servicio: string,
    detalle: string,
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `No se pudo completar la entrega de ${servicio} para ${cliente}.`,
      `Detalle: ${detalle}`,
      'Revísala en el panel: puedes reintentarla, completarla a mano o anularla.',
    ];
    return {
      asunto: `Entrega fallida: ${servicio}`,
      texto: texto(p, url),
      html: envolver('Entrega fallida', p, { texto: 'Ver la entrega', url }, PIE_EQUIPO),
    };
  },
  stockBajoCodigos(
    nombre: string,
    umbral: number,
    lineas: string[],
    url: string,
  ): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      `Estos planes tienen menos de ${umbral} códigos disponibles o entregas esperando códigos:`,
      ...lineas.map((l) => `• ${l}`),
      'Sube un lote nuevo desde el inventario para que las entregas no se detengan.',
    ];
    return {
      asunto: 'Quedan pocos códigos en el inventario',
      texto: texto(p, url),
      html: envolver(
        'Pocos códigos en inventario',
        p,
        { texto: 'Ir al inventario', url },
        PIE_EQUIPO,
      ),
    };
  },
  avisoPrueba(nombre: string): CorreoRenderizado {
    const p = [
      `Hola, ${nombre}.`,
      'Este es un mensaje de prueba de los avisos automáticos de NV Streaming. Si lo recibes, el correo está bien configurado.',
    ];
    return {
      asunto: 'Mensaje de prueba de NV Streaming',
      texto: texto(p),
      html: envolver('Mensaje de prueba', p, undefined, PIE_EQUIPO),
    };
  },
};

export type NombrePlantilla = keyof typeof Plantillas;
