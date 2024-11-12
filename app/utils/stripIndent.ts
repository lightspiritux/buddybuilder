export function stripIndents(strings: TemplateStringsArray, ...values: any[]) {
  const endResult = String.raw({ raw: strings }, ...values);
  const match = endResult.match(/^[^\S\n]*(?=\S)/gm);
  const indent = match && Math.min(...match.map(el => el.length));
  if (indent) {
    const regexp = new RegExp(`^.{${indent}}`, 'gm');
    return endResult.replace(regexp, '').trim();
  }
  return endResult.trim();
}
