/**
 * Orchestrate Skill - Multi-Agent Orchestration for 0xKobold
 * 
 * Adapted from the community orchestrate skill for 0xKobold's agent types:
 * - coordinator: Breaking down complex requests, managing workflows
 * - specialist: Implementation tasks, code generation
 * - researcher: Exploring codebases, finding patterns
 * - planner: Design phase, creating implementation plans
 * - reviewer: Final review before merging changes
 * 
 * Strategies:
 * - Research Swarm: Knowledge gathering (10-60+ agents)
 * - Epic Parallel Build: Independent features (20-60+ agents)
 * - Sequential Pipeline: Dependent tasks (3-15 agents)
 * - Parallel Sweep: Same fix across modules (4-10 agents)
 * - Multi-Dimensional Audit: Quality gates (6-9 agents)
 * - Full Lifecycle: Greenfield projects (all above)
 * 
 * This skill analyzes tasks and plans orchestration. Use agent_orchestrate
 * tool to actually dispatch agents.
 */

import { Skill } from '../types';

// Agent types in our registry
type AgentType = 'coordinator' | 'specialist' | 'researcher' | 'planner' | 'reviewer';

// Orchestration strategies
type Strategy = 
  | 'research_swarm' 
  | 'epic_parallel_build' 
  | 'sequential_pipeline' 
  | 'parallel_sweep' 
  | 'multi_dimensional_audit' 
  | 'full_lifecycle';

interface OrchestrationPlan {
  strategy: Strategy;
  reason: string;
  agents: AgentDeployment[];
  estimatedAgents: number;
  backgroundPercentage: number;
  phases: Phase[];
}

interface AgentDeployment {
  type: AgentType;
  task: string;
  capabilities: string[];
  scope?: string;
  background: boolean;
}

interface Phase {
  name: string;
  agents: AgentDeployment[];
  dependencies?: string[];
}

