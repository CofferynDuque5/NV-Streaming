import { redirect } from 'next/navigation';

/** «Mis compras» ahora es «Ventas»: los enlaces viejos siguen funcionando. */
export default function Compras() {
  redirect('/revendedor/ventas');
}
