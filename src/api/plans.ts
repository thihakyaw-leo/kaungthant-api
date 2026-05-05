import { Hono } from 'hono';
import { Env } from '../../worker-configuration';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM pricing_plans').all();
  return c.json({ success: true, data: results });
});

app.post('/', async (c) => {
  const body = await c.req.json();
  const id = body.id || crypto.randomUUID(); // allow custom id like 'basic', 'standard'
  try {
    await c.env.DB.prepare(
      `INSERT INTO pricing_plans (id, name, price, currency, billing_cycle, max_users, max_products, features) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, body.name, body.price, body.currency || 'MMK', body.billing_cycle, body.max_users, body.max_products, JSON.stringify(body.features)
    ).run();
    return c.json({ success: true, data: { id } }, 201);
  } catch (e: any) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  try {
    await c.env.DB.prepare(
      `UPDATE pricing_plans SET name=?, price=?, currency=?, billing_cycle=?, max_users=?, max_products=?, features=? WHERE id=?`
    ).bind(body.name, body.price, body.currency, body.billing_cycle, body.max_users, body.max_products, JSON.stringify(body.features), id).run();
    return c.json({ success: true, message: 'Updated' });
  } catch (e: any) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

export default app;
