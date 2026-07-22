// Helper to convert caret exponent notation and raw formula patterns into Unicode superscripts and subscripts
export function formatFormula(text: string): string {
  if (!text) return text;

  // Convert caret superscripts e.g. x^2 -> x², 10^-3 -> 10⁻³
  const superMap: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'n': 'ⁿ', 'x': 'ˣ'
  };

  let result = text.replace(/\^([0-9+\-=()nx]+)/g, (_, match) => {
    return match.split('').map((char: string) => superMap[char] || char).join('');
  });

  return result;
}
