/**
 * Tiny calculator for the amount keypad. Supports + − × ÷ with normal precedence.
 * No eval — the expression is tokenised and evaluated by hand.
 */
export const OPS = ['+', '−', '×', '÷'] as const;
export type Op = (typeof OPS)[number];

export function isOp(ch: string): ch is Op {
  return (OPS as readonly string[]).includes(ch);
}

export function hasOperator(expr: string): boolean {
  return [...expr].some(isOp);
}

/** `decimals` is how many decimal places the amount's currency uses (2 for EGP, 3 for KWD). */
export function evaluate(expr: string, decimals = 2): number {
  const tokens: (number | Op)[] = [];
  let buf = '';
  for (const ch of expr) {
    if (isOp(ch)) {
      if (buf !== '') tokens.push(parseFloat(buf));
      buf = '';
      tokens.push(ch);
    } else {
      buf += ch;
    }
  }
  if (buf !== '' && buf !== '.') tokens.push(parseFloat(buf));
  // drop trailing operator
  while (tokens.length && typeof tokens[tokens.length - 1] !== 'number') tokens.pop();
  if (!tokens.length) return 0;

  // first pass: × ÷
  const pass: (number | Op)[] = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as Op;
    const n = tokens[i + 1] as number;
    if (op === '×' || op === '÷') {
      const prev = pass.pop() as number;
      pass.push(op === '×' ? prev * n : n === 0 ? 0 : prev / n);
    } else {
      pass.push(op, n);
    }
  }
  // second pass: + −
  let total = pass[0] as number;
  for (let i = 1; i < pass.length; i += 2) {
    const op = pass[i] as Op;
    const n = pass[i + 1] as number;
    total = op === '+' ? total + n : total - n;
  }
  const f = 10 ** decimals;
  return Math.round(total * f) / f;
}

/** Applies one keypad press to the current expression and returns the new one. */
export function pressKey(expr: string, key: string, decimals = 2): string {
  const last = expr.slice(-1);
  if (key === 'back') return expr.slice(0, -1);
  if (key === 'clear') return '';
  if (key === '=') return hasOperator(expr) ? formatResult(evaluate(expr, decimals)) : expr;
  if (isOp(key)) {
    if (expr === '') return '';
    if (isOp(last)) return expr.slice(0, -1) + key;
    return expr + key;
  }
  // current number segment
  const segment = expr.split(/[+−×÷]/).pop() ?? '';
  if (key === '.') {
    if (decimals === 0 || segment.includes('.')) return expr;
    return expr + (segment === '' ? '0.' : '.');
  }
  // digit
  if (segment.includes('.') && segment.split('.')[1].length >= decimals) return expr;
  if (segment === '0') return expr.slice(0, -1) + key;
  if (segment.replace('.', '').length >= 10) return expr;
  return expr + key;
}

function formatResult(n: number): string {
  if (n < 0) return '0';
  return String(n);
}
