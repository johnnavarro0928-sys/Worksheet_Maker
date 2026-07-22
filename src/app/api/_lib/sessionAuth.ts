import crypto from "node:crypto";

export type AppStoreSessionClaims = {
  sub: string;
  exp: number;
  iat?: number;
  email?: string;
  role?: string;
  aud?: string;
  jti?: string;
  typ?: "access" | "session";
};

const SESSION_COOKIE_NAME = "worksheet_maker_session";
const DEFAULT_AUDIENCE = "worksheet-maker";

function getEnvValue(key: string): string | undefined {
  return process.env[key];
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isLocalRequest(request: Request): boolean {
  try {
    const hostname = new URL(request.url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function signPayload(payload: string, secret: string): string {
  return base64Url(crypto.createHmac("sha256", secret).update(payload).digest());
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isAuthEnabled(request: Request): boolean {
  const configured = getEnvValue("APPSTORE_AUTH_ENABLED")?.trim().toLowerCase();
  if (configured === "false" || configured === "0" || configured === "no") return false;
  if (configured === "true" || configured === "1" || configured === "yes") return true;
  return !isLocalRequest(request);
}

function getClockSkewSeconds(): number {
  return Math.max(0, Math.min(120, parseIntEnv(getEnvValue("APPSTORE_ALLOWED_CLOCK_SKEW_SECONDS"), 20)));
}

function getMaxAccessTtlSeconds(): number {
  return Math.max(30, Math.min(3600, parseIntEnv(getEnvValue("APPSTORE_MAX_TOKEN_TTL_SECONDS"), 120)));
}

function getSessionMaxAgeSeconds(): number {
  return Math.max(300, Math.min(86400, parseIntEnv(getEnvValue("APPSTORE_SESSION_MAX_AGE_SECONDS"), 3600)));
}

function getSharedSecret(): string {
  const secret = getEnvValue("WORKSHEET_MAKER_SHARED_SECRET") || getEnvValue("APPSTORE_SHARED_SECRET") || "";
  if (!secret) throw new Error("Missing WORKSHEET_MAKER_SHARED_SECRET or APPSTORE_SHARED_SECRET");
  return secret;
}

function getAcceptedAudiences(): string[] {
  const values = [
    getEnvValue("WORKSHEET_MAKER_AUDIENCE"),
    getEnvValue("APPSTORE_AUDIENCE"),
    getEnvValue("APPSTORE_TOOL_AUD"),
    DEFAULT_AUDIENCE,
    "worksheetmaker.sayuna-ai.com",
  ];

  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

function hasAcceptedAudience(claims: AppStoreSessionClaims): boolean {
  return Boolean(claims.aud && getAcceptedAudiences().includes(claims.aud));
}

function validateClaims(payload: Partial<AppStoreSessionClaims>): AppStoreSessionClaims | null {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.sub !== "string" || payload.sub.trim() === "") return null;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;

  const now = Math.floor(Date.now() / 1000);
  const skew = getClockSkewSeconds();
  const tokenType: "access" | "session" = payload.typ === "session" ? "session" : "access";
  const maxTtl = tokenType === "session" ? getSessionMaxAgeSeconds() : getMaxAccessTtlSeconds();

  if (payload.exp + skew <= now) return null;
  if (typeof payload.iat === "number") {
    if (!Number.isFinite(payload.iat)) return null;
    if (payload.iat > now + skew) return null;
    if (payload.exp + skew < payload.iat) return null;
  }

  const issuedAt = typeof payload.iat === "number" ? payload.iat : now;
  if (payload.exp - issuedAt > maxTtl + skew) return null;

  return {
    sub: payload.sub,
    exp: payload.exp,
    iat: typeof payload.iat === "number" ? payload.iat : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined,
    role: typeof payload.role === "string" ? payload.role : undefined,
    aud: typeof payload.aud === "string" ? payload.aud : undefined,
    jti: typeof payload.jti === "string" ? payload.jti : undefined,
    typ: tokenType,
  };
}

function verifyToken(token: string | null | undefined, secret: string): AppStoreSessionClaims | null {
  if (!token || !secret) return null;
  const parts = token.trim().split(".");

  if (parts.length === 2) {
    const [payloadB64, sigB64] = parts;
    const expectedSig = signPayload(payloadB64, secret);
    if (!safeEqual(sigB64, expectedSig)) return null;
    try {
      return validateClaims(JSON.parse(base64UrlDecode(payloadB64).toString("utf8")));
    } catch {
      return null;
    }
  }

  if (parts.length === 3) {
    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = signPayload(signingInput, secret);
    if (!safeEqual(sigB64, expectedSig)) return null;
    try {
      return validateClaims(JSON.parse(base64UrlDecode(payloadB64).toString("utf8")));
    } catch {
      return null;
    }
  }

  return null;
}

function shouldUseSecureCookie(): boolean {
  const configured = getEnvValue("APPSTORE_COOKIE_SECURE")?.trim().toLowerCase();
  if (configured === "false" || configured === "0" || configured === "no") return false;
  if (configured === "true" || configured === "1" || configured === "yes") return true;
  return getEnvValue("NODE_ENV") === "production" || Boolean(getEnvValue("VERCEL"));
}

function buildSessionCookie(token: string, maxAgeSeconds: number): string {
  const secure = shouldUseSecureCookie() ? "; Secure" : "";
  const sameSite = shouldUseSecureCookie() ? "; SameSite=None" : "; SameSite=Lax";
  const domain = getEnvValue("APPSTORE_COOKIE_DOMAIN") ? `; Domain=${getEnvValue("APPSTORE_COOKIE_DOMAIN")}` : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly${sameSite}; Max-Age=${Math.max(
    1,
    Math.floor(maxAgeSeconds),
  )}${secure}${domain}`;
}

function buildClearSessionCookie(): string {
  const secure = shouldUseSecureCookie() ? "; Secure" : "";
  const sameSite = shouldUseSecureCookie() ? "; SameSite=None" : "; SameSite=Lax";
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly${sameSite}; Max-Age=0${secure}`;
}

function jsonResponse(body: Record<string, unknown>, status: number, headers = new Headers()): Response {
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return new Response(JSON.stringify(body), { status, headers });
}

function unauthorized(error: string, status = 401): Response {
  const headers = new Headers();
  headers.append("Set-Cookie", buildClearSessionCookie());
  return jsonResponse({ ok: false, error }, status, headers);
}

function getCookieValues(cookieHeader: string | null, name: string): string[] {
  if (!cookieHeader) return [];
  const values: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey !== name) continue;
    const encoded = rawValue.join("=") || "";
    try {
      values.push(decodeURIComponent(encoded));
    } catch {
      values.push(encoded);
    }
  }
  return values;
}

function createSessionToken(accessClaims: AppStoreSessionClaims, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = getSessionMaxAgeSeconds();
  const payload = {
    sub: accessClaims.sub,
    email: accessClaims.email || "",
    role: accessClaims.role || "",
    aud: accessClaims.aud || DEFAULT_AUDIENCE,
    iat: now,
    exp: now + maxAge,
    typ: "session" as const,
  };
  const payloadB64 = base64Url(JSON.stringify(payload));
  const sigB64 = signPayload(payloadB64, secret);
  return `${payloadB64}.${sigB64}`;
}

function getClaimsFromRequest(request: Request, secret: string): AppStoreSessionClaims | null {
  for (const cookieToken of getCookieValues(request.headers.get("cookie"), SESSION_COOKIE_NAME)) {
    const claims = verifyToken(cookieToken, secret);
    if (claims) return claims;
  }

  const headerToken = request.headers.get("x-appstore-access") || "";
  if (headerToken) {
    const claims = verifyToken(headerToken, secret);
    if (claims) return claims;
  }

  const authHeader = request.headers.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const claims = verifyToken(authHeader.slice("Bearer ".length).trim(), secret);
    if (claims) return claims;
  }

  return null;
}

function buildSafeRedirectUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  const returnTo = url.searchParams.get("returnTo");
  if (!returnTo) return `${url.origin}/`;

  try {
    const target = new URL(returnTo, url.origin);
    if (target.origin !== url.origin) return `${url.origin}/`;
    target.searchParams.delete("access");
    target.searchParams.delete("ticket");
    if (target.pathname === "/sso") return `${target.origin}/`;
    return target.toString();
  } catch {
    return `${url.origin}/`;
  }
}

export async function handleSsoRequest(request: Request): Promise<Response> {
  if (!isAuthEnabled(request)) {
    return new Response(null, {
      status: 302,
      headers: { Location: buildSafeRedirectUrl(request.url), "Cache-Control": "no-store" },
    });
  }

  let secret: string;
  try {
    secret = getSharedSecret();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "secret_missing";
    return jsonResponse({ ok: false, error: "missing_shared_secret", detail }, 500);
  }

  const access = new URL(request.url).searchParams.get("access") || new URL(request.url).searchParams.get("ticket");
  const claims = verifyToken(access, secret);
  if (!claims) return unauthorized("invalid_access");
  if (!hasAcceptedAudience(claims)) return unauthorized("invalid_audience");

  const sessionToken = createSessionToken(claims, secret);
  const headers = new Headers({
    Location: buildSafeRedirectUrl(request.url),
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", buildSessionCookie(sessionToken, getSessionMaxAgeSeconds()));

  return new Response(null, { status: 302, headers });
}

export async function requireExistingSession(request: Request): Promise<Response | null> {
  if (!isAuthEnabled(request)) return null;

  let secret: string;
  try {
    secret = getSharedSecret();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "secret_missing";
    return jsonResponse({ ok: false, error: "missing_shared_secret", detail }, 500);
  }

  const claims = getClaimsFromRequest(request, secret);
  if (!claims || claims.typ !== "session") return unauthorized("no_session");
  if (!hasAcceptedAudience(claims)) return unauthorized("invalid_audience");

  return null;
}
