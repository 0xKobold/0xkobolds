/**
 * Approval Queue
 *
 * Human-in-the-loop for risky skill execution.
 * Console-based approval for MVP, web dashboard later.
 */

import * as readline from 'readline';
import type { RiskLevel } from '../skills/types';

export interface ApprovalRequest {
  id: string;
  skill: string;
  description: string;
  args: Record<string, unknown>;
  risk: RiskLevel;
  agentId?: string;
  timestamp: Date;
}

export type ApprovalHandler = (request: ApprovalRequest) => Promise<boolean>;

export interface ApprovalQueue {
  request(params: {
    skill: string;
    description: string;
    args: Record<string, unknown>;
    risk: RiskLevel;
    agentId?: string;
  }): Promise<boolean>;
  setHandler(handler: ApprovalHandler): void;
}

/**
 * Console-based approval handler
 */
export async function consoleApprovalHandler(request: ApprovalRequest): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const argsStr = JSON.stringify(request.args, null, 2);

  console.log('\n' + '='.repeat(60));
  console.log('🔒 APPROVAL REQUESTED');
  console.log('='.repeat(60));
  console.log(`Skill:     ${request.skill}`);
  console.log(`Risk:      ${request.risk.toUpperCase()}`);
  console.log(`Agent:     ${request.agentId ?? 'main'}`);
  console.log(`Time:      ${request.timestamp.toLocaleTimeString()}`);
  console.log('-'.repeat(60));
  console.log('Arguments:');
  console.log(argsStr);
  console.log('-'.repeat(60));

  return new Promise((resolve) => {
    rl.question('Approve? [y/N/details]: ', (answer) => {
      rl.close();

      const normalized = answer.trim().toLowerCase();

      if (normalized === 'details' || normalized === 'd') {
        console.log('\nDetails:');
        console.log(`Description: ${request.description}`);
        console.log(`Request ID: ${request.id}`);
        // Re-prompt
        return consoleApprovalHandler(request).then(resolve);
      }

      const approved = normalized === 'y' || normalized === 'yes';

      if (approved) {
        console.log('✅ Approved');
      } else {
        console.log('❌ Denied');
      }
      console.log('='.repeat(60) + '\n');

      resolve(approved);
    });
  });
}

/**
 * Auto-approval handler (for testing or trusted environments)
 */
export function createAutoApprovalHandler(
  allowList: string[] = [],
  denyList: string[] = [],
  logOnly = false
): ApprovalHandler {
  return async (request: ApprovalRequest) => {
    // Check deny list
    if (denyList.includes(request.skill)) {
      console.log(`[Approval] Auto-denied: ${request.skill} (in deny list)`);
      return false;
    }

    // Check allow list
    if (allowList.length > 0 && !allowList.includes(request.skill)) {
      console.log(`[Approval] Auto-denied: ${request.skill} (not in allow list)`);
      return false;
    }

    // Log only mode
    if (logOnly) {
      console.log(`[Approval] Auto-approved: ${request.skill} (log only)`);
      return true;
    }

    // Auto-approve safe skills
    if (request.risk === 'safe') {
      return true;
    }

    // Fall back to console for risky skills
    return consoleApprovalHandler(request);
  };
}

/**
 * Create approval queue
 */
export function createApprovalQueue(handler?: ApprovalHandler): ApprovalQueue {
  const pending = new Map<string, ApprovalRequest>();
  let defaultHandler = handler ?? consoleApprovalHandler;

  return {
    async request(params) {
      const request: ApprovalRequest = {
        id: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        skill: params.skill,
        description: params.description,
        args: params.args,
        risk: params.risk,
        agentId: params.agentId,
        timestamp: new Date(),
      };

      pending.set(request.id, request);

      try {
        const approved = await defaultHandler(request);
        return approved;
      } finally {
        pending.delete(request.id);
      }
    },

    setHandler(handler) {
      defaultHandler = handler;
    },
  };
}

/**
 * Global approval queue instance
 */
export const defaultApprovalQueue = createApprovalQueue();
