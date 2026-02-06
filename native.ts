import { appendFileSync, writeFileSync } from "fs";
import { join } from "path";

const LOG_FILE = join(__dirname, "export-debug.log");

export function initLog(_: null) {
    writeFileSync(LOG_FILE, `[ExportToMarkdown] Debug log started at ${new Date().toISOString()}\n`);
    return LOG_FILE;
}

export function debugLog(_: null, level: string, message: string, data?: string) {
    const timestamp = new Date().toISOString();
    let line = `[${timestamp}] [${level}] ${message}`;
    if (data) line += `\n  ${data}`;
    line += "\n";
    appendFileSync(LOG_FILE, line);
}
