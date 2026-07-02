import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db, transactions, bankConnections, bankAccounts, users } from "@/db";
import { encryptSecret } from "@/lib/crypto";
import { getBankProvider } from "@/lib/bank-provider";
import { syncConnection } from "@/lib/bank-provider/sync";
import { onNewTransactions } from "@/lib/pipeline";
import { router, protectedProcedure } from "../trpc";

export const appRouter = router({
  me: protectedProcedure.query(({ ctx }) => {
    // Never expose encrypted secrets to the client
    const { slackBotTokenEncrypted, ...safe } = ctx.user;
    return safe;
  }),

  completeOnboardingProfile: protectedProcedure
    .input(
      z.object({
        businessIndustry: z.enum([
          "videography",
          "photography",
          "podcasting",
          "design",
          "marketing_consulting",
          "other",
        ]),
        businessLocation: z.string().min(1).max(200),
        businessName: z.string().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .update(users)
        .set({
          businessIndustry: input.businessIndustry,
          businessLocation: input.businessLocation,
          businessName: input.businessName,
        })
        .where(eq(users.id, ctx.user.id));
      return { ok: true };
    }),

  transactionsList: protectedProcedure
    .input(
      z.object({ limit: z.number().min(1).max(200).default(50) }).optional()
    )
    .query(async ({ ctx, input }) => {
      return db.query.transactions.findMany({
        where: eq(transactions.userId, ctx.user.id),
        orderBy: [desc(transactions.date), desc(transactions.createdAt)],
        limit: input?.limit ?? 50,
      });
    }),

  plaidCreateLinkToken: protectedProcedure.mutation(async ({ ctx }) => {
    const provider = getBankProvider();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const linkToken = await provider.createLinkToken({
      internalUserId: ctx.user.id,
      webhookUrl: `${appUrl}/api/plaid/webhook`,
    });
    return { linkToken };
  }),

  plaidExchangePublicToken: protectedProcedure
    .input(
      z.object({
        publicToken: z.string().min(1),
        institutionName: z.string().max(200).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const provider = getBankProvider();

      const { accessToken, itemId } = await provider.exchangePublicToken(
        input.publicToken
      );

      const existing = await db.query.bankConnections.findFirst({
        where: eq(bankConnections.externalEnrollmentId, itemId),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This bank connection already exists.",
        });
      }

      const [conn] = await db
        .insert(bankConnections)
        .values({
          userId: ctx.user.id,
          provider: provider.name,
          externalEnrollmentId: itemId,
          accessTokenEncrypted: encryptSecret(accessToken),
          institutionName: input.institutionName ?? null,
        })
        .returning();

      const accounts = await provider.getAccounts(accessToken);
      if (accounts.length > 0) {
        await db.insert(bankAccounts).values(
          accounts.map((a) => ({
            userId: ctx.user.id,
            connectionId: conn.id,
            externalAccountId: a.externalAccountId,
            accountName: a.name,
            accountType: a.type,
            accountSubtype: a.subtype,
            lastFour: a.lastFour,
          }))
        );
      }

      // Initial 30-day sync. Plaid often isn't ready this soon after the
      // exchange (PRODUCT_NOT_READY) — that's fine: it fires a webhook when
      // history is prepared and the webhook route imports it. The connection
      // itself is already saved, so never fail the mutation over this.
      let insertedTxIds: string[] = [];
      try {
        ({ insertedTxIds } = await syncConnection(conn.id));
        if (insertedTxIds.length > 0) {
          await onNewTransactions(ctx.user.id, insertedTxIds);
        }
      } catch (err) {
        console.warn("initial sync deferred to webhook", {
          connectionId: conn.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      return {
        connectionId: conn.id,
        accountCount: accounts.length,
        transactionCount: insertedTxIds.length,
      };
    }),

  bankConnectionsList: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.query.bankConnections.findMany({
      where: eq(bankConnections.userId, ctx.user.id),
    });
    // Strip encrypted tokens before returning
    return rows.map(({ accessTokenEncrypted, ...safe }) => safe);
  }),
});

export type AppRouter = typeof appRouter;
