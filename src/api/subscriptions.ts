import { Hono } from 'hono';
import { Env } from '../../worker-configuration';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM subscriptions').all();
  return c.json({ success: true, data: results });
});

app.post('/', async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      `INSERT INTO subscriptions (id, tenant_id, plan_id, start_date, end_date, auto_renew, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, body.tenant_id, body.plan_id, body.start_date, body.end_date, body.auto_renew !== undefined ? body.auto_renew : 1, body.status || 'active'
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
      `UPDATE subscriptions SET plan_id=?, start_date=?, end_date=?, auto_renew=?, status=? WHERE id=?`
    ).bind(body.plan_id, body.start_date, body.end_date, body.auto_renew, body.status, id).run();
    return c.json({ success: true, message: 'Updated' });
  } catch (e: any) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

export default app;
