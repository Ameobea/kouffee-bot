export interface InventoryTransactionRow {
  userId: string;
  applicationTime: Date;
  itemId: number;
  count: bigint;
  metadataKey?: string | null | undefined;
  tier?: number | null | undefined;
}
