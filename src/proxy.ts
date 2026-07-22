import { NextResponse } from "next/server";

import { requireExistingSession } from "./app/api/_lib/sessionAuth";

const DEFAULT_APPSTORE_HOME_URL = "https://sayuna-ai.com";

function shouldBypassAuth(request: Request): boolean {
  const pathname = new URL(request.url).pathname;
  return (
    pathname === "/sso" ||
    pathname.startsWith("/sso/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    /\.[^/]+$/.test(pathname)
  );
}

function getAppStoreHomeUrl(): URL {
  const configured = process.env.APPSTORE_HOME_URL || DEFAULT_APPSTORE_HOME_URL;
  try {
    return new URL(configured);
  } catch {
    return new URL(DEFAULT_APPSTORE_HOME_URL);
  }
}

function buildAppStoreRedirectUrl(request: Request): URL {
  const redirectUrl = getAppStoreHomeUrl();
  redirectUrl.searchParams.set("returnTo", request.url);
  return redirectUrl;
}

export async function proxy(request: Request) {
  if (shouldBypassAuth(request)) return NextResponse.next();

  const sessionError = await requireExistingSession(request);
  if (!sessionError) return NextResponse.next();

  if (sessionError.status >= 500) return sessionError;

  const response = NextResponse.redirect(buildAppStoreRedirectUrl(request), 302);
  response.headers.set("Cache-Control", "no-store");

  const clearCookie = sessionError.headers.get("set-cookie");
  if (clearCookie) response.headers.append("Set-Cookie", clearCookie);

  return response;
}

export const config = {
  matcher: ["/((?!api|sso|_next/static|_next/image|.*\\..*).*)"],
};
