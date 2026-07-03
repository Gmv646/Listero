import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").unique().notNull(),
  email: text("email").notNull(),
  businessName: text("business_name"),
  businessIndustry: text("business_industry"),
  businessLocation: text("business_location"),
  accountingMethod: text("accounting_method").default("cash"),
  // 'catch_up' | 'start_fresh' | 'self' — how the user chose to handle
  // pre-signup transaction history
  historyMode: text("history_mode"),
  slackTeamId: text("slack_team_id"),
  slackBotTokenEncrypted: text("slack_bot_token_encrypted"),
  slackUserId: text("slack_user_id"),
  onboardingComplete: boolean("onboarding_complete").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const bankConnections = pgTable("bank_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").default("plaid"),
  // 'live' (Plaid, real-time webhooks) | 'csv' (manual statement uploads)
  connectionType: text("connection_type").default("live"),
  // Plaid item_id (was Teller enrollment_id; column name kept provider-neutral)
  externalEnrollmentId: text("external_enrollment_id").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  institutionName: text("institution_name"),
  // /transactions/sync cursor; null until first sync completes
  syncCursor: text("sync_cursor"),
  status: text("status").default("active"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow(),
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
});

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").references(() => bankConnections.id, {
    onDelete: "cascade",
  }),
  externalAccountId: text("external_account_id").notNull(),
  accountName: text("account_name"),
  accountType: text("account_type"),
  accountSubtype: text("account_subtype"),
  lastFour: text("last_four"),
  // 'business' | 'personal' | 'mixed' — feeds categorization leaning
  businessTreatment: text("business_treatment").default("mixed"),
  status: text("status").default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => bankAccounts.id, {
      onDelete: "cascade",
    }),
    externalTxId: text("external_tx_id").notNull(),
    date: date("date").notNull(),
    merchantRaw: text("merchant_raw"),
    merchantDisplay: text("merchant_display"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").default("USD"),
    direction: text("direction").notNull(),
    category: text("category"),
    businessPersonal: text("business_personal"),
    status: text("status").default("pending"),
    confidence: numeric("confidence"),
    reasoning: text("reasoning"),
    // true = pre-signup history the user chose not to actively manage
    archived: boolean("archived").default(false),
    slackMessageTs: text("slack_message_ts"),
    slackChannelId: text("slack_channel_id"),
    rawData: jsonb("raw_data"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => ({
    externalTxUnique: unique().on(t.externalTxId, t.accountId),
  })
);

export const rules = pgTable("rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  // null user_id = global/industry rule, readable by all authenticated users
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  layer: text("layer").notNull(), // 'personal' | 'industry' | 'global'
  industry: text("industry"),
  merchantPattern: text("merchant_pattern").notNull(),
  category: text("category").notNull(),
  businessPersonal: text("business_personal").notNull(),
  confidence: numeric("confidence").default("0.9"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id").references(() => transactions.id, {
    onDelete: "cascade",
  }),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const productAnalytics = pgTable("product_analytics", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  // 'plaid_webhook_received' | 'categorization_completed' | 'slack_dm_sent'
  // | 'user_action_taken'
  eventType: text("event_type").notNull(),
  // categorization: which layer resolved it (pair_match, plaid_signal, rule,
  // refund_heuristic, inflow_default, claude) and the model when AI was used
  method: text("method"),
  model: text("model"),
  confidence: numeric("confidence"),
  // user actions: which button/modal, and whether it matched the AI proposal
  action: text("action"),
  matchedProposal: boolean("matched_proposal"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const productFeedback = pgTable("product_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id").references(() => transactions.id, {
    onDelete: "set null",
  }),
  feedbackText: text("feedback_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type User = typeof users.$inferSelect;
export type BankConnection = typeof bankConnections.$inferSelect;
export type BankAccount = typeof bankAccounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Rule = typeof rules.$inferSelect;
