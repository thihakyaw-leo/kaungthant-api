import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, desc, sql } from 'drizzle-orm';
import * as schema from '../db/tenant';

const auditAPI = new Hono<{ Bindings: Env }>();

/**
 * SYSTEM AUDIT LOGS
 */
auditAPI.get('/logs', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const module = c.req.query('module');
  const userId = c.req.query('userId');

  let query = db.select().from(schema.configAuditLog).orderBy(desc(schema.configAuditLog.createdAt));

  if (module) {
    // @ts-ignore
    query = query.where(eq(schema.configAuditLog.module, module));
  }
  if (userId) {
    // @ts-ignore
    query = query.where(eq(schema.configAuditLog.userId, userId));
  }

  const logs = await query.limit(100);
  return c.json({ success: true, data: logs, error: null });
});

/**
 * STOCK TRANSACTION LOGS
 */
auditAPI.get('/transactions', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const stockId = c.req.query('stockId');
  const type = c.req.query('type');

  let query = db.select().from(schema.configTransactionLog).orderBy(desc(schema.configTransactionLog.createdAt));

  if (stockId) {
    // @ts-ignore
    query = query.where(eq(schema.configTransactionLog.stockId, stockId));
  }
  if (type) {
    // @ts-ignore
    query = query.where(eq(schema.configTransactionLog.transactionType, type));
  }

  const transactions = await query.limit(100);
  return c.json({ success: true, data: transactions, error: null });
});

export default auditAPI;
