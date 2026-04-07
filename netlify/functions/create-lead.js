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

// ── EMAIL BIENVENIDA AL CLIENTE (secuencia paso 1) ─────────────

function htmlBienvenida(nombre, tipo) {
  const tipoLabel = tipo || "tu proyecto";
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#07131C;color:#EFEEEA;padding:32px;border-radius:10px">
      <p style="margin:0 0 4px;font-size:11px;color:#4670E6;letter-spacing:.12em;text-transform:uppercase;font-weight:600">nuvik.digital</p>
      <h2 style="margin:8px 0 24px;font-size:22px;color:#EFEEEA;line-height:1.3">Recibimos tu solicitud, ${nombre}.</h2>
      <p style="color:#94A3B8;line-height:1.7;margin:0 0 20px">Estamos revisando los detalles de <strong style="color:#EFEEEA">${tipoLabel}</strong> y te contactamos en menos de 24 horas para coordinar los próximos pasos.</p>
      <div style="background:#0D1E30;border-radius:8px;padding:20px;margin:0 0 24px">
        <p style="margin:0 0 12px;font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.1em;font-weight:600">¿Qué sigue?</p>
        <ol style="margin:0;padding-left:18px;color:#94A3B8;line-height:2;font-size:14px">
          <li>Revisamos tu solicitud en detalle</li>
          <li>Te enviamos una propuesta o coordinamos una llamada corta</li>
          <li>Arrancamos cuando estés conforme con el plan</li>
        </ol>
      </div>
      <p style="color:#94A3B8;line-height:1.7;margin:0 0 24px;font-size:14px">
        Mientras tanto, puedes explorar lo que ya tenemos activo en
        <a href="https://nuvik.digital" style="color:#4670E6;text-decoration:none">nuvik.digital</a>
        — el chatbot, Dar.io y el sistema de contacto están todos funcionando en producción.
      </p>
      <p style="color:#64748B;font-size:13px;margin:0;border-top:1px solid #1B2B40;padding-top:20px">
        — Santiago &amp; Nicolás, fundadores de Nuvik Digital<br>
        <a href="mailto:helpnuvik@outlook.com" style="color:#4670E6;text-decoration:none">helpnuvik@outlook.com</a>
      </p>
    </div>
  `;
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

  const {
    nombre, email, negocio, tipo, presupuesto, mensaje, web, website_hp, _t,
    utm_source, utm_medium, utm_campaign, utm_content,
    referrer, landing_page, device,
  } = data;

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
  if (String(nombre).trim().length < 2)    return resp(422, { ok: false, error: "Nombre demasiado corto" });
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

  // Fecha del próximo email de secuencia (2 días desde ahora)
  const emailNextAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

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
  const globalCount = await sql`
    SELECT COUNT(*) as count FROM leads
    WHERE created_at > NOW() - INTERVAL '1 hour'
  `;
  if (parseInt(globalCount[0].count) >= 100) {
    return resp(429, { ok: false, error: "Servicio temporalmente no disponible" });
  }

  // Insertar lead — con UTMs y columnas de secuencia de email si la migración fue aplicada
  try {
    await sql`
      INSERT INTO leads (
        nombre, email, negocio, tipo, mensaje, web_actual, source, ip_address,
        email_step, email_next_at,
        utm_source, utm_medium, utm_campaign, utm_content,
        referrer_url, device_type, landing_page
      )
      VALUES (
        ${limpiar(nombre, 100)},
        ${emailLimpio},
        ${limpiar(negocio, 150)},
        ${limpiar(tipo, 100)},
        ${limpiar(mensaje, 2000)},
        ${limpiar(web, 200)},
        ${"nuvik_web"},
        ${ip},
        ${1},
        ${emailNextAt},
        ${limpiar(utm_source, 120)},
        ${limpiar(utm_medium, 120)},
        ${limpiar(utm_campaign, 120)},
        ${limpiar(utm_content, 120)},
        ${limpiar(referrer, 240)},
        ${limpiar(device, 20)},
        ${limpiar(landing_page, 240)}
      )
    `;
  } catch (dbError) {
    // Si las columnas nuevas no existen aún (migración pendiente), hacer INSERT básico
    if (dbError.message && (dbError.message.includes("column") || dbError.message.includes("does not exist"))) {
      console.warn("Columnas nuevas no encontradas — usando INSERT básico. Ejecuta db-migration.sql");
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
      } catch (fallbackError) {
        console.error("DB fallback error:", fallbackError);
        return resp(500, { ok: false, error: "Error al guardar el mensaje" });
      }
    } else {
      console.error("DB error:", dbError);
      return resp(500, { ok: false, error: "Error al guardar el mensaje" });
    }
  }

  // Emails (si RESEND_API_KEY está configurado)
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const nombreLimpio = limpiar(nombre, 100);
    const tipoLimpio   = limpiar(tipo, 100);

    const emails = [
      // 1. Notificación interna al equipo Nuvik
      resend.emails.send({
        from: "Nuvik Digital <notificaciones@nuvik.digital>",
        to: "helpnuvik@outlook.com",
        reply_to: emailLimpio,
        subject: `Nueva cotización — ${nombreLimpio}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#07131C;color:#EFEEEA;padding:32px;border-radius:10px">
            <h2 style="margin:0 0 24px;font-size:22px;color:#EFEEEA">
              Nueva cotización desde <span style="color:#4670E6">nuvik.digital</span>
            </h2>
            <table style="width:100%;border-collapse:collapse">
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0;width:140px">Nombre</td>
                <td style="padding:12px 0">${nombreLimpio}</td>
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
                <td style="padding:12px 0;color:#8E94A0">Tipo</td>
                <td style="padding:12px 0">${tipoLimpio ?? "—"}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Presupuesto</td>
                <td style="padding:12px 0">${limpiar(presupuesto, 50) ?? "—"}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Web actual</td>
                <td style="padding:12px 0">${limpiar(web, 200) ?? "No tiene"}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Fuente UTM</td>
                <td style="padding:12px 0;font-size:12px;color:#8E94A0">
                  ${limpiar(utm_source, 80) || "directo"} /
                  ${limpiar(utm_medium, 80) || "—"} /
                  ${limpiar(utm_campaign, 80) || "—"}
                </td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Dispositivo</td>
                <td style="padding:12px 0;font-size:12px;color:#8E94A0">${limpiar(device, 20) || "—"}</td>
              </tr>
              <tr style="border-bottom:1px solid #1B2B40">
                <td style="padding:12px 0;color:#8E94A0">Referrer</td>
                <td style="padding:12px 0;font-size:12px;color:#8E94A0">${limpiar(referrer, 120) || "directo"}</td>
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
      }),

      // 2. Email de bienvenida al cliente (paso 1 de la secuencia)
      resend.emails.send({
        from: "Santiago — Nuvik Digital <notificaciones@nuvik.digital>",
        to: emailLimpio,
        reply_to: "helpnuvik@outlook.com",
        subject: "Recibimos tu solicitud en Nuvik Digital",
        html: htmlBienvenida(nombreLimpio, tipoLimpio),
      }),
    ];

    // Ambos emails en paralelo — no bloquean la respuesta si alguno falla
    await Promise.allSettled(emails);
  }

  return resp(200, { ok: true, message: "Mensaje enviado correctamente" });
};
