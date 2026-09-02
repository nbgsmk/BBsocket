const OPERATORS = new Set(['=', '!=', '>', '>=', '<', '<=', 'between', 'crossesAbove', 'crossesBelow']);

function readPath(object, path) {
  return path.split('.').reduce((value, key) => value === undefined || value === null ? undefined : value[key], object);
}

function resolveReference(reference, context) {
  if (typeof reference !== 'string') return reference;
  const prefixes = ['price.', 'volume.', 'indicator.', 'previous.', 'position.'];
  if (!prefixes.some(prefix => reference.startsWith(prefix))) return reference;
  if (reference.startsWith('indicator.') || reference.startsWith('previous.indicator.')) {
    const prefix = reference.startsWith('previous.') ? 'previous.indicator.' : 'indicator.';
    const key = reference.slice(prefix.length);
    const source = prefix.startsWith('previous') ? context.previous && context.previous.indicator : context.indicator;
    if (source && Object.prototype.hasOwnProperty.call(source, key)) return source[key];
    const parts = key.split('.');
    if (parts.length > 1) {
      const series = parts.pop();
      const value = source && source[parts.join('.')];
      if (value && typeof value === 'object') return value[series];
    }
    return undefined;
  }
  return readPath(context, reference);
}

function numeric(value) {
  return typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : value);
}

function compare(left, operator, right) {
  if (left === undefined || left === null || right === undefined || right === null) return false;
  const a = numeric(left);
  const b = numeric(right);
  switch (operator) {
    case '=': return a === b;
    case '!=': return a !== b;
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    case 'between': return Array.isArray(right) && a >= numeric(right[0]) && a <= numeric(right[1]);
    default: return false;
  }
}

function evaluateCondition(condition, context = {}) {
  if (condition.all) {
    const evaluations = condition.all.map(child => evaluateCondition(child, context));
    return { result: evaluations.every(item => item.result), type: 'all', evaluations };
  }
  if (condition.any) {
    const evaluations = condition.any.map(child => evaluateCondition(child, context));
    return { result: evaluations.some(item => item.result), type: 'any', evaluations };
  }
  if (condition.not) {
    const evaluation = evaluateCondition(condition.not, context);
    return { result: !evaluation.result, type: 'not', evaluation };
  }
  if (!OPERATORS.has(condition.operator)) throw new Error('Unsupported condition operator: ' + condition.operator);
  const left = resolveReference(condition.left, context);
  const right = condition.operator === 'between' ? condition.value : resolveReference(condition.right, context);
  let result;
  if (condition.operator === 'crossesAbove' || condition.operator === 'crossesBelow') {
    const previous = context.previous || {};
    const previousLeft = resolveReference(condition.left, { ...context, ...previous, previous: undefined });
    const previousRight = resolveReference(condition.right, { ...context, ...previous, previous: undefined });
    result = condition.operator === 'crossesAbove'
      ? compare(left, '>', right) && compare(previousLeft, '<=', previousRight)
      : compare(left, '<', right) && compare(previousLeft, '>=', previousRight);
    return { result, type: 'comparison', left, right, previousLeft, previousRight, operator: condition.operator };
  }
  result = compare(left, condition.operator, right);
  return { result, type: 'comparison', left, right, operator: condition.operator };
}

module.exports = { evaluateCondition, resolveReference };
