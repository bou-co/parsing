---
name: bou-parsing
description: Write, review, and debug parsers using the @bou-co/parsing library (v3) — projections, types.* casting tokens, variables and curly-brace templating, patterns, transformers, the @combine and @if and @array directives, .flat and .asArray and .extend, lifecycle hooks, and the three caching mechanisms. Use this skill whenever a task touches @bou-co/parsing, a createParser projection, initializeParser, types.string or types.number tokens, a ParserContext, useParserValue, or a file named parser-config.ts, and also when someone is shaping CMS or API data into typed objects in a codebase that has this library installed even if they never name it. Reach for this before writing any projection from memory, because the value-resolution order, the optionality rules, and the projection-driven nesting behaviour are all easy to get subtly wrong.
---

# Bou Parsing (v3)

A declarative data layer for TypeScript. You describe the **output** you want; the engine
resolves it against raw input and infers the type.

This skill covers v3 (`3.0.0-dev.x`). If the code uses string type identifiers
(`title: 'string'`), it is v2 — use the `bou-parsing-v2-to-v3-migration` skill instead.

## The mental model

A projection looks like a plain object but behaves like a **canvas of rules**. Each key
declares how its value is produced — not what the input must look like. This is the single
most important thing to internalise, because it explains almost every behaviour that
surprises people:

```ts
const parser = createParser({
  title: types.text, // cast from data.title (string + CMS tidying)
  slug: ({ data }) => slugify(data.title), // derived
  postType: 'blogPost', // constant
  author: async ({ data }) => fetchAuthor(data.authorId), // sub-query
  seo: seoParser, // another parser
});

const result = await parser(rawData); // always async, type inferred from the projection
```

Compare with a validation schema (Zod et al.): a schema _describes input to check_, a
projection _declares output to produce_. That is why a projection can fetch, template, and
cache — and why a nested projection can produce output even when the input has no matching
key. Don't reason about it as validation.

Every parser is async and resolves all keys in parallel. Its natural home is the server
(RSC, Astro, route handlers), though it runs in the browser too.

## What can go in a value slot

This table is the core of the API. Anything in the left column is a legal projection value:

| Value                                            | Behaviour                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `types.string`, `types.email`, …                 | Read `data[key]`, cast at runtime, infer the type                                        |
| `types.array.of(types.x)`                        | Validate array, cast each item                                                           |
| `types.x.default(v)` / `types.x({ default: v })` | Fill in `v` when the field would be `undefined`; makes it **non-optional**               |
| `types.x.required` / `{ required: true }`        | A missing value (`undefined`/`null`/`''`) is a failure; non-optional in the type         |
| `types.date.iso`, `types.number.round(2)`        | Chained accessor: casts, then derives/transforms; inferred type follows the chain        |
| A custom `defineType(...)` token                 | Same, with your casting/validation function (extend a built-in to inherit its accessors) |
| A literal (`'blogPost'`, `42`, `true`)           | Constant, passed through as-is                                                           |
| `(context) => value`                             | Value function; sync or async; receives `ParserContext`                                  |
| `{ … }`                                          | Nested projection                                                                        |
| `{ '@array': true, … }`                          | Nested projection applied per array item                                                 |
| Another parser                                   | Nested parse of `data[key]`                                                              |
| `parser.asArray`                                 | Nested parse per array item                                                              |
| `parser.flat`                                    | Parse `data[key]`, **merge fields into parent**, drop the key                            |
| `cacheResult(keyTemplate, fn)`                   | Value function whose result is cached in storage                                         |
| `typed<T>`                                       | Type-only annotation, passes `data[key]` through                                         |

Directive keys (`'@if'`, `'@combine'`, `'@array'`) are structural, not values — see
`references/features.md`. `@combine` is prefix-matched (`'@combine:stats'` works, several per
projection); `@if`/`@array` are exact, and unknown `@`-keys are silently dropped.

## The resolution pipeline — memorise this order

Every projected key runs through four stages **in this order**:

1. **Pick** — read the raw value, or run the value function / nested parser
2. **Transformers** — global `when`/`then` hooks may replace the whole value
3. **Patterns** — strings are scanned for `{{variable}}` (and any custom pattern) and spliced
4. **Cast** — the `types.*` token casts the final value (accessors run after the base cast)

Most confusion about "why is my value the wrong shape" is a pipeline-order question. Two
consequences worth holding onto:

- **Casting happens last, so templating into a typed field works.** `{ n: types.number }`
  against `{ n: '{{count}}' }` where `count` is `5` yields the number `5`. This is the
  single most useful thing the library does with CMS data.
- **Transformers reshape values; patterns rewrite text inside values.** If you're reacting
  to what the value _is_, that's a transformer. If you're reacting to something written
  _inside_ it, that's a pattern. Patterns run after transformers, so a transformer's output
  is still pattern-scanned; the reverse is not true.

## Optionality and inference

Inference comes entirely from the projection literal — you never write an output interface.
The rules that determine optionality:

- A plain `types.x` field is `T | undefined` (optional). The library assumes any value may
  be absent.
- `types.x.default(v)` makes it `T` (non-optional). `types.text` reports `''` as missing, so its default fires on empty CMS strings.
- `undefined`/`null`/`''` input is **missing**: it skips casting entirely and the key is
  omitted from the output — it does not throw and does not become `null`. `false` and `0`
  are values. Only `.required` tokens fail on missing input.
