import { auth } from "@/auth";
import { getAuthFeatureFlags } from "@/lib/auth-flags";

export async function getOptionalUserId() {
  if (!getAuthFeatureFlags().auth) {
    return null;
  }

  try {
    const session = await auth();
    return session?.user?.id ?? null;
  } catch (error) {
    console.error("Auth session lookup failed.", error);
    return null;
  }
}

export async function requireUserId() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error("Sign in required.");
  }

  return userId;
}
