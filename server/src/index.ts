import { createServer } from "./server";
import { env } from "./config/env";

const { loadTokenRegistry } = require("./data/tokenRegistry") as {
  loadTokenRegistry: () => Promise<void>;
};

const { startMonitor } = require("./monitor/positionMonitor") as {
  startMonitor: () => void;
};

loadTokenRegistry().catch(() => {
  // Falls back to hardcoded list on failure.
});

const app = createServer();

app.listen(env.PORT, env.HOST, () => {
  console.log(`Homie agent server running on http://${env.HOST}:${env.PORT}`);
  startMonitor();
});
