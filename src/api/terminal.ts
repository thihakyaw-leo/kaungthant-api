import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, like, or } from 'drizzle-orm';
import * as schema from '../db/tenant';

const terminalAPI = new Hono<{ Bindings: Env }>();

/**
 * 1. OPEN SHIFT (မနက်ခင်း ကောင်တာဖွင့်ခြင်း)
 */
terminalAPI.post('/shift/open', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const body = await c.req.json();
  const now = Math.floor(Date.now() / 1000);
  const shiftId = crypto.randomUUID();

  try {
    await db.insert(schema.saleShift).values({
      id: shiftId,
      userId: body.userId,
      startTime: now,
      openingBalance: body.openingBalance,
      status: 'Open',
      createdAt: now
    });
    return c.json({ success: true, shiftId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * 2. ITEM SCAN & SEARCH (ပစ္စည်းရှာဖွေခြင်း)
 */
terminalAPI.get('/search', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const query = c.req.query('q');

  if (!query) return c.json({ success: true, data: [] });

  try {
    const items = await db
      .select({
        id: schema.inventoryStock.id,
        name: schema.inventoryStock.name,
        code: schema.inventoryStock.code,
        price: schema.inventoryStockPrice.amount,
        unit: schema.inventoryUnit.shortName
      })
      .from(schema.inventoryStock)
      .innerJoin(schema.inventoryStockPrice, eq(schema.inventoryStock.id, schema.inventoryStockPrice.stockId))
      .innerJoin(schema.inventoryUnit, eq(schema.inventoryStock.unitId, schema.inventoryUnit.id))
      .where(
        and(
          eq(schema.inventoryStockPrice.priceType, 'RETAIL'),
          or(
            eq(schema.inventoryStock.code, query), // Exact barcode match
            like(schema.inventoryStock.name, `%${query}%`) // Partial name match
          )
        )
      )
      .limit(10)
      .all();
    
    return c.json({ success: true, data: items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

export default terminalAPI;
