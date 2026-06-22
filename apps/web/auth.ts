import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { getMongoClientPromise } from "@dailyscribe/core";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Pass the lazy connector (not an awaited promise) so no DB dial happens at import/build.
  adapter: MongoDBAdapter(getMongoClientPromise, {
    databaseName: process.env.MONGODB_DB ?? "dailyscribe",
  }),
  providers: [GitHub],
  callbacks: {
    session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
