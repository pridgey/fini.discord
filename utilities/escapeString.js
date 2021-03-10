const escapeString = (stringToEscape) => {
  return stringToEscape.replace(/'/g, "\\'").replace(/"/g, '\\"');
};

module.exports = { escapeString };
