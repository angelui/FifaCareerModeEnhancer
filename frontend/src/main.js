import { runBootstrap } from "./bootstrap.js";
import { startRouter } from "./router.js";
import "./styles.css";

async function boot() {
  await runBootstrap();
  startRouter();
}

boot();
