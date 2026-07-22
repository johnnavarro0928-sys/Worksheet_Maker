import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as generateWorksheet } from "../api/generate/route";

const sharedSecret = "test-shared-secret";
const originalEnv = { ...process.env };

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createAccessToken(overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: "teacher-123",
    aud: "worksheet-maker",
    email: "teacher@example.com",
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 120,
    ...overrides,
  };
  const payloadB64 = base64Url(JSON.stringify(payload));
  const sigB64 = base64Url(crypto.createHmac("sha256", sharedSecret).update(payloadB64).digest());
  return `${payloadB64}.${sigB64}`;
}

async function loadSsoRoute() {
  return import("./route").catch(() => null);
}

describe("Worksheet Maker App Store SSO", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      APPSTORE_AUTH_ENABLED: "true",
      APPSTORE_COOKIE_SECURE: "true",
      WORKSHEET_MAKER_SHARED_SECRET: sharedSecret,
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("exchanges a valid App Store token for an HttpOnly session cookie and safe redirect", async () => {
    const ssoRoute = await loadSsoRoute();
    expect(ssoRoute?.GET, "sso route exposes GET").toBeTypeOf("function");

    const access = createAccessToken();
    const response = await ssoRoute!.GET(
      new Request(
        `https://worksheetmaker.sayuna-ai.com/sso?access=${encodeURIComponent(access)}&returnTo=${encodeURIComponent(
          "https://worksheetmaker.sayuna-ai.com/sso?access=old-token",
        )}`,
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://worksheetmaker.sayuna-ai.com/");
    const cookie = response.headers.get("set-cookie") || "";
    expect(cookie).toContain("worksheet_maker_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Secure");
  });

  it("rejects tokens minted for a different app audience", async () => {
    const ssoRoute = await loadSsoRoute();
    expect(ssoRoute?.GET, "sso route exposes GET").toBeTypeOf("function");

    const access = createAccessToken({ aud: "activity-maker" });
    const response = await ssoRoute!.GET(
      new Request(`https://worksheetmaker.sayuna-ai.com/sso?access=${encodeURIComponent(access)}`),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "invalid_audience" });
  });

  it("requires an App Store session before generating worksheet questions", async () => {
    const response = await generateWorksheet(
      new Request("https://worksheetmaker.sayuna-ai.com/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: "Photosynthesis",
          competency: "Explain photosynthesis",
          grade: "Grade 7",
          subject: "Science",
          type: "Multiple Choice",
          difficulty: "Average",
          count: 1,
        }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "no_session" });
  });
});
