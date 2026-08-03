import dotenv from "dotenv";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sessionRoot = join(__dirname, "..");
const sdkDir = join(sessionRoot, "sdk");
const PORT = Number(process.env.PORT ?? 3000);

dotenv.config({ path: join(sessionRoot, ".env") });

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, "public")));

function runScript(script, extraEnv = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn("node", [join(sdkDir, script)], {
            cwd: sessionRoot,
            env: { ...process.env, ...extraEnv },
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => { stdout += chunk; });
        child.stderr.on("data", (chunk) => { stderr += chunk; });

        child.on("close", (code) => {
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(stderr.trim() || stdout.trim() || `${script} failed`));
        });
    });
}

app.get("/api/status", (_req, res) => {
    const path = join(sdkDir, "deployment.json");
    if (!existsSync(path)) {
        return res.json({ deployed: false });
    }
    try {
        const data = JSON.parse(readFileSync(path, "utf8"));
        res.json({ deployed: true, ...data });
    } catch {
        res.json({ deployed: false });
    }
});

app.post("/api/mint", async (_req, res) => {
    try {
        const { stdout } = await runScript("mint.js");
        res.json({ ok: true, output: stdout });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post("/api/transfer", async (req, res) => {
    const recipient = req.body?.recipient?.trim();
    if (!recipient || !/^0x[0-9a-fA-F]{64}$/.test(recipient)) {
        return res.status(400).json({
            ok: false,
            error: "Enter a valid MOI address (0x + 64 hex chars)",
        });
    }

    try {
        const { stdout } = await runScript("transfer.js", {
            RECIPIENT_ADDRESS: recipient,
        });
        res.json({ ok: true, output: stdout });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`NFT demo UI → http://localhost:${PORT}`);
});
