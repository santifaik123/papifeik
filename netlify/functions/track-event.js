const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function resp(statusCode, body) {
  return {
    statusCode,
    headers: CORS,
    body: JSON.stringify(body),
  };
}

function clean(value, maxLen = 160) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return resp(405, { ok: false, error: "Método no permitido" });
  }

  let data;
  try {
    data = JSON.parse(event.body || "{}");
  } catch {
    return resp(400, { ok: false, error: "JSON inválido" });
  }

  const payload = {
    event: clean(data.event, 60).toLowerCase(),
    label: clean(data.label, 120),
    path: clean(data.path, 160) || "/",
    href: clean(data.href, 240),
    title: clean(data.title, 120),
    contact: clean(data.contact, 80),
    text: clean(data.text, 120),
    error: clean(data.error, 180),
    ts: clean(data.ts, 40),
    referer: clean(event.headers.referer || event.headers.referrer || "", 240),
    userAgent: clean(event.headers["user-agent"] || "", 200),
  };

  if (!payload.event || !/^[a-z0-9_:-]{2,60}$/i.test(payload.event)) {
    return resp(422, { ok: false, error: "Evento inválido" });
  }

  console.log("nuvik_track_event", JSON.stringify(payload));

  return resp(202, { ok: true });
};
