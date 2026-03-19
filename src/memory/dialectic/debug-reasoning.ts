#!/usr/bin/env bun
/**
 * Debug dialectic reasoning to see what the model returns
 */

import { getDialecticStore, getDialecticReasoningEngine } from "./index.js";

async function main() {
  console.log("\n🔍 Dialectic Reasoning Debug\n");
  
  const store = getDialecticStore();
  const peer = store.createPeer("user", `debug-${Date.now()}`);
  
  // Simple test - need at least 3 observations
  store.addObservation(peer.id, "I prefer TypeScript over JavaScript", "preference", "message", "1");
  store.addObservation(peer.id, "I use TypeScript for all new projects", "behavior", "message", "2");
  store.addObservation(peer.id, "I think static typing reduces bugs", "statement", "message", "3");
  
  console.log("Observations:");
  const obs = store.getObservations(peer.id);
  obs.forEach(o => console.log(`  [${o.category}] ${o.content}`));
  
  console.log("\n🧠 Running dialectic reasoning with glm-5:cloud...\n");
  
  try {
    const engine = getDialecticReasoningEngine({ strategy: "dialectic", model: "minimax-m2.7:cloud" });
    const result = await engine.reason(peer.id);
    
    console.log("Results:");
    console.log(`  Preferences: ${result.preferences.length}`);
    result.preferences.forEach(p => console.log(`    - ${p.topic}: ${p.preference} (${(p.confidence * 100).toFixed(0)}%)`));
    
    console.log(`  Goals: ${result.goals.length}`);
    result.goals.forEach(g => console.log(`    - ${g.description} [${g.status}]`));
    
    console.log(`  Contradictions: ${result.contradictions.length}`);
    result.contradictions.forEach(c => console.log(`    - ${c.observationA} vs ${c.observationB}`));
    
    console.log(`  Synthesis:`);
    console.log(`    ${result.synthesis?.content || "None"}`);
    
    console.log(`  Reasoning Path: ${result.reasoningPath.join(" → ")}`);
    
  } catch (e) {
    console.log(`❌ Error: ${e}`);
  }
}

main().catch(console.error);