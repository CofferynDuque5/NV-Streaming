# INSTALLATION.md — Instalación

Para desarrollo local y para preparar el despliegue. El paso a producción está en `docs/DEPLOYMENT.md`.

---

## 1. Requisitos
- Node.js **≥ 20**, npm **≥ 10**
- Firebase CLI: `npm install -g firebase-tools`
- PostgreSQL (local o gestionado)
- Cuentas: Firebase (Blaze), OpenAI, WhatsApp Cloud API, ImgBB

## 2. Estructura
```
NV-STREAMING-V1/
├── site/              # frontend estático (→ tu public_html)
├── functions/         # Cloud Functions (Firebase)
├── whatsapp-agent/    # backend Node/TS + Postgres + IA
├── firebase.json .firebaserc firestore.indexes.json storage.rules
├── .env.example
├── docs/
└── README.md
```

## 3. Frontend (`site/`)
No requiere build ni `npm install` (JS nativo, Firebase por CDN). Para probar en local sírvelo con cualquier servidor estático:
```bash
cd site
npx serve .          # o: python3 -m http.server 8080
```
Configura antes `site/js/firebase-config.js` y `site/js/config.js` (ver `docs/FIREBASE.md`, `docs/ENVIRONMENT.md`).

## 4. Cloud Functions (`functions/`)
```bash
cd functions
npm install
```
Despliegue en `docs/CLOUD-FUNCTIONS.md`.

## 5. Backend (`whatsapp-agent/`)
```bash
cd whatsapp-agent
cp ../.env.example .env      # rellénalo
npm install
npm run migrate              # esquema Postgres
npm run dev                  # desarrollo (tsx watch)  |  producción: npm run build && npm start
```
Comprobaciones útiles:
```bash
npm run typecheck            # verifica el TypeScript (verificado OK en esta release)
npm test                     # tests de la lógica
```

---

## 6. Hosting del frontend (tu hosting, NO Vercel)

El frontend es **HTML/CSS/JS 100% estático** — no necesita Node ni build en el servidor.

| Pregunta | Respuesta |
|---|---|
| ¿Qué subo? | **El contenido de la carpeta `site/`** (index.html, *.html, `js/`, `css/`, `assets/`) a tu `public_html`. |
| ¿Necesita Node en el servidor? | **No** (el frontend). El **backend** `whatsapp-agent` sí necesita un host con Node aparte. |
| ¿Apache/Nginx? | Cualquiera sirve archivos estáticos. |
| ¿Rewrite rules? | **No es una SPA:** cada página es un `.html` propio (`catalogo.html`, `mi-cuenta.html`…). No necesitas reescrituras a `index.html`. Sí conviene una página 404 y forzar HTTPS. |
| HTTPS | **Obligatorio** (Firebase Auth y la cámara/portapapeles lo exigen). Usa el SSL de tu hosting o Let's Encrypt. |
| Caché | Cachea `js/css/assets` (semana) y sirve los `.html` con `no-cache` para que los cambios se vean. Ejemplo en `firebase.json → hosting.headers` si usas Firebase Hosting. |
| Service Worker | **No hay** service worker/PWA en v1.0. Nada que registrar. |
| Dominio | Añade tu dominio en Firebase Auth → *Authorized domains*, y apunta `api.base`/`AGENT_URL` al dominio del backend. |

Ejemplo Nginx para el **backend**:
```nginx
server {
  server_name api.tudominio.com;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
  # + certbot para HTTPS
}
```
