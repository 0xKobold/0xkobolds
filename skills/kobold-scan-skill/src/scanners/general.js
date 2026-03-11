class GeneralScanner {
  constructor(config) {
    this.config = config;
  }

  scan(content, filePath) {
    const vulnerabilities = [];
    const lines = content.split('\n');

    // GEN-001: TODO/FIXME comments
    const todoPattern = /\/\/.*TODO|\/\/.*FIXME|\/\/.*HACK|\/\*.*TODO|\/\*.*FIXME/;
    
    // GEN-002: Magic numbers (not perfect, catches common cases)
    const magicNumberPattern = /[^\w](\d{3,})(?!\d*['"])[^\w]/;
    
    // GEN-003: Deep nesting (4+ levels of indentation)
    const deepNestingPattern = /^\s{16,}/;
    
    // GEN-008: World-writable permissions
    const chmodPattern = /chmod\s+777|chmod\s+a\+rw|chmod\s+o\+w/;

    let consecutiveEmpty = 0;

    lines.forEach((line, index) => {
      // Check TODO/FIXME
      if (todoPattern.test(line)) {
        vulnerabilities.push({
          rule: 'GEN-001',
          severity: 'low',
          message: 'Technical debt marker (TODO/FIXME/HACK)',
          file: filePath,
          line: index + 1,
          code: line.trim()
        });
      }

      // Check magic numbers
      if (magicNumberPattern.test(line)) {
        const match = line.match(magicNumberPattern);
        const num = match ? match[1] : '';
        // Exclude common non-magic numbers
        if (!['100', '200', '404', '500', '1000', '1024', '2000', '3000', '4000', '5000', '8000', '8080', '443', '80'].includes(num)) {
          vulnerabilities.push({
            rule: 'GEN-002',
            severity: 'low',
            message: `Magic number detected: ${num} (consider named constant)`,
            file: filePath,
            line: index + 1,
            code: line.trim()
          });
        }
      }

      // Check deep nesting
      if (deepNestingPattern.test(line)) {
        vulnerabilities.push({
          rule: 'GEN-003',
          severity: 'medium',
          message: 'Deep nesting detected (>4 levels) - consider refactoring',
          file: filePath,
          line: index + 1,
          code: line.trim().substring(0, 50) + '...'
        });
      }

      // Check world-writable permissions
      if (chmodPattern.test(line)) {
        vulnerabilities.push({
          rule: 'GEN-008',
          severity: 'high',
          message: 'World-writable file permissions - security risk',
          file: filePath,
          line: index + 1,
          code: line.trim()
        });
      }
    });

    return vulnerabilities;
  }
}

module.exports = GeneralScanner;
