/*
 * ExportToMarkdown
 * SPDX-License-Identifier: MIT
 */

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
    signal: AbortSignal;
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

        const nextBeforeId = batch[batch.length - 1].id;
        if (currentBeforeId && BigInt(nextBeforeId) >= BigInt(currentBeforeId))
            throw new Error("Discord returned a repeated page. Please try the export again.");
        allMessages.push(...batch);
        currentBeforeId = nextBeforeId;

        if (batch.length < BATCH_SIZE) {
            hasMore = false;
        }

        await debugLog("DEBUG", `Batch fetched: ${batch.length} messages, total: ${allMessages.length}, beforeId: ${currentBeforeId}`);
        onProgress({ fetched: allMessages.length, done: false, error: null });

        if (hasMore) {
            await sleep(Math.max(200, Number.isFinite(batchDelay) ? batchDelay : 600), signal);
        }
    }

    signal.throwIfAborted();
    // API returns newest-first; reverse to chronological order
    allMessages.reverse();

    await debugLog("INFO", `Fetch complete: ${allMessages.length} messages total`);
    onProgress({ fetched: allMessages.length, done: true, error: null });
    return allMessages;
}

async function fetchBatchWithRetry(
    channelId: string,
    beforeId: string | undefined,
    signal: AbortSignal
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

            if (!Array.isArray(response.body))
                throw new Error("Discord returned an invalid message response.");
            return response.body;
        } catch (error: any) {
            await debugLog("ERROR", `Fetch error (attempt ${attempt + 1}/${MAX_RETRIES})`, {
                status: error?.status,
                message: error?.message,
                body: error?.body,
            });

            // Rate limited — wait and retry
            if (error?.status === 429) {
                if (attempt === MAX_RETRIES - 1)
                    throw new Error("Discord is still rate limiting requests. Wait a little and try again; the export is incomplete.");
                const seconds = Number(error.body?.retry_after);
                const retryAfter = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5000;
                await debugLog("WARN", `Rate limited, waiting ${retryAfter}ms`);
                await sleep(retryAfter, signal);
                continue;
            }

            // Permission error — non-retryable
            if (error?.status === 403) {
                throw new Error("Missing permissions to read this channel.");
            }
            if (error?.status === 401) throw new Error("Your Discord session has expired. Please sign in again.");
            if (error?.status === 404) throw new Error("This channel is unavailable or has no message history.");

            // Other errors — retry with backoff
            if (attempt === MAX_RETRIES - 1) {
                throw new Error(`Failed to fetch messages after ${MAX_RETRIES} attempts: ${error?.message ?? error}`);
            }

            await sleep(1000 * Math.pow(2, attempt), signal);
        }
    }

    throw new Error("Unable to finish fetching messages.");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) { reject(signal.reason); return; }
        const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal.addEventListener("abort", onAbort, { once: true });
    });
}
