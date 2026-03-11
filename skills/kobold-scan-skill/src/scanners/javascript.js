class JavaScriptScanner {
  constructor(config) {
    this.config = config;
    this.exclusions = config.exclusions || {
      tokenNames: ['KOBOLDS', 'DRAKIN', 'TRIDENT', 'MLTL', 'WETH', 'USDC', 'ETH'],
      minSecretLength: 20, // Skip short strings (not real secrets)
      allowedInComments: true
    };
  }

  scan(content, filePath) {
    const vulnerabilities = [];
    const lines = content.split('\n');

    // Skip test/example files
    if (this.isTestFile(filePath)) {
      return [];
    }

    // Skip scanner rule files (they define patterns, not vulnerabilities)
    if (filePath.includes('/scanners/') || filePath.includes('/rules/')) {
      return [];
    }

    lines.forEach((line, index) => {
      // Skip comments (lines starting with //)
      if (this.isComment(line)) {
        return;
      }

      // JS-001: eval() usage
      this.checkEval(line, index, filePath, vulnerabilities);

      // JS-002: Hardcoded secrets (with exclusions)
      this.checkSecrets(line, index, filePath, vulnerabilities);

      // JS-004: SQL injection
      this.checkSQLInjection(line, index, filePath, vulnerabilities);

      // JS-005: Path traversal
      this.checkPathTraversal(line, index, filePath, vulnerabilities);

      // JS-007: console.log
      this.checkConsoleLog(line, index, filePath, vulnerabilities);

      // JS-006: Prototype pollution
      this.checkPrototypePollution(line, index, filePath, vulnerabilities);
    });

    return vulnerabilities;
  }

  isTestFile(filePath) {
    const testPatterns = [
      /\/examples\//,
      /\/test\//,
      /\/tests\//,
      /\.test\./,
      /\.spec\./,
      /\/fixtures\//,
      /\/mocks\//
    ];
    return testPatterns.some(p => p.test(filePath));
  }

  isComment(line) {
    return /^\s*\/\//.test(line) || /^\s*\/\*/.test(line);
  }

  checkEval(line, index, filePath, vulns) {
    const evalPattern = /\beval\s*\(/;
    if (evalPattern.test(line)) {
      vulns.push({
        rule: 'JS-001',
        severity: 'critical',
        message: 'Dangerous eval() usage - code injection risk',
        file: filePath,
        line: index + 1,
        code: line.trim()
      });
    }
  }

  checkSecrets(line, index, filePath, vulns) {
    // Improved secret pattern - requires proper key format
    const secretPattern = /(api[_-]?key|apikey|secret[_-]?key|secretkey|private[_-]?key|privatekey)\s*[:=]\s*["']([a-zA-Z0-9_\-]{20,})["']/i;
    
    const match = line.match(secretPattern);
    if (match) {
      const value = match[2];
      
      // Skip if matches known token names
      if (this.exclusions.tokenNames.includes(value)) {
        return;
      }
      
      // Skip if too short (not a real secret)
      if (value.length < this.exclusions.minSecretLength) {
        return;
      }
      
      // Skip if looks like an address (0x...)
      if (value.startsWith('0x')) {
        return;
      }

      vulns.push({
        rule: 'JS-002',
        severity: 'critical',
        message: 'Hardcoded secret/credential detected',
        file: filePath,
        line: index + 1,
        code: line.trim()
      });
    }
  }

  checkSQLInjection(line, index, filePath, vulns) {
    // Only flag actual concatenation in query strings
    const sqlPattern = /(query|execute|exec)\s*\(.*["'].*(SELECT|INSERT|UPDATE|DELETE).*\+.*\$|\+.*["'].*(SELECT|INSERT|UPDATE|DELETE)/i;
    
    if (sqlPattern.test(line)) {
      vulns.push({
        rule: 'JS-004',
        severity: 'high',
        message: 'Potential SQL injection via string concatenation',
        file: filePath,
        line: index + 1,
        code: line.trim()
      });
    }
  }

  checkPathTraversal(line, index, filePath, vulns) {
    const pathPattern = /fs\.(readFile|writeFile|createReadStream|unlink)\s*\([^)]*\+\s*(req|request|params|body)\.|\.\.[\/\\].*(req|request|params)/;
    
    if (pathPattern.test(line)) {
      vulns.push({
        rule: 'JS-005',
        severity: 'high',
        message: 'Path traversal risk - user input in file path',
        file: filePath,
        line: index + 1,
        code: line.trim()
      });
    }
  }

  checkConsoleLog(line, index, filePath, vulns) {
    // Skip console logs that just log errors (common pattern)
    const consolePattern = /console\.(log|debug|warn|error)\s*\(/;
    const isErrorLog = /console\.error\s*\(\s*(err|error|e)\s*\)/i;
    
    if (consolePattern.test(line) && !isErrorLog.test(line)) {
      vulns.push({
        rule: 'JS-007',
        severity: 'low',
        message: 'console.log left in production code',
        file: filePath,
        line: index + 1,
        code: line.trim()
      });
    }
  }

  checkPrototypePollution(line, index, filePath, vulns) {
    const protoPattern = /Object\.prototype\.__proto__|Object\.prototype\.constructor\s*=/;
    
    if (protoPattern.test(line)) {
      vulns.push({
        rule: 'JS-006',
        severity: 'high',
        message: 'Prototype pollution risk detected',
        file: filePath,
        line: index + 1,
        code: line.trim()
      });
    }
  }
}

module.exports = JavaScriptScanner;
