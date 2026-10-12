/*
 * ExportToMarkdown
 * SPDX-License-Identifier: MIT
 */

const DISCORD_EPOCH = 1420070400000n; // Jan 1, 2015 UTC in ms

export function dateToSnowflake(date: Date): string {
    const ms = BigInt(date.getTime()) - DISCORD_EPOCH;
    return (ms << 22n).toString();
}

export function snowflakeToDate(snowflake: string): Date {
    const ms = BigInt(snowflake) >> 22n;
    return new Date(Number(ms + DISCORD_EPOCH));
}

export type DatePreset = "today" | "this_week" | "this_month" | "this_year" | "all";

export function getPresetDateRange(preset: DatePreset): { from: Date | null; to: Date | null; } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (preset) {
        case "today":
            return { from: today, to: today };
        case "this_week": {
            const day = now.getDay();
            const diff = day === 0 ? 6 : day - 1; // Monday = start of week
            const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
            return { from, to: today };
        }
        case "this_month": {
            const from = new Date(now.getFullYear(), now.getMonth(), 1);
            return { from, to: today };
        }
        case "this_year": {
            const from = new Date(now.getFullYear(), 0, 1);
            return { from, to: today };
        }
        case "all":
            return { from: null, to: null };
    }
}

export function dateToInputValue(date: Date | null): string {
    if (!date) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function inputValueToDate(value: string): Date | null {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid date.");
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d)
        throw new Error("Enter a valid date.");
    return date;
}

export function endOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function getDateBoundaries(from: string, to: string): { beforeId?: string; afterId?: string; } {
    const start = inputValueToDate(from);
    const end = inputValueToDate(to);
    if (start && end && start > end) throw new Error("From date must be on or before To date.");
    if ((start && start.getFullYear() < 2015) || (end && end.getFullYear() < 2015))
        throw new Error("Discord dates must be January 1, 2015 or later.");
    // Both API boundaries are exclusive. Include the entire selected local day,
    // including its first and last millisecond (also across DST transitions).
    return {
        afterId: start ? (BigInt(dateToSnowflake(start)) - 1n).toString() : undefined,
        beforeId: end ? dateToSnowflake(new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)) : undefined,
    };
}
