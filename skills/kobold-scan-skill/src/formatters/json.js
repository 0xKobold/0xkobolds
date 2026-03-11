class JSONFormatter {
  static format(results) {
    return JSON.stringify(results, null, 2);
  }
}

module.exports = JSONFormatter;
