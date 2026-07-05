import { z } from "zod";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db, transactions, bankConnections, bankAccounts, users } from "@/db";
import { cleanMerchant } from "@/lib/display";
import { parseCsvStatement } from "@/lib/bank-provider/CsvProvider";
import { txLocation } from "@/lib/enrich";
import { rules } from "@/db";
import { ruleMatches } from "@/lib/categorization/rules";
import {
  applyRuleRetroactively,
  countAffected,
  normalizePattern,
  resetAutoForPattern,
  upsertPersonalRule,
} from "@/lib/vendor-rules";
import { CATEGORIES } from "@/lib/categories";
import { encryptSecret } from "@/lib/crypto";
import { getBankProvider } from "@/lib/bank-provider";
import { syncConnection } from "@/lib/bank-provider/sync";
import { onNewTransactions } from "@/lib/pipeline";
import { router, protectedProcedure } from "../trpc";
import { applyUserConfirmation } from "@/lib/confirm";
import { eq as eqOp, and } from "drizzle-orm";

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

  // ── Vendor rules (personal layer only — one system, two entry points) ──
  vendorList: protectedProcedure.query(async ({ ctx }) => {
    const txs = await db.query.transactions.findMany({
      where: eqOp(transactions.userId, ctx.user.id),
      limit: 2000,
    });
    const byVendor = new Map<string, { display: string; count: number }>();
    for (const t of txs) {
      const display = cleanMerchant(t);
      const key = display.toLowerCase();
      if (key === "unknown merchant") continue;
      const cur = byVendor.get(key);
      if (cur) cur.count++;
      else byVendor.set(key, { display, count: 1 });
    }
    return Array.from(byVendor.values()).sort((a, b) => b.count - a.count);
  }),

  vendorRulesList: protectedProcedure.query(async ({ ctx }) => {
    const personal = (
      await db.query.rules.findMany({
        where: eqOp(rules.userId, ctx.user.id),
      })
    ).filter((r) => r.layer === "personal");
    const txs = await db.query.transactions.findMany({
      where: eqOp(transactions.userId, ctx.user.id),
      limit: 2000,
    });
    return personal.map((r) => ({
      id: r.id,
      merchantPattern: r.merchantPattern,
      category: r.category,
      businessPersonal: r.businessPersonal,
      affectedCount: txs.filter((t) => ruleMatches(r, t)).length,
    }));
  }),

  createVendorRule: protectedProcedure
    .input(
      z.object({
        vendor: z.string().min(2).max(80),
        businessPersonal: z.enum(["business", "personal"]),
        category: z.enum(CATEGORIES),
        reclassifyExisting: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const pattern = normalizePattern(input.vendor);
      const rule = await upsertPersonalRule(
        ctx.user.id,
        pattern,
        input.category,
        input.businessPersonal
      );
      const reclassified = input.reclassifyExisting
        ? await applyRuleRetroactively(ctx.user.id, rule)
        : 0;
      return { ruleId: rule.id, reclassified };
    }),

  updateVendorRule: protectedProcedure
    .input(
      z.object({
        ruleId: z.string().uuid(),
        businessPersonal: z.enum(["business", "personal"]),
        category: z.enum(CATEGORIES),
        reclassifyExisting: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rule = await db.query.rules.findFirst({
        where: and(
          eqOp(rules.id, input.ruleId),
          eqOp(rules.userId, ctx.user.id)
        ),
      });
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(rules)
        .set({
          category: input.category,
          businessPersonal: input.businessPersonal,
        })
        .where(eqOp(rules.id, rule.id));
      const reclassified = input.reclassifyExisting
        ? await applyRuleRetroactively(ctx.user.id, {
            merchantPattern: rule.merchantPattern,
            category: input.category,
            businessPersonal: input.businessPersonal,
          })
        : 0;
      return { reclassified };
    }),

  deleteVendorRule: protectedProcedure
    .input(
      z.object({
        ruleId: z.string().uuid(),
        resetAffected: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rule = await db.query.rules.findFirst({
        where: and(
          eqOp(rules.id, input.ruleId),
          eqOp(rules.userId, ctx.user.id)
        ),
      });
      if (!rule) throw new TRPCError({ code: "NOT_FOUND" });
      await db.delete(rules).where(eqOp(rules.id, rule.id));
      const reset = input.resetAffected
        ? await resetAutoForPattern(ctx.user.id, rule.merchantPattern)
        : 0;
      return { reset };
    }),

  // Mid-year signup: how should pre-signup history be handled?
  setHistoryMode: protectedProcedure
    .input(z.object({ mode: z.enum(["catch_up", "start_fresh", "self"]) }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(users)
        .set({ historyMode: input.mode })
        .where(eqOp(users.id, ctx.user.id));

      if (input.mode !== "catch_up") {
        // Archive everything before today that the user hasn't confirmed.
        // Archived rows stay visible in History and in exports, and can be
        // un-archived by confirming them there — nothing is deleted.
        const today = new Date().toISOString().slice(0, 10);
        const { ne, lt } = await import("drizzle-orm");
        await db
          .update(transactions)
          .set({ archived: true })
          .where(
            and(
              eqOp(transactions.userId, ctx.user.id),
              ne(transactions.status, "confirmed"),
              lt(transactions.date, today)
            )
          );
      }
      return { ok: true };
    }),

  // Classify an account: dedicated business/personal card or checking.
  // Feeds the categorization engine's leaning, source-agnostic.
  setAccountTreatment: protectedProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        businessTreatment: z.enum(["business", "personal", "mixed"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .update(bankAccounts)
        .set({ businessTreatment: input.businessTreatment })
        .where(
          and(
            eqOp(bankAccounts.id, input.accountId),
            eqOp(bankAccounts.userId, ctx.user.id)
          )
        );
      return { ok: true };
    }),

  // CSV import — first-class connection method for cards Plaid can't
  // reach (Apple Card) or users who prefer not to link. Batch, not live.
  importCsv: protectedProcedure
    .input(
      z.object({
        institutionName: z.string().min(1).max(100),
        lastFour: z.string().max(4).optional(),
        businessTreatment: z.enum(["business", "personal", "mixed"]),
        accountType: z.enum(["card", "checking"]),
        csvText: z.string().min(1).max(2_000_000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const parsed = parseCsvStatement(input.csvText);
      if (parsed.format === "unrecognized" || parsed.format === "empty") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Couldn't read that file. Export a CSV with Date, Description, and Amount columns and try again.",
        });
      }

      // One CSV connection+account per institution+last4, reused on
      // subsequent monthly uploads.
      const enrollmentId = `csv-${ctx.user.id}-${input.institutionName.toLowerCase().replace(/\W+/g, "-")}${input.lastFour ? `-${input.lastFour}` : ""}`;
      let conn = await db.query.bankConnections.findFirst({
        where: and(
          eqOp(bankConnections.userId, ctx.user.id),
          eqOp(bankConnections.externalEnrollmentId, enrollmentId)
        ),
      });
      if (!conn) {
        [conn] = await db
          .insert(bankConnections)
          .values({
            userId: ctx.user.id,
            provider: "csv",
            connectionType: "csv",
            externalEnrollmentId: enrollmentId,
            accessTokenEncrypted: "csv-no-token",
            institutionName: input.institutionName,
          })
          .returning();
      }
      let account = await db.query.bankAccounts.findFirst({
        where: and(
          eqOp(bankAccounts.connectionId, conn.id),
          eqOp(bankAccounts.externalAccountId, enrollmentId)
        ),
      });
      if (!account) {
        [account] = await db
          .insert(bankAccounts)
          .values({
            userId: ctx.user.id,
            connectionId: conn.id,
            externalAccountId: enrollmentId,
            accountName: `${input.institutionName} (CSV)`,
            accountType: input.accountType,
            lastFour: input.lastFour ?? null,
            businessTreatment: input.businessTreatment,
          })
          .returning();
      }

      // Dedupe on the stable row hash; insert only new transactions
      let inserted = 0;
      const insertedIds: string[] = [];
      for (const row of parsed.rows) {
        const [r] = await db
          .insert(transactions)
          .values({
            userId: ctx.user.id,
            accountId: account.id,
            externalTxId: row.externalTxId,
            date: row.date,
            merchantRaw: row.merchantRaw,
            merchantDisplay: row.merchantRaw,
            amount: row.amount,
            direction: row.direction,
            status: "pending",
          })
          .onConflictDoNothing()
          .returning({ id: transactions.id });
        if (r) {
          inserted++;
          insertedIds.push(r.id);
        }
      }

      // CSV uploads count as a successful "sync" for the heartbeat
      await db
        .update(bankConnections)
        .set({ lastSyncedAt: new Date() })
        .where(eqOp(bankConnections.id, conn.id));

      // Deterministic classification only (rules/transfers/inflows) — the
      // client then drives Claude in bounded batches via the backlog job.
      // Batch uploads never ping Slack.
      if (insertedIds.length > 0) {
        await onNewTransactions(ctx.user.id, insertedIds, {
          notify: false,
          allowClaude: false,
        });
      }

      return {
        format: parsed.format,
        parsed: parsed.rows.length,
        inserted,
        duplicates: parsed.rows.length - inserted,
        skippedRows: parsed.skipped,
      };
    }),

  // One-at-a-time review queue: everything awaiting the user's eyes,
  // oldest first, with display-ready merchant + account labels.
  reviewQueue: protectedProcedure.query(async ({ ctx }) => {
    const [txs, accounts, connections] = await Promise.all([
      db.query.transactions.findMany({
        // Only 'pending' needs human eyes — 'auto' (rule/transfer-handled)
        // is deliberately kept out of the review flow per product design.
        where: and(
          eqOp(transactions.userId, ctx.user.id),
          eqOp(transactions.status, "pending"),
          eqOp(transactions.archived, false)
        ),
        orderBy: [asc(transactions.date), asc(transactions.createdAt)],
        limit: 100,
      }),
      db.query.bankAccounts.findMany({
        where: eqOp(bankAccounts.userId, ctx.user.id),
      }),
      db.query.bankConnections.findMany({
        where: eqOp(bankConnections.userId, ctx.user.id),
      }),
    ]);

    const connById = new Map(connections.map((c) => [c.id, c]));
    const labelFor = (accountId: string | null) => {
      const a = accounts.find((x) => x.id === accountId);
      if (!a) return null;
      const inst =
        (a.connectionId && connById.get(a.connectionId)?.institutionName) ||
        "Bank";
      return a.lastFour ? `${inst} ··${a.lastFour}` : inst;
    };

    return txs
      .filter((t) => t.businessPersonal !== "internal")
      .map((t) => ({
        id: t.id,
        date: t.date,
        merchant: cleanMerchant(t),
        amount: t.amount,
        direction: t.direction,
        category: t.category,
        businessPersonal: t.businessPersonal,
        reasoning: t.reasoning,
        accountLabel: labelFor(t.accountId),
        location: txLocation(t),
      }));
  }),

  // Web review flow — Slack-optional confirmation, same shared logic
  confirmTransaction: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().uuid(),
        businessPersonal: z.enum(["business", "personal", "internal"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tx = await db.query.transactions.findFirst({
        where: and(
          eqOp(transactions.id, input.transactionId),
          eqOp(transactions.userId, ctx.user.id)
        ),
      });
      if (!tx) throw new TRPCError({ code: "NOT_FOUND" });

      const choice =
        input.businessPersonal === "personal"
          ? { category: "Personal", businessPersonal: "personal" }
          : input.businessPersonal === "internal"
            ? { category: "Internal transfer", businessPersonal: "internal" }
            : {
                category: tx.category ?? "Other",
                businessPersonal: "business",
              };

      await applyUserConfirmation(
        tx,
        ctx.user,
        choice,
        "web",
        `web_confirm_${input.businessPersonal}`
      );
      return { ok: true };
    }),

  // Finish onboarding without Slack — web review works as the fallback
  skipSlack: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(users)
      .set({ onboardingComplete: true })
      .where(eqOp(users.id, ctx.user.id));
    return { ok: true };
  }),

  // One-tap reconnect for a broken live connection (Plaid update mode)
  plaidCreateReconnectToken: protectedProcedure
    .input(z.object({ connectionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await db.query.bankConnections.findFirst({
        where: and(
          eqOp(bankConnections.id, input.connectionId),
          eqOp(bankConnections.userId, ctx.user.id)
        ),
      });
      if (!conn || conn.connectionType === "csv") {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      const provider = getBankProvider();
      if (!provider.createUpdateLinkToken) {
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      }
      const { decryptSecret } = await import("@/lib/crypto");
      const linkToken = await provider.createUpdateLinkToken({
        internalUserId: ctx.user.id,
        accessToken: decryptSecret(conn.accessTokenEncrypted),
      });
      return { linkToken };
    }),

  plaidReconnectComplete: protectedProcedure
    .input(z.object({ connectionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await db.query.bankConnections.findFirst({
        where: and(
          eqOp(bankConnections.id, input.connectionId),
          eqOp(bankConnections.userId, ctx.user.id)
        ),
      });
      if (!conn) throw new TRPCError({ code: "NOT_FOUND" });
      await db
        .update(bankConnections)
        .set({ status: "active", disconnectedAt: null })
        .where(eqOp(bankConnections.id, conn.id));
      try {
        const { insertedTxIds } = await syncConnection(conn.id);
        if (insertedTxIds.length > 0) {
          await onNewTransactions(ctx.user.id, insertedTxIds);
        }
      } catch {
        // webhook will catch up
      }
      return { ok: true };
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
