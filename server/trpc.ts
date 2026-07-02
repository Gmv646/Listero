import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { getOrCreateUser } from "@/lib/user";

export async function createContext() {
  const user = await getOrCreateUser();
  return { user };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { user: ctx.user } });
});
