/**
 * System Monitor Skill - 0xKobold System Health & Diagnostics
 * 
 * Monitor and diagnose all 0xKobold subsystems:
 * - Agent Body (sensors, health, mood)
 * - Gateway (connections, agents)
 * - Delivery (message queue)
 * - Cron (scheduled jobs)
 * - Memory (Perennial usage, sessions)
 * - Mission Control (dashboard status)
 * 
 * Usage:
 *   "How's my system doing?"
 *   "Check gateway health"
 *   "Why is my agent slow?"
 *   "Show system metrics"
 *   "Restart the gateway"
 */

import { Skill } from '../types';

export const systemMonitor: Skill = {
  name: 'systemMonitor',
  description: 'Monitor 0xKobold system health - check Agent Body, gateway, delivery, cron, memory, and run diagnostics. Use for health checks, troubleshooting, metrics, and system overview.',
  risk: 'safe',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'systemMonitor',
      description: 'Monitor and diagnose 0xKobold system health',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['status', 'health', 'diagnose', 'metrics', 'logs', 'action'],
            description: 'Operation to perform'
          },
          target: {
            type: 'string',
            enum: ['all', 'body', 'gateway', 'delivery', 'cron', 'memory', 'mission-control'],
            description: 'System to check (default: all)'
          },
          query: {
            type: 'string',
            description: 'Natural language query (e.g., "why is my agent slow?")'
          },
          action: {
            type: 'string',
            enum: ['restart', 'check', 'refresh', 'cleanup'],
            description: 'Action to perform (for operation=action)'
          }
        },
        required: ['operation']
      }
    }
  },

  async execute(args) {
    const { operation, target = 'all', query, action } = args as {
      operation: string;
      target?: string;
      query?: string;
      action?: string;
    };

    try {
      switch (operation) {
        case 'status':
          return await getSystemStatus(target);
        
        case 'health':
          return await getSystemHealth(target);
        
        case 'diagnose':
          return await diagnoseIssue(query || 'general');
        
        case 'metrics':
          return await getSystemMetrics(target);
        
        case 'logs':
          return await getRecentLogs(target);
        
        case 'action':
          return await performSystemAction(action!, target);
        
        default:
          return {
            success: false,
            error: `Unknown operation: ${operation}`
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
 * Get system status overview
 */
async function getSystemStatus(target: string) {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  const results: Record<string, any> = {};

  // Check Agent Body
  if (target === 'all' || target === 'body') {
    try {
      const { stdout } = await execAsync('bun run src/cli/index.ts body health --json 2>/dev/null');
      results.body = JSON.parse(stdout);
    } catch {
      results.body = { status: 'unavailable' };
    }
  }

  // Check Gateway
  if (target === 'all' || target === 'gateway') {
    try {
      const response = await fetch('http://localhost:7777/status');
      results.gateway = await response.json();
    } catch {
      results.gateway = { status: 'unavailable' };
    }
  }

  // Check Mission Control
  if (target === 'all' || target === 'mission-control') {
    try {
      const response = await fetch('http://localhost:5173/api/stats');
      results.missionControl = await response.json();
    } catch {
      results.missionControl = { status: 'unavailable' };
    }
  }

  // Check Memory (Perennial)
  if (target === 'all' || target === 'memory') {
    try {
      const { stdout } = await execAsync('bun run src/cli/index.ts memory stats --json 2>/dev/null');
      results.memory = JSON.parse(stdout);
    } catch {
      results.memory = { status: 'unavailable' };
    }
  }

  return {
    success: true,
    data: results,
    summary: generateStatusSummary(results)
  };
}

/**
 * Get detailed health information
 */
async function getSystemHealth(target: string) {
  const health: Array<{ system: string; healthy: boolean; issues: string[] }> = [];

  // Agent Body health
  if (target === 'all' || target === 'body') {
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync('bun run src/cli/index.ts body health --json 2>/dev/null');
      const bodyHealth = JSON.parse(stdout) as { healthy: boolean; issues?: string[] };
      
      health.push({
        system: 'Agent Body',
        healthy: bodyHealth.healthy,
        issues: bodyHealth.issues || []
      });
    } catch {
      health.push({
        system: 'Agent Body',
        healthy: false,
        issues: ['Not initialized']
      });
    }
  }

  // Gateway health
  if (target === 'all' || target === 'gateway') {
    try {
      const response = await fetch('http://localhost:7777/health');
      const gatewayHealth = await response.json() as { healthy?: boolean; issues?: string[] };
      
      health.push({
        system: 'Gateway',
        healthy: gatewayHealth.healthy ?? false,
        issues: gatewayHealth.issues || []
      });
    } catch {
      health.push({
        system: 'Gateway',
        healthy: false,
        issues: ['Not responding']
      });
    }
  }

  return {
    success: true,
    health,
    overallHealthy: health.every(h => h.healthy)
  };
}

/**
 * Diagnose a specific issue
 */
async function diagnoseIssue(query: string) {
  const diagnosis: Array<{ symptom: string; possibleCauses: string[]; recommendations: string[] }> = [];

  // Analyze query for common issues
  if (query.includes('slow') || query.includes('lag')) {
    diagnosis.push({
      symptom: 'System running slow',
      possibleCauses: [
        'High CPU load',
        'Memory pressure',
        'Too many active agents',
        'Gateway connection issues'
      ],
      recommendations: [
        'Check Agent Body metrics',
        'Review active agent count',
        'Consider memory cleanup',
        'Check gateway connection quality'
      ]
    });
  }

  if (query.includes('memory') || query.includes('ram')) {
    diagnosis.push({
      symptom: 'Memory issues',
      possibleCauses: [
        'High memory usage (>80%)',
        'Session accumulation',
        'Memory not decaying'
      ],
      recommendations: [
        'Run memory decay job',
        'Clean up old sessions',
        'Check Perennial storage'
      ]
    });
  }

  if (query.includes('gateway') || query.includes('connection')) {
    diagnosis.push({
      symptom: 'Gateway issues',
      possibleCauses: [
        'Gateway not running',
        'Port conflict',
        'WebSocket disconnection'
      ],
      recommendations: [
        'Restart gateway',
        'Check port 7777',
        'Review gateway logs'
      ]
    });
  }

  return {
    success: true,
    diagnosis,
    query
  };
}

/**
 * Get system metrics
 */
async function getSystemMetrics(target: string) {
  const metrics: Record<string, any> = {};

  // Agent Body metrics
  if (target === 'all' || target === 'body') {
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync('bun run src/cli/index.ts body state --json 2>/dev/null');
      metrics.body = JSON.parse(stdout);
    } catch {
      metrics.body = null;
    }
  }

  // Mission Control metrics
  if (target === 'all' || target === 'mission-control') {
    try {
      const response = await fetch('http://localhost:5173/api/metrics');
      metrics.missionControl = await response.json();
    } catch {
      metrics.missionControl = null;
    }
  }

  return {
    success: true,
    metrics
  };
}

/**
 * Get recent logs
 */
async function getRecentLogs(target: string) {
  const logs: Array<{ timestamp: string; level: string; message: string }> = [];

  // This would integrate with existing logging system
  // For now, return placeholder
  logs.push({
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'Log retrieval not yet implemented'
  });

  return {
    success: true,
    logs,
    target
  };
}

/**
 * Perform system action
 */
async function performSystemAction(action: string, target: string) {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  switch (action) {
    case 'restart':
      if (target === 'gateway') {
        await execAsync('bun run src/cli/index.ts gateway restart 2>/dev/null');
        return { success: true, message: 'Gateway restart initiated' };
      }
      break;
    
    case 'cleanup':
      if (target === 'memory') {
        await execAsync('bun run src/cli/index.ts memory cleanup 2>/dev/null');
        return { success: true, message: 'Memory cleanup initiated' };
      }
      break;
    
    case 'check':
      return {
        success: true,
        message: `Checked ${target}`,
        result: await getSystemHealth(target)
      };
  }

  return {
    success: false,
    error: `Unknown action: ${action} for ${target}`
  };
}

/**
 * Generate human-readable summary
 */
function generateStatusSummary(results: Record<string, any>): string {
  const parts: string[] = [];

  if (results.body?.healthy) {
    parts.push('🫀 Agent Body: Healthy');
  } else if (results.body) {
    parts.push('⚠️ Agent Body: Issues');
  }

  if (results.gateway?.status === 'ok') {
    parts.push('🌐 Gateway: Connected');
  } else if (results.gateway) {
    parts.push('❌ Gateway: Disconnected');
  }

  if (results.missionControl?.status === 'ok') {
    parts.push('📊 Mission Control: Running');
  } else if (results.missionControl) {
    parts.push('⚠️ Mission Control: Issues');
  }

  if (results.memory?.status === 'ok') {
    parts.push('🧠 Memory: OK');
  } else if (results.memory) {
    parts.push('⚠️ Memory: Issues');
  }

  return parts.join(' | ');
}

export default systemMonitor;