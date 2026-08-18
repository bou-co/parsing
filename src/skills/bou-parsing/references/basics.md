# Basics — the low-level detail

Contents:

- [Anatomy of a parse](#anatomy-of-a-parse)
- [Types and casting](#types-and-casting)
- [Default values](#default-values)
- [Value functions](#value-functions)
- [The ParserContext object](#the-parsercontext-object)
- [Nesting](#nesting)
- [Arrays](#arrays)
- [Type inference and optionality](#type-inference-and-optionality)
- [The three context levels](#the-three-context-levels)

## Anatomy of a parse

```ts
import { initializeParser } from '@bou-co/parsing';

// 1. One engine per configuration. Returns 4 things.
export const { createParser, resolve, cacheResult, types } = initializeParser({
  variables: { currentYear: () => new Date().getFullYear() },
  pipes: { uppercase: ({ data }) => String(data).toUpperCase() },
});

// 2. A parser is a projection + optional schema-level context
const articleParser = createParser({ title: types.string, body: types.string }, { cache: { enabled: true } });

// 3. Executing takes (input, instanceContext?, parentContext?)
const article = await articleParser(raw, { variables: { locale: 'fi' } });
```

`initializeParser` accepts either a config object or a function returning one (sync or
async). The function form is resolved once per engine and awaited — useful when config
depends on an async source. Concurrent first calls wait for the same initialization.

The third argument to a parser (`parentContext`) is for forwarding context when you call a
nested parser manually from inside a value function. Passing a full parser context as the
**second** argument throws a targeted error, because that was the v2 convention.

## Types and casting

Every `types.*` entry both types the output and casts the value at runtime. Casts are
conservative — only lossless, unambiguous conversions happen.

| Type                          | Accepts                                                                                                                      | Fails on                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `types.string`                | strings; finite numbers; booleans; valid `Date` (→ ISO string)                                                               | objects, arrays, `NaN`, `Infinity` |
| `types.number`                | numbers (incl. `NaN`/`Infinity`, unchecked); booleans (`1`/`0`); `Date` (→ `getTime()`); numeric strings (`'12.5'`, `'1e3'`) | `''`, `'12px'`, objects            |
| `types.boolean`               | booleans; `1`/`0`; `'true'`/`'false'` (case-insensitive)                                                                     | other numbers and strings          |
| `types.date`                  | `Date` instances; parseable date strings; epoch numbers (incl. `0`)                                                          | unparseable values (`''`, `false`) |
| `types.object`                | any non-array object (`Date`, `Map`, class instances pass through)                                                           | arrays, primitives                 |
| `types.array`                 | arrays (passed through)                                                                                                      | non-arrays                         |
| `types.array(types.x)`        | arrays, casting each item with `x`                                                                                           | non-arrays; any failing item       |
| `types.any` / `types.unknown` | anything (pure pass-through)                                                                                                 | never fails                        |

Nesting works: `types.array(types.array(types.number))`.

There is **no `types.undefined`** — accessing it throws a migration error. Use the
`optional` util or just omit the key.

`types` is not a root package export. Get it from `initializeParser`, or import tokens
individually from `@bou-co/parsing/types`:

```ts
import { string, number, array, defineType } from '@bou-co/parsing/types';
export const scores = array(number); // reusable combinations are just values
```

That entry point is tree-shakeable and never pulls in the engine, so shared type files stay
light and work against any engine configuration.

### Failure behaviour

A present-but-uncastable value throws `ParserCastError`, carrying `path`, `type`, `key`,
`received`, and `cause`. `looseCasting` relaxes this — see `features.md`. A type created
with `{ strict: true }` always throws regardless of `looseCasting`.

`undefined`/`null` never fail: they skip casting and the key is omitted.

## Default values

Every token accepts an options object with `default`:

```ts
createParser({
  title: types.string, // → string | undefined
  displayName: types.string({ default: 'Item' }), // → string
  retries: types.number({ default: 0 }), // → number
  tags: types.array(types.string)({ default: [] }), // → string[]
});
```

The default applies whenever the field would end up `undefined` — missing input, or a failed
cast resolved to `undefined` under `looseCasting: 'undefined'`. It is returned **as-is and
not cast** (TypeScript already enforces it matches). It never masks hard failures: without
`looseCasting`, a present-but-invalid value still throws, and `strict` types always do.

Its most important side effect is on the type: a defaulted field is non-optional in the
inferred output, which removes a whole class of `?.` from consuming code.

## Value functions

A value function receives the `ParserContext` and may be sync or async. All keys resolve in
parallel, so async functions don't serialise.

```ts
createParser({
  // read the raw value at this key
  price: ({ value }) => Number(value) * 1.24,

  // read anywhere in the current level's data
  slug: ({ data }) => slugify(data.title),

  // async sub-query
  author: async ({ data }) => (await fetch(`/authors/${data.authorId}`)).json(),

  // return another parser to parse a value conditionally
  child: ({ data }) => (data['child'] ? childParser : undefined),

  // resolve the current raw value's templates on demand
  total: async ({ resolve }) => (await resolve<number>()) * 5,
});
```

Returning `undefined` omits the key. Returning a parser causes that parser to run against
the appropriate data — which is how you make a nested parse conditional. Returning a **type
token** applies it as a cast to the raw value at the key, so a function can pick the type
dynamically: `flag: ({ data }) => (data.kind === 'strict' ? types.boolean : types.string)`.

## The ParserContext object

Passed to every value function, transformer, pipe, hook, and pattern resolver.

| Field          | Meaning                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| `data`         | Raw input at the **current nesting level**. `{}` during projection-driven resolution                           |
| `value`        | The raw incoming value at this key (`data?.[key]`). Never eagerly resolved                                     |
| `key`          | The key currently being evaluated                                                                              |
| `index`        | Numeric index when inside an array                                                                             |
| `isRoot`       | `true` only at the actual root — `false` inside every kind of nesting                                          |
| `parent`       | The enclosing level's context, chaining to the root (`undefined` at root)                                      |
| `path`         | Chain of projection references from root to here                                                               |
| `datalessPath` | Present **only** during projection-driven resolution — how a value function detects it is running without data |
| `projection`   | The active projection at this level                                                                            |
| `variables`    | Merged global + schema + instance variables, plus `current` (root input)                                       |
| `pipes`        | Merged pipe functions                                                                                          |
| `params`       | Inside a pipe: resolved parameters after the pipe name; `undefined` if none                                    |
| `resolve`      | Contextual `resolve` that inherits active context. Zero-arg form resolves `context.value`                      |
| `store`        | `store(key, fn, options?)` — get-or-compute caching for one value                                              |
| `storage`      | Direct access to the configured storage backend                                                                |
| `cache`        | Merged caching options                                                                                         |
| `parser`       | The underlying `Parser` instance                                                                               |
| `onCastError`  | The configured cast-error observer, if any                                                                     |
| `looseCasting` | The active loose-casting policy                                                                                |

Custom properties added via `withContext`, hooks, or instance context also live here. Type
them with module augmentation:

```ts
declare module '@bou-co/parsing' {
  interface CommonContext {
    currentLocale?: string;
  }
}
```

**Reserved keys** — written by the engine _after_ your context spreads, so custom properties
with these names are silently overwritten: `data`, `key`, `projection`, `variables`, `pipes`,
`isRoot`, `cache`, `value`, `parent`, `path`, `store`, `resolve`, `datalessPath`. Treat
`parser`, `index`, and `params` as reserved too (`parser` is engine-set _before_ the spreads,
`index` is injected for array items, `params` inside pipes).

## Nesting

Three ways, with different semantics:

```ts
createParser({
  // 1. Inline nested projection — resolves against data.details
  details: { desc: types.string, level: types.number },

  // 2. Nested parser — parses data.seo with its own engine binding and context
  seo: seoParser,

  // 3. Flattened parser — parses data.seo, merges fields into the parent, drops 'seo'
  seo: seoParser.flat,
});
```

A nested parser stays bound to the engine that created it: it keeps its own transformers,
whole-parse cache storage, and variable cache, while parent context values still merge down
(on collisions the parent's values win). That's what makes cross-configuration composition
safe.

`.flat` behaves like `@combine`: merged fields override same-named regular keys and are typed
optional. The result must be an object — `.flat` on array data throws.

Schema-level `cache` options do **not** flow into nested parsers; each brings its own
`createParser` cache config. Per-call cache still propagates.

## Arrays

```ts
createParser({
  // Inline: apply the rest of this projection to each item
  tags: { '@array': true, name: types.string, label: ({ index }) => `#${index}` },

  // Parser variant: parse each item
  authors: authorParser.asArray,

  // Positional: a different projection per index.
  // Use plain projections here — parsers in positional slots resolve to {} (see gotchas.md)
  pair: [{ name: types.string }, { v: types.number }],
});
```

Arrays expose `index` on the context. Unlike object projections, all three array forms
**require array input** and are skipped when it's missing — they are never produced
projection-driven.

`parser.asArray` is a derived variant, not the parser itself: `parser.asArray !== parser`.
It still hashes as its base parser (`String(parser.asArray) === String(parser)`), and calling
it directly bypasses whole-parse caching — see `caching.md`.

## Type inference and optionality

The output type is derived from the projection literal. There is nothing to write and no
generic to pass.

```ts
const parser = createParser({
  title: types.string,
  count: types.number({ default: 0 }),
  tags: types.array(types.string),
  kind: typed<'a' | 'b'>,
});

type Out = ParserReturnValue<typeof parser>;
// { title?: string; count: number; tags?: string[]; kind?: 'a' | 'b' }
```

Rules:

- Plain type tokens → optional
- Tokens with `default` → required
- Constants → their literal type
- Value functions → their return type (annotate the function if inference is too wide)
- Nested projections → recursively inferred, optional
- `.flat` merged fields → optional

`typed<T>` forces a specific type where a token can't express it; it passes `data[key]`
through **without casting**, so it's a type assertion, not a guarantee.

Two things break inference honesty, both worth knowing: `looseCasting: true` can leave a
runtime value that doesn't match the declared type, and a transformer or pattern that
reshapes a value (localize collapsing an object to a string) makes the inferred type
inaccurate. Neither is a bug — they're the cost of runtime extensibility.

## The three context levels

Context merges from three places, most specific winning:

1. **Global** — `initializeParser(config)`. Engine-wide. The only place `patterns` and
   `storage` can be set.
2. **Schema** — `createParser(projection, options)`. All executions of this parser. Good for
   schema-specific `variables`, `pipes`, `cache`, and `before`/`after` hooks.
3. **Instance** — `parser(data, options)`. This execution only. Good for request-scoped
   values: current user, active locale.

`variables` and `pipes` are configurable at all three. `patterns` is global-only — the
registry is compiled once per engine.
