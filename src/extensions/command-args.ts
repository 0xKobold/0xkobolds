/**
 * Command argument parser for extension handlers
 * 
 * The framework passes args as a string, but we want parsed objects.
 * This parser converts string args to objects based on arg definitions.
 */

export interface ArgDef {
  name: string;
  description?: string;
  required?: boolean;
}

export type ParsedArgs = Record<string, string | undefined>;

/**
 * Parse command args string into an object based on arg definitions.
 * 
 * Simple parsing: first N words map to first N args, rest goes to last arg
 * 
 * Example:
 *   parseArgs("hello world description here", [
 *     { name: "title", required: true },
 *     { name: "description", required: false }
 *   ])
 *   // Returns: { title: "hello", description: "world description here" }
 */
export function parseArgs(argsString: string, argDefs: ArgDef[]): ParsedArgs {
  const result: ParsedArgs = {};
  
  if (!argsString.trim()) {
    // Return all undefined for empty args
    argDefs.forEach(def => {
      result[def.name] = undefined;
    });
    return result;
  }
  
  const parts = argsString.trim().split(/\s+/);
  const requiredCount = argDefs.filter(d => d.required).length;
  
  // Check we have at least required args
  if (parts.length < requiredCount) {
    // Not enough args - still map what we have
  }
  
  // Map parts to args
  // First N-1 required args get single words
  // Last arg gets all remaining words
  for (let i = 0; i < argDefs.length; i++) {
    const def = argDefs[i];
    
    if (i < parts.length) {
      if (i === argDefs.length - 1) {
        // Last arg gets all remaining words
        result[def.name] = parts.slice(i).join(' ');
      } else {
        result[def.name] = parts[i];
      }
    } else {
      result[def.name] = undefined;
    }
  }
  
  return result;
}

/**
 * Create a typed args parser for a specific command
 */
export function createParser<T extends ArgDef[]>(...defs: T) {
  return (argsString: string): ParsedArgs => parseArgs(argsString, defs);
}

// Common arg patterns
export const CommonArgs = {
  id: { name: "id", description: "Item ID", required: true },
  name: { name: "name", description: "Name", required: true },
  title: { name: "title", description: "Title", required: true },
  description: { name: "description", description: "Description", required: false },
  status: { name: "status", description: "Status", required: true },
} as const;