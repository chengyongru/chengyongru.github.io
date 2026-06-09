export function parseCommandLine(input: string, preserveTrailingEmpty = false): string[] {
  if (input.length === 0) return [''];

  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let tokenStarted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === '\\' && inQuote && i + 1 < input.length) {
      const next = input[i + 1];
      if (next === '"' || next === '\\') {
        current += next;
        tokenStarted = true;
        i++;
        continue;
      }
    }

    if (ch === '"') {
      inQuote = !inQuote;
      tokenStarted = true;
      continue;
    }

    if (/\s/.test(ch) && !inQuote) {
      if (tokenStarted || current.length > 0) {
        tokens.push(current);
        current = '';
        tokenStarted = false;
      }
      if (preserveTrailingEmpty && i === input.length - 1) {
        tokens.push('');
      }
      continue;
    }

    current += ch;
    tokenStarted = true;
  }

  if (tokenStarted || current.length > 0) {
    tokens.push(current);
  }

  return tokens.length > 0 ? tokens : [''];
}

export function quoteCommandArg(arg: string): string {
  if (!/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
