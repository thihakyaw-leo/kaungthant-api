import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../db/tenant';

const purchaseAPI = new Hono<{ Bindings: Env }>();

/**
 * RECEIVE STOCK (Stock အဝင်)
 * - Create Purchase Record (Using correct grnNo column)
 * - Update Inventory Quantities
 * - Log Transactions
 */
purchaseAPI.post('/receive', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const body = await c.req.json();
  const { items, supplierId, locationId, userId, referenceNo } = body;
  
  const now = Math.floor(Date.now() / 1000);
  const purchaseId = crypto.randomUUID();

  try {
    const operations: any[] = [];

    // 1. Create Purchase Header (Using grnNo instead of referenceNo)
    operations.push(
      db.insert(schema.purchasePurchase).values({
        id: purchaseId,
        grnNo: referenceNo, 
        supplierId,
        locationId,
        statusId: 'completed',
        transactionDate: now,
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      })
    );

    // 2. Process each item
    for (const item of items) {
      // Create Purchase Detail (Using unitCost and totalCost)
      operations.push(
        db.insert(schema.purchasePurchaseDetail).values({
          id: crypto.randomUUID(),
          purchaseId,
          stockId: item.id,
          quantity: item.qty,
          unitCost: item.costPrice,
          totalCost: item.costPrice * item.qty,
          createdAt: now,
          createdBy: userId
        })
      );

      // Update Stock Quantity (+)
      operations.push(
        db.update(schema.inventoryStockQuantity)
          .set({ 
            quantity: sql`${schema.inventoryStockQuantity.quantity} + ${item.qty}`,
            updatedAt: now 
          })
          .where(and(
            eq(schema.inventoryStockQuantity.stockId, item.id),
            eq(schema.inventoryStockQuantity.locationId, locationId)
          ))
      );

      // Log Transaction (Audit)
      operations.push(
        db.insert(schema.configTransactionLog).values({
          id: crypto.randomUUID(),
          stockId: item.id,
          locationId,
          transactionType: 'PURCHASE',
          referenceId: referenceNo,
          quantityChange: item.qty,
          balanceAfter: 0,
          createdAt: now,
          createdBy: userId
        })
      );
    }

    await db.batch(operations as any);

    return c.json({ success: true, purchaseId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

export default purchaseAPI;
