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
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
}

export function endOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}
