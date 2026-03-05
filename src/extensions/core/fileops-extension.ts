/**
 * File Operations Extension for 0xKobold
 *
 * Provides file system operations as pi-coding-agent tools
 * Ported and enhanced from core/tools.ts
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { $ } from 'bun';
import { join, resolve as pathResolve, dirname } from 'path';
import {
  existsSync,
  statSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'fs';
import { readFile, writeFile as writeFileAsync } from 'fs/promises';
import { glob } from 'glob';
import {
  getWorkingDir,
  resolvePath,
  validatePathWithinWorkspace,
  getRelativePath,
} from '../../utils/working-dir.js';

// Security configuration
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
const SHELL_TIMEOUT_DEFAULT = 30000; // 30 seconds

// Dangerous shell commands to block
const DANGEROUS_COMMANDS = [
  'rm -rf /',
  'dd if=',
  'mkfs.',
  ':(){ :|:& };:', // fork bomb
  'curl.*|.*sh', // pipe curl to shell
  'wget.*|.*sh', // pipe wget to shell
  'curl.*|.*bash',
  'wget.*|.*bash',
  '> /dev/',
  '/dev/null;',
  'chmod 000',
  'chmod -R 000',
];

/**
 * Validate path - delegates to shared utility with extension-specific error handling
 */
function validatePath(inputPath: string): { valid: boolean; error?: string; resolvedPath: string } {
  const result = validatePathWithinWorkspace(inputPath);
  if (result.valid) {
    return { valid: true, resolvedPath: result.resolvedPath };
  }
  return { valid: false, error: result.error, resolvedPath: result.resolvedPath };
}

/**
 * Check if command is safe to execute
 */
function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  const lowerCommand = command.toLowerCase();

  for (const pattern of DANGEROUS_COMMANDS) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(lowerCommand)) {
      return { safe: false, reason: `Command matches dangerous pattern: ${pattern}` };
    }
  }

  return { safe: true };
}

/**
 * File Operations Extension
 */
