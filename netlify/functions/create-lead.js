const { neon } = require("@neondatabase/serverless");
const { Resend } = require("resend");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS,
      body: JSON.stringify({
        ok: false,
        error: "Method not allowed",
      }),
    };
  }

  try {
    const data = JSON.parse(event.body || "{}");

    const {
      nombre,
      email,
      negocio,
      tipo,
      mensaje,
      web,
      website_hp,
    } = data;

    // Honeypot anti-spam
    if (website_hp && String(website_hp).trim() !== "") {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ ok: true }),
      };
    }

    if (!nombre || !email || !mensaje) {
      return {
        statusCode: 422,
        headers: CORS,
        body: JSON.stringify({
          ok: false,
          error: "Faltan campos obligatorios",
        }),
      };
    }

    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailValido) {
      return {
        statusCode: 422,
        headers: CORS,
        body: JSON.stringify({
          ok: false,
          error: "Email inválido",
        }),
      };
    }

    if (!process.env.DATABASE_URL) {
      return {
        statusCode: 500,
        headers: CORS,
        body: JSON.stringify({
          ok: false,
          error: "DATABASE_URL no configurada",
        }),
      };
    }

    const sql = neon(process.env.DATABASE_URL);

    await sql`
      INSERT INTO leads (
        nombre,
        email,
        negocio,
        tipo,
        mensaje,
        web_actual,
        source
      )
      VALUES (
        ${String(nombre).trim()},
        ${String(email).trim().toLowerCase()},
        ${negocio ? String(negocio).trim() : null},
        ${tipo ? String(tipo).trim() : null},
        ${String(mensaje).trim()},
        ${web ? String(web).trim() : null},
        ${"nuvik_web"}
      )
    `;

    // Resend es opcional — solo envía si está configurado
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from: "Nuvik Digital <notificaciones@nuvik.digital>",
        to: "helpnuvik@outlook.com",
        reply_to: String(email).trim(),
        subject: `Nueva cotización — ${String(nombre).trim()}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#07131C;color:#EFEEEA;padding:32px;border-radius:10px">
            <h2 style="margin:0 0 24px;font-size:22px;color:#EFEEEA">
              Nueva cotización desde <span style="color:#4670E6">nuvik.digital</span>
            </h2>

            <table style="width:100%;border-collapse:collapse">
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0;width:140px">Nombre</td>
                <td style="padding:12px 0">${String(nombre).trim()}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Email</td>
                <td style="padding:12px 0">${String(email).trim()}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Negocio</td>
                <td style="padding:12px 0">${negocio ? String(negocio).trim() : "—"}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Tipo de proyecto</td>
                <td style="padding:12px 0">${tipo ? String(tipo).trim() : "—"}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Web actual</td>
                <td style="padding:12px 0">${web ? String(web).trim() : "No tiene"}</td>
              </tr>
              <tr>
                <td style="padding:16px 0 0;color:#8E94A0;vertical-align:top">Mensaje</td>
                <td style="padding:16px 0 0;line-height:1.6">${String(mensaje)
                  .trim()
                  .replace(/\n/g, "<br>")}</td>
              </tr>
            </table>
          </div>
        `,
      });
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        ok: true,
        message: "Lead guardado correctamente",
      }),
    };
  } catch (error) {
    console.error("create-lead error:", error);

    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({
        ok: false,
        error: "Error al procesar el formulario",
      }),
    };
  }
};
