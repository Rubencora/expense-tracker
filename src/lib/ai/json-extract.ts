/**
 * Extracts the first balanced JSON object/array from an LLM's text response.
 * Handles markdown code fences and trailing commentary after the JSON —
 * unlike a greedy `/\{[\s\S]*\}/` regex, it stops at the JSON value's real
 * closing bracket instead of the last `}`/`]` anywhere in the text.
 */
export function extractJsonBlock(text: string): string | null {
  const stripped = text.replace(/```(?:json)?/gi, "");
  const start = stripped.search(/[[{]/);
  if (start === -1) return null;

  const open = stripped[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return stripped.slice(start, i + 1);
    }
  }
  return null;
}
