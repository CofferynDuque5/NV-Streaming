# Instalación en producción: guía paso a paso

Esta guía te lleva desde cero hasta tener NV Streaming funcionando en internet con tu dominio, HTTPS, copias de seguridad cifradas y monitoreo. **No hace falta saber de servidores**: cada paso dice qué hacer, qué comando copiar y para qué sirve. Calcula entre **2 y 3 horas** la primera vez, casi todo esperando a que algo termine.

Todo lo que se usa es **gratis**. Lo único que se paga es el **dominio** (unos 10 a 15 USD al año). Al final tienes la [lista honesta de costos](#18-costos-lo-que-es-gratis-y-lo-que-no).

## Índice

1. [Cómo queda montado](#1-cómo-queda-montado)
2. [Lo que necesitas antes de empezar](#2-lo-que-necesitas-antes-de-empezar)
3. [Crear el servidor en Oracle Cloud](#3-crear-el-servidor-en-oracle-cloud)
4. [Poner tu dominio en Cloudflare](#4-poner-tu-dominio-en-cloudflare)
5. [Entrar al servidor por SSH](#5-entrar-al-servidor-por-ssh)
6. [Ejecutar el instalador](#6-ejecutar-el-instalador)
7. [Primer ingreso y verificación en dos pasos](#7-primer-ingreso-y-verificación-en-dos-pasos)
8. [Activar la protección de Cloudflare](#8-activar-la-protección-de-cloudflare)
9. [Configurar el correo (SMTP)](#9-configurar-el-correo-smtp)
10. [Configurar el negocio](#10-configurar-el-negocio)
11. [Copias de seguridad fuera del servidor](#11-copias-de-seguridad-fuera-del-servidor-oracle-object-storage)
12. [Monitoreo con Uptime Kuma](#12-monitoreo-con-uptime-kuma)
13. [Opcional: pagos en línea, WhatsApp y asistente de IA](#13-opcional-pagos-en-línea-whatsapp-y-asistente-de-ia)
14. [Actualizar a una versión nueva](#14-actualizar-a-una-versión-nueva)
15. [Restaurar una copia](#15-restaurar-una-copia-y-qué-hacer-si-pierdes-el-servidor)
16. [Problemas frecuentes](#16-problemas-frecuentes)
17. [Lista de seguridad](#17-lista-de-seguridad)
18. [Costos: lo que es gratis y lo que no](#18-costos-lo-que-es-gratis-y-lo-que-no)

---

## 1. Cómo queda montado

```
Visitante ──HTTPS──▶ Cloudflare (gratis: caché, protección, oculta tu servidor)
                          │
                          ▼
          Servidor Oracle Cloud «Always Free» (Ubuntu, 4 núcleos ARM, 24 GB)
          ┌───────────────────────────────────────────────────────────┐
          │ Caddy (80/443, certificado HTTPS automático)               │
          │   ├── /api/*  ─▶ API (NestJS)  ─┐                          │
          │   └── resto   ─▶ Web (Next.js) ─┤                          │
          │ Trabajador (recordatorios, avisos, vencimientos, tasa)     │
          │ PostgreSQL 16 (no se ve desde internet) ◀──┘               │
          │ Copias de seguridad cifradas cada noche ──▶ Object Storage │
          │ Uptime Kuma (monitor, solo por túnel SSH)                  │
          │ Ollama (opcional, asistente de IA local)                   │
          └───────────────────────────────────────────────────────────┘
```

Todo corre en **contenedores de Docker** definidos en `docker-compose.prod.yml`. No instalas Node.js ni PostgreSQL a mano: el instalador lo hace todo.

## 2. Lo que necesitas antes de empezar

| Qué                                  | Para qué                                                        | Opción gratuita recomendada                                                                                                             |
| ------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Cuenta de Oracle Cloud**           | El servidor                                                     | [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). Pide una tarjeta **solo para verificar tu identidad**; no cobra.           |
| **Un dominio**                       | La dirección de tu tienda (p. ej. `nvstreaming.com`)            | Se paga (unos 10–15 USD/año). Puedes comprarlo en Cloudflare Registrar (a precio de costo), Namecheap o Porkbun.                        |
| **Cuenta de Cloudflare**             | DNS, HTTPS, caché y protección contra ataques                   | [dash.cloudflare.com](https://dash.cloudflare.com/sign-up), plan **Free**.                                                              |
| **Correo para enviar (SMTP)**        | Verificar cuentas, recuperar contraseñas, recordatorios de pago | [Brevo](https://www.brevo.com) (300 correos/día gratis) o [Resend](https://resend.com) (3 000/mes gratis). Se puede dejar para después. |
| **App de verificación en dos pasos** | Entrar al panel de administración (obligatorio para el equipo)  | Aegis (Android), 2FAS, Google Authenticator o Microsoft Authenticator                                                                   |
| **Gestor de contraseñas**            | Guardar las claves que genera el instalador                     | [Bitwarden](https://bitwarden.com) (gratis)                                                                                             |
| **Una computadora con terminal**     | Conectarte al servidor                                          | Windows 10/11 (PowerShell ya trae `ssh`), macOS o Linux                                                                                 |

> **Consejo:** usa un correo tuyo que revises a menudo como «correo de administración». Ahí llegan los avisos del certificado y es tu cuenta de acceso al panel.

## 3. Crear el servidor en Oracle Cloud

### 3.1 Crear la cuenta

1. Regístrate en [oracle.com/cloud/free](https://www.oracle.com/cloud/free/).
2. **Región de origen (Home Region):** elige la más cercana a Venezuela que ofrezcas, por ejemplo **US East (Ashburn)** o **Brazil East (São Paulo)**. **No se puede cambiar después** y los recursos gratuitos solo existen en ella. No te preocupes por la distancia: Cloudflare sirve las páginas desde su red, cerca de cada visitante.
3. Termina la verificación con la tarjeta. Oracle puede hacer una retención temporal de prueba que luego libera.

### 3.2 Crear tu llave SSH (en tu computadora)

La llave SSH es como la llave de tu casa: con ella entras al servidor sin contraseña. Abre PowerShell (Windows) o la Terminal (macOS/Linux) y escribe:

```bash
ssh-keygen -t ed25519 -C "nv-streaming"
```

Pulsa Enter para aceptar la ubicación y escribe una frase de paso (recomendado). Se crean dos archivos en la carpeta `.ssh` de tu usuario:

- `id_ed25519` → **privada**. Nunca la compartas. Haz una copia en tu gestor de contraseñas.
- `id_ed25519.pub` → **pública**. Esta es la que le das a Oracle. Muéstrala con `cat ~/.ssh/id_ed25519.pub` (en PowerShell: `type $HOME\.ssh\id_ed25519.pub`).

### 3.3 Crear la máquina virtual

En la consola de Oracle: menú ☰ → **Compute** → **Instances** → **Create instance**.

1. **Name:** `nv-streaming`.
2. **Image and shape** → **Edit**:
   - **Image:** _Change image_ → **Canonical Ubuntu** → versión **24.04** (la edición para Ampere/aarch64 se elige sola con la forma de abajo).
   - **Shape:** _Change shape_ → **Ampere** → **VM.Standard.A1.Flex** → **4 OCPU** y **24 GB** de memoria. Debe aparecer la etiqueta «Always Free-eligible».
3. **Networking:** deja «Create new virtual cloud network» y «Create new public subnet», y marca **Assign a public IPv4 address**.
4. **Add SSH keys:** _Paste public keys_ y pega el contenido de `id_ed25519.pub`.
5. **Boot volume:** marca _Specify a custom boot volume size_ y pon **100 GB** (el nivel gratuito incluye 200 GB en total).
6. **Create**. En uno o dos minutos el estado pasa a **Running**. Apunta la **Public IP address** (p. ej. `129.146.x.x`).

> **«Out of capacity»**: las máquinas ARM gratuitas se agotan a veces en una región. Prueba otro _Availability Domain_ en el mismo formulario, o inténtalo más tarde (de madrugada suele haber sitio). No crees una forma distinta de A1.Flex: las demás no son gratuitas (salvo la micro AMD de 1 GB, que se queda corta para esta tienda).

### 3.4 Abrir los puertos 80 y 443 en Oracle

Oracle tiene un cortafuegos **fuera** del servidor (la «Security List») que por defecto solo deja pasar SSH (puerto 22).

1. En la página de la instancia, pulsa el enlace de la **Subnet** → **Security Lists** → la lista _Default Security List for…_.
2. **Add Ingress Rules** y añade dos reglas:

| Source CIDR | IP Protocol | Destination Port Range | Descripción |
| ----------- | ----------- | ---------------------- | ----------- |
| `0.0.0.0/0` | TCP         | `80`                   | HTTP        |
| `0.0.0.0/0` | TCP         | `443`                  | HTTPS       |

El cortafuegos **dentro** del servidor (iptables) lo abre el instalador. Las imágenes de Ubuntu de Oracle traen reglas propias y Oracle desaconseja usar `ufw` en ellas; el instalador lo detecta y añade las reglas correctas.

> **Nota honesta sobre el nivel gratuito:** Oracle puede recuperar instancias «Always Free» que pasan 7 días casi sin uso (CPU, red y memoria por debajo del 20 %). Una tienda con visitas normalmente no entra en ese caso, pero si ves un aviso por correo de Oracle, pasa la cuenta a **Pay As You Go**: los recursos «Always Free» siguen sin costo y dejan de estar sujetos a esa regla. Si lo haces, crea una alerta de presupuesto de 1 USD (_Billing → Budgets_) para enterarte si algo empezara a cobrar.

## 4. Poner tu dominio en Cloudflare

1. En Cloudflare: **Add a domain** → escribe tu dominio → plan **Free**.
2. Cloudflare te da **dos servidores de nombres** (p. ej. `ana.ns.cloudflare.com`). Ve a la web donde compraste el dominio y cámbialos por esos dos. Puede tardar de minutos a unas horas; Cloudflare te avisa por correo cuando esté activo. (Si compraste el dominio en Cloudflare, este paso ya está hecho.)
3. En **DNS → Records**, crea dos registros **con la nube en gris (DNS only)** por ahora:

| Type | Name  | IPv4 address         | Proxy status        |
| ---- | ----- | -------------------- | ------------------- |
| A    | `@`   | la IP de tu servidor | **DNS only** (gris) |
| A    | `www` | la IP de tu servidor | **DNS only** (gris) |

¿Por qué en gris? Para que el servidor obtenga su primer certificado HTTPS directamente. En el [paso 8](#8-activar-la-protección-de-cloudflare) activas la nube naranja.

4. **SSL/TLS → Overview:** elige **Full (strict)**. Nunca uses «Flexible»: provoca bucles de redirección y deja un tramo sin cifrar.
5. **SSL/TLS → Edge Certificates:** deja **Always Use HTTPS en OFF**. Caddy ya redirige a HTTPS y necesita el puerto 80 libre para renovar el certificado.
6. **Speed → Optimization:** deja **Rocket Loader** desactivado (rompe la web).

Comprueba desde tu computadora que el dominio ya apunta al servidor:

```bash
nslookup tudominio.com
```

Debe mostrar la IP de tu servidor.

## 5. Entrar al servidor por SSH

```bash
ssh ubuntu@IP-DEL-SERVIDOR
```

La primera vez pregunta si confías en el servidor: escribe `yes`. Ya estás dentro: todo lo que escribas ahora se ejecuta en el servidor. Para salir, escribe `exit`.

> Si falla con «Permission denied (publickey)», indica la llave: `ssh -i ~/.ssh/id_ed25519 ubuntu@IP`. Si se queda esperando, revisa que el puerto 22 siga abierto en la Security List.

## 6. Ejecutar el instalador

En el servidor, copia estos comandos:

```bash
git clone https://github.com/CofferynDuque5/NV-Streaming.git ~/nv-streaming
cd ~/nv-streaming
bash infra/instalar.sh
```

> **Si el repositorio es privado**, GitHub pide usuario y contraseña. Crea un token de solo lectura en GitHub (_Settings → Developer settings → Fine-grained tokens_, permiso **Contents: Read** sobre este repositorio) y úsalo como contraseña. Luego guarda el acceso con `git config --global credential.helper store` para que las actualizaciones no lo vuelvan a pedir.

El instalador te hará unas preguntas:

| Pregunta                            | Qué responder                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Dominio de la tienda                | `tudominio.com` (sin `https://` ni `www`)                                                         |
| Tu correo                           | Tu correo de administración                                                                       |
| ¿Configuras ahora el correo (SMTP)? | `s` si ya tienes los datos de Brevo o Resend ([paso 9](#9-configurar-el-correo-smtp)); si no, `n` |
| Tu nombre para la cuenta de admin   | Como quieras que aparezca en el panel                                                             |

Qué hace, en orden (puedes leerlo en la cabecera de `infra/instalar.sh`):

1. Instala Docker desde el repositorio oficial de Docker, git y openssl.
2. Abre los puertos 80 y 443 dentro del servidor.
3. Crea memoria de intercambio (swap) si el servidor tiene menos de 8 GB de RAM.
4. Genera `.env.produccion` con **claves aleatorias fuertes**: contraseña de la base de datos, clave de cifrado de datos (`CLAVE_CIFRADO`) y clave de las copias de seguridad (`RESPALDO_CLAVE`).
5. Compila las imágenes (en la VM ARM tarda **de 5 a 15 minutos** la primera vez) y arranca todo. Las migraciones de la base de datos se aplican solas antes de la API.
6. Crea tu cuenta de administración y te muestra un **enlace de invitación**.

> ⚠️ **Muy importante:** a mitad de la instalación se muestran `CLAVE_CIFRADO` y `RESPALDO_CLAVE`. **Cópialas a tu gestor de contraseñas antes de seguir.** Si pierdes el servidor y no las tienes, las copias de seguridad no se pueden abrir y los datos cifrados (2FA, tokens de pagos) no se pueden leer. Mejor aún: guarda una copia completa de `.env.produccion` (`cat ~/nv-streaming/.env.produccion` y cópialo como nota segura).

El instalador se puede repetir sin miedo: salta lo que ya está hecho y **nunca** regenera las claves.

## 7. Primer ingreso y verificación en dos pasos

1. Abre el **enlace de invitación** que mostró el instalador (`https://tudominio.com/invitacion?token=…`). Sirve **una sola vez** y vence en **72 horas**. Si se te pasó: `bash infra/crear-admin.sh tu@correo.com "Tu nombre"` genera otro.
2. Elige tu contraseña (larga: una frase de 4 o 5 palabras es ideal). Nadie más la conoce, ni siquiera el instalador.
3. Entra en `https://tudominio.com/ingresar`. La web te pedirá **configurar la verificación en dos pasos**: escanea el código QR con tu app (Aegis, 2FAS…) y escribe el código de 6 cifras.
4. **Guarda los códigos de respaldo** que aparecen en tu gestor de contraseñas. Te sirven si pierdes el teléfono. (Otra persona con rol de administración también puede restablecerte el 2FA desde _Equipo y usuarios_.)

Nunca uses los usuarios de demostración (`admin@nv.test`, etc.): **no existen en producción** y el instalador no carga datos de prueba.

## 8. Activar la protección de Cloudflare

Cuando `https://tudominio.com` ya abre con candado (el certificado lo sacó Caddy en el paso 6):

1. En Cloudflare → **DNS**, cambia los registros `@` y `www` a **Proxied** (nube naranja).
2. Confirma que **SSL/TLS** sigue en **Full (strict)**.
3. Abre la tienda de nuevo. Si ves un error 52x, mira [Problemas frecuentes](#16-problemas-frecuentes).

Desde ahora los visitantes ven las IP de Cloudflare, no la de tu servidor. Caddy toma la IP real del visitante de la cabecera `CF-Connecting-IP` **solo** cuando la petición viene de Cloudflare (lista en `infra/caddy/cloudflare-ips.caddy`), así los límites de intentos por IP funcionan y nadie puede falsificar su IP.

Opcional (recomendado): **Security → Bots:** si activas «Bot Fight Mode», crea una regla (_Security → WAF → Custom rules_, acción **Skip**) para la ruta `/api/v1/pasarelas/` para que no bloquee los avisos de PayPal y Mercado Pago.

## 9. Configurar el correo (SMTP)

Sin correo, los clientes no pueden confirmar su cuenta ni recuperar su contraseña, y no salen los recordatorios de pago. Ejemplo con **Brevo** (gratis, 300 correos al día):

1. Crea la cuenta en [brevo.com](https://www.brevo.com).
2. **Senders, Domains & Dedicated IPs → Domains → Add a domain**: escribe tu dominio. Brevo te da registros DNS (TXT para SPF/DKIM y DMARC); créalos en Cloudflare → DNS (con la nube **gris**, son registros de texto). Esto evita que tus correos lleguen a spam.
3. **SMTP & API → SMTP**: copia _SMTP server_, _Port_ (587), _Login_ y genera una **SMTP key**.
4. En el servidor, edita la configuración:

   ```bash
   cd ~/nv-streaming
   nano .env.produccion
   ```

   Busca y completa (las comillas simples van incluidas):

   ```
   CORREO_REMITENTE='NV Streaming <no-responder@tudominio.com>'
   SMTP_HOST='smtp-relay.brevo.com'
   SMTP_PUERTO=587
   SMTP_SEGURO=false
   SMTP_USUARIO='tu-login@smtp-brevo.com'
   SMTP_CONTRASENA='tu-smtp-key'
   ```

   Guarda con `Ctrl+O`, Enter, y sal con `Ctrl+X`.

5. Aplica el cambio: `bash infra/actualizar.sh`.
6. Prueba: regístrate como cliente con otro correo tuyo y comprueba que llega el mensaje de confirmación. `bash infra/estado.sh` muestra cuántos correos salieron y cuántos fallaron.

## 10. Configurar el negocio

Entra al panel (`https://tudominio.com/admin`) y sigue este orden:

1. **Monedas y cobro** (_Finanzas_): registra la **tasa del dólar** del día y crea tus **métodos de cobro** (Pago Móvil, transferencia, Zelle, Binance… con las instrucciones que verá el cliente). Los pagos manuales con comprobante no pagan comisión.
2. **Automatizaciones:** activa la **tasa del BCV automática** (pulsa «Probar» antes de activarla), los recordatorios de vencimiento y los avisos. Comprueba que arriba diga que el trabajador está en marcha.
3. **Catálogo:** crea tus **proveedores**, **servicios** y **planes** con su precio en cada moneda. Solo lo que marques como visible aparece en `/planes`.
4. **Editor visual** (_Sitio_): la portada muestra un contenido por defecto; edítala y publícala con tus textos.
5. **Equipo y usuarios:** invita a tu equipo (operador, ventas). Cada invitación llega por correo y todos deben activar la verificación en dos pasos.
6. **Revendedores** (si trabajas con ellos): crea los niveles de precio mayorista.
7. **Cupones** (opcional).

Haz una compra de prueba completa con una cuenta de cliente tuya (pagar con comprobante → conciliar en _Cobros_) antes de anunciar la tienda.

## 11. Copias de seguridad fuera del servidor (Oracle Object Storage)

El servicio `respaldos` ya hace **cada noche a las 3:30 (hora de Venezuela)** una copia de la base de datos, de los comprobantes de pago y de `.env.produccion`, **cifrada con `RESPALDO_CLAVE`**, y guarda las últimas 7 en `/var/backups/nv-streaming`. Pero si el servidor se pierde, esas copias se pierden con él. Súbelas a **Oracle Object Storage** (20 GB gratis en el nivel Always Free):

1. Consola de Oracle → ☰ → **Storage → Buckets** → **Create Bucket**. Nombre: `nv-respaldos`, _Default Storage Tier_: **Standard**, visibilidad privada (por defecto).
2. En la página del bucket apunta el **Namespace** (un texto corto, p. ej. `axk3lqzq7abc`).
3. Tu región aparece arriba a la derecha; necesitas su identificador (p. ej. `us-ashburn-1`, `sa-saopaulo-1`).
4. Arriba a la derecha → tu perfil → **My profile** → **Customer secret keys** → **Generate secret key** → nombre `nv-respaldos`. Copia la **clave secreta** (solo se muestra una vez) y el **Access key** que aparece en la lista.
5. En el servidor, `nano ~/nv-streaming/.env.produccion` y completa:

   ```
   RESPALDO_REMOTO=oci:nv-respaldos
   RCLONE_CONFIG_OCI_ENDPOINT=https://NAMESPACE.compat.objectstorage.REGION.oraclecloud.com
   RCLONE_CONFIG_OCI_REGION=REGION
   RCLONE_CONFIG_OCI_ACCESS_KEY_ID=el-access-key
   RCLONE_CONFIG_OCI_SECRET_ACCESS_KEY=la-clave-secreta
   ```

   (Cambia `NAMESPACE` y `REGION` por los tuyos, p. ej. `https://axk3lqzq7abc.compat.objectstorage.us-ashburn-1.oraclecloud.com`.)

6. Aplica y prueba:

   ```bash
   bash infra/actualizar.sh
   bash infra/respaldar.sh
   ```

   Debe decir «Copia subida a oci:nv-respaldos/…». En la consola de Oracle verás una carpeta por copia. Las copias remotas de más de 30 días se borran solas (`RESPALDO_DIAS_REMOTO`).

7. **Prueba de restauración** (hazla ahora y una vez al mes): `bash infra/restaurar.sh probar`. Restaura la última copia en una base de datos temporal, compara las cifras con la base en uso y la borra. No toca nada de la tienda.

> Las copias están cifradas (GnuPG, AES-256) antes de salir del servidor: ni Oracle ni nadie con acceso al bucket puede leerlas sin `RESPALDO_CLAVE`.

## 12. Monitoreo con Uptime Kuma

Uptime Kuma te avisa (por Telegram, correo, etc.) si la tienda se cae o si una noche no hubo copia. No está publicado en internet: se abre con un **túnel SSH**.

1. En **tu computadora** (no en el servidor):

   ```bash
   ssh -L 3001:127.0.0.1:3001 ubuntu@IP-DEL-SERVIDOR
   ```

   Mientras esa ventana siga abierta, abre en tu navegador `http://localhost:3001`.

2. La primera vez crea el usuario de Uptime Kuma (contraseña larga).
3. **Add New Monitor**, estos cuatro:

| Tipo    | Nombre              | URL / dato                                 | Intervalo |
| ------- | ------------------- | ------------------------------------------ | --------- |
| HTTP(s) | Tienda              | `https://tudominio.com/`                   | 60 s      |
| HTTP(s) | API (pública)       | `https://tudominio.com/api/v1/salud`       | 60 s      |
| HTTP(s) | API (interna)       | `http://api:4000/api/v1/salud`             | 60 s      |
| Push    | Copias de seguridad | _Heartbeat Interval_: `93600` s (26 horas) | —         |

4. Del monitor **Push**, copia la URL que muestra y **cambia el principio** por `http://uptime-kuma:3001` (la dirección interna). Queda algo como `http://uptime-kuma:3001/api/push/AbCdEf?status=up&msg=OK&ping=`. Pégala en `.env.produccion` como `RESPALDO_URL_AVISO=…` y ejecuta `bash infra/actualizar.sh`. Cada copia correcta avisa a Kuma; si una noche falla, te llega la alerta.
5. **Settings → Notifications:** configura cómo quieres enterarte. Telegram es gratis y el más cómodo (Kuma explica cómo crear el bot).

> Uptime Kuma vive en el mismo servidor: si el servidor entero se apaga, no puede avisarte. Como segunda red, crea gratis un monitor externo en [UptimeRobot](https://uptimerobot.com) (plan gratuito, cada 5 minutos) para `https://tudominio.com/api/v1/salud`.

Además, `bash infra/estado.sh` te da en segundos un resumen de todo (servicios, HTTPS, trabajador, copias, correo, disco y memoria).

## 13. Opcional: pagos en línea, WhatsApp y asistente de IA

Todo se configura en `.env.produccion` y se aplica con `bash infra/actualizar.sh`.

### Pagos en línea (PayPal y Mercado Pago)

Sigue el [README, «Pagos en línea»](../README.md#pagos-en-línea). En producción:

- `PAYPAL_MODO=produccion` / `MERCADOPAGO_MODO=produccion` con las credenciales **Live**.
- La URL de avisos (webhook) es `https://tudominio.com/api/v1/pasarelas/paypal/webhook` (o `/mercadopago/webhook`); también la ves en `/admin/pagos-en-linea`.
- Crea después, en _Monedas y cobro_, un método de cobro de tipo «pasarela» por cada moneda.

### WhatsApp

Sigue el [README, «Automatizaciones y trabajador»](../README.md#automatizaciones-y-trabajador): `WHATSAPP_PROVEEDOR=cloud_api`, `WHATSAPP_TOKEN` y `WHATSAPP_TELEFONO_ID`, y crea en WhatsApp Manager las plantillas indicadas. Meta cobra cada mensaje de plantilla que inicia la empresa (ver [costos](#18-costos-lo-que-es-gratis-y-lo-que-no)); por eso los recordatorios salen por correo por defecto.

### Asistente de IA con Ollama (gratis, en tu servidor)

El modelo corre en la misma VM (usa unos 8–10 GB de RAM; la VM tiene 24 GB):

1. En `.env.produccion`:

   ```
   COMPOSE_PROFILES=ia
   OLLAMA_URL=http://ollama:11434
   OLLAMA_MODELO=qwen2.5:7b-instruct
   OLLAMA_TIEMPO_LIMITE_S=90
   ```

2. Aplica y descarga el modelo (unos 4,7 GB, tarda unos minutos):

   ```bash
   bash infra/actualizar.sh
   docker compose -f docker-compose.prod.yml --env-file .env.produccion exec ollama ollama pull qwen2.5:7b-instruct
   ```

3. En el panel, **/admin/asistente → Configuración**: actívalo, elige «Local (Ollama)» y fija los límites.

Ollama **no** se publica en internet (no tiene contraseña): solo la API lo usa por la red interna. En CPU ARM una respuesta tarda de 20 a 90 segundos. **Cloudflare corta cualquier respuesta a los 100 segundos**, por eso `OLLAMA_TIEMPO_LIMITE_S` no debe pasar de 90. Más detalles y la opción de pago con Claude en el [README, «Asistente de IA»](../README.md#asistente-de-ia).

## 14. Actualizar a una versión nueva

```bash
cd ~/nv-streaming
bash infra/actualizar.sh
```

Hace una copia de seguridad, descarga el código nuevo, compila las imágenes **mientras la tienda sigue atendiendo**, aplica las migraciones y reinicia solo lo que cambió. Durante el reinicio Caddy retiene las peticiones unos segundos, así que los visitantes casi no lo notan (en la prueba local, 60 de 60 peticiones respondieron bien durante un reinicio de la web). Al final muestra el estado.

El mismo comando aplica cualquier cambio que hagas en `.env.produccion`.

## 15. Restaurar una copia (y qué hacer si pierdes el servidor)

```bash
bash infra/restaurar.sh listar             # copias locales y en Object Storage
bash infra/restaurar.sh probar             # prueba con la última, sin tocar nada
bash infra/restaurar.sh descargar nv-20261001-033000   # baja una copia remota
bash infra/restaurar.sh real nv-20261001-033000        # REEMPLAZA los datos actuales
```

`real` pide que escribas `RESTAURAR`, hace antes una copia de lo que hay (por si te equivocas de copia), detiene la tienda, restaura la base de datos y los comprobantes, y la vuelve a arrancar. Todo lo ocurrido después de esa copia se pierde.

### Si el servidor se pierde por completo

Necesitas `RESPALDO_CLAVE` (de tu gestor de contraseñas) y una copia en Object Storage.

1. Crea una VM nueva ([paso 3](#3-crear-el-servidor-en-oracle-cloud)), apunta el DNS a la IP nueva ([paso 4](#4-poner-tu-dominio-en-cloudflare), en gris) y clona el repositorio ([paso 6](#6-ejecutar-el-instalador), **sin** ejecutar todavía el instalador).
2. En la consola de Oracle → bucket `nv-respaldos` → abre la carpeta de la última copia y descarga sus archivos a tu computadora. Súbelos al servidor:

   ```bash
   # En tu computadora, desde la carpeta donde se descargaron:
   scp -r nv-20261001-033000 ubuntu@IP-NUEVA:~/
   ```

3. En el servidor, recupera la configuración (pide `RESPALDO_CLAVE`):

   ```bash
   cd ~/nv-streaming
   gpg --decrypt ~/nv-20261001-033000/entorno.gpg > .env.produccion
   chmod 600 .env.produccion
   bash infra/instalar.sh
   ```

   El instalador ve que `.env.produccion` existe y lo reutiliza con las mismas claves. Arranca una tienda vacía.

4. Coloca la copia donde la busca el servicio y restáurala:

   ```bash
   sudo cp -r ~/nv-20261001-033000 /var/backups/nv-streaming/
   sudo chown -R "$(id -u):$(id -g)" /var/backups/nv-streaming
   bash infra/restaurar.sh real nv-20261001-033000
   ```

5. Comprueba con `bash infra/estado.sh`, entra al panel y activa de nuevo la nube naranja en Cloudflare.

## 16. Problemas frecuentes

Siempre empieza por `bash infra/estado.sh`. Para ver los mensajes de un servicio (`api`, `web`, `trabajador`, `caddy`, `postgres`, `respaldos`):

```bash
cd ~/nv-streaming
docker compose -f docker-compose.prod.yml --env-file .env.produccion logs --tail=100 api
```

| Síntoma                                                       | Causa probable y solución                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Out of capacity» al crear la VM                              | No hay máquinas ARM libres en ese momento. Prueba otro _Availability Domain_ o más tarde.                                                                                                                                                                     |
| `ssh` se queda esperando                                      | Puerto 22 cerrado en la Security List, o IP equivocada.                                                                                                                                                                                                       |
| La web no abre (tiempo de espera) con la nube gris            | Faltan las reglas 80/443 en la **Security List** de Oracle ([paso 3.4](#34-abrir-los-puertos-80-y-443-en-oracle)).                                                                                                                                            |
| El navegador avisa que el certificado no es válido            | Caddy no pudo obtenerlo: el DNS no apuntaba al servidor o el puerto 80 estaba cerrado. Mira `logs caddy`, corrige y ejecuta `bash infra/actualizar.sh`. Let's Encrypt limita a 5 intentos fallidos por hora: espera un rato si insististe mucho.              |
| Cloudflare **521** (Web server is down)                       | Los contenedores no están en marcha. `bash infra/estado.sh` y los logs de `caddy`/`web`.                                                                                                                                                                      |
| Cloudflare **522** (Connection timed out)                     | Cloudflare no llega al servidor: Security List o reglas de iptables. Vuelve a ejecutar `bash infra/instalar.sh` (repone las reglas).                                                                                                                          |
| Cloudflare **525/526** (SSL handshake / certificado inválido) | El servidor aún no tiene certificado válido. Pon la nube en gris, espera a que `https://tudominio.com` funcione y vuelve a la naranja. Si Let's Encrypt no funciona de ninguna forma, usa el **certificado de origen de Cloudflare** (abajo).                 |
| Cloudflare **524** (timeout)                                  | Una respuesta tardó más de 100 s (normalmente el asistente con Ollama). Baja `OLLAMA_TIEMPO_LIMITE_S` a 90 o menos.                                                                                                                                           |
| «Too many redirects»                                          | SSL/TLS de Cloudflare en «Flexible». Cámbialo a **Full (strict)**.                                                                                                                                                                                            |
| La API no arranca: «Configuración inválida. Revisa tu .env»   | El mensaje dice qué variable está mal (p. ej. un remitente con `example.com`, una URL sin `https`). Corrígela en `.env.produccion` y `bash infra/actualizar.sh`.                                                                                              |
| No llegan los correos                                         | Datos SMTP incorrectos o dominio sin verificar en Brevo/Resend (SPF/DKIM). `bash infra/estado.sh` muestra los fallidos; el motivo aparece en `logs api`. Revisa la carpeta de spam.                                                                           |
| «El trabajador no da señales»                                 | `logs trabajador`. Normalmente se arregla con `bash infra/actualizar.sh`. Sin trabajador no salen recordatorios ni se aplican vencimientos.                                                                                                                   |
| «Todavía no hay ninguna copia correcta» / copia antigua       | `logs respaldos`. Causas típicas: `RESPALDO_REMOTO` mal configurado (la copia local sí se hace), disco lleno.                                                                                                                                                 |
| Disco casi lleno                                              | `docker system prune -f` borra imágenes viejas; baja `RESPALDO_COPIAS_LOCALES`. Puedes ampliar el disco de arranque hasta 200 GB gratis.                                                                                                                      |
| Perdí el teléfono con el 2FA                                  | Usa un código de respaldo. Si no los tienes, otra persona de administración te lo restablece en _Equipo y usuarios_. Si eres la única, crea otra cuenta de administración con `bash infra/crear-admin.sh otro@correo.com "Nombre"` y restablécelo desde ella. |
| Olvidé la contraseña                                          | «¿Olvidaste tu contraseña?» en `/ingresar` (necesita el correo configurado).                                                                                                                                                                                  |
| `git pull` falla en `actualizar.sh`                           | Cambiaste archivos del repositorio a mano. `git status` los muestra; `git stash` los aparta. La configuración va solo en `.env.produccion`, que git no toca.                                                                                                  |

### Plan B para HTTPS: certificado de origen de Cloudflare

Si Let's Encrypt no consigue el certificado detrás de Cloudflare:

1. Cloudflare → **SSL/TLS → Origin Server → Create Certificate** (RSA, 15 años, con `tudominio.com` y `*.tudominio.com`).
2. En el servidor, guarda los dos textos que te da:

   ```bash
   nano ~/nv-streaming/infra/caddy/certs/origen.pem   # pega el «Origin Certificate»
   nano ~/nv-streaming/infra/caddy/certs/origen.key   # pega la «Private key»
   chmod 600 ~/nv-streaming/infra/caddy/certs/origen.key
   ```

3. En `.env.produccion` pon `CADDY_TLS=origen` y ejecuta `bash infra/actualizar.sh`.
4. Deja los registros DNS en **naranja** y SSL en **Full (strict)**: este certificado solo lo aceptan los servidores de Cloudflare.

Estos archivos no se suben a git (`infra/caddy/certs/` está excluida).

## 17. Lista de seguridad

- [ ] `CLAVE_CIFRADO`, `RESPALDO_CLAVE` y una copia de `.env.produccion` guardadas en tu gestor de contraseñas.
- [ ] La llave SSH privada guardada (y con frase de paso). Nadie más entra al servidor.
- [ ] Verificación en dos pasos activada y códigos de respaldo guardados, para ti y para todo el equipo.
- [ ] SSL/TLS de Cloudflare en **Full (strict)** y los registros con la nube naranja.
- [ ] Solo los puertos 22, 80 y 443 abiertos en la Security List. Nunca abras 5432 (PostgreSQL), 3001 (Uptime Kuma) ni 11434 (Ollama).
- [ ] Copias subiendo a Object Storage y una **prueba de restauración** superada este mes (`bash infra/restaurar.sh probar`).
- [ ] Uptime Kuma con notificaciones y el monitor _Push_ de las copias.
- [ ] Dominio verificado en el proveedor de correo (SPF/DKIM) para que los correos no parezcan falsos.
- [ ] Pasarelas en modo `produccion` solo con credenciales Live, y sin variables de pruebas (`*_API_URL`, `*_SANDBOX_*`): la API no arranca si las encuentra.
- [ ] Actualiza cada mes (`bash infra/actualizar.sh`) y el sistema del servidor: `sudo apt update && sudo apt upgrade -y` (y `sudo reboot` si lo pide).
- [ ] `.env.produccion` nunca se comparte ni se sube a ningún sitio (el instalador lo deja con permisos `600`).

## 18. Costos: lo que es gratis y lo que no

| Concepto                                                                     | Costo                                                                                                                                                                              |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Software (NV Streaming, Docker, PostgreSQL, Caddy, Uptime Kuma, Ollama, k6…) | **Gratis**, todo de código abierto.                                                                                                                                                |
| Servidor Oracle Cloud Always Free                                            | **Gratis** mientras uses solo recursos «Always Free» (4 OCPU ARM, 24 GB, 200 GB de disco, 20 GB de Object Storage, 10 TB de tráfico al mes).                                       |
| Cloudflare (plan Free)                                                       | **Gratis**.                                                                                                                                                                        |
| Certificados HTTPS                                                           | **Gratis** (Let's Encrypt o certificado de origen de Cloudflare).                                                                                                                  |
| Correo transaccional                                                         | **Gratis** dentro del plan gratuito (Brevo: 300 al día; Resend: 3 000 al mes). Si creces, planes de pago desde unos 10–20 USD al mes.                                              |
| **Dominio**                                                                  | **De pago:** unos 10–15 USD al año para un `.com`. Es lo único imprescindible que se paga.                                                                                         |
| Pagos manuales (Pago Móvil, transferencia…)                                  | **Gratis** para NV (las comisiones son las de tu banco).                                                                                                                           |
| PayPal / Mercado Pago (opcional)                                             | **Comisión por venta** según país y tipo de pago (en cobros internacionales de PayPal suele rondar el 5–6 % más una tarifa fija). Sin cuota mensual. Consulta la tabla de tu país. |
| WhatsApp Cloud API (opcional)                                                | **Meta cobra cada mensaje de plantilla** que inicia la empresa (recordatorios, avisos), con precio por país. Responder dentro de las 24 h a un cliente que escribió es gratis.     |
| Asistente con Claude (opcional)                                              | **Por uso** (tokens), con tope de gasto mensual configurable en el panel. El asistente local con Ollama es gratis.                                                                 |
| Oracle «Pay As You Go» (opcional)                                            | La cuenta no cobra mientras uses solo recursos Always Free; si creas algo fuera de ellos (una VM más grande, más disco), sí. Pon una alerta de presupuesto.                        |

Para el día a día (revisiones diarias y semanales, prueba de carga), sigue [docs/OPERACION.md](OPERACION.md).
