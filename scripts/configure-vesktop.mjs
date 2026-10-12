import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const dist = resolve(process.argv[2] || ".vencord-build/dist");
const defaultConfig = process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "vesktop")
    : process.platform === "win32"
        ? join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "vesktop")
        : join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "vesktop");
const config = process.argv[3] ? resolve(process.argv[3]) : defaultConfig;
const files = ["vencordDesktopMain.js", "vencordDesktopPreload.js", "vencordDesktopRenderer.js", "vencordDesktopRenderer.css", "package.json"];
for (const file of files) {
    if (!existsSync(join(dist, file))) throw new Error(`Missing built file: ${file}`);
}
if (!readFileSync(join(dist, "vencordDesktopRenderer.js"), "utf8").includes("ExportToMarkdown"))
    throw new Error("The build does not contain ExportToMarkdown.");
if (!existsSync(join(config, "state.json")))
    throw new Error("Vesktop profile not found. Open Vesktop once, or set VESKTOP_CONFIG_DIR.");

// A running Vesktop can overwrite settings while exiting. Fail before any write.
let running = false;
if (process.platform === "win32") {
    running = /vesktop\.exe/i.test(execFileSync("tasklist", ["/FI", "IMAGENAME eq Vesktop.exe"], { encoding: "utf8" }));
} else {
    try {
        execFileSync("pgrep", ["-ix", "vesktop"], { stdio: "pipe" });
        running = true;
    } catch (error) {
        if (error.status !== 1) throw new Error("Could not check whether Vesktop is running. Quit it and retry in a normal terminal.");
    }
}
if (running) throw new Error("Quit Vesktop completely, then rerun this configure command. The build is ready.");

const statePath = join(config, "state.json");
const settingsPath = join(config, "settings", "settings.json");
const state = JSON.parse(readFileSync(statePath, "utf8"));
const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
const backup = join(config, "export-to-markdown-backups", new Date().toISOString().replaceAll(":", "-"));
mkdirSync(backup, { recursive: true });
copyFileSync(statePath, join(backup, "state.json"));
if (existsSync(settingsPath)) copyFileSync(settingsPath, join(backup, "vencord-settings.json"));

state.vencordDir = dist;
settings.plugins ??= {};
settings.plugins.ExportToMarkdown = { ...settings.plugins.ExportToMarkdown, enabled: true };
// Official binary updates replace custom plugins. Rebuild this checkout to update.
settings.autoUpdate = false;
for (const [path, data] of [[statePath, state], [settingsPath, settings]]) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(`${path}.export-tmp`, `${JSON.stringify(data, null, 4)}\n`, { mode: 0o600 });
    renameSync(`${path}.export-tmp`, path);
}
console.log(`Vesktop configured. Previous settings backed up in ${backup}`);
