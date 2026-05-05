import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, sql, gte, and } from 'drizzle-orm';
import * as schema from '../db/tenant';

const analyticsAPI = new Hono<{ Bindings: Env }>();

/**
 * 1. DASHBOARD OVERVIEW (KPIs)
 * - Today's Sales
 * - Monthly Sales
 * - Active Customers
 * - Low Stock Count
 */
analyticsAPI.get('/overview', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const now = Math.floor(Date.now() / 1000);
  const startOfDay = Math.floor(new Date().setHours(0,0,0,0) / 1000);
  const startOfMonth = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000);

  try {
    const salesStats = await db
      .select({
        todaySales: sql<number>`COALESCE(SUM(CASE WHEN ${schema.saleSale.transactionDate} >= ${startOfDay} THEN ${schema.saleSale.payableAmount} ELSE 0 END), 0)`,
        monthlySales: sql<number>`COALESCE(SUM(CASE WHEN ${schema.saleSale.transactionDate} >= ${startOfMonth} THEN ${schema.saleSale.payableAmount} ELSE 0 END), 0)`,
        totalOrders: sql<number>`COUNT(${schema.saleSale.id})`
      })
      .from(schema.saleSale)
      .get();

    const lowStockCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.inventoryStockQuantity)
      .where(sql`${schema.inventoryStockQuantity.quantity} <= 5`) // Threshold
      .get();

    return c.json({ 
      success: true, 
      data: {
        ...salesStats,
        lowStockAlerts: lowStockCount?.count || 0
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * 2. TOP SELLING PRODUCTS (Last 30 Days)
 */
analyticsAPI.get('/top-products', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  
  try {
    const topProducts = await db
      .select({
        id: schema.inventoryStock.id,
        name: schema.inventoryStock.name,
        code: schema.inventoryStock.code,
        totalQty: sql<number>`SUM(${schema.saleSaleDetail.quantity})`,
        totalRevenue: sql<number>`SUM(${schema.saleSaleDetail.totalPrice})`
      })
      .from(schema.saleSaleDetail)
      .innerJoin(schema.inventoryStock, eq(schema.saleSaleDetail.stockId, schema.inventoryStock.id))
      .groupBy(schema.inventoryStock.id)
      .orderBy(sql`SUM(${schema.saleSaleDetail.quantity}) DESC`)
      .limit(10)
      .all();

    return c.json({ success: true, data: topProducts });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * 3. CUSTOMER TIER CONTRIBUTION
 */
analyticsAPI.get('/customer-tiers', async (c) => {
  const db = drizzle(c.env.DB_TENANT);

  try {
    const tierStats = await db
      .select({
        tierName: schema.saleCustomerGroup.name,
        customerCount: sql<number>`COUNT(${schema.saleCustomer.id})`,
        totalSpent: sql<number>`SUM(${schema.saleSale.payableAmount})`
      })
      .from(schema.saleCustomerGroup)
      .leftJoin(schema.saleCustomer, eq(schema.saleCustomer.customerGroupId, schema.saleCustomerGroup.id))
      .leftJoin(schema.saleSale, eq(schema.saleSale.customerId, schema.saleCustomer.id))
      .groupBy(schema.saleCustomerGroup.id)
      .all();

    return c.json({ success: true, data: tierStats });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

export default analyticsAPI;
