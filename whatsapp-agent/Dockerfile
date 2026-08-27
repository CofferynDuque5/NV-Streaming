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

# Al arrancar: aplica el esquema, asegura el admin, siembra el catálogo de
# ejemplo (idempotente) y levanta la API. Así la web no arranca vacía.
CMD ["sh", "-c", "npm run migrate && (npx tsx src/scripts/crear-admin.ts \"$ADMIN_EMAIL\" \"$ADMIN_PASS\" || true) && (npx tsx src/scripts/seed-cms.ts seed-cms.example.json || true) && node dist/index.js"]
