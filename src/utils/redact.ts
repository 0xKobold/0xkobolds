/**
 * Secret Redaction Utilities
 * 
 * Detects and redacts sensitive values in config objects, strings, and command output.
 */

/** Patterns that indicate a secret field name */
const SECRET_KEY_PATTERNS = [
  /token/i,
  /password/i,
  /secret/i,
  /key/i,
  /api[_-]?key/i,
  /auth/i,
  /credential/i,
  /private/i,
  /webhook[_-]?url/i,
];

/** Environment variable names that contain secrets */
const SECRET_ENV_VARS = [
  'DISCORD_BOT_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'LLM_API_KEY',
  'KOBOLD_REMOTE_TOKEN',
  'KOBOLD_API_KEY',
  'SOPS_AGE_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'GITHUB_TOKEN',
  'GITLAB_TOKEN',
  'SLACK_TOKEN',
  'STRIPE_SECRET_KEY',
  'JWT_SECRET',
  'SESSION_SECRET',
  'COOKIE_SECRET',
];

/**
 * Check if a key looks like it could be a secret
 */
export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * Check if an environment variable name is a secret
 */
export function isSecretEnvVar(name: string): boolean {
  return SECRET_ENV_VARS.some(secret => 
    name.toUpperCase() === secret || 
    name.toUpperCase().startsWith(secret + '_')
  );
}

/**
 * Redact a secret value, showing only a hint of its structure
 * 
 * @param value - The value to redact
 * @param visibleChars - Number of chars to show at start/end (default: 4)
 * @returns Redacted string like "sk-aB***x9" or "<redacted>"
 */
export function redactValue(value: string, visibleChars = 4): string {
  if (!value || value.length <= visibleChars * 2) {
    return '<redacted>';
  }
  
  const start = value.slice(0, visibleChars);
  const end = value.slice(-visibleChars);
  const middleLength = value.length - (visibleChars * 2);
  return `${start}${'*'.repeat(Math.min(middleLength, 8))}${end}`;
}

/**
 * Redact secrets in an object by traversing and matching keys
 * 
 * @param obj - Object that may contain secrets
 * @param redactAll - If true, redacts all string values that look like secrets (tokens, keys, etc.)
 * @returns New object with secrets redacted
 */
export function redactSecrets<T extends Record<string, any>>(
  obj: T, 
  redactAll = true
): T {
  const result = JSON.parse(JSON.stringify(obj)) as T;
  
  function traverse(current: any, key?: string) {
    if (typeof current === 'string') {
      // Check if this is a secret value
      if (key && isSecretKey(key)) {
        return redactValue(current, 4);
      }
      // Check if it's a token-like value (starts with common prefixes)
      if (redactAll && looksLikeToken(current)) {
        return redactValue(current, 4);
      }
      return current;
    }
    
    if (Array.isArray(current)) {
      return current.map((item, index) => traverse(item, `${key}[${index}]`));
    }
    
    if (current && typeof current === 'object') {
      const redacted: any = {};
      for (const [k, v] of Object.entries(current)) {
        redacted[k] = traverse(v, k);
      }
      return redacted;
    }
    
    return current;
  }
  
  return traverse(result);
}

/**
 * Check if a string value looks like a token/API key
 */
function looksLikeToken(value: string): boolean {
  // Common token prefixes
  const tokenPrefixes = [
    'sk-',           // OpenAI, Stripe
    'pk_',           // Stripe publishable
    'sk_',           // Stripe secret
    'ghp_',          // GitHub personal
    'gho_',          // GitHub OAuth
    'xoxb-',         // Slack bot
    'xoxp-',         // Slack user
    'bot',           // Discord bot
    'eyJ',           // JWT (base64)
    'Bearer ',       // Bearer token
    'Basic ',        // Basic auth
  ];
  
  if (value.length < 20) return false;
  
  return tokenPrefixes.some(prefix => 
    value.startsWith(prefix) || 
    value.includes(prefix)
  ) || /^[a-f0-9]{32,}$/i.test(value); // Hex token
}

/**
 * Format a value for display with optional secret redaction
 */
export function formatValueSafe(value: unknown, options?: {
  redactSecrets?: boolean;
  secretKeys?: string[];
  parentKey?: string;
}): string {
  const { redactSecrets = true, secretKeys = [], parentKey = '' } = options || {};
  
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  
  if (typeof value === "string") {
    // Check if this is a secret based on key name or value pattern
    if (redactSecrets) {
      const isSecret = secretKeys.some(k => parentKey.includes(k)) || 
                       isSecretKey(parentKey) ||
                       looksLikeToken(value);
      
      if (isSecret) {
        return `"${redactValue(value, 4)}"`;
      }
    }
    return `"${value}"`;
  }
  
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  
  return JSON.stringify(redactSecrets ? redactSecretsInObject(value) : value, null, 2);
}

/**
 * Deep redact secrets in any object
 */
function redactSecretsInObject(obj: any): any {
  if (typeof obj === 'string') {
    return looksLikeToken(obj) ? redactValue(obj, 4) : obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(redactSecretsInObject);
  }
  
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (isSecretKey(key) && typeof value === 'string') {
        result[key] = redactValue(value, 4);
      } else {
        result[key] = redactSecretsInObject(value);
      }
    }
    return result;
  }
  
  return obj;
}

/**
 * Redact secrets in environment variable strings
 * Useful for .env file content
 */
export function redactEnvContent(content: string): string {
  return content.split('\n').map(line => {
    // Match KEY=VALUE patterns
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return line;
    
    const [, key, value] = match;
    
    // Skip empty values or comments
    if (!value || value.startsWith('#')) return line;
    
    // Check if this is a secret
    if (isSecretEnvVar(key) || isSecretKey(key)) {
      return `${key}=${redactValue(value.replace(/^["']|["']$/g, ''), 4)}`;
    }
    
    return line;
  }).join('\n');
}

/**
 * Get a list of common secret keys for documentation/help
 */
export function getSecretKeyPatterns(): string[] {
  return [
    '*token*',
    '*password*',
    '*secret*',
    '*api*key*',
    '*auth*',
    '*credential*',
    '*private*',
    '*webhook*url*',
    '...and values starting with: sk-, pk_, ghp_, xoxb-, eyJ'
  ];
}
