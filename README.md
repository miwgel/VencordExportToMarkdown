# ExportToMarkdown

Vencord plugin to export full Discord channel chat history to a Markdown file.

## Install

```sh
git clone https://github.com/miwgel/VencordExportToMarkdown.git path/to/Vencord/src/userplugins/exportToMarkdown
```

Then rebuild Vencord (`pnpm build`) and restart Discord.

## Usage

Right-click any channel → **Export to Markdown** → wait for progress → Download.

## Features

- Exports full channel history (not just loaded messages) via paginated API fetching
- Progress modal with cancel support
- Handles all message types: regular messages, replies, embeds, attachments, reactions, pins, edit history, system messages
- Works with server channels, DMs, group DMs, and threads
- Configurable settings for what content to include
- Rate limit handling with automatic retry
- No API key needed — uses your active Discord session

## Settings

| Setting | Default | Description |
|---|---|---|
| Include Embeds | On | Include embed content (titles, descriptions, fields, images) |
| Include Reactions | On | Show reaction emoji and counts |
| Include Attachments | On | List attachment URLs with file info |
| Include Edit History | On | Show edit history (requires MessageLogger) |
| Include Pin Indicator | On | Mark pinned messages |
| Include System Messages | On | Include join/boost/pin notifications |
| Batch Delay | 600ms | Delay between API requests (lower = faster, higher = safer) |

## License

MIT
