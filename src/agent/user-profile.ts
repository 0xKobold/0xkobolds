/**
 * User Profile System - v0.2.0
 * 
 * Manages USER.md - learned and explicit user preferences.
 * Part of the Persona System (Phase 1.2).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

export interface UserProfile {
  name?: string;
  email?: string;
  timezone?: string;
  preferences: UserPreferences;
  learned: LearnedPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  coding: {
    style: string; // "verbose", "concise", "balanced"
    comments: string; // "minimal", "descriptive", "docs"
    testing: string; // "skip", "basic", "comprehensive"
    frameworks: string[]; // preferred frameworks
  };
  communication: {
    formality: string; // "casual", "professional", "technical"
    detailLevel: string; // "high", "medium", "low"
    emojiUsage: boolean;
  };
  tools: {
    preferredEditor: string;
    preferredShell: string;
    preferredModel: string;
  };
}

export interface LearnedPreferences {
  patterns: string[]; // Coding patterns observed
  dislikes: string[]; // Things user has rejected
  favorites: string[]; // Things user likes
  workflows: Workflow[]; // Preferred workflows
}

export interface Workflow {
  name: string;
  description: string;
  steps: string[];
  contexts: string[]; // When to use this workflow
}

const DEFAULT_USER_PROFILE: UserProfile = {
  preferences: {
    coding: {
      style: "balanced",
      comments: "descriptive",
      testing: "basic",
      frameworks: [],
    },
    communication: {
      formality: "casual",
      detailLevel: "medium",
      emojiUsage: true,
    },
    tools: {
      preferredEditor: "vscode",
      preferredShell: "bash",
      preferredModel: "auto",
    },
  },
  learned: {
    patterns: [],
    dislikes: [],
    favorites: [],
    workflows: [],
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const USER_MD_TEMPLATE = `# USER Profile

## Identity
**Name:** {{name}}
**Email:** {{email}}
**Timezone:** {{timezone}}

## Coding Preferences

### Style
- Approach: {{coding.style}}
- Comments: {{coding.comments}}
- Testing: {{coding.testing}}
- Frameworks: {{coding.frameworks}}

### Communication
- Formality: {{communication.formality}}
- Detail Level: {{communication.detailLevel}}
- Emojis: {{communication.emojiUsage}}

### Tools
- Editor: {{tools.preferredEditor}}
- Shell: {{tools.preferredShell}}
- Preferred Model: {{tools.preferredModel}}

## Learned Preferences

### Patterns I Use
{{#each learned.patterns}}
- {{this}}
{{/each}}

### Things I Dislike
{{#each learned.dislikes}}
- {{this}}
{{/each}}

### Things I Like
{{#each learned.favorites}}
- {{this}}
{{/each}}

### Preferred Workflows
{{#each learned.workflows}}
#### {{name}}
{{description}}

Steps:
{{#each steps}}
1. {{this}}
{{/each}}

Use when: {{contexts}}
{{/each}}

---
*Last updated: {{updatedAt}}*
`;

/**
 * Load user profile from USER.md
 */
export async function loadUserProfile(workspaceDir: string): Promise<UserProfile> {
  const userPath = path.join(workspaceDir, "USER.md");
  
  if (!existsSync(userPath)) {
    return { ...DEFAULT_USER_PROFILE };
  }

  try {
    const content = await fs.readFile(userPath, "utf-8");
    return parseUserProfile(content);
  } catch (error) {
    console.warn("[UserProfile] Failed to load USER.md, using defaults");
    return { ...DEFAULT_USER_PROFILE };
  }
}

/**
 * Save user profile to USER.md
 */
export async function saveUserProfile(
  workspaceDir: string,
  profile: UserProfile
): Promise<void> {
  const userPath = path.join(workspaceDir, "USER.md");
  profile.updatedAt = new Date().toISOString();
  
  const content = serializeUserProfile(profile);
  await fs.writeFile(userPath, content, "utf-8");
}

/**
 * Parse USER.md content into UserProfile
 */
function parseUserProfile(content: string): UserProfile {
  const profile: UserProfile = { ...DEFAULT_USER_PROFILE };
  
  // Simple parsing - extract values from markdown
  const lines = content.split("\n");
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Parse identity
    if (line.startsWith("**Name:**")) {
      profile.name = line.replace("**Name:**", "").trim() || undefined;
    }
    if (line.startsWith("**Email:**")) {
      profile.email = line.replace("**Email:**", "").trim() || undefined;
    }
    if (line.startsWith("**Timezone:**")) {
      profile.timezone = line.replace("**Timezone:**", "").trim() || undefined;
    }
    
    // Parse coding style
    if (line.includes("Approach:") && profile.preferences) {
      const value = line.split(":")[1]?.trim();
      if (value) profile.preferences.coding.style = value;
    }
    
    // Parse communication
    if (line.includes("Formality:") && profile.preferences) {
      const value = line.split(":")[1]?.trim();
      if (value) profile.preferences.communication.formality = value;
    }
    
    // Parse learned sections (simple list parsing)
    if (line === "### Things I Dislike") {
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith("- ")) {
        const item = lines[j].replace("- ", "").trim();
        if (item) profile.learned.dislikes.push(item);
        j++;
      }
    }
    
    if (line === "### Things I Like") {
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith("- ")) {
        const item = lines[j].replace("- ", "").trim();
        if (item) profile.learned.favorites.push(item);
        j++;
      }
    }
  }
  
  return profile;
}

