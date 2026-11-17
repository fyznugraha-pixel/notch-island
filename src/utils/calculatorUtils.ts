export type UnitCategory = "currency" | "length" | "weight" | "temp";

export const UNIT_CONVERSIONS: Record<"length" | "weight", Record<string, number>> = {
  length: {
    mm: 0.001,
    cm: 0.01,
    m: 1,
    km: 1000,
    in: 0.0254,
    ft: 0.3048,
    yd: 0.9144,
    mi: 1609.344,
  },
  weight: {
    mg: 0.001,
    g: 1,
    kg: 1000,
    ton: 1_000_000,
    oz: 28.349523125,
    lb: 453.59237,
  },
};

export function formatDisplayNumber(val: number): string {
  if (!Number.isFinite(val)) return "Error";
  if (Math.abs(val) < 1e-12) return "0";
  const rounded = Math.round(val * 1e6) / 1e6;
  return rounded.toLocaleString("id-ID", { maximumFractionDigits: 6 });
}

export function convertUnitValue(
  amount: number,
  from: string,
  to: string,
  category: "length" | "weight"
): number {
  const table = UNIT_CONVERSIONS[category];
  const fromFactor = table[from];
  const toFactor = table[to];
  if (!fromFactor || !toFactor) return NaN;
  return (amount * fromFactor) / toFactor;
}

export function convertTemperature(amount: number, from: "C" | "F", to: "C" | "F"): number {
  if (from === to) return amount;
  return from === "C" ? (amount * 9) / 5 + 32 : ((amount - 32) * 5) / 9;
}

type Token = { type: "num"; value: number } | { type: "op"; value: string };

function tokenizeMath(raw: string): Token[] | null {
  const cleaned = raw
    .trim()
    .replace(/,/g, ".")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\s+/g, "");

  if (!cleaned) return [];
  const tokens: Token[] = [];
  let i = 0;

  while (i < cleaned.length) {
    const ch = cleaned[i];
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      let end = i + 1;
      let dots = ch === "." ? 1 : 0;
      while (end < cleaned.length && ((cleaned[end] >= "0" && cleaned[end] <= "9") || cleaned[end] === ".")) {
        if (cleaned[end] === ".") dots++;
        end++;
      }
      if (dots > 1) return null;
      const num = Number(cleaned.slice(i, end));
      if (!Number.isFinite(num)) return null;
      tokens.push({ type: "num", value: num });
      i = end;
      continue;
    }
    if ("+-*/()%".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    return null;
  }
  return tokens;
}

export function evaluateCalcExpression(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return "—";

  const pctOfMatch = trimmed.match(/^([+-]?\d+(?:[.,]\d+)?)\s*%\s*(?:dari|of)\s*([+-]?\d+(?:[.,]\d+)?)$/i);
  if (pctOfMatch) {
    const pct = Number(pctOfMatch[1].replace(",", "."));
    const base = Number(pctOfMatch[2].replace(",", "."));
    if (Number.isFinite(pct) && Number.isFinite(base)) {
      return formatDisplayNumber((pct / 100) * base);
    }
  }

  const tokens = tokenizeMath(trimmed);
  if (!tokens || tokens.length === 0) return "—";

  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parseExpression(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (peek()?.type === "op" && (peek()?.value === "+" || peek()?.value === "-")) {
      const op = consume().value;
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    while (peek()?.type === "op" && (peek()?.value === "*" || peek()?.value === "/")) {
      const op = consume().value;
      const right = parseFactor();
      if (right === null) return null;
      if (op === "/" && right === 0) return NaN;
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number | null {
    let sign = 1;
    while (peek()?.type === "op" && (peek()?.value === "+" || peek()?.value === "-")) {
      if (consume().value === "-") sign *= -1;
    }

    let val: number | null = null;
    const cur = peek();
    if (!cur) return null;

    if (cur.type === "num") {
      consume();
      val = cur.value;
    } else if (cur.type === "op" && cur.value === "(") {
      consume();
      val = parseExpression();
      if (val === null) return null;
      if (peek()?.type !== "op" || peek()?.value !== ")") {
        return null;
      }
      consume();
    } else {
      return null;
    }

    while (peek()?.type === "op" && peek()?.value === "%") {
      consume();
      val = val / 100;
    }

    return sign * val;
  }

  const result = parseExpression();
  if (result === null || pos !== tokens.length) return "—";
  if (!Number.isFinite(result)) return "Error";
  return formatDisplayNumber(result);
}
