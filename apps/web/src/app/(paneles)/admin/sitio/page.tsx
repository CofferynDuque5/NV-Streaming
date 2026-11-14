import { permanentRedirect } from 'next/navigation';

/** «Sitio y páginas» ahora es el editor de la tienda, en su propio panel. */
export default function SitioYPaginas() {
  permanentRedirect('/editor');
}
