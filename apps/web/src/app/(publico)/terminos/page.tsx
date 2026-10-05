import { enlacePoliticas } from '@nv/shared';
import { permanentRedirect } from 'next/navigation';

/** Los términos ahora son una sección de Políticas y términos. */
export default function Terminos() {
  permanentRedirect(enlacePoliticas('terminos'));
}
