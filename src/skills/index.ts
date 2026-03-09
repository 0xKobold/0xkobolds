// Skills Framework (Phase 4)
export { 
  getSkillRegistry, 
  resetSkillRegistry, 
  installSkill, 
  getSkillMarketplace,
  type Skill,
  type SkillContext,
  type SkillResult,
  type SkillHandler
} from "./framework.js";

// Real Worker Skills (Phase 3.3 - NOW ACTUAL IMPLEMENTATIONS)
export {
  nextjsWorkerSkill,
  sqlWorkerSkill,
  apiWorkerSkill,
  testWorkerSkill,
  webResearchSkill,
} from "./builtin/real-workers.js";

// Duplicate Detection Skill (v0.3.0)
export { DuplicateDetector, getDuplicateDetector } from "./builtin/duplicate-detector.js";

// Backwards compatibility - mock skills now redirect to real workers
export { nextjsWorkerSkill as nextjsWorkerMock } from "./builtin/nextjs-worker.js";
export { sqlWorkerSkill as sqlWorkerMock } from "./builtin/sql-worker.js";
export { apiWorkerSkill as apiWorkerMock } from "./builtin/api-worker.js";
export { testWorkerSkill as testWorkerMock } from "./builtin/test-worker.js";
export { webResearchSkill as webResearchMock } from "./builtin/web-research.js";
