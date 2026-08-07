import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users } from "@/db/schema";
import { consumeRateLimit } from "@/lib/rate-limit";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const rate = await consumeRateLimit(`login:${email}`, 10, 15 * 60 * 1000);
        if (!rate.allowed) return null;

        const user = await db.select().from(users).where(eq(users.email, email)).get();
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      if (token.id) {
        const row = await db
          .select({ sessionVersion: users.sessionVersion })
          .from(users)
          .where(eq(users.id, String(token.id)))
          .get();
        if (!row) return {};
        if (user || token.sessionVersion === undefined) {
          token.sessionVersion = row.sessionVersion;
        } else if (token.sessionVersion !== row.sessionVersion) {
          return {};
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) session.user.id = String(token.id);
      return session;
    },
  },
});
