/* eslint-disable @typescript-eslint/no-explicit-any */
import { getFromObject } from './internal';
import { evaluateExpression } from './parser-expression';
import { ParserContext, ParserPattern, ParserPatternCacheMode, ParserPatternsConfig, PatternResolveInput } from './parser-types';

export const PATTERN_REGISTRY = Symbol('@bou-co/parsing:pattern-registry');
export const PATTERN_RUN_CACHE = Symbol('@bou-co/parsing:pattern-run-cache');

const MAX_PATTERN_DEPTH = 10;

export interface CompiledPattern {
  name: string;
  order: number;
  delimiters?: [string, string];
  match: RegExp;
  fullMatch: RegExp;
  expressions: boolean;
  rescan: boolean;
  cache: ParserPatternCacheMode;
  resolve: ParserPattern['resolve'];
}

export type CompiledPatternRegistry = CompiledPattern[];

interface InternalPatternContext extends ParserContext {
  [PATTERN_REGISTRY]?: CompiledPatternRegistry;
  [PATTERN_RUN_CACHE]?: Map<string, Promise<unknown>>;
}

export interface PatternMatch {
  pattern: CompiledPattern;
  raw: string;
  groups: RegExpExecArray;
  start: number;
  end: number;
  escaped?: boolean;
}

interface PatternGuard {
  depth: number;
  seen: Set<string>;
}

export class ParserPatternCycleError extends Error {
  public readonly chain: string[];
  constructor(chain: string[]) {
    super(`[@bou-co/parsing] Pattern resolution cycle detected: ${chain.join(' -> ')}`);
    this.name = 'ParserPatternCycleError';
    this.chain = chain;
  }
}

// The built-in {{variable}} pattern — lookup semantics only, the expression grammar lives in the engine
export const variablesPattern: ParserPattern = {
  delimiters: ['{{', '}}'],
  match: /\{\{([^}]+)\}\}/g,
  // Variable lookups are context-sensitive (current, per-level instance variables), so a per-run memo would leak values across levels
  cache: 'none',
  resolve: async ({ path, context }) => {
    const { variables, variableResolver } = context;
    if (path === '...') return variables;
    // The resolver receives only the head segment; the tail is walked afterwards
    const [head, ...rest] = path.split('.');
    const cacheVariable = <T>(value: T): T => (context.parser ? context.parser.cacheVariable(head, value) : value);
    let value: unknown = await getFromObject(variables, head, context);
    if (value === undefined) {
      // Built-in context heads are terminal (explicit variables still win): they never fall through
      // to variableResolver, so context lookups can't trigger external fetches
      if (head === 'ctx' || head === 'context') value = context;
      else if (head === 'data') value = context.data;
      else if (variableResolver) value = await variableResolver(head, context, cacheVariable);
    }
    if (typeof value === 'function') value = await value(context);
    if (value && typeof value === 'object' && rest.length) value = await getFromObject(value, rest.join('.'), context);
    return value;
  },
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildDelimitedMatch = (name: string, delimiters: [string, string]): RegExp => {
  const [start, end] = delimiters;
  if (typeof start !== 'string' || typeof end !== 'string' || !start || !end) {
    throw new Error(`[@bou-co/parsing] Pattern "${name}" delimiters must be two non-empty strings, e.g. ['{{', '}}']`);
  }
  // Lazy tempered body: anything (newlines included) that does not contain the end delimiter
  return new RegExp(`${escapeRegExp(start)}((?:(?!${escapeRegExp(end)})[\\s\\S])+?)${escapeRegExp(end)}`, 'g');
};

const compileOne = (name: string, pattern: ParserPattern, order: number): CompiledPattern => {
  if ((!(pattern.match instanceof RegExp) && !pattern.delimiters) || typeof pattern.resolve !== 'function') {
    throw new Error(`[@bou-co/parsing] Pattern "${name}" must define a resolve function and either a match regex or delimiters`);
  }
  // Expressions need a bounded capture that can hold the grammar (spaces, |, ||) — only delimiters guarantee that
  if (pattern.expressions === true && !pattern.delimiters) {
    throw new Error(`[@bou-co/parsing] Pattern "${name}" requires delimiters for expressions — declare delimiters: [start, end] or set expressions: false`);
  }
  const match = pattern.match instanceof RegExp ? pattern.match : buildDelimitedMatch(name, pattern.delimiters as [string, string]);
  const { source } = match;
  const flags = match.flags.includes('g') ? match.flags : match.flags + 'g';
  return {
    name,
    order,
    delimiters: pattern.delimiters,
    // Private clones so scanning never mutates the user's regex and full-string tests stay anchored
    match: new RegExp(source, flags),
    fullMatch: new RegExp(`^(?:${source})$`, flags.replace(/[gy]/g, '')),
    expressions: pattern.delimiters ? pattern.expressions !== false : false,
    rescan: pattern.rescan !== false,
    cache: pattern.cache ?? 'run',
    resolve: pattern.resolve,
  };
};

