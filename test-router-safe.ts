#!/usr/bin/env bun
/**
 * Safe Router Test - Runs independently without affecting current session
 * 
 * This test:
 * 1. Discovers your actual Ollama models
 * 2. Simulates routing decisions (no actual LLM calls)
 * 3. Shows what model would be selected for different inputs
 * 
 * Run with: bun test-router-safe.ts
 */

import { getModelDiscoveryService, type DiscoveredModel } from './src/llm/model-discovery';
import { DynamicModelRouter } from './src/llm/router';

// Mock provider - doesn't make real calls
const mockProvider = {
  name: 'test-ollama',
  chat: async (opts: any) => ({
    content: `Mock response from ${opts.model}`,
    model: opts.model,
    usage: { inputTokens: 100, outputTokens: 50 },
  }),
};

async function testRouter() {
  console.log('🔍 Testing Dynamic Model Router (Safe Mode)\n');
  console.log('=' .repeat(60));

  // Step 1: Discover models
  console.log('\n📋 Step 1: Discovering your Ollama models...\n');
  const discovery = getModelDiscoveryService();
  const models = await discovery.discoverModels(true);
  
  console.log(`Found ${models.length} models:\n`);
  
  // Group by capability
  const byCapability = {
    chat: models.filter(m => m.capabilities.chat),
    code: models.filter(m => m.capabilities.code),
    reasoning: models.filter(m => m.capabilities.reasoning),
    embedding: models.filter(m => m.capabilities.embedding),
    vision: models.filter(m => m.capabilities.vision),
  };

  for (const [cap, list] of Object.entries(byCapability)) {
    if (list.length > 0) {
      console.log(`  ${cap.toUpperCase()} (${list.length}):`);
      for (const m of list) {
        const params = m.parameterCount ? ` ${m.parameterCount}B` : '';
        const cloud = m.isCloud ? ' ☁️' : '';
        console.log(`    • ${m.name}${params}${cloud} - ${m.speedTier}/${m.qualityTier}`);
      }
      console.log();
    }
  }

  // Step 2: Test routing decisions
  console.log('\n🎯 Step 2: Testing routing decisions...\n');
  
  const router = new DynamicModelRouter(mockProvider);
  await router.initialize();

  const testCases = [
    { input: 'hi', desc: 'Simple greeting' },
    { input: 'what is 2+2?', desc: 'Simple math' },
    { input: 'write a React component', desc: 'Code generation' },
    { input: 'debug this TypeScript error', desc: 'Code debugging' },
    { input: 'explain quantum computing', desc: 'Complex explanation' },
    { input: 'analyze this architecture with trade-offs', desc: 'Complex analysis' },
    { input: 'create embeddings for this text', desc: 'Embedding task' },
    { input: 'what is in this image?', desc: 'Vision task (fallback expected)' },
  ];

  console.log('Input'.padEnd(35), '→ Selected Model');
  console.log('-'.repeat(60));
  
  for (const test of testCases) {
    const selected = await router.selectModel(test.input);
    const shortInput = test.input.length > 32 ? test.input.slice(0, 29) + '...' : test.input;
    console.log(`${shortInput.padEnd(35)} → ${selected}`);
  }

  // Step 3: Test with explicit options
  console.log('\n\n⚙️  Step 3: Testing explicit routing options...\n');
  
  const explicitTests = [
    { 
      input: 'any message', 
      opts: { forceModel: 'minimax-m2.5:cloud' },
      desc: 'Forced model'
    },
    { 
      input: 'write code', 
      opts: { taskType: 'code' as const, complexity: 'high' as const },
      desc: 'Code task hint'
    },
    { 
      input: 'quick answer', 
      opts: { preferSpeed: true },
      desc: 'Speed preference'
    },
    { 
      input: 'detailed analysis', 
      opts: { preferQuality: true },
      desc: 'Quality preference'
    },
  ];

  for (const test of explicitTests) {
    const selected = await router.selectModel(test.input, test.opts);
    console.log(`${test.desc.padEnd(20)} → ${selected}`);
  }

  // Step 4: Show recommendations
  console.log('\n\n💡 Step 4: Model recommendations for your setup...\n');
  
  const findBest = (filter: (m: DiscoveredModel) => boolean, prefer: 'speed' | 'quality') => {
    const candidates = models.filter(filter);
    if (candidates.length === 0) return 'N/A';
    
    candidates.sort((a, b) => {
      if (prefer === 'speed') {
        const order = { fast: 0, medium: 1, slow: 2 };
        return order[a.speedTier] - order[b.speedTier];
      } else {
        const order = { basic: 0, good: 1, excellent: 2 };
        return order[b.qualityTier] - order[a.qualityTier];
      }
    });
    return candidates[0].name;
  };

  console.log(`  Fastest:     ${findBest(m => m.speedTier === 'fast', 'speed')}`);
  console.log(`  Best chat:   ${findBest(m => m.capabilities.chat && m.qualityTier === 'good', 'quality')}`);
  console.log(`  Best code:   ${findBest(m => m.specializations.includes('coding'), 'quality')}`);
  console.log(`  Most power:  ${findBest(m => m.qualityTier === 'excellent', 'quality')}`);
  console.log(`  Embeddings:  ${findBest(m => m.capabilities.embedding, 'speed')}`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete! No actual LLM calls were made.');
  console.log('\nTo integrate into your system:');
  console.log('  import { createRoutedProvider } from "./src/llm"');
  console.log('  const router = await createRoutedProvider(yourOllamaProvider)');
  console.log('  const response = await router.chat({ messages })');
}

testRouter().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