/**
 * Serialize UserProfile to USER.md content
 */
function serializeUserProfile(profile: UserProfile): string {
  // Build markdown manually for now
  const sections: string[] = [];
  
  sections.push("# USER Profile\n");
  
  // Identity
  sections.push("## Identity");
  sections.push(`**Name:** ${profile.name || ""}`);
  sections.push(`**Email:** ${profile.email || ""}`);
  sections.push(`**Timezone:** ${profile.timezone || ""}\n`);
  
  // Coding preferences
  sections.push("## Coding Preferences\n");
  sections.push("### Style");
  sections.push(`- Approach: ${profile.preferences.coding.style}`);
  sections.push(`- Comments: ${profile.preferences.coding.comments}`);
  sections.push(`- Testing: ${profile.preferences.coding.testing}`);
  sections.push(`- Frameworks: ${profile.preferences.coding.frameworks.join(", ") || "None specified"}\n`);
  
  // Communication
  sections.push("### Communication");
  sections.push(`- Formality: ${profile.preferences.communication.formality}`);
  sections.push(`- Detail Level: ${profile.preferences.communication.detailLevel}`);
  sections.push(`- Emojis: ${profile.preferences.communication.emojiUsage ? "Yes" : "No"}\n`);
  
  // Tools
  sections.push("### Tools");
  sections.push(`- Editor: ${profile.preferences.tools.preferredEditor}`);
  sections.push(`- Shell: ${profile.preferences.tools.preferredShell}`);
  sections.push(`- Preferred Model: ${profile.preferences.tools.preferredModel}\n`);
  
  // Learned
  sections.push("## Learned Preferences\n");
  
  sections.push("### Patterns I Use");
  if (profile.learned.patterns.length === 0) {
    sections.push("_No patterns learned yet_\n");
  } else {
    for (const pattern of profile.learned.patterns) {
      sections.push(`- ${pattern}`);
    }
    sections.push("");
  }
  
  sections.push("### Things I Dislike");
  if (profile.learned.dislikes.length === 0) {
    sections.push("_None recorded_\n");
  } else {
    for (const dislike of profile.learned.dislikes) {
      sections.push(`- ${dislike}`);
    }
    sections.push("");
  }
  
  sections.push("### Things I Like");
  if (profile.learned.favorites.length === 0) {
    sections.push("_None recorded_\n");
  } else {
    for (const favorite of profile.learned.favorites) {
      sections.push(`- ${favorite}`);
    }
    sections.push("");
  }
  
  sections.push("---");
  sections.push(`*Last updated: ${profile.updatedAt}*`);
  
  return sections.join("\n");
}

/**
 * Learn from user interaction
 */
export async function learnPreference(
  workspaceDir: string,
  type: "like" | "dislike" | "pattern",
  value: string
): Promise<void> {
  const profile = await loadUserProfile(workspaceDir);
  
  switch (type) {
    case "like":
      if (!profile.learned.favorites.includes(value)) {
        profile.learned.favorites.push(value);
      }
      break;
    case "dislike":
      if (!profile.learned.dislikes.includes(value)) {
        profile.learned.dislikes.push(value);
      }
      break;
    case "pattern":
      if (!profile.learned.patterns.includes(value)) {
        profile.learned.patterns.push(value);
      }
      break;
  }
  
  await saveUserProfile(workspaceDir, profile);
}

/**
 * Create default USER.md if missing
 */
export async function ensureUserProfile(workspaceDir: string): Promise<void> {
  const userPath = path.join(workspaceDir, "USER.md");
  
  if (existsSync(userPath)) {
    console.log("[UserProfile] USER.md exists");
    return;
  }
  
  const profile = { ...DEFAULT_USER_PROFILE };
  await saveUserProfile(workspaceDir, profile);
  console.log("[UserProfile] Created default USER.md");
}

/**
 * Get user preferences as system prompt section
 */
export async function getUserPreferencesForPrompt(workspaceDir: string): Promise<string | null> {
  const profile = await loadUserProfile(workspaceDir);
  
  const parts: string[] = [];
  parts.push("<!-- User Profile -->");
  
  if (profile.name) {
    parts.push(`Name: ${profile.name}`);
  }
  
  parts.push("Preferences:");
  parts.push(`- Coding style: ${profile.preferences.coding.style}`);
  parts.push(`- Comments: ${profile.preferences.coding.comments}`);
  parts.push(`- Testing: ${profile.preferences.coding.testing}`);
  parts.push(`- Communication: ${profile.preferences.communication.formality}, ${profile.preferences.communication.detailLevel} detail`);
  
  if (profile.learned.favorites.length > 0) {
    parts.push(`- Preferences: ${profile.learned.favorites.slice(0, 3).join(", ")}`);
  }
  
  if (profile.learned.dislikes.length > 0) {
    parts.push(`- Avoid: ${profile.learned.dislikes.slice(0, 3).join(", ")}`);
  }
  
  return parts.join("\n");
}