export const compilePatternRegistry = (config?: ParserPatternsConfig): CompiledPatternRegistry => {
  const merged: Record<string, ParserPattern> = { variables: variablesPattern };
  if (config) {
    for (const [name, pattern] of Object.entries(config)) {
      if (pattern === false) {
        delete merged[name];
        continue;
      }
      // Same-named keys merge partially so re-delimiting keeps the default resolve
      const base = merged[name];
      const next: ParserPattern = base ? { ...base, ...pattern } : (pattern as ParserPattern);
      // New delimiters without an explicit match rebuild the regex instead of keeping the stale inherited one
      if (base && pattern.delimiters && !pattern.match) delete next.match;
      merged[name] = next;
    }
  }
  return Object.entries(merged).map(([name, pattern], order) => compileOne(name, pattern, order));
};

let defaultRegistry: CompiledPatternRegistry | undefined;

const getRegistry = (context: ParserContext): CompiledPatternRegistry =>
  (context as InternalPatternContext)[PATTERN_REGISTRY] ?? (defaultRegistry ??= compilePatternRegistry());

const countPrecedingBackslashes = (text: string, index: number, floor = 0): number => {
  let count = 0;
  for (let i = index - 1; i >= floor && text[i] === '\\'; i--) count++;
  return count;
};

const scanText = (text: string, registry: CompiledPatternRegistry): PatternMatch[] => {
  const found: PatternMatch[] = [];
  for (const pattern of registry) {
    pattern.match.lastIndex = 0;
    let groups: RegExpExecArray | null;
    while ((groups = pattern.match.exec(text))) {
      // Guard against zero-length matches looping forever
      if (!groups[0]) {
        pattern.match.lastIndex++;
        continue;
      }
      const start = groups.index;
      // A backslash before the match escapes it; \\ is a literal backslash, so only an odd run escapes
      const escaped = countPrecedingBackslashes(text, start) % 2 === 1;
      found.push({ pattern, raw: groups[0], groups, start, end: start + groups[0].length, escaped });
    }
  }
  // Longest match first, then registration order
  found.sort((a, b) => a.start - b.start || b.end - a.end || a.pattern.order - b.pattern.order);
  const accepted: PatternMatch[] = [];
  let cursor = 0;
  for (const match of found) {
    if (match.start < cursor) continue;
    accepted.push(match);
    cursor = match.end;
  }
  return accepted;
};

const matchKey = (match: PatternMatch) => `${match.pattern.name}\u0000${match.raw}`;

const EMPTY_VALUES = new Map<string, unknown>();

const spliceText = (text: string, matches: PatternMatch[], values: Map<string, unknown>): string => {
  let out = '';
  let cursor = 0;
  for (const match of matches) {
    // Halve the backslash run directly before a match (\\ -> \); an odd run marked it escaped
    const backslashes = countPrecedingBackslashes(text, match.start, cursor);
    out += text.slice(cursor, match.start - backslashes) + '\\'.repeat(backslashes >> 1);
    out += match.escaped ? match.raw : String(values.get(matchKey(match)));
    cursor = match.end;
  }
  return out + text.slice(cursor);
};

// Cache layer around pattern.resolve — grammar and pipes are never cached
const resolvePattern = (pattern: CompiledPattern, path: string, match: PatternMatch, context: ParserContext): Promise<unknown> => {
  const input: PatternResolveInput = { path, raw: match.raw, groups: match.groups, context };
  if (pattern.cache === 'none') return Promise.resolve(pattern.resolve(input));
  const key = `pattern:${pattern.name}:${path}`;
  if (pattern.cache === 'storage') {
    if (!context.store) return Promise.resolve(pattern.resolve(input));
    return context.store(key, () => pattern.resolve(input));
  }
  const runCache = (context as InternalPatternContext)[PATTERN_RUN_CACHE];
  if (!runCache) return Promise.resolve(pattern.resolve(input));
  const existing = runCache.get(key);
  if (existing) return existing;
  const promise = Promise.resolve(pattern.resolve(input));
  runCache.set(key, promise);
  return promise;
};

