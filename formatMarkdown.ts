import { MESSAGE_TYPE_TEMPLATES, SYSTEM_MESSAGE_TYPES } from "./constants";

export interface ExportSettings {
    includeEmbeds: boolean;
    includeReactions: boolean;
    includeAttachments: boolean;
    includeEditHistory: boolean;
    includePinIndicator: boolean;
    includeSystemMessages: boolean;
}

export function buildMarkdownDocument(
    channel: any,
    guild: any | null,
    messages: any[],
    settings: ExportSettings
): string {
    const parts: string[] = [];

    parts.push(formatChannelHeader(channel, guild, messages.length));
    parts.push("---\n");

    for (const msg of messages) {
        const formatted = formatMessage(msg, messages, settings);
        if (formatted) {
            parts.push(formatted);
            parts.push("\n---\n");
        }
    }

    return parts.join("\n");
}

export function formatChannelHeader(channel: any, guild: any | null, messageCount: number): string {
    const lines: string[] = [];
    const exportDate = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

    if (channel.type === 1) {
        // DM
        const recipient = channel.recipients?.[0];
        lines.push(`# DM with ${recipient?.username ?? "Unknown User"}`);
    } else if (channel.type === 3) {
        // Group DM
        const names = channel.recipients?.map((r: any) => r.username).join(", ") ?? "Unknown";
        lines.push(`# Group DM: ${names}`);
    } else {
        lines.push(`# #${channel.name}`);
    }

    lines.push("");

    const meta: string[] = [];
    if (guild) meta.push(`**Server:** ${guild.name}`);
    if (channel.topic) meta.push(`**Topic:** ${channel.topic}`);
    meta.push(`**Exported:** ${exportDate}`);
    meta.push(`**Messages:** ${messageCount.toLocaleString()}`);
    lines.push(meta.join("  |  "));
    lines.push("");

    return lines.join("\n");
}

export function formatMessage(msg: any, allMessages: any[], settings: ExportSettings): string | null {
    // System messages
    if (SYSTEM_MESSAGE_TYPES.has(msg.type)) {
        if (!settings.includeSystemMessages) return null;
        return formatSystemMessage(msg);
    }

    const parts: string[] = [];

    // Message header
    const timestamp = formatTimestamp(msg.timestamp);
    const pinIndicator = settings.includePinIndicator && msg.pinned ? " \ud83d\udccc" : "";
    const editedIndicator = msg.editedTimestamp ? " (edited)" : "";
    const displayName = msg.author.globalName || msg.author.username;
    parts.push(`### ${displayName} \u2014 ${timestamp}${editedIndicator}${pinIndicator}`);
    parts.push("");

    // Reply reference
    if (msg.type === 19 && msg.messageReference) {
        const referencedMsg = allMessages.find((m: any) => m.id === msg.messageReference.message_id);
        if (referencedMsg) {
            const refName = referencedMsg.author.globalName || referencedMsg.author.username;
            const refContent = referencedMsg.content.length > 200
                ? referencedMsg.content.slice(0, 200) + "..."
                : referencedMsg.content;
            parts.push(`> **Replying to ${refName}:**`);
            for (const line of refContent.split("\n")) {
                parts.push(`> ${line}`);
            }
            parts.push("");
        } else {
            parts.push("> **Replying to** a deleted or unavailable message");
            parts.push("");
        }
    }

    // Message content
    if (msg.content) {
        parts.push(msg.content);
        parts.push("");
    }

    // Embeds
    if (settings.includeEmbeds && msg.embeds?.length) {
        for (const embed of msg.embeds) {
            parts.push(formatEmbed(embed));
            parts.push("");
        }
    }

    // Attachments
    if (settings.includeAttachments && msg.attachments?.length) {
        parts.push(formatAttachments(msg.attachments));
        parts.push("");
    }

    // Reactions
    if (settings.includeReactions && msg.reactions?.length) {
        parts.push(formatReactions(msg.reactions));
        parts.push("");
    }

    // Edit history
    if (settings.includeEditHistory && msg.editHistory?.length) {
        parts.push(formatEditHistory(msg.editHistory));
        parts.push("");
    }

    return parts.join("\n");
}

export function formatEmbed(embed: any): string {
    const lines: string[] = [];

    const title = embed.title ? `**Embed: ${embed.title}**` : "**Embed**";
    lines.push(`> ${title}`);

    if (embed.description) {
        for (const line of embed.description.split("\n")) {
            lines.push(`> ${line}`);
        }
    }

    if (embed.fields?.length) {
        lines.push(">");
        for (const field of embed.fields) {
            lines.push(`> **${field.name}:** ${field.value}`);
        }
    }

    if (embed.image?.url) {
        lines.push(`> *Image:* [${embed.image.url.split("/").pop() ?? "image"}](${embed.image.url})`);
    }

    if (embed.thumbnail?.url) {
        lines.push(`> *Thumbnail:* [${embed.thumbnail.url.split("/").pop() ?? "thumbnail"}](${embed.thumbnail.url})`);
    }

    if (embed.url) {
        lines.push(`> *URL:* ${embed.url}`);
    }

    return lines.join("\n");
}

export function formatAttachments(attachments: any[]): string {
    const lines: string[] = ["**Attachments:**"];
    for (const att of attachments) {
        const size = formatFileSize(att.size);
        const type = att.content_type ? `, ${att.content_type}` : "";
        lines.push(`- [${att.filename}](${att.url}) (${size}${type})`);
    }
    return lines.join("\n");
}

export function formatReactions(reactions: any[]): string {
    const parts = reactions.map(r => {
        const emoji = r.emoji.id ? `:${r.emoji.name}:` : r.emoji.name;
        return `${emoji} (${r.count})`;
    });
    return `**Reactions:** ${parts.join(" | ")}`;
}

export function formatEditHistory(editHistory: any[]): string {
    const lines: string[] = [];
    lines.push("<details>");
    lines.push(`<summary>Edit History (${editHistory.length} edit${editHistory.length !== 1 ? "s" : ""})</summary>`);
    lines.push("");

    for (const edit of editHistory) {
        const timestamp = formatTimestamp(edit.timestamp);
        lines.push(`**${timestamp}:** ${edit.content}`);
        lines.push("");
    }

    lines.push("</details>");
    return lines.join("\n");
}

export function formatSystemMessage(msg: any): string {
    const template = MESSAGE_TYPE_TEMPLATES[msg.type];
    if (template) return template(msg);
    return `*System message (type ${msg.type})*`;
}

export function formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
