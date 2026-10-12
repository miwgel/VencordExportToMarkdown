/*
 * ExportToMarkdown
 * SPDX-License-Identifier: MIT
 */

import { app, IpcMainInvokeEvent } from "electron";
import { appendFileSync, writeFileSync } from "fs";
import { join } from "path";

const logFile = () => join(app.getPath("userData"), "export-to-markdown-debug.log");

export function initLog(_: IpcMainInvokeEvent) {
    writeFileSync(logFile(), `[ExportToMarkdown] Debug log started at ${new Date().toISOString()}\n`);
    return logFile();
}

export function debugLog(_: IpcMainInvokeEvent, level: string, message: string, data?: string) {
    const timestamp = new Date().toISOString();
    let line = `[${timestamp}] [${level}] ${message}`;
    if (data) line += `\n  ${data}`;
    line += "\n";
    appendFileSync(logFile(), line);
}
