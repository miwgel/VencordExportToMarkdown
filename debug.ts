/*
 * ExportToMarkdown
 * SPDX-License-Identifier: MIT
 */

import type { PluginNative } from "@utils/types";

import type * as NativeModule from "./native";

const native = VencordNative.pluginHelpers.ExportToMarkdown as PluginNative<typeof NativeModule> | undefined;

let enabled = false;
let initialization: Promise<unknown> | undefined;

export function setDebugEnabled(value: boolean) {
    enabled = value;
}

export async function debugLog(level: "INFO" | "WARN" | "ERROR" | "DEBUG", message: string, data?: any) {
    if (!enabled) return;
    try {
        if (!native) throw new Error("Native debug logging unavailable");
        initialization ??= native.initLog();
        await initialization;
        const dataStr = data !== undefined ? JSON.stringify(data, null, 2) : undefined;
        await native.debugLog(level, message, dataStr);
    } catch (e) {
        console.log(`[ExportToMarkdown] [${level}] ${message}`, data ?? "");
    }
}
