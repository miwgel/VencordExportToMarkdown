import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

// Use the same compiler as the Vencord checkout. No Discord account or network required.
const buildRoot = resolve(process.env.VENCORD_DIR || ".vencord-build");
const { build } = await import(pathToFileURL(join(buildRoot, "node_modules/esbuild/lib/main.js")));
const output = await mkdtemp(join(tmpdir(), "markdown-tests-"));
const modules = {};
for (const name of ["dateUtils", "formatMarkdown", "fetchMessages"]) {
    const outfile = join(output, `${name}.mjs`);
    await build({
        entryPoints: [`${name}.ts`], outfile, bundle: true, platform: "node", format: "esm",
        plugins: [{ name: "discord-mocks", setup(builder) {
            builder.onResolve({ filter: /^@webpack\/common$|^\.\/debug$/ }, args => ({ path: args.path, namespace: "mock" }));
            builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: args.path === "./debug"
                ? "export async function debugLog() {}"
                : "export const RestAPI = {get: (...args) => globalThis.testRestGet(...args)};" }));
        } }],
    });
    modules[name] = await import(pathToFileURL(outfile));
}
await rm(output, { recursive: true });
const dates = modules.dateUtils;
const { fetchAllMessages } = modules.fetchMessages;
const format = modules.formatMarkdown;
const settings = Object.fromEntries(["includeEmbeds", "includeReactions", "includeAttachments", "includeEditHistory", "includePinIndicator", "includeSystemMessages"].map(k => [k, true]));
const message = (id, extra = {}) => ({ id: String(id), type: 0, content: `message ${id}`, author: { username: "fixture-user", global_name: "Fixture Name" }, timestamp: "2026-01-01T00:00:00.000Z", ...extra });
const fetchOptions = (extra = {}) => ({ channelId: "fixture", batchDelay: 200, onProgress() {}, signal: new AbortController().signal, ...extra });

test("date bounds include both complete local days", () => {
    const { beforeId, afterId } = dates.getDateBoundaries("2026-03-08", "2026-03-08");
    assert.equal(BigInt(afterId) + 1n, BigInt(dates.dateToSnowflake(new Date(2026, 2, 8))));
    assert.equal(beforeId, dates.dateToSnowflake(new Date(2026, 2, 9)));
    const lastMillisecond = BigInt(dates.dateToSnowflake(dates.endOfDay(new Date(2026, 2, 8)))) + 42n;
    assert.ok(lastMillisecond < BigInt(beforeId));
});
test("invalid and reversed date ranges fail before fetching", () => {
    for (const [from, to] of [["2026-02-30", ""], ["bad", ""], ["2026-02-02", "2026-01-01"], ["2014-01-01", ""]])
        assert.throws(() => dates.getDateBoundaries(from, to));
});
test("REST field names preserve display names, edited status, and replies outside the range", () => {
    const reply = message(2, { type: 19, edited_timestamp: "2026-01-02T00:00:00Z", message_reference: { message_id: "1" }, referenced_message: message(1) });
    const result = format.buildMarkdownDocument({ type: 0, name: "fixture" }, null, [reply], settings);
    assert.match(result, /Fixture Name/);
    assert.match(result, /\(edited\)/);
    assert.match(result, /Replying to Fixture Name/);
    assert.match(result, /> message 1/);
});
test("cached camelCase messages remain supported", () => {
    const reply = message(2, { type: 19, messageReference: { message_id: "1" }, editedTimestamp: "2026-01-02", author: { username: "fixture", globalName: "Cached Name" } });
    const result = format.formatMessage(reply, [message(1)], settings);
    assert.match(result, /Cached Name/);
    assert.match(result, /Replying to Fixture Name/);
});
test("attachments, embeds, reactions, and local edits honor settings", () => {
    const msg = message(1, { attachments: [{ filename: "fixture.txt", url: "https://example.invalid/file", size: 2048 }], embeds: [{ title: "Fixture embed" }], reactions: [{ emoji: { name: "test" }, count: 2 }], editHistory: [{ content: "old fixture", timestamp: "2026-01-01" }] });
    const result = format.formatMessage(msg, [], settings);
    for (const text of ["fixture.txt", "Fixture embed", "test (2)", "old fixture"]) assert.ok(result.includes(text));
    const disabled = format.formatMessage(msg, [], Object.fromEntries(Object.keys(settings).map(k => [k, false])));
    for (const text of ["fixture.txt", "Fixture embed", "test (2)", "old fixture"]) assert.ok(!disabled.includes(text));
});
test("pagination uses the oldest ID and returns chronological messages", async () => {
    let calls = 0;
    globalThis.testRestGet = async ({ query }) => {
        calls++;
        if (calls === 1) return { body: Array.from({ length: 100 }, (_, i) => message(101 - i)) };
        assert.equal(query.before, "2");
        return { body: [message(1)] };
    };
    const result = await fetchAllMessages(fetchOptions());
    assert.equal(result.length, 101);
    assert.equal(result[0].id, "1");
    assert.equal(result.at(-1).id, "101");
});
test("lower date boundary excludes earlier messages", async () => {
    globalThis.testRestGet = async () => ({ body: [message(3), message(2), message(1)] });
    const result = await fetchAllMessages(fetchOptions({ afterId: "1" }));
    assert.deepEqual(result.map(m => m.id), ["2", "3"]);
});
test("exhausted rate limits fail instead of reporting a complete export", async () => {
    let calls = 0;
    const progress = [];
    globalThis.testRestGet = async () => { calls++; throw { status: 429, body: { retry_after: 0.001 } }; };
    await assert.rejects(fetchAllMessages(fetchOptions({ onProgress: p => progress.push(p) })), /incomplete/);
    assert.equal(calls, 3);
    assert.ok(!progress.some(p => p.done));
});
test("permission errors are not retried", async () => {
    let calls = 0;
    globalThis.testRestGet = async () => { calls++; throw { status: 403 }; };
    await assert.rejects(fetchAllMessages(fetchOptions()), /permissions/);
    assert.equal(calls, 1);
});
test("cancellation interrupts a rate-limit wait without additional requests", async () => {
    const controller = new AbortController();
    let calls = 0;
    globalThis.testRestGet = async () => {
        calls++;
        setTimeout(() => controller.abort(), 10);
        throw { status: 429, body: { retry_after: 60 } };
    };
    await assert.rejects(fetchAllMessages(fetchOptions({ signal: controller.signal })), { name: "AbortError" });
    assert.equal(calls, 1);
});
test("repeated pages fail instead of looping forever", async () => {
    globalThis.testRestGet = async () => ({ body: Array.from({ length: 100 }, (_, i) => message(101 - i)) });
    await assert.rejects(fetchAllMessages(fetchOptions()), /repeated page/);
});
