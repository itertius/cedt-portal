import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const notConfigured = () =>
  Response.json({ error: "Auth is not configured on this deployment." }, { status: 503 });

export async function GET(request: Request) {
  const auth = getAuth();
  return auth ? toNextJsHandler(auth).GET(request) : notConfigured();
}

export async function POST(request: Request) {
  const auth = getAuth();
  return auth ? toNextJsHandler(auth).POST(request) : notConfigured();
}
