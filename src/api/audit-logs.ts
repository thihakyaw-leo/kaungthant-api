import { Hono } from 'hono';
import { Env } from '../../worker-configuration';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC').all();
  return c.json({ success: true, data: results });
});

app.post('/', async (c) => {
  const body = await c.req.json();
  const id = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);
  try {
    await c.env.DB.prepare(
      `INSERT INTO audit_logs (id, action, actor, target, ip_address, status, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, body.action, body.actor, body.target, body.ip_address || 'internal', body.status || 'success', JSON.stringify(body.metadata || {}), createdAt
    ).run();
    return c.json({ success: true, data: { id } }, 201);
  } catch (e: any) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

export default app;
