const fs = require('fs');
const path = require('path');

const RULES_DIR = path.join(__dirname, '../../rules');

class RuleLoader {
  static loadRules(language) {
    const ruleFile = path.join(RULES_DIR, `${language}.json`);
    if (!fs.existsSync(ruleFile)) {
      return [];
    }
    return JSON.parse(fs.readFileSync(ruleFile, 'utf8'));
  }

  static loadAllRules() {
    return {
      solidity: this.loadRules('solidity'),
      javascript: this.loadRules('javascript'),
      general: this.loadRules('general')
    };
  }
}

module.exports = RuleLoader;
