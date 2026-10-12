/*
 * ExportToMarkdown
 * SPDX-License-Identifier: MIT
 */

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { GuildStore, Menu, UserStore } from "@webpack/common";

import { debugLog, setDebugEnabled } from "./debug";
import { openExportModal } from "./ExportModal";

export const settings = definePluginSettings({
    includeEmbeds: {
        description: "Include embed content in export",
        type: OptionType.BOOLEAN,
        default: true,
    },
    includeReactions: {
        description: "Include reactions in export",
        type: OptionType.BOOLEAN,
        default: true,
    },
    includeAttachments: {
        description: "Include attachment URLs in export",
        type: OptionType.BOOLEAN,
        default: true,
    },
    includeEditHistory: {
        description: "Include edit history (requires MessageLogger)",
        type: OptionType.BOOLEAN,
        default: true,
    },
    includePinIndicator: {
        description: "Mark pinned messages in export",
        type: OptionType.BOOLEAN,
        default: true,
    },
    includeSystemMessages: {
        description: "Include system messages (joins, boosts, pins, etc.)",
        type: OptionType.BOOLEAN,
        default: true,
    },
    batchDelay: {
        description: "Delay between API requests in ms (lower = faster but riskier)",
        type: OptionType.SLIDER,
        default: 600,
        markers: [200, 400, 600, 800, 1000, 1500, 2000],
    },
    debugMode: {
        description: "Write debug logs to a file (for troubleshooting)",
        type: OptionType.BOOLEAN,
        default: false,
    },
});

const channelContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    const channel = props?.channel;
    // Categories and forum/media parents do not have a message history endpoint.
    if (!channel || [4, 15, 16].includes(channel.type)) return;

    const group = findGroupChildrenByChildId("mark-channel-read", children) ?? children;
    group.push(
        <Menu.MenuItem
            id="vc-export-to-markdown"
            label="Export to Markdown"
            action={() => {
                setDebugEnabled(settings.store.debugMode);
                debugLog("INFO", "Menu item clicked", { channelId: props.channel.id, channelName: props.channel.name });
                const exportChannel = {
                    ...channel,
                    recipients: channel.recipients?.map((recipient: any) =>
                        typeof recipient === "string" ? UserStore.getUser(recipient) ?? { username: recipient } : recipient),
                };
                openExportModal(exportChannel, props.guild ?? GuildStore.getGuild(channel.guild_id), settings.store);
            }}
        />
    );
};

export default definePlugin({
    name: "ExportToMarkdown",
    description: "Export full Discord channel chat history to a Markdown file",
    authors: [{ name: "miwgel", id: 0n }],
    settings,
    contextMenus: {
        "channel-context": channelContextMenuPatch,
        "thread-context": channelContextMenuPatch,
        "user-context": channelContextMenuPatch,
        "gdm-context": channelContextMenuPatch,
    },
});
