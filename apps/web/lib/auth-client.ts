import { createAuthClient } from "better-auth/react";

// Generic OAuth providers (MCV) are first-class social providers in Better Auth 1.7,
// so no client plugin is needed: use authClient.signIn.social({ provider: "mcv" }).
export const authClient = createAuthClient();
