/**
 * Real Worker Skills - v0.3.0
 * 
 * ACTUAL implementations that spawn ephemeral agents and do real work.
 */

import type { SkillHandler, SkillContext, SkillResult } from "../framework.js";
import { spawnAgent } from "../../agent/tools/spawn-agent.js";

/**
 * Execute worker task by spawning a real ephemeral agent
 */
async function executeWorkerTask(
  task: string,
  domain: string,
  context: SkillContext,
  instructions: string
): Promise<SkillResult> {
  try {
    // Spawn a real agent for this domain
    const agentResult = await spawnAgent({
      task: `${domain} Task: ${task}\n\n${instructions}`,
      agentType: "specialist",
      timeoutMs: 120000,
    });

    if (!agentResult.success) {
      return {
        success: false,
        error: agentResult.error || "Failed to spawn agent",
      };
    }

    // Return the agent result as skill output
    return {
      success: true,
      output: `## ${domain} Worker Completed\n\n` +
        `Agent ID: ${agentResult.agentId}\n` +
        `Duration: ${agentResult.durationMs}ms\n\n` +
        `### Result\n\n${agentResult.text}`,
      artifacts: [],
    };
  } catch (error) {
    return {
      success: false,
      error: `Worker execution failed: ${error}`,
    };
  }
}

/**
 * Next.js Worker - Real Implementation
 */
export const nextjsWorkerSkill: SkillHandler = async (args, context) => {
  const task = args.task as string;
  
  return executeWorkerTask(
    task,
    "Next.js/React",
    context,
    `You are a Next.js specialist. Your task is to:\n` +
    `1. Create/modify React components following Next.js 13+ App Router patterns\n` +
    `2. Use TypeScript with proper interfaces\n` +
    `3. Follow best practices for Server Components vs Client Components\n` +
    `4. Include proper error boundaries and loading states\n` +
    `5. Write clean, accessible JSX\n\n` +
    `Output:\n` +
    `- Component code in TypeScript\n` +
    `- Props interface with JSDoc\n` +
    `- Brief explanation of changes`
  );
};

/**
 * Python Worker - Real Implementation  
 */
export const pythonWorkerSkill: SkillHandler = async (args, context) => {
  const task = args.task as string;
  
  return executeWorkerTask(
    task,
    "Python",
    context,
    `You are a Python specialist. Your task is to:\n` +
    `1. Write clean, idiomatic Python (3.11+)\n` +
    `2. Use type hints and dataclasses where appropriate\n` +
    `3. Follow PEP 8 style guidelines\n` +
    `4. Include docstrings for functions and classes\n` +
    `5. Handle errors gracefully\n\n` +
    `Output:\n` +
    `- Python code with proper imports\n` +
    `- Type hints on all functions\n` +
    `- Brief explanation`
  );
};

/**
 * Data Science Worker - Real Implementation
 */
export const dataScienceWorkerSkill: SkillHandler = async (args, context) => {
  const task = args.task as string;
  
  return executeWorkerTask(
    task,
    "Data Science",
    context,
    `You are a Data Science specialist. Your task is to:\n` +
    `1. Use pandas, numpy, scikit-learn as needed\n` +
    `2. Create clear visualizations\n` +
    `3. Include statistical analysis where relevant\n` +
    `4. Document methodology\n` +
    `5. Handle missing data appropriately\n\n` +
    `Output:\n` +
    `- Python code for analysis\n` +
    `- Statistical insights\n` +
    `- Visualization code if needed`
  );
};

/**
 * DevOps Worker - Real Implementation
 */
export const devopsWorkerSkill: SkillHandler = async (args, context) => {
  const task = args.task as string;
  
  return executeWorkerTask(
    task,
    "DevOps",
    context,
    `You are a DevOps specialist. Your task is to:\n` +
    `1. Write Docker/Kubernetes configs\n` +
    `2. Create CI/CD pipelines\n` +
    `3. Set up monitoring and logging\n` +
    `4. Use infrastructure as code\n` +
    `5. Follow security best practices\n\n` +
    `Output:\n` +
    `- Configuration files\n` +
    `- Pipeline code\n` +
    `- Brief setup instructions`
  );
};

/**
 * SQL Worker - Real Implementation
 */
export const sqlWorkerSkill: SkillHandler = async (args, context) => {
  const task = args.task as string;
  
  return executeWorkerTask(
    task,
    "SQL",
    context,
    `You are a SQL specialist. Your task is to:\n` +
    `1. Write optimized SQL queries\n` +
    `2. Consider indexing implications\n` +
    `3. Use window functions where appropriate\n` +
    `4. Handle NULL values properly\n` +
    `5. Follow SQL best practices\n\n` +
    `Output:\n` +
    `- SQL query\n` +
    `- Explanation of optimization`
  );
};

/**
 * API Worker - Real Implementation
 */
export const apiWorkerSkill: SkillHandler = async (args, context) => {
  const task = args.task as string;
  
  return executeWorkerTask(
    task,
    "API Design",
    context,
    `You are an API design specialist. Your task is to:\n` +
    `1. Design RESTful APIs following best practices\n` +
    `2. Use OpenAPI/Swagger for documentation\n` +
    `3. Handle errors consistently\n` +
    `4. Consider authentication and authorization\n` +
    `5. Version APIs appropriately\n\n` +
    `Output:\n` +
    `- API endpoint definitions\n` +
    `- Request/response schemas`
  );
};

/**
 * Test Worker - Real Implementation
 */
export const testWorkerSkill: SkillHandler = async (args, context) => {
  const task = args.task as string;
  
  return executeWorkerTask(
    task,
    "Testing",
    context,
    `You are a testing specialist. Your task is to:\n` +
    `1. Write comprehensive unit tests\n` +
    `2. Add integration tests\n` +
    `3. Mock external dependencies\n` +
    `4. Aim for good coverage\n` +
    `5. Use test doubles appropriately\n\n` +
    `Output:\n` +
    `- Test code\n` +
    `- Test setup code`
  );
};

/**
 * Web Research Worker - Real Implementation
 */
export const webResearchSkill: SkillHandler = async (args, context) => {
  const task = args.task as string;
  
  return executeWorkerTask(
    task,
    "Web Research",
    context,
    `You are a web research specialist. Your task is to:\n` +
    `1. Search the web for relevant information\n` +
    `2. Evaluate source credibility\n` +
    `3. Synthesize findings\n` +
    `4. Cite sources properly\n` +
    `5. Present findings clearly\n\n` +
    `Output:\n` +
    `- Research summary\n` +
    `- Source citations`
  );
};
