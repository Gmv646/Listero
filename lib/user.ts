import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db, users, type User } from "@/db";

// Lazily sync the Clerk user into our users table on first authenticated
// touch. Returns null when unauthenticated.
export async function getOrCreateUser(): Promise<User | null> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;

  const existing = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });
  if (existing) return existing;

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? "";

  const [created] = await db
    .insert(users)
    .values({ clerkUserId, email })
    .onConflictDoNothing({ target: users.clerkUserId })
    .returning();

  if (created) return created;
  // Conflict raced with another request; fetch the winner.
  return (
    (await db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkUserId),
    })) ?? null
  );
}
