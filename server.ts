import express from "express";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

let _filename: string;
let _dirname: string;

try {
  _filename = fileURLToPath(import.meta.url);
  _dirname = path.dirname(_filename);
} catch (e) {
  // @ts-ignore
  _filename = __filename;
  // @ts-ignore
  _dirname = __dirname;
}

const isPackaged = process.env.NODE_ENV === "production" || Boolean((process as any).pkg);
const DB_PATH = path.join(process.cwd(), "db.json");

async function initDb() {
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify({ files: [] }, null, 2));
  }
}

async function startServer() {
  await initDb();
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get("/api/config", (req, res) => {
    res.json({
      platform: process.platform,
      separator: path.sep,
      homeDir: os.homedir()
    });
  });

  app.get("/api/files", async (req, res) => {
    try {
      const data = JSON.parse(await fs.readFile(DB_PATH, "utf-8"));
      res.json(data.files);
    } catch (err) {
      res.json([]);
    }
  });

  app.post("/api/files", async (req, res) => {
    try {
      const { files } = req.body;
      await fs.writeFile(DB_PATH, JSON.stringify({ files }, null, 2));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to save data" });
    }
  });

  app.get("/api/storage-info", (req, res) => {
    res.json({ path: DB_PATH });
  });

  app.get("/api/local/list-dirs", async (req, res) => {
    let { basePath } = req.query;
    let searchPath = (basePath as string);

    try {
      // If path is empty, provide sensible defaults
      if (!searchPath || searchPath === "/" || searchPath === "\\") {
        if (process.platform === 'win32') {
          // On Windows, if they just type \ or it's empty, show common drives or Home
          const home = os.homedir();
          res.json([home, 'C:\\', 'D:\\']); // Basic drive listing
          return;
        } else {
          searchPath = "/";
        }
      }
      
      const stats = await fs.stat(searchPath);
      if (!stats.isDirectory()) {
        return res.json([]);
      }

      const entries = await fs.readdir(searchPath, { withFileTypes: true });
      const dirs = entries
        .filter(e => e.isDirectory())
        .map(e => path.join(searchPath, e.name));
      
      res.json(dirs);
    } catch (err) {
      res.json([]);
    }
  });

  // Local File System Operations
  // Helper for recursive file scanning
  async function getAllFiles(dirPath: string): Promise<any[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let files: any[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // Skip hidden folders like .git to stay fast
        if (entry.name.startsWith('.')) continue;
        const subFiles = await getAllFiles(fullPath);
        files = [...files, ...subFiles];
      } else {
        const stats = await fs.stat(fullPath);
        files.push({
          id: Math.random().toString(36).substring(7),
          filename: entry.name,
          fullPath: fullPath,
          size: stats.size,
          createdAt: stats.birthtime.toISOString() || stats.mtime.toISOString(),
        });
      }
    }
    return files;
  }

  app.get("/api/local/scan", async (req, res) => {
    const { dirPath } = req.query;
    if (!dirPath || typeof dirPath !== "string") {
      return res.status(400).json({ error: "dirPath is required" });
    }

    try {
      const stats = await fs.stat(dirPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: `Path "${dirPath}" is not a directory` });
      }

      const allFiles = await getAllFiles(dirPath);
      res.json(allFiles);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: `Directory not found: "${dirPath}".` });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/local/organize", async (req, res) => {
    const { operations, targetRoot, action = 'copy' } = req.body;
    // operations: Array<{ sourcePath: string, virtualPath: string, filename: string }>
    
    if (!Array.isArray(operations)) {
      return res.status(400).json({ error: "operations must be an array" });
    }

    const results = [];
    const firstSourcePath = operations.length > 0 ? path.dirname(operations[0].sourcePath) : null;
    const root = targetRoot || firstSourcePath || process.cwd();

    try {
      for (const op of operations) {
        const destDir = path.join(root, op.virtualPath);
        const destPath = path.join(destDir, op.filename);

        try {
          await fs.mkdir(destDir, { recursive: true });
          
          if (action === 'move') {
            try {
              await fs.rename(op.sourcePath, destPath);
            } catch (moveErr: any) {
              // Fallback for cross-device moves (EXDEV error)
              await fs.copyFile(op.sourcePath, destPath);
              await fs.unlink(op.sourcePath);
            }
          } else {
            await fs.copyFile(op.sourcePath, destPath);
          }

          results.push({ 
            filename: op.filename, 
            success: true, 
            destinationPath: destPath 
          });
        } catch (err: any) {
          console.error(`Operation failed for ${op.filename}:`, err);
          results.push({ filename: op.filename, success: false, error: err.message });
        }
      }
      res.json({ success: true, results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/local/open-location", async (req, res) => {
    const { filePath } = req.body;
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "filePath is required" });
    }

    try {
      const platform = process.platform;
      let command = "";

      if (platform === "win32") {
        // Windows: Opens explorer and selects the file
        command = `explorer.exe /select,"${filePath}"`;
      } else if (platform === "darwin") {
        // macOS: Reveals the file in Finder
        command = `open -R "${filePath}"`;
      } else {
        // Linux: Opens the parent directory
        const dir = path.dirname(filePath);
        command = `xdg-open "${dir}"`;
      }

      const { exec } = await import("node:child_process");
      exec(command, (error) => {
        if (error) {
          console.error("Open error", error);
          return res.status(500).json({ error: error.message });
        }
        res.json({ success: true });
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/local/delete", async (req, res) => {
    const { paths } = req.body;
    if (!Array.isArray(paths)) {
      return res.status(400).json({ error: "paths must be an array" });
    }

    const results = [];
    for (const p of paths) {
      try {
        await fs.unlink(p);
        results.push({ path: p, success: true });
      } catch (err: any) {
        results.push({ path: p, success: false, error: err.message });
      }
    }
    res.json({ success: true, results });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !isPackaged) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        // Automatically find an available HMR port
        hmr: { port: 24679 } 
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = isPackaged 
      ? path.join(_dirname, "..", "dist")
      : path.join(process.cwd(), "dist");
    
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Auto-Port Discovery logic
  const startServerOnPort = (port: number) => {
    const server = app.listen(port, "0.0.0.0")
      .on('listening', async () => {
        const url = `http://localhost:${port}`;
        console.log(`
=========================================
  SortIt Server Running
  URL: ${url}
  Database: ${DB_PATH}
=========================================
        `);

        try {
          const platform = process.platform;
          let openCmd = "";
          if (platform === "win32") openCmd = `cmd /c start "" "${url}"`;
          else if (platform === "darwin") openCmd = `open "${url}"`;
          else openCmd = `xdg-open "${url}"`;
          exec(openCmd);
        } catch (e) {}
      })
      .on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`Port ${port} is busy, trying ${port + 1}...`);
          startServerOnPort(port + 1);
        } else {
          console.error("Server error:", err);
        }
      });
  };

  startServerOnPort(Number(PORT));
}

startServer();
