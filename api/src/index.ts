import { buildServer } from './server.js';

const PORT = Number(process.env.PORT ?? 8787);

const app = buildServer();

app
  .listen({ port: PORT, host: '0.0.0.0' })
  .then(() => {
    console.log(`RenderLab ingestion API listening on :${PORT}`);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
