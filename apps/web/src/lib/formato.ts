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