const evaluateMatch = (match: PatternMatch, context: ParserContext): Promise<unknown> => {
  const { pattern, groups } = match;
  const expression = groups[1] ?? groups[0];
  if (!pattern.expressions) return resolvePattern(pattern, expression, match, context);
  return evaluateExpression(expression, context, (candidate) => resolvePattern(pattern, candidate, match, context));
};

const evaluateAndRescan = async (match: PatternMatch, context: ParserContext, guard?: PatternGuard): Promise<unknown> => {
  const key = `${match.pattern.name}:${match.raw}`;
  if (guard && (guard.seen.has(key) || guard.depth >= MAX_PATTERN_DEPTH)) {
    throw new ParserPatternCycleError([...guard.seen, key]);
  }
  const value = await evaluateMatch(match, context);
  if (typeof value === 'string' && match.pattern.rescan) {
    const seen = new Set(guard?.seen);
    seen.add(key);
    return resolvePatternsInText(value, context, { depth: (guard?.depth ?? 0) + 1, seen });
  }
  return value;
};

// Main entry: returns the input string synchronously when it contains no patterns
export const resolvePatternsInText = (text: string, context: ParserContext, guard?: PatternGuard): unknown => {
  const registry = getRegistry(context);
  const matches = scanText(text, registry);
  if (!matches.length) return text;

  const active = matches.filter((match) => !match.escaped);
  // A single match spanning the whole string returns the resolved value untouched so objects and numbers survive
  if (matches.length === 1 && active.length === 1 && matches[0].start === 0 && matches[0].end === text.length) {
    return evaluateAndRescan(matches[0], context, guard);
  }
  if (!active.length) return spliceText(text, matches, EMPTY_VALUES);

  // Resolve each unique match once, all in parallel
  const unique = new Map<string, Promise<unknown>>();
  for (const match of active) {
    const key = matchKey(match);
    if (!unique.has(key)) unique.set(key, evaluateAndRescan(match, context, guard));
  }
  const keys = [...unique.keys()];
  return Promise.all(unique.values()).then((resolved) => {
    const values = new Map(keys.map((key, index) => [key, resolved[index]]));
    return spliceText(text, matches, values);
  });
};

// Anchored whole-string test across the registry, used where a pattern may feed a nested projection
export const matchFullPattern = (text: string, context: ParserContext): PatternMatch | undefined => {
  const registry = getRegistry(context);
  for (const pattern of registry) {
    const groups = pattern.fullMatch.exec(text) as RegExpExecArray | null;
    if (groups) return { pattern, raw: text, groups, start: 0, end: text.length };
  }
  return undefined;
};

export const resolvePatternMatch = (match: PatternMatch, context: ParserContext): Promise<unknown> => {
  return evaluateAndRescan(match, context);
};

let defaultVariablesCompiled: CompiledPattern | undefined;

const LEGACY_VARIABLE_FULL = /^\{\{([^}]+)\}\}$/;

// Backs the public getVariableValue export: accepts the active variables syntax, the legacy {{path}} form, or a bare expression
export const evaluateVariableExpression = (input: string, context: ParserContext): Promise<unknown> => {
  const registry = getRegistry(context);
  const pattern = registry.find((item) => item.name === 'variables') ?? (defaultVariablesCompiled ??= compileOne('variables', variablesPattern, 0));
  let groups = pattern.fullMatch.exec(input) as RegExpExecArray | null;
  if (!groups) groups = LEGACY_VARIABLE_FULL.exec(input);
  const expression = groups ? (groups[1] ?? groups[0]) : input;
  const execGroups = (groups ?? Object.assign([input, input], { index: 0, input })) as RegExpExecArray;
  const match: PatternMatch = { pattern, raw: input, groups: execGroups, start: 0, end: input.length };
  if (!pattern.expressions) return resolvePattern(pattern, expression, match, context);
  return evaluateExpression(expression, context, (candidate) => resolvePattern(pattern, candidate, match, context));
};
