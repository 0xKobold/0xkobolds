# Onboarding Flow Plan

## Goal
Create a comprehensive onboarding experience that:
1. Detects first-time users
2. Guides them through persona setup
3. Explains mode system (plan/build)
4. Sets up their preferences
5. Creates personalized templates

## Templates to Create (based on OpenClaw)

### 1. BOOT.md
Initial boot sequence - what happens when TUI starts

### 2. BOOTSTRAP.md  
Setup wizard content - questions to ask new user

### 3. HEARTBEAT.md
Periodic check-ins, status updates, connection pulse

### 4. TOOLS.md
Tool usage guidelines, when to use what, restrictions

### 5. AGENTS.default
Default agent configuration

### 6. AGENTS.md
Multi-agent collaboration rules

## Onboarding Flow Steps

1. **Detect First Run**
   - Check for `~/.0xkobold/.onboarded` flag
   - If missing, trigger onboarding

2. **Welcome**
   - Show welcome message
   - Explain 0xKobold concept

3. **Persona Setup**
   - Ask user name, role, preferences
   - Generate IDENTITY.md, USER.md automatically
   - Allow editing

4. **Mode Explanation**
   - Explain Plan vs Build
   - Demo the modes

5. **Tool Introduction**
   - Show available tools
   - Explain tool restrictions per mode

6. **First Task**
   - Guide through simple task
   - Practice mode switching

7. **Complete**
   - Mark as onboarded
   - Save preferences
   - Enter normal operation

## Implementation

- Create `onboarding-extension.ts`
- Create all template files
- Update persona loader to include new templates
- Add CLI `init` wizard
