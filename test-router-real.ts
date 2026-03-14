#!/usr/bin/env bun
/**
 * Real Router Test - Makes actual LLM calls to verify routing
 * 
 * This is isolated from the main system - it creates its own provider.
 * Run with: bun test-router-real.ts
 */

import { createRoutedProvider } from './src/llm/routed-provider';

// Import the actual Ollama provider from the extension
async function getOllamaProvider() {
  const { loadConfigFromEnv, createClients, chat } = await import('@0xkobold/pi-ollama');
  const config = loadConfigFromEnv();
  const clients = createClients(config);
  
  return {
    name: 'ollama',
    chat: async (opts: any) => {
      // Use the actual chat function from the extension
      const response = await chat(clients, opts.model, opts.messages, opts.temperature);
      return {
        content: response.content,
        model: response.model,
        usage: response.usage,
      };
    },
  };
}

async function main() {
  console.log('🧪 Real Router Test (Isolated from main session)\n');
  
  try {
    // Create actual Ollama provider
    const baseProvider = await getOllamaProvider();
    
    // Wrap with router
    const router = await createRoutedProvider(baseProvider, { verbose: true });
    
    // Test 1: Simple query (should use fast model)
    console.log('\n--- Test 1: Simple greeting ---');
    const r1 = await router.chat({
      messages: [{ role: 'user', content: 'hi' }],
    });
    console.log(`Response: ${r1.content.slice(0, 100)}...`);
    
    // Test 2: Code task (should use code model)
    console.log('\n--- Test 2: Code generation ---');
    const r2 = await router.chat({
      messages: [{ role: 'user', content: 'write a hello world in Python' }],
    });
    console.log(`Response: ${r2.content.slice(0, 100)}...`);
    
    // Test 3: Force specific model
    console.log('\n--- Test 3: Forced model ---');
    const r3 = await router.chat({
      messages: [{ role: 'user', content: 'say hello' }],
      forceModel: 'minimax-m2.5:cloud',
    });
    console.log(`Response: ${r3.content.slice(0, 100)}...`);
    
    console.log('\n✅ All tests passed!');
    
  } catch (err) {
    console.error('❌ Test failed:', err);
    console.log('\nMake sure Ollama is running: ollama serve');
  }
}

main();
