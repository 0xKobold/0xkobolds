#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const ScannerEngine = require('./src/scanner-engine');
const ConfigManager = require('./src/utils/config-manager');
const { version } = require('./package.json');

program
  .name('kobold-scan')
  .description('Security vulnerability scanner for the KOBOLDS ecosystem')
  .version(version);

program
  .command('scan <path>')
  .description('Scan files for security vulnerabilities')
  .option('-s, --severity <level>', 'Minimum severity level (critical|high|medium|low)', 'low')
  .option('-f, --format <format>', 'Output format (terminal|json|markdown|sarif)', 'terminal')
  .option('-o, --output <file>', 'Output file path (default: stdout)')
  .option('-c, --config <path>', 'Path to custom config file')
  .option('--include <patterns>', 'Include patterns (comma-separated)', '')
  .option('--exclude <patterns>', 'Exclude patterns (comma-separated)', 'node_modules,\.git,build,dist')
  .action(async (scanPath, options) => {
    try {
      const config = options.config 
        ? ConfigManager.loadCustom(options.config)
        : ConfigManager.loadDefault();

      // Override config with CLI options
      if (options.severity) config.severity = options.severity;
      if (options.include) config.include = options.include.split(',');
      if (options.exclude) config.exclude = options.exclude.split(',');

      const engine = new ScannerEngine(config);
      const results = await engine.scan(path.resolve(scanPath));

      // Filter by severity (show this severity AND more severe)
      const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const maxSeverityNum = severityOrder[options.severity] ?? 3;
      
      results.vulnerabilities = results.vulnerabilities.filter(v => {
        return severityOrder[v.severity] <= maxSeverityNum;
      });

      // Output results
      const Formatter = require(`./src/formatters/${options.format}`);
      const output = Formatter.format(results);

      if (options.output) {
        fs.writeFileSync(options.output, output);
        console.log(`Results written to: ${options.output}`);
      } else {
        console.log(output);
      }

      // Exit with error code if critical/high vulnerabilities found
      const criticalCount = results.vulnerabilities.filter(v => v.severity === 'critical').length;
      const highCount = results.vulnerabilities.filter(v => v.severity === 'high').length;
      
      if (criticalCount > 0 || (options.severity === 'high' && highCount > 0)) {
        process.exit(1);
      }
    } catch (error) {
      console.error('Error during scan:', error.message);
      process.exit(2);
    }
  });

program
  .command('rules')
  .description('List all available scanning rules')
  .option('-l, --language <lang>', 'Filter by language (solidity|javascript|general)', 'all')
  .action((options) => {
    const RuleLoader = require('./src/utils/rule-loader');
    const chalk = require('chalk');
    
    const rules = RuleLoader.loadAllRules();
    
    console.log(chalk.bold('\n🔍 KOBOLD-SCAN Available Rules\n'));
    
    Object.entries(rules).forEach(([lang, langRules]) => {
      if (options.language !== 'all' && lang !== options.language) return;
      
      console.log(chalk.cyan.bold(`\n${lang.toUpperCase()}:`));
      console.log(chalk.gray('─'.repeat(50)));
      
      langRules.forEach(rule => {
        const severityColor = {
          critical: chalk.red.bold,
          high: chalk.red,
          medium: chalk.yellow,
          low: chalk.gray
        }[rule.severity] || chalk.white;
        
        console.log(`  ${severityColor(`[${rule.severity.toUpperCase()}]`)} ${rule.id}`);
        console.log(`    ${rule.name}`);
        console.log(`    ${chalk.gray(rule.description)}`);
        if (rule.remediation) {
          console.log(`    ${chalk.green('💡')} ${chalk.italic(rule.remediation)}`);
        }
        console.log();
      });
    });
  });

program
  .command('init')
  .description('Initialize kobold-scan configuration in current directory')
  .option('-f, --force', 'Overwrite existing config file', false)
  .action((options) => {
    const configPath = path.join(process.cwd(), 'kobold-scan.json');
    
    if (fs.existsSync(configPath) && !options.force) {
      console.log('Config file already exists. Use --force to overwrite.');
      process.exit(1);
    }
    
    const defaultConfig = ConfigManager.getDefaultConfig();
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    
    console.log(`✅ Configuration file created: ${configPath}`);
    console.log('\nYou can now customize:');
    console.log('  • Severity thresholds');
    console.log('  • Enabled/disabled rules');
    console.log('  • Ignore patterns');
    console.log('  • Custom rule paths');
  });

program.parse();
