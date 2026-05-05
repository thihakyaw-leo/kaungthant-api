import { Hono } from 'hono';
import { Env } from '../../worker-configuration';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM tenants').all();
  return c.json({ success: true, data: results });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first();
  if (!data) return c.json({ success: false, message: 'Not found' }, 404);
  return c.json({ success: true, data });
});

app.post('/', async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);

  try {
    await c.env.DB.prepare(
      `INSERT INTO tenants (id, name, subdomain, d1_database_id, plan_id, status, owner_username, owner_password, manager_username, manager_password, cashier_username, cashier_password, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, body.name, body.subdomain, body.d1_database_id, body.plan_id || 'basic', body.status || 'active',
      body.owner_username || null, body.owner_password || null,
      body.manager_username || null, body.manager_password || null,
      body.cashier_username || null, body.cashier_password || null,
      createdAt
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
      `UPDATE tenants SET name=?, subdomain=?, d1_database_id=?, plan_id=?, status=?, owner_username=?, owner_password=?, manager_username=?, manager_password=?, cashier_username=?, cashier_password=? WHERE id=?`
    ).bind(
      body.name, body.subdomain, body.d1_database_id, body.plan_id, body.status,
      body.owner_username, body.owner_password, body.manager_username, body.manager_password, body.cashier_username, body.cashier_password, id
    ).run();
    return c.json({ success: true, message: 'Updated' });
  } catch (e: any) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(id).run();
  return c.json({ success: true, message: 'Deleted' });
});

export default app;
