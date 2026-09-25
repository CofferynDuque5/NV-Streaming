const fechaHora = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
const fecha = new Intl.DateTimeFormat('es', { dateStyle: 'medium' });
const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export const formatearFechaHora = (iso: string) => fechaHora.format(new Date(iso));
export const formatearFecha = (iso: string) => fecha.format(new Date(iso));

export function haceCuanto(iso: string, ahora = Date.now()): string {
  const segundos = Math.round((new Date(iso).getTime() - ahora) / 1000);
  const abs = Math.abs(segundos);
  if (abs < 60) return 'ahora mismo';
  if (abs < 3600) return relativo.format(Math.round(segundos / 60), 'minute');
  if (abs < 86400) return relativo.format(Math.round(segundos / 3600), 'hour');
  return relativo.format(Math.round(segundos / 86400), 'day');
}

/** Nombre legible de cada acción del registro de auditoría. */
export const ACCIONES_AUDITORIA: Record<string, string> = {
  'usuario.creado_semilla': 'Usuario de demostración creado',
  'usuario.registrado': 'Cuenta registrada',
  'usuario.correo_verificado': 'Correo confirmado',
  'usuario.invitado': 'Persona invitada',
  'usuario.invitacion_reenviada': 'Invitación reenviada',
  'usuario.invitacion_aceptada': 'Invitación aceptada',
  'usuario.rol_cambiado': 'Rol cambiado',
  'usuario.suspendido': 'Cuenta suspendida',
  'usuario.reactivado': 'Cuenta reactivada',
  'usuario.perfil_actualizado': 'Perfil actualizado',
  'sesion.iniciada': 'Inicio de sesión',
  'sesion.intento_fallido': 'Intento de acceso fallido',
  'sesion.cerrada': 'Cierre de sesión',
  'sesion.cerrada_remota': 'Sesión cerrada en otro dispositivo',
  'sesion.cerradas_otras': 'Otras sesiones cerradas',
  'contrasena.cambiada': 'Contraseña cambiada',
  'contrasena.recuperacion_solicitada': 'Recuperación de contraseña solicitada',
  'contrasena.restablecida': 'Contraseña restablecida',
  'dos_pasos.activado': 'Verificación en dos pasos activada',
  'dos_pasos.desactivado': 'Verificación en dos pasos desactivada',
  'dos_pasos.verificado': 'Verificación en dos pasos superada',
  'dos_pasos.verificado_con_respaldo': 'Acceso con código de respaldo',
  'dos_pasos.codigos_regenerados': 'Códigos de respaldo regenerados',
  'dos_pasos.restablecido_por_admin': 'Verificación restablecida por administración',
};

Object.assign(ACCIONES_AUDITORIA, {
  'tasa.registrada': 'Tasa de cambio registrada',
  'metodo_cobro.creado': 'Método de cobro creado',
  'metodo_cobro.actualizado': 'Método de cobro actualizado',
  'proveedor.creado': 'Proveedor creado',
  'proveedor.actualizado': 'Proveedor actualizado',
  'servicio.creado': 'Servicio creado',
  'servicio.actualizado': 'Servicio actualizado',
  'plan.creado': 'Plan creado',
  'plan.actualizado': 'Plan actualizado',
  'plan.precio_fijado': 'Precio fijo cambiado',
  'catalogo.semilla': 'Catálogo de demostración creado',
  'cliente.creado': 'Cliente creado',
  'cliente.actualizado': 'Cliente actualizado',
  'cliente.archivado': 'Cliente archivado',
  'cliente.reactivado': 'Cliente reactivado',
  'cliente.nota_agregada': 'Nota interna añadida',
  'cliente.invitado': 'Cliente invitado a su panel',
  'cliente.perfil_actualizado': 'Datos de cliente actualizados',
  'suscripcion.creada': 'Suscripción creada',
  'suscripcion.renovacion_facturada': 'Renovación facturada',
  'suscripcion.pausada': 'Suscripción pausada',
  'suscripcion.reanudada': 'Suscripción reanudada',
  'suscripcion.cancelada': 'Suscripción cancelada',
  'suscripcion.cancelacion_programada': 'Cancelación programada',
  'suscripcion.cancelacion_revertida': 'Cancelación revertida',
  'suscripcion.en_gracia': 'Suscripción en periodo de gracia',
  'suscripcion.suspendida': 'Suscripción suspendida',
  'suscripcion.vencida': 'Suscripción vencida',
  'factura.anulada': 'Factura anulada',
  'factura.recotizada': 'Factura recalculada',
  'pago.reportado': 'Pago reportado',
  'pago.registrado': 'Pago registrado por el equipo',
  'pago.confirmado': 'Pago confirmado',
  'pago.rechazado': 'Pago rechazado',
  'pago.comprobante_consultado': 'Comprobante consultado',
  'cupon.creado': 'Cupón creado',
  'cupon.activado': 'Cupón activado',
  'cupon.desactivado': 'Cupón desactivado',
  'ticket.abierto': 'Ticket abierto',
  'ticket.respondido': 'Ticket respondido',
  'ticket.nota_interna': 'Nota interna en ticket',
  'ticket.actualizado': 'Ticket actualizado',
  'ticket.cerrado_por_cliente': 'Ticket cerrado por el cliente',
});

