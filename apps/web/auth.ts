import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { getDb, getMongoClientPromise } from "@dailyscribe/core";
import { ObjectId } from "mongodb";
import NextAuth from "next-auth";
import { cookies } from "next/headers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { REF_COOKIE } from "@/lib/signup-ref";

const MAIL_FROM = process.env.MAIL_FROM_DEFAULT ?? "Daily Scribe <my@dailyscribe.ca>";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Trust the incoming host so OAuth redirect URIs follow the host the user actually
  // browses with (localhost, a LAN IP, or the prod domain) instead of a fixed default.
  trustHost: true,
  // Pass the lazy connector (not an awaited promise) so no DB dial happens at import/build.
  adapter: MongoDBAdapter(getMongoClientPromise, {
    databaseName: process.env.MONGODB_DB ?? "dailyscribe",
  }),
  providers: [
    // GitHub started sending an "iss" parameter on its OAuth callback (RFC 9207).
    // This next-auth version doesn't know GitHub's issuer by default and falls
    // back to comparing against its own placeholder ("https://authjs.dev"),
    // which fails validation — set it explicitly so that check passes.
    GitHub({
      issuer: "https://github.com/login/oauth",
      // GitHub, Google, and the email link all prove the user controls the
      // address, so it's safe to attach a new sign-in method to an existing
      // account (including a waitlist-seeded stub user) that shares the verified
      // email. Without this, a second method for the same address throws
      // OAuthAccountNotLinked.
      allowDangerousEmailAccountLinking: true,
    }),
    Google({ allowDangerousEmailAccountLinking: true }),
    // Passwordless email link. Reuses the app-wide Resend key and the single
    // verified sender; no SMTP / nodemailer dependency.
    Resend({ apiKey: process.env.RESEND_API_KEY, from: MAIL_FROM }),
  ],
  events: {
    // Stamp new accounts with when they joined and which campaign link brought
    // them (the ?ref= tag /start saved), for the daily signup report.
    async createUser({ user }) {
      if (!user.id || !ObjectId.isValid(user.id)) return;
      let ref: string | undefined;
      try {
        ref = (await cookies()).get(REF_COOKIE)?.value;
      } catch {
        // No request context (shouldn't happen); just skip attribution.
      }
      const db = await getDb();
      await db
        .collection("users")
        .updateOne({ _id: new ObjectId(user.id), ref: { $exists: false } }, { $set: { createdAt: new Date(), ...(ref ? { ref } : {}) } });
    },
  },
  callbacks: {
    async signIn({ user }) {
      // Signups are gated: only emails already in the "users" collection may
      // sign in (waitlist approval seeds them there — see
      // scripts/approve-waitlist.mjs). Set ALLOW_NEW_SIGNUPS="true" to open it
      // to anyone. For the email provider this callback also runs before the
      // link is sent, so a non-approved address never receives one.
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
