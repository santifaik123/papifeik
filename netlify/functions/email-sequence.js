/**
 * email-sequence.js — Netlify Scheduled Function
 * Corre una vez por día (@daily) y envía los emails de seguimiento
 * a los leads que corresponden según su email_step y email_next_at.
 *
 * Secuencia:
 *   Step 1 → enviado en create-lead.js (bienvenida inmediata)
 *   Step 2 → día 2:  "Lo que ya está funcionando en Nuvik"
 *   Step 3 → día 4:  "La pregunta más común antes de arrancar"
 *   Step 4 → día 7:  "15 minutos contigo"
 *   Step 5 → día 14: "Un último mensaje antes de archivar"
 *   Step 6 → DONE — no se envían más emails
 *
 * Requisitos:
 *   - DATABASE_URL (Neon)
 *   - RESEND_API_KEY
 *   - Haber corrido db-migration.sql en la base de datos
 */

const { neon } = require("@neondatabase/serverless");
const { Resend } = require("resend");

// ── Intervalos en días entre emails ───────────────────────────
const INTERVALS = { 1: 2, 2: 3, 3: 3, 4: 7 };
// step 1→2: +2d | step 2→3: +3d (total 5d) | step 3→4: +3d (total 8d) | step 4→5: +7d (total 15d)

// ── Contenido de cada email ───────────────────────────────────

function getEmailContent(step, lead) {
  const nombre = lead.nombre || "ahí";
  const base   = "https://nuvik.digital";

  const STYLE = `font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#07131C;color:#EFEEEA;padding:32px;border-radius:10px`;
  const MUTED = `color:#94A3B8;line-height:1.7;font-size:14px`;
  const BRAND = `margin:0 0 4px;font-size:11px;color:#4670E6;letter-spacing:.12em;text-transform:uppercase;font-weight:600`;
  const H2    = `margin:8px 0 20px;font-size:20px;color:#EFEEEA;line-height:1.3`;
  const BOX   = `background:#0D1E30;border-radius:8px;padding:20px;margin:0 0 20px`;
  const BTN   = `display:inline-block;margin-top:20px;padding:12px 28px;background:#2563EB;color:#fff;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px`;
  const FOOT  = `color:#64748B;font-size:12px;margin:20px 0 0;border-top:1px solid #1B2B40;padding-top:20px`;

  if (step === 1) {
    // Step 2 email: prueba real de lo que ya existe
    return {
      subject: `${nombre}, esto ya está funcionando hoy en Nuvik`,
      html: `<div style="${STYLE}">
        <p style="${BRAND}">nuvik.digital</p>
        <h2 style="${H2}">Mientras coordinamos, te mostramos lo que ya está activo.</h2>
        <p style="${MUTED}">Nuestra forma de trabajar se basa en resultados que puedes ver antes de comprometerte. Esto es lo que ya opera hoy:</p>
        <div style="${BOX}">
          <p style="margin:0 0 8px;font-weight:600;color:#EFEEEA">🔵 Dar.io — Software de gestión</p>
          <p style="margin:0 0 16px;${MUTED}">Ventas, inventario, costos y margen desde un dashboard. Puedes ver la demo completa en <a href="${base}/dario" style="color:#4670E6;text-decoration:none">nuvik.digital/dario</a>.</p>
          <p style="margin:0 0 8px;font-weight:600;color:#EFEEEA">🟣 NexusChatBot — Atención 24/7</p>
          <p style="margin:0;${MUTED}">El chatbot que atiende clientes incluso cuando el equipo no está disponible. Ya corre en este mismo sitio — <a href="${base}/nexuschatbot" style="color:#8b5cf6;text-decoration:none">nuvik.digital/nexuschatbot</a>.</p>
        </div>
        <p style="${MUTED}">Te contactamos pronto para coordinar los detalles de tu proyecto.</p>
        <p style="${FOOT}">— Nuvik Digital · <a href="mailto:helpnuvik@outlook.com" style="color:#4670E6;text-decoration:none">helpnuvik@outlook.com</a></p>
      </div>`,
    };
  }

  if (step === 2) {
    // Step 3 email: objeción de tiempo y proceso
    return {
      subject: "¿Cuánto demora realmente? (La respuesta honesta)",
      html: `<div style="${STYLE}">
        <p style="${BRAND}">nuvik.digital</p>
        <h2 style="${H2}">La pregunta que casi todos hacen antes de arrancar.</h2>
        <p style="${MUTED}">¿Cuánto tiempo toma un sitio web? La respuesta directa: entre 3 y 7 días hábiles según el plan.</p>
        <div style="${BOX}">
          <p style="margin:0 0 6px;${MUTED}"><strong style="color:#EFEEEA">Starter (Landing page):</strong> 3 días hábiles desde el brief.</p>
          <p style="margin:0 0 6px;${MUTED}"><strong style="color:#EFEEEA">Pro (hasta 8 páginas):</strong> 5–7 días hábiles.</p>
          <p style="margin:0;${MUTED}"><strong style="color:#EFEEEA">Commerce (tienda online):</strong> 7–10 días hábiles.</p>
        </div>
        <p style="${MUTED}">Lo único que necesitas para arrancar: contarnos qué quieres lograr. El resto lo manejamos nosotros.</p>
        <a href="${base}?contact=Consulta+general#contacto" style="${BTN}">Retomar la conversación →</a>
        <p style="${FOOT}">— Nuvik Digital · <a href="mailto:helpnuvik@outlook.com" style="color:#4670E6;text-decoration:none">helpnuvik@outlook.com</a></p>
      </div>`,
    };
  }

  if (step === 3) {
    // Step 4 email: agenda una llamada
    return {
      subject: "15 minutos — ¿te parece?",
      html: `<div style="${STYLE}">
        <p style="${BRAND}">nuvik.digital</p>
        <h2 style="${H2}">Prefiero hablar contigo 15 minutos que escribir 10 emails.</h2>
        <p style="${MUTED}">Hola ${nombre}, te escribo directo. Una llamada corta nos permite entender exactamente qué necesitas y armar una propuesta que tenga sentido para tu negocio — sin adivinanzas.</p>
        <p style="${MUTED}">Sin compromiso. Sin pitch de ventas agresivo. Solo una conversación para ver si encajamos.</p>
        <a href="https://cal.com/nuvik.digital/15min" style="${BTN}">Agendar 15 minutos →</a>
        <p style="${MUTED}" style="margin-top:16px">O si prefieres, responde este email directamente y te doy opciones de horario.</p>
        <p style="${FOOT}">— Santiago, CEO · Nuvik Digital<br><a href="mailto:helpnuvik@outlook.com" style="color:#4670E6;text-decoration:none">helpnuvik@outlook.com</a></p>
      </div>`,
    };
  }

  if (step === 4) {
    // Step 5 email: breakup suave
    return {
      subject: "Antes de cerrar tu solicitud...",
      html: `<div style="${STYLE}">
        <p style="${BRAND}">nuvik.digital</p>
        <h2 style="${H2}">Un último mensaje antes de archivar.</h2>
        <p style="${MUTED}">Hola ${nombre}. Guardamos tu solicitud y entendemos que los tiempos no siempre se alinean.</p>
        <p style="${MUTED}">Si el proyecto sigue en mente para más adelante, aquí vamos a estar. Y si surgió alguna duda o algo cambió en lo que necesitas, puedes responder este email cuando quieras.</p>
        <a href="${base}?contact=Consulta+general#contacto" style="${BTN}">Retomar cuando estés listo →</a>
        <p style="${MUTED}" style="margin-top:16px;font-size:13px">Te desuscribimos de los seguimientos automáticos desde hoy. Solo te escribiremos si tú lo pides primero.</p>
        <p style="${FOOT}">— Nuvik Digital · <a href="mailto:helpnuvik@outlook.com" style="color:#4670E6;text-decoration:none">helpnuvik@outlook.com</a></p>
      </div>`,
    };
  }

  return null; // step >= 5 = done
}