// Programa de revendedores (fase 2).
Object.assign(ACCIONES_AUDITORIA, {
  'revendedor.solicitado': 'Solicitud de revendedor enviada',
  'revendedor.solicitud_reenviada': 'Solicitud de revendedor reenviada',
  'revendedor.aprobado': 'Revendedor aprobado',
  'revendedor.rechazado': 'Solicitud de revendedor rechazada',
  'revendedor.suspendido': 'Revendedor suspendido',
  'revendedor.reactivado': 'Revendedor reactivado',
  'revendedor.actualizado': 'Condiciones de revendedor cambiadas',
  'revendedor.saldo_ajustado': 'Saldo de revendedor ajustado',
  'revendedor.semilla': 'Revendedor de demostración creado',
  'recarga.reportada': 'Recarga de saldo reportada',
  'recarga.confirmada': 'Recarga de saldo confirmada',
  'recarga.rechazada': 'Recarga de saldo rechazada',
  'recarga.comprobante_consultado': 'Comprobante de recarga consultado',
  'compra_revendedor.realizada': 'Compra de revendedor',
  'compra_revendedor.reembolsada': 'Compra de revendedor reembolsada',
  'nivel_revendedor.creado': 'Nivel de revendedor creado',
  'nivel_revendedor.actualizado': 'Nivel de revendedor actualizado',
  'precio_mayorista.fijado': 'Precio mayorista cambiado',
});

// Entregas de servicios (fase 6). Nunca registran códigos ni enlaces.
Object.assign(ACCIONES_AUDITORIA, {
  'entrega.creada': 'Entrega creada',
  'entrega.entregada': 'Servicio entregado',
  'entrega.fallida': 'Entrega fallida',
  'entrega.completada': 'Entrega completada a mano',
  'entrega.reintentada': 'Entrega reintentada',
  'entrega.anulada': 'Entrega anulada',
  'entrega.revocada': 'Entrega revocada',
  'entrega.revocacion_fallida': 'Revocación fallida',
  'entrega.revelada': 'Código o enlace mostrado',
  'inventario.lote_subido': 'Lote de códigos subido',
  'inventario.codigo_anulado': 'Código anulado',
  'proveedor.entrega_configurada': 'Entrega del proveedor configurada',
  'proveedor.secreto_rotado': 'Clave de firma del webhook rotada',
  'proveedor.webhook_probado': 'Webhook del proveedor probado',
});

/** "1 mes", "3 meses", "7 días". */
export function formatearDuracion(cantidad: number, unidad: 'dia' | 'mes'): string {
  if (unidad === 'mes') return `${cantidad} ${cantidad === 1 ? 'mes' : 'meses'}`;
  return `${cantidad} ${cantidad === 1 ? 'día' : 'días'}`;
}

/** Días que faltan hasta una fecha (negativo si ya pasó). */
export function diasHasta(iso: string, ahora = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - ahora) / 86_400_000);
}

export { formatearMonto } from '@nv/shared';

const regiones = new Intl.DisplayNames('es', { type: 'region' });
/** Nombre del país en español a partir de su código ("VE" → "Venezuela"). */
export function nombrePais(codigo: string): string {
  try {
    return regiones.of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}

Object.assign(ACCIONES_AUDITORIA, {
  'pagina.creada': 'Página del sitio creada',
  'pagina.borrador_guardado': 'Borrador de página guardado',
  'pagina.publicada': 'Página del sitio publicada',
  'pagina.version_restaurada': 'Versión de página copiada al borrador',
  'pagina.archivada': 'Página del sitio archivada',
  'pagina.desarchivada': 'Página del sitio desarchivada',
  'medio.subido': 'Imagen del sitio subida',
  'tema_sitio.cambiado': 'Paleta del sitio cambiada',
});

// Automatizaciones (fase 3).
Object.assign(ACCIONES_AUDITORIA, {
  'automatizacion.actualizada': 'Automatización configurada',
  'automatizacion.ejecucion_manual': 'Automatización ejecutada a mano',
  'aviso.prueba': 'Aviso de prueba enviado',
  'cliente.preferencias_avisos': 'Preferencias de avisos cambiadas',
  'tasa.automatica': 'Tasa registrada automáticamente',
  'ticket.escalado': 'Ticket abierto por escalado automático',
});

// Pagos en línea y cobros autorizados (fase 4).
Object.assign(ACCIONES_AUDITORIA, {
  'pago_en_linea.iniciado': 'Pago en línea iniciado',
  'pago_en_linea.aprobado': 'Pago en línea aprobado',
  'pago_en_linea.rechazado': 'Pago en línea rechazado',
  'pago_en_linea.cancelado': 'Pago en línea cancelado',
  'pago_en_linea.expirado': 'Pago en línea expirado',
  'pago_en_linea.revision': 'Pago en línea enviado a revisión',
  'metodo_autorizado.creado': 'Cobro automático autorizado por el cliente',
  'metodo_autorizado.revocado': 'Autorización de cobro revocada',
  'metodo_autorizado.invalidado': 'Método autorizado marcado como no válido',
  'suscripcion.cobro_automatico_activado': 'Cobro automático activado',
  'suscripcion.cobro_automatico_desactivado': 'Cobro automático desactivado',
  'cobro_automatico.exitoso': 'Cobro automático realizado',
  'cobro_automatico.fallido': 'Cobro automático fallido',
  'cobro_automatico.cancelado': 'Cobro automático cancelado',
  'reembolso.solicitado': 'Devolución solicitada',
  'reembolso.completado': 'Devolución completada',
  'reembolso.fallido': 'Devolución fallida',
  'evento_pasarela.reprocesado': 'Aviso de pasarela reprocesado',
});
