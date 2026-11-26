# Pasar la base de datos de Neon a Supabase

Se hace con la copia de seguridad del propio servidor: se detiene la tienda, se copia
todo lo de Neon y se restaura en Supabase. Neon queda intacta como respaldo.

Tiempo con la tienda detenida: unos 5–10 minutos.

## Antes de empezar (en supabase.com)

1. Crea un proyecto nuevo, plan gratis, región **South America (São Paulo)**.
2. Contraseña de la base: **solo letras y números** (sin símbolos), porque va dentro de una
   dirección. Guárdala en tu gestor de contraseñas.
3. En el proyecto, botón **Connect** → pestaña **Session pooler**. Anota:
   - el **host** (algo como `aws-0-sa-east-1.pooler.supabase.com`)
   - el **usuario** (`postgres.` seguido del Project ID)

   No uses la conexión directa (`db.xxxx.supabase.co`): solo funciona por IPv6.

## En el servidor (un comando a la vez)

```bash
ssh root@104.250.142.174
cd ~/nv-streaming
git pull
cp .env.produccion .env.produccion.neon
```

Detén la tienda (así nada cambia mientras se copia):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.produccion stop caddy web trabajador api
```

Copia de seguridad de Neon (anota el nombre `nv-AAAAMMDD-HHMMSS` que aparece al final):

```bash
bash infra/respaldar.sh
```

Crea la base `nv` en Supabase (cambia HOST y USUARIO; te pedirá la contraseña):

```bash
docker run --rm -it postgres:17 psql "host=HOST port=5432 dbname=postgres user=USUARIO sslmode=require" -c "CREATE DATABASE nv"
```

Edita la configuración:

```bash
nano .env.produccion
```

Cambia estas líneas (deja todo lo demás igual) y guarda con Ctrl+O, Enter, Ctrl+X:

```
BASE_HOST=HOST
POSTGRES_USER=USUARIO
POSTGRES_PASSWORD=CONTRASEÑA
POSTGRES_DB=nv
DATABASE_URL=postgresql://USUARIO:CONTRASEÑA@HOST:5432/nv?sslmode=require
BASE_AHORRO=false
RESPALDO_PG_VERSION=17
```

(`RESPALDO_PG_VERSION` no existe todavía: agrégala al final.)

Prepara el servicio de copias para Supabase (PostgreSQL 17):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.produccion up -d --build --no-deps respaldos
```

Restaura la copia de Neon en Supabase (cambia el nombre; escribe RESTAURAR cuando lo pida).
Al terminar, la tienda arranca sola ya con Supabase:

```bash
bash infra/restaurar.sh real nv-AAAAMMDD-HHMMSS
```

## Comprobar

```bash
bash infra/estado.sh
bash infra/respaldar.sh
bash infra/restaurar.sh probar ultima
```

Entra al panel y revisa clientes, revendedores, Plataformas y cuentas.

## Si algo sale mal: volver a Neon

Neon no se tocó. Vuelve a la configuración anterior:

```bash
cp .env.produccion.neon .env.produccion
bash infra/actualizar.sh
```

## Límite de conexiones

El «Session pooler» del plan gratis de Supabase deja unas 15 conexiones a la vez. La API
abre hasta 10 (`DB_CONEXIONES_MAX`, por defecto 10) y el trabajador 3
(`TRABAJADOR_CONEXIONES_MAX` en `.env.produccion`, por defecto 3). Si la suma pasa del
tope, la base rechaza consultas: el panel se queda cargando o no muestra datos. Si subes de
plan en Supabase puedes subir esos dos números.
