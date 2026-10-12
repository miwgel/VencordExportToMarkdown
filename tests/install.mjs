import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

test("Vesktop configuration preserves settings and creates restorable backups", { skip: process.platform === "win32" }, () => {
    const root = mkdtempSync(join(tmpdir(), "markdown-install-"));
    try {
        const dist = join(root, "dist");
        const config = join(root, "profile");
        const bin = join(root, "bin");
        for (const dir of [dist, join(config, "settings"), bin]) mkdirSync(dir, { recursive: true });
        const previousState = { vencordDir: "previous-build", windowBounds: { width: 800 } };
        const previousSettings = { autoUpdate: true, plugins: { ExistingPlugin: { enabled: true, fixture: 42 }, ExportToMarkdown: { enabled: false, batchDelay: 800 } } };
        writeFileSync(join(config, "state.json"), JSON.stringify(previousState));
        writeFileSync(join(config, "settings/settings.json"), JSON.stringify(previousSettings));
        for (const file of ["vencordDesktopMain.js", "vencordDesktopPreload.js", "vencordDesktopRenderer.js", "vencordDesktopRenderer.css", "package.json"])
            writeFileSync(join(dist, file), file.endsWith("Renderer.js") ? "ExportToMarkdown" : "{}");
        const run = () => spawnSync(process.execPath, [resolve("scripts/configure-vesktop.mjs"), dist, config], { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
        writeFileSync(join(bin, "pgrep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
        assert.notEqual(run().status, 0, "must not edit a running profile");
        assert.deepEqual(JSON.parse(readFileSync(join(config, "state.json"))), previousState);
        writeFileSync(join(bin, "pgrep"), "#!/bin/sh\nexit 1\n");
        const result = run();
        assert.equal(result.status, 0, result.stderr);
        const state = JSON.parse(readFileSync(join(config, "state.json")));
        const settings = JSON.parse(readFileSync(join(config, "settings/settings.json")));
        assert.equal(state.vencordDir, dist);
        assert.deepEqual(state.windowBounds, previousState.windowBounds);
        assert.deepEqual(settings.plugins.ExistingPlugin, previousSettings.plugins.ExistingPlugin);
        assert.equal(settings.plugins.ExportToMarkdown.enabled, true);
        assert.equal(settings.plugins.ExportToMarkdown.batchDelay, 800);
        assert.equal(settings.autoUpdate, false);
        const backupRoot = join(config, "export-to-markdown-backups");
        const backup = join(backupRoot, readdirSync(backupRoot)[0]);
        assert.deepEqual(JSON.parse(readFileSync(join(backup, "state.json"))), previousState);
        assert.deepEqual(JSON.parse(readFileSync(join(backup, "vencord-settings.json"))), previousSettings);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
