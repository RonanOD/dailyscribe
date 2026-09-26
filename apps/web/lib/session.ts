import { auth } from "@/auth";

/** Returns the signed-in user's id, or null if unauthenticated. */
export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** True only for the signed-in ADMIN_EMAIL user — callers should `notFound()` otherwise. */
export async function isAdmin(): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail) return false;
  const session = await auth();
  return session?.user?.email?.toLowerCase() === adminEmail;
}
