# Twitch Integration for 0xKobold

Twitch IRC chat integration for real-time interaction with chat channels.

## Features

- **Real-time Chat**: Connects to Twitch IRC for live chat messages
- **Commands**: Supports `!command` prefix for bot commands
- **Whispers**: Send and receive private messages
- **Rate Limiting**: Respects Twitch IRC rate limits (20 msg/30s for non-mods, 100/30s for mods)
- **Event Bus**: All messages emit to event bus for agent integration
- **Agent Tools**: Tools for agent to send messages and whispers

## Configuration

Add to `~/.0xkobold/config.json`:

```json
{
  "twitch": {
    "username": "KoboldBot",
    "oauthToken": "oauth:xxxxxxxxxxxx",
    "channels": ["#channel1", "#channel2"],
    "prefix": "!",
    "enabled": true,
    "isMod": false,
    "rateLimit": 20
  }
}
```

### Getting OAuth Token

1. Go to https://twitchtokengenerator.com/
2. Click "Generate New Token"
3. Select scopes: `chat:read`, `chat:edit`
4. Copy the token (starts with `oauth:`)

## CLI Commands

```bash
# Connect to Twitch
bun run cli twitch:connect

# Disconnect
bun run cli twitch:disconnect

# Show status
bun run cli twitch:status

# Send message
bun run cli twitch:say channel="#channel1" message="Hello chat!"
```

## Built-in Commands

When connected, the bot responds to:

- `!ping` - Pong response
- `!status` - Connection status
- `!help` - Available commands

## Agent Tools

The following tools are available to the agent:

### twitch_say

Send a message to a Twitch channel.

```typescript
{
  channel: "#channel",
  message: "Hello from the agent!"
}
```

### twitch_whisper

Send a whisper (private message) to a user.

```typescript
{
  username: "viewer_name",
  message: "This is a private message"
}
```

### twitch_status

Get Twitch connection status and connected channels.

```typescript
{}
// Returns: { connected: boolean, authenticated: boolean, channels: string[] }
```

## Event Bus Events

Messages and events are emitted to the event bus:

### twitch:message

Emitted for every chat message.

```typescript
{
  channel: string;
  username: string;
  displayName: string;
  message: string;
  timestamp: number;
  badges: string[];
  bits: number;
  isMod: boolean;
  isVip: boolean;
  isSubscriber: boolean;
  isBroadcaster: boolean;
  color: string | null;
}
```

### twitch:whisper

Emitted for private messages.

```typescript
{
  username: string;
  displayName: string;
  message: string;
  timestamp: number;
}
```

### twitch:command

Emitted for unrecognized commands (for agent handling).

```typescript
{
  channel: string;
  username: string;
  displayName: string;
  command: string;
  args: string[];
  rawMessage: string;
  timestamp: number;
  isMod: boolean;
  isSubscriber: boolean;
  isBroadcaster: boolean;
}
```

## Rate Limits

Twitch IRC has strict rate limits:

- **Non-moderator**: 20 messages per 30 seconds
- **Moderator/VIP**: 100 messages per 30 seconds
- **Whispers**: Different limits apply

The client automatically queues messages to respect these limits.

## Architecture

```
src/twitch/
├── irc-client.ts    # Twitch IRC client
├── config.ts        # Configuration loading
└── index.ts         # Module exports

src/extensions/core/
└── twitch-extension.ts  # 0xKobold extension
```

## Example Usage

### In Agent

```typescript
// The agent can use twitch_say tool to respond
{
  tool: "twitch_say",
  arguments: {
    channel: "#mychannel",
    message: "Thanks for watching! The answer is 42."
  }
}
```

### Subscribe to Events

```typescript
// In another extension
eventBus.on('twitch:message', (msg) => {
  console.log(`${msg.displayName}: ${msg.message}`);
  
  // Let agent process the message
  agent.process(msg.message);
});
```

## Troubleshooting

### "DISCORD_BOT_TOKEN not set"

This is a copy-paste error - you need `TWITCH_OAUTH` or `oauthToken` in your config.

### "Login authentication failed"

Make sure your OAuth token starts with `oauth:` and hasn't expired.

### "Rate limited"

You're sending messages too fast. Wait a moment and retry.

### "Channel not found"

Join the channel first with `twitch:connect` (it auto-joins configured channels).

## References

- [Twitch IRC Documentation](https://dev.twitch.tv/docs/irc)
- [Twitch IRC Guide](https://dev.twitch.tv/docs/irc/guide)
- [Twitch Chat Rate Limits](https://dev.twitch.tv/docs/irc/guide#command-and-message-rate-limits)