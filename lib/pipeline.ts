// Categorization pipeline entry point. New transactions flow through here
// from webhook syncs and the initial connect sync.
//
// Day 4 wires in: rules matching → Claude proposal → Slack DM.
// Until then, transactions simply sit in status='pending' and appear on the
// dashboard.
export async function onNewTransactions(
  userId: string,
  transactionIds: string[]
): Promise<void> {
  console.log("pipeline: new transactions", {
    userId,
    count: transactionIds.length,
  });
}
