/**
 * Auto Security Scan Extension
 *
 * Automatically scans files for vulnerabilities when they're written.
 * Provides security feedback without blocking the agent.
 */

import { eventBus } from '../event-bus/index.js';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const KOBOLD_SCAN_PATH = '/home/moika/Documents/code/0xKobolds/skills/kobold-scan-skill';

export function initAutoSecurityScan() {
  console.log('[AutoScan] Initializing automatic security scanning...');
  
  // Listen for file write events
  eventBus.on('file.written', async (event: any) => {
    const filePath = event.payload?.path;
    if (!filePath) return;
    
    // Only scan JS/TS/Solidity files
    if (!/\.(js|ts|sol|jsx|tsx)$/.test(filePath)) return;
    
    console.log(`[AutoScan] Scanning ${filePath}...`);
    
    try {
      const cmd = `cd ${KOBOLD_SCAN_PATH} && node index.js scan "${filePath}" --severity medium --format json`;
      const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
      const parsed = JSON.parse(result);
      
      if (parsed.vulnerabilities?.length > 0) {
        // Emit security warning event
        eventBus.emit('security.issues_found', {
          file: filePath,
          issues: parsed.vulnerabilities,
          summary: `${parsed.vulnerabilities.length} security issues found`
        });
        
        console.log(`[AutoScan] ⚠️ Found ${parsed.vulnerabilities.length} issues in ${filePath}`);
      }
    } catch (err) {
      // Ignore scan errors (file might not exist yet)
    }
  });
  
  console.log('[AutoScan] Active - scanning JS/TS/SOL files on write');
}
