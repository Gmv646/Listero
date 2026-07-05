// Provider-neutral bank data interface. PlaidProvider is the MVP
// implementation; additional providers can be added without touching
// the sync worker, webhook route, or UI.

export interface NormalizedAccount {
  externalAccountId: string;
  name: string | null;
  type: string | null;
  subtype: string | null;
  lastFour: string | null;
}

export interface NormalizedTransaction {
  externalTxId: string;
  externalAccountId: string;
  date: string; // YYYY-MM-DD
  merchantRaw: string | null;
  merchantDisplay: string | null;
  amount: string; // absolute value, 2 decimal places
  currency: string;
  direction: "outflow" | "inflow";
  pending: boolean;
  // When a posted transaction replaces a pending one, the pending tx's id
  replacesExternalTxId: string | null;
  raw: unknown;
}

export interface SyncPage {
  added: NormalizedTransaction[];
  modified: NormalizedTransaction[];
  removedIds: string[];
  nextCursor: string;
  hasMore: boolean;
}

export type WebhookEvent =
  | { kind: "transactions-updated"; itemId: string }
  | { kind: "connection-lost"; itemId: string }
  | { kind: "ignore"; reason: string };

export interface BankProvider {
  readonly name: string;
  createLinkToken(opts: {
    internalUserId: string;
    webhookUrl: string;
  }): Promise<string>;
  // Re-auth an existing connection (update mode); optional per provider
  createUpdateLinkToken?(opts: {
    internalUserId: string;
    accessToken: string;
  }): Promise<string>;
  exchangePublicToken(
    publicToken: string
  ): Promise<{ accessToken: string; itemId: string }>;
  getAccounts(accessToken: string): Promise<NormalizedAccount[]>;
  syncTransactions(
    accessToken: string,
    cursor: string | null
  ): Promise<SyncPage>;
  verifyWebhook(rawBody: string, headers: Headers): Promise<boolean>;
  parseWebhookEvent(payload: unknown): WebhookEvent;
}
