const { neon }  = require("@neondatabase/serverless");
const { Resend } = require("resend");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  // Honeypot — bots fill this, humans don't
  if (data.website_hp && data.website_hp.trim() !== "") {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }

  const { nombre, email, negocio, tipo, mensaje, web } = data;

  if (!nombre || !email || !mensaje) {
    return {
      statusCode: 422,
      headers: CORS,
      body: JSON.stringify({ error: "Faltan campos obligatorios" }),
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      statusCode: 422,
      headers: CORS,
      body: JSON.stringify({ error: "Email inválido" }),
    };
  }

  try {
    // ── 1. Guardar en Neon (columnas en inglés, schema real) ──
    const sql = neon(process.env.DATABASE_URL);

    await sql`
      INSERT INTO leads (
        name,
        email,
        business,
        project_type,
        message,
        has_website,
        source
      )
      VALUES (
        ${nombre},
        ${email},
        ${negocio || null},
        ${tipo || null},
        ${mensaje},
        ${web || null},
        ${"nuvik_web"}
      )
    `;

    // ── 2. Enviar email con Resend (solo si la key existe) ────
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from:    "Nuvik Digital <onboarding@resend.dev>",
        to:      "helpnuvik@outlook.com",
        replyTo: email,
        subject: `Nueva cotización — ${nombre}${negocio ? " / " + negocio : ""}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#07131C;color:#EFEEEA;padding:40px;border-radius:8px">
            <h2 style="margin:0 0 24px;font-size:22px;color:#EFEEEA">
              Nueva cotización desde <span style="color:#4670E6">nuvik.digital</span>
            </h2>
            <table style="width:100%;border-collapse:collapse">
              <tr style="border-bottom:1px solid #152840">
                <td style="padding:12px 0;color:#8E94A0;font-size:13px;width:140px">Nombre</td>
                <td style="padding:12px 0;font-size:15px">${nombre}</td>
              </tr>
              <tr style="border-bottom:1px solid #152840">
                <td style="padding:12px 0;color:#8E94A0;font-size:13px">Email</td>
                <td style="padding:12px 0;font-size:15px">${email}</td>
              </tr>
              <tr style="border-bottom:1px solid #152840">
                <td style="padding:12px 0;color:#8E94A0;font-size:13px">Negocio</td>
                <td style="padding:12px 0;font-size:15px">${negocio || "—"}</td>
              </tr>
              <tr style="border-bottom:1px solid #152840">
                <td style="padding:12px 0;color:#8E94A0;font-size:13px">Tipo</td>
                <td style="padding:12px 0;font-size:15px">${tipo || "—"}</td>
              </tr>
              <tr style="border-bottom:1px solid #152840">
                <td style="padding:12px 0;color:#8E94A0;font-size:13px">Web actual</td>
                <td style="padding:12px 0;font-size:15px">${web || "No tiene"}</td>
              </tr>
              <tr>
                <td style="padding:16px 0 0;color:#8E94A0;font-size:13px;vertical-align:top">Mensaje</td>
                <td style="padding:16px 0 0;font-size:15px;line-height:1.6">${mensaje.replace(/\n/g, "<br>")}</td>
              </tr>
            </table>
            <div style="margin-top:32px;padding-top:24px;border-top:1px solid #152840;font-size:12px;color:#3E5060">
              nuvik.digital · ${new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })}
            </div>
          </div>
        `,
      });
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ ok: true }),
    };

  } catch (err) {
    console.error("Function error:", err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: "Error al procesar. Intentalo de nuevo." }),
    };
  }
};
