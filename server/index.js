import { createPool, initSchema } from './db.js';
import { createApp } from './app.js';

const pool = createPool();
await initSchema(pool);
const port = Number(process.env.PORT || 3000);
createApp(pool).listen(port, () => console.log(`Mystery Friends listening on :${port}`));
