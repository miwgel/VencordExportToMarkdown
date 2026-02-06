import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { Button, React, Text } from "@webpack/common";

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

type ExportStatus = "fetching" | "formatting" | "done" | "error" | "cancelled";

function ExportProgressModal({ channel, guild, settingsStore, rootProps }: {
    channel: any;
    guild: any | null;
    settingsStore: PluginSettingsStore;
    rootProps: Record<string, any>;
}) {
    const [status, setStatus] = React.useState<ExportStatus>("fetching");
    const [progress, setProgress] = React.useState<FetchProgress>({
        fetched: 0, done: false, error: null,
    });
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const [markdownBlob, setMarkdownBlob] = React.useState<Blob | null>(null);
    const abortRef = React.useRef({ aborted: false });

    React.useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const messages = await fetchAllMessages({
                    channelId: channel.id,
                    batchDelay: settingsStore.batchDelay,
                    onProgress: (p) => {
                        if (!cancelled) setProgress(p);
                    },
                    signal: abortRef.current,
                });

                if (abortRef.current.aborted || cancelled) {
                    setStatus("cancelled");
                    return;
                }

                setStatus("formatting");

                const exportSettings: ExportSettings = {
                    includeEmbeds: settingsStore.includeEmbeds,
                    includeReactions: settingsStore.includeReactions,
                    includeAttachments: settingsStore.includeAttachments,
                    includeEditHistory: settingsStore.includeEditHistory,
                    includePinIndicator: settingsStore.includePinIndicator,
                    includeSystemMessages: settingsStore.includeSystemMessages,
                };

                const markdown = buildMarkdownDocument(channel, guild, messages, exportSettings);
                const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });

                if (!cancelled) {
                    setMarkdownBlob(blob);
                    setStatus("done");
                }
            } catch (err: any) {
                if (!cancelled) {
                    setErrorMessage(err?.message ?? "Unknown error occurred");
                    setStatus("error");
                }
            }
        })();

        return () => {
            cancelled = true;
            abortRef.current.aborted = true;
        };
    }, []);

    const handleDownload = () => {
        if (!markdownBlob) return;

        const channelName = channel.name || `dm-${channel.id}`;
        const date = new Date().toISOString().slice(0, 10);
        const filename = `${channelName}-export-${date}.md`;

        const a = document.createElement("a");
        a.href = URL.createObjectURL(markdownBlob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(a.href);
            document.body.removeChild(a);
        }, 100);
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
                <Text variant="text-md/normal" style={{ marginBottom: 8 }}>
                    Channel: <strong>{channelLabel}</strong>
                </Text>

                <Text variant="text-md/normal" style={{ marginBottom: 12 }}>
                    {status === "fetching" && `Fetching messages... ${progress.fetched.toLocaleString()} fetched`}
                    {status === "formatting" && `Formatting ${progress.fetched.toLocaleString()} messages...`}
                    {status === "done" && `Export complete! ${progress.fetched.toLocaleString()} messages.`}
                    {status === "error" && `Error: ${errorMessage}`}
                    {status === "cancelled" && `Export cancelled. ${progress.fetched.toLocaleString()} messages fetched.`}
                </Text>

                {status === "fetching" && (
                    <div style={{
                        width: "100%",
                        height: 6,
                        backgroundColor: "var(--background-modifier-accent)",
                        borderRadius: 3,
                        overflow: "hidden",
                    }}>
                        <div style={{
                            width: "100%",
                            height: "100%",
                            backgroundColor: "var(--brand-500)",
                            borderRadius: 3,
                            opacity: 0.7,
                        }} />
                    </div>
                )}

                {status === "formatting" && (
                    <div style={{
                        width: "100%",
                        height: 6,
                        backgroundColor: "var(--background-modifier-accent)",
                        borderRadius: 3,
                        overflow: "hidden",
                    }}>
                        <div style={{
                            width: "100%",
                            height: "100%",
                            backgroundColor: "var(--brand-500)",
                            borderRadius: 3,
                        }} />
                    </div>
                )}
            </ModalContent>

            <ModalFooter>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
                    {status === "fetching" && (
                        <Button color={Button.Colors.RED} onClick={handleCancel}>
                            Cancel
                        </Button>
                    )}
                    {status === "done" && (
                        <Button color={Button.Colors.BRAND} onClick={handleDownload}>
                            Download
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
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

export function openExportModal(channel: any, guild: any | null, settingsStore: PluginSettingsStore) {
    openModal(props => (
        <ExportProgressModal channel={channel} guild={guild} settingsStore={settingsStore} rootProps={props} />
    ));
}
