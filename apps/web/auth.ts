import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { getDb, getMongoClientPromise } from "@dailyscribe/core";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Trust the incoming host so OAuth redirect URIs follow the host the user actually
  // browses with (localhost, a LAN IP, or the prod domain) instead of a fixed default.
  trustHost: true,
  // Pass the lazy connector (not an awaited promise) so no DB dial happens at import/build.
  adapter: MongoDBAdapter(getMongoClientPromise, {
    databaseName: process.env.MONGODB_DB ?? "dailyscribe",
  }),
  providers: [GitHub],
  callbacks: {
    async signIn({ user }) {
      // Signups paused during development: only accounts already in the
      // "users" collection may sign in; anyone new is turned away. Set
      // ALLOW_NEW_SIGNUPS="true" to reopen — no code change needed.
      if (process.env.ALLOW_NEW_SIGNUPS === "true") return true;
      if (!user.email) return false;
      const db = await getDb();
      const existing = await db.collection("users").findOne({ email: user.email });
      return Boolean(existing);
    },
    session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
