/**
 * YAML-like plain-text rendering for tool inputs and outputs.
 * Shared by Telegram HTML and the terminal UI.
 */

const DEFAULT_MAX_JSON_LEN = 800;

/**
 * Serializes a value for one-line display, capped in length.
 */
function truncateJson(value: unknown, maxLen: number = DEFAULT_MAX_JSON_LEN): string {
  try {
    const s = typeof value === "string" ? value : JSON.stringify(value);
    if (s.length <= maxLen) {
      return s;
    }
    return `${s.slice(0, maxLen)}…`;
  } catch {
    return String(value);
  }
}

/**
 * Formats a scalar value for YAML-style lines (quote when ambiguous).
 */
function formatYamlScalar(v: unknown): string {
  if (typeof v === "string") {
    if (/[\n\r:#]/.test(v) || v.length > 160 || v.includes('"')) {
      return JSON.stringify(v);
    }
    return v;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Flattens a plain object into indented YAML-style key lines.
 */
function linesForObject(obj: Record<string, unknown>, indent: number): string[] {
  const pad = "  ".repeat(indent);
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out.push(`${pad}${k}:`);
      out.push(...linesForObject(v as Record<string, unknown>, indent + 1));
    } else {
      out.push(`${pad}${k}: ${formatYamlScalar(v)}`);
    }
  }
  return out;
}

/**
 * Renders tool input as a compact YAML-style string (tool name as top-level key).
 */
export function toolInputToYamlLike(toolName: string, input: unknown): string {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const lines = [`${toolName}:`];
    lines.push(...linesForObject(input as Record<string, unknown>, 1));
    return lines.join("\n");
  }
  return `${toolName}: ${truncateJson(input)}`;
}

/**
 * YAML-style rendering for tool results (e.g. bash exitCode/stdout/stderr or generic objects).
 */
export function toolOutputToYamlLike(output: unknown): string {
  if (output !== null && typeof output === "object" && !Array.isArray(output)) {
    const o = output as Record<string, unknown>;
    if ("exitCode" in o && ("stdout" in o || "stderr" in o)) {
      const lines: string[] = [`exitCode: ${formatYamlScalar(o.exitCode)}`];
      const stdout = typeof o.stdout === "string" ? o.stdout : String(o.stdout ?? "");
      const stderr = typeof o.stderr === "string" ? o.stderr : String(o.stderr ?? "");
      if (stdout.includes("\n")) {
        lines.push("stdout: |");
        for (const line of stdout.split("\n")) {
          lines.push(`  ${line}`);
        }
      } else {
        lines.push(`stdout: ${formatYamlScalar(stdout)}`);
      }
      lines.push(`stderr: ${formatYamlScalar(stderr)}`);
      return lines.join("\n");
    }
    return linesForObject(o, 0).join("\n");
  }
  if (typeof output === "string") {
    return output;
  }
  return truncateJson(output, 2000);
}
