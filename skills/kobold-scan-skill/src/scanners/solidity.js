class SolidityScanner {
  constructor(config) {
    this.config = config;
  }

  scan(content, filePath) {
    const vulnerabilities = [];
    const lines = content.split('\n');

    // Skip example/test files
    if (filePath.includes('/examples/') || filePath.includes('/test/')) {
      return [];
    }

    lines.forEach((line, index) => {
      // Skip comments
      if (this.isComment(line)) {
        return;
      }

      // SOL-004: tx.origin usage
      this.checkTxOrigin(line, index, filePath, vulnerabilities);

      // SOL-001: Reentrancy
      this.checkReentrancy(line, index, filePath, vulnerabilities);

      // SOL-006: Delegatecall injection
      this.checkDelegatecall(line, index, filePath, vulnerabilities);

      // SOL-003: Overflow (only flag in pre-0.8 versions)
      this.checkOverflow(line, index, filePath, content, vulnerabilities);
    });

    return vulnerabilities;
  }

  isComment(line) {
    return /^\s*\/\//.test(line) || /^\s*\/\*/.test(line) || /\*\//.test(line);
  }

  checkTxOrigin(line, index, filePath, vulns) {
    const txOriginPattern = /tx\.origin/;
    
    // Skip if it's in a comment about the vulnerability
    if (line.includes('phishing') || line.includes('authentication')) {
      // This is likely a comment warning about the issue
      return;
    }
    
    if (txOriginPattern.test(line)) {
      // Check if it's actually used for auth (require statement)
      if (line.includes('require') || line.includes('==') || line.includes('!=')) {
        vulns.push({
          rule: 'SOL-004',
          severity: 'critical',
          message: 'tx.origin used for authentication - phishing risk',
          file: filePath,
          line: index + 1,
          code: line.trim()
        });
      }
    }
  }

  checkReentrancy(line, index, filePath, vulns) {
    // Look for external call patterns that could be reentrant
    const externalCallPattern = /\.call\{value:[^}]+\}\([^)]*\)/;
    const transferPattern = /\.transfer\s*\(/;
    const sendPattern = /\.send\s*\(/;
    
    if (externalCallPattern.test(line) && !transferPattern.test(line) && !sendPattern.test(line)) {
      // Check if state is updated AFTER the call (reentrancy pattern)
      // This is a simplified check - real detection needs flow analysis
      vulns.push({
        rule: 'SOL-001',
        severity: 'high', // Downgrade from critical unless we confirm pattern
        message: 'External call detected - verify state updates happen before, not after',
        file: filePath,
        line: index + 1,
        code: line.trim()
      });
    }
  }

  checkDelegatecall(line, index, filePath, vulns) {
    const delegatecallPattern = /\.delegatecall\s*\(/;
    
    if (delegatecallPattern.test(line)) {
      // Check if address is user-controlled (contains msg.sender or parameter)
      if (line.includes('msg.sender') || line.includes('address(') || /\b[A-Za-z]+\)/.test(line)) {
        vulns.push({
          rule: 'SOL-006',
          severity: 'high',
          message: 'Delegatecall to potentially user-controlled address',
          file: filePath,
          line: index + 1,
          code: line.trim()
        });
      }
    }
  }

  checkOverflow(line, index, filePath, content, vulns) {
    // Only flag for Solidity < 0.8 which doesn't have built-in checks
    const pragmaMatch = content.match(/pragma\s+solidity\s+\^?(\d+)\.(\d+)/);
    if (!pragmaMatch) return;
    
    const major = parseInt(pragmaMatch[1]);
    const minor = parseInt(pragmaMatch[2]);
    
    // Solidity 0.8+ has built-in overflow checks
    if (major > 0 || (major === 0 && minor >= 8)) {
      return;
    }
    
    const overflowPattern = /uint\d*\s+\w+\s*=\s*\w+\s*[\+\-\*]\s*\w+/;
    
    if (overflowPattern.test(line)) {
      vulns.push({
        rule: 'SOL-003',
        severity: 'medium', // Downgrade since it's context-dependent
        message: 'Potential integer overflow (pre-Solidity 0.8) - consider SafeMath',
        file: filePath,
        line: index + 1,
        code: line.trim()
      });
    }
  }
}

module.exports = SolidityScanner;
