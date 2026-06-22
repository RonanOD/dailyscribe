import { auth } from "@/auth";

/** Returns the signed-in user's id, or null if unauthenticated. */
export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
