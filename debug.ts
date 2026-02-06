import { Native } from "@utils/types";

import type * as NativeModule from "./native";

const native = VencordNative.pluginHelpers.ExportToMarkdown as Native<typeof NativeModule>;

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
