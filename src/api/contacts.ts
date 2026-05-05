import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';

import * as schema from '../db/tenant';
import { customerSchema, supplierSchema } from '../schemas/contact';

const contactsAPI = new Hono<{ Bindings: Env }>();

/**
 * CUSTOMERS
 */
contactsAPI.get('/customers', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const customers = await db.select().from(schema.saleCustomer);
  return c.json({ success: true, data: customers, error: null });
});

contactsAPI.post('/customers', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const body = await c.req.json();
  const validation = customerSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ success: false, data: null, error: validation.error.message }, 400);
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  try {
    await db.insert(schema.saleCustomer).values({
      id,
      ...validation.data,
      balance: 0,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ success: true, data: { id }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, data: null, error: message }, 500);
  }
});

/**
 * SUPPLIERS
 */
contactsAPI.get('/suppliers', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const suppliers = await db.select().from(schema.purchaseSupplier);
  return c.json({ success: true, data: suppliers, error: null });
});

contactsAPI.post('/suppliers', async (c) => {
  const db = drizzle(c.env.DB_TENANT);
  const body = await c.req.json();
  const validation = supplierSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ success: false, data: null, error: validation.error.message }, 400);
  }

  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  try {
    await db.insert(schema.purchaseSupplier).values({
      id,
      ...validation.data,
      balance: 0,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ success: true, data: { id }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ success: false, data: null, error: message }, 500);
  }
});

export default contactsAPI;
