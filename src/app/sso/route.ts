import { handleSsoRequest } from "../api/_lib/sessionAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleSsoRequest(request);
}
