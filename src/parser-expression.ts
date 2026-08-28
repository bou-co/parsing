/* eslint-disable @typescript-eslint/no-explicit-any */
import { getFromObject } from './internal';
import type { ParserContext } from './parser-types';
import { applyCast, buildKeyPath } from './type-token';
import { resolveTypePipe } from './types/namespace';

/**
 * The expression grammar shared by every pattern with `expressions` enabled:
 *
 *   expression  := alternative ("||" alternative)*
 *   alternative := candidate ("|" pipe)*
 *   pipe        := name (":" param)*
 *   candidate | param := literal | path
 *   literal     := "\"…\"" | -?digits(.digits)? | true | false | null | undefined
 *
 * Splitting is quote-aware: a double-quoted literal may contain `|`, `||`, `:` and single quotes
 * (`formatDate:"MMM d 'at' HH:mm"`), and `\"` escapes a quote. Dot paths are never split here —
 * path semantics belong to the pattern's `resolve`.
 */

export interface ParsedPipe {
  name: string;
  params: string[];
}

export interface ParsedAlternative {
  candidate: string;
  pipes: ParsedPipe[];
}

export interface ParsedExpression {
  alternatives: ParsedAlternative[];
}

// Split on a separator outside double quotes; `\"` never closes a literal
const splitOutsideQuotes = (text: string, separator: string): string[] => {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted && char === '\\' && i + 1 < text.length) {
      current += char + text[++i];
      continue;
    }
    if (char === '"') quoted = !quoted;
    if (!quoted && text.startsWith(separator, i)) {
      parts.push(current);
      current = '';
      i += separator.length - 1;
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
};

const parseCache = new Map<string, ParsedExpression>();
const PARSE_CACHE_LIMIT = 5000;

export const parseExpression = (expression: string): ParsedExpression => {
  const cached = parseCache.get(expression);
  if (cached) return cached;
  const alternatives = splitOutsideQuotes(expression, '||').map((alternative): ParsedAlternative => {
    const [candidate, ...pipes] = splitOutsideQuotes(alternative, '|').map((part) => part.trim());
    return {
      candidate,
      pipes: pipes.map((pipe) => {
        const [name, ...params] = splitOutsideQuotes(pipe, ':').map((part) => part.trim());
        return { name, params };
      }),
    };
  });
  const parsed = { alternatives };
  if (parseCache.size >= PARSE_CACHE_LIMIT) parseCache.clear();
  parseCache.set(expression, parsed);
  return parsed;
};

const LITERAL_NUMBER = /^-?\d+(\.\d+)?$/;
const KEYWORDS: Record<string, unknown> = { true: true, false: false, null: null, undefined: undefined };

export type ParsedLiteral = { literal: true; value: unknown } | { literal: false };

export const parseLiteral = (token: string): ParsedLiteral => {
  if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) return { literal: true, value: token.slice(1, -1).replace(/\\(["\\])/g, '$1') };
  if (LITERAL_NUMBER.test(token)) return { literal: true, value: Number(token) };
  if (Object.hasOwn(KEYWORDS, token)) return { literal: true, value: KEYWORDS[token] };
  return { literal: false };
};

const resolveParam = async (param: string, context: ParserContext): Promise<unknown> => {
  const literal = parseLiteral(param);
  if (literal.literal) return literal.value;
  const value = await getFromObject(context.variables, param, context);
  if (typeof value === 'function') return await value(context);
  return value;
};

// A pipe is an explicit `pipes` function first, then a type (`email`, `date.iso`, `upperCase`, `oneOf:"a":"b"`)
const applyPipe = async (pipe: ParsedPipe, value: unknown, context: ParserContext, hasFallback: boolean): Promise<unknown> => {
  const { name } = pipe;
  const params = await Promise.all(pipe.params.map((param) => resolveParam(param, context)));
  const fn = await getFromObject(context.pipes ?? {}, name);
  if (fn !== undefined) {
    if (typeof fn !== 'function') throw new Error(`[@bou-co/parsing] Pipe "${name}" at "${buildKeyPath(context)}" is not a function`);
    return await fn({ ...context, data: value, value, params: params.length ? params : undefined });
  }
  const token = resolveTypePipe(name, params, context.types);
  if (token) {
    // "Fallback wins when written": with a `||` alternative after this pipe, a failed cast yields undefined and the chain continues
    return applyCast(value, token, { ...context, data: value, value } as ParserContext, { fallback: hasFallback });
  }
  // TODO(v4): remove migration catch
  const legacy = await getFromObject(context.variables ?? {}, name, context);
  if (typeof legacy === 'function') {
    throw new Error(
      `[@bou-co/parsing] Pipe "${name}" at "${buildKeyPath(context)}" is defined in \`variables\` — v3 looks pipes up from the \`pipes\` config only. Move the function into \`pipes\`.`,
    );
  }
  throw new Error(`[@bou-co/parsing] Pipe "${name}" not found at "${buildKeyPath(context)}"`);
};

export type CandidateResolver = (candidate: string) => Promise<unknown>;

/**
 * Evaluate a parsed expression: each `||` alternative resolves its candidate (a literal or, through
 * `resolveCandidate`, the pattern's own lookup), runs its pipes left to right, and wins when the
 * result is defined. An undefined candidate skips its pipes unless `context.pipeUndefined` is set.
 */
export const evaluateExpression = async (expression: string, context: ParserContext, resolveCandidate: CandidateResolver): Promise<unknown> => {
  const { alternatives } = parseExpression(expression);
  for (let index = 0; index < alternatives.length; index++) {
    const { candidate, pipes } = alternatives[index];
    const hasFallback = index < alternatives.length - 1;
    const literal = parseLiteral(candidate);
    let value = literal.literal ? literal.value : await resolveCandidate(candidate);
    for (const pipe of pipes) {
      if (value === undefined && !context.pipeUndefined) break;
      value = await applyPipe(pipe, value, context, hasFallback);
    }
    if (value !== undefined) return value;
  }
  return undefined;
};
