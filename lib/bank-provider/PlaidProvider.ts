import { createHash } from "crypto";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  type Transaction as PlaidTransaction,
} from "plaid";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import type {
  BankProvider,
  NormalizedAccount,
  NormalizedTransaction,
  SyncPage,
  WebhookEvent,
} from "./BankProvider";

function plaidClient(): PlaidApi {
  const env = process.env.PLAID_ENV ?? "sandbox";
  const basePath = PlaidEnvironments[env];
  if (!basePath) throw new Error(`Unknown PLAID_ENV: ${env}`);
  return new PlaidApi(
    new Configuration({
      basePath,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
          "PLAID-SECRET": process.env.PLAID_SECRET,
        },
      },
    })
  );
}

function normalizeTransaction(t: PlaidTransaction): NormalizedTransaction {
  // Plaid convention: positive amount = money leaving the account
  const outflow = t.amount >= 0;
  return {
    externalTxId: t.transaction_id,
    externalAccountId: t.account_id,
    date: t.authorized_date ?? t.date,
    merchantRaw: t.name ?? null,
    merchantDisplay: t.merchant_name ?? t.name ?? null,
    amount: Math.abs(t.amount).toFixed(2),
    currency: t.iso_currency_code ?? "USD",
    direction: outflow ? "outflow" : "inflow",
    pending: t.pending,
    replacesExternalTxId: t.pending_transaction_id ?? null,
    raw: t,
  };
}

export class PlaidProvider implements BankProvider {
  readonly name = "plaid";
  private client = plaidClient();

  async createLinkToken(opts: {
    internalUserId: string;
    webhookUrl: string;
  }): Promise<string> {
    const resp = await this.client.linkTokenCreate({
      user: { client_user_id: opts.internalUserId },
      client_name: "Listero",
      products: [Products.Transactions],
      transactions: { days_requested: 30 },
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: opts.webhookUrl,
    });
    return resp.data.link_token;
  }

  // Update mode: re-auth an existing item (bank forced re-login, expired
  // consent). Same Link UI, one tap, no new accounts created.
  async createUpdateLinkToken(opts: {
    internalUserId: string;
    accessToken: string;
  }): Promise<string> {
    const resp = await this.client.linkTokenCreate({
      user: { client_user_id: opts.internalUserId },
      client_name: "Listero",
      country_codes: [CountryCode.Us],
      language: "en",
      access_token: opts.accessToken,
    });
    return resp.data.link_token;
  }

  async exchangePublicToken(publicToken: string) {
    const resp = await this.client.itemPublicTokenExchange({
      public_token: publicToken,
    });
    return {
      accessToken: resp.data.access_token,
      itemId: resp.data.item_id,
    };
  }

  async getAccounts(accessToken: string): Promise<NormalizedAccount[]> {
    const resp = await this.client.accountsGet({ access_token: accessToken });
    return resp.data.accounts.map((a) => ({
      externalAccountId: a.account_id,
      name: a.name ?? a.official_name ?? null,
      type: a.type ?? null,
      subtype: a.subtype ?? null,
      lastFour: a.mask ?? null,
    }));
  }

  async syncTransactions(
    accessToken: string,
    cursor: string | null
  ): Promise<SyncPage> {
    const resp = await this.client.transactionsSync({
      access_token: accessToken,
      cursor: cursor ?? undefined,
      count: 100,
    });
    const d = resp.data;
    return {
      added: d.added.map(normalizeTransaction),
      modified: d.modified.map(normalizeTransaction),
      removedIds: d.removed
        .map((r) => r.transaction_id)
        .filter((id): id is string => Boolean(id)),
      nextCursor: d.next_cursor,
      hasMore: d.has_more,
    };
  }

  // Plaid signs webhooks with an ES256 JWT in the Plaid-Verification header;
  // the JWT body carries a SHA-256 of the raw request body.
  async verifyWebhook(rawBody: string, headers: Headers): Promise<boolean> {
    try {
      const token = headers.get("plaid-verification");
      if (!token) return false;
      const header = decodeProtectedHeader(token);
      if (header.alg !== "ES256" || typeof header.kid !== "string") {
        return false;
      }
      const keyResp = await this.client.webhookVerificationKeyGet({
        key_id: header.kid,
      });
      const key = await importJWK(keyResp.data.key as JWK, "ES256");
      const { payload } = await jwtVerify(token, key, {
        maxTokenAge: "5 minutes",
      });
      const expected = payload.request_body_sha256;
      const actual = createHash("sha256").update(rawBody, "utf8").digest("hex");
      return typeof expected === "string" && expected === actual;
    } catch {
      return false;
    }
  }

  parseWebhookEvent(payload: unknown): WebhookEvent {
    const p = payload as {
      webhook_type?: string;
      webhook_code?: string;
      item_id?: string;
    };
    if (!p?.item_id) return { kind: "ignore", reason: "no item_id" };

    if (p.webhook_type === "TRANSACTIONS") {
      const updateCodes = [
        "SYNC_UPDATES_AVAILABLE",
        "INITIAL_UPDATE",
        "DEFAULT_UPDATE",
        "HISTORICAL_UPDATE",
      ];
      if (updateCodes.includes(p.webhook_code ?? "")) {
        return { kind: "transactions-updated", itemId: p.item_id };
      }
    }
    if (p.webhook_type === "ITEM") {
      const lostCodes = ["ERROR", "PENDING_EXPIRATION", "USER_PERMISSION_REVOKED"];
      if (lostCodes.includes(p.webhook_code ?? "")) {
        return { kind: "connection-lost", itemId: p.item_id };
      }
    }
    return {
      kind: "ignore",
      reason: `${p.webhook_type}/${p.webhook_code}`,
    };
  }
}
