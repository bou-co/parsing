# Features — what each one is for

Every feature with the situation it exists to solve. Contents:

- [Variables](#variables) · [Built-in heads](#built-in-variable-heads) · [Expressions, fallbacks, pipes](#expressions-fallbacks-and-pipes) · [Variable resolvers](#dynamic-variable-resolvers)
- [Patterns](#patterns) · [Transformers](#transformers)
- [Directives: @if, @combine, @array](#directives)
- [Composition: .flat, .asArray, .extend, .withContext](#composition)
- [Dynamic projections](#dynamic-projections) · [Lifecycle hooks](#lifecycle-hooks)
- [Custom types and casting options](#custom-types-and-casting-options)
- [resolve — templating without a projection](#resolve--templating-without-a-projection)
- [Isolated engines](#isolated-engines) · [React](#react)
- [Utilities](#utilities)

For caching, see `caching.md`.

---

## Variables

**Problem:** content editors want dynamic values in CMS text, and you don't want to ship a
templating engine.

`{{variable}}` interpolation in any string value the parser touches, at any depth.

```ts
export const { createParser, types } = initializeParser({
  variables: { currentYear: () => new Date().getFullYear() },
});

const parser = createParser({ title: types.string, greeting: types.string });

await parser({ title: 'Copyright {{currentYear}}', greeting: 'Hello {{user.firstName}}!' }, { variables: { user: { firstName: 'John' } } });
// → { title: 'Copyright 2026', greeting: 'Hello John!' }
```

Variables can be values, sync functions, async functions, or nested objects reached by dot
path. They merge across the three context levels. The spread expression `{{...}}` returns the
full merged variables object raw (including the seeded `current` and any resolver-cached
values; pipes are a separate namespace and are not included) — useful for handing everything
to a nested projection. Embedded in surrounding text it stringifies to `[object Object]`, so
use it only as a full-string value.

Because casting runs _after_ pattern resolution, a variable can feed a typed field:
`{ count: types.number }` against `{ count: '{{total}}' }` yields a real number.

### Built-in variable heads

Available with no configuration:

- `{{data.*}}` — input data at the **current nesting level**, e.g. `{{data.uid}}`
- `{{ctx.*}}` / `{{context.*}}` — the full context: `{{ctx.key}}`, `{{ctx.currentLocale}}`,
  your own augmentations
- `{{current.*}}` — the root input of the run (legacy; prefer `data`/`ctx`)

Resolution order for a head: explicit variables (global → schema → instance) → built-in heads
→ `variableResolver`. Explicit variables can shadow built-ins. **Built-in heads are
terminal** — `{{data.missing}}` never falls through to a `variableResolver`, so a context
lookup can't accidentally trigger an external fetch.

### Expressions, fallbacks, and pipes

Everything inside the delimiters is an _expression_. The grammar is deliberately tiny:
fallback chains, literals, one pipe. No loops, no conditionals, no arbitrary code.

**Fallbacks** chain with `||`, left to right; the first **defined** value wins. Only
`undefined` falls through — `false`, `0`, `''`, and even `null` are valid results that stop
the chain (unlike JavaScript's `||`).

```ts
'Hello {{user.name || "Guest"}}!';
'{{campaign.discount || 0}}% off';
'{{flags.showBanner || false}}';
```

Literals: double-quoted strings, integers, `true`/`false` — no floats, negative numbers, or
single quotes (those parse as variable paths), and a literal containing `||` splits as a
fallback. A literal in the value position is returned exactly as written, and a pipe after a
literal does not apply.

**Pipes** transform the resolved value inline: `{{value | pipe}}` or
`{{value | pipe:p1:p2}}`. One pipe per expression — a second `| pipe` is silently discarded —
and the pipe binds to its own fallback branch: in `{{a || b | upper}}` only the `b` branch is
piped. Parameters may be literals or variable names; parameter names resolve from
`context.variables` only (no `data.*`/`ctx.*` heads, no `variableResolver`).

```ts
initializeParser({
  variables: { user: { firstName: 'john' } },
  pipes: {
    uppercase: ({ data }) => String(data).toUpperCase(),
    truncate: ({ data, params: [len = 50] = [] }) => String(data).slice(0, len),
  },
});
// '{{user.firstName || "Guest" | uppercase}}' → 'JOHN'
// '{{article.teaser | truncate:120}}'
```

Pipes live in the `pipes` config, **not** `variables` — a function left in `variables` and
used as a pipe throws a targeted error. Pipes are configurable at all three context levels.
Inside a pipe, `data` (and `value`) is the piped value and `params` holds the parsed
parameters.

When a value resolves to `undefined`, its pipe is skipped and the fallback chain moves on.
Set `pipeUndefined: true` in context to run pipes on `undefined` anyway.

**Escaping:** a backslash directly before a match suppresses it and is consumed —
`\{{name}}` outputs `{{name}}`. `\\` before a match yields a literal backslash and the match
still resolves. Uniform across all patterns. (See `gotchas.md` — escaping is not idempotent
across two passes.)

### Dynamic variable resolvers

**Problem:** you can't enumerate every variable upfront — editors reference arbitrary keys, or
values need on-demand DB lookups.

```ts
initializeParser({
  variableResolver: async (variableName, context, cache) => {
    if (variableName === 'userName') return cache(await db.getName(context.data.userId));
    return undefined; // let fallbacks / other variables take over
  },
});
```

The resolver is called with the **head segment only** (the engine walks the rest of the dot
path afterwards). Returning `undefined` continues normal resolution. The third argument
`cache(value)` opts the value into an **engine-lifetime** store keyed by the head — cached
values are served for the life of the process, across requests and tenants, and merge into
`variables` last, shadowing even instance variables. For per-request data, prefer a pattern
with `cache: 'run'` or `'storage'`.

---

## Patterns

**Problem:** you need a new inline syntax (`$products.count`, `<<snippets/banner>>`), or you
need to change how `{{ }}` itself behaves.

A pattern detects a substring in string data and resolves it. `{{variable}}` is simply the
pattern that ships with the library. This is the expert tier — if you just want `{{name}}`,
Variables already covers it.

Two kinds, and the difference decides whether expressions work:

- **Delimited** — declare `delimiters: [start, end]`. The engine builds the regex, and the
  full expression grammar works inside automatically.
- **Token** — declare a raw `match` regex with no end marker. Each match resolves
  independently; expressions are **off**, because there's no boundary to bound a fallback
  chain.

```ts
initializeParser({
  patterns: {
    snippet: {
      delimiters: ['<<', '>>'],
      resolve: async ({ path }) => await cms.getSnippet(path),
    },
    db: {
      match: /\$([a-zA-Z0-9_.]+)/g,
      resolve: async ({ path }) => await db.get(path),
    },
  },
});
```

Interface:

```ts
interface ParserPattern {
  delimiters?: [string, string]; // required for expressions
  match?: RegExp; // built from delimiters when omitted; group 1 is the expression
  resolve: (input: PatternResolveInput) => unknown | Promise<unknown>;
  expressions?: boolean; // default true for delimited; unavailable without delimiters
  rescan?: boolean; // re-scan resolved string output. Default true
  cache?: 'run' | 'none' | 'storage'; // default 'run'
}
interface PatternResolveInput {
  path: string;
  raw: string;
  groups: RegExpExecArray;
  context: ParserContext;
}
```

Setting `expressions: true` on a token pattern **throws when the registry compiles on the
first parse** rather than half-working.

Rules:

- **Full-string matches return the raw value** — objects, numbers, arrays survive, and an
  object result can feed a nested projection.
- **Precedence:** leftmost match first; at the same start index the longest wins, then
  registration order (`variables` registers first). Overlapping later matches are skipped.
- **Re-scanning:** resolved string output is scanned again by all patterns. Opt out per
  pattern with `rescan: false`. Cycles (and chains >10 deep) throw `ParserPatternCycleError`.
- **Deduping:** the same expression occurring N times in one string resolves once — keyed by
  the raw match text, so `{{a}}` and `{{ a }}` are two units.
- **Customising the built-in:** keys merge partially, so
  `patterns: { variables: { delimiters: ['${', '}'] } }` re-delimits while keeping lookups,
  fallbacks, pipes, and the spread. `patterns: { variables: false }` disables interpolation.
- `patterns` is **global-only** — not settable per parser or per call.

The engine owns scanning, deduplication, splicing, parallel resolution, re-scanning, and
cycle protection. Your `resolve` only turns a path into a value.

---

## Transformers

**Problem:** a value shape appears throughout your data and should always be converted the
same way — localisation maps, date strings, HTML that needs stripping.

Global `when`/`then` pairs that replace whole values, at any depth.

```ts
const localize = {
  when: ({ data, locales = ['en', 'fi'] }) => typeof data === 'object' && Object.keys(data).every((k) => locales.includes(k)),
  then: ({ data, currentLocale = 'en' }) => data[currentLocale],
};

export const { createParser, types } = initializeParser({ transformers: { localize } });

await createParser({ greeting: types.string })({ greeting: { en: 'Hello', fi: 'Hei' } });
// → { greeting: 'Hello' }
```

A ready-made localize transformer ships at `@bou-co/parsing/templates/localize`. It's a
factory: `transformers: { localize: localize({ matching: 'every' | 'some' | fn, fallback: true | fn }) }`,
configured through context — `locales`, `defaultLocale`, and optional `resolveCurrentLocale`
in the global context, `currentLocale` per call (it augments the context interfaces so these
are typed).

**Transformer vs pattern:** transformers react to what the value _is_; patterns react to what
is written _inside_ it. Transformers run once per projected key, one value in and one value
out. Patterns run on every string at any depth, many matches per string. Patterns run
**after** transformers, so "rewrite legacy `[[token]]` syntax into `{{token}}`" is a
legitimate one-line transformer. The reverse doesn't hold — pattern output is re-scanned by
patterns, not by transformers.

---

## Directives

### `@if` — conditional fields

```ts
createParser({
  title: types.string,
  '@if': [
    { when: ({ data }) => data.priority > 1, then: { highPriority: true } },
    { when: ({ data }) => data.draft, then: { title: ({ data }) => `${data.title} (Draft)` } },
  ],
});
```

`then` may be a projection, a value function, or a parser. Merged keys override same-named
regular keys. Inside projection-driven resolution the condition runs against an empty data
object — guard accordingly. The `condition(when, then)` util builds these structurally.

### `@combine` — fetch and merge

```ts
createParser({
  title: types.string,
  '@combine': async ({ data }) => {
    const extra = await fetch(`/stats/${data._id}`).then((r) => r.json());
    return await statsParser(extra);
  },
});
```

Returns an object; its keys merge into the current output. Use it for secondary datasets.
When the data already lives under a key and has its own parser, prefer `.flat` — same merge
behaviour, declared rather than hand-written.

Any key **starting with** `@combine` counts, so several can coexist in one projection:
`'@combine:stats'`, `'@combine:related'`. (`@if` and `@array` are exact matches — any other
`@`-prefixed key is silently dropped, see `gotchas.md`.)

### `@array` — iterate

```ts
createParser({ items: { '@array': true, name: types.string, label: ({ index }) => `#${index}` } });
```

Applies the rest of the projection to each item and exposes `index`. Requires array input.

---

## Composition

| Mechanism                     | Effect                                                        |
| ----------------------------- | ------------------------------------------------------------- |
| `parser` as a value           | Nested parse of `data[key]`, output nested under the key      |
| `parser.flat`                 | Parse `data[key]`, **merge fields into parent**, drop the key |
| `parser.asArray`              | Parse each item of `data[key]`                                |
| `parser.extend(projection)`   | New parser = old projection + new, original unmutated         |
| `parser.withContext(context)` | New parser with merged context (variables, hooks, cache)      |

```ts
const seoParser = createParser({ title: types.string, description: types.string });
const pageParser = createParser({ name: types.string, seo: seoParser.flat });
await pageParser({ name: 'Home', seo: { title: 'T', description: 'D' } });
// → { name: 'Home', title: 'T', description: 'D' }
```

```ts
const base = createParser({ value: types.number });
const extended = base.extend({ extra: types.string });

const withVars = base.withContext({ variables: { locale: 'fi' } });
```

**Chaining (reparsing):** the output of one parser can be passed straight into another for
multi-pass work. `const out = await stepTwo(await stepOne(raw));`

---

## Dynamic projections

**Problem:** the shape depends on the input — polymorphic CMS blocks, discriminated payloads.

```ts
const parser = createParser(({ data }) => {
  if (data.type === 'detailed') return { value: types.number, metadata: types.string };
  return { value: types.number };
});
```

Costs static inference, which is why `@if` is the better default for merely _adding_ fields.
Also note: projection-driven parses receive `{}` as data, so a dynamic projection that
branches on `data` should handle the empty case.

---

## Lifecycle hooks

**Problem:** several value functions need the same derived context, or the final object needs
post-processing.

```ts
createParser(
  { finalPrice: ({ data, basePrice }) => data.price + basePrice },
  {
    before: (context) => {
      context.basePrice = 10;
      return context;
    },

    // Both hooks return a CONTEXT, not a value. The engine reads `.data` off the result.
    after: (context) => ({ ...context, data: { ...context.data, stamped: true } }),
  },
);
```

`before` injects shared context values that trickle down to nested and extended parsers.
`after` receives the assembled result as `context.data`.

**Both hooks must return a context-shaped object.** The engine does
`if (afterResult.data) combined = afterResult.data`, so returning the modified data _directly_
is silently discarded — the parse output is unchanged and nothing warns you:

```ts
after: (context) => ({ ...context.data, stamped: true }); // ❌ ignored
after: (context) => ({ ...context, data: { ...context.data, stamped: true } }); // ✅
```

Registerable globally, per schema, or per call. Global and per-call hooks fire **once per
nesting level**; schema (`createParser`) hooks fire for that parser's own levels but do not
reach nested inline object projections, and at an array the hooks run per item rather than
for the array level itself. Note that an `after` hook which unconditionally injects keys
makes every projection-driven resolution non-empty — hook output counts as output, so the
"empty results are omitted" rule stops applying.

**`.extend()` and `.withContext()` compose hooks rather than replacing them.** The base
parser's hook runs first, then the extension's, which receives the context the base hook
returned (identical function references are deduped). All other context keys keep the normal
deep-merge semantics (nested objects like `variables` merge, the extension wins on scalars) —
only `before`/`after` chain. There is no way to *remove* a base hook by extending; create a
separate parser if you need the hook gone.

---

## Custom types and casting options

`defineType` takes a casting function `(value, context) => output` (sync or async) that
returns the cast value or throws. The result is a token used directly in projections — no
registration.

```ts
import { array, number, defineType } from '@bou-co/parsing/types';

export const email = defineType((value) => {
  if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error('Invalid email');
  }
  return value;
});

export const dmy = defineType(async (value) => {
  const d = value instanceof Date ? value : new Date(value as string);
  if (isNaN(d.getTime())) throw new Error('Invalid date');
  return { day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear() };
});

export const scores = array(number);
```

Object form: `defineType({ fn, strict?, name?, default? })`.

- `strict: true` → always throws on failure, even under `looseCasting`. Use for values where
  passing bad data through is never acceptable.
- `name` → matters for caching. Types hash by their implementation source, and closures are
  invisible to hashing, so a **factory** producing several types from one function must name
  them to keep cache identities apart. The name also appears in `ParserCastError.type`.

```ts
const scaled = (factor: number) => defineType({ fn: (v) => Number(v) * factor, name: `scaled-${factor}` });
```

### looseCasting and onCastError

```ts
initializeParser({
  looseCasting: 'undefined', // or true, or false (default)
  onCastError: (error) => telemetry.report('cast', { path: error.path, type: error.type }),
});
```

- `false` (default) — throw `ParserCastError`
- `true` — pass the **original** value through and log a warning
- `'undefined'` — drop the value (or apply the token's `default`)

Both are regular context options, so they can be set per parser or per call.
`onCastError` fires before the failure policy is applied and replaces the default warning.

Prefer `'undefined'` over `true` when output types should stay honest: under `true` the
runtime can hold a value that TypeScript types as something else.

---

## resolve — templating without a projection

**Problem:** the data is already in its final shape, but it still contains `{{variables}}` or
values a transformer should convert. State management, config objects, notification copy.

```ts
const data = await resolve({ message: 'Hello {{name}}!', time: '{{currentTime}}' });
const one = await resolve('Hello {{name}}!'); // plain strings work
const order = await resolve({ msg: 'Order {{id}}' }, { variables: { id: '123' } });
```

`resolve` walks the input recursively: transformers apply at every level, functions are
invoked with the context and their results resolved further, patterns interpolate, everything
else passes through (type tokens and parsers included). No picking, no casting, no hooks.

The return type is inferred from the input. When a transformer reshapes values (localize
collapsing an object to a string), pass an explicit generic:
`resolve<{ message: string }>(...)`.

**`context.resolve` vs the exported `resolve`:** the contextual one inherits the active
context — merged variables, transformers, locale — with optional per-call overrides. The
exported one never inherits ambient context. Inside value functions, use the contextual one.

Zero-arg `context.resolve()` resolves the current `context.value` lazily and memoizes it:

```ts
createParser({
  price: ({ value }) => value * 5, // raw value; must already be a number
  total: async ({ resolve }) => (await resolve<number>()) * 5, // resolves '{{basePrice}}' first
});
```

One caveat: inside a `resolve()` **input** (not a projection), a zero-arg `resolve()` call
re-resolves the input containing that very function, so it recurses. Parse-mode value
functions are immune because their `value` is raw data.

---

## Isolated engines

Each `initializeParser` call creates a fully isolated engine: its own variables, casting
options, transformers, patterns, hooks, storage, and caches.

```ts
// server-config.ts
export const { createParser, types } = initializeParser({ storage: redisStorage, cache: { enabled: true } });

// client-config.ts
export const { createParser, types } = initializeParser({ looseCasting: 'undefined' });
```

Parsers stay permanently bound to their creating engine. Nesting a parser from one
configuration inside another keeps its own transformers, whole-parse cache storage, and
variable cache for the nested parse, while parent context values still merge down — and on
collisions the parent's win (variables of the same name, and `context.storage`, which is what
`context.store` uses). Since type tokens carry their own casting implementation, projections
and type files are freely shareable across configurations.

`new Parser(globalContext)` is the advanced equivalent for when you need the instance
directly.

---

## React

```tsx
import { useParserValue } from '@bou-co/parsing/react';

const { result, loading, error, revalidate } = useParserValue(rawProps, myParser);
```

`revalidate()` re-parses with the last data; `revalidate(newData)` re-parses with new data
and bypasses the hook's change detection — useful after a mutation you know changed the
output.

React is an **optional peer dependency**, so the core package stays usable server-only.

---

## Utilities

| Export                             | Purpose                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `defineType(def)`                  | Create a custom casting type                                                    |
| `isTypeToken(v)`                   | Test whether a value is a type token                                            |
| `typed<T>`                         | Force a specific inferred type; passes the raw value through uncast             |
| `optional`                         | Mark a key optional without a type                                              |
| `condition(when, then)`            | Build an `@if` entry structurally                                               |
| `get(path, from?)`                 | Dot-path lookup. One arg → resolves from `context.data`; two → arbitrary object |
| `toHash(data)`                     | Deterministic hash for cache keys. **Key-order sensitive** — see `gotchas.md`   |
| `asDate(v)`                        | Date coercion helper                                                            |
| `mergeObjects(a, b)`               | Deep merge used for context merging                                             |
| `ParserCastError`                  | Cast failure, with `path`, `type`, `received`, `cause`                          |
| `ParserPatternCycleError`          | Pattern cycle / excessive rescan depth                                          |
| `variablesPattern`                 | The built-in variables pattern definition                                       |
| `ParserReturnValue<typeof parser>` | Extract a parser's output type                                                  |

Note that `asyncMapObject`, `filterNill`, `filterUndefinedEntries`, and `mergeObjects` are
exported via `export *` from internal modules. They are reachable but are engine internals
rather than intentional API — prefer not to build on them.
