export type DeployEnv = "production" | "preview" | "development";

export function deployEnv(): DeployEnv {
  const env = process.env.VERCEL_ENV;
  if (env === "production" || env === "preview") return env;
  return "development";
}

export function commitSha(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
}
