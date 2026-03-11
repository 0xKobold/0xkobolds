const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  severity: 'low',
  include: ['**/*'],
  exclude: ['node_modules/**', '.git/**', 'build/**', 'dist/**', '**/*.min.js'],
  rules: {
    solidity: { enabled: true },
    javascript: { enabled: true },
    general: { enabled: true }
  },
  output: {
    showCodeSnippets: true,
    maxIssuesPerRule: 50
  }
};

class ConfigManager {
  static loadDefault() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  static loadCustom(configPath) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { ...DEFAULT_CONFIG, ...userConfig };
  }

  static getDefaultConfig() {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

module.exports = ConfigManager;
