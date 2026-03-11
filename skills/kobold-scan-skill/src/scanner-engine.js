const fs = require('fs');
const path = require('path');

const SolidityScanner = require('./scanners/solidity');
const JavaScriptScanner = require('./scanners/javascript');
const GeneralScanner = require('./scanners/general');

class ScannerEngine {
  constructor(config) {
    this.config = config;
    this.scanners = {
      '.sol': new SolidityScanner(config),
      '.js': new JavaScriptScanner(config),
      '.ts': new JavaScriptScanner(config),
      '.jsx': new JavaScriptScanner(config),
      '.tsx': new JavaScriptScanner(config),
      'general': new GeneralScanner(config)
    };
    this.supportedExts = new Set(['.sol', '.js', '.ts', '.jsx', '.tsx']);
  }

  async scan(targetPath) {
    const vulnerabilities = [];
    let filesScanned = 0;

    // Resolve to absolute path
    const resolvedPath = path.resolve(targetPath);
    
    // Determine if path is file or directory
    const stats = fs.statSync(resolvedPath);
    
    if (stats.isFile()) {
      const result = await this.scanFile(resolvedPath);
      if (result.length > 0) {
        vulnerabilities.push(...result);
      }
      filesScanned = 1;
    } else {
      // Recursively find files
      const files = this.findFiles(resolvedPath);

      for (const file of files) {
        const result = await this.scanFile(file);
        if (result.length > 0) {
          vulnerabilities.push(...result);
        }
        filesScanned++;
      }
    }

    return {
      vulnerabilities,
      filesScanned,
      timestamp: new Date().toISOString(),
      config: this.config
    };
  }

  shouldIgnore(fullPath) {
    const basename = path.basename(fullPath);
    
    return this.config.exclude.some(pattern => {
      // Simple pattern matching
      if (pattern.includes('node_modules')) {
        return fullPath.includes('node_modules');
      }
      if (pattern.includes('.git')) {
        return fullPath.includes('.git');
      }
      if (pattern.includes('build')) {
        return basename === 'build' || fullPath.includes('/build/');
      }
      if (pattern.includes('dist')) {
        return basename === 'dist' || fullPath.includes('/dist/');
      }
      return false;
    });
  }

  findFiles(dir) {
    const files = [];
    
    const traverse = (currentDir) => {
      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          
          if (this.shouldIgnore(fullPath)) {
            continue;
          }
          
          if (entry.isDirectory()) {
            traverse(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (this.supportedExts.has(ext)) {
              files.push(fullPath);
            }
          }
        }
      } catch (err) {
        // Ignore permission errors
      }
    };
    
    traverse(dir);
    return files;
  }

  async scanFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let content;
    
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      return []; // Skip files we can't read
    }
    
    const vulnerabilities = [];

    // Run language-specific scanner
    const scanner = this.scanners[ext];
    if (scanner) {
      const results = scanner.scan(content, filePath);
      vulnerabilities.push(...results);
    }

    // Always run general scanner
    const generalResults = this.scanners.general.scan(content, filePath);
    vulnerabilities.push(...generalResults);

    return vulnerabilities;
  }
}

module.exports = ScannerEngine;
