# What has changed?

## V3

Bou Parsing V3 replaces the string-based type identifiers with a `types` object that both types **and casts** values at runtime.

### New features in V3

A quick tour of what's new — the breaking-change notes below reference these:

- **Type tokens & custom types** — `types.string`, `types.number`, … validate _and_ cast at runtime; `defineType` creates your own (§1–§3). Tokens accept a default: `types.string({ default: 'x' })` fills in when the value is missing and makes the field non-optional in the inferred type.
- **`parser.flat`** — parses `data[key]` and merges the resulting object into the parent output, like `@combine` (the key itself is dropped).
- **`context.value` + zero-arg `await context.resolve()`** — `value` is the raw `data?.[key]`; calling `resolve()` with no arguments resolves it lazily (memoized per context).
- **`resolve`** — new export of `initializeParser` (and contextually as `context.resolve(input, overrides?)`): runs pattern/variable resolution and global transformers on raw input without a projection.
- **`context.store(key, fn, options?)` / `context.storage`** — get-or-compute caching for individual async values through the global `storage`, with in-flight dedupe, independent of `cache.enabled`.
- **`context.parent` / `context.path`** — `parent` chains contexts up to the root (`undefined` at the root); `path` is the chain of projections down to the current level.
- **Custom patterns** — define your own inline string syntaxes via the `patterns` config, powered by the same engine as `{{variables}}` (§9).
- **Isolated engines** — every `initializeParser` call is its own engine; `new Parser(globalContext)` is the advanced equivalent (§4).
- **React: `revalidate`** — `useParserValue` now returns `{ result, loading, error, revalidate }`; `revalidate(updatedData?)` re-parses with the last (or new) data.
- **New exports** — `defineType`, `isTypeToken`, `ParserCastError`, `variablesPattern`, `ParserPatternCycleError`, and the tree-shakeable `@bou-co/parsing/types` entry point.

### 1. String type identifiers are removed

Legacy identifiers (`'string'`, `'number'`, `'boolean'`, `'date'`, `'object'`, `'array'`, `'array<...>'`, `'any'`, `'unknown'`, `'undefined'`) are no longer valid projection values — using one throws a migration error at runtime. Other string literals still work as constants.

**V2:**

```ts
const myParser = createParser({
  title: 'string',
  priority: 'number',
  tags: 'array<string>',
});
```

**V3:**

```ts
import { createParser, types } from '../path-to/parser-config';

const myParser = createParser({
  title: types.string,
  priority: types.number,
  tags: types.array(types.string),
});
```

Migration is a find/replace: `'string'` → `types.string`, `'number'` → `types.number`, `'array<x>'` → `types.array(types.x)`, and so on. `initializeParser` now returns `{ createParser, resolve, cacheResult, types }` — re-export `types` (and the rest) from your parser config. Note that `types` is **not** a root export of `@bou-co/parsing`; get it from `initializeParser`, or import the tokens individually from the tree-shakeable `@bou-co/parsing/types` entry point. There is no `types.undefined`; use the `optional` util instead (accessing `types.undefined` throws a migration error rather than silently dropping the key).

### 2. Types now always cast values

