import { enlacePoliticas } from '@nv/shared';
import { permanentRedirect } from 'next/navigation';

/** La política de privacidad ahora es una sección de Políticas y términos. */
export default function Privacidad() {
  permanentRedirect(enlacePoliticas('privacidad'));
}
