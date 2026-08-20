# BRANDING.md — Poner tu logo y tu marca

El logo que trae el proyecto es un **placeholder genérico de NV**, no tu logo. Toda la identidad está centralizada; para cambiarla no hace falta tocar el HTML.

## 1. Reemplaza los 3 archivos de logo (misma ruta y mismo nombre)

Sustituye estos ficheros por los tuyos en `site/assets/` **conservando el nombre**:

| Archivo | Dónde se usa | Formato recomendado |
|---|---|---|
| `assets/logo-nv-header.svg` | **Header** (barra superior) — lockup horizontal | SVG horizontal, ~210×40 |
| `assets/logo-nv.svg` | **Footer y menú lateral** — logo/monograma | SVG cuadrado o monograma |
| `assets/favicon-nv.svg` | **Favicon** (pestaña del navegador) | SVG cuadrado |

> Si mantienes los nombres, no tienes que tocar nada más. Puedes usar PNG en vez de SVG, pero entonces ajusta las rutas en `config.js` (siguiente punto).

## 2. Ajusta textos y rutas en `site/js/config.js`

En `NV_CONFIG.marca` (mismo archivo para nombre, wordmark y rutas):

```js
marca: {
  nombre: "NV Streaming",              // ← tu nombre de marca
  subtitulo: "Nathan y Valeryn Streaming",  // ← tu subtítulo/eslogan
  logo: {
    texto: "NV",                       // fallback si no carga la imagen
    wordmark: "STREAMING",
    imagen: ASSETS + "logo-nv-header.svg",   // ← cambia si usas otro nombre/PNG
    gradiente: "linear-gradient(135deg,#0A3AAE,#00CFFF 60%,#9B3FFF)",
  },
},
```

## 3. (Opcional) Logo desde el panel de administración

El header también acepta un logo subido desde el Back Office: si en Firestore existe `configuracion_sistema/tema_interfaz.logo_url_img`, **ese tiene prioridad** sobre el archivo local (útil para cambiarlo sin re-desplegar). Orden de prioridad del header: **BD (`tema.logo_url_img`) → `config.js` (`marca.logo.imagen`) → `assets/logo-nv-header.svg`**.

## 4. Colores de marca

En el mismo `config.js`, `NV_CONFIG.colores` define la paleta (azul/violeta/rosa). Cámbiala por la tuya; el tema de Firestore (`tema_interfaz`) puede sobreescribirla en caliente.

---

### Nota sobre consistencia
El header usa el **lockup horizontal** (`logo-nv-header.svg`) y el footer/menú usan el **monograma** (`logo-nv.svg`). Es intencional (cada sitio pide un formato), pero para que se vean como la misma marca, asegúrate de que ambos SVG compartan tu identidad visual (mismos colores/símbolo).
