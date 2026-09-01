import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

// dotenv resolves `.env` from the process working directory, but the
// production bundle is started by pm2 from `dist/` (pm2 sets the process cwd
// to the script's directory), where no `.env` exists. Load it relative to
// this module instead so the same file works both from source (tsx) and from
// the bundled `dist/index.js`:
//   - source:  server/env.ts      -> ../.env = project root
//   - bundle:  dist/index.js      -> ../.env = project root
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(moduleDir, "..");

dotenv.config({ path: path.join(rootDir, ".env") });
