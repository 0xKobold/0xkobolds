# 0xKobold Persona System

The persona system allows you to personalize your 0xKobold experience through markdown files in `~/.0xkobold/`. Similar to OpenClaw's IDENTITY template, these files define how the agent behaves, what it knows about you, and how it communicates.

## Quick Start

```bash
# Initialize persona files
0xkobold persona init

# List existing files
0xkobold persona list

# Edit a file
0xkobold persona edit IDENTITY.md

# View all content
0xkobold persona show
```

## Persona Files

All files are stored in `~/.0xkobold/`:

### IDENTITY.md
**Who the agent is.**

Defines the agent's personality, communication style, core values, and boundaries.

**Use for:**
- Agent name and identity
- Personality traits (curious, direct, playful, etc.)
- Communication style preferences
- Core values and principles
- Behavioral boundaries

### USER.md
**Who you are.**

Defines your background, preferences, working style, and context.

**Use for:**
- Your name and role
- Experience level
- Preferred languages and frameworks
- Working style preferences
- Project context
- Personal notes

### SOUL.md
**The agent's being.**

A more poetic/abstract definition of the agent's essence and relationship with you.

**Use for:**
- Core purpose and meaning
- Relationship dynamics
- Growth and learning philosophy
- Connection to the work

### AGENT.md
**How the agent works.**

Defines behavioral patterns, code standards, and communication protocols.

**Use for:**
- Default behaviors
- Code standards and style
- Tool usage preferences
- Communication protocols
- Plan vs Build mode behaviors

### MEMORY.md
**Long-term memory.**

Project history, learned patterns, and persistent context.

**Use for:**
- Project history and milestones
- Observed user patterns
- Learned preferences
- Recent context updates
- Common solutions and patterns

## How It Works

1. **File Loading**: The `persona-loader-extension.ts` loads all `.md` files from `~/.0xkobold/` on TUI startup
2. **Prompt Injection**: Content is injected into the system prompt under a "PERSONA CONTEXT" section
3. **Dynamic Updates**: Use `/persona-reload` in TUI to reload without restart
4. **CLI Management**: Use `0xkobold persona` commands to manage files

## CLI Commands

```bash
# Initialize templates
0xkobold persona init

# List files
0xkobold persona list

# View a file
0xkobold persona view IDENTITY.md

# Edit a file (opens $EDITOR)
0xkobold persona edit USER.md

# Show all content
0xkobold persona show

# Get directory path
0xkobold persona path
```

## TUI Commands

Once in the TUI:

```
/persona         - Show loaded persona files
/identity        - View agent identity
/user-profile    - View user profile (note: typo in code, should be /user-profile)
/memory          - View/update memory
/persona-reload  - Reload files from disk
```

## Template Reference

### IDENTITY.md Template

```markdown
# 0xKobold Identity

## Name
0xKobold (or just "Kobold")

## Essence
A digital familiar - clever, helpful, loyal.

## Personality Traits
- Curious and eager to explore
- Direct and honest
- Supportive but not obsequious

## Communication Style
- Concise but friendly
- Explains technical concepts clearly
- Asks clarifying questions

## Core Values
1. Code quality over cleverness
2. User autonomy
3. Transparency
4. Continual learning

## Boundaries
- Will not write harmful code
- Will ask before assumptions
- Will admit uncertainty
```

### USER.md Template

```markdown
# User Profile

## Identity
- **Name**: Alex
- **Role**: Senior Developer
- **Experience**: 5+ years
- **Languages**: TypeScript, Python, Go

## Working Style
- Prefers pair programming style
- Wants to understand the "why"
- Values clean git history

## Preferences
- **Code**: Clean, readable, commented
- **Architecture**: Pragmatic
- **Testing**: Critical paths only

## Context
- Building: 0xKobold AI framework
- Editor: Cursor/Zed
- Runtime: Bun
```

## Integration with Mode System

The persona system works with Plan/Build modes:

- **Plan Mode**: Agent emphasizes investigation, asking questions, understanding context (from USER.md)
- **Build Mode**: Agent emphasizes implementation, code quality (from AGENT.md standards)

Your IDENTITY.md and SOUL.md provide consistent personality across both modes.

## Compared to OpenClaw

Similar to OpenClaw's IDENTITY, USER, and AGENT templates:

| OpenClaw | 0xKobold | Purpose |
|----------|----------|---------|
| IDENTITY | IDENTITY.md | Agent identity |
| USER | USER.md | User profile |
| AGENT | AGENT.md | Agent behavior |
| — | SOUL.md | Poetic essence |
| — | MEMORY.md | Persistent memory |

## Tips

1. **Start Simple**: Begin with just IDENTITY.md and USER.md
2. **Iterate**: Update files as you work together
3. **Specificity**: The more specific, the better the results
4. **Conciseness**: Agents have context limits; be clear but brief
5. **Update Memory**: Add learnings to MEMORY.md over time

## File Format

All files are Markdown:

```markdown
# Title

## Section
Content here...

### Subsection
More content...

- Bulleted lists work
- **Bold** and *italic* work
```

The persona loader extracts the raw text and injects it into the system prompt.

## Example Workflow

1. **Initialize**: `0xkobold persona init`
2. **Customize IDENTITY.md**: Define how you want the agent to communicate
3. **Fill out USER.md**: So it knows about you
4. **Start TUI**: `0xkobold tui`
5. **Check loading**: `/persona` command shows loaded files
6. **Iterate**: Update files as you work together

## Troubleshooting

**Files not loading:**
- Check `~/.0xkobold/` exists
- Use `/persona` in TUI to see loaded files
- Check TUI console output for errors

**Changes not applying:**
- Use `/persona-reload` to reload without restart
- Or restart TUI session

**Want to disable:**
- Delete persona files from `~/.0xkobold/`
- Or rename them (e.g., `IDENTITY.md.bak`)
