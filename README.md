# Vitals Live — Demo de Venta

> **Objetivo:** mostrar el producto (pulso + estrés con cámara) sin revelar todas las capacidades. Ideal para demos a clientes o inversores.

## Contenido
- `index.html`: landing + modal con **Demo en Vivo** (pulso y estrés).
- `presentation.html`: **presentación** navegable con flechas ⇦ ⇨.
- `styles.css`, `app.js`: estilos y lógica de medición (rPPG).
- `manifest.webmanifest`, `sw.js`: PWA básica (instalable).
- `assets/logo.svg`: logo simple.

## Requisitos
- **HTTPS o `localhost`** para acceder a la cámara (requisito de navegador).
- Navegadores soportados: Chrome/Edge/Firefox (desktop y Android), Safari (iOS).
- **No médico**: precisión dependiente de luz, movimiento y calidad de cámara.

## Ejecutar en local
1. Descarga y descomprime el zip.
2. En la carpeta del proyecto, ejecuta **uno** de estos:
   - Python 3: `python -m http.server 8000`
   - Node: `npx http-server`
3. Abre `http://localhost:8000` y pulsa **Demo en vivo** → **Iniciar**.
4. En iPhone/Android: abre el sitio en **HTTPS** o en `localhost` para que funcione la cámara.

## Publicar rápido
- **Netlify**: arrastra y suelta la carpeta (obtendrás un URL HTTPS).
- **GitHub Pages**: activa Pages en el repo (branch `main`).

## Notas de demo
- Muestra **Pulso (BPM)** y **Estrés (0–100)**. Métricas “Pro” quedan bloqueadas visualmente.
- ROI (rectángulo) sugiere al usuario alinear la frente.
- No se sube el video. El cálculo ocurre en el dispositivo.

## Limitaciones
- La señal puede degradarse con mala iluminación o movimiento.
- HRV/respiración no se muestran en esta demo (quedan para versión Pro).

## Licencia
MIT (demo).
