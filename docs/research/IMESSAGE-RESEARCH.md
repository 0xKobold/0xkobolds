# iMessage Integration Research - v0.3.0

## Research Document

**Status:** Research Complete  
**Platform:** macOS only  
**Difficulty:** High  
**Priority:** P2 (Nice to have)

---

## Options Analysis

### Option 1: Mac Catalyst Bridge

**Approach:**
- Build macOS app that bridges iMessage to 0xKobold
- Use Apple Script/Apple Events to access Messages app
- Socket connection to main process

**Pros:**
- Native iMessage access
- No jailbreak required

**Cons:**
- Requires macOS app approval
- Complex setup
- Only works when Mac is online

**Feasibility:** Medium

---

### Option 2: MessagesKit (Private Framework)

**Approach:**
- Use private IMServiceAgent framework
- Reverse engineered from macOS

**Pros:**
- Direct access to iMessage

**Cons:**
- Private API (may break)
- Apple could block
- Complex entitlements

**Status:** Research only - not recommended for production

---

### Option 3: AppleScript Bridge (Viable)

**Approach:**

```applescript
-- Send message via Messages app
tell application "Messages"
    set targetService to 1st service whose service type = iMessage
    set targetBuddy to buddy "+1234567890" of targetService
    send "Hello from 0xKobold" to targetBuddy
end tell

-- Read messages
tell application "Messages"
    get messages
end tell
```

**Pros:**
- Uses official AppleScript
- No private APIs
- Apple-supported

**Cons:**
- Requires user approval
- Limited functionality
- Can only control active Messages app

**Feasibility:** High (Recommended approach)

---

### Option 4: BlueBubbles Server

**Approach:**
- Use an existing iMessage bridge solution
- BlueBubbles macOS app + REST API

**URL:** https://github.com/BlueBubblesApp/bluebubbles-server

**Pros:**
- Production ready
- WebSocket + REST
- Actively maintained

**Cons:**
- Separate macOS app to run
- Additional dependency

**Feasibility:** High (Best option)

---

## Recommendation

### Short Term (v0.4.0)
**Use BlueBubbles integration**

```typescript
import { BlueBubblesClient } from "./bluebubbles";

const client = new BlueBubblesClient({
  url: "ws://localhost:1234",
  password: "xxx"
});

await client.connect();

// Send message
await client.sendMessage({
  chatGuid: "iMessage;+;1234567890",
  message: "Hello"
});
```

### Long Term (v0.5.0)
**AppleScript Bridge** for native feel without external dependencies

---

## Implementation Notes

### BlueBubbles Setup

1. Install BlueBubbles Server on Mac
2. Configure WebSocket password
3. Point 0xKobold to Mac IP/port
4. Authenticate with password

### Security Considerations

- iMessage requires macOS (no Windows/Linux)
- Messages are end-to-end encrypted by Apple
- BlueBubbles decrypts on Mac
- Secure local network only

---

## Verdict

**Status:** Ready to implement via BlueBubbles  
**Effort:** 1-2 days  
**Priority:** After WhatsApp/Telegram are stable

*"iMessage is the hardest channel, but BlueBubbles makes it possible without reverse engineering private APIs."*