Unlike most V2 identifiers (which passed values through untouched), V3 types coerce at runtime: `types.number` turns `'21'` into `21`, `types.date` parses date strings into `Date` instances, and values that cannot be cast throw a `ParserCastError`. The one V2 identifier that already coerced — `'date'`, via `new Date(...)` — becomes stricter: inputs that previously yielded an `Invalid Date` (`''` and `false` included) now throw, while `0` stays a valid epoch number. Behavior on failure is configurable via `initializeParser({ looseCasting })` (`true` passes the original value through with a warning, `'undefined'` drops the value — or applies the token's `default` when one is set). Fields whose input is `undefined`/`null` skip casting and stay optional; tokens with a `default` fill it in instead, and their field becomes non-optional in the inferred type.

### 3. Custom types

Define your own types with `defineType` — pass a casting function or a `{ fn, strict? }` object — and use the result directly as a projection value, with full type inference. There is no registration: custom types are plain values you create and import from anywhere (one-off inline types are fine too). A `strict: true` type always throws on failure regardless of `looseCasting`. For standalone type files, compose from the `@bou-co/parsing/types` entry point (e.g. `export const numbers = array(number);`).

### 4. Isolated parser engines

Each `initializeParser` call now creates an isolated engine with its own global context (variables, transformers, storage, casting options) and caches — previously the last call replaced the global state for every parser in the process. Parsers stay permanently bound to the engine that created them, which enables e.g. separate server and client configurations. The `Parser` statics (`Parser.parserGlobalContext`, `Parser.createParser`) are gone — accessing or assigning them now throws a migration error, so V2 code that configured the old singleton fails fast instead of silently running every parser with a blank config. `new Parser(globalContext)` is the advanced equivalent. Cast failures can be observed via the new `onCastError` context option.

### 5. The projection is the point of truth

Nested projections resolve from the schema instead of following the incoming data. Previously a nested object, nested parser, or `.flat` parser was silently skipped whenever the input lacked (or held a scalar at) its key — even when the projection inside contained constants, defaults, or value functions that never needed the data. Most users considered this a bug; parsing `{}` at the root already resolved those, only nested levels short-circuited.

What this means in practice:

- **Nested constants, type-token defaults, `@combine`, and `@if` now appear in the output without matching input.** Nested projections whose fields all depend on the missing data resolve to nothing and stay omitted, exactly as before.
- **Side effects now run for missing keys.** Value functions, `@combine` resolvers, `context.store` fetches, and `variableResolver` calls inside a nested projection execute even when the input lacks the key. If a nested parser wraps an expensive fetch that should only happen when data exists, opt out with a value function: `child: ({ data }) => (data['child'] ? childParser : undefined)`.
- **Arrays still require data.** `'@array': true` projections, array literals, and `parser.asArray` values keep their data-driven skip.
- **Recursive schemas terminate.** Self-referencing (or mutually referencing) parsers resolve the cycle once more with their data-independent fields, then stop — instead of relying on the data running out. Note that recursive schemas built as _literal object cycles_ cannot be hashed for caching; reference parsers through value functions instead.
- **Scalar-under-object no longer leaks the projection.** A truthy scalar at an object-projection key previously returned the raw projection object (live functions included); it now resolves the projection, with the scalar reachable at `context.parent.data`.
- **Legacy type keys fail fast.** A leftover v2 string identifier inside a nested projection now throws even when the input lacks that key.
- **Custom `generateKey` caveat.** Projection-driven parses always receive `{}` as data, so cache keys built only from projection + data collide across different parents. The default key (which hashes the full call) is unaffected.
- **Empty-result detection counts keys, not values.** An `after` hook or `@combine` that unconditionally injects keys makes every projection-driven resolution non-empty — hook output is output.

### 6. Nested context changes: `isRoot`, `parent`, hooks, and cache

In V2, a nested **parser** received the whole parent context in its instance-context slot. V3 passes the parent context as a proper third channel instead, which fixes several leaks:

- **`context.isRoot` is now `false` inside nested parsers.** V2 leaked `isRoot: true` into every nested parser (nested plain-object projections correctly reported `false`), and mutated the caller's context object to track it. V3 computes `isRoot` per level without mutation — it is `true` only at the actual root, for every kind of nesting. Once-per-parse work guarded by `context.isRoot` inside a nested parser no longer runs there; walk the new `context.parent` chain if you need the root level.
- **Hooks run once per level.** Because the parent context no longer doubles as the nested parser's instance context, global and per-call `before`/`after` hooks fire **once** per nesting level instead of twice (schema hooks fire for that parser's own levels but not inside nested inline object projections; at arrays hooks run per item). Idempotent hooks won't notice; hooks that count, push, or emit telemetry will see fewer calls.
- **Schema-level `cache` options no longer flow into nested parsers.** Each parser brings its own `createParser` cache config (per-call cache still propagates). With a custom `generateKey` that requires a cache `name`, a nested parse that previously inherited the parent's name can now throw `Caching options must have a name defined` — give the nested parser its own cache config.
- **Calling conventions changed with it.** A parser's signature is now `parser(input, instanceContext, parentContext)`. Passing a full parser context as the _second_ argument (the V2 convention for forwarding context) throws a targeted migration error — forward it as the third argument instead.

### 7. Smaller breaking details

- The `valueKeys` export (the V2 list of string type identifiers) is removed.
- `value`, `parent`, `path`, `store`, `resolve`, `pipes`, and `datalessPath` are now **reserved context keys**, written by the engine after your context spreads — custom context properties with those names (declaration-merged or passed via `withContext`/per-call) are silently overwritten. V2 only reserved `parser`, `data`, `key`, `projection`, `variables`, `isRoot`, `index`, `cache`, and `params`.
- `parser.asArray` is no longer the parser function itself but a derived variant — `parser.asArray === parser` is now `false`. It still hashes as its base parser, and calling it directly bypasses whole-parse caching.
- If your `storage` relies on the **default** cache key (no custom `generateKey`), expect a one-time cache invalidation: projection hashes changed when type identifiers became tokens. Storages with their own `generateKey` are unaffected unless they hash the projection. Going forward, token hashes are content-derived — editing a custom type's implementation (or its `strict`/`name`/`default`) intentionally invalidates entries that used it, and nested parsers hash by their own projection.

### 8. Pipes move out of `variables` into `pipes`

Pipe functions are engine-level machinery, not data — they no longer live in the `variables` namespace (which V2 §1 originally introduced). A pipe referenced in a `{{value | pipe}}` expression is now looked up from the new `pipes` config only; a pipe left in `variables` throws a targeted migration error naming the key path and telling you to move the function into `pipes`. Migration is moving the function definitions — the pipe code and the `{{x | pipe}}` usage strings stay identical:

**V2:**

```ts
initializeParser(() => ({
  variables: {
    currentYear: () => new Date().getFullYear(),
    uppercase: ({ data }) => String(data).toUpperCase(),
  },
}));
```

