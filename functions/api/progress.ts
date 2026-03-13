interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

async function verifyJWT(token: string, secret: string): Promise<any> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token");
  const enc = new TextEncoder();
  const data = `${parts[0]}.${parts[1]}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = Uint8Array.from(atob(parts[2]), (c) => c.charCodeAt(0));
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    enc.encode(data),
  );
  if (!valid) throw new Error("Invalid signature");
  const payload = JSON.parse(atob(parts[1]));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000))
    throw new Error("Token expired");
  return payload;
}

function getAuth(request: Request, secret: string) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) throw new Error("No token");
  return verifyJWT(auth.slice(7), secret);
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

// GET: Fetch all progress for user
export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const payload = await getAuth(context.request, context.env.JWT_SECRET);
    const rows = await context.env.DB.prepare(
      "SELECT mode, sector, sent_idx, play_count, time_left, updated_at FROM progress WHERE user_id = ?",
    )
      .bind(payload.sub)
      .all();

    const progress: Record<string, any> = {};
    for (const r of rows.results) {
      progress[r.mode as string] = {
        sector: r.sector,
        sentIdx: r.sent_idx,
        playCount: r.play_count,
        timeLeft: r.time_left,
      };
    }
    return new Response(JSON.stringify(progress), { headers: cors });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 401,
      headers: cors,
    });
  }
};

// POST: Save progress for a mode
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const payload = await getAuth(context.request, context.env.JWT_SECRET);
    const { mode, sector, sentIdx, playCount, timeLeft } =
      (await context.request.json()) as any;

    if (!mode) {
      return new Response(JSON.stringify({ error: "mode required" }), {
        status: 400,
        headers: cors,
      });
    }

    await context.env.DB.prepare(
      `
      INSERT INTO progress (user_id, mode, sector, sent_idx, play_count, time_left, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, mode) DO UPDATE SET
        sector = excluded.sector, sent_idx = excluded.sent_idx,
        play_count = excluded.play_count, time_left = excluded.time_left,
        updated_at = datetime('now')
    `,
    )
      .bind(
        payload.sub,
        mode,
        sector || 0,
        sentIdx || 0,
        playCount || 0,
        timeLeft || 300,
      )
      .run();

    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: e.message.includes("token") ? 401 : 500,
      headers: cors,
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: cors });
};
