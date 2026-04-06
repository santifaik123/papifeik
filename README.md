# Nuvik Digital

Sitio estático de `nuvik.digital` con tres páginas públicas:

- `index.html`: home y funnel principal de cotización
- `dario.html`: landing de Dar.io
- `nexuschatbot.html`: landing de NexusChatBot

## Funnel principal

La home es el canal principal de captación. Todos los CTA de cotización y demo vuelven a:

- `index.html?contact=...#contacto`

El formulario envía leads reales a `/.netlify/functions/create-lead` y precarga la necesidad seleccionada según el CTA de origen.

## Funciones Netlify

- `netlify/functions/create-lead.js`
  Guarda leads, aplica validaciones, honeypots y rate limits.
- `netlify/functions/track-event.js`
  Recibe eventos livianos del frontend para aperturas de formulario, submits, errores y clics clave.

## SEO técnico

El repo incluye:

- `robots.txt`
- `sitemap.xml`
- metadata `canonical`, Open Graph, Twitter Cards y JSON-LD en las tres páginas públicas
- `social-card.svg` como imagen compartida para previews sociales

## Variables de entorno esperadas

- `DATABASE_URL`
- `RESEND_API_KEY` opcional

## Notas de despliegue

- El sitio está pensado para Netlify.
- `netlify.toml` ya apunta a `netlify/functions`.
- Si se instala una suite de analytics más completa, puede convivir con `track-event.js` o reemplazarlo.
