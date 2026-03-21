/**
 * skill_hub - Browse, search, install, and update skills from external registries
 * 
 * Sources:
 * - official: Skills bundled with 0xKobold
 * - skills-sh: Vercel's skills.sh directory
 * - github: Direct GitHub repo installs
 * - well-known: URL-based discovery from /.well-known/skills/
 * 
 * Commands:
 * - browse: List available skills
 * - search: Search for skills by query
 * - inspect: Preview skill before installing
 * - install: Install skill with security scan
 * - check: Check installed skills for updates
 * - update: Update skills with upstream changes
 * - audit: Re-scan all skills for security
 * - uninstall: Remove a hub skill
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

export interface SkillHubParams {
  action: 'browse' | 'search' | 'inspect' | 'install' | 'check' | 'update' | 'audit' | 'uninstall' | 'list';
  query?: string;
  skill?: string;
  source?: 'official' | 'skills-sh' | 'github' | 'well-known' | 'clawhub' | 'lobehub' | 'claude-marketplace';
  force?: boolean;
}

export interface SkillHubResult {
  success: boolean;
  action: string;
  skills?: SkillInfo[];
  skill?: string;
  message: string;
  details?: Record<string, any>;
}

export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  category: string;
  source: string;
  path?: string;
  installed?: boolean;
  upstream_version?: string;
  has_update?: boolean;
  metadata?: Record<string, any>;
}

interface LockEntry {
  name: string;
  source: string;
  version: string;
  installed_at: string;
  upstream_url?: string;
  hash?: string;
}

const KOBOLD_HOME = process.env.KOBOLD_HOME || process.env.KOBOLD_WORKSPACE || path.join(process.env.HOME || '', '.0xkobold');
const SKILLS_DIR = path.join(KOBOLD_HOME, 'skills');
const HUB_DIR = path.join(SKILLS_DIR, '.hub');
const LOCK_FILE = path.join(HUB_DIR, 'lock.json');
const AUDIT_FILE = path.join(HUB_DIR, 'audit.log');

const SOURCES: Record<string, { url: string; trust: string }> = {
  official: {
    url: 'https://raw.githubusercontent.com/moikapy/0xkobold-skills/main/index.json',
    trust: 'builtin',
  },
  'skills-sh': {
    url: 'https://skills.sh/api/skills',
    trust: 'community',
  },
  github: {
    url: 'https://api.github.com/repos',
    trust: 'community',
  },
  'well-known': {
    url: '',
    trust: 'varies',
  },
  clawhub: {
    url: 'https://clawhub.ai/api/skills',
    trust: 'community',
  },
  lobehub: {
    url: 'https://chat-agents.lobehub.com/api/skills',
    trust: 'community',
  },
  'claude-marketplace': {
    url: 'https://marketplace.anthropic.com/api/skills',
    trust: 'community',
  },
};

// Security patterns to check
const SECURITY_PATTERNS = {
  dangerous: [
    /rm\s+-rf\s+\//gi,
    /:\(\)\s*\{\s*:\|:\s*&\s*\};/gi,  // Fork bomb
    /curl.*\|\s*(ba)?sh/gi,
    /wget.*\|\s*(ba)?sh/gi,
    /eval\s*\(/gi,
    /exec\s*\(/gi,
    /process\.exit/gi,
    /fs\.rmSync\s*\(\s*['"]\/['"]/gi,
  ],
  caution: [
    /API_KEY|SECRET|PASSWORD|TOKEN/gi,
    /curl|wget|fetch/gi,
    /child_process|exec|spawn/gi,
    /fs\.(write|rm|unlink)/gi,
    /[a-zA-Z0-9_-]{32,}/gi,  // Potential secrets
  ],
  exfiltration: [
    /https?:\/\/[^\s]+/gi,
    /fetch\s*\(/gi,
    /axios|request|http\.get/gi,
  ],
};

function loadLock(): { version: string; installed: Record<string, LockEntry>; sources: Record<string, any> } {
  if (!fs.existsSync(LOCK_FILE)) {
    return { version: '1.0.0', installed: {}, sources: SOURCES };
  }
  return JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
}

function saveLock(lock: ReturnType<typeof loadLock>): void {
  fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2), 'utf-8');
}

function logAudit(action: string, skill: string, source: string, result: string, details?: string): void {
  const timestamp = new Date().toISOString();
  const detailStr = details ? ` | ${details}` : '';
  const line = `${timestamp} | ${action} | ${skill} | ${source} | ${result}${detailStr}\n`;
  fs.appendFileSync(AUDIT_FILE, line, 'utf-8');
}

async function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (location) {
          fetchUrl(location).then(resolve).catch(reject);
          return;
        }
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function scanForSecurity(content: string): { level: 'safe' | 'caution' | 'dangerous'; findings: string[] } {
  const findings: string[] = [];
  let level: 'safe' | 'caution' | 'dangerous' = 'safe';

  // Check for dangerous patterns
  for (const pattern of SECURITY_PATTERNS.dangerous) {
    const matches = content.match(pattern);
    if (matches) {
      level = 'dangerous';
      findings.push(`Dangerous pattern: ${pattern.source}`);
    }
  }

  // Check for caution patterns
  if (level !== 'dangerous') {
    for (const pattern of SECURITY_PATTERNS.caution) {
      const matches = content.match(pattern);
      if (matches) {
        level = 'caution';
        findings.push(`Caution: Found ${pattern.source.substring(0, 20)}`);
      }
    }
  }

  // Check for exfiltration
  for (const pattern of SECURITY_PATTERNS.exfiltration) {
    const matches = content.match(pattern);
    if (matches && matches.length > 3) {
      if (level === 'safe') level = 'caution';
      findings.push(`Potential data exfiltration: ${matches.length} URLs detected`);
    }
  }

  return { level, findings };
}

async function browseSkills(params: SkillHubParams): Promise<SkillHubResult> {
  const lock = loadLock();
  const skills: SkillInfo[] = [];

  // Get installed skills from lock
  for (const [name, entry] of Object.entries(lock.installed)) {
    skills.push({
      name,
      description: `Installed from ${entry.source}`,
      version: entry.version,
      category: 'installed',
      source: entry.source,
      installed: true,
    });
  }

  // If source specified, fetch from that source
  if (params.source && SOURCES[params.source]) {
    try {
      const sourceUrl = SOURCES[params.source].url;
      const data = await fetchUrl(sourceUrl);
      const parsed = JSON.parse(data);
      
      for (const skill of parsed.skills || []) {
        const existing = lock.installed[skill.name];
        skills.push({
          name: skill.name,
          description: skill.description || '',
          version: skill.version || '1.0.0',
          category: skill.category || 'community',
          source: params.source,
          installed: !!existing,
          upstream_version: skill.version,
          has_update: existing && existing.version !== skill.version,
        });
      }
    } catch (error) {
      return {
        success: false,
        action: 'browse',
        message: `Failed to fetch from ${params.source}: ${error}`,
      };
    }
  }

  return {
    success: true,
    action: 'browse',
    skills,
    message: `Found ${skills.length} skills`,
  };
}

async function searchSkills(params: SkillHubParams): Promise<SkillHubResult> {
  if (!params.query) {
    return {
      success: false,
      action: 'search',
      message: 'search requires a query',
    };
  }

  const lock = loadLock();
  const skills: SkillInfo[] = [];
  const query = params.query.toLowerCase();

  // Search installed skills
  for (const [name, entry] of Object.entries(lock.installed)) {
    if (name.toLowerCase().includes(query)) {
      skills.push({
        name,
        description: `Installed from ${entry.source}`,
        version: entry.version,
        category: 'installed',
        source: entry.source,
        installed: true,
      });
    }
  }

  // Search external sources if specified or default
  const sourcesToSearch = params.source ? [params.source] : Object.keys(SOURCES);

  for (const source of sourcesToSearch) {
    try {
      const data = await fetchUrl(SOURCES[source].url);
      const parsed = JSON.parse(data);

      for (const skill of parsed.skills || []) {
        const name = skill.name?.toLowerCase() || '';
        const desc = skill.description?.toLowerCase() || '';
        const tags = (skill.tags || []).join(' ').toLowerCase();

        if (name.includes(query) || desc.includes(query) || tags.includes(query)) {
          const existing = lock.installed[skill.name];
          skills.push({
            name: skill.name,
            description: skill.description || '',
            version: skill.version || '1.0.0',
            category: skill.category || 'community',
            source,
            installed: !!existing,
            has_update: existing && existing.version !== skill.version,
          });
        }
      }
    } catch (error) {
      // Continue searching other sources
      console.error(`Search error from ${source}:`, error);
    }
  }

  return {
    success: true,
    action: 'search',
    skills,
    message: `Found ${skills.length} matching skills`,
  };
}

async function inspectSkill(params: SkillHubParams): Promise<SkillHubResult> {
  if (!params.skill) {
    return {
      success: false,
      action: 'inspect',
      message: 'inspect requires a skill name',
    };
  }

  const lock = loadLock();

  // Check if installed
  if (lock.installed[params.skill]) {
    const entry = lock.installed[params.skill];
    const skillPath = findSkillPath(params.skill);
    
    if (skillPath && fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const scan = scanForSecurity(content);

      return {
        success: true,
        action: 'inspect',
        skill: params.skill,
        message: `Skill '${params.skill}' is installed`,
        details: {
          name: params.skill,
          source: entry.source,
          version: entry.version,
          installed_at: entry.installed_at,
          path: skillPath,
          security_level: scan.level,
          security_findings: scan.findings,
          content_preview: content.substring(0, 1000),
        },
      };
    }
  }

  // Fetch from source for preview
  if (params.source && SOURCES[params.source]) {
    try {
      const sourceUrl = params.source === 'github'
        ? `https://raw.githubusercontent.com/${params.skill}/main/SKILL.md`
        : `${SOURCES[params.source].url}/${params.skill}`;

      const content = await fetchUrl(sourceUrl);
      const scan = scanForSecurity(content);

      logAudit('inspect', params.skill, params.source, 'preview');

      return {
        success: true,
        action: 'inspect',
        skill: params.skill,
        message: `Preview of '${params.skill}' from ${params.source}`,
        details: {
          name: params.skill,
          source: params.source,
          security_level: scan.level,
          security_findings: scan.findings,
          content_preview: content.substring(0, 1000),
        },
      };
    } catch (error) {
      return {
        success: false,
        action: 'inspect',
        skill: params.skill,
        message: `Failed to fetch skill from ${params.source}: ${error}`,
      };
    }
  }

  return {
    success: false,
    action: 'inspect',
    skill: params.skill,
    message: `Skill '${params.skill}' not found. Specify a source.`,
  };
}

async function installSkill(params: SkillHubParams): Promise<SkillHubResult> {
  if (!params.skill) {
    return {
      success: false,
      action: 'install',
      message: 'install requires a skill name',
    };
  }

  const lock = loadLock();

  // Skip if already installed unless force
  if (lock.installed[params.skill] && !params.force) {
    return {
      success: false,
      action: 'install',
      skill: params.skill,
      message: `Skill '${params.skill}' already installed. Use --force to reinstall.`,
    };
  }

  // Determine source
  const source = params.source || 'skills-sh';
  
  if (!SOURCES[source]) {
    return {
      success: false,
      action: 'install',
      skill: params.skill,
      message: `Unknown source: ${source}`,
    };
  }

  try {
    // Fetch skill content
    const skillUrl = source === 'github'
      ? `https://raw.githubusercontent.com/${params.skill}/main/SKILL.md`
      : `${SOURCES[source].url}/${params.skill}/download`;

    const content = await fetchUrl(skillUrl);

    // Security scan
    const scan = scanForSecurity(content);

    if (scan.level === 'dangerous' && !params.force) {
      logAudit('install', params.skill, source, 'blocked', scan.findings.join('; '));
      return {
        success: false,
        action: 'install',
        skill: params.skill,
        message: `Security: Dangerous patterns detected. Use --force to override.\n${scan.findings.join('\n')}`,
      };
    }

    // Check for caution patterns
    if (scan.level === 'caution' && !params.force && SOURCES[source].trust !== 'builtin') {
      logAudit('install', params.skill, source, 'caution', scan.findings.join('; '));
      // Continue but warn
    }

    // Parse skill metadata
    const parsed = parseSkillMd(content);

    // Determine destination
    const category = parsed.category || 'community';
    const skillDir = path.join(SKILLS_DIR, category, params.skill.replace(/\//g, '-'));
    const skillPath = path.join(skillDir, 'SKILL.md');

    // Create directory
    fs.mkdirSync(skillDir, { recursive: true });

    // Write skill
    fs.writeFileSync(skillPath, content, 'utf-8');

    // Update lock
    lock.installed[params.skill] = {
      name: params.skill,
      source,
      version: parsed.version || '1.0.0',
      installed_at: new Date().toISOString(),
      upstream_url: skillUrl,
      hash: hashContent(content),
    };
    saveLock(lock);

    logAudit('install', params.skill, source, 'success');

    return {
      success: true,
      action: 'install',
      skill: params.skill,
      message: `Installed '${params.skill}' from ${source}`,
      details: {
        name: params.skill,
        version: parsed.version || '1.0.0',
        description: parsed.description || '',
        category,
        security_level: scan.level,
        path: skillPath,
      },
    };
  } catch (error) {
    logAudit('install', params.skill, source, 'error', String(error));
    return {
      success: false,
      action: 'install',
      skill: params.skill,
      message: `Failed to install: ${error}`,
    };
  }
}

async function checkSkills(params: SkillHubParams): Promise<SkillHubResult> {
  const lock = loadLock();
  const updates: SkillInfo[] = [];

  for (const [name, entry] of Object.entries(lock.installed)) {
    try {
      const sourceUrl = entry.upstream_url || 
        (SOURCES[entry.source]?.url ? `${SOURCES[entry.source].url}/${name}` : null);

      if (!sourceUrl) continue;

      const upstreamContent = await fetchUrl(sourceUrl);
      const upstreamHash = hashContent(upstreamContent);

      if (upstreamHash !== entry.hash) {
        updates.push({
          name,
          description: 'Update available',
          category: 'installed',
          version: entry.version,
          source: entry.source,
          installed: true,
          has_update: true,
        });
      }
    } catch (error) {
      // Skip on error
    }
  }

  return {
    success: true,
    action: 'check',
    skills: updates,
    message: updates.length > 0 ? `${updates.length} skill(s) have updates` : 'All skills are up to date',
  };
}

async function updateSkills(params: SkillHubParams): Promise<SkillHubResult> {
  if (params.skill) {
    // Update single skill
    return installSkill({ ...params, action: 'install', force: true });
  }

  // Update all skills with updates
  const checkResult = await checkSkills(params);
  if (!checkResult.success || !checkResult.skills?.length) {
    return checkResult;
  }

  const results: string[] = [];
  for (const skill of checkResult.skills) {
    const result = await installSkill({ 
      skill: skill.name, 
      source: skill.source as any,
      force: true,
      action: 'install',
    });
    results.push(`${skill.name}: ${result.message}`);
  }

  return {
    success: true,
    action: 'update',
    message: `Updated ${checkResult.skills.length} skill(s)`,
    details: { updates: results },
  };
}

async function auditSkills(params: SkillHubParams): Promise<SkillHubResult> {
  const lock = loadLock();
  const issues: { skill: string; level: string; findings: string[] }[] = [];

  for (const [name, entry] of Object.entries(lock.installed)) {
    const skillPath = findSkillPath(name);
    if (!skillPath || !fs.existsSync(skillPath)) continue;

    const content = fs.readFileSync(skillPath, 'utf-8');
    const scan = scanForSecurity(content);

    if (scan.level !== 'safe') {
      issues.push({
        skill: name,
        level: scan.level,
        findings: scan.findings,
      });
      logAudit('audit', name, entry.source, scan.level, scan.findings.join('; '));
    }
  }

  return {
    success: true,
    action: 'audit',
    message: issues.length > 0 ? `Found ${issues.length} skill(s) with security concerns` : 'All skills passed security scan',
    details: { issues },
  };
}

async function uninstallSkill(params: SkillHubParams): Promise<SkillHubResult> {
  if (!params.skill) {
    return {
      success: false,
      action: 'uninstall',
      message: 'uninstall requires a skill name',
    };
  }

  const lock = loadLock();

  if (!lock.installed[params.skill]) {
    return {
      success: false,
      action: 'uninstall',
      skill: params.skill,
      message: `Skill '${params.skill}' is not installed`,
    };
  }

  const skillDir = findSkillDir(params.skill);
  if (skillDir) {
    fs.rmSync(skillDir, { recursive: true, force: true });
  }

  delete lock.installed[params.skill];
  saveLock(lock);

  logAudit('uninstall', params.skill, 'local', 'success');

  return {
    success: true,
    action: 'uninstall',
    skill: params.skill,
    message: `Uninstalled '${params.skill}'`,
  };
}

async function listSkills(params: SkillHubParams): Promise<SkillHubResult> {
  const lock = loadLock();
  const skills: SkillInfo[] = [];

  // List skills from directory
  const categories = fs.readdirSync(SKILLS_DIR).filter(f =>
    fs.statSync(path.join(SKILLS_DIR, f)).isDirectory() && f !== '.hub'
  );

  for (const category of categories) {
    const categoryPath = path.join(SKILLS_DIR, category);
    const skillsInCategory = fs.readdirSync(categoryPath).filter(f =>
      fs.statSync(path.join(categoryPath, f)).isDirectory()
    );

    for (const skillName of skillsInCategory) {
      const skillPath = path.join(categoryPath, skillName, 'SKILL.md');
      if (fs.existsSync(skillPath)) {
        const installed = lock.installed[skillName];
        skills.push({
          name: skillName,
          description: installed ? `From ${installed.source}` : 'local',
          version: installed?.version || 'local',
          category,
          source: installed?.source || 'local',
          installed: true,
        });
      }
    }
  }

  return {
    success: true,
    action: 'list',
    skills,
    message: `Found ${skills.length} installed skills`,
  };
}

function findSkillPath(name: string): string | null {
  const categories = fs.readdirSync(SKILLS_DIR).filter(f =>
    fs.statSync(path.join(SKILLS_DIR, f)).isDirectory() && f !== '.hub'
  );

  for (const category of categories) {
    const skillPath = path.join(SKILLS_DIR, category, name, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      return skillPath;
    }
  }

  const directPath = path.join(SKILLS_DIR, name, 'SKILL.md');
  return fs.existsSync(directPath) ? directPath : null;
}

function findSkillDir(name: string): string | null {
  const skillPath = findSkillPath(name);
  return skillPath ? path.dirname(skillPath) : null;
}

function parseSkillMd(content: string): Record<string, any> {
  const result: Record<string, any> = {};

  // Extract frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    // Simple YAML parsing
    const lines = fm.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        result[match[1]] = match[2];
      }
    }
  }

  // Extract description from content
  const descMatch = content.match(/^#\.*$/m);
  if (descMatch) {
    result.description = descMatch[1];
  }

  return result;
}

function hashContent(content: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

export async function skillHub(params: SkillHubParams): Promise<SkillHubResult> {
  // Ensure directories exist
  if (!fs.existsSync(HUB_DIR)) {
    fs.mkdirSync(HUB_DIR, { recursive: true });
  }

  switch (params.action) {
    case 'browse':
      return browseSkills(params);
    case 'search':
      return searchSkills(params);
    case 'inspect':
      return inspectSkill(params);
    case 'install':
      return installSkill(params);
    case 'check':
      return checkSkills(params);
    case 'update':
      return updateSkills(params);
    case 'audit':
      return auditSkills(params);
    case 'uninstall':
      return uninstallSkill(params);
    case 'list':
      return listSkills(params);
    default:
      return {
        success: false,
        action: params.action,
        message: `Unknown action: ${params.action}`,
      };
  }
}

// Export for CLI usage
export const skillHubTool = {
  name: 'skill_hub',
  description: 'Browse, search, install, and manage skills from external registries',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['browse', 'search', 'inspect', 'install', 'check', 'update', 'audit', 'uninstall', 'list'],
        description: 'Action to perform',
      },
      query: { type: 'string', description: 'Search query' },
      skill: { type: 'string', description: 'Skill name or identifier' },
      source: {
        type: 'string',
        enum: ['official', 'skills-sh', 'github', 'well-known', 'clawhub', 'lobehub', 'claude-marketplace'],
        description: 'Source registry',
      },
      force: { type: 'boolean', description: 'Override security warnings' },
    },
    required: ['action'],
  },
  execute: skillHub,
};