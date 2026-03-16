const { neon } = require("@neondatabase/serverless");
const { Resend } = require("resend");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── LISTAS NEGRAS ─────────────────────────────────────────────

const DOMINIOS_DESECHABLES = [
  "mailinator.com","tempmail.com","guerrillamail.com","10minutemail.com",
  "throwaway.email","yopmail.com","sharklasers.com","guerrillamailblock.com",
  "grr.la","guerrillamail.info","guerrillamail.biz","guerrillamail.de",
  "guerrillamail.net","guerrillamail.org","spam4.me","trashmail.com",
  "trashmail.me","trashmail.net","dispostable.com","maildrop.cc",
  "mailnull.com","spamgourmet.com","fakeinbox.com","mailcatch.com",
  "tempr.email","discard.email","spamfree24.org","spamfree.eu",
  "spam.la","spaml.de","spaml.com","mailexpire.com","mailfreeonline.com",
  "tempalias.com","tempemail.com","tempemail.net","tempinbox.com",
  "tempmail.eu","tempmailo.com","tempomail.fr","temporaryemail.net",
  "throwam.com","trashmail.at","trashmail.io","trashmail.xyz",
  "wegwerfmail.de","wegwerfmail.net","wegwerfmail.org","xagloo.com",
  "yopmail.fr","zehnminuten.de","zehnminutenmail.de","zippymail.info",
];

const PALABRAS_SPAM = [
  "casino","crypto","bitcoin","nft","forex","trading bot","invest now",
  "lottery","you have won","prize","click here","buy now","free money",
  "make money fast","earn money","work from home","mlm","pyramid scheme",
  "ponzi","viagra","cialis","pharmacy","pills","drugs","weapon","gun",
  "ammo","explosiv","terror","nigerian prince","inheritance","payday loan",
  "lose weight fast","diet pills","enlargement",
];

// ── HELPERS ───────────────────────────────────────────────────

function getIP(event) {
  return (
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers["client-ip"] ||
    event.headers["x-real-ip"] ||
    "unknown"
  );
}

function limpiar(str, maxLen = 500) {
  if (!str) return null;
  return String(str).trim().slice(0, maxLen);
}

function tieneSpam(texto) {
  const lower = texto.toLowerCase();
  return PALABRAS_SPAM.some((p) => lower.includes(p));
}

function contarLinks(texto) {
  const urlRegex = /(https?:\/\/|www\.)[^\s]+/gi;
  return (texto.match(urlRegex) || []).length;
}

function tieneHTML(texto) {
  return /<[^>]*>/i.test(texto);
}

function esEmailValido(email) {
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  return re.test(email);
}

function esDominioDesechable(email) {
  const dominio = email.split("@")[1]?.toLowerCase();
  return DOMINIOS_DESECHABLES.includes(dominio);
}

function resp(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) };
}

// ── HANDLER ───────────────────────────────────────────────────

