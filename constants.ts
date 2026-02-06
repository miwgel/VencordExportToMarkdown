export const BATCH_SIZE = 100;
export const DEFAULT_BATCH_DELAY = 600;
export const MAX_RETRIES = 3;

export const SYSTEM_MESSAGE_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 22]);

export const MESSAGE_TYPE_TEMPLATES: Record<number, (msg: any) => string> = {
    1: msg => `*${msg.author.username} added ${msg.mentions?.[0]?.username ?? "someone"} to the group.*`,
    2: msg => `*${msg.author.username} removed ${msg.mentions?.[0]?.username ?? "someone"} from the group.*`,
    3: msg => `*${msg.author.username} started a call.*`,
    4: msg => `*${msg.author.username} changed the channel name: **${msg.content}**.*`,
    5: msg => `*${msg.author.username} changed the channel icon.*`,
    6: msg => `*${msg.author.username} pinned a message to this channel.*`,
    7: msg => `*${msg.author.username} joined the server.*`,
    8: msg => `*${msg.author.username} boosted the server!*`,
    9: msg => `*${msg.author.username} boosted the server! Server has achieved **Level 1**!*`,
    10: msg => `*${msg.author.username} boosted the server! Server has achieved **Level 2**!*`,
    11: msg => `*${msg.author.username} boosted the server! Server has achieved **Level 3**!*`,
    12: msg => `*${msg.author.username} added **${msg.content}** to this channel.*`,
    14: msg => `*This server has been removed from Server Discovery.*`,
    15: msg => `*This server is eligible for Server Discovery again.*`,
    22: msg => `*${msg.author.username} sent a reminder to check out the server.*`,
};
