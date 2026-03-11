/**
 * 🔍 Kobold Scan Skill
 *
 * Security vulnerability scanner for 0xKobold projects.
 * Scans code for secrets, vulnerabilities, and anti-patterns.
 *
 * This is a wrapper around the kobold-scan tool from
 * https://git.kobolds.run/kobolds/kobold-scan-skill
 */

import { Skill } from '../src/skills/types';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

export const koboldScan: Skill = {
  name: 'koboldScan',
  description: 'Security vulnerability scanner for JavaScript, Node.js, and Solidity codebases. Detects hardcoded secrets, SQL injection, path traversal, eval usage, and smart contract vulnerabilities.',
  risk: 'safe',

  toolDefinition: {
    type: 'function',
    function: {
      name: 'koboldScan',
      description: 'Scan code for security vulnerabilities and anti-patterns. Detects secrets, injection vulnerabilities, and Solidity issues.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to directory or file to scan (relative to workspace)'
          },
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
            description: 'Minimum severity level to report'
          },
          format: {
            type: 'string',
            enum: ['terminal', 'json', 'markdown'],
            description: 'Output format'
          }
        },
        required: ['path']
      }
    }
  },

  async execute(args: { path: string; severity?: string; format?: string }) {
    const scanPath = resolve(args.path);
    
    if (!existsSync(scanPath)) {
      return {
        success: false,
        error: `Path not found: ${args.path}`
      };
    }

    const severity = args.severity || 'low';
    const format = args.format || 'json';

    try {
      // Check if kobold-scan is available
      const cmd = `cd /home/moika/Documents/code/0xKobolds/skills/kobold-scan-skill && node index.js scan "${scanPath}" --severity ${severity} --format ${format}`;
      const result = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
      
      if (format === 'json') {
        const parsed = JSON.parse(result);
        return {
          success: true,
          data: parsed,
          summary: `${parsed.summary?.filesScanned || 0} files scanned, ${parsed.summary?.issuesFound || 0} issues found`
        };
      }

      return {
        success: true,
        data: result
      };
    } catch (error: any) {
      // Scanner exits with code 1 if issues found, but still outputs valid result
      if (error.stdout) {
        try {
          if (format === 'json') {
            const parsed = JSON.parse(error.stdout);
            return {
              success: true,
              data: parsed,
              summary: `${parsed.summary?.filesScanned || 0} files scanned, ${parsed.summary?.issuesFound || 0} issues found`,
              issues: parsed.vulnerabilities
            };
          }
          return { success: true, data: error.stdout };
        } catch {
          return { success: true, data: error.stdout };
        }
      }
      
      return {
        success: false,
        error: `Scan failed: ${error.message}`
      };
    }
  }
};

export default koboldScan;
