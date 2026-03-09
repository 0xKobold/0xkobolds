> **Agent:** Specialist 🧠
> **Task ID:** phase2-task3-mode-detection
> **Priority:** High

# Task 3: Mode Auto-Detection

## Objective
Build intelligent context analysis to automatically detect when mode switching is needed.

## Deliverables

1. **src/mode/auto-detector.ts**
   ```typescript
   interface ModeDetectionResult {
     recommendedMode: 'plan' | 'build';
     confidence: number;
     reasoning: string;
     suggestions: string[];
   }
   
   function detectModeFromPrompt(prompt: string): ModeDetectionResult
   function detectModeFromContext(context: string): ModeDetectionResult
   ```

2. **src/mode/context-analyzer.ts**
   ```typescript
   interface ContextFeatures {
     appearsComplex: boolean;
     mentionsFiles: boolean;
     asksQuestions: boolean;
     seemsUrgent: boolean;
     needsResearch: boolean;
   }
   
   function analyzeContext(prompt: string): ContextFeatures
   ```

## Detection Logic

Plan mode indicators:
- "how should", "design", "architecture"
- "what's the best way"
- "plan", "approach", "strategy"
- Questions about approach

Build mode indicators:
- "implement", "create", "build"
- "fix", "update", "refactor"
- File operations mentioned
- Urgent language

## Confidence Scoring
- High (>80%): Clear indicators
- Medium (50-80%): Mixed signals
- Low (<50%): Stay current mode

## Done When
- [ ] auto-detector.ts implemented
- [ ] context-analyzer.ts implemented
- [ ] Detection logic tested
- [ ] Accuracy >70% on test cases
- [ ] Tests pass

## Status
Write to: .agents/status/phase2-task3-done
