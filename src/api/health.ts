import { Hono } from 'hono';

const healthAPI = new Hono<{ Bindings: any, Variables: any }>();

healthAPI.get('/', async (c) => {
  const startTime = Date.now();
  const results: any = {
    status: 'operational',
    timestamp: new Date().toISOString(),
    services: {
      api: { status: 'ok', latency: 0 },
      database: { status: 'checking', latency: 0 },
      kv: { status: 'checking', latency: 0 },
      storage: { status: 'checking', latency: 0 }
    }
  };

  // 1. Check D1 Master Database
  try {
    const dbStart = Date.now();
    await c.env.DB_MASTER.prepare('SELECT 1').first();
    results.services.database.status = 'ok';
    results.services.database.latency = Date.now() - dbStart;
  } catch (e: any) {
    results.services.database.status = 'error';
    results.services.database.message = e.message;
    results.status = 'degraded';
  }

  // 2. Check KV Store
  try {
    const kvStart = Date.now();
    await c.env.KV_CACHE.put('health_check', 'ok', { expirationTtl: 60 });
    const val = await c.env.KV_CACHE.get('health_check');
    results.services.kv.status = val === 'ok' ? 'ok' : 'error';
    results.services.kv.latency = Date.now() - kvStart;
  } catch (e: any) {
    results.services.kv.status = 'error';
    results.services.kv.message = e.message;
    results.status = 'degraded';
  }

  // 3. Check R2 Storage
  try {
    const r2Start = Date.now();
    // Listing with limit 1 to check connection
    await c.env.R2_ARCHIVE.list({ limit: 1 });
    results.services.storage.status = 'ok';
    results.services.storage.latency = Date.now() - r2Start;
  } catch (e: any) {
    results.services.storage.status = 'error';
    results.services.storage.message = e.message;
    results.status = 'degraded';
  }

  results.services.api.latency = Date.now() - startTime;

  return c.json(results);
});

export default healthAPI;
