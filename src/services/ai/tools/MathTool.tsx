import { View } from 'react-native';
import { ITool, ToolDefinition, ToolWidget } from './ITool';
import { Block, BlockRow, Caption } from '../../../components/toolwidgets/ToolWidgetBlocks';

// token types for the expression parser
enum TokType {
  Num,
  Ident,
  Plus,
  Minus,
  Star,
  Slash,
  Caret,
  Bang,
  Percent,
  LParen,
  RParen,
  Comma,
  Deg,
  Eof,
}

interface Token {
  type: TokType;
  value?: number | string;
}

const constants: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: 2 * Math.PI,
  phi: (1 + Math.sqrt(5)) / 2,
  sqrt2: Math.SQRT2,
  sqrt1_2: Math.SQRT1_2,
  ln2: Math.LN2,
  ln10: Math.LN10,
  inf: Infinity,
  infinity: Infinity,
};

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) {
    throw new Error('factorial requires a non-negative integer');
  }
  if (n > 170) {
    throw new Error('factorial too large (max 170)');
  }
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function gcd(...nums: number[]): number {
  const ints = nums.map((n) => {
    if (!Number.isInteger(n)) throw new Error('gcd requires integers');
    return Math.abs(n);
  });
  let g = ints[0];
  for (let i = 1; i < ints.length; i++) {
    let a = g;
    let b = ints[i];
    while (b) {
      [a, b] = [b, a % b];
    }
    g = a;
  }
  return g;
}

function lcm(...nums: number[]): number {
  const ints = nums.map((n) => {
    if (!Number.isInteger(n)) throw new Error('lcm requires integers');
    return Math.abs(n);
  });
  let l = ints[0];
  for (let i = 1; i < ints.length; i++) {
    const g = gcd(l, ints[i]);
    if (g === 0) {
      l = 0;
      break;
    }
    l = (l / g) * ints[i];
  }
  return l;
}

