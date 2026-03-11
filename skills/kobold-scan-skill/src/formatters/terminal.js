const chalk = require('chalk');

class TerminalFormatter {
  static format(results) {
    let output = '\n';
    output += chalk.bold.cyan('╔════════════════════════════════════════════════════════╗\n');
    output += chalk.bold.cyan('║              🔍 KOBOLD-SCAN RESULTS                    ║\n');
    output += chalk.bold.cyan('╚════════════════════════════════════════════════════════╝\n\n');

    if (results.vulnerabilities.length === 0) {
      output += chalk.green.bold('✅ No vulnerabilities found!\n');
      return output;
    }

    // Group by severity
    const bySeverity = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };

    results.vulnerabilities.forEach(v => {
      if (bySeverity[v.severity]) {
        bySeverity[v.severity].push(v);
      }
    });

    const severityConfig = {
      critical: { label: 'CRITICAL', color: chalk.bgRed.white, icon: '💀' },
      high: { label: 'HIGH', color: chalk.red, icon: '⚠️' },
      medium: { label: 'MEDIUM', color: chalk.yellow, icon: '⚡' },
      low: { label: 'LOW', color: chalk.gray, icon: 'ℹ️' }
    };

    Object.entries(bySeverity).forEach(([severity, issues]) => {
      if (issues.length === 0) return;

      const cfg = severityConfig[severity];
      output += cfg.color.bold(` ${cfg.icon} ${cfg.label} (${issues.length}) `) + '\n';
      output += chalk.gray('─'.repeat(60)) + '\n';

      issues.forEach(issue => {
        output += `  ${chalk.bold(issue.rule)}: ${issue.message}\n`;
        output += `  ${chalk.gray(`at ${issue.file}:${issue.line}`)}\n`;
        if (issue.code) {
          output += `  ${chalk.cyan('>')} ${issue.code}\n`;
        }
        output += '\n';
      });
    });

    // Summary
    output += '\n' + chalk.bold('📊 Summary:\n');
    output += `  Files scanned: ${results.filesScanned || 0}\n`;
    output += `  Total issues: ${results.vulnerabilities.length}\n`;
    output += `    Critical: ${bySeverity.critical.length}\n`;
    output += `    High: ${bySeverity.high.length}\n`;
    output += `    Medium: ${bySeverity.medium.length}\n`;
    output += `    Low: ${bySeverity.low.length}\n`;

    return output;
  }
}

module.exports = TerminalFormatter;