// ── HANDLER ───────────────────────────────────────────────────

exports.handler = async () => {
  if (!process.env.DATABASE_URL || !process.env.RESEND_API_KEY) {
    console.warn("email-sequence: faltan env vars DATABASE_URL o RESEND_API_KEY");
    return { statusCode: 200, body: JSON.stringify({ skipped: true }) };
  }

  const sql    = neon(process.env.DATABASE_URL);
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Buscar leads con secuencia pendiente
  let leads;
  try {
    leads = await sql`
      SELECT id, nombre, email, tipo, email_step, created_at
      FROM leads
      WHERE email_step BETWEEN 1 AND 4
        AND email_next_at IS NOT NULL
        AND email_next_at <= NOW()
      ORDER BY email_next_at ASC
      LIMIT 100
    `;
  } catch (err) {
    console.error("email-sequence: error consultando leads:", err.message);
    // Probablemente la migración aún no fue aplicada
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: "migration_pending" }) };
  }

  let sent = 0;
  let failed = 0;

  for (const lead of leads) {
    const content = getEmailContent(lead.email_step, lead);
    if (!content) continue;

    const nextStep    = lead.email_step + 1;
    const interval    = INTERVALS[lead.email_step];
    const nextAt      = interval
      ? new Date(Date.now() + interval * 24 * 60 * 60 * 1000).toISOString()
      : null;

    try {
      await resend.emails.send({
        from: "Santiago — Nuvik Digital <notificaciones@nuvik.digital>",
        to: lead.email,
        reply_to: "helpnuvik@outlook.com",
        subject: content.subject,
        html: content.html,
      });

      await sql`
        UPDATE leads
        SET email_step    = ${nextStep},
            email_next_at = ${nextAt}
        WHERE id = ${lead.id}
      `;

      sent++;
    } catch (err) {
      console.error(`email-sequence: error enviando a lead ${lead.id}:`, err.message);
      failed++;
    }
  }

  console.log(`email-sequence: sent=${sent} failed=${failed} total=${leads.length}`);
  return {
    statusCode: 200,
    body: JSON.stringify({ sent, failed, total: leads.length }),
  };
};
