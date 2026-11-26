import { commitSha, deployEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", env: deployEnv(), commit: commitSha() });
}
