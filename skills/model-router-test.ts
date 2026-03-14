/**
 * Model Router Test Skill
 * 
 * Usage: /test-router
 * Shows routing decisions without making LLM calls
 */

import { getModelDiscoveryService } from '../src/llm/model-discovery';
import { DynamicModelRouter } from '../src/llm/router';

const mockProvider = {
  name: 'test',
  chat: async (opts: any) => ({ content: 'test', model: opts.model, usage: { inputTokens: 0, outputTokens: 0 } }),
};

export async function testRouterSkill(args: string): Promise<string> {
  const discovery = getModelDiscoveryService();
  const models = await discovery.discoverModels(true);
  const router = new DynamicModelRouter(mockProvider);
  await router.initialize();

  const lines: string[] = [];
  lines.push(`📊 Found ${models.length} models\n`);

  // Show model summary
  for (const m of models) {
    const caps = Object.entries(m.capabilities)
      .filter(([, v]) => v)
      .map(([k]) => k[0].toUpperCase())
      .join('');
    lines.push(`• ${m.name} (${m.speedTier}, ${m.qualityTier}, ${caps})`);
  }

  // Test routing
  lines.push('\n🎯 Routing tests:');
  const tests = [
    'hi',
    'write a React component',
    'explain quantum computing in detail',
    'create embeddings for this',
  ];

  for (const test of tests) {
    const selected = await router.selectModel(test);
    lines.push(`  "${test.slice(0, 30)}..." → ${selected}`);
  }

  return lines.join('\n');
}

// Register as skill
export default {
  name: 'testRouter',
  description: 'Test model router without LLM calls',
  risk: 'safe',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'testRouter',
      description: 'Test the dynamic model router',
      parameters: { type: 'object', properties: {} },
    },
  },
  execute: async () => ({ content: [{ type: 'text', text: await testRouterSkill('') }] }),
};
