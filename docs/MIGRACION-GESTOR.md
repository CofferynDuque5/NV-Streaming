# Migración del Gestor de Plataformas a NV Streaming

Cómo pasar todo lo del Gestor (gestordeplataformas.serviciosnat.com) a **Plataformas** en NV Streaming sin perder datos ni dejar claves a la vista.

## 1. Antes de empezar

1. **Respalda NV Streaming** con `infra/respaldar.sh` en el servidor. Si algo sale mal, se vuelve atrás con `infra/restaurar.sh`.
2. En el catálogo de NV, cada plataforma del Gestor (Netflix, Disney+, Spotify…) necesita su **servicio** y al menos un **plan**. Si un servicio no tiene logo, al importar se le pone el icono que tenía en el Gestor. Un logo que ya existe no se cambia.
3. Publica en el Gestor la capa `js/nv-nvstreaming-850.js` (PR #1 de NV-Gestor-Cuentas). Los pasos están en el PR.

## 2. Descargar la migración en el Gestor

1. Entra al Gestor como dueño y abre **Copias de seguridad**.
2. Pulsa **Migración a NV Streaming (cifrada)**.
3. Escribe una **frase** de 10 caracteres o más. Guárdala en un lugar seguro: NV te la va a pedir y no se guarda en ningún lado.
4. Se descarga `nv-migracion_AAAA-MM-DD_HH-MM.json`.

El archivo trae:

- un **manifiesto** con los conteos del Gestor y la huella SHA-256 de cada parte;
- las **secciones**, sin correos de cuentas, claves ni PIN;
- las **credenciales**, cifradas con tu frase (AES-256-GCM).

El Gestor no cambia nada al descargarla: solo lee.

## 3. Importar en NV Streaming

1. Abre **Cuentas → Importar del Gestor** y sube el archivo.
2. NV revisa las huellas. Si el archivo se dañó o alguien lo modificó, lo rechaza y dice qué parte no cuadra.
3. Escribe la frase y pulsa **Abrir migración**. El archivo se descifra en tu navegador: la frase no viaja al servidor.
4. Revisa el **cuadre contra el Gestor**. Para plataformas, cuentas, perfiles con cliente y PIN muestra tres números: en el Gestor, en el archivo y lo que se importa. Si alguno sale con **≠**, no importes y revisa la lista «cosas no se importan».
5. Para cada plataforma:
   1. Elige el servicio y el plan.
   2. Pulsa **Simular**. Nada se escribe al simular.
   3. Si el cuadre está bien, pulsa **Importar**.

   Cada plataforma se importa en una sola transacción: o entra completa o no entra nada.

6. Las cuentas, perfiles y clientes quedan en **Plataformas**, bajo el icono de su servicio, en el mismo orden que en el Gestor. Las claves y los PIN se guardan cifrados con la clave de NV.

## 4. Deshacer

En **Lotes importados**, cada plataforma importada tiene **Deshacer**. Funciona mientras nada de lo importado tenga facturas, pagos u otros movimientos. Después de eso, se vuelve atrás con el respaldo del paso 1.

## 5. Qué se migra y qué no

| Del Gestor                                                                                                                                                 | En NV Streaming                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Plataformas con su orden e icono                                                                                                                           | Servicio en Plataformas (el logo solo si no tenía) |
| Cuentas completas e individuales: correo, clave, perfiles, costo, próximo cobro, plan, país, proveedor, método de pago (solo los 4 últimos dígitos), caída | Cuentas del servicio                               |
| Perfiles: nombre, PIN, posición, libre o asignado                                                                                                          | Perfiles de la cuenta                              |
| Clientes: nombre, hasta 3 contactos (WhatsApp, Telegram, correo), responsable, vencimiento, precio                                                         | Clientes y suscripciones                           |

La facturación del propio Gestor (sus planes y pagos de suscripción) **no** se migra, porque no es parte del negocio.

## 6. Seguridad

- Las claves y los PIN no van en claro en el archivo ni quedan en los registros. Al importar viajan por HTTPS al servidor, que los guarda cifrados.
- La clave de cifrado del Gestor no se reutiliza: el Gestor guarda las claves sin cifrar, y NV las vuelve a cifrar con su propia clave.
- Solo la administración puede importar, y cada importación queda registrada con quién la hizo y cuándo.