- A nested projection whose every field depended on missing data resolves to `{}` and the
  **whole key is dropped**.

Extract the type with `ParserReturnValue<typeof parser>` when you need to name it.

## Projection-driven nesting

Nested projections resolve from the schema, not from the input's shape. When the input
lacks a key (or holds a scalar like `null`, `0`, `''`, `false`, `5` that can't feed an
object projection), the nested projection **still resolves**: constants, defaults,
`@combine`, `@if`, and value functions all produce output.

```ts
const parser = createParser({ title: types.string, meta: { version: 3, desc: types.string } });
await parser({ title: 'Hello' }); // → { title: 'Hello', meta: { version: 3 } }
```

Two things follow, and the second one bites people:

- Empty results are omitted, so pure data-mapping projections keep their old behaviour.
- **Side effects run for missing keys.** A nested parser wrapping a `fetch` will fire even
  when the input has no data for it. Opt out with a value function:
  `child: ({ data }) => (data['child'] ? childParser : undefined)`.

Arrays are the exception: `'@array': true`, array literals, and `.asArray` still require
array input and are never conjured from nothing.

## Feature index

Read the reference file that matches the task rather than guessing at the API:

- **`references/basics.md`** — the low-level detail: full casting table per type, every
  `ParserContext` field, nesting and array mechanics, inference and optionality, the three
  context levels. Read this when writing or reviewing an ordinary projection.
- **`references/features.md`** — every feature with its use case: variables, expressions,
  pipes, patterns, transformers, `@if`, `@combine`, `.flat`, `.asArray`, `.extend`,
  `.withContext`, dynamic projections, lifecycle hooks, `resolve`, custom types,
  `looseCasting`, isolated engines, React. Read this when choosing a mechanism.
- **`references/caching.md`** — the three caching mechanisms (whole-parse `cache`,
  `context.store`, `cacheResult`) plus pattern cache modes and storage backends. Read this
  for anything cache-related; the mechanisms overlap and picking wrong is the common error.
- **`references/gotchas.md`** — the traps, including several verified against the source
  that aren't in the README. Read this when debugging unexpected output, and skim it before
  shipping anything that templates CMS content or crosses a serialization boundary.
- **`references/api-reference.md`** — condensed signature lookup for exports and options.

## Choosing a mechanism

Overlapping features are the main way to write awkward Bou Parsing code. Defaults:

| Goal                                        | Use                                                         | Not                                                    |
| ------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| Merge a sub-parser's fields into the parent | `parser.flat`                                               | `@combine` (needs a hand-written resolver)             |
| Fetch and merge external data               | `@combine`                                                  | `.flat` (only reads `data[key]`)                       |
| Conditional fields                          | `@if`                                                       | Dynamic projection (heavier, defeats static inference) |
| Vary the whole shape by input type          | Dynamic projection                                          | A pile of `@if` blocks                                 |
| Add fields to an existing parser            | `.extend()`                                                 | Copying the projection                                 |
| Inject request-scoped values                | Instance context: `parser(data, { variables })`             | Module-level mutable state                             |
| Reuse a parser with extra context           | `.withContext()`                                            | A second `createParser`                                |
| Template a string                           | `{{variables}}`                                             | A custom pattern                                       |
| A new inline syntax (`$products.count`)     | Custom pattern                                              | A transformer                                          |
| Reshape values by their shape               | Transformer                                                 | A pattern                                              |
| Cache a whole parse keyed on input          | `cache: { enabled: true }`                                  | `context.store`                                        |
| Cache one shared async value                | `cacheResult` (declarative) or `context.store` (imperative) | Whole-parse cache                                      |
| Resolve templates in already-shaped data    | `resolve()`                                                 | A pass-through projection                              |

## Working practices

**Re-export `types` from your parser config.** `types` is _not_ a root export of the
package — it comes back from `initializeParser`. Standalone type files should import from
the tree-shakeable `@bou-co/parsing/types` entry point instead, which never pulls in the
engine.

```ts
// parser-config.ts
export const { createParser, resolve, cacheResult, types } = initializeParser({/* … */});
```

**Prefer `context.value` over `context.data[key]`** in value functions — it's the same raw
value with less ceremony. Note it arrives unresolved: a `"{{variable}}"` string comes
through as-is, and `await resolve()` with no arguments resolves it on demand (memoized).

**Use `context.resolve`, not the exported `resolve`, inside value functions.** The exported
one does not inherit ambient context, so merged variables and the active locale are lost.

**Reach for `types.any` deliberately, not by default.** It's the honest way to declare an
intentional raw passthrough, but it disables the runtime guarantee that makes v3 worth
using.

**When reviewing a projection, check three things:** that side-effecting nested parsers are
guarded against projection-driven resolution, that fields whose defaults matter carry
`{ default: … }` rather than relying on the input, and that nothing depends on `looseCasting:
true` for correctness — under that flag TypeScript's declared type can differ from the
runtime value.

## Verifying work

The library has no runtime dependency beyond an optional React peer, so a projection can be
exercised directly in a scratch test. When a behaviour question can be settled empirically,
settle it: write a small `describe`/`it` against the real engine rather than reasoning about
what the pipeline probably does. Several of the entries in `references/gotchas.md` were
found exactly this way, and the answers were not the obvious ones.
