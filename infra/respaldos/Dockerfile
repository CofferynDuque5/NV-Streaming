# Imagen del servicio de copias de seguridad: cliente de PostgreSQL 16 (el mismo que el
# servidor), gpg para cifrar (ya viene en la imagen Debian de PostgreSQL) y rclone para
# subir las copias a almacenamiento compatible con S3 (p. ej. Oracle Object Storage,
# Always Free). No descarga paquetes al compilar. Funciona en amd64 y arm64.
ARG POSTGRES_IMAGEN=postgres:16-bookworm
ARG RCLONE_IMAGEN=rclone/rclone:1

FROM ${RCLONE_IMAGEN} AS rclone

FROM ${POSTGRES_IMAGEN}
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY infra/respaldos/respaldar.sh /usr/local/bin/respaldar
COPY infra/respaldos/restaurar.sh /usr/local/bin/restaurar
COPY infra/respaldos/programador.sh /usr/local/bin/programador
# rclone se configura solo con variables RCLONE_CONFIG_* (.env.produccion): archivo vacío.
RUN chmod 755 /usr/local/bin/respaldar /usr/local/bin/restaurar /usr/local/bin/programador \
    && touch /etc/rclone.conf && chmod 644 /etc/rclone.conf \
    && rclone version >/dev/null && gpg --version >/dev/null
ENV TZ=America/Caracas \
    GNUPGHOME=/tmp/gnupg \
    RCLONE_CONFIG=/etc/rclone.conf
# Sin privilegios. En docker-compose.prod.yml corre con el uid del dueño del servidor
# (NV_UID); la restauración real se lanza como root solo para devolver los comprobantes
# a su carpeta (infra/restaurar.sh).
USER postgres
ENTRYPOINT []
CMD ["programador"]
