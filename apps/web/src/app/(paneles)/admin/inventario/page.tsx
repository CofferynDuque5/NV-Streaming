import { redirect } from 'next/navigation';

/** El inventario ahora es «Plataformas» (como en el Gestor). */
export default function Inventario() {
  redirect('/admin/plataformas');
}
