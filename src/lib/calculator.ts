// Tiny, safe arithmetic expression evaluator — no `eval`, no `Function`
// constructor. Built for the payslip calculator fields (see
// OcrEditor.tsx / payslipCalc.ts): a reviewer summing several line items
// off a real payslip (e.g. two allowances) just types "100+100" and sees
// "200", rather than needing an external calculator app. Supports +, -,
// *, /, parentheses, decimals, and unary +/-, with normal operator
// precedence.

type Token = { type: 'number'; value: number } | { type: 'op'; value: '+' | '-' | '*' | '/' | '(' | ')' }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const ch = input[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < input.length && /[0-9.]/.test(input[j])) j++
      const value = Number(input.slice(i, j))
      if (!Number.isFinite(value)) throw new Error('bad number')
      tokens.push({ type: 'number', value })
      i = j
      continue
    }
    if ('+-*/()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch as '+' | '-' | '*' | '/' | '(' | ')' })
      i++
      continue
    }
    throw new Error(`unexpected character "${ch}"`)
  }
  return tokens
}

class Parser {
  private pos = 0
  constructor(private tokens: Token[]) {}
  atEnd() {
    return this.pos >= this.tokens.length
  }
  private peek() {
    return this.tokens[this.pos]
  }
  private next() {
    return this.tokens[this.pos++]
  }

  parseExpression(): number {
    let value = this.parseTerm()
    while (!this.atEnd()) {
      const tok = this.peek()
      if (tok.type === 'op' && (tok.value === '+' || tok.value === '-')) {
        this.next()
        const rhs = this.parseTerm()
        value = tok.value === '+' ? value + rhs : value - rhs
      } else break
    }
    return value
  }

  private parseTerm(): number {
    let value = this.parseFactor()
    while (!this.atEnd()) {
      const tok = this.peek()
      if (tok.type === 'op' && (tok.value === '*' || tok.value === '/')) {
        this.next()
        const rhs = this.parseFactor()
        if (tok.value === '/' && rhs === 0) throw new Error('division by zero')
        value = tok.value === '*' ? value * rhs : value / rhs
      } else break
    }
    return value
  }

  private parseFactor(): number {
    const tok = this.next()
    if (!tok) throw new Error('unexpected end of expression')
    if (tok.type === 'number') return tok.value
    if (tok.type === 'op' && tok.value === '-') return -this.parseFactor()
    if (tok.type === 'op' && tok.value === '+') return this.parseFactor()
    if (tok.type === 'op' && tok.value === '(') {
      const value = this.parseExpression()
      const close = this.next()
      if (!close || close.type !== 'op' || close.value !== ')') throw new Error('expected closing parenthesis')
      return value
    }
    throw new Error('unexpected token')
  }
}

/** Evaluates a plain arithmetic expression (e.g. "100+100", "250000 -
 * 12500", "(80+20)*2"). Returns null for anything blank, malformed, or
 * with trailing garbage after a valid expression (rejected outright,
 * not silently truncated) — callers treat null as "nothing to compute
 * yet", never as zero. */
export function evaluateExpression(expr: string): number | null {
  const trimmed = expr.trim()
  if (trimmed === '') return null
  try {
    const tokens = tokenize(trimmed)
    if (tokens.length === 0) return null
    const parser = new Parser(tokens)
    const value = parser.parseExpression()
    if (!parser.atEnd()) return null
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/** Rounds to the nearest cent and formats for display/write-back —
 * "200", not "200.00" (matches how this app's real numeric OCR fields
 * already look, e.g. "250000", "9125.50" — see the real sheet values
 * quoted in ruleChecks.ts/README). */
export function formatComputed(n: number): string {
  return String(Math.round(n * 100) / 100)
}
