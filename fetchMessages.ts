import { RestAPI } from "@webpack/common";

import { BATCH_SIZE, MAX_RETRIES } from "./constants";
import { debugLog } from "./debug";

export interface FetchProgress {
    fetched: number;
    done: boolean;
    error: string | null;
}

export type ProgressCallback = (progress: FetchProgress) => void;

export interface FetchOptions {
    channelId: string;
    batchDelay: number;
    onProgress: ProgressCallback;
    signal: { aborted: boolean };
    beforeId?: string;
    afterId?: string;
}

export async function fetchAllMessages(options: FetchOptions): Promise<any[]> {
    const { channelId, batchDelay, onProgress, signal } = options;
    const allMessages: any[] = [];
    let currentBeforeId: string | undefined = options.beforeId;
    let hasMore = true;

    await debugLog("INFO", `Starting fetch for channel ${channelId}, batchDelay=${batchDelay}, beforeId=${options.beforeId ?? "none"}, afterId=${options.afterId ?? "none"}`);

    while (hasMore && !signal.aborted) {
        const batch = await fetchBatchWithRetry(channelId, currentBeforeId, signal);

        if (signal.aborted) {
            await debugLog("INFO", `Fetch aborted after ${allMessages.length} messages`);
            break;
        }

        if (!batch || batch.length === 0) {
            await debugLog("DEBUG", "Empty batch received, fetching complete");
            hasMore = false;
            break;
        }

        // If afterId is set, trim messages that are at or before the boundary
        if (options.afterId) {
            const afterBigInt = BigInt(options.afterId);
            const cutoffIndex = batch.findIndex((m: any) => BigInt(m.id) <= afterBigInt);
            if (cutoffIndex !== -1) {
                allMessages.push(...batch.slice(0, cutoffIndex));
                await debugLog("DEBUG", `Hit afterId boundary, trimmed batch at index ${cutoffIndex}`);
                hasMore = false;
                break;
            }
        }

        allMessages.push(...batch);
        currentBeforeId = batch[batch.length - 1].id;

        if (batch.length < BATCH_SIZE) {
            hasMore = false;
        }

        await debugLog("DEBUG", `Batch fetched: ${batch.length} messages, total: ${allMessages.length}, beforeId: ${currentBeforeId}`);
        onProgress({ fetched: allMessages.length, done: false, error: null });

        if (hasMore) {
            await sleep(batchDelay);
        }
    }

    // API returns newest-first; reverse to chronological order
    allMessages.reverse();

    await debugLog("INFO", `Fetch complete: ${allMessages.length} messages total`);
    onProgress({ fetched: allMessages.length, done: true, error: null });
    return allMessages;
}

async function fetchBatchWithRetry(
    channelId: string,
    beforeId: string | undefined,
    signal: { aborted: boolean }
): Promise<any[]> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (signal.aborted) return [];

        try {
            const query: Record<string, any> = { limit: BATCH_SIZE };
            if (beforeId) query.before = beforeId;

            const response = await RestAPI.get({
                url: `/channels/${channelId}/messages`,
                query,
            });

            return response.body;
        } catch (error: any) {
            await debugLog("ERROR", `Fetch error (attempt ${attempt + 1}/${MAX_RETRIES})`, {
                status: error?.status,
                message: error?.message,
                body: error?.body,
            });

            // Rate limited — wait and retry
            if (error?.status === 429) {
                const retryAfter = (error.body?.retry_after ?? 5) * 1000;
                await debugLog("WARN", `Rate limited, waiting ${retryAfter}ms`);
                await sleep(retryAfter);
                continue;
            }

            // Permission error — non-retryable
            if (error?.status === 403) {
                throw new Error("Missing permissions to read this channel.");
            }

            // Other errors — retry with backoff
            if (attempt === MAX_RETRIES - 1) {
                throw new Error(`Failed to fetch messages after ${MAX_RETRIES} attempts: ${error?.message ?? error}`);
            }

            await sleep(1000 * Math.pow(2, attempt));
        }
    }

    return [];
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
