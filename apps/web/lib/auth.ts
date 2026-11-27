import "server-only";
import { CEDT_IDP_SCOPES, cedtIdpUrls, fetchCedtProfile } from "@cedt-hub/connectors/cedt-idp";
import { GOOGLE_CALENDAR_SCOPE, googleUrls } from "@cedt-hub/connectors/gcal";
import { schema } from "@cedt-hub/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { type GenericOAuthConfig, genericOAuth } from "better-auth/plugins/generic-oauth";
import { headers } from "next/headers";
import { isEmailAllowed, parseAllowlist } from "./allowlist";
import { getDb } from "./db";
import { fetchMcvProfile, MCV_PROVIDER_ID, MCV_URLS } from "./mcv/profile";

function baseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  // Vercel previews get a fresh hostname per deploy.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return undefined;
}

export const mcvEnabled = Boolean(process.env.MCV_CLIENT_ID && process.env.MCV_CLIENT_SECRET);
export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
export const GOOGLE_PROVIDER_ID = "google";
export const CEDT_PROVIDER_ID = "cedt";
/** "Log in with Google" for invited people only (personal mode until MCV / CEDT clients exist). */
export const googleLoginEnabled = () => googleEnabled && parseAllowlist().length > 0;
/** "Log in with CEDT" (CEDT IDP) is on once CEDT issues us a client. */
export const cedtEnabled = Boolean(
  process.env.CEDT_IDP_CLIENT_ID && process.env.CEDT_IDP_CLIENT_SECRET,
);

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

async function fetchGoogleProfile(accessToken: string) {
  const res = await fetch(googleUrls().userinfo, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const u = (await res.json()) as GoogleUserInfo;
  if (!u.sub) return null;
  return {
    id: u.sub,
    name: u.name ?? u.email ?? "Google account",
    email: u.email ?? null,
    image: u.picture,
    emailVerified: u.email_verified === true,
  };
}

/** Auth needs a database and a secret. Without them the site still renders, logged out. */
export const authConfigured = Boolean(process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET);

function oauthProviders(): GenericOAuthConfig[] {
  const providers: GenericOAuthConfig[] = [];
  if (mcvEnabled) {
    providers.push({
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
    });
  }
  if (cedtEnabled) {
    providers.push({
      providerId: CEDT_PROVIDER_ID,
      name: "CEDT",
      clientId: process.env.CEDT_IDP_CLIENT_ID as string,
      clientSecret: process.env.CEDT_IDP_CLIENT_SECRET as string,
      authorizationUrl: cedtIdpUrls().authorize,
      tokenUrl: cedtIdpUrls().token,
      tokenEndpointAuth: { method: "client_secret_post" },
      scopes: CEDT_IDP_SCOPES,
      pkce: false,
      getUserInfo: async (tokens) =>
        tokens.accessToken ? fetchCedtProfile(tokens.accessToken) : null,
    });
  }
  if (googleEnabled) {
    // Google is only for Calendar sync: it can be linked to an account, never used to create one.
    // A generic provider keeps every endpoint overridable for the local mock.
    providers.push({
      providerId: GOOGLE_PROVIDER_ID,
      name: "Google",
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      authorizationUrl: googleUrls().authorize,
      tokenUrl: googleUrls().token,
      tokenEndpointAuth: { method: "client_secret_post" },
      scopes: ["openid", "email", "profile", GOOGLE_CALENDAR_SCOPE],
      accessType: "offline",
      prompt: "consent",
      pkce: true,
      // Sign-up with Google is limited to ALLOWED_EMAILS (enforced in databaseHooks below).
      // Linking Google to an existing account (for Calendar) is always allowed.
      getUserInfo: async (tokens) =>
        tokens.accessToken ? fetchGoogleProfile(tokens.accessToken) : null,
    });
  }
  return providers;
}

function createAuth() {
  return betterAuth({
    appName: "CEDT Hub",
    baseURL: baseURL(),
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        // Linking is only ever explicit (Settings -> Connect Google), never by matching email:
        // MCV emails are unverified placeholders.
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: true,
        // Explicit linking from Settings only; these providers prove the account, not the email.
        trustedProviders: [GOOGLE_PROVIDER_ID, CEDT_PROVIDER_ID, MCV_PROVIDER_ID],
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Only invited emails may create an account through Google.
          before: async (user, ctx) => {
            const provider = (ctx?.params as { id?: string } | undefined)?.id;
            if (provider === GOOGLE_PROVIDER_ID && !isEmailAllowed(user.email)) return false;
          },
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    plugins: [genericOAuth({ config: oauthProviders() }), nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let cached: Auth | null | undefined;

export function getAuth(): Auth | null {
  if (cached !== undefined) return cached;
  cached = authConfigured ? createAuth() : null;
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
