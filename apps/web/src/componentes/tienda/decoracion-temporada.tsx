import type { TemporadaSitio } from '@nv/shared';

/**
 * Adorno de la temporada: solo CSS, detrás del contenido, sin texto ni clics y
 * oculto para lectores de pantalla. Con «reducir movimiento» queda quieto.
 */
export function DecoracionTemporada({ temporada }: { temporada: TemporadaSitio }) {
  if (temporada !== 'halloween') return null;
  return (
    <div className="nv-temporada-halloween" aria-hidden="true">
      <span>🦇</span>
      <span>🦇</span>
      <span>🦇</span>
      <span>🎃</span>
    </div>
  );
}