export const orchestrate: Skill = {
  name: 'orchestrate',
  description: 'Orchestrate multi-agent work at scale - research swarms, parallel feature builds, wave-based dispatch, build-review-fix pipelines, or any task requiring 3+ agents. Use for swarm, parallel agents, multi-agent, orchestrate, fan-out, wave dispatch, research army, unleash, dispatch agents, or parallel work.',
  risk: 'medium',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'orchestrate',
      description: 'Plan multi-agent orchestration strategies. Returns a plan that can be executed with agent_orchestrate.',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['analyze', 'plan', 'strategies'],
            description: 'Operation: analyze (determine best strategy), plan (create execution plan), strategies (list all strategies)'
          },
          task: {
            type: 'string',
            description: 'The task to orchestrate'
          },
          strategy: {
            type: 'string',
            enum: ['research_swarm', 'epic_parallel_build', 'sequential_pipeline', 'parallel_sweep', 'multi_dimensional_audit', 'full_lifecycle', 'auto'],
            description: 'Orchestration strategy to use (default: auto)'
          },
          agentCount: {
            type: 'number',
            description: 'Number of agents to deploy (default: auto)'
          }
        },
        required: ['operation']
      }
    }
  },

  async execute(args) {
    const { operation, task, strategy = 'auto', agentCount } = args as {
      operation: string;
      task?: string;
      strategy?: string;
      agentCount?: number;
    };

    try {
      switch (operation) {
        case 'analyze':
          if (!task) {
            return { success: false, error: 'Task required for analyze operation' };
          }
          return analyzeTask(task);
        
        case 'plan':
          if (!task) {
            return { success: false, error: 'Task required for plan operation' };
          }
          return planOrchestration(task, strategy, agentCount);
        
        case 'strategies':
          return {
            success: true,
            strategies: {
              research_swarm: {
                description: 'Knowledge gathering with 10-60+ research agents',
                when: 'Research, docs, SOTA, technology evaluation',
                agents: '10-60+',
                background: '100%'
              },
              epic_parallel_build: {
                description: 'Independent features with 20-60+ build agents',
                when: 'Implementation plan with 10+ independent tasks',
                agents: '20-60+',
                background: '90%+'
              },
              sequential_pipeline: {
                description: 'Dependent tasks one at a time with review gates',
                when: 'Tasks modify shared files, integration work',
                agents: '3-15',
                background: '0%'
              },
              parallel_sweep: {
                description: 'Same transformation across modules',
                when: 'Lint fixes, type annotations, test writing',
                agents: '4-10',
                background: '0%'
              },
              multi_dimensional_audit: {
                description: 'Multiple review perspectives simultaneously',
                when: 'Quality gates, security audit, pre-release',
                agents: '6-9',
                background: '0%'
              },
              full_lifecycle: {
                description: 'Research → Build → Review → Harden',
                when: 'Greenfield projects, new from scratch',
                agents: 'All above',
                background: 'Mixed'
              }
            }
          };
        
        default:
          return {
            success: false,
            error: `Unknown operation: ${operation}. Use: analyze, plan, or strategies`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
};

/**
 * Analyze a task to determine the best orchestration strategy
 */
function analyzeTask(task: string): { success: boolean; analysis: Record<string, unknown> } {
  const analysis = {
    task,
    characteristics: [] as string[],
    recommendedStrategy: 'sequential_pipeline' as Strategy,
    estimatedAgents: 1,
    backgroundPercentage: 0,
    reasoning: '',
    agentTypes: [] as AgentType[]
  };

  const taskLower = task.toLowerCase();

  // Detect research tasks
  if (taskLower.includes('research') || taskLower.includes('investigate') || 
      taskLower.includes('explore') || taskLower.includes('analyze') ||
      taskLower.includes('documentation') || taskLower.includes('docs')) {
    analysis.characteristics.push('research/knowledge gathering');
    analysis.recommendedStrategy = 'research_swarm';
    analysis.estimatedAgents = 10;
    analysis.backgroundPercentage = 100;
    analysis.agentTypes = ['researcher'];
    analysis.reasoning = 'Research tasks benefit from parallel knowledge gathering with researcher agents';
  }

  // Detect independent features
  if (taskLower.includes('implement') && (taskLower.includes('multiple') || taskLower.includes('several') || taskLower.includes('features'))) {
    analysis.characteristics.push('independent features');
    analysis.recommendedStrategy = 'epic_parallel_build';
    analysis.estimatedAgents = 20;
    analysis.backgroundPercentage = 90;
    analysis.agentTypes = ['specialist', 'planner'];
    analysis.reasoning = 'Independent features can be built in parallel with specialist agents';
  }

  // Detect sequential dependencies
  if (taskLower.includes('pipeline') || taskLower.includes('chain') || 
      taskLower.includes('sequence') || taskLower.includes('dependency')) {
    analysis.characteristics.push('sequential dependencies');
    analysis.recommendedStrategy = 'sequential_pipeline';
    analysis.estimatedAgents = 5;
    analysis.backgroundPercentage = 0;
    analysis.agentTypes = ['specialist', 'reviewer'];
    analysis.reasoning = 'Tasks with dependencies need sequential execution with review gates';
  }

  // Detect codebase-wide changes
  if (taskLower.includes('across all') || taskLower.includes('every module') ||
      taskLower.includes('refactor') && taskLower.includes('all')) {
    analysis.characteristics.push('codebase-wide transformation');
    analysis.recommendedStrategy = 'parallel_sweep';
    analysis.estimatedAgents = 6;
    analysis.backgroundPercentage = 0;
    analysis.agentTypes = ['specialist'];
    analysis.reasoning = 'Same transformation across modules can be parallelized';
  }

  // Detect audit/review
  if (taskLower.includes('audit') || taskLower.includes('review') || 
      taskLower.includes('assess') || taskLower.includes('quality gate')) {
    analysis.characteristics.push('audit/review');
    analysis.recommendedStrategy = 'multi_dimensional_audit';
    analysis.estimatedAgents = 6;
    analysis.backgroundPercentage = 0;
    analysis.agentTypes = ['reviewer'];
    analysis.reasoning = 'Audits benefit from multiple review perspectives with reviewer agents';
  }

  // Detect greenfield project
  if (taskLower.includes('new project') || taskLower.includes('from scratch') ||
      taskLower.includes('greenfield') || taskLower.includes('build a')) {
    analysis.characteristics.push('greenfield project');
    analysis.recommendedStrategy = 'full_lifecycle';
    analysis.estimatedAgents = 30;
    analysis.backgroundPercentage = 50;
    analysis.agentTypes = ['coordinator', 'researcher', 'planner', 'specialist', 'reviewer'];
    analysis.reasoning = 'Greenfield projects go through all phases: research → build → review → harden';
  }

  // Default: simple delegation
  if (analysis.estimatedAgents === 1) {
    analysis.agentTypes = ['specialist'];
    analysis.reasoning = 'Single agent can handle this task';
  }

  return {
    success: true,
    analysis
  };
}

/**
 * Plan orchestration strategy
 */
function planOrchestration(
  task: string, 
  strategy: string, 
  agentCount?: number
): { success: boolean; plan: OrchestrationPlan; instructions: string } {
  
  const { analysis } = analyzeTask(task);
  const selectedStrategy = (strategy === 'auto' 
    ? (analysis as any).recommendedStrategy 
    : strategy) as Strategy;
  
  const count = agentCount || (analysis as any).estimatedAgents || 5;
  
  const plan: OrchestrationPlan = {
    strategy: selectedStrategy,
    reason: (analysis as any).reasoning,
    agents: [],
    estimatedAgents: count,
    backgroundPercentage: (analysis as any).backgroundPercentage,
    phases: []
  };

  // Build phases based on strategy
  switch (selectedStrategy) {
    case 'research_swarm':
      plan.phases = [
        {
          name: 'Phase 1: Core Research',
          agents: generateResearchAgents(task, Math.floor(count * 0.5)),
          dependencies: []
        },
        {
          name: 'Phase 2: Specialized Topics',
          agents: generateResearchAgents(task, Math.floor(count * 0.3)),
          dependencies: ['Phase 1']
        },
        {
          name: 'Phase 3: Gap Filling',
          agents: generateResearchAgents(task, Math.floor(count * 0.2)),
          dependencies: ['Phase 1', 'Phase 2']
        }
      ];
      break;

    case 'epic_parallel_build':
      plan.phases = [
        {
          name: 'Phase 0: Scout',
          agents: [{ type: 'researcher', task: `Map codebase for: ${task}`, capabilities: ['coding', 'exploration'], background: false }],
          dependencies: []
        },
        {
          name: 'Phase 1: Infrastructure',
          agents: generateBuildAgents(task, Math.floor(count * 0.3), 'infrastructure'),
          dependencies: ['Phase 0']
        },
        {
          name: 'Phase 2: Features',
          agents: generateBuildAgents(task, Math.floor(count * 0.4), 'features'),
          dependencies: ['Phase 1']
        },
        {
          name: 'Phase 3: Integration',
          agents: generateBuildAgents(task, Math.floor(count * 0.3), 'integration'),
          dependencies: ['Phase 2']
        }
      ];
      break;

    case 'sequential_pipeline':
      plan.phases = [
        { name: 'Implement', agents: [{ type: 'specialist', task, capabilities: ['coding'], background: false }], dependencies: [] },
        { name: 'Review', agents: [{ type: 'reviewer', task: `Review: ${task}`, capabilities: ['code-review'], background: false }], dependencies: ['Implement'] },
        { name: 'Fix', agents: [{ type: 'specialist', task: `Address review findings for: ${task}`, capabilities: ['coding'], background: false }], dependencies: ['Review'] }
      ];
      break;

    case 'parallel_sweep':
      plan.phases = [
        { name: 'Analyze Scope', agents: [{ type: 'researcher', task: `Analyze scope for: ${task}`, capabilities: ['exploration'], background: false }], dependencies: [] },
        { name: 'Fix Wave', agents: generateFixAgents(task, count), dependencies: ['Analyze Scope'] }
      ];
      break;

    case 'multi_dimensional_audit':
      plan.phases = [
        { name: 'Code Quality', agents: [{ type: 'reviewer', task: `Code quality audit: ${task}`, capabilities: ['code-review', 'quality-assurance'], background: false }], dependencies: [] },
        { name: 'Integration', agents: [{ type: 'reviewer', task: `Integration audit: ${task}`, capabilities: ['code-review', 'integration'], background: false }], dependencies: [] },
        { name: 'Spec Completeness', agents: [{ type: 'reviewer', task: `Spec completeness audit: ${task}`, capabilities: ['code-review', 'specification'], background: false }], dependencies: [] },
        { name: 'Test Coverage', agents: [{ type: 'specialist', task: `Test coverage audit: ${task}`, capabilities: ['testing', 'quality-assurance'], background: false }], dependencies: [] },
        { name: 'Performance', agents: [{ type: 'researcher', task: `Performance audit: ${task}`, capabilities: ['performance', 'analysis'], background: false }], dependencies: [] },
        { name: 'Security', agents: [{ type: 'reviewer', task: `Security audit: ${task}`, capabilities: ['security-review'], background: false }], dependencies: [] }
      ];
      break;

    case 'full_lifecycle':
      plan.phases = [
        { name: 'Research', agents: generateResearchAgents(task, Math.floor(count * 0.3)), dependencies: [] },
        { name: 'Plan', agents: [{ type: 'planner', task: `Design architecture for: ${task}`, capabilities: ['planning', 'architecture-design'], background: false }], dependencies: ['Research'] },
        { name: 'Build', agents: generateBuildAgents(task, Math.floor(count * 0.4), 'all'), dependencies: ['Plan'] },
        { name: 'Review', agents: [{ type: 'reviewer', task: `Comprehensive review: ${task}`, capabilities: ['code-review', 'quality-assurance'], background: false }], dependencies: ['Build'] },
        { name: 'Harden', agents: [{ type: 'specialist', task: `Security and performance hardening: ${task}`, capabilities: ['security', 'performance'], background: false }], dependencies: ['Review'] }
      ];
      break;
  }

  const instructions = generateExecutionInstructions(plan);

  return {
    success: true,
    plan,
    instructions
  };
}

/**
 * Generate execution instructions for the agent
 */
function generateExecutionInstructions(plan: OrchestrationPlan): string {
  const lines: string[] = [
    `# Orchestration Plan: ${plan.strategy}`,
    '',
    `**Reason:** ${plan.reason}`,
    `**Estimated Agents:** ${plan.estimatedAgents}`,
    `**Background:** ${plan.backgroundPercentage}%`,
    '',
    '## Phases',
    ''
  ];

  for (const phase of plan.phases) {
    lines.push(`### ${phase.name}`);
    if (phase.dependencies && phase.dependencies.length > 0) {
      lines.push(`**Dependencies:** ${phase.dependencies.join(', ')}`);
    }
    lines.push('');
    lines.push('**Agents to dispatch:**');
    for (const agent of phase.agents) {
      lines.push(`- \`${agent.type}\`: "${agent.task}" (${agent.background ? 'background' : 'foreground'})`);
    }
    lines.push('');
  }

  lines.push('## How to Execute');
  lines.push('');
  lines.push('Use `agent_orchestrate` tool for each agent:');
  lines.push('');
  lines.push('```');
  lines.push('agent_orchestrate({');
  lines.push('  operation: "delegate",');
  lines.push('  task: "<task description>",');
  lines.push('  strategy: "<simple|medium|complex>"');
  lines.push('})');
  lines.push('```');
  lines.push('');
  lines.push('For parallel agents, dispatch multiple calls concurrently.');
  lines.push('For sequential agents, wait for each to complete before dispatching next.');

  return lines.join('\n');
}

// Helper functions

function generateResearchAgents(task: string, count: number): AgentDeployment[] {
  const agents: AgentDeployment[] = [];
  const topics = ['core functionality', 'integration patterns', 'best practices', 'performance', 'security', 'testing', 'deployment', 'monitoring', 'error handling', 'edge cases'];
  
  for (let i = 0; i < count; i++) {
    const topic = topics[i % topics.length];
    agents.push({
      type: 'researcher',
      task: `Research ${topic} for: ${task}`,
      capabilities: ['research', 'documentation', 'search'],
      background: true
    });
  }
  return agents;
}

function generateBuildAgents(task: string, count: number, scope: string): AgentDeployment[] {
  const agents: AgentDeployment[] = [];
  const scopes = scope === 'all' 
    ? ['infrastructure', 'backend', 'frontend', 'integrations', 'devops']
    : [scope];
  
  for (let i = 0; i < count; i++) {
    const agentScope = scopes[i % scopes.length];
    agents.push({
      type: 'specialist',
      task: `Build ${agentScope} component for: ${task}`,
      capabilities: ['coding', 'implementation'],
      scope: agentScope,
      background: true
    });
  }
  return agents;
}

function generateFixAgents(task: string, count: number): AgentDeployment[] {
  const agents: AgentDeployment[] = [];
  const modules = ['core', 'api', 'ui', 'utils', 'testing'];
  
  for (let i = 0; i < count; i++) {
    agents.push({
      type: 'specialist',
      task: `Fix issues in ${modules[i % modules.length]} for: ${task}`,
      capabilities: ['coding', 'bug-fixing'],
      scope: modules[i % modules.length],
      background: false
    });
  }
  return agents;
}

export default orchestrate;