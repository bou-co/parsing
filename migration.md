# What has changed?

## V3

Bou Parsing V3 replaces the string-based type identifiers with a `types` object that both types **and casts** values at runtime.

### New features in V3

A quick tour of what's new — the breaking-change notes below reference these:

- **Type tokens & custom types** — `types.string`, `types.number`, … validate _and_ cast at runtime; `defineType` (from a function, a class, or a definition object) creates your own (§1–§3). Every token is configured by chaining — `.default(v)`, `.required`, `.strict`, `.loose` — or by calling it with the same options (`types.string({ default: 'x' })`); a default makes the field non-optional in the inferred type, `required` makes a missing value an error.
- **Use-case catalogue** — `text`, `email`, `url`, `slug`, `color`, `tel`, `mimeType`, `json`, `unique`, `oneOf` and `pattern` ship with no dependencies, each with chainable accessors (`types.date.iso`, `types.number.round(2)`, `types.url.pathname`, `types.text.wordCount`); every string-based type inherits the whole `string` accessor set.
- **Types as pipes** — every type, built-in or registered under the new `types` config (global, `createParser`, or per call), is a template pipe under the same name: `{{ price | round:2 }}`, `{{ contact | email || "n/a" }}` (token-parameter factories such as `unique(item)` and `schema(validator)` are the exception — they have no template form).
- **Opt-in subsets** — `@bou-co/parsing/types/format` (`formatDate`, `currency`, `percent`, …), `types/data` (`record`, `schema`, `coords`, `locale`), `types/content` (`html`, `markdown` behind sanitiser adapters; the only path with peer dependencies).
- **`get(path, type)` / `get(path, from, type)`** — cast a looked-up value in the engine, so one raw field projects several outputs (`phoneTitle: get('phone', types.tel), phoneLink: get('phone', types.tel.href)`).
- **`parser.flat`** — parses `data[key]` and merges the resulting object into the parent output, like `@combine` (the key itself is dropped).
- **`context.value` + zero-arg `await context.resolve()`** — `value` is the raw `data?.[key]`; calling `resolve()` with no arguments resolves it lazily (memoized per context).
- **`resolve`** — new export of `initializeParser` (and contextually as `context.resolve(input, overrides?)`): runs pattern/variable resolution and global transformers on raw input without a projection.
- **`context.store(key, fn, options?)` / `context.storage`** — get-or-compute caching for individual async values through the global `storage`, with in-flight dedupe, independent of `cache.enabled`.
- **`cacheResult(key, fn)`** — new export of `initializeParser`: wraps a value function so its result is cached through the global `storage` under a variable-interpolated key (`'profile-{{data.uid}}'`); works as a projection value, inside `resolve` inputs, or awaited standalone.
- **`context.parent` / `context.path`** — `parent` chains contexts up to the root (`undefined` at the root); `path` is the chain of projections down to the current level.
- **Custom patterns** — define your own inline string syntaxes via the `patterns` config, powered by the same engine as `{{variables}}` (§9).
- **Built-in context variable heads** — `{{data.*}}` (the current level's input data) and `{{ctx.*}}` / `{{context.*}}` (the full parser context) resolve live from the node context; explicit variables can shadow them, and they never fall through to a `variableResolver` (§9).
- **Isolated engines** — every `initializeParser` call is its own engine; `new Parser(globalContext)` is the advanced equivalent (§4).
- **React: `revalidate`** — `useParserValue` now returns `{ result, loading, error, revalidate }`; `revalidate(updatedData?)` re-parses with the last (or new) data.
- **New exports** — `defineType`, `TypeToken` and the family classes (`StringType`, …), `isTypeToken`, `isMissing`, `applyCast`, `notAPipe`, `ParserCastError`, `variablesPattern`, `ParserPatternCycleError`, and the tree-shakeable `@bou-co/parsing/types` entry point with its `types/format`, `types/data`, `types/content` and `types/all` subsets.

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
  tags: types.array.of(types.string),
});
```

Migration is a find/replace: `'string'` → `types.string`, `'number'` → `types.number`, `'array<x>'` → `types.array.of(types.x)`, and so on. `initializeParser` now returns `{ createParser, resolve, cacheResult, types }` — re-export `types` (and the rest) from your parser config. Note that `types` is **not** a root export of `@bou-co/parsing`; get it from `initializeParser`, or import the tokens individually from the tree-shakeable `@bou-co/parsing/types` entry point. There is no `types.undefined`; use the `optional` util instead (accessing `types.undefined` throws a migration error rather than silently dropping the key).

### 2. Types now always cast values

Unlike most V2 identifiers (which passed values through untouched), V3 types coerce at runtime: `types.number` turns `'21'` into `21`, `types.date` parses date strings into `Date` instances, and a value that is present and cannot be cast throws a `ParserCastError`. Missing data is never a failure: `undefined`, `null` and `''` skip casting for **every** type and the key is omitted — or the token's `default` fills it — unless the token is `.required`. (`false` and `0` are values. Note that V2's `'string'` passed `''` through; V3 drops it.) The one V2 identifier that already coerced — `'date'`, via `new Date(...)` — becomes stricter: `false` and unparseable strings now throw, while `0` stays a valid epoch number.

Behaviour on failure is configurable via `looseCasting: true` — globally in `initializeParser`, per `createParser`, or per call: log a warning and drop the value (or apply the default) instead of throwing. `'undefined'` is a deprecated alias of `true`. There is no mode that passes an uncast value through, so the inferred output types are true at runtime in every configuration. A token pins its own flow with `.strict` / `.loose`, and the `onCastError` context option observes every failure before the policy applies.

### 3. Custom types

Define your own types with `defineType` — from a casting function, from a class (`defineType(SkuType)` for `class SkuType extends StringType`, which inherits every `string` accessor), or from a definition object `{ fn, name?, default?, required?, strict?, loose?, extends?, accessors?, methods? }` — and use the result directly as a projection value, with full type inference. Registration is optional: custom types are plain values you import from anywhere (one-off inline types are fine too); registering one under the `types` config at any context level additionally makes it a template pipe. A `strict: true` type always throws on failure regardless of `looseCasting`. For standalone type files, compose from the `@bou-co/parsing/types` entry point (e.g. `export const numbers = array.of(number);`).

### 4. Isolated parser engines

Each `initializeParser` call now creates an isolated engine with its own global context (variables, transformers, storage, casting options) and caches — previously the last call replaced the global state for every parser in the process. Parsers stay permanently bound to the engine that created them, which enables e.g. separate server and client configurations. The `Parser` statics (`Parser.parserGlobalContext`, `Parser.createParser`) are gone — accessing or assigning them now throws a migration error, so V2 code that configured the old singleton fails fast instead of silently running every parser with a blank config. `new Parser(globalContext)` is the advanced equivalent. Cast failures can be observed via the new `onCastError` context option.

### 5. The projection is the point of truth

Nested projections resolve from the schema instead of following the incoming data. Previously a nested object, nested parser, or `.flat` parser was silently skipped whenever the input lacked its key or held a scalar there (`null`, `''`, `0`, `false`, or any other non-object value) — even when the projection inside contained constants, defaults, or value functions that never needed the data. Most users considered this a bug; parsing `{}` at the root already resolved those, only nested levels short-circuited.

What this means in practice:

- **Nested constants, type-token defaults, `@combine`, and `@if` now appear in the output without matching input.** Nested projections whose fields all depend on the missing data resolve to nothing and stay omitted, exactly as before.
- **Side effects now run for missing keys.** Value functions, `@combine` resolvers, `context.store` fetches, and `variableResolver` calls inside a nested projection execute even when the input lacks the key. If a nested parser wraps an expensive fetch that should only happen when data exists, opt out with a value function: `child: ({ data }) => (data['child'] ? childParser : undefined)`.
- **Arrays still require data.** `'@array': true` projections, array literals, and `parser.asArray` values keep their data-driven skip.
- **Recursive schemas terminate.** Self-referencing (or mutually referencing) parsers resolve the cycle once more with their data-independent fields, then stop — instead of relying on the data running out. Note that recursive schemas built as _literal object cycles_ cannot be hashed for caching; reference parsers through value functions instead.
- **Scalar-under-object no longer leaks the projection.** A truthy scalar at an object-projection key previously returned the raw projection object (live functions included); it now resolves the projection, with the scalar reachable at `context.parent.value` (`context.parent.data` is the parent level's data object).
- **Legacy type keys fail fast.** A leftover v2 string identifier inside a nested projection now throws even when the input lacks that key.
- **Custom `generateKey` caveat.** Projection-driven parses always receive `{}` as data, so cache keys built only from projection + data collide across different parents. The default key (which hashes the full call) is unaffected.
- **Empty-result detection counts keys, not values.** An `after` hook or `@combine` that unconditionally injects keys makes every projection-driven resolution non-empty — hook output is output.

### 6. Nested context changes: `isRoot`, `parent`, hooks, and cache

In V2, a nested **parser** received the whole parent context in its instance-context slot. V3 passes the parent context as a proper third channel instead, which fixes several leaks:

- **`context.isRoot` is now `false` inside nested parsers.** V2 leaked `isRoot: true` into every nested parser (nested plain-object projections correctly reported `false`), and mutated the caller's context object to track it. V3 computes `isRoot` per level without mutation — it is `true` only at the actual root, for every kind of nesting. It is also written after your context spreads, so it can no longer be forced through a custom context property. Once-per-parse work guarded by `context.isRoot` inside a nested parser no longer runs there; walk the new `context.parent` chain if you need the root level.
- **Hooks run once per level.** Because the parent context no longer doubles as the nested parser's instance context, global and per-call `before`/`after` hooks fire **once** per nesting level instead of twice (schema hooks fire for that parser's own levels but not inside nested inline object projections; at arrays hooks run per item). Idempotent hooks won't notice; hooks that count, push, or emit telemetry will see fewer calls.
- **`.extend()` / `.withContext()` compose hooks instead of replacing them.** In V2 an extension's `before`/`after` overwrote the base parser's hook; in V3 they chain — the base hook runs first, then the extension's, which receives the context the base hook returned (identical function references dedupe). A base hook that a `.withContext({ before })` used to silence now runs again; if you relied on replacement, put the base behavior behind a flag the extension's context can switch off.
- **Schema-level `cache` options no longer flow into nested parsers.** Each parser brings its own `createParser` cache config (per-call cache still propagates). With a custom `generateKey` that requires a cache `name`, a nested parse that previously inherited the parent's name can now throw `Caching options must have a name defined` — give the nested parser its own cache config.
- **Calling conventions changed with it.** A parser's signature is now `parser(input, instanceContext, parentContext)`. Passing a full parser context as the _second_ argument (the V2 convention for forwarding context) throws a targeted migration error — forward it as the third argument instead.

### 7. Smaller breaking details

- `react` is no longer a hard dependency — it is now an **optional `peerDependency`**. If you use `@bou-co/parsing/react` (or relied on `react` arriving transitively), install it yourself.
- The package now declares an engines floor: **Node `^20.19.0 || >=22.12.0`** (the build targets es2022).
- The `valueKeys` export (the V2 list of string type identifiers) is removed.
- The `asyncMapObject` util now resolves entries in **parallel** (`Promise.all`) instead of sequentially in key order — side-effecting callbacks lose their serialization guarantee.
- `getVariableValue` no longer auto-wraps bare names in `{{ }}` — it accepts the active variables syntax, the legacy `{{path}}` form, or a bare expression. Results are equivalent under the default delimiters, and re-delimited syntaxes now work too.
- Storage callbacks (`generateKey`, `match`, `add`) now receive a context whose `parser` is the engine instance — in V2 it was `undefined` for plain parser calls.
- `value`, `parent`, `path`, `store`, `resolve`, `pipes`, and `types` are now **reserved context keys**, written by the engine after your context spreads — custom context properties with those names (declaration-merged or passed via `withContext`/per-call) are silently overwritten; `datalessPath` is set on the parent context during projection-driven resolution and inherited from there, so treat it as reserved too. V2 only reserved `parser`, `data`, `key`, `projection`, `variables`, `isRoot`, `index`, `cache`, and `params`.
- `parser.asArray` is no longer the parser function itself but a derived variant — `parser.asArray === parser` is now `false`. It still hashes as its base parser, and calling it directly bypasses whole-parse caching.
- If your `storage` relies on the **default** cache key (no custom `generateKey`), expect a one-time cache invalidation: projection hashes changed when type identifiers became tokens. Storages with their own `generateKey` are unaffected unless they hash the projection. Going forward, token hashes are content-derived — editing a custom type's implementation (or its `name`, `default`, `required`, `strict`/`loose` policy, item type or factory options) intentionally invalidates entries that used it, nested parsers hash by their own projection, and `get()` readers hash by their path and type.

### 8. Pipes move out of `variables` into `pipes`

Pipe functions are engine-level machinery, not data — they no longer live in the `variables` namespace (which V2 §1 originally introduced). A pipe referenced in a `{{value | pipe}}` expression is now looked up from the new `pipes` config only; a pipe left in `variables` throws a targeted migration error naming the key path and telling you to move the function into `pipes` — unless a type of that name exists: pipes resolve from `pipes`, then from types (`email`, `trim`, `round`, `join`, …), then the `variables` catch, so a V2 pipe named like a built-in type or accessor is silently replaced by the type pipe. Grep for those names first. Migration is moving the function definitions — the pipe code and the `{{x | pipe}}` usage strings stay identical:

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
- **Built-in heads shadow the `variableResolver`** — `{{data.*}}`, `{{ctx.*}}` and `{{context.*}}` now resolve from the live context, checked after explicit variables but before the resolver. A `variableResolver` that previously received `data`, `ctx`, or `context` as its head segment is no longer called for them (rename the variable, or define it explicitly — explicit variables still win over the built-ins).
- **Cache lifetime**: user-defined patterns default to per-parse memoization (`cache: 'run'`), with `'none'` and `'storage'` (reuses the configured `storage`) as options. The `variableResolver` `cache()` callback keeps its engine-lifetime store — be aware that values cached there are served for the life of the engine, across requests and tenants; prefer a pattern with `cache: 'run'` or `'storage'` for per-request data.

See the README's Patterns section for the full API.

### 10. Release-candidate deltas

Only relevant if you adopted a `3.0.0-rc.*` build before the casting upgrade finished:

| RC form                                            | Now                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `types.array(types.string)`                        | `types.array.of(types.string)` — `types.array(token)` throws                         |
| `types.array(types.string)({ default: [] })`       | `types.array({ default: [] }).of(types.string)`                                      |
| `looseCasting: 'undefined'`                        | `looseCasting: true` (alias still accepted, removed in V4)                           |
| `looseCasting: true` passing the raw value through | removed — failed casts are dropped (or defaulted)                                    |
| `types.email` lower-casing the address             | kept as written — `.normalized` or `.lowerCase`                                      |
| `types.tel` → `+3580401234567`                     | kept as written — `.normalized` (`+358401234567`, `(0)` dropped after `+`) / `.href` |
| `types.text` folding newlines to spaces            | line breaks kept — `.singleLine` folds                                               |
| `''` cast as a value                               | missing for every type — add `.required` where an empty value must be an error       |
| `types.string({ default: 'x' })`                   | unchanged — or `types.string.default('x')`                                           |
| A token in `variables`/`pipes`                     | `was called as a value function or pipe — register types under types`                |
| `types.x('nope')`                                  | `expected an options object` — `types.x({ default, required, strict, loose })`       |
| `get(path, from)` only                             | unchanged — plus `get(path, type)` / `(path, from, type)` casting in the engine      |

### Migrating a live site

Install the release candidate explicitly (`npm i @bou-co/parsing@v3-rc`; `latest` is still V2). Casting means values that silently passed through with a wrong shape in V2 now throw a `ParserCastError`. For a low-risk rollout, migrate with `looseCasting: true` plus an `onCastError` reporter to surface those fields first, fix or retype them (`types.any` for intentional raw passthroughs), then remove `looseCasting` to return to the default throwing mode.

V3 also fails fast on the most common V2 leftovers instead of silently misbehaving: legacy string type keys (`'string'`, `'array<x>'`, …), pipes left in `variables`, the removed `Parser.parserGlobalContext` / `Parser.createParser` statics, `types.undefined`, and passing a full parser context as a parser's second argument all throw targeted migration errors that name the problem and the fix. These catches — and the `looseCasting: 'undefined'` alias — are transitional and will be removed in V4. A token passed as a call argument (`types.array(types.x)`) or placed in `variables`/`pipes` also throws a targeted error, but that one is permanent design.

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
