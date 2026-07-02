import { defineConfig } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");

function serveDatasetPlugin() {
  return {
    name: "serve-dataset",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const relativePath = decodeURIComponent(req.url || "/").replace(/^\//, "");
        const filePath = path.join(dataDir, relativePath);

        if (!filePath.startsWith(dataDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          next();
          return;
        }

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        fs.createReadStream(filePath).pipe(res);
      });
    },
    closeBundle() {
      const outDir = path.resolve(__dirname, "dist/data");
      fs.mkdirSync(outDir, { recursive: true });

      for (const file of fs.readdirSync(dataDir)) {
        if (file.endsWith(".csv")) {
          fs.copyFileSync(path.join(dataDir, file), path.join(outDir, file));
        }
      }
    },
  };
}

export default defineConfig({
  root: __dirname,
  publicDir: "public",
  plugins: [serveDatasetPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
