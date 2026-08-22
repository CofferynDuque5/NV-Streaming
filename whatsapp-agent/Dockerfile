# Backend NV Streaming (Node + TypeScript → PostgreSQL).
FROM node:20-alpine
WORKDIR /app

# Dependencias (capa cacheable).
COPY package*.json ./
RUN npm install --no-audit --no-fund

# Código + compilación.
COPY . .
RUN npm run build

EXPOSE 3000

# Al arrancar: aplica el esquema, asegura el admin (idempotente) y levanta la API.
CMD ["sh", "-c", "npm run migrate && (npx tsx src/scripts/crear-admin.ts \"$ADMIN_EMAIL\" \"$ADMIN_PASS\" || true) && node dist/index.js"]
