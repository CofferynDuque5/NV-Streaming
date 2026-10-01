// Poda la carpeta node_modules de una copia de producción hecha con `pnpm deploy`.
// Uso (al compilar la imagen): node podar-dependencias.mjs /salida/api
//
// @prisma/client declara la CLI de Prisma y TypeScript como dependencias opcionales (y
// @nestjs/swagger, TypeScript para su plugin de compilación), y pnpm las instala aunque en
// producción no se usen (unos 270 MB con Prisma Studio, PGlite, etc.). Aquí se recorre el
// grafo real de dependencias desde el proyecto, se omiten esas aristas y se borra lo que
// queda inalcanzable. También se quitan los compiladores de
// consultas de otros motores (solo usamos PostgreSQL) y los mapas de fuentes de terceros.
import { readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const raiz = process.argv[2];
if (!raiz) throw new Error('Indica la carpeta desplegada.');
const nm = join(raiz, 'node_modules');
const almacen = join(nm, '.pnpm');
/** Dependencias que nunca se cargan en ejecución: `typescript` de cualquiera y la CLI de Prisma. */
const omitir = (paquete, dep) =>
  dep === 'typescript' || (paquete === '@prisma/client' && dep === 'prisma');

/** Paquetes (con ámbito incluido) dentro de una carpeta node_modules. */
function paquetes(carpeta) {
  const lista = [];
  for (const e of readdirSync(carpeta, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    if (e.name.startsWith('@')) {
      for (const s of readdirSync(join(carpeta, e.name))) lista.push(`${e.name}/${s}`);
    } else lista.push(e.name);
  }
  return lista;
}

/** Carpeta `.pnpm/<clave>` que contiene un paquete real, o null si no está en el almacén. */
function claveDe(ruta) {
  const rel = ruta.slice(almacen.length + 1);
  return ruta.startsWith(almacen + sep) ? rel.split(sep)[0] : null;
}

const alcanzables = new Set();
const pendientes = paquetes(nm).map((p) => ({ nombre: p, ruta: realpathSync(join(nm, p)) }));
while (pendientes.length > 0) {
  const { nombre, ruta } = pendientes.pop();
  const clave = claveDe(ruta);
  if (clave === null || alcanzables.has(clave)) continue;
  alcanzables.add(clave);
  // Las dependencias de un paquete son sus hermanas en .pnpm/<clave>/node_modules.
  const hermanos = join(almacen, clave, 'node_modules');
  for (const dep of paquetes(hermanos)) {
    if (dep === nombre || omitir(nombre, dep)) continue;
    try {
      pendientes.push({ nombre: dep, ruta: realpathSync(join(hermanos, dep)) });
    } catch {
      // Enlace roto (dependencia opcional de otra plataforma): se ignora.
    }
  }
}

let borrados = 0;
for (const clave of readdirSync(almacen)) {
  if (clave === 'node_modules' || clave.startsWith('.') || alcanzables.has(clave)) continue;
  if (!statSync(join(almacen, clave)).isDirectory()) continue;
  rmSync(join(almacen, clave), { recursive: true, force: true });
  borrados++;
}

/** Borra enlaces rotos, compiladores de otros motores y mapas de fuentes de terceros. */
function limpiar(carpeta) {
  for (const e of readdirSync(carpeta, { withFileTypes: true })) {
    const ruta = join(carpeta, e.name);
    if (e.isSymbolicLink()) {
      try {
        statSync(ruta);
      } catch {
        rmSync(ruta, { force: true });
      }
    } else if (e.isDirectory()) {
      limpiar(ruta);
    } else if (
      /^query_compiler_(fast|small)_bg\.(cockroachdb|mysql|sqlite|sqlserver)\./.test(e.name) ||
      e.name.endsWith('.map')
    ) {
      rmSync(ruta, { force: true });
    }
  }
}
limpiar(nm);
console.log(`Poda: ${alcanzables.size} paquetes en uso, ${borrados} eliminados.`);