export default function fileOpsExtension(pi: ExtensionAPI) {
  /**
   * Tool: read_file_with_line_numbers
   * Read file with line numbers for context
   */
  pi.registerTool({
    name: 'read_file_with_line_numbers',
    description:
      'Read the contents of a file with line numbers prepended. Useful for viewing code with context. Max file size 1MB.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to read',
        },
        offset: {
          type: 'number',
          description: 'Line number to start reading from (0-indexed, default: 0)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read (default: read all)',
        },
      },
      required: ['path'],
    },
    async execute(args) {
      try {
        const filePath = String(args.path);
        const offset = typeof args.offset === 'number' ? args.offset : 0;
        const limit = typeof args.limit === 'number' ? args.limit : undefined;

        // Validate path
        const pathCheck = validatePath(filePath);
        if (!pathCheck.valid) {
          return {
            content: [{ type: 'text', text: `Path validation failed: ${pathCheck.error}` }],
            details: { error: pathCheck.error },
          };
        }

        const resolvedPath = pathCheck.resolvedPath;

        // Check if file exists
        if (!existsSync(resolvedPath)) {
          return {
            content: [{ type: 'text', text: `File not found: ${filePath}` }],
            details: { error: 'file_not_found' },
          };
        }

        const stats = statSync(resolvedPath);

        // Check if it's a directory
        if (stats.isDirectory()) {
          return {
            content: [{ type: 'text', text: `Path is a directory: ${filePath}` }],
            details: { error: 'is_directory' },
          };
        }

        // Check file size
        if (stats.size > MAX_FILE_SIZE) {
          return {
            content: [
              {
                type: 'text',
                text: `File too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Max size is 1MB. Use offset and limit parameters.`,
              },
            ],
            details: { error: 'file_too_large', size: stats.size },
          };
        }

        // Read file content
        const content = await readFile(resolvedPath, 'utf-8');
        const lines = content.split('\n');
        const endLine = limit ? Math.min(offset + limit, lines.length) : lines.length;
        const selectedLines = lines.slice(offset, endLine);

        // Prepend line numbers (1-indexed for human readability)
        const numberedLines = selectedLines.map((line, idx) => {
          const lineNumber = offset + idx + 1;
          const padding = String(endLine).length;
          return `${String(lineNumber).padStart(padding, ' ')} | ${line}`;
        });

        const result = numberedLines.join('\n');

        return {
          content: [
            { type: 'text', text: `File: ${filePath} (${lines.length} lines)` },
            { type: 'text', text: result },
          ],
          details: {
            path: filePath,
            size: stats.size,
            totalLines: lines.length,
            displayedLines: selectedLines.length,
            startLine: offset + 1,
            endLine,
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error reading file: ${error}` }],
          details: { error: String(error) },
        };
      }
    },
  });

  /**
   * Tool: write_file
   * Write content to a file
   */
  pi.registerTool({
    name: 'write_file',
    description:
      'Write content to a file at the specified path. Creates directories if needed. Can append to existing files.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
        append: {
          type: 'boolean',
          description: 'If true, append to existing file instead of overwriting (default: false)',
        },
      },
      required: ['path', 'content'],
    },
    async execute(args) {
      try {
        const filePath = String(args.path);
        const content = String(args.content);
        const append = args.append === true;

        // Validate path
        const pathCheck = validatePath(filePath);
        if (!pathCheck.valid) {
          return {
            content: [{ type: 'text', text: `Path validation failed: ${pathCheck.error}` }],
            details: { error: pathCheck.error },
          };
        }

        const resolvedPath = pathCheck.resolvedPath;
        const dir = dirname(resolvedPath);

        // Create directory if needed
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        // Write or append file
        if (append && existsSync(resolvedPath)) {
          const existing = await readFile(resolvedPath, 'utf-8');
          await writeFileAsync(resolvedPath, existing + content, 'utf-8');
        } else {
          await writeFileAsync(resolvedPath, content, 'utf-8');
        }

        const bytes = Buffer.byteLength(content, 'utf-8');

        return {
          content: [
            {
              type: 'text',
              text: `Successfully ${append ? 'appended to' : 'wrote'} file: ${filePath}`,
            },
          ],
          details: {
            path: filePath,
            bytes,
            append,
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error writing file: ${error}` }],
          details: { error: String(error) },
        };
      }
    },
  });

  /**
   * Tool: list_directory
   * List directory contents
   */
  pi.registerTool({
    name: 'list_directory',
    description:
      'List the contents of a directory. Shows file and folder icons. Can optionally recurse into subdirectories.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The path to the directory to list',
        },
        recursive: {
          type: 'boolean',
          description: 'If true, recursively list all subdirectories (default: false)',
        },
      },
      required: ['path'],
    },
    async execute(args) {
      try {
        const dirPath = String(args.path);
        const recursive = args.recursive === true;

        // Validate path
        const pathCheck = validatePath(dirPath);
        if (!pathCheck.valid) {
          return {
            content: [{ type: 'text', text: `Path validation failed: ${pathCheck.error}` }],
            details: { error: pathCheck.error },
          };
        }

        const resolvedPath = pathCheck.resolvedPath;

        // Check if directory exists
        if (!existsSync(resolvedPath)) {
          return {
            content: [{ type: 'text', text: `Directory not found: ${dirPath}` }],
            details: { error: 'directory_not_found' },
          };
        }

        const stats = statSync(resolvedPath);

        // Check if it's actually a directory
        if (!stats.isDirectory()) {
          return {
            content: [{ type: 'text', text: `Path is not a directory: ${dirPath}` }],
            details: { error: 'not_a_directory' },
          };
        }

        if (recursive) {
          const entries: string[] = [];

          function walk(dir: string, prefix = ''): void {
            const items = readdirSync(dir);
            for (const item of items) {
              // Skip hidden files/directories
              if (item.startsWith('.')) continue;

              const fullPath = join(dir, item);
              const relPath = prefix ? `${prefix}/${item}` : item;
              const itemStats = statSync(fullPath);
              entries.push(`${relPath}${itemStats.isDirectory() ? '/' : ''}`);

              if (itemStats.isDirectory()) {
                walk(fullPath, relPath);
              }
            }
          }

          walk(resolvedPath);

          return {
            content: [
              { type: 'text', text: `Directory: ${dirPath} (${entries.length} entries)` },
              { type: 'text', text: entries.join('\n') || '(empty)' },
            ],
            details: {
              path: dirPath,
              count: entries.length,
              recursive: true,
            },
          };
        } else {
          const items = readdirSync(resolvedPath);

          // Sort: directories first, then files
          const sorted = items
            .filter((item) => !item.startsWith('.'))
            .sort((a, b) => {
              const aPath = join(resolvedPath, a);
              const bPath = join(resolvedPath, b);
              const aIsDir = statSync(aPath).isDirectory();
              const bIsDir = statSync(bPath).isDirectory();

              if (aIsDir && !bIsDir) return -1;
              if (!aIsDir && bIsDir) return 1;
              return a.localeCompare(b);
            });

          const formatted = sorted
            .map((item) => {
              const fullPath = join(resolvedPath, item);
              const isDir = statSync(fullPath).isDirectory();
              return `${isDir ? '📁' : '📄'} ${item}${isDir ? '/' : ''}`;
            })
            .join('\n');

          return {
            content: [
              { type: 'text', text: `Directory: ${dirPath} (${sorted.length} items)` },
              { type: 'text', text: formatted || '(empty)' },
            ],
            details: {
              path: dirPath,
              count: sorted.length,
              recursive: false,
            },
          };
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error listing directory: ${error}` }],
          details: { error: String(error) },
        };
      }
    },
  });

  /**
   * Tool: search_files
   * Search for patterns in files
   */
  pi.registerTool({
    name: 'search_files',
    description:
      'Search for text patterns in files using glob patterns. Returns list of matching file paths.',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'The text pattern to search for (supports regex)',
        },
        path: {
          type: 'string',
          description: 'The directory path to search in',
        },
        glob: {
          type: 'string',
          description: 'Glob pattern for file matching (default: "**/*")',
        },
      },
      required: ['pattern', 'path'],
    },
    async execute(args) {
      try {
        const searchPattern = String(args.pattern);
        const searchPath = String(args.path);
        const globPattern = args.glob ? String(args.glob) : '**/*';

        // Validate path
        const pathCheck = validatePath(searchPath);
        if (!pathCheck.valid) {
          return {
            content: [{ type: 'text', text: `Path validation failed: ${pathCheck.error}` }],
            details: { error: pathCheck.error },
          };
        }

        const resolvedPath = pathCheck.resolvedPath;

        // Check if directory exists
        if (!existsSync(resolvedPath)) {
          return {
            content: [{ type: 'text', text: `Directory not found: ${searchPath}` }],
            details: { error: 'directory_not_found' },
          };
        }

        // Find files matching glob pattern
        const files = await glob(globPattern, {
          cwd: resolvedPath,
          absolute: true,
          nodir: true,
          ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
        });

        // Search for pattern in files
        const regex = new RegExp(searchPattern, 'i');
        const matches: Array<{ file: string; line: number; content: string }> = [];

        for (const file of files.slice(0, 100)) {
          // Limit to 100 files for performance
          try {
            const stats = statSync(file);
            if (stats.size > MAX_FILE_SIZE) continue;

            const content = await readFile(file, 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                matches.push({
                  file: file.replace(resolvedPath + '/', ''),
                  line: i + 1,
                  content: lines[i].trim().substring(0, 100),
                });
              }
            }
          } catch {
            // Skip files that can't be read
            continue;
          }
        }

        // Group matches by file
        const grouped = matches.reduce((acc, match) => {
          if (!acc[match.file]) acc[match.file] = [];
          acc[match.file].push(match);
          return acc;
        }, {} as Record<string, typeof matches>);

        const formatted = Object.entries(grouped)
          .map(([file, fileMatches]) => {
            const lines = fileMatches.map((m) => `  Line ${m.line}: ${m.content}`).join('\n');
            return `${file}\n${lines}`;
          })
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: `Found ${matches.length} matches in ${Object.keys(grouped).length} files`,
            },
            { type: 'text', text: formatted || 'No matches found' },
          ],
          details: {
            pattern: searchPattern,
            filesScanned: files.length,
            matchesFound: matches.length,
            uniqueFiles: Object.keys(grouped).length,
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error searching files: ${error}` }],
          details: { error: String(error) },
        };
      }
    },
  });

  /**
   * Tool: batch_edit
   * Edit multiple files matching a pattern
   */
  pi.registerTool({
    name: 'batch_edit',
    description:
      'Find and replace text across multiple files matching a glob pattern. Returns list of edited files.',
    parameters: {
      type: 'object',
      properties: {
        glob: {
          type: 'string',
          description: 'Glob pattern to match files (e.g., "**/*.ts")',
        },
        search: {
          type: 'string',
          description: 'The text to search for',
        },
        replace: {
          type: 'string',
          description: 'The replacement text',
        },
        regex: {
          type: 'boolean',
          description: 'If true, treat search as regex pattern (default: false)',
        },
      },
      required: ['glob', 'search', 'replace'],
    },
    async execute(args) {
      try {
        const globPattern = String(args.glob);
        const searchPattern = String(args.search);
        const replacement = String(args.replace);
        const useRegex = args.regex === true;

        // Validate glob pattern (prevent directory traversal in glob)
        if (globPattern.includes('..')) {
          return {
            content: [{ type: 'text', text: 'Invalid glob pattern: contains traversal sequence' }],
            details: { error: 'invalid_glob' },
          };
        }

        // Find matching files
        const files = await glob(globPattern, {
          absolute: true,
          nodir: true,
          ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
        });

        if (files.length === 0) {
          return {
            content: [{ type: 'text', text: 'No files matched the glob pattern' }],
            details: { filesMatched: 0 },
          };
        }

        const searchRegex = useRegex
          ? new RegExp(searchPattern, 'g')
          : new RegExp(escapeRegExp(searchPattern), 'g');

        const edited: string[] = [];
        const errors: string[] = [];

        for (const file of files) {
          try {
            // Check file size
            const stats = statSync(file);
            if (stats.size > MAX_FILE_SIZE) {
              errors.push(`${file}: File too large`);
              continue;
            }

            const content = await readFile(file, 'utf-8');

            if (searchRegex.test(content)) {
              // Reset regex lastIndex for replace
              searchRegex.lastIndex = 0;
              const newContent = content.replace(searchRegex, replacement);
              await writeFileAsync(file, newContent, 'utf-8');
              edited.push(file);
            }
          } catch (err) {
            errors.push(`${file}: ${err}`);
          }
        }

        const resultText = [
          `Edited ${edited.length} of ${files.length} files`,
          '',
          ...edited.map((f) => `  ✓ ${f}`),
          errors.length > 0 ? '' : '',
          ...(errors.length > 0 ? [`Errors (${errors.length}):`, ...errors.map((e) => `  ✗ ${e}`)] : []),
        ].join('\n');

        return {
          content: [{ type: 'text', text: resultText }],
          details: {
            filesMatched: files.length,
            filesEdited: edited.length,
            errors: errors.length,
            edited,
            errorList: errors,
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error in batch edit: ${error}` }],
          details: { error: String(error) },
        };
      }
    },
  });

  /**
   * Tool: shell
   * Execute shell command with safety checks
   */
  pi.registerTool({
    name: 'shell',
    description:
      'Execute a shell command using Bun. Returns command output. Has safety checks for dangerous commands.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command (default: current directory)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
      },
      required: ['command'],
    },
    async execute(args) {
      try {
        const command = String(args.command);
        const cwd = args.cwd ? String(args.cwd) : getWorkingDir();
        const timeout = typeof args.timeout === 'number' ? args.timeout : SHELL_TIMEOUT_DEFAULT;

        // Validate cwd
        const cwdCheck = validatePath(cwd);
        if (!cwdCheck.valid) {
          return {
            content: [{ type: 'text', text: `CWD validation failed: ${cwdCheck.error}` }],
            details: { error: cwdCheck.error },
          };
        }

        // Security check
        const safety = isCommandSafe(command);
        if (!safety.safe) {
          return {
            content: [{ type: 'text', text: `Command blocked: ${safety.reason}` }],
            details: { error: 'command_blocked', reason: safety.reason },
          };
        }

        // Execute command using Bun shell with working directory
        const result = await $`sh -c ${command}`.cwd(cwd).text();

        return {
          content: [
            { type: 'text', text: result || '(Command executed successfully with no output)' },
          ],
          details: {
            command,
            cwd,
            timeout,
          },
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Command failed: ${error}` }],
          details: { error: String(error), command: args.command },
        };
      }
    },
  });

  // Register status bar item
  // @ts-ignore ExtensionAPI property
  pi.registerStatusBarItem('fileops', {
    render() {
      return '📁 FileOps Ready';
    },
  });

  // Log initialization
  console.log('[FileOps] Extension loaded with 6 tools:');
  console.log('  - read_file_with_line_numbers');
  console.log('  - write_file');
  console.log('  - list_directory');
  console.log('  - search_files');
  console.log('  - batch_edit');
  console.log('  - shell');
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
