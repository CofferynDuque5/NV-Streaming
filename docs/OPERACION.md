# Operación diaria: guía rápida

Lo que hay que revisar para que la tienda siga sana. Todos los comandos se ejecutan en el servidor, dentro de la carpeta del proyecto (`cd ~/nv-streaming`). La instalación y la solución de problemas están en [INSTALACION.md](INSTALACION.md).

## Cada día (2 minutos)

- Revisa las alertas de **Uptime Kuma** (Telegram o correo). Si no llegó nada, todo respondió.
- En el panel: **Cobros → Pagos por conciliar** y **Revendedores → Recargas por conciliar**. Los clientes esperan su activación.
- **Soporte:** tickets abiertos.
- **Automatizaciones:** que diga que el trabajador está en marcha y que la tasa del día se aplicó (o regístrala a mano).

## Cada semana (10 minutos)

```bash
bash infra/estado.sh
```

Debe terminar en «Todo en orden». Revisa en especial:

| Línea               | Qué hacer si falla                                                            |
| ------------------- | ----------------------------------------------------------------------------- |
| Servicios           | Algún servicio no está «healthy»: mira sus logs (INSTALACION.md, sección 16). |
| Certificado HTTPS   | Menos de 14 días: Caddy no está renovando. Mira `logs caddy`.                 |
| Trabajador          | Sin latido: los recordatorios y vencimientos están parados.                   |
| Copias de seguridad | Más de 26 h sin copia correcta: mira `logs respaldos`.                        |
| Correo              | Correos sin enviar: revisa el SMTP.                                           |
| Disco               | Por encima del 85 %: `docker system prune -f`.                                |

Y en el panel: **Automatizaciones → avisos** con errores, y la **Auditoría** de acciones sensibles que no reconozcas.

## Cada mes (30 minutos)

1. **Prueba de restauración** (la única forma de saber que las copias sirven):

   ```bash
   bash infra/restaurar.sh probar
   ```

   Debe terminar en «PRUEBA SUPERADA» con las mismas cifras en la copia y en uso.

2. **Actualizar NV Streaming** (hace copia previa y casi no se nota):

   ```bash
   bash infra/actualizar.sh
   ```

3. **Actualizar el sistema del servidor:**

   ```bash
   sudo apt update && sudo apt upgrade -y
   # Si al final dice «System restart required»:
   sudo reboot
   ```

   Tras reiniciar, los contenedores arrancan solos. Comprueba con `bash infra/estado.sh`.

4. Revisa en **Equipo y usuarios** que todas las cuentas del equipo sigan siendo necesarias.
5. En la consola de Oracle, que el bucket `nv-respaldos` tenga copias recientes y no pase de 20 GB.

## Comandos útiles

```bash
bash infra/estado.sh                      # resumen de salud
bash infra/respaldar.sh                   # copia de seguridad ahora
bash infra/restaurar.sh listar            # ver copias
bash infra/crear-admin.sh correo "Nombre" # otra cuenta de administración
bash infra/actualizar.sh                  # nueva versión o aplicar cambios de .env.produccion

# Logs de un servicio (api, web, trabajador, caddy, postgres, respaldos, uptime-kuma):
docker compose -f docker-compose.prod.yml --env-file .env.produccion logs --tail=100 -f api
# Reiniciar un servicio:
docker compose -f docker-compose.prod.yml --env-file .env.produccion restart web
```

Los logs rotan solos (5 archivos de 10 MB por servicio) y las horas de los logs de la API y la web están en UTC (Venezuela = UTC−4).

## Prueba de carga

Sirve para saber cuánto aguanta la tienda antes de una campaña. Usa [k6](https://k6.io) (gratis) con su imagen de Docker, sin instalar nada. El script `infra/carga/prueba.js` simula:

- **Visitantes** que abren la portada, `/planes`, `/ingresar` y la salud de la API (30 simultáneos por defecto).
- **Clientes con sesión** viendo su panel (`/cuenta`) (10 simultáneos).
- **Inicios de sesión** (solo 3, porque la API limita 8 intentos por cuenta cada 15 minutos).

Crea antes una **cuenta de cliente de prueba** (regístrate con un correo tuyo, sin 2FA) y ejecuta desde tu computadora o desde el servidor:

```bash
docker run --rm -i --network host -v "$PWD/infra/carga:/carga" grafana/k6 run \
  -e BASE_URL=https://tudominio.com \
  -e CORREO=cliente-prueba@tudominio.com -e CONTRASENA='la-contraseña' \
  -e VUS=30 -e DURACION=1m \
  /carga/prueba.js
```

Al final k6 marca con ✓ o ✗ cada umbral:

| Umbral (percentil 95)                            | Límite   |
| ------------------------------------------------ | -------- |
| Portada y `/planes`                              | < 800 ms |
| `/ingresar`                                      | < 500 ms |
| Salud de la API                                  | < 300 ms |
| Panel del cliente                                | < 1,2 s  |
| Datos de la sesión (API)                         | < 400 ms |
| Inicio de sesión (Argon2id es lento a propósito) | < 2 s    |
| Errores                                          | < 1 %    |

Consejos:

- Hazla en horas de poco tráfico y con cifras realistas. Contra el dominio público pasa por Cloudflare, que puede tomar muchas peticiones seguidas desde una sola IP como un ataque; para medir solo el servidor, ejecútala **en el servidor** con `-e BASE_URL=https://tudominio.com` y añade `--add-host tudominio.com:127.0.0.1` a `docker run` (antes de la imagen).
- Tras la prueba, suspende la cuenta de cliente de prueba en el panel.

### Resultados de referencia

Pila de producción completa (`docker-compose.prod.yml`, mismas imágenes y límites de memoria) en una máquina de pruebas x86 de 4 núcleos y 16 GB, con k6 en la misma máquina, Caddy con HTTPS y sin Cloudflare. **60 visitantes y 20 clientes con sesión simultáneos durante 1 minuto:**

| Página            | p95    | Mediana |
| ----------------- | ------ | ------- |
| Portada           | 54 ms  | 22 ms   |
| `/planes`         | 47 ms  | 15 ms   |
| `/ingresar`       | 39 ms  | 13 ms   |
| Salud de la API   | 5 ms   | 3 ms    |
| Panel del cliente | 456 ms | 38 ms   |
| Sesión (API)      | 9 ms   | 4 ms    |
| Inicio de sesión  | 125 ms | 114 ms  |

3 805 peticiones (40 por segundo), **0 % de errores**, todos los umbrales cumplidos. Memoria en reposo tras la prueba: API ~130 MB, web ~105 MB, trabajador ~100 MB, PostgreSQL ~50 MB. La VM ARM de Oracle (4 OCPU Ampere) es algo más lenta por núcleo que esa máquina: cuenta con tiempos algo mayores, pero con mucho margen para una tienda de este tamaño. Repite la prueba en tu servidor tras instalarlo para tener tus propias cifras.