**V3:**

```ts
initializeParser(() => ({
  variables: {
    currentYear: () => new Date().getFullYear(),
  },
  pipes: {
    uppercase: ({ data }) => String(data).toUpperCase(),
  },
}));
```

`pipes` is configurable at all three levels like `variables` (global, `createParser`, per-call) and lands merged on `context.pipes`. Pipe _params_ that reference variables (`{{x | join:firstName}}`) still resolve from `variables` — they are data references. As a side effect, `{{...}}` no longer leaks pipe functions into the spread.

### 9. Variables are now a pattern (new `patterns` API)

`{{variable}}` interpolation is now implemented as a built-in **pattern** — a user-definable primitive that detects a regex match inside string values and resolves it. Existing `{{ }}` syntax, fallbacks, pipes, dot paths and `variableResolver` behave as before, with these deltas:

- **Resolved output is re-scanned by default** — a variable resolving to a string containing `{{other}}` now resolves that too (previously left literal). Opt out with `patterns: { variables: { rescan: false } }`. Cycles — and rescan chains more than 10 levels deep — throw `ParserPatternCycleError` instead of hanging.
- **`patterns` is global-only config** — unlike `variables`/`pipes` it cannot be set per-`createParser` or per-call; the registry is compiled once per engine from the global context.
- **Escaping now exists**: a backslash directly before a match suppresses it and is consumed (`\{{foo}}` outputs `{{foo}}`); `\\` before a match is a literal backslash. Existing content containing `\` immediately before `{{` will change output.
- **Matches are deduped per string** — the same `{{expression}}` occurring N times in one string resolves once (visible only with nondeterministic resolvers).
- **`$`-sequences in resolved values are now inserted literally** — previously `$&`, `$1` and `$$` in a resolved value were mangled by the string splice.
- **Cache lifetime**: user-defined patterns default to per-parse memoization (`cache: 'run'`), with `'none'` and `'storage'` (reuses the configured `storage`) as options. The `variableResolver` `cache()` callback keeps its engine-lifetime store — be aware that values cached there are served for the life of the engine, across requests and tenants; prefer a pattern with `cache: 'run'` or `'storage'` for per-request data.

See the README's Patterns section for the full API.

### Migrating a live site

Casting means values that silently passed through with a wrong shape in V2 now throw a `ParserCastError`. For a low-risk rollout, migrate with `looseCasting: 'undefined'` plus an `onCastError` reporter to surface those fields first, fix or retype them (`types.any` for intentional raw passthroughs), then remove `looseCasting` to return to the default throwing mode.

V3 also fails fast on the most common V2 leftovers instead of silently misbehaving: legacy string type keys (`'string'`, `'array<x>'`, …), pipes left in `variables`, the removed `Parser.parserGlobalContext` / `Parser.createParser` statics, `types.undefined`, and passing a full parser context as a parser's second argument all throw targeted migration errors that name the problem and the fix. These catches are transitional and will be removed in V4.

## V2

Bou Parsing V2 brings powerful new features like caching, dynamic projections, and context overriding. To support these new capabilities, the way context and variables are passed into parsers has been restructured.

## Breaking Changes

### 1. Variables in `initializeParser`

Global variables and pipe functions are now scoped under a `variables` key in the configuration returned by `initializeParser`.

**V1:**

```ts
export const { createParser } = initializeParser(() => {
  return {
    currentYear: new Date().getFullYear(),
  };
});
```

**V2:**

```ts
export const { createParser } = initializeParser(() => {
  return {
    variables: {
      currentYear: new Date().getFullYear(),
    },
  };
});
```

### 2. Instance Variables in Parser Executions

Instance data passed to a parser execution must now also be scoped under the `variables` key. This allows the second argument to accept other parser configurations like `cache` alongside `variables`.

**V1:**

```ts
const instanceData = {
  entity: 'world',
  uppercase: ({ data }) => data.toUpperCase(),
};

const result = await myParser(rawDataFromApi, instanceData);
```

**V2:**

```ts
const instanceOptions = {
  variables: {
    entity: 'world',
    uppercase: ({ data }) => data.toUpperCase(),
  },
};

const result = await myParser(rawDataFromApi, instanceOptions);
```

## New Features in V2

- **Caching and Storage:** Built-in caching support to store and retrieve query results, speeding up redundant parses.
- **Dynamic Projections:** Pass a function to `createParser` instead of a static object to evaluate projections dynamically based on the data.
- **Extending Parsers:** Use `.extend()` to build upon existing parsers without mutating the original definition.
- **Context Overriding:** Use `.withContext()` to inject or merge new context properties into an existing parser.
- **Lifecycle Hooks:** Register `before` and `after` hooks globally or locally to manage context or manipulate final results.
- **Transformers:** Define global conditional transformations (e.g., for automatic localization).
- **Array Index Tracking:** When parsing arrays, the `index` property is automatically populated in the context.
- **Chaining Parsers:** Output from one parser can easily be passed into another for multi-pass parsing.
