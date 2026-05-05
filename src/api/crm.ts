import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, like, or, sql } from 'drizzle-orm';
import * as schema from '../db/tenant';

const crmAPI = new Hono<{ Bindings: Env }>();

/**
 * 1. CREATE OR UPDATE CUSTOMER
 */
crmAPI.post('/customers', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const body = await c.req.json();
  const now = Math.floor(Date.now() / 1000);
  
  try {
    if (body.id) {
      await db.update(schema.saleCustomer)
        .set({
          name: body.name,
          phone: body.phone,
          email: body.email,
          address: body.address,
          customerGroupId: body.customerGroupId,
          updatedAt: now
        })
        .where(eq(schema.saleCustomer.id, body.id));
      return c.json({ success: true, customerId: body.id });
    } else {
      const customerId = crypto.randomUUID();
      await db.insert(schema.saleCustomer).values({
        id: customerId,
        name: body.name,
        phone: body.phone,
        email: body.email,
        address: body.address,
        customerGroupId: body.customerGroupId || 'default',
        loyaltyPoints: 0,
        statusId: 'active',
        createdAt: now,
        updatedAt: now
      });
      return c.json({ success: true, customerId });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * 2. SEARCH CUSTOMER (By Phone or Name)
 */
crmAPI.get('/customers/search', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const query = c.req.query('q');

  if (!query) return c.json({ success: true, data: [] });

  try {
    const customers = await db
      .select()
      .from(schema.saleCustomer)
      .where(
        or(
          like(schema.saleCustomer.phone, `%${query}%`),
          like(schema.saleCustomer.name, `%${query}%`)
        )
      )
      .limit(5)
      .all();
    
    return c.json({ success: true, data: customers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

/**
 * 3. GET CUSTOMER LOYALTY HISTORY
 */
crmAPI.get('/customers/:id/history', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const customerId = c.req.param('id');

  try {
    const history = await db
      .select()
      .from(schema.saleSale)
      .where(eq(schema.saleSale.customerId, customerId))
      .orderBy(sql`${schema.saleSale.transactionDate} DESC`)
      .limit(10)
      .all();
    
    return c.json({ success: true, data: history });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, error: message }, 500);
  }
});

export default crmAPI;