exports.handler = async (event) => {

  // OPTIONS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  // Solo POST
  if (event.httpMethod !== "POST") {
    return resp(405, { ok: false, error: "Método no permitido" });
  }

  // Content-Type debe ser JSON
  const contentType = event.headers["content-type"] || "";
  if (!contentType.includes("application/json")) {
    return resp(415, { ok: false, error: "Content-Type inválido" });
  }

  // Tamaño máximo del body: 10KB
  const bodySize = Buffer.byteLength(event.body || "", "utf8");
  if (bodySize > 10240) {
    return resp(413, { ok: false, error: "Payload demasiado grande" });
  }

  // Parse JSON
  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return resp(400, { ok: false, error: "JSON inválido" });
  }

  const { nombre, email, negocio, tipo, mensaje, web, website_hp, _t } = data;

  // Honeypot de campo oculto — bots lo llenan
  if (website_hp && String(website_hp).trim() !== "") {
    return resp(200, { ok: true }); // Silencioso
  }

  // Honeypot de tiempo — bots envían en < 3 segundos
  if (_t) {
    const elapsed = Date.now() - parseInt(_t, 10);
    if (elapsed < 3000) {
      return resp(200, { ok: true }); // Silencioso
    }
  }

  // Campos obligatorios
  if (!nombre || !email || !mensaje) {
    return resp(422, { ok: false, error: "Faltan campos obligatorios" });
  }

  // Longitudes
  if (String(nombre).trim().length < 2)   return resp(422, { ok: false, error: "Nombre demasiado corto" });
  if (String(nombre).trim().length > 100)  return resp(422, { ok: false, error: "Nombre demasiado largo" });
  if (String(mensaje).trim().length < 10)  return resp(422, { ok: false, error: "Mensaje demasiado corto" });
  if (String(mensaje).trim().length > 2000) return resp(422, { ok: false, error: "Mensaje demasiado largo" });

  // Validación de email
  const emailLimpio = String(email).trim().toLowerCase();
  if (!esEmailValido(emailLimpio)) {
    return resp(422, { ok: false, error: "Email inválido" });
  }

  // Dominio desechable
  if (esDominioDesechable(emailLimpio)) {
    return resp(422, { ok: false, error: "Por favor usa un email real" });
  }

  // HTML / XSS en campos
  const todosLosCampos = [nombre, mensaje, negocio, tipo, web].filter(Boolean).join(" ");
  if (tieneHTML(todosLosCampos)) {
    return resp(422, { ok: false, error: "Contenido no permitido" });
  }

  // Demasiados links en mensaje
  if (contarLinks(String(mensaje)) > 1) {
    return resp(422, { ok: false, error: "Demasiados enlaces en el mensaje" });
  }

  // Palabras spam — silencioso para no dar pistas
  if (tieneSpam(String(mensaje))) {
    return resp(200, { ok: true });
  }

  // Nombre sin ninguna letra real
  if (!/[a-zA-ZáéíóúñüÁÉÍÓÚÑÜ]/.test(String(nombre))) {
    return resp(422, { ok: false, error: "Nombre inválido" });
  }

  // DATABASE_URL requerida
  if (!process.env.DATABASE_URL) {
    return resp(500, { ok: false, error: "Error de configuración" });
  }

  const sql = neon(process.env.DATABASE_URL);
  const ip = getIP(event);

  // Rate limit por email: máx 3 en 24 horas
  const porEmail = await sql`
    SELECT COUNT(*) as count FROM leads
    WHERE email = ${emailLimpio}
    AND created_at > NOW() - INTERVAL '24 hours'
  `;
  if (parseInt(porEmail[0].count) >= 3) {
    return resp(429, { ok: false, error: "Has enviado demasiados mensajes hoy. Intenta mañana." });
  }

  // Rate limit por IP: máx 5 en 1 hora
  if (ip !== "unknown") {
    const porIP = await sql`
      SELECT COUNT(*) as count FROM leads
      WHERE ip_address = ${ip}
      AND created_at > NOW() - INTERVAL '1 hour'
    `;
    if (parseInt(porIP[0].count) >= 5) {
      return resp(429, { ok: false, error: "Demasiadas solicitudes. Intenta más tarde." });
    }
  }

  // Rate limit global: máx 100 leads por hora (protección DDoS)
  const global = await sql`
    SELECT COUNT(*) as count FROM leads
    WHERE created_at > NOW() - INTERVAL '1 hour'
  `;
  if (parseInt(global[0].count) >= 100) {
    return resp(429, { ok: false, error: "Servicio temporalmente no disponible" });
  }

  // Insertar lead
  try {
    await sql`
      INSERT INTO leads (nombre, email, negocio, tipo, mensaje, web_actual, source, ip_address)
      VALUES (
        ${limpiar(nombre, 100)},
        ${emailLimpio},
        ${limpiar(negocio, 150)},
        ${limpiar(tipo, 100)},
        ${limpiar(mensaje, 2000)},
        ${limpiar(web, 200)},
        ${"nuvik_web"},
        ${ip}
      )
    `;
  } catch (dbError) {
    console.error("DB error:", dbError);
    return resp(500, { ok: false, error: "Error al guardar el mensaje" });
  }

  // Enviar email con Resend (opcional — no falla si no está configurado)
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: "Nuvik Digital <notificaciones@nuvik.digital>",
        to: "helpnuvik@outlook.com",
        reply_to: emailLimpio,
        subject: `Nueva cotización — ${limpiar(nombre, 100)}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#07131C;color:#EFEEEA;padding:32px;border-radius:10px">
            <h2 style="margin:0 0 24px;font-size:22px;color:#EFEEEA">
              Nueva cotización desde <span style="color:#4670E6">nuvik.digital</span>
            </h2>
            <table style="width:100%;border-collapse:collapse">
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0;width:140px">Nombre</td>
                <td style="padding:12px 0">${limpiar(nombre, 100)}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Email</td>
                <td style="padding:12px 0">${emailLimpio}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Negocio</td>
                <td style="padding:12px 0">${limpiar(negocio, 150) ?? "—"}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Tipo de proyecto</td>
                <td style="padding:12px 0">${limpiar(tipo, 100) ?? "—"}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Web actual</td>
                <td style="padding:12px 0">${limpiar(web, 200) ?? "No tiene"}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">IP</td>
                <td style="padding:12px 0;font-size:12px;color:#8E94A0">${ip}</td>
              </tr>
              <tr>
                <td style="padding:16px 0 0;color:#8E94A0;vertical-align:top">Mensaje</td>
                <td style="padding:16px 0 0;line-height:1.6">${limpiar(mensaje, 2000).replace(/\n/g, "<br>")}</td>
              </tr>
            </table>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Resend error:", emailError);
      // No falla — el lead ya está guardado en DB
    }
  }

  return resp(200, { ok: true, message: "Mensaje enviado correctamente" });
};
