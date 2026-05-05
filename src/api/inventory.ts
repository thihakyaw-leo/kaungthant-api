import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/tenant';

const inventoryAPI = new Hono<{ Bindings: Env }>();

/**
 * 1. PRODUCT MASTER CRUD (CREATE)
 */
inventoryAPI.post('/products', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const body = await c.req.json();
  const now = Math.floor(Date.now() / 1000);
  const productId = crypto.randomUUID();

  try {
    // ပစ္စည်းအသစ် သိမ်းဆည်းခြင်း
    await db.insert(schema.inventoryStock).values({
      id: productId,
      code: body.code, // Barcode/SKU
      name: body.name,
      description: body.description,
      categoryId: body.categoryId,
      unitId: body.unitId,
      statusId: 'active',
      createdAt: now,
      updatedAt: now
    });

    // 2. PRICING RULES (Retail/Wholesale)
    if (body.prices && Array.isArray(body.prices)) {
      for (const p of body.prices) {
        await db.insert(schema.inventoryStockPrice).values({
          id: crypto.randomUUID(),
          stockId: productId,
          priceType: p.type, // RETAIL, WHOLESALE
          amount: p.amount,
          currencyId: p.currencyId || 'MMK',
          createdAt: now,
          updatedAt: now
        });
      }
    }

    // 3. INITIAL STOCK PER LOCATION
    if (body.initialStock && Array.isArray(body.initialStock)) {
      for (const s of body.initialStock) {
        await db.insert(schema.inventoryStockQuantity).values({
          locationId: s.locationId,
          stockId: productId,
          quantity: s.quantity,
          updatedAt: now
        });
      }
    }

    return c.json({ success: true, productId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * 2. GET STOCK BY LOCATION
 */
inventoryAPI.get('/stock/:locationId', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const locationId = c.req.param('locationId');

  try {
    const stockData = await db
      .select({
        id: schema.inventoryStock.id,
        name: schema.inventoryStock.name,
        code: schema.inventoryStock.code,
        quantity: schema.inventoryStockQuantity.quantity,
        unit: schema.inventoryUnit.name
      })
      .from(schema.inventoryStock)
      .innerJoin(schema.inventoryStockQuantity, eq(schema.inventoryStock.id, schema.inventoryStockQuantity.stockId))
      .innerJoin(schema.inventoryUnit, eq(schema.inventoryStock.unitId, schema.inventoryUnit.id))
      .where(eq(schema.inventoryStockQuantity.locationId, locationId))
      .all();

    return c.json({ success: true, data: stockData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * 3. CATEGORIES LISTING
 */
inventoryAPI.get('/categories', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  try {
    const categories = await db.select().from(schema.inventoryCategory).all();
    return c.json({ success: true, data: categories });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * 4. UNITS LISTING
 */
inventoryAPI.get('/units', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  try {
    const units = await db.select().from(schema.inventoryUnit).all();
    return c.json({ success: true, data: units });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

export default inventoryAPI;
