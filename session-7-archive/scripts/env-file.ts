// Writes values back into .env so each setup step feeds the next.
// Never creates .env from scratch — the user must copy .env.example first, so we can never
// silently produce a file that looks configured but has no mnemonics in it.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { SESSION_ROOT } from "@s7/shared";

const ENV_PATH = resolve(SESSION_ROOT, ".env");

export function updateEnv(values: Record<string, string>): string {
  if (!existsSync(ENV_PATH)) {
    throw new Error(`${ENV_PATH} does not exist. Run: cp .env.example .env`);
  }
  let content = readFileSync(ENV_PATH, "utf8");
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    content = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
    // Keep the running process consistent with what we just wrote.
    process.env[key] = value;
  }
  writeFileSync(ENV_PATH, content);
  return ENV_PATH;
}
