import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { Button, Forms, React, Text, TextInput } from "@webpack/common";

import { DatePreset, dateToInputValue, dateToSnowflake, endOfDay, getPresetDateRange, inputValueToDate } from "./dateUtils";
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
    rootProps: Record<string, any>;
}) {
    const [status, setStatus] = React.useState<ExportStatus>("config");
    const [activePreset, setActivePreset] = React.useState<DatePreset>("all");
    const [fromDate, setFromDate] = React.useState("");
    const [toDate, setToDate] = React.useState("");
    const [progress, setProgress] = React.useState<FetchProgress>({ fetched: 0, done: false, error: null });
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const [markdownBlob, setMarkdownBlob] = React.useState<Blob | null>(null);
    const abortRef = React.useRef({ aborted: false });

    const handlePresetClick = (preset: DatePreset) => {
        setActivePreset(preset);
        const { from, to } = getPresetDateRange(preset);
        setFromDate(dateToInputValue(from));
        setToDate(dateToInputValue(to));
    };

    const handleFromChange = (value: string) => {
        setFromDate(value);
        setActivePreset(null as any);
    };

    const handleToChange = (value: string) => {
        setToDate(value);
        setActivePreset(null as any);
    };

    const startExport = async () => {
        setStatus("fetching");
        abortRef.current = { aborted: false };

        let beforeId: string | undefined;
        let afterId: string | undefined;

        const fromParsed = inputValueToDate(fromDate);
        const toParsed = inputValueToDate(toDate);

        if (toParsed) {
            beforeId = dateToSnowflake(endOfDay(toParsed));
        }
        if (fromParsed) {
            afterId = dateToSnowflake(fromParsed);
        }

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
                onProgress: (p) => setProgress(p),
                signal: abortRef.current,
                beforeId,
                afterId,
            });

            if (abortRef.current.aborted) {
                setStatus("cancelled");
                return;
            }

            setStatus("formatting");
            await debugLog("INFO", `Formatting ${messages.length} messages`);

            const exportSettings: ExportSettings = {
                includeEmbeds: settingsStore.includeEmbeds,
                includeReactions: settingsStore.includeReactions,
                includeAttachments: settingsStore.includeAttachments,
                includeEditHistory: settingsStore.includeEditHistory,
                includePinIndicator: settingsStore.includePinIndicator,
                includeSystemMessages: settingsStore.includeSystemMessages,
            };

            const dateRange = { from: fromDate || null, to: toDate || null };
            const markdown = buildMarkdownDocument(channel, guild, messages, exportSettings, dateRange);
            const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });

            await debugLog("INFO", `Export done, markdown size: ${markdown.length} chars`);
            setMarkdownBlob(blob);
            setStatus("done");
        } catch (err: any) {
            await debugLog("ERROR", "Export failed", { message: err?.message, stack: err?.stack });
            setErrorMessage(err?.message ?? "Unknown error occurred");
            setStatus("error");
        }
    };

    const handleDownload = () => {
        if (!markdownBlob) return;
        const channelName = channel.name || `dm-${channel.id}`;
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
        const text = await markdownBlob.text();
        navigator.clipboard.writeText(text);
        rootProps.onClose();
    };

    const handleCancel = () => {
        abortRef.current.aborted = true;
        setStatus("cancelled");
    };

    const channelLabel = channel.name ? `#${channel.name}` : "DM";

    return (
        <ModalRoot {...rootProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <Text variant="heading-lg/semibold" style={{ flexGrow: 1 }}>
                    Export to Markdown
                </Text>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent style={{ padding: "16px" }}>
                <Forms.FormTitle>
                    Channel: {channelLabel}
                </Forms.FormTitle>

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
                                    look={activePreset === key ? Button.Looks.FILLED : Button.Looks.OUTLINED}
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
                                    value={fromDate}
                                    onChange={handleFromChange}
                                    style={{ colorScheme: document.documentElement.classList.contains("theme-dark") ? "dark" : "light" }}
                                />
                            </section>
                            <section style={{ flex: 1 }}>
                                <Forms.FormTitle tag="h5">To</Forms.FormTitle>
                                <TextInput
                                    type="date"
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
            </ModalContent>

            <ModalFooter>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
                    {status === "config" && (
                        <Button color={Button.Colors.BRAND} onClick={startExport}>
                            Start Export
                        </Button>
                    )}
                    {status === "fetching" && (
                        <Button color={Button.Colors.RED} onClick={handleCancel}>
                            Cancel
                        </Button>
                    )}
                    {(status === "done" || status === "error" || status === "cancelled") && (
                        <Button
                            color={Button.Colors.PRIMARY}
                            look={Button.Looks.LINK}
                            onClick={rootProps.onClose}
                        >
                            Close
                        </Button>
                    )}
                    {status === "done" && (
                        <Button color={Button.Colors.PRIMARY} look={Button.Looks.OUTLINED} onClick={handleCopy}>
                            Copy to Clipboard
                        </Button>
                    )}
                    {status === "done" && (
                        <Button color={Button.Colors.BRAND} onClick={handleDownload}>
                            Download
                        </Button>
                    )}
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

export function openExportModal(channel: any, guild: any | null, settingsStore: PluginSettingsStore) {
    openModal(props => (
        <ExportModal channel={channel} guild={guild} settingsStore={settingsStore} rootProps={props} />
    ));
}
