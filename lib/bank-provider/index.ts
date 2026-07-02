import type { BankProvider } from "./BankProvider";
import { PlaidProvider } from "./PlaidProvider";

let instance: BankProvider | null = null;

export function getBankProvider(): BankProvider {
  if (!instance) instance = new PlaidProvider();
  return instance;
}

export * from "./BankProvider";
