import { Hono } from 'hono';
import { Env } from '../../worker-configuration';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, email, full_name, role, status, permissions, last_login_at, last_activity_at, created_at FROM saas_users').all();
  return c.json({ success: true, data: results });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.env.DB.prepare('SELECT id, email, full_name, role, status, permissions, last_login_at, last_activity_at, created_at FROM saas_users WHERE id = ?').bind(id).first();
  if (!data) return c.json({ success: false, message: 'Not found' }, 404);
  return c.json({ success: true, data });
});

app.post('/', async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);

  try {
    await c.env.DB.prepare(
      `INSERT INTO saas_users (id, email, full_name, password_hash, role, status, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, body.email, body.full_name, body.password_hash, body.role, body.status || 'active', JSON.stringify(body.permissions || {}), createdAt
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
      `UPDATE saas_users SET email=?, full_name=?, role=?, status=?, permissions=? WHERE id=?`
    ).bind(body.email, body.full_name, body.role, body.status, JSON.stringify(body.permissions), id).run();
    return c.json({ success: true, message: 'Updated' });
  } catch (e: any) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM saas_users WHERE id = ?').bind(id).run();
  return c.json({ success: true, message: 'Deleted' });
});

export default app;
