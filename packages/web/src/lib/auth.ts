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
      if (!account || account.provider !== "github" || !profile) return false;

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
          displayName: profile.name as string | undefined,
          avatarUrl: profile.avatar_url as string | undefined,
          email: profile.email as string | undefined,
          role: "member",
        });
      } else {
        await db
          .update(users)
          .set({
            githubUsername: profile.login as string,
            displayName: profile.name as string | undefined,
            avatarUrl: profile.avatar_url as string | undefined,
            updatedAt: new Date(),
          })
          .where(eq(users.githubId, githubId));
      }

      return true;
    },
    async session({ session, user }) {
      // Attach internal user ID and role to session
      const dbUser = await db
        .select()
        .from(users)
        .where(eq(users.email, user.email!))
        .limit(1);

      if (dbUser.length > 0) {
        (session as any).userId = dbUser[0].id;
        (session as any).role = dbUser[0].role;
      }

      return session;
    },
  },
});
