const ALIASES = Object.freeze({ l: 'left', r: 'right', op: 'operator' });

function normalizeCondition(condition) {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return condition;
  const normalized = { ...condition };
  Object.entries(ALIASES).forEach(([alias, canonical]) => {
    if (Object.prototype.hasOwnProperty.call(condition, alias) && Object.prototype.hasOwnProperty.call(condition, canonical)) {
      throw new Error('Condition cannot define both ' + canonical + ' and ' + alias);
    }
    if (Object.prototype.hasOwnProperty.call(condition, alias)) {
      normalized[canonical] = condition[alias];
      delete normalized[alias];
    }
  });
  if (Array.isArray(normalized.matchAll)) normalized.matchAll = normalized.matchAll.map(normalizeCondition);
  if (Array.isArray(normalized.matchAny)) normalized.matchAny = normalized.matchAny.map(normalizeCondition);
  if (normalized.not !== undefined) normalized.not = normalizeCondition(normalized.not);
  return normalized;
}

module.exports = { normalizeCondition };
