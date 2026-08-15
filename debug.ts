/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const native = VencordNative.pluginHelpers.ExportToMarkdown as unknown as {
    initLog(): Promise<string>;
    debugLog(level: string, message: string, data?: string): Promise<void>;
};

let enabled = false;
let initialized = false;

export function setDebugEnabled(value: boolean) {
    enabled = value;
}

async function ensureInit() {
    if (!initialized) {
        try {
            await native.initLog();
            initialized = true;
        } catch (e) {
            console.error("[ExportToMarkdown] Failed to init debug log:", e);
        }
    }
}

export async function debugLog(level: "INFO" | "WARN" | "ERROR" | "DEBUG", message: string, data?: any) {
    if (!enabled) return;
    await ensureInit();
    const dataStr = data !== undefined ? JSON.stringify(data, null, 2) : undefined;
    try {
        await native.debugLog(level, message, dataStr);
    } catch (e) {
        console.log(`[ExportToMarkdown] [${level}] ${message}`, data ?? "");
    }
}
