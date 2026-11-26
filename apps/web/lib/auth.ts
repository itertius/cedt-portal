import "server-only";
import { createDb, schema } from "@cedt-hub/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { headers } from "next/headers";
import { fetchMcvProfile, MCV_PROVIDER_ID, MCV_URLS } from "./mcv/profile";

function baseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  // Vercel previews get a fresh hostname per deploy.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return undefined;
}

export const mcvEnabled = Boolean(process.env.MCV_CLIENT_ID && process.env.MCV_CLIENT_SECRET);

/** Auth needs a database and a secret. Without them the site still renders, logged out. */
export const authConfigured = Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);

function createAuth(databaseUrl: string) {
  return betterAuth({
    appName: "CEDT Hub",
    baseURL: baseURL(),
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(createDb(databaseUrl), { provider: "pg", schema }),
    account: {
      encryptOAuthTokens: true,
      // MCV emails are unverified placeholders; never link accounts by email.
      accountLinking: { enabled: false },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      genericOAuth({
        config: mcvEnabled
          ? [
              {
                providerId: MCV_PROVIDER_ID,
                name: "MyCourseVille",
                clientId: process.env.MCV_CLIENT_ID as string,
                clientSecret: process.env.MCV_CLIENT_SECRET as string,
                authorizationUrl: MCV_URLS.authorize,
                tokenUrl: MCV_URLS.token,
                tokenEndpointAuth: { method: "client_secret_post" },
                pkce: false,
                getUserInfo: async (tokens) =>
                  tokens.accessToken ? fetchMcvProfile(tokens.accessToken) : null,
              },
            ]
          : [],
      }),
      nextCookies(),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;
let cached: Auth | null | undefined;

export function getAuth(): Auth | null {
  if (cached !== undefined) return cached;
  cached = authConfigured ? createAuth(process.env.DATABASE_URL as string) : null;
  return cached;
}

export async function getSession() {
  const auth = getAuth();
  if (!auth) return null;
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch (err) {
    console.error("getSession failed", err);
    return null;
  }
}
