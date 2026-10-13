import {startServer} from './app.mjs';
const server = await startServer();
console.log(`CHOG House Cup is running at ${server.origin}`);
let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await server.close();
    process.exit(0);
  });
}
