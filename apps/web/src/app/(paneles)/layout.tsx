import type { ReactNode } from 'react';
import './paneles.css';

/** Solo carga los estilos de los paneles; cada sección tiene su propio marco. */
export default function LayoutPaneles({ children }: { children: ReactNode }) {
  return children;
}
