/**
 * Router Commands - Singleton, Init, CLI Handlers
 *
 * The plumbing: singleton state, initialization, command handlers,
 * and model status tracking for display.
 *
 * Consolidated from:
 * - unified-router.ts (singleton, commands)
 * - model-status.ts (current model tracking)
 */

import { resolve, join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { LLMProvider, ChatOptions, ChatResponse, Message } from './types';
import { AdaptiveModelRouter, createRouter, type ModelTier } from './router-core';
import { getModelDiscoveryService, type DiscoveredModel } from './model-discovery';
import { getOllamaProvider } from './ollama';
import { getModelScoringDB } from './model-scoring-db';
import { getModelPopularityService } from './model-popularity';
import type { CommunityData, CommunityModelStats, CommunityTaskStats } from './community-analytics';

// ============================================================================
// Model Status State
// ============================================================================

export interface ModelStatus {
  name: string;
  reason?: string;
  timestamp: number;
}

let currentModel: ModelStatus | null = null;

export function setCurrentModel(modelName: string, reason?: string): void {
  currentModel = {
    name: modelName,
    reason,
    timestamp: Date.now(),
  };
}

export function getCurrentModel(): ModelStatus | null {
  return currentModel;
}

export function clearCurrentModel(): void {
  currentModel = null;
}

// ============================================================================
// Singleton Router State
// ============================================================================

let routerInstance: AdaptiveModelRouter | null = null;
let routerInitializing = false;
let routerInitPromise: Promise<AdaptiveModelRouter> | null = null;
let favoriteModels: string[] = [];

// ============================================================================
// Initialization
// ============================================================================

export async function getRouter(): Promise<AdaptiveModelRouter> {
  if (routerInstance) return routerInstance;

  if (routerInitializing && routerInitPromise) {
    return routerInitPromise;
  }

  routerInitializing = true;
  routerInitPromise = initializeRouter();

  try {
    routerInstance = await routerInitPromise;
    return routerInstance;
  } catch (err) {
    routerInitPromise = null;
    throw err;
  }
}

async function initializeRouter(): Promise<AdaptiveModelRouter> {
  console.log('[Router] Initializing...');

  const provider = await getOllamaProvider();
  const router = await createRouter(provider, 'kimi-k2.5:cloud');

  await loadFavoriteModels(router);

  router.setLearningEnabled(true);

  console.log('[Router] Ready with adaptive routing');
  return router;
}

async function loadFavoriteModels(router: AdaptiveModelRouter): Promise<void> {
  try {
    const configPath = resolve(homedir(), '.0xkobold/config.json');
    if (!existsSync(configPath)) return;

    const config = JSON.parse(await Bun.file(configPath).text());
    if (config.favoriteModels && Array.isArray(config.favoriteModels)) {
      favoriteModels = config.favoriteModels;
      router.setFavoriteModels(favoriteModels);
      console.log(`[Router] Favorites: ${favoriteModels.join(', ')}`);
    }
  } catch {
    // Silent fail - favorites are optional
  }
}

// ============================================================================
// Status Checks
// ============================================================================

export function isRouterReady(): boolean {
  return routerInstance !== null;
}

export function getRouterStatus(): {
  ready: boolean;
  initializing: boolean;
  favorites: string[];
} {
  return {
    ready: routerInstance !== null,
    initializing: routerInitializing,
    favorites: [...favoriteModels],
  };
}

// ============================================================================
// Routed Provider Wrapper
// ============================================================================

export async function createRoutedOllamaProvider(): Promise<{
  name: string;
  chat: (options: ChatOptions) => Promise<ChatResponse>;
  chatStream: (options: ChatOptions) => AsyncGenerator<ChatResponse>;
  listModels: () => Promise<any[]>;
}> {
  const router = await getRouter();

  return {
    name: 'routed-ollama',

    async chat(options: ChatOptions): Promise<ChatResponse> {
      const lastUserMsg =
        (options.messages?.findLast as any)?.((m: Message) => m.role === 'user')?.content || '';
      const selectedModel = await router.selectModel(lastUserMsg);

      setCurrentModel(selectedModel, 'adaptive routing');

      const baseProvider = await getOllamaProvider();
      return baseProvider.chat({ ...options, model: selectedModel });
    },

    // Note: Streaming not fully implemented - falls back to non-streaming
    async *chatStream(options: ChatOptions): AsyncGenerator<ChatResponse> {
      const baseProvider = await getOllamaProvider();
      const router = await getRouter();

      const lastUserMsg =
        (options.messages?.findLast as any)?.((m: Message) => m.role === 'user')?.content || '';
      const selectedModel = await router.selectModel(lastUserMsg);
      const result = await baseProvider.chat({ ...options, model: selectedModel });
      yield result;
    },

    async listModels(): Promise<any[]> {
      const models = await router.listModels();
      return models.map(m => ({
        id: m.name,
        name: m.name,
        provider: 'routed-ollama',
        contextWindow: m.contextWindow,
      }));
    },
  };
}

// ============================================================================
// Command Handlers
// ============================================================================

export async function handleRouterCommand(args: string): Promise<string> {
  const subcommand = args.trim().toLowerCase();

  if (!subcommand) {
    return `🧠 Adaptive Model Router

Commands:
  /router auto         - Enable adaptive routing
  /router manual       - Use static model
  /router info         - Show current model info
  /router favorites    - List favorite models
  /router fav MODEL    - Add to favorites
  /router unfav MODEL  - Remove from favorites
  /router stats MODEL  - Show model performance stats
  /router history      - Show recent performance history
  /router MODEL        - Force specific model
  /models              - List all models
  /model-rankings      - Show model leaderboard
  /tier-list          - Show AI-generated tier list
  /rate <1-5>          - Rate last model response`;
  }

  const router = await getRouter();

  switch (subcommand) {
    case 'auto':
      router.setLearningEnabled(true);
      return '🧠 Adaptive routing enabled. Model will be selected automatically.';

    case 'manual':
    case 'static':
      router.setLearningEnabled(false);
      return '🎯 Static model selection. Use /router MODEL to select specific model.';

    case 'info':
      return getRouterInfo(router);

    case 'favorites':
    case 'favs':
      return getFavoritesOutput(router);

    case 'history':
      return getHistoryOutput(router);

    default:
      if (subcommand.startsWith('stats ')) {
        const model = args.replace(/^stats\s+/, '').trim();
        return getModelStatsOutput(router, model);
      }

      if (subcommand.startsWith('fav ')) {
        const model = args.replace(/^fav\s+/, '').trim();
        router.addFavoriteModel(model);
        return `⭐ Added ${model} to favorites`;
      }

      if (subcommand.startsWith('unfav ')) {
        const model = args.replace(/^unfav\s+/, '').trim();
        router.removeFavoriteModel(model);
        return `⭐ Removed ${model} from favorites`;
      }

      return `🎯 Model set to: ${args.trim()}\nUse /router auto to re-enable adaptive routing.`;
  }
}

export async function handleModelsCommand(args: string): Promise<string> {
  const router = await getRouter();
  const models = await router.listModels();

  if (args.includes('--refresh')) {
    await router.refreshModels();
    return '✅ Model cache refreshed';
  }

  if (args.includes('--recommend')) {
    return getRecommendationsOutput(models);
  }

  const lines = ['🧠 Available Models:\n'];

  const byType = {
    chat: models.filter(m => m.capabilities.chat),
    code: models.filter(m => m.capabilities.code && m.specializations.includes('coding')),
    reasoning: models.filter(m => m.capabilities.reasoning),
    vision: models.filter(m => m.capabilities.vision),
  };

  for (const [type, list] of Object.entries(byType)) {
    if (list.length > 0) {
      lines.push(`${type.toUpperCase()}:`);
      for (const m of list) {
        const params = m.parameterCount ? ` ${m.parameterCount}B` : '';
        const cloud = m.isCloud ? ' ☁️' : '';
        const isFav = favoriteModels.includes(m.name) ? ' ⭐' : '';
        lines.push(`  • ${m.name}${params}${cloud}${isFav} - ${m.speedTier}/${m.qualityTier}`);
      }
      lines.push('');
    }
  }

  lines.push('Commands: /router auto|manual|info|favorites');
  return lines.join('\n');
}

export async function handleRateCommand(args: string): Promise<string> {
  const rating = parseInt(args.trim(), 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return 'Usage: /rate <1-5> (rate the last model response)';
  }

  const currentModelStatus = getCurrentModel();
  if (!currentModelStatus) {
    return '❌ No model has been used yet. Use a model first, then rate it.';
  }

  const router = await getRouter();
  router.addFeedback(currentModelStatus.name, 'chat', rating);

  return `✅ Rated ${currentModelStatus.name} ${rating}/5. This improves model selection.`;
}

// ============================================================================
// Model Rankings & Tier List Commands
// ============================================================================

export async function handleModelRankingsCommand(args: string): Promise<string> {
  const router = await getRouter();
  const period = args.trim() || 'all';

  let periodLabel = 'all time';
  if (period === 'day') periodLabel = 'last 24 hours';
  else if (period === 'week') periodLabel = 'last week';
  else if (period === 'month') periodLabel = 'last month';

  const rankings = router.getModelRankings();

  if (rankings.length === 0) {
    return `📊 No model rankings data yet for ${periodLabel}.\n\nUse models and rate them with /rate <1-5> to build rankings.`;
  }

  const lines = [`📊 Model Rankings (${periodLabel})\n`];
  lines.push('Rank | Model                 | Score | Quality | Latency | Uses');
  lines.push('-----|----------------------|-------|---------|---------|------');

  // Sort by score descending
  const sorted = [...rankings].sort((a, b) => b.score - a.score);

  sorted.slice(0, 15).forEach((model, i) => {
    const rank = (i + 1).toString().padEnd(4);
    const name = model.modelName.substring(0, 20).padEnd(20);
    const score = model.score.toFixed(2).padStart(5);
    const quality = ((model.avgQuality || 0) / 5 * 100).toFixed(0).padStart(3) + '%';
    const latency = ((model.avgLatency || 0) / 1000).toFixed(1) + 's';
    const uses = model.usageCount.toString().padStart(5);

    lines.push(`${rank} | ${name} | ${score} | ${quality}  | ${latency.padStart(7)} | ${uses}`);
  });

  lines.push('\nCommands: /model-rankings day|week|month|all | /tier-list | /popularity');
  return lines.join('\n');
}

export async function handleTierListCommand(args: string): Promise<string> {
  const router = await getRouter();
  const period = args.trim() || 'all';

  const tierList = router.generateTierList(period as 'day' | 'week' | 'month' | 'all');

  if (tierList.length === 0) {
    return `🏆 No tier list data yet.\n\nModels need at least 2 uses to appear in rankings.\nUse models and rate them with /rate <1-5>.`;
  }

  // Group by tier
  const tiers: Record<string, typeof tierList> = {
    S: [],
    A: [],
    B: [],
    C: [],
    D: [],
  };

  tierList.forEach(model => {
    tiers[model.tier].push(model);
  });

  const lines = [`🏆 AI-Generated Model Tier List\n`];

  const tierEmojis = { S: '🥇', A: '🥈', B: '🥉', C: '⭐', D: '·' };
  const tierDescriptions = {
    S: 'Excellent - Top performers (score ≥ 0.85)',
    A: 'Great - Reliable choices (score ≥ 0.70)',
    B: 'Good - Solid performers (score ≥ 0.55)',
    C: 'Fair - Acceptable (score ≥ 0.40)',
    D: 'Needs improvement (score < 0.40)',
  };

  for (const [tier, models] of Object.entries(tiers)) {
    if (models.length === 0) continue;

    const emoji = tierEmojis[tier as keyof typeof tierEmojis];
    lines.push(`${emoji} **Tier ${tier}** - ${tierDescriptions[tier as keyof typeof tierDescriptions]}`);

    models.forEach(model => {
      const scoreBar = '█'.repeat(Math.round(model.score * 10));
      const strengths = model.strengths.length > 0 ? ` [${model.strengths.join(', ')}]` : '';
      lines.push(`   ${model.modelName} - ${model.score.toFixed(2)} ${scoreBar}${strengths}`);
    });
    lines.push('');
  }

  const totalSamples = tierList.reduce((sum, m) => sum + m.usageCount, 0);
  lines.push(`_Based on ${tierList.length} models, ${totalSamples} total samples_`);
  lines.push('\nCommands: /tier-list day|week|month|all | /model-rankings | /popularity');

  return lines.join('\n');
}

export async function handlePopularityCommand(args: string): Promise<string> {
  const popularity = getModelPopularityService();

  // Refresh if needed
  if (popularity.needsRefresh()) {
    await popularity.refreshFromOllama();
  }

  const lines = ['📈 Model Popularity (Community Usage)\n'];

  // Get trending from Ollama
  const trending = popularity.getTrending(10);

  if (trending.length === 0) {
    lines.push('⏳ Fetching popularity data from Ollama...');
    lines.push('Run /popularity again in a few seconds.');
  } else {
    lines.push('🔥 Most Popular (Ollama Pulls):');
    lines.push('');

    trending.forEach((model, i) => {
      const pullStr = model.pullCount >= 1_000_000
        ? (model.pullCount / 1_000_000).toFixed(1) + 'M'
        : model.pullCount >= 1_000
        ? (model.pullCount / 1_000).toFixed(1) + 'K'
        : model.pullCount.toString();

      const local = model.localUsageCount > 0
        ? ` (you: ${model.localUsageCount} uses)`
        : '';

      lines.push(`  ${i + 1}. ${model.modelName} - ${pullStr} pulls${local}`);
    });
  }

  // Show most used locally
  const mostUsedLocally = popularity.getMostUsedLocally(5);
  if (mostUsedLocally.length > 0) {
    lines.push('');
    lines.push('👤 Your Most Used Models:');
    mostUsedLocally.forEach((model, i) => {
      const popScore = popularity.calculatePopularityScore(model.modelName);
      lines.push(`  ${i + 1}. ${model.modelName} - ${model.localUsageCount} uses (pop: ${(popScore * 100).toFixed(0)}%)`);
    });
  }

  lines.push('\nCommands: /popularity --refresh | /model-rankings | /tier-list');
  return lines.join('\n');
}

export async function handleRefreshPopularity(): Promise<string> {
  const popularity = getModelPopularityService();
  const count = await popularity.refreshFromOllama();
  return `✅ Refreshed popularity data for ${count} models from Ollama library.`;
}

export async function handleModelStatsCommand(modelName: string): Promise<string> {
  const router = await getRouter();
  const popularity = getModelPopularityService();

  const stats = router.getModelStats(modelName);
  const pop = popularity.getPopularity(modelName);

  if (!stats && !pop) {
    return `❌ No statistics found for model: ${modelName}\n\nUse this model to generate statistics.`;
  }

  const lines = [`📊 Statistics for ${modelName}\n`];

  if (stats) {
    lines.push('🏁 Performance:');
    lines.push(`  Score: ${stats.score.toFixed(2)}`);
    lines.push(`  Quality: ${((stats.avgQuality || 0) / 5 * 100).toFixed(0)}%`);
    lines.push(`  Latency: ${((stats.avgLatency || 0) / 1000).toFixed(2)}s avg`);
    lines.push(`  Success Rate: ${((stats.successRate || 0) * 100).toFixed(0)}%`);
    lines.push(`  Total Uses: ${stats.usageCount}`);
    lines.push('');
  }

  if (pop) {
    lines.push('📈 Popularity:');
    lines.push(`  Ollama Pulls: ${pop.pullCount.toLocaleString()}`);
    lines.push(`  Pull Rank: #${pop.pullCountRank}`);

    if (pop.communitySampleSize > 0) {
      lines.push(`  Community Rating: ${(pop.communityScore * 100).toFixed(0)}% (${pop.communitySampleSize} samples)`);
    }

    lines.push(`  Your Uses: ${pop.localUsageCount}`);
  }

  return lines.join('\n');
}

// ============================================================================
// Output Helpers
// ============================================================================

async function getRouterInfo(router: AdaptiveModelRouter): Promise<string> {
  const currentModel = router.getDefaultModel();
  const modelInfo = await router.getModelInfo(currentModel);

  const lines = ['🧠 Model Info'];
  lines.push('Mode: 🧠 Adaptive (auto-select)');
  lines.push(`Current: ${currentModel}`);

  if (modelInfo) {
    lines.push(`Speed: ${modelInfo.speedTier} | Quality: ${modelInfo.qualityTier}`);
    lines.push(`Context: ${modelInfo.contextWindow.toLocaleString()} tokens`);
  }

  if (favoriteModels.length > 0) {
    lines.push(`Favorites: ${favoriteModels.join(', ')}`);
  }

  return lines.join('\n');
}

function getFavoritesOutput(router: AdaptiveModelRouter): string {
  const favs = router.getFavoriteModels();
  if (favs.length === 0) {
    return '⭐ No favorites set.\nAdd to ~/.0xkobold/config.json:\n  "favoriteModels": ["kimi-k2.5:cloud"]';
  }
  return '⭐ Favorite models:\n' + favs.map(f => `  • ${f}`).join('\n');
}

function getRecommendationsOutput(models: DiscoveredModel[]): string {
  const lines = ['🎯 Model Recommendations:\n'];

  const bySize = {
    fast: models.filter(m => m.speedTier === 'fast'),
    balanced: models.filter(m => m.speedTier === 'medium' && m.qualityTier === 'good'),
    powerful: models.filter(m => m.qualityTier === 'excellent'),
  };

  if (bySize.fast.length > 0) {
    lines.push('Fast (simple tasks):');
    bySize.fast.slice(0, 3).forEach(m => lines.push(`  • ${m.name}`));
    lines.push('');
  }

  if (bySize.balanced.length > 0) {
    lines.push('Balanced (most tasks):');
    bySize.balanced.slice(0, 3).forEach(m => lines.push(`  • ${m.name}`));
    lines.push('');
  }

  if (bySize.powerful.length > 0) {
    lines.push('Powerful (complex tasks):');
    bySize.powerful.slice(0, 3).forEach(m => lines.push(`  • ${m.name}`));
  }

  return lines.join('\n');
}

// ============================================================================
// Footer Status (for TUI)
// ============================================================================

export async function getFooterStatus(): Promise<{ text: string; tooltip: string } | null> {
  try {
    if (!routerInstance) {
      return { text: '🧠 init...', tooltip: 'Router initializing...' };
    }

    const currentModel = routerInstance.getDefaultModel();
    const modelInfo = await routerInstance.getModelInfo(currentModel);

    if (!modelInfo) {
      return {
        text: `🧠 ${currentModel}`,
        tooltip: 'Model selected (no info available)',
      };
    }

    const speedEmoji = modelInfo.speedTier === 'fast' ? '⚡' : modelInfo.speedTier === 'medium' ? '🔄' : '🐢';
    const qualityEmoji = modelInfo.qualityTier === 'excellent' ? '⭐' : modelInfo.qualityTier === 'good' ? '✅' : '·';

    return {
      text: `🧠 ${currentModel}`,
      tooltip: `${speedEmoji} ${modelInfo.speedTier} | ${qualityEmoji} ${modelInfo.qualityTier}`,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Multi-Provider Commands
// ============================================================================

/**
 * Handle /providers command - show all provider statuses
 */
export async function handleProvidersCommand(): Promise<string> {
  const { getProviderStatuses } = await import('./multi-provider');
  const statuses = await getProviderStatuses();

  const lines = ['🔌 Provider Status:\n'];

  for (const status of statuses) {
    const emoji = status.available ? '✅' : '❌';
    lines.push(`${emoji} ${status.name}: ${status.available ? `${status.modelCount} models` : 'unavailable'}`);
  }

  lines.push('\n📌 Model prefixes:');
  lines.push('  • ollama/<model> - Ollama (local or cloud)');
  lines.push('  • claude/<model> - Anthropic Claude');
  lines.push('  • anthropic/<model> - Anthropic Claude (alias)');

  return lines.join('\n');
}

// ============================================================================
// History Output Helper
// ============================================================================

function getHistoryOutput(router: AdaptiveModelRouter): string {
  const history = router.getPerformanceHistory(20);

  if (history.length === 0) {
    return '📋 No performance history yet.\n\nUse models to build history. Ratings are persisted.';
  }

  const lines = ['📋 Recent Model Usage History\n'];

  lines.push('Time                 | Model                 | Task      | Latency | Result');
  lines.push('---------------------|----------------------|-----------|---------|--------');

  history.forEach(entry => {
    const time = new Date(entry.timestamp).toLocaleTimeString().substring(0, 5);
    const name = entry.modelName.substring(0, 20).padEnd(20);
    const task = (entry.taskType || 'chat').substring(0, 7).padEnd(7);
    const latency = ((entry.latencyMs || 0) / 1000).toFixed(1) + 's';
    const result = entry.success ? '✅' : '❌';
    const rating = entry.userRating ? ` (${entry.userRating}/5)` : '';

    lines.push(`${time.padEnd(20)} | ${name} | ${task} | ${latency.padStart(6)} | ${result}${rating}`);
  });

  lines.push('\nCommands: /model-rankings | /tier-list | /popularity');
  return lines.join('\n');
}

function getModelStatsOutput(router: AdaptiveModelRouter, modelName: string): string {
  const stats = router.getModelStats(modelName);

  if (!stats) {
    return `📊 No statistics found for: ${modelName}\n\nUse this model to generate statistics.`;
  }

  const lines = [`📊 Statistics for ${modelName}\n`];

  lines.push('🏁 Performance:');
  lines.push(`  Score: ${stats.score.toFixed(2)}`);
  lines.push(`  Quality: ${((stats.avgQuality || 0) / 5 * 100).toFixed(0)}%`);
  lines.push(`  Latency: ${((stats.avgLatency || 0) / 1000).toFixed(2)}s avg`);
  lines.push(`  Success Rate: ${((stats.successRate || 0) * 100).toFixed(0)}%`);
  lines.push(`  Total Uses: ${stats.usageCount}`);

  return lines.join('\n');
}

// ============================================================================
// Community Analytics Commands
// ============================================================================

export async function handleCommunityCommand(args: string): Promise<string> {
  const subcommand = args.trim().toLowerCase();

  if (!subcommand) {
    return `🌐 Community Stats Sharing

Share anonymized model performance data to improve recommendations for everyone.

Commands:
  /community status          - Check sharing status
  /community enable          - Enable anonymous stats sharing
  /community disable         - Disable sharing
  /community export          - Export your stats for sharing
  /community publish          - Publish to Nostr network
  /community fetch-nostr      - Fetch community stats from Nostr
  /community fetch           - Fetch community stats from GitHub
  /community merge           - Show merged local + community stats
  /community tier-list       - Show community-enhanced tier list

Privacy:
  ✅ Only model names + aggregate stats shared
  ✅ NO prompts, responses, or personal data
  ✅ NO user identity stored
  ✅ Opt-in only (disabled by default)

Share your data:
1. Run /community enable
2. Use models and rate them with /rate
3. Run /community publish (Nostr) OR /community export (GitHub)
4. Your data helps everyone choose the best models!`;
  }

  const community = require('./community-analytics').getCommunityAnalytics();

  switch (subcommand) {
    case 'status': {
      const enabled = community.isEnabled();
      const cached = community.getCachedData();
      return `🌐 Community Stats Status

Sharing: ${enabled ? '✅ Enabled' : '❌ Disabled'}
Community endpoint: ${community.config.endpoint}
Your user ID: ${community.userId}
Last fetched: ${community.config.lastFetched ? new Date(community.config.lastFetched).toLocaleString() : 'Never'}

Run /community enable to start sharing.`;
    }

    case 'enable': {
      community.enable();
      return `✅ Community stats sharing enabled!

Your anonymized performance data will be shared with the community.

Commands:
/community export  - Generate submission file
/community publish - Publish via Nostr (coming soon)
/community fetch-nostr - Fetch community data from Nostr

Your user ID: ${community.userId}`;
    }

    case 'disable':
      community.disable();
      return '❌ Community stats sharing disabled.\n\nYour data will no longer be shared.';

    case 'publish': {
      if (!community.isEnabled()) {
        return '❌ Community sharing not enabled.\n\nRun /community enable first.';
      }
      const publishResult = await community.publishToNostr();
      if (publishResult.success) {
        return `✅ Published to Nostr!

Event ID: ${publishResult.eventId}
Your stats are now available to the community.

View with: /community fetch-nostr
Merge with local: /community merge`;
      }
      return `❌ Failed to publish: ${publishResult.error}\n\nYou can still use /community export to save locally.`;
    }

    case 'fetch-nostr': {
      const nostrData = await community.fetchFromNostr();
      if (!nostrData) {
        return '❌ Failed to fetch from Nostr relays.\n\nThis could mean:\n- No stats have been published yet\n- Network connectivity issues\n\nBe the first to publish with /community publish!';
      }
      return `✅ Fetched community data from Nostr!

Models: ${nostrData.models.length}
Contributors: ${nostrData.totalContributors}
Updated: ${new Date(nostrData.updatedAt).toLocaleString()}

Top models:
${nostrData.models
  .sort((a: CommunityModelStats, b: CommunityModelStats) => b.avgRating - a.avgRating)
  .slice(0, 5)
  .map((m: CommunityModelStats) => `  ${m.modelName}: ${m.avgRating.toFixed(1)}★ (${m.contributorCount} contributors)`)
  .join('\n')}

Run /community merge to combine with your local data.`;
    }

    case 'export': {
      const outputPath = community.saveSubmissionLocally();
      const shareText = community.createShareableText();
      const lines = shareText.split('\n');
      // Show first 20 lines
      return `📤 Community Submission Ready!

File saved to: ${outputPath}

Preview:
${lines.slice(0, 20).join('\n')}
...

To submit:
1. Copy the file content
2. Go to: https://github.com/kobolds/0xKobolds/tree/main/community
3. Create a PR or issue with your submission

Or share the raw JSON in GitHub Discussions.`;
    }

    case 'fetch': {
      const data = await community.fetchCommunityStats() as CommunityData | null;
      if (!data) {
        return '❌ Failed to fetch community data.\n\nCheck your internet connection and try again.';
      }
      return `✅ Fetched community data!

Models: ${data.models.length}
Contributors: ${data.totalContributors || 'unknown'}
Updated: ${new Date(data.updatedAt).toLocaleString()}

Top models by rating:
${data.models
  .sort((a: CommunityModelStats, b: CommunityModelStats) => b.avgRating - a.avgRating)
  .slice(0, 5)
  .map((m: CommunityModelStats) => `  ${m.modelName}: ${m.avgRating.toFixed(1)}/5 (${m.contributorCount} contributors)`)
  .join('\n')}

Run /community merge to combine with your local data.`;
    }

    case 'merge': {
      const merged = community.mergeWithLocal();
      const sorted = Array.from(merged.values() as Iterable<CommunityModelStats>)
        .sort((a, b) => b.avgRating - a.avgRating);

      const mergeLines = ['🌐 Merged Community + Local Stats\n'];
      mergeLines.push('Rank | Model                  | Rating | Latency | Success | Users');
      mergeLines.push('-----|------------------------|--------|---------|---------|------');

      sorted.slice(0, 15).forEach((m: CommunityModelStats, i: number) => {
        mergeLines.push(
          `${(i + 1).toString().padStart(4)} | ${m.modelName.substring(0, 22).padEnd(22)} | ${m.avgRating.toFixed(1)}  | ${(m.avgLatency / 1000).toFixed(1)}s   | ${(m.successRate * 100).toFixed(0)}%    | ${m.contributorCount}`
        );
      });

      mergeLines.push(`\n_Showing ${Math.min(15, sorted.length)} of ${sorted.length} models_`);
      mergeLines.push('\nCommands: /community tier-list | /community fetch');

      return mergeLines.join('\n');
    }

    case 'tier-list': {
      const tiers = community.getCommunityTierList();
      const tierLines = ['🌐 Community Tier List\n'];

      const tierEmojis: Record<string, string> = { S: '🥇', A: '🥈', B: '🥉', C: '⭐', D: '·' };
      const tierDescs: Record<string, string> = {
        S: 'Excellent (≥0.85)',
        A: 'Great (≥0.70)',
        B: 'Good (≥0.55)',
        C: 'Fair (≥0.40)',
        D: 'Needs improvement',
      };

      for (const { tier, models } of tiers) {
        if (models.length === 0) continue;

        tierLines.push(`${tierEmojis[tier]} **Tier ${tier}** - ${tierDescs[tier]}`);
        models.slice(0, 5).forEach(m => {
          const rating = m.avgRating.toFixed(1);
          const users = m.contributorCount;
          tierLines.push(`   ${m.modelName} - ${rating}/5 (${users} users)`);
        });
        tierLines.push('');
      }

      const totalModels = tiers.reduce((sum, t) => sum + t.models.length, 0);
      tierLines.push(`_Based on ${totalModels} models from community data_`);

      return tierLines.join('\n');
    }

    default:
      return `Unknown command: ${subcommand}\n\nUse /community to see available commands.`;
  }
}

export async function handleBestForCommand(taskType: string): Promise<string> {
  const community = require('./community-analytics').getCommunityAnalytics();
  const merged: Map<string, import('./community-analytics').CommunityModelStats> = community.mergeWithLocal();
  
  const task = taskType.toLowerCase().trim() || 'all';
  const validTasks = ['chat', 'code', 'vision', 'reasoning', 'all'];
  
  if (!validTasks.includes(task)) {
    return `Unknown task: ${task}\n\nValid tasks: ${validTasks.join(', ')}`;
  }
  
  const lines = [`🎯 Best Models for ${task === 'all' ? 'Each Task' : task.toUpperCase()}\n`];
  
  if (task === 'all') {
    // Show best for each task type
    const tasks = ['code', 'chat', 'vision', 'reasoning'];
    
    for (const t of tasks) {
      const models = Array.from(merged.values())
        .filter((m: CommunityModelStats) => m.taskStats.some(ts => ts.taskType === t && ts.usageCount >= 2))
        .sort((a: CommunityModelStats, b: CommunityModelStats) => {
          const aTask = a.taskStats.find(ts => ts.taskType === t);
          const bTask = b.taskStats.find(ts => ts.taskType === t);
          if (!aTask) return 1;
          if (!bTask) return -1;
          return (bTask.avgRating * 0.5 + bTask.successRate * 0.5) - 
                 (aTask.avgRating * 0.5 + aTask.successRate * 0.5);
        })
        .slice(0, 5);
      
      lines.push(`\n**${t.toUpperCase()}**:`);
      
      if (models.length === 0) {
        lines.push(`  No data yet. Use models and rate them with /rate.`);
        continue;
      }
      
      models.forEach((m: CommunityModelStats, i: number) => {
        const ts = m.taskStats.find(ts => ts.taskType === t);
        if (ts) {
          lines.push(`  ${i + 1}. ${m.modelName} - ${ts.avgRating.toFixed(1)}★ (${ts.usageCount} uses, ${(ts.successRate * 100).toFixed(0)}% success)`);
        }
      });
    }
  } else {
    // Show best for specific task
    const models = Array.from(merged.values())
      .filter((m: CommunityModelStats) => m.taskStats.some(ts => ts.taskType === task && ts.usageCount >= 1))
      .sort((a: CommunityModelStats, b: CommunityModelStats) => {
        const aTask = a.taskStats.find(ts => ts.taskType === task);
        const bTask = b.taskStats.find(ts => ts.taskType === task);
        if (!aTask) return 1;
        if (!bTask) return -1;
        return (bTask.avgRating * 0.4 + bTask.successRate * 0.3 + (1 - bTask.avgLatency / 10000) * 0.3) - 
               (aTask.avgRating * 0.4 + aTask.successRate * 0.3 + (1 - aTask.avgLatency / 10000) * 0.3);
      });
    
    if (models.length === 0) {
      return `📊 No models have been used for ${task} yet.\n\nUse models for ${task} tasks and rate them with /rate.`;
    }
    
    lines.push('Rank | Model                    | Rating | Success | Latency | Users');
    lines.push('-----|-------------------------|--------|---------|---------|------');
    
    models.slice(0, 15).forEach((m: CommunityModelStats, i: number) => {
      const ts = m.taskStats.find(ts => ts.taskType === task);
      if (ts) {
        lines.push(
          `${(i + 1).toString().padStart(4)} | ${m.modelName.substring(0, 23).padEnd(23)} | ${ts.avgRating.toFixed(1)}  | ${(ts.successRate * 100).toFixed(0)}%    | ${(ts.avgLatency / 1000).toFixed(1)}s   | ${m.contributorCount}`
        );
      }
    });
    
    lines.push(`\n_Showing ${Math.min(15, models.length)} models for ${task}_`);
    lines.push('\nCommands: /best-for code | /best-for chat | /best-for vision | /best-for reasoning');
  }
  
  return lines.join('\n');
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { AdaptiveModelRouter, createRouter };