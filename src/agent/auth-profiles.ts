/**
 * Auth Profiles (Phase 4)
 *
 * Multiple API keys per provider with automatic rotation.
 * Similar to koclaw's auth profile system.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { eventBus } from "../event-bus";
import { getConfig } from "../config/loader";

export interface AuthProfile {
  id: string;
  provider: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  createdAt: number;
  lastUsed?: number;
  failureCount: number;
  totalRequests: number;
  disabled: boolean;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
}

export interface ResolvedProviderAuth {
  profileId: string;
  apiKey: string;
  baseUrl?: string;
}

const DB_PATH = join(process.env.HOME || "~", ".0xkobold", "auth-profiles.db");

let db: Database | null = null;
let profileCache: Map<string, AuthProfile> = new Map();
let providerOrder: Map<string, string[]> = new Map();

function getDb(): Database {
  if (db) return db;

  mkdirSync(dirname(DB_PATH), { recursive: true });

  db = new Database(DB_PATH);
  db.run(`
    CREATE TABLE IF NOT EXISTS auth_profiles (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      name TEXT NOT NULL,
      api_key TEXT NOT NULL,
      base_url TEXT,
      created_at INTEGER NOT NULL,
      last_used INTEGER,
      failure_count INTEGER DEFAULT 0,
      total_requests INTEGER DEFAULT 0,
      disabled INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_profiles_provider 
    ON auth_profiles(provider)
  `);

  // Load into cache
  const rows = db.query("SELECT * FROM auth_profiles").all() as Record<string, unknown>[];
  for (const row of rows) {
    const profile = rowToProfile(row);
    profileCache.set(profile.id, profile);

    if (!profile.disabled) {
      const order = providerOrder.get(profile.provider) || [];
      order.push(profile.id);
      providerOrder.set(profile.provider, order);
    }
  }

  return db;
}

function rowToProfile(row: Record<string, unknown>): AuthProfile {
  return {
    id: row.id as string,
    provider: row.provider as string,
    name: row.name as string,
    apiKey: row.api_key as string,
    baseUrl: row.base_url as string | undefined,
    createdAt: row.created_at as number,
    lastUsed: row.last_used as number | undefined,
    failureCount: (row.failure_count as number) || 0,
    totalRequests: (row.total_requests as number) || 0,
    disabled: Boolean(row.disabled),
  };
}

function profileToRow(profile: AuthProfile): (string | number | null | undefined)[] {
  return [
    profile.id,
    profile.provider,
    profile.name,
    profile.apiKey,
    profile.baseUrl ?? null,
    profile.createdAt,
    profile.lastUsed ?? null,
    profile.failureCount,
    profile.totalRequests,
    profile.disabled ? 1 : 0,
  ];
}

// Profile CRUD
export function addAuthProfile(
  provider: string,
  name: string,
  apiKey: string,
  baseUrl?: string,
): AuthProfile {
  const db = getDb();
  const id = `${provider}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const profile: AuthProfile = {
    id,
    provider,
    name,
    apiKey,
    baseUrl,
    createdAt: Date.now(),
    failureCount: 0,
    totalRequests: 0,
    disabled: false,
  };

  db.run(
    `
    INSERT INTO auth_profiles (id, provider, name, api_key, base_url, created_at, last_used, failure_count, total_requests, disabled)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    profileToRow(profile),
  );

  profileCache.set(id, profile);

  // Add to provider order
  const order = providerOrder.get(provider) || [];
  order.push(id);
  providerOrder.set(provider, order);

  eventBus.emit("auth-profile:added", { profileId: id, provider });

  return profile;
}

export function removeAuthProfile(profileId: string): boolean {
  const db = getDb();
  const profile = profileCache.get(profileId);

  if (!profile) return false;

  db.run("DELETE FROM auth_profiles WHERE id = ?", [profileId]);
  profileCache.delete(profileId);

  // Remove from provider order
  const order = providerOrder.get(profile.provider) || [];
  const idx = order.indexOf(profileId);
  if (idx > -1) {
    order.splice(idx, 1);
    providerOrder.set(profile.provider, order);
  }

  eventBus.emit("auth-profile:removed", { profileId, provider: profile.provider });

  return true;
}

export function getAuthProfile(profileId: string): AuthProfile | undefined {
  return profileCache.get(profileId);
}

export function listAuthProfiles(provider?: string): AuthProfile[] {
  const profiles = Array.from(profileCache.values());
  if (provider) {
    return profiles.filter((p) => p.provider === provider);
  }
  return profiles;
}

// Auth resolution with rotation
export function resolveAuthProfileOrder(provider: string): string[] {
  const order = providerOrder.get(provider) || [];

  // Update from cache (filter disabled)
  return order
    .map((id) => profileCache.get(id))
    .filter((p): p is AuthProfile => !!p && !p.disabled)
    .sort((a, b) => {
      // Prioritize by failure count, then by last used (least recently used first)
      if (a.failureCount !== b.failureCount) {
        return a.failureCount - b.failureCount;
      }
      return (a.lastUsed || 0) - (b.lastUsed || 0);
    })
    .map((p) => p.id);
}

export function getApiKeyForProvider(provider: string): ResolvedProviderAuth | undefined {
  const order = resolveAuthProfileOrder(provider);

  for (const profileId of order) {
    const profile = profileCache.get(profileId);
    if (profile && !profile.disabled) {
      return {
        profileId,
        apiKey: profile.apiKey,
        baseUrl: profile.baseUrl,
      };
    }
  }

  return undefined;
}

// Usage tracking
export function markAuthProfileUsed(profileId: string): void {
  const profile = profileCache.get(profileId);
  if (!profile) return;

  profile.lastUsed = Date.now();
  profile.totalRequests++;

  const db = getDb();
  db.run(
    "UPDATE auth_profiles SET last_used = ?, total_requests = total_requests + 1 WHERE id = ?",
    [Date.now(), profileId],
  );

  eventBus.emit("auth-profile:used", { profileId });
}

export function markAuthProfileFailure(
  profileId: string,
  reason: string,
): { shouldDisable: boolean } {
  const profile = profileCache.get(profileId);
  if (!profile) return { shouldDisable: false };

  profile.failureCount++;

  const db = getDb();
  db.run("UPDATE auth_profiles SET failure_count = ? WHERE id = ?", [
    profile.failureCount,
    profileId,
  ]);

  // Disable after 5 failures
  const shouldDisable = profile.failureCount >= 5;
  if (shouldDisable) {
    profile.disabled = true;
    db.run("UPDATE auth_profiles SET disabled = 1 WHERE id = ?", [profileId]);

    // Remove from provider order
    const order = providerOrder.get(profile.provider) || [];
    const idx = order.indexOf(profileId);
    if (idx > -1) {
      order.splice(idx, 1);
      providerOrder.set(profile.provider, order);
    }
  }

  eventBus.emit("auth-profile:failed", {
    profileId,
    provider: profile.provider,
    reason,
    failureCount: profile.failureCount,
    disabled: shouldDisable,
  });

  return { shouldDisable };
}

export function markAuthProfileGood(profileId: string): void {
  const profile = profileCache.get(profileId);
  if (!profile) return;

  if (profile.failureCount > 0) {
    profile.failureCount = 0;

    const db = getDb();
    db.run("UPDATE auth_profiles SET failure_count = 0 WHERE id = ?", [profileId]);

    eventBus.emit("auth-profile:recovered", { profileId, provider: profile.provider });
  }
}

// Check if profile is rate limited
export function isProfileInCooldown(
  profileId: string,
  cooldownMs = 60000,
): { inCooldown: boolean; remainingMs?: number } {
  const profile = profileCache.get(profileId);

  if (!profile?.lastUsed) {
    return { inCooldown: false };
  }

  const elapsed = Date.now() - profile.lastUsed;
  if (elapsed < cooldownMs) {
    return { inCooldown: true, remainingMs: cooldownMs - elapsed };
  }

  return { inCooldown: false };
}

// Rotation helper
export function rotateApiKey(provider: string): ResolvedProviderAuth | undefined {
  const order = providerOrder.get(provider) || [];

  if (order.length <= 1) {
    return getApiKeyForProvider(provider);
  }

  // Move first to end
  const first = order.shift();
  if (first) {
    order.push(first);
    providerOrder.set(provider, order);
  }

  return getApiKeyForProvider(provider);
}

// Reason resolution
export function resolveProfilesUnavailableReason(provider: string): string | undefined {
  const profiles = listAuthProfiles(provider);

  if (profiles.length === 0) {
    return `No auth profiles configured for ${provider}`;
  }

  const enabled = profiles.filter((p) => !p.disabled);
  if (enabled.length === 0) {
    return `All ${provider} auth profiles are disabled due to failures`;
  }

  return undefined;
}

// Config integration - auto-create from config
export function ensureAuthProfilesFromConfig(): void {
  const config = getConfig();
  if (!config) return;

  // Check for Anthropic key
  if (config.anthropic?.apiKey) {
    const existing = listAuthProfiles("anthropic").find(
      (p) => p.apiKey === config.anthropic?.apiKey,
    );
    if (!existing) {
      addAuthProfile("anthropic", "default", config.anthropic.apiKey);
    }
  }

  // Check for OpenAI key
  if (config.openai?.apiKey) {
    const existing = listAuthProfiles("openai").find((p) => p.apiKey === config.openai?.apiKey);
    if (!existing) {
      addAuthProfile("openai", "default", config.openai.apiKey);
    }
  }

  // Check for Ollama
  if (config.ollama?.host) {
    const existing = listAuthProfiles("ollama").find((p) => p.baseUrl === config.ollama?.host);
    if (!existing) {
      addAuthProfile("ollama", "default", "", config.ollama.host);
    }
  }
}

// Clear all (for testing)
export function clearAuthProfiles(): void {
  const db = getDb();
  db.run("DELETE FROM auth_profiles");
  profileCache.clear();
  providerOrder.clear();
}
