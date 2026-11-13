import type { TemporadaSitio } from '@nv/shared';

/**
 * Adorno de la temporada: solo CSS, detrás del contenido, sin texto ni clics y
 * oculto para lectores de pantalla. Con «reducir movimiento» queda quieto.
 * En los paneles (`discreta`) solo quedan los copos de los bordes.
 */
export function DecoracionTemporada({
  temporada,
  discreta = false,
}: {
  temporada: TemporadaSitio;
  discreta?: boolean;
}) {
  if (temporada === 'halloween') {
    if (discreta) return null;
    return (
      <div className="nv-temporada-halloween" aria-hidden="true">
        <span>🦇</span>
        <span>🦇</span>
        <span>🦇</span>
        <span>🎃</span>
      </div>
    );
  }
  return (
    <div className="nv-temporada-navidad" aria-hidden="true">
      {!discreta && <div className="nv-luces" />}
      {COPOS.map((c, i) => (
        <span key={i} className="nv-copo" style={c}>
          ❄
        </span>
      ))}
      {!discreta && (
        <>
          <span className="nv-navidad-arbol">🎄</span>
          <span className="nv-navidad-regalo">🎁</span>
        </>
      )}
    </div>
  );
}

/** Copos en los bordes de la pantalla (lejos del texto), cada uno con su ritmo. */
const COPOS = [
  { left: '1%', animationDelay: '0s', animationDuration: '14s', fontSize: '0.9rem' },
  { left: '3.5%', animationDelay: '-5s', animationDuration: '18s', fontSize: '0.7rem' },
  { left: '6%', animationDelay: '-9s', animationDuration: '16s', fontSize: '1rem' },
  { right: '1.2%', animationDelay: '-2s', animationDuration: '15s', fontSize: '0.8rem' },
  { right: '3.8%', animationDelay: '-7s', animationDuration: '19s', fontSize: '1.05rem' },
  { right: '6.5%', animationDelay: '-12s', animationDuration: '17s', fontSize: '0.7rem' },
];
