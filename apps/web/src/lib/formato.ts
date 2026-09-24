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
