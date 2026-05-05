import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql, and, desc } from 'drizzle-orm';
import * as schema from '../db/tenant';
import { checkoutSchema } from '../schemas/sales';

const salesAPI = new Hono<{ Bindings: Env }>();

/**
 * CHECKOUT (POS Transaction)
 */
salesAPI.post('/checkout', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const body = await c.req.json();
  const validation = checkoutSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ success: false, data: null, error: validation.error.message }, 400);
  }

  const { items, ...saleData } = validation.data;
  const saleId = crypto.randomUUID();
  const invoiceNo = `INV-${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);

  try {
    // 1. Prepare Batch Statements
    const statements: any[] = [];

    // A. Insert Sale Header
    statements.push(db.insert(schema.saleSale).values({
      id: saleId,
      invoiceNo,
      ...saleData,
      transactionDate: now,
      createdAt: now,
      updatedAt: now,
    }));

    // B. Process Items
    for (const item of items) {
      const detailId = crypto.randomUUID();
      const totalPrice = item.quantity * item.unitPrice;

      // Detail record
      statements.push(db.insert(schema.saleSaleDetail).values({
        id: detailId,
        saleId,
        stockId: item.stockId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice,
        createdAt: now,
      }));

      // Update Quantity (Note: In batch, we can't easily read current qty and update in one go without subqueries or separate steps)
      // For robustness, we'll use a single update statement with math
      statements.push(db.update(schema.inventoryStockQuantity)
        .set({ 
          quantity: sql`${schema.inventoryStockQuantity.quantity} - ${item.quantity}`, 
          updatedAt: now 
        })
        .where(and(
          eq(schema.inventoryStockQuantity.stockId, item.stockId),
          eq(schema.inventoryStockQuantity.locationId, item.locationId)
        ))
      );

      // Log Transaction
      statements.push(db.insert(schema.configTransactionLog).values({
        id: crypto.randomUUID(),
        stockId: item.stockId,
        locationId: item.locationId,
        transactionType: 'SALE',
        referenceId: saleId,
        quantityChange: -item.quantity,
        balanceAfter: sql`(SELECT quantity FROM ${schema.inventoryStockQuantity} WHERE stock_id = ${item.stockId} AND location_id = ${item.locationId})`,
        createdAt: now,
      }));
    }

    // 2. Execute Batch
    await db.batch(statements as any);

    // 3. ARCHIVE TO R2
    const archivePath = `receipts/${new Date().getFullYear()}/${invoiceNo}.json`;
    const archivePromise = c.env.R2_ARCHIVE.put(archivePath, JSON.stringify({ saleId, invoiceNo, ...body })).catch(r2Error => {
        console.error('R2 Archive Error:', r2Error);
    });
    c.executionCtx.waitUntil(archivePromise);

    return c.json({ 
      success: true, 
      data: { saleId, invoiceNo }, 
      error: null 
    });
  } catch (error: unknown) {
    console.error('Checkout Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, data: null, error: message }, 500);
  }
});

salesAPI.get('/history', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const sales = await db.select().from(schema.saleSale).orderBy(desc(schema.saleSale.createdAt));
  return c.json({ success: true, data: sales, error: null });
});

export default salesAPI;
