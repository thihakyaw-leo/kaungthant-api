import { Hono } from 'hono';
import { Env } from '../../worker-configuration';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM system_settings').all();
  return c.json({ success: true, data: results });
});

app.post('/', async (c) => {
  const body = await c.req.json();
  const updatedAt = Math.floor(Date.now() / 1000);
  try {
    await c.env.DB.prepare(
      `INSERT INTO system_settings (key, value, category, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, category=excluded.category, updated_at=excluded.updated_at`
    ).bind(body.key, body.value, body.category, updatedAt).run();
    return c.json({ success: true, message: 'Setting saved' }, 201);
  } catch (e: any) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

app.delete('/:key', async (c) => {
  const key = c.req.param('key');
  await c.env.DB.prepare('DELETE FROM system_settings WHERE key = ?').bind(key).run();
  return c.json({ success: true, message: 'Deleted' });
});

export default app;
