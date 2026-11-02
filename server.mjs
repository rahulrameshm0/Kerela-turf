import { readConfig } from "./lib/config.mjs";
import { firebaseServices } from "./lib/firebase.mjs";
import { createServer } from "./api.mjs";
try {
  const config = readConfig();
  const services = await firebaseServices(config);
  const server = createServer(config, services);
  server.listen(config.port, process.env.HOST || "127.0.0.1", () =>
    console.log(
      `TurfKerala: ${config.origin} (${config.firebaseReady ? "Firebase Admin credentials verified" : "configuration required; empty inventory"})`,
    ),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => server.close(() => process.exit(0)));
} catch (error) {
  console.error(`TurfKerala startup failed: ${error.message}`);
  process.exitCode = 1;
}
