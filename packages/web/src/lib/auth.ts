import NextAuth from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { createDb } from "@claudefather/db/client";
import { users } from "@claudefather/db/schema";
import { eq } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (!account || account.provider !== "github" || !profile) {
        console.error("[auth] signIn rejected: missing account or profile", {
          hasAccount: !!account,
          provider: account?.provider,
          hasProfile: !!profile,
        });
        return false;
      }

      try {
        // Upsert user with GitHub identity
        const githubId = Number(profile.id);
        const existing = await db
          .select()
          .from(users)
          .where(eq(users.githubId, githubId))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(users).values({
            githubId,
            githubUsername: profile.login as string,
            displayName: (profile.name as string) || null,
            avatarUrl: (profile.avatar_url as string) || null,
            email: (profile.email as string) || null,
            role: "member",
          });
        } else {
          await db
            .update(users)
            .set({
              githubUsername: profile.login as string,
              displayName: (profile.name as string) || null,
              avatarUrl: (profile.avatar_url as string) || null,
              updatedAt: new Date(),
            })
            .where(eq(users.githubId, githubId));
        }

        return true;
      } catch (err) {
        console.error("[auth] signIn error:", err);
        return false;
      }
    },
    async jwt({ token, profile }) {
      if (profile) {
        // On sign-in, attach DB user info to the JWT token
        const githubId = Number(profile.id);
        const dbUser = await db
          .select()
          .from(users)
          .where(eq(users.githubId, githubId))
          .limit(1);

        if (dbUser.length > 0) {
          token.userId = dbUser[0].id;
          token.role = dbUser[0].role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Attach internal user ID and role from JWT token to session
      if (token.userId) {
        (session as any).userId = token.userId;
      }
      if (token.role) {
        (session as any).role = token.role;
      }
      return session;
    },
  },
});
