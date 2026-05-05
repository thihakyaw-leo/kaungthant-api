import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql, sum, count } from 'drizzle-orm';
import * as schema from '../db/tenant';

const reportsAPI = new Hono<{ Bindings: Env }>();

/**
 * DASHBOARD SUMMARY
 */
reportsAPI.get('/summary', async (c) => {
  const db = drizzle(c.env.DB_TENANT);

  // 1. Total Sales (Count and Sum)
  const salesSummary = await db.select({
    totalSales: count(schema.saleSale.id),
    totalRevenue: sum(schema.saleSale.payableAmount),
  }).from(schema.saleSale);

  // 2. Total Purchases
  const purchaseSummary = await db.select({
    totalPurchases: count(schema.purchasePurchase.id),
    totalCost: sum(schema.purchasePurchase.totalAmount),
  }).from(schema.purchasePurchase);

  // 3. Low Stock Count
  const lowStock = await db.select({
    count: count(schema.inventoryStock.id)
  }).from(schema.inventoryStock)
    .where(sql`${schema.inventoryStock.reorderLevel} > 0`); // Simplified logic

  return c.json({
    success: true,
    data: {
      sales: salesSummary[0],
      purchases: purchaseSummary[0],
      lowStockCount: lowStock[0].count,
    },
    error: null
  });
});

/**
 * DAILY SALES (For Charts)
 */
reportsAPI.get('/sales/daily', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  
  // Group by date (SQLite logic using date function on unix timestamp)
  const dailyChart = await db.select({
    date: sql<string>`date(transaction_date, 'unixepoch')`,
    total: sum(schema.saleSale.payableAmount),
    count: count(schema.saleSale.id)
  })
  .from(schema.saleSale)
  .groupBy(sql`date(transaction_date, 'unixepoch')`)
  .orderBy(sql`date(transaction_date, 'unixepoch') ASC`)
  .limit(30);

  return c.json({ success: true, data: dailyChart, error: null });
});

/**
 * LOW STOCK LIST
 */
reportsAPI.get('/inventory/low-stock', async (c) => {
  const db = drizzle(c.env.DB_TENANT);

  const items = await db.select({
    id: schema.inventoryStock.id,
    name: schema.inventoryStock.name,
    code: schema.inventoryStock.code,
    reorderLevel: schema.inventoryStock.reorderLevel,
    currentQuantity: sql<number>`COALESCE(SUM(${schema.inventoryStockQuantity.quantity}), 0)`
  })
  .from(schema.inventoryStock)
  .leftJoin(schema.inventoryStockQuantity, eq(schema.inventoryStock.id, schema.inventoryStockQuantity.stockId))
  .groupBy(schema.inventoryStock.id)
  .having(sql`currentQuantity <= ${schema.inventoryStock.reorderLevel}`)
  .where(eq(schema.inventoryStock.isDeleted, false));

  return c.json({ success: true, data: items, error: null });
});

export default reportsAPI;
