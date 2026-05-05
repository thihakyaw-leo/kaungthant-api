import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql, and } from 'drizzle-orm';

import * as schema from '../db/tenant';
import { stockTransferSchema, stockAdjustSchema } from '../schemas/stock_management';

const stockManagementAPI = new Hono<{ Bindings: Env }>();

/**
 * STOCK TRANSFER
 */
stockManagementAPI.post('/transfer', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const body = await c.req.json();
  const validation = stockTransferSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ success: false, data: null, error: validation.error.message }, 400);
  }

  const { fromLocationId, toLocationId, items, reason } = validation.data;
  const transferId = crypto.randomUUID();
  const transferNo = `TRF-${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);

  try {
    await db.transaction(async (tx) => {
      // 1. Create Transfer Record
      await tx.insert(schema.inventoryTransfer).values({
        id: transferId,
        transferNo,
        fromLocationId,
        toLocationId,
        transactionDate: now,
        createdAt: now,
        updatedAt: now,
      });

      // 2. Process Items
      for (const item of items) {
        // A. Insert Transfer Detail
        await tx.insert(schema.inventoryTransferDetail).values({
          id: crypto.randomUUID(),
          transferId,
          stockId: item.stockId,
          quantity: item.quantity,
          createdAt: now,
        });

        // B. Decrease from Source
        const fromQty = await tx.select().from(schema.inventoryStockQuantity)
          .where(and(eq(schema.inventoryStockQuantity.stockId, item.stockId), eq(schema.inventoryStockQuantity.locationId, fromLocationId)))
          .limit(1);
        
        const fromBalance = (fromQty[0]?.quantity || 0) - item.quantity;
        await tx.update(schema.inventoryStockQuantity)
          .set({ quantity: fromBalance, updatedAt: now })
          .where(and(eq(schema.inventoryStockQuantity.stockId, item.stockId), eq(schema.inventoryStockQuantity.locationId, fromLocationId)));

        // C. Increase at Destination
        const toQty = await tx.select().from(schema.inventoryStockQuantity)
          .where(and(eq(schema.inventoryStockQuantity.stockId, item.stockId), eq(schema.inventoryStockQuantity.locationId, toLocationId)))
          .limit(1);
        
        const toBalance = (toQty[0]?.quantity || 0) + item.quantity;
        if (toQty.length > 0) {
          await tx.update(schema.inventoryStockQuantity)
            .set({ quantity: toBalance, updatedAt: now })
            .where(and(eq(schema.inventoryStockQuantity.stockId, item.stockId), eq(schema.inventoryStockQuantity.locationId, toLocationId)));
        } else {
          await tx.insert(schema.inventoryStockQuantity).values({
            stockId: item.stockId,
            locationId: toLocationId,
            quantity: toBalance,
            updatedAt: now
          });
        }

        // D. Log Transactions
        await tx.insert(schema.configTransactionLog).values({
          id: crypto.randomUUID(),
          stockId: item.stockId,
          locationId: fromLocationId,
          transactionType: 'TRANSFER_OUT',
          referenceId: transferId,
          quantityChange: -item.quantity,
          balanceAfter: fromBalance,
          createdAt: now,
        });

        await tx.insert(schema.configTransactionLog).values({
          id: crypto.randomUUID(),
          stockId: item.stockId,
          locationId: toLocationId,
          transactionType: 'TRANSFER_IN',
          referenceId: transferId,
          quantityChange: item.quantity,
          balanceAfter: toBalance,
          createdAt: now,
        });
      }
    });

    return c.json({ success: true, data: { transferId, transferNo }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, data: null, error: message }, 500);
  }
});

/**
 * STOCK ADJUSTMENT
 */
stockManagementAPI.post('/adjust', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const body = await c.req.json();
  const validation = stockAdjustSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ success: false, data: null, error: validation.error.message }, 400);
  }

  const { locationId, stockId, type, quantity, reason } = validation.data;
  const adjustId = crypto.randomUUID();
  const adjustNo = `ADJ-${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);
  const qtyChange = type === 'IN' ? quantity : -quantity;

  try {
    await db.transaction(async (tx) => {
      // 1. Create Adjustment Record
      await tx.insert(schema.inventoryStockAdjust).values({
        id: adjustId,
        adjustNo,
        locationId,
        stockId,
        type,
        quantity,
        reason,
        createdAt: now,
        updatedAt: now,
      });

      // 2. Update Quantity
      const current = await tx.select().from(schema.inventoryStockQuantity)
        .where(and(eq(schema.inventoryStockQuantity.stockId, stockId), eq(schema.inventoryStockQuantity.locationId, locationId)))
        .limit(1);
      
      const newBalance = (current[0]?.quantity || 0) + qtyChange;
      if (current.length > 0) {
        await tx.update(schema.inventoryStockQuantity)
          .set({ quantity: newBalance, updatedAt: now })
          .where(and(eq(schema.inventoryStockQuantity.stockId, stockId), eq(schema.inventoryStockQuantity.locationId, locationId)));
      } else {
        await tx.insert(schema.inventoryStockQuantity).values({
          stockId,
          locationId,
          quantity: newBalance,
          updatedAt: now
        });
      }

      // 3. Log Transaction
      await tx.insert(schema.configTransactionLog).values({
        id: crypto.randomUUID(),
        stockId,
        locationId,
        transactionType: 'ADJUSTMENT',
        referenceId: adjustId,
        quantityChange: qtyChange,
        balanceAfter: newBalance,
        createdAt: now,
      });
    });

    return c.json({ success: true, data: { adjustId, adjustNo }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, data: null, error: message }, 500);
  }
});

export default stockManagementAPI;
