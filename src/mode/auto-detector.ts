/**
 * Mode Auto-Detector - v0.2.0
 * 
 * Detect when mode switching is needed based on context.
 * Part of Phase 2.3: Mode System Enhancement
 */

export type ModeType = 'plan' | 'build';

export interface ModeDetectionResult {
  recommendedMode: ModeType;
  confidence: number; // 0-100
  reasoning: string;
  features: ContextFeatures;
  suggestions: string[];
}

export interface ContextFeatures {
  appearsComplex: boolean;
  mentionsArchitecture: boolean;
  mentionsDesign: boolean;
  asksQuestions: boolean;
  seemsUrgent: boolean;
  needsResearch: boolean;
  mentionsImplementation: boolean;
  mentionsBugFix: boolean;
  mentionsFiles: boolean;
  asksForCode: boolean;
  mentionsRefactor: boolean;
  mentionsOptimize: boolean;
}

// Plan mode indicators (keywords that suggest planning)
const PLAN_INDICATORS = [
  /\b(how should|how to|how do|what's the best way|what would be best)\b/i,
  /\b(design|architecture|plan|approach|strategy|structure)\b/i,
  /\b(should we|would it be better|could we|consider)\b/i,
  /\b(thinking about|considering|evaluating|assessing)\b/i,
  /\b(pros and cons|tradeoffs|options|alternatives)\b/i,
  /\b(documentation|docs|explain how|understand)\b/i,
  /\b(investigate|explore|research|learn about)\b/i,
  /\b(before we start|first|initially)\b/i,
];

// Build mode indicators (keywords that suggest building)
const BUILD_INDICATORS = [
  /\b(implement|create|build|make|add|write)\b/i,
  /\b(fix|bug|issue|error|problem|broken)\b/i,
  /\b(update|change|modify|edit|refactor)\b/i,
  /\b(generate|produce|output|deploy|publish)\b/i,
  /\b(quick|fast|now|immediately|asap|urgent)\b/i,
  /\b(code|function|class|component|module)\b/i,
  /\b(test|unit test|spec|expect)\b/i,
  /\b(commit|push|pr|merge|deploy)\b/i,
];

// Complexity indicators
const COMPLEXITY_INDICATORS = [
  /\b(complex|complicated|difficult|challenging|large|big|many|multiple)\b/i,
  /\b(system|platform|framework|library|api)\b/i,
  /\b(migration|refactor|rewrite|redesign|restructure)\b/i,
  /\b(integrate|connect|interface with)\b/i,
  /\b(scale|performance|optimization|architecture)\b/i,
];

// Urgency indicators
const URGENCY_INDICATORS = [
  /\b(urgent|asap|now|quickly|fast|immediately|blocking)\b/i,
  /\b(broken|failing|crash|error|bug|issue)\b/i,
  /\b(hotfix|fix asap|critical|emergency)\b/i,
];

/**
 * Analyze context features from prompt
 */
export function analyzeContext(prompt: string): ContextFeatures {
  const text = prompt.toLowerCase();
  
  return {
    appearsComplex: COMPLEXITY_INDICATORS.some((r) => r.test(text)),
    mentionsArchitecture: /\b(architecture|design pattern|structur)/i.test(text),
    mentionsDesign: /\b(design|layout|ui|ux|interface)/i.test(text),
    asksQuestions:
      text.includes('?') ||
      /\b(how|what|why|when|where|should|could|would)\b/i.test(text),
    seemsUrgent: URGENCY_INDICATORS.some((r) => r.test(text)),
    needsResearch:
      /\b(research|investigate|explore|find out|look up|search)/i.test(text),
    mentionsImplementation:
      /\b(implement|build|create|write|code|develop)/i.test(text),
    mentionsBugFix:
      /\b(fix|bug|issue|error|broken|crash|debug)/i.test(text),
    mentionsFiles:
      /\b(file|path|directory|folder|\.\w+$)/i.test(text) ||
      /\b(\w+\.\w{2,4})\b/.test(text),
    asksForCode:
      /\b(write|create|implement|code|function|class)\b/i.test(text),
    mentionsRefactor:
      /\b(refactor|rewrite|restructure|redesign|clean up)/i.test(text),
    mentionsOptimize:
      /\b(optimize|improve|performance|fast|speed|efficient)/i.test(text),
  };
}

/**
 * Detect recommended mode from prompt
 */
export function detectModeFromPrompt(
  prompt: string,
  currentMode: ModeType = 'plan'
): ModeDetectionResult {
  const text = prompt.toLowerCase();
  const features = analyzeContext(prompt);

  // Calculate scores
  let planScore = 0;
  let buildScore = 0;

  // Check indicators
  for (const pattern of PLAN_INDICATORS) {
    if (pattern.test(text)) planScore += 1;
  }

  for (const pattern of BUILD_INDICATORS) {
    if (pattern.test(text)) buildScore += 1;
  }

  // Feature adjustments
  if (features.appearsComplex) planScore += 0.5;
  if (features.mentionsArchitecture) planScore += 2;
  if (features.mentionsDesign) planScore += 1.5;
  if (features.asksQuestions) planScore += 1;
  if (features.needsResearch) planScore += 2;

  if (features.mentionsBugFix) buildScore += 3;
  if (features.mentionsImplementation) buildScore += 2;
  if (features.asksForCode) buildScore += 2;
  if (features.mentionsRefactor) buildScore += 1.5;
  if (features.mentionsOptimize) buildScore += 1;
  if (features.seemsUrgent) buildScore += 2;
  if (features.mentionsFiles) buildScore += 1;

  // Determine recommendation
  let recommendedMode: ModeType;
  let confidence: number;
  let reasoning: string;

  const totalScore = planScore + buildScore;

  if (totalScore === 0) {
    // No strong indicators, stay in current mode
    recommendedMode = currentMode;
    confidence = 30;
    reasoning = 'No clear mode indicators detected. Staying in current mode.';
  } else if (planScore > buildScore * 1.5) {
    recommendedMode = 'plan';
    confidence = Math.min(95, 50 + planScore * 15);
    reasoning = `Planning indicators detected (${planScore.toFixed(1)} vs ${buildScore.toFixed(1)}): questions, design consideration, or research needed`;
  } else if (buildScore > planScore * 1.5) {
    recommendedMode = 'build';
    confidence = Math.min(95, 50 + buildScore * 15);
    reasoning = `Build indicators detected (${buildScore.toFixed(1)} vs ${planScore.toFixed(1)}): implementation, fixes, or urgent action needed`;
  } else {
    // Mixed signals
    recommendedMode = currentMode;
    confidence = 50;
    reasoning = `Mixed signals. Plan score: ${planScore.toFixed(1)}, Build score: ${buildScore.toFixed(1)}. Staying in current mode.`;
  }

  // Override for complex tasks
  if (features.appearsComplex && recommendedMode === 'build' && confidence < 80) {
    reasoning += ' However, this appears complex - consider planning first.';
  }

  // Generate suggestions
  const suggestions = generateSuggestions(features, recommendedMode);

  return {
    recommendedMode,
    confidence,
    reasoning,
    features,
    suggestions,
  };
}

/**
 * Generate suggestions based on features
 */
function generateSuggestions(
  features: ContextFeatures,
  mode: ModeType
): string[] {
  const suggestions: string[] = [];

  if (mode === 'build') {
    if (features.appearsComplex) {
      suggestions.push('This appears complex. Consider planning before building.');
    }
    if (features.needsResearch) {
      suggestions.push('Some research may help before implementation.');
    }
    if (!features.mentionsFiles) {
      suggestions.push('Consider which files need to be modified.');
    }
  } else {
    if (features.seemsUrgent) {
      suggestions.push('Note: This seems urgent but is in plan mode.');
    }
    if (features.mentionsBugFix) {
      suggestions.push('Consider if this needs immediate fixing (build mode).');
    }
  }

  if (features.mentionsRefactor) {
    suggestions.push('Refactoring often benefits from careful planning.');
  }

  return suggestions;
}

/**
 * Quick mode detection
 */
export function quickDetectMode(prompt: string): ModeType {
  const result = detectModeFromPrompt(prompt);
  return result.recommendedMode;
}

/**
 * Should suggest mode switch (medium confidence)
 */
export function shouldSuggestSwitch(result: ModeDetectionResult): boolean {
  return result.confidence >= 50 && result.confidence < 80;
}

/**
 * Should auto-switch mode (high confidence)
 */
export function shouldAutoSwitch(result: ModeDetectionResult): boolean {
  return result.confidence >= 80;
}

/**
 * Get mode recommendation text
 */
export function getModeRecommendationText(
  result: ModeDetectionResult
): string {
  if (result.confidence >= 80) {
    return `Auto-switching to ${result.recommendedMode.toUpperCase()} mode: ${result.reasoning}`;
  } else if (result.confidence >= 50) {
    return `Suggestion: Switch to ${result.recommendedMode.toUpperCase()} mode? ${result.reasoning}`;
  } else {
    return `Staying in current mode. ${result.reasoning}`;
  }
}
