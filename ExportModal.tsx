/*
 * ExportToMarkdown
 * SPDX-License-Identifier: MIT
 */

import type { RenderModalProps } from "@vencord/discord-types";
import { Button, Forms, MessageStore, Modal, openModal, React, Text, TextInput } from "@webpack/common";

import { DatePreset, dateToInputValue, getDateBoundaries, getPresetDateRange } from "./dateUtils";
import { debugLog } from "./debug";
import { fetchAllMessages, FetchProgress } from "./fetchMessages";
import { buildMarkdownDocument, ExportSettings } from "./formatMarkdown";

export interface PluginSettingsStore {
    batchDelay: number;
    includeEmbeds: boolean;
    includeReactions: boolean;
    includeAttachments: boolean;
    includeEditHistory: boolean;
    includePinIndicator: boolean;
    includeSystemMessages: boolean;
}

type ExportStatus = "config" | "fetching" | "formatting" | "done" | "error" | "cancelled";

const PRESET_LABELS: { key: DatePreset; label: string; }[] = [
    { key: "today", label: "Today" },
    { key: "this_week", label: "This Week" },
    { key: "this_month", label: "This Month" },
    { key: "this_year", label: "This Year" },
    { key: "all", label: "All" },
];

function ExportModal({ channel, guild, settingsStore, rootProps }: {
    channel: any;
    guild: any | null;
    settingsStore: PluginSettingsStore;
    rootProps: RenderModalProps;
}) {
    const [status, setStatus] = React.useState<ExportStatus>("config");
    const [activePreset, setActivePreset] = React.useState<DatePreset | null>("all");
    const [fromDate, setFromDate] = React.useState("");
    const [toDate, setToDate] = React.useState("");
    const [progress, setProgress] = React.useState<FetchProgress>({ fetched: 0, done: false, error: null });
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const [markdownBlob, setMarkdownBlob] = React.useState<Blob | null>(null);
    const abortRef = React.useRef(new AbortController());
    React.useEffect(() => () => abortRef.current.abort(), []);
    const handleClose = () => {
        abortRef.current.abort();
        rootProps.onClose();
    };

    const handlePresetClick = (preset: DatePreset) => {
        setActivePreset(preset);
        const { from, to } = getPresetDateRange(preset);
        setFromDate(dateToInputValue(from));
        setToDate(dateToInputValue(to));
    };

    const handleFromChange = (value: string) => {
        setFromDate(value);
        setActivePreset(null);
    };

    const handleToChange = (value: string) => {
        setToDate(value);
        setActivePreset(null);
    };

    const startExport = async () => {
        let boundaries: ReturnType<typeof getDateBoundaries>;
        try {
            boundaries = getDateBoundaries(fromDate, toDate);
        } catch (err: any) {
            setErrorMessage(err.message);
            return;
        }
        const { beforeId, afterId } = boundaries;
        setErrorMessage(null);
        setStatus("fetching");
        abortRef.current = new AbortController();
        const controller = abortRef.current;

        await debugLog("INFO", "Export started", {
            channelId: channel.id,
            channelName: channel.name,
            channelType: channel.type,
            guildName: guild?.name,
            fromDate: fromDate || "none",
            toDate: toDate || "none",
            afterId: afterId ?? "none",
            beforeId: beforeId ?? "none",
        });

        try {
            const messages = await fetchAllMessages({
                channelId: channel.id,
                batchDelay: settingsStore.batchDelay,
                onProgress: p => setProgress(p),
                signal: controller.signal,
                beforeId,
                afterId,
            });

            if (controller.signal.aborted) {
                setStatus("cancelled");
                return;
            }

            setStatus("formatting");
            await debugLog("INFO", `Formatting ${messages.length} messages`);
            if (controller.signal.aborted) return;

            const exportSettings: ExportSettings = {
                includeEmbeds: settingsStore.includeEmbeds,
                includeReactions: settingsStore.includeReactions,
                includeAttachments: settingsStore.includeAttachments,
                includeEditHistory: settingsStore.includeEditHistory,
                includePinIndicator: settingsStore.includePinIndicator,
                includeSystemMessages: settingsStore.includeSystemMessages,
            };

            const dateRange = { from: fromDate || null, to: toDate || null };
            // Edit history is local MessageLogger state; Discord's REST API has none.
            const exportMessages = settingsStore.includeEditHistory ? messages.map(msg => ({
                ...msg,
                editHistory: (MessageStore.getMessage(channel.id, msg.id) as { editHistory?: any[]; } | undefined)?.editHistory,
            })) : messages;
            const markdown = buildMarkdownDocument(channel, guild, exportMessages, exportSettings, dateRange);
            const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });

            await debugLog("INFO", `Export done, markdown size: ${markdown.length} chars`);
            if (controller.signal.aborted) return;
            setMarkdownBlob(blob);
            setStatus("done");
        } catch (err: any) {
            if (controller.signal.aborted) return;
            await debugLog("ERROR", "Export failed", { message: err?.message, stack: err?.stack });
            setErrorMessage(err?.message ?? "Unknown error occurred");
            setStatus("error");
        }
    };

    const handleDownload = () => {
        if (!markdownBlob) return;
        const channelName = (channel.name || `dm-${channel.id}`).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
        let dateSuffix: string;
        if (fromDate && toDate) {
            dateSuffix = `${fromDate}_to_${toDate}`;
        } else if (fromDate) {
            dateSuffix = `from_${fromDate}`;
        } else if (toDate) {
            dateSuffix = `to_${toDate}`;
        } else {
            dateSuffix = `all_${new Date().toISOString().slice(0, 10)}`;
        }
        const filename = `${channelName}-export-${dateSuffix}.md`;

        const a = document.createElement("a");
        a.href = URL.createObjectURL(markdownBlob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(a.href);
            document.body.removeChild(a);
        }, 100);

        rootProps.onClose();
    };

    const handleCopy = async () => {
        if (!markdownBlob) return;
        try {
            const text = await markdownBlob.text();
            await navigator.clipboard.writeText(text);
            handleClose();
        } catch {
            setErrorMessage("Could not copy to clipboard. Try Download instead.");
        }
    };

    const handleCancel = () => {
        abortRef.current.abort();
        setStatus("cancelled");
    };

    const channelLabel = channel.name ? `#${channel.name}` : "DM";

    return (
        <Modal
            {...rootProps}
            onClose={handleClose}
            size="sm"
            title="Export to Markdown"
            preview={
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
                    {status === "config" && (
                        <Button color={Button.Colors.BRAND} onClick={startExport}>Start Export</Button>
                    )}
                    {status === "fetching" && (
                        <Button color={Button.Colors.RED} onClick={handleCancel}>Cancel</Button>
                    )}
                    {(status === "done" || status === "error" || status === "cancelled") && (
                        <Button color={Button.Colors.PRIMARY} look={Button.Looks.LINK} onClick={handleClose}>Close</Button>
                    )}
                    {status === "done" && (
                        <Button color={Button.Colors.PRIMARY} look={Button.Looks.LINK} onClick={handleCopy}>Copy to Clipboard</Button>
                    )}
                    {status === "done" && (
                        <Button color={Button.Colors.BRAND} onClick={handleDownload}>Download</Button>
                    )}
                </div>
            }
        >
            <div style={{ padding: "16px" }}>
                <Forms.FormTitle>
                    Channel: {channelLabel}
                </Forms.FormTitle>

                {errorMessage && status !== "error" && (
                    <Text variant="text-sm/normal" role="alert">{errorMessage}</Text>
                )}
                {/* Config phase */}
                {status === "config" && (
                    <>
                        <Forms.FormTitle tag="h5" style={{ marginBottom: 8 }}>
                            Date Range
                        </Forms.FormTitle>

                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                            {PRESET_LABELS.map(({ key, label }) => (
                                <Button
                                    key={key}
                                    size={Button.Sizes.SMALL}
                                    color={activePreset === key ? Button.Colors.BRAND : Button.Colors.PRIMARY}
                                    look={activePreset === key ? Button.Looks.FILLED : Button.Looks.LINK}
                                    onClick={() => handlePresetClick(key)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </div>

                        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                            <section style={{ flex: 1 }}>
                                <Forms.FormTitle tag="h5">From</Forms.FormTitle>
                                <TextInput
                                    type="date"
                                    min="2015-01-01"
                                    value={fromDate}
                                    onChange={handleFromChange}
                                    style={{ colorScheme: document.documentElement.classList.contains("theme-dark") ? "dark" : "light" }}
                                />
                            </section>
                            <section style={{ flex: 1 }}>
                                <Forms.FormTitle tag="h5">To</Forms.FormTitle>
                                <TextInput
                                    type="date"
                                    min="2015-01-01"
                                    value={toDate}
                                    onChange={handleToChange}
                                    style={{ colorScheme: document.documentElement.classList.contains("theme-dark") ? "dark" : "light" }}
                                />
                            </section>
                        </div>
                    </>
                )}

                {/* Progress phase */}
                {status !== "config" && (
                    <>
                        <Text variant="text-md/normal" style={{ marginBottom: 12 }}>
                            {status === "fetching" && `Fetching messages... ${progress.fetched.toLocaleString()} fetched`}
                            {status === "formatting" && `Formatting ${progress.fetched.toLocaleString()} messages...`}
                            {status === "done" && `Export complete! ${progress.fetched.toLocaleString()} messages.`}
                            {status === "error" && `Error: ${errorMessage}`}
                            {status === "cancelled" && `Export cancelled. ${progress.fetched.toLocaleString()} messages fetched.`}
                        </Text>

                        {(status === "fetching" || status === "formatting") && (
                            <div style={{
                                width: "100%",
                                height: 6,
                                backgroundColor: "var(--background-modifier-accent)",
                                borderRadius: 3,
                                overflow: "hidden",
                            }}>
                                <div style={{
                                    width: status === "formatting" ? "100%" : "100%",
                                    height: "100%",
                                    backgroundColor: "var(--brand-500)",
                                    borderRadius: 3,
                                    opacity: status === "fetching" ? 0.7 : 1,
                                }} />
                            </div>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
}

export function openExportModal(channel: any, guild: any | null, settingsStore: PluginSettingsStore) {
    openModal(props => (
        <ExportModal channel={channel} guild={guild} settingsStore={settingsStore} rootProps={props} />
    ));
}