function callFunction(name: string, args: number[]): number {
  const need = (n: number) => {
    if (args.length !== n) {
      throw new Error(`function "${name}" expects ${n} argument(s)`);
    }
  };
  const atLeast = (n: number) => {
    if (args.length < n) {
      throw new Error(`function "${name}" expects at least ${n} argument(s)`);
    }
  };
  switch (name) {
    case 'sin': need(1); return Math.sin(args[0]);
    case 'cos': need(1); return Math.cos(args[0]);
    case 'tan': need(1); return Math.tan(args[0]);
    case 'asin': need(1); return Math.asin(args[0]);
    case 'acos': need(1); return Math.acos(args[0]);
    case 'atan': need(1); return Math.atan(args[0]);
    case 'atan2': need(2); return Math.atan2(args[0], args[1]);
    case 'sinh': need(1); return Math.sinh(args[0]);
    case 'cosh': need(1); return Math.cosh(args[0]);
    case 'tanh': need(1); return Math.tanh(args[0]);
    case 'asinh': need(1); return Math.asinh(args[0]);
    case 'acosh': need(1); return Math.acosh(args[0]);
    case 'atanh': need(1); return Math.atanh(args[0]);
    case 'sqrt': need(1); return Math.sqrt(args[0]);
    case 'cbrt': need(1); return Math.cbrt(args[0]);
    case 'root': need(2); return Math.pow(args[0], 1 / args[1]);
    case 'exp': need(1); return Math.exp(args[0]);
    case 'exp2': need(1); return Math.pow(2, args[0]);
    case 'ln': need(1); return Math.log(args[0]);
    case 'log':
      if (args.length === 1) return Math.log10(args[0]);
      need(2);
      return Math.log(args[0]) / Math.log(args[1]);
    case 'log2': need(1); return Math.log2(args[0]);
    case 'log10': need(1); return Math.log10(args[0]);
    case 'abs': need(1); return Math.abs(args[0]);
    case 'sign': need(1); return Math.sign(args[0]);
    case 'floor': need(1); return Math.floor(args[0]);
    case 'ceil': need(1); return Math.ceil(args[0]);
    case 'round': need(1); return Math.round(args[0]);
    case 'trunc': need(1); return Math.trunc(args[0]);
    case 'min': atLeast(1); return Math.min(...args);
    case 'max': atLeast(1); return Math.max(...args);
    case 'hypot': atLeast(1); return Math.hypot(...args);
    case 'mean': atLeast(1); return args.reduce((a, b) => a + b, 0) / args.length;
    case 'pow': need(2); return Math.pow(args[0], args[1]);
    case 'mod': need(2); return args[1] === 0 ? NaN : args[0] % args[1];
    case 'clamp': need(3); return Math.min(Math.max(args[0], args[1]), args[2]);
    case 'gcd': atLeast(2); return gcd(...args);
    case 'lcm': atLeast(2); return lcm(...args);
    case 'fact': need(1); return factorial(args[0]);
    default:
      throw new Error(`unknown function "${name}"`);
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      if ((input[j] === 'e' || input[j] === 'E') && /[0-9+-]/.test(input[j + 1] ?? '')) {
        j++;
        if (input[j] === '+' || input[j] === '-') j++;
        while (j < input.length && /[0-9]/.test(input[j])) j++;
      }
      tokens.push({ type: TokType.Num, value: parseFloat(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
      tokens.push({ type: TokType.Ident, value: input.slice(i, j) });
      i = j;
      continue;
    }
    switch (c) {
      case '+': tokens.push({ type: TokType.Plus }); i++; continue;
      case '-': tokens.push({ type: TokType.Minus }); i++; continue;
      case '*':
        if (input[i + 1] === '*') {
          tokens.push({ type: TokType.Caret });
          i += 2;
        } else {
          tokens.push({ type: TokType.Star });
          i++;
        }
        continue;
      case '/': tokens.push({ type: TokType.Slash }); i++; continue;
      case '^': tokens.push({ type: TokType.Caret }); i++; continue;
      case '!': tokens.push({ type: TokType.Bang }); i++; continue;
      case '%': tokens.push({ type: TokType.Percent }); i++; continue;
      case '(': tokens.push({ type: TokType.LParen }); i++; continue;
      case ')': tokens.push({ type: TokType.RParen }); i++; continue;
      case ',': tokens.push({ type: TokType.Comma }); i++; continue;
      case '°':
      case 'º':
        tokens.push({ type: TokType.Deg });
        i++;
        continue;
      default:
        throw new Error(`unexpected character "${c}" at position ${i}`);
    }
  }
  tokens.push({ type: TokType.Eof });
  return tokens;
}

class Parser {
  private pos = 0;

  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  private expect(t: TokType): Token {
    const tok = this.next();
    if (tok.type !== t) throw new Error('malformed expression');
    return tok;
  }

  parse(): number {
    const v = this.expr();
    if (this.peek().type !== TokType.Eof) throw new Error('malformed expression');
    return v;
  }

  private expr(): number {
    let left = this.term();
    for (;;) {
      const t = this.peek().type;
      if (t === TokType.Plus) {
        this.next();
        left += this.term();
      } else if (t === TokType.Minus) {
        this.next();
        left -= this.term();
      } else {
        break;
      }
    }
    return left;
  }

  private term(): number {
    let left = this.unary();
    for (;;) {
      const t = this.peek().type;
      if (t === TokType.Star) {
        this.next();
        left *= this.unary();
      } else if (t === TokType.Slash) {
        this.next();
        const r = this.unary();
        if (r === 0) throw new Error('division by zero');
        left /= r;
      } else if (t === TokType.Percent) {
        this.next();
        const r = this.unary();
        if (r === 0) throw new Error('modulo by zero');
        left %= r;
      } else if (t === TokType.Num || t === TokType.Ident || t === TokType.LParen) {
        // implicit multiplication: 2pi, 3(4+5), sin(30)cos(60)
        left *= this.unary();
      } else {
        break;
      }
    }
    return left;
  }

  private unary(): number {
    const t = this.peek().type;
    if (t === TokType.Plus) {
      this.next();
      return this.unary();
    }
    if (t === TokType.Minus) {
      this.next();
      return -this.unary();
    }
    return this.pow();
  }

  private pow(): number {
    const base = this.postfix();
    if (this.peek().type === TokType.Caret) {
      this.next();
      return Math.pow(base, this.unary());
    }
    return base;
  }

  private postfix(): number {
    let v = this.primary();
    for (;;) {
      const t = this.peek().type;
      if (t === TokType.Bang) {
        this.next();
        v = factorial(v);
      } else if (t === TokType.Deg) {
        this.next();
        v = (v * Math.PI) / 180;
      } else {
        break;
      }
    }
    return v;
  }

  private primary(): number {
    const tok = this.next();
    if (tok.type === TokType.Num) return tok.value as number;
    if (tok.type === TokType.LParen) {
      const v = this.expr();
      this.expect(TokType.RParen);
      return v;
    }
    if (tok.type === TokType.Ident) {
      const name = String(tok.value).toLowerCase();
      if (this.peek().type === TokType.LParen) {
        this.next();
        const args: number[] = [];
        if (this.peek().type !== TokType.RParen) {
          args.push(this.expr());
          while (this.peek().type === TokType.Comma) {
            this.next();
            args.push(this.expr());
          }
        }
        this.expect(TokType.RParen);
        return callFunction(name, args);
      }
      const c = constants[name];
      if (c === undefined) throw new Error(`unknown constant "${name}"`);
      return c;
    }
    throw new Error('malformed expression');
  }
}

// evaluate a math expression safely, returns the numeric result
export function evaluate(expression: string): number {
  const trimmed = expression.trim();
  if (trimmed.length === 0) throw new Error('empty expression');
  return new Parser(tokenize(trimmed)).parse();
}

function formatResult(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'Infinity';
  if (v === -Infinity) return '-Infinity';
  const cleaned = Object.is(v, -0) ? 0 : Math.round(v * 1e12) / 1e12;
  if (cleaned !== 0 && (Math.abs(cleaned) >= 1e15 || Math.abs(cleaned) < 1e-10)) {
    return cleaned.toExponential(6).replace(/\.?0+e/, 'e');
  }
  return parseFloat(cleaned.toPrecision(12)).toString();
}

interface MathWidgetData {
  expression: string;
  result: string;
}

export class MathTool implements ITool {
  displayName = 'Math Calculator';
  displayDescription = 'Allow the assistant to compute exact results of mathematical expressions.';
  enabledByDefault = true;

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'math_calculate',
      description:
        'Compute the exact numeric result of a mathematical expression. Use this for any calculation the user asks about: arithmetic, algebra, trigonometry, roots, logarithms, factorials, percentages, gcd/lcm, statistics. ' +
        'This is a TOOL, NOT a widget: call it through the tool-calling mechanism and never emit it as a widget block. ' +
        'Supports + - * /, ^ or ** for power, % for modulo, parentheses, and implicit multiplication (2pi, 3(4+5)). ' +
        'Use the degree symbol ° for angles in degrees: sin(30°). Constants: pi, e, tau, phi, sqrt2, ln2, ln10. ' +
        'Functions: sqrt, cbrt, root(x,n), sin, cos, tan, asin, acos, atan, atan2(y,x), sinh, cosh, tanh, exp, ln, log (base 10), log(x,base), log2, abs, sign, floor, ceil, round, trunc, min, max, hypot, mean, pow, mod, clamp, gcd, lcm, fact. ' +
        'Postfix ! computes factorial. Return only the numeric result.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description:
              'The mathematical expression to evaluate, e.g. "2+2*3", "sqrt(144)", "sin(30°)", "5!", "log(1000)", "gcd(48, 36)", "mean(1,2,3,4)"',
          },
        },
        required: ['expression'],
      },
    },
  };

  widget: ToolWidget<MathWidgetData> = {
    name: 'Calculate',
    hasBorder: true,
    build: (args, result) => {
      //errors keep the default bubble
      const separator = result.lastIndexOf(' = ');
      if (separator === -1) return null;
      return { expression: String(args.expression), result: result.slice(separator + 3) };
    },
    component: ({ data }) => (
      <View>
        <Caption text={data.expression} />
        <BlockRow>
          <Block text="=" grow={false} />
          <Block text={data.result} filled />
        </BlockRow>
      </View>
    ),
  };

  async execute(args: Record<string, any>): Promise<string> {
    const expression = args.expression;
    if (typeof expression !== 'string' || expression.trim().length === 0) {
      return 'Error: missing or invalid "expression" parameter.';
    }

    try {
      const value = evaluate(expression);
      return `${expression} = ${formatResult(value)}`;
    } catch (e: any) {
      return `Math error: ${e.message}`;
    }
  }
}
