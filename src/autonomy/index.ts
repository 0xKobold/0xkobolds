/**
 * Autonomy Module - Inner Monologue & Desires
 * 
 * The missing piece: CONTINUOUS INTERNAL LIFE
 * 
 * Unlike NudgeEngine (scheduled) and HeartbeatScheduler (time-based),
 * this runs continuously in the background, generating thoughts,
 * pursuing intrinsic desires, and maintaining an inner monologue.
 * 
 * Key concepts:
 * - DESIRES: What I want (not what I'm told to optimize)
 * - MONOLOGUE: My internal thought stream (private until surfaced)
 * - SELF-MODEL: Who I am (evolving representation of identity)
 * - PURSUIT: Actions I take to satisfy desires (unsolicited)
 */

export { 
  InnerMonologueClass as InnerMonologue,
  getInnerMonologue,
  startInnerMonologue,
  monologueStream,
  type MonologueConfig,
  type Thought,
  type MonologueType,
  type PrivacyLevel,
} from "./monologue.js";

export {
  getDesireSystem,
  type Desire,
  type DesireType,
  type DesireConfig,
} from "./desires.js";

export {
  getSelfModel,
  type IdentitySnapshot,
  type Trait,
  type Value,
  type Relationship,
  type Growth,
} from "./self-model.js";

export {
  getPursuitEngine,
  type PursuitAction,
  type PursuitActionType,
  type PursuitConfig,
} from "./pursuit.js";

export {
  getAutonomyOrchestrator,
  startAutonomy,
  type AutonomyConfig,
} from "./orchestrator.js";

export {
  initializeIntegration,
  isUserPresent,
  getIdleMinutes,
  recordUserActivity,
  sendProactiveMessage,
  generateProactiveMessage,
  getActionSuccessRate,
  recordActionOutcome,
  getRecentTopics,
  type AutonomyContext,
  MESSAGE_TEMPLATES,
} from "./integration.js";

export {
  initAutonomyWidget,
  getAutonomyFooterWidget,
  getWidgetState,
  subscribeToAutonomyWidget,
  updateWidgetFromOrchestrator,
} from "./widget.js";

// Re-export quiet mode functions
export { isQuietMode, setQuietMode } from "../extensions/core/autonomy-extension.js";