interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

async function createJWT(payload: object, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const sigStr = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigStr}`;
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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const action = url.searchParams.get("action") || "login";
    const { username, password } = (await context.request.json()) as any;

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "아이디와 비밀번호를 입력해주세요" }),
        { status: 400, headers: cors },
      );
    }

    if (action === "register") {
      if (username.length < 2) {
        return new Response(
          JSON.stringify({ error: "아이디는 2자 이상이어야 합니다" }),
          { status: 400, headers: cors },
        );
      }
      if (password.length < 4) {
        return new Response(
          JSON.stringify({ error: "비밀번호는 4자 이상이어야 합니다" }),
          { status: 400, headers: cors },
        );
      }

      const existing = await context.env.DB.prepare(
        "SELECT id FROM users WHERE username = ?",
      )
        .bind(username)
        .first();
      if (existing) {
        return new Response(
          JSON.stringify({ error: "이미 사용중인 아이디입니다" }),
          { status: 409, headers: cors },
        );
      }

      const salt = btoa(
        String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
      );
      const passwordHash = await hashPassword(password, salt);

      const result = await context.env.DB.prepare(
        "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
      )
        .bind(username, passwordHash, salt)
        .run();

      const userId = result.meta.last_row_id;
      const token = await createJWT(
        {
          sub: userId,
          username,
          exp: Math.floor(Date.now() / 1000) + 86400 * 30,
        },
        context.env.JWT_SECRET,
      );

      return new Response(JSON.stringify({ token, username, userId }), {
        status: 201,
        headers: cors,
      });
    } else {
      // login
      const user = (await context.env.DB.prepare(
        "SELECT id, username, password_hash, salt FROM users WHERE username = ?",
      )
        .bind(username)
        .first()) as any;

      if (!user) {
        return new Response(
          JSON.stringify({ error: "아이디 또는 비밀번호가 틀렸습니다" }),
          { status: 401, headers: cors },
        );
      }

      const hash = await hashPassword(password, user.salt);
      if (hash !== user.password_hash) {
        return new Response(
          JSON.stringify({ error: "아이디 또는 비밀번호가 틀렸습니다" }),
          { status: 401, headers: cors },
        );
      }

      await context.env.DB.prepare(
        "UPDATE users SET last_login = datetime('now') WHERE id = ?",
      )
        .bind(user.id)
        .run();

      const token = await createJWT(
        {
          sub: user.id,
          username: user.username,
          exp: Math.floor(Date.now() / 1000) + 86400 * 30,
        },
        context.env.JWT_SECRET,
      );

      return new Response(
        JSON.stringify({ token, username: user.username, userId: user.id }),
        { headers: cors },
      );
    }
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: "Server error", _debug: e.message }),
      { status: 500, headers: cors },
    );
  }
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  // Logout or token verification
  const url = new URL(context.request.url);
  const action = url.searchParams.get("action");

  if (action === "logout") {
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  // Verify token
  const auth = context.request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "No token" }), {
      status: 401,
      headers: cors,
    });
  }

  try {
    const payload = await verifyJWT(auth.slice(7), context.env.JWT_SECRET);
    return new Response(
      JSON.stringify({ username: payload.username, userId: payload.sub }),
      { headers: cors },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 401,
      headers: cors,
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { headers: cors });
};
