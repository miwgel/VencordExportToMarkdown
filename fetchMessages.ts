import { RestAPI } from "@webpack/common";

import { BATCH_SIZE, MAX_RETRIES } from "./constants";

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
}

export async function fetchAllMessages(options: FetchOptions): Promise<any[]> {
    const { channelId, batchDelay, onProgress, signal } = options;
    const allMessages: any[] = [];
    let beforeId: string | undefined;
    let hasMore = true;

    while (hasMore && !signal.aborted) {
        const batch = await fetchBatchWithRetry(channelId, beforeId, signal);

        if (signal.aborted) break;

        if (!batch || batch.length === 0) {
            hasMore = false;
            break;
        }

        allMessages.push(...batch);
        beforeId = batch[batch.length - 1].id;

        if (batch.length < BATCH_SIZE) {
            hasMore = false;
        }

        onProgress({ fetched: allMessages.length, done: false, error: null });

        if (hasMore) {
            await sleep(batchDelay);
        }
    }

    // API returns newest-first; reverse to chronological order
    allMessages.reverse();

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
            // Rate limited — wait and retry
            if (error?.status === 429) {
                const retryAfter = (error.body?.retry_after ?? 5) * 1000;
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
