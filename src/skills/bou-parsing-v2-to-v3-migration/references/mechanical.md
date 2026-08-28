# Tier 1 — mechanical changes

Every change in this file is a find/replace, and v3 throws a targeted error for each one if
you miss it. Do all of this before touching anything in `behavioural.md`.

Contents:

1. [String type identifiers → type tokens](#1-string-type-identifiers--type-tokens)
2. [`initializeParser` return shape](#2-initializeparser-return-shape)
3. [Pipes move out of `variables`](#3-pipes-move-out-of-variables)
4. [Removed `Parser` statics](#4-removed-parser-statics)
5. [`valueKeys` removed](#5-valuekeys-removed)
6. [Parser call signature](#6-parser-call-signature)
7. [Install-level changes](#7-install-level-changes)
8. [Codemod strategy](#8-codemod-strategy)

---

## 1. String type identifiers → type tokens

The headline change. `'string'`, `'number'`, `'boolean'`, `'date'`, `'object'`, `'array'`,
`'array<...>'`, `'any'`, `'unknown'`, `'undefined'` are no longer valid projection values.
Using one throws at runtime, naming the key path and the fix.

**v2:**

```ts
const myParser = createParser({
  title: 'string',
  priority: 'number',
  tags: 'array<string>',
  meta: 'object',
  published: 'date',
});
```

**v3:**

```ts
import { createParser, types } from '../path-to/parser-config';

const myParser = createParser({
  title: types.string,
  priority: types.number,
  tags: types.array.of(types.string),
  meta: types.object,
  published: types.date,
});
```

Mapping:

| v2                | v3                                   |
| ----------------- | ------------------------------------ |
| `'string'`        | `types.string`                       |
| `'number'`        | `types.number`                       |
| `'boolean'`       | `types.boolean`                      |
| `'date'`          | `types.date`                         |
| `'object'`        | `types.object`                       |
| `'array'`         | `types.array`                        |
| `'array<string>'` | `types.array.of(types.string)`       |
| `'array<number>'` | `types.array.of(types.number)`       |
| `'any'`           | `types.any`                          |
| `'unknown'`       | `types.unknown`                      |
| `'undefined'`     | the `optional` util, or omit the key |

**Other string literals still work as constants.** `postType: 'blogPost'` is unaffected — only
the nine reserved identifiers (plus the `array<...>` pattern) changed meaning. This is what makes the codemod safe: you're
replacing a closed set of exact strings, not all strings.

Two details worth flagging:

- **There is no `types.undefined`.** Accessing it throws rather than silently dropping the key.
  It's defined as a non-enumerable getter, so `{ ...types }`, `Object.keys(types)`, and
  `JSON.stringify(types)` don't trip it — only direct access.
- **Nested projections are checked too**, and they now throw _even when the input lacks that
  key_, because nested resolution is projection-driven. A leftover identifier buried in a
  rarely-populated nested projection fails immediately rather than lying dormant.

### Standalone type files

For type files that shouldn't import the engine, use the tree-shakeable entry point:

```ts
// my-types.ts
import { array, number, string, defineType } from '@bou-co/parsing/types';

export const scores = array.of(number);
export const slug = defineType((value) => {
  if (typeof value !== 'string') throw new Error('Invalid slug');
  return value.toLowerCase().replace(/\s+/g, '-');
});
```

These are plain values — importable anywhere, usable with any engine configuration.

### Registering types

v2 casting helpers that lived in `variables` or `pipes` become tokens (`defineType(fn)`) and,
where templates need them, are registered under `types` — globally
(`initializeParser({ types: { sku } })`, which also extends the returned namespace), per
`createParser`, or per call. Registration makes every token a pipe under its name. An accessor
map under an existing family's name extends that family; a token under a built-in's name
replaces it with a warning; an accessor map under an unknown name throws; a root accessor name
declared by two registered families is dropped with a warning (the qualified form still works).
A token left in `variables` or `pipes` throws a targeted error at first use.

---

## 2. `initializeParser` return shape

**v2** returned `{ createParser }`.

**v3** returns `{ createParser, resolve, cacheResult, types }`.

```ts
// parser-config.ts
export const { createParser, resolve, cacheResult, types } = initializeParser({/* … */});
```

You must re-export `types` from your parser config, because **`types` is not a root export of
the package**. `import { types } from '@bou-co/parsing'` does not work. The alternatives are the
config re-export above, or individual tokens from `@bou-co/parsing/types`.

All four are worth re-exporting even if unused yet — `cacheResult` is the one people forget
because it landed later in v3.

---

## 3. Pipes move out of `variables`

v2 put pipe functions in the `variables` namespace — a category error, since pipes are engine
machinery rather than data. v3 gives them their own `pipes` config.

**v2:**

```ts
initializeParser(() => ({
  variables: {
    currentYear: () => new Date().getFullYear(),
    uppercase: ({ data }) => String(data).toUpperCase(),
  },
}));
```

**v3:**

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

**The migration is moving the definitions only.** The pipe function bodies and every
`{{x | pipe}}` usage string stay byte-identical. That's what makes this a mechanical change
despite touching config.

Details:

- `pipes` is configurable at all three levels (global, `createParser`, per-call), like
  `variables`, and lands merged on `context.pipes`.
- A pipe left in `variables` throws an error naming the key path and telling you to move it —
  **unless a type of that name exists**. Lookup order is `pipes` → types (`email`, `slug`, `trim`,
  `round`, `join`, `split`, `iso`, `year`, …) → the `variables` catch, so a v2 pipe named like a
  built-in type or root accessor is silently replaced by the type pipe: different output, and a
  `ParserCastError` instead of the hint. Grep your v2 `variables` for those names first. Dotted
  pipe names (`{{x | fmt.upper}}`) get the hint too, unless the head is a type name —
  `variables.date.iso` is shadowed by the `date.iso` accessor.
- **Pipe _parameters_ that reference variables still resolve from `variables`.**
  `{{x | join:firstName}}` looks up `firstName` in `variables` — those are data references, not
  machinery. This asymmetry is intentional; don't move parameter sources.
- Side effect: `{{...}}` no longer leaks pipe functions into the spread.

### How to find them

A function in `variables` is a pipe if it appears after a `|` in any template string. Grep for
`| ` inside `{{ }}` across your content and templates, collect the names, and move exactly
those. Functions in `variables` that are _only_ used as variables (`{{currentYear}}`) stay
where they are — variables are allowed to be functions.

---

## 4. Removed `Parser` statics

v2 configured a process-wide singleton. The last `initializeParser` call in a process replaced
the global state for **every** parser — a latent bug that bit anyone wanting separate server
and client configurations.

v3 makes each `initializeParser` call an isolated engine. The statics are gone and throw on
access, so v2 code that configured the singleton fails fast instead of silently running every
parser with a blank config.

| v2                                    | v3                                                         |
| ------------------------------------- | ---------------------------------------------------------- |
| `Parser.parserGlobalContext = config` | `initializeParser(config)`                                 |
| reading `Parser.parserGlobalContext`  | read from your own config module                           |
| `Parser.createParser(projection)`     | `const { createParser } = initializeParser(config)`        |
| —                                     | `new Parser(globalContext)` for the advanced/instance form |

```ts
// v3 advanced form, when you need the engine instance
const engine = new Parser({ variables: { name: 'bob' } });
const parser = engine.createParser({ title: types.string });
```

This change is also an opportunity: separate engines are now the supported way to run a strict
server configuration next to a lenient client one.

```ts
// server-config.ts
export const { createParser, types } = initializeParser({ storage: redisStorage, cache: { enabled: true } });

// client-config.ts
export const { createParser, types } = initializeParser({ looseCasting: true });
```

Parsers stay permanently bound to their creating engine, and nesting across configurations is
safe — the nested parse keeps its own transformers, whole-parse cache storage, and variable
cache while parent context values still merge down (on collisions the parent's win).

---

## 5. `valueKeys` removed

The v2 export listing the string type identifiers is gone. Any code importing it was almost
certainly validating projections against the identifier list; with tokens, use `isTypeToken`
instead.

```ts
import { isTypeToken } from '@bou-co/parsing';
if (isTypeToken(value)) {
  /* … */
}
```

---

## 6. Parser call signature

A parser is now `parser(input, instanceContext, parentContext)`.

The v2 convention for forwarding context was to pass the full parser context as the **second**
argument. That now throws a targeted error, because the second slot is the instance-context
slot and the parent context has its own channel.

**v2:**

```ts
child: (context) => child(context.data.child, context);
```

**v3:**

```ts
child: (context) => childParser(context.data.child, undefined, context);
```

In practice you rarely need this — using the parser directly as a projection value
(`child: childParser`) handles context forwarding for you. Manual calls are for cases where you
need to choose the parser conditionally, and there the third-argument form is what you want.

A regular instance context in the second slot is unaffected:
`parser(data, { variables: { entity: 'world' } })` works exactly as before.

---

## 7. Install-level changes

Three package-level changes belong in the same mechanical pass:

- **Install the release candidate explicitly:** `npm i @bou-co/parsing@v3-rc` — the `latest`
  tag still resolves to v2.

- **`react` moved from a hard dependency to an optional `peerDependency`.** v2 installed react
  for you; v3 doesn't. Anywhere `@bou-co/parsing/react` is imported — or anything relied on
  react arriving transitively — add `react` to that project's own dependencies. Server-only
  consumers need nothing.
- **Engines floor:** the package now declares Node `^20.19.0 || >=22.12.0` and builds to
  es2022. Older runtimes fail at install (or at runtime on missing syntax) rather than subtly.

---

## 8. Codemod strategy

The type-identifier replacement is the bulk of the work and is mostly automatable, but do it
with judgement rather than a blind global replace.

**What makes it safe:** you're replacing a closed set of nine exact strings plus the
`array<...>` pattern, appearing in _projection value position_. Other string literals are
constants and must not be touched. The exact-string check is case-sensitive (`'String'` stays
a constant) while the `array<...>` match is case-insensitive.

**What makes a naive replace unsafe:** `'string'` appears in plenty of places that aren't
projection values — type annotations, error messages, `typeof` comparisons, discriminator
values, and legitimately constant data like `{ kind: 'string' }` in a form-field schema.

A workable approach:

1. Locate projections structurally, not textually — the object literals passed as the first
   argument to `createParser`, plus nested object literals within them, plus `.extend()`
   arguments. An AST-based transform (ts-morph, jscodeshift) is worth the setup on anything
   larger than a few dozen parsers.
2. Within those, replace values matching the nine identifiers and the `array<...>` pattern.
3. Add the `types` import to each touched file, sourced from the project's parser config.
4. Run the type-checker. Tokens are typed values, so a missed replacement in a projection now
   produces a type error at build time in most configurations — the compiler does your
   verification.
5. Run the test suite. Anything the compiler missed throws at runtime with the key path named.

For a small codebase, doing it by hand file-by-file with the type-checker as the safety net is
entirely reasonable and avoids the codemod's own bug surface.

**Verify completeness before moving on.** Grep for the identifier strings across the projection
files one more time after the transform. A leftover in a nested projection that rarely receives
data used to be harmless; in v3 it throws on every parse of that parser, so you want to find it
in CI rather than in production.

## 9. Early v3 release candidates: casting call forms

Only relevant if you adopted a `3.0.0-rc.*` build before the casting upgrade. Everything
chains, and the universal options are also accepted as a call:

| RC form                                            | Now                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `types.string({ default: 'x' })`                   | unchanged — or `types.string.default('x')`                                                 |
| `types.array(types.string)`                        | `types.array.of(types.string)`                                                             |
| `types.array(types.string)({ default: [] })`       | `types.array({ default: [] }).of(types.string)`                                            |
| `looseCasting: 'undefined'`                        | `looseCasting: true` (alias still accepted)                                                |
| `looseCasting: true` passing the raw value through | removed — failed casts are dropped (or defaulted)                                          |
| `types.email` lower-casing the address             | kept as written — `.normalized` or `.lowerCase`                                            |
| `types.tel` → `+3580401234567`                     | kept as written — `.normalized` (`+358401234567`, `(0)` dropped after `+`) / `.href`       |
| `types.text` folding newlines to spaces            | line breaks kept — `.singleLine` folds                                                     |
| `get(path, from)` only                             | unchanged — plus `get(path, type)` / `(path, from, type)` casting in the engine            |
| A token placed in `variables`/`pipes`              | `was called as a value function or pipe — register types under types` — move it to `types` |
| `types.x('nope')`                                  | `expected an options object` — `types.x({ default, required, strict, loose })`             |

`types.array(token)` fails to type-check and throws a targeted error at runtime ("use
.of(…)"), so it cannot slip through silently. `get(path, token)` returns a reader the engine
casts after transformers and pattern resolution under the active policy; `get(path, from, token)`
awaited standalone casts with a root context and throws like `.cast()`. A bare `Promise`
(`get(path, from)`) is a valid projection value: awaited once per parser instance, never cast. `''` now counts as missing for every type (the
key is omitted or the default fills) — add `.required` where an empty value must be an
error. `ParserType<Out>` / `ParserTypeWithDefault<Out>` remain as aliases of
`TypeToken<Out>`; `ParserTypeToken` aliases `TypeToken`.
