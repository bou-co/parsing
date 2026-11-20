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

// 1. One engine per configuration. Returns 5 things.
export const { createParser, resolve, store, types, variables } = initializeParser({
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
depends on an async source. Concurrent first calls wait for the same initialization; if the
function throws, the parse rejects and the next parse tries it again.

The third argument to a parser (`parentContext`) is for forwarding context when you call a
nested parser manually from inside a value function. Passing a full parser context as the
**second** argument throws a targeted error, because that was the v2 convention.

## Types and casting

Every `types.*` entry both types the output and casts the value at runtime. Casts are
conservative — only lossless, unambiguous conversions happen. Tokens are configured by
**chaining** (`types.string.default('x')`, `types.number.round(2)`, `types.date.iso`,
`types.array.of(types.string).unique`) — no-parameter accessors are properties, parameterised
ones are methods — or by calling the token with an **options object** for the universal
options: `types.string({ default: 'x', required: true, strict: true })` ≡ the chain. Items go
through `.of()`, never as call parameters (`types.array(x)` from early RCs is `.of(x)`).

| Type                          | Accepts                                                                                                                                               | Fails on                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `types.string`                | strings; finite numbers; booleans; valid `Date` (→ ISO string)                                                                                        | objects, arrays, `NaN`, `Infinity`                                     |
| `types.number`                | finite numbers; booleans (`1`/`0`); valid `Date` (→ `getTime()`); numeric strings, trimmed (`' 12.5 '`, `'1e3'`)                                      | `'12px'`, `NaN`, `Infinity`, invalid `Date`, objects (`''` is missing) |
| `types.boolean`               | booleans; `1`/`0`; `'true'`/`'false'` (case-insensitive)                                                                                              | other numbers and strings                                              |
| `types.date`                  | `Date` instances; parseable date strings; epoch numbers (incl. `0`)                                                                                   | unparseable values, `false` (`''` is missing)                          |
| `types.object`                | any non-array object (`Date`, `Map`, class instances pass through)                                                                                    | arrays, primitives                                                     |
| `types.array`                 | arrays (passed through)                                                                                                                               | non-arrays                                                             |
| `types.array.of(types.x)`     | arrays, casting each item with `x`                                                                                                                    | non-arrays; any failing item                                           |
| `types.any` / `types.unknown` | anything (pure pass-through)                                                                                                                          | never fails                                                            |
| `types.text`                  | what `string` does; textarea tidying (trim, collapse spaces, fold blank lines, **line breaks kept**), empty → **missing**                             | what `string` rejects                                                  |
| `types.email`                 | `local@domain.tld`; trimmed, **case kept** (`.normalized` lower-cases, `.href` → `mailto:`)                                                           | anything else                                                          |
| `types.url`                   | absolute URLs (`new URL()`), normalised `href`; `.base(url)` for relative fields                                                                      | `/relative`, `//protocol-relative`                                     |
| `types.slug`                  | any string → ASCII slug (Latin folded/transliterated, lower-case, `-` separated); non-Latin scripts dropped; pre-step via `.to(types.slug)`           | nothing URL-safe left                                                  |
| `types.color`                 | hex / `rgb()` / `hsl()` (comma or space separated, `%` channels and alpha, hue wraps) → lower-case `#rrggbb[aa]`                                      | named colours, malformed, non-numeric channels                         |
| `types.tel`                   | kept **as written**; separators, optional `+`, extension (`ext. 12`/`x12`/`#12`), 3–15 digits (not country-aware); `.normalized` `.href` `.extension` | wrong length, letters                                                  |
| `types.mimeType`              | `type/subtype+suffix; params`; type, subtype, suffix and parameter **keys** lower-cased (parameter values kept)                                       | no `type/subtype`, a space before `=`                                  |
| `types.json`                  | JSON strings parsed, non-strings pass; `.of(inner)` for a typed result                                                                                | invalid JSON                                                           |
| `types.unique(item)`          | arrays, deduplicated like a `Set`, returned as a plain array                                                                                          | non-arrays                                                             |
| `types.oneOf(...v)`           | one of the literals (numeric/boolean members also as strings); union type                                                                             | anything else                                                          |
| `types.pattern(re)`           | matching strings; named groups → group map. `pattern(regex, flags)` re-flags a RegExp; `g`/`y` regexes are reset per cast                             | non-matches                                                            |

Accessor families (transforms keep the type and chain; derivations change it): `string`
`.upperCase .lowerCase .capitalize .titleCase .camel .pascal .kebab .snake .trim
.truncate(n, ellipsis = '…') .replace(a, b)` / `.length .split(sep)` (the case accessors split
words on any Unicode letter/number boundary, so `'Crème brûlée'` → `crème-brûlée`); `number`
`.round(decimals = 0) .floor .ceil .abs .clamp(min, max)`;
`date` `.iso .isoDate .timestamp .year .month (1–12) .day .hours .minutes .seconds` (UTC);
`array` `.of(item) .unique .compact .reverse` / `.first .last .length .join(sep = ',')`; `text` `.singleLine` /
`.characterCount .wordCount .lineCount .readingTime(wpm = 200) .lines .paragraphs`; `email` `.normalized` /
`.local .domain .href`; `url` `.protocol .origin .host .hostname .port .pathname .search .params .hash`;
`color` `.hex .rgb .hsl .channels .alpha`; `tel` `.normalized` / `.href .extension`; `mimeType` `.type .subtype .suffix
.essence`; read-only configuration getters `oneOf(...).values`, `pattern(...).regex`,
`url.base(...).baseUrl`, `html(...).adapter` / `.sanitizeOptions`, `markdown(...).adapters`. Subsets: `duration` `.iso`; `money` `.amount .currency`; `coords` `.lat
.lng`; `locale` `.language .region`; `html` / `markdown` `.plain`. Every string-based type (and every string-valued derivation) has the full `string`
set. An accessor fails at the base cast — never a partial. Universal on every token:
`.default(v) .required .strict .loose .extend(fn) .to(fn | token) .cast(value)`, the read-only
`name id defaultValue isRequired policy`, and the options object `({ default, required, strict, loose })`.
`required` / `strict` / `loose` survive every accessor, `.extend` and `.to` (so
`types.email.required.domain` still fails on a missing value); a `default` set earlier flows
through the later steps — see [Default values](#default-values). `defaultValue` reports only
the token's own (last-set) default.

There is **no `types.undefined`** — accessing it throws a migration error. Use the
`optional` util or just omit the key.

`types` is not a root package export. Get it from `initializeParser`, or import tokens
individually from `@bou-co/parsing/types`:

```ts
import { string, number, array, defineType } from '@bou-co/parsing/types';
export const scores = array.of(number); // reusable combinations are just values
```

That entry point is tree-shakeable and never pulls in the engine, so shared type files stay
light and work against any engine configuration. Opt-in subsets: `@bou-co/parsing/types/format`
(`formatDate`, `currency`, `percent`, `time`, `duration`, `money`), `types/data` (`record`,
`schema`, `coords`, `locale`), `types/content` (`html`, `markdown` + sanitiser adapters, peer
deps), `types/all` (format + data). Register them: `initializeParser({ types: { ...formatTypes } })`
— `dataTypes` and `allTypes` are the matching spread objects of `types/data` and `types/all`.
Registering them is only needed for the pipe form; as projection values they work unregistered.

What the subset types accept:

| Type                                        | Accepts → output                                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `time`                                      | `9:05`, `09.05.30`, `9 pm`, `9 a.m.`, a `Date` (its UTC time) → 24-hour `HH:mm`, or `HH:mm:ss` when seconds were given (always for a `Date`)                                                                                                                                                   |
| `duration`                                  | ISO 8601 incl. days (`PT1H30M`, `P1DT2H`), `h:mm:ss` / `m:ss`, a number of seconds or numeric string → seconds as a number; out-of-range clock parts and a bare `PT` fail                                                                                                                      |
| `money`                                     | `"12.50 EUR"`, `"EUR 12,50"`, `{ amount, currency }` → `{ amount: number, currency: 'EUR' }` (code upper-cased); a missing or non-numeric amount fails                                                                                                                                         |
| `coords`                                    | `{ lat, lng }`, `{ latitude, longitude }` (`lon` / `long` too), `[lat, lng]`, `"60.16, 24.93"` (`,` `;` or space, exactly two parts) → `{ lat, lng }`; ranges checked, empty parts fail                                                                                                        |
| `locale`                                    | a BCP 47 tag, `_` accepted (`en_us` → `en-US`)                                                                                                                                                                                                                                                 |
| `record` / `record.of(x)`                   | any non-array object; `.of(x)` casts every value and drops entries that cast to missing                                                                                                                                                                                                        |
| `schema(validator)`                         | whatever the Standard Schema validator accepts; its issues become the cast error message                                                                                                                                                                                                       |
| `currency(code = 'EUR', locale?, options?)` | a number → `Intl.NumberFormat` currency string; `options` are passed through to `Intl`                                                                                                                                                                                                         |
| `percent(digits?, locale?)`                 | a ratio → percentage string; `digits` is `minInt.minFrac-maxFrac` (`'1.0-2'`) or a max-fraction number (an invalid string throws at cast time)                                                                                                                                                 |
| `formatDate(format?, tz?, locale?)`         | a date → formatted string; presets and pattern letters follow Angular's `DatePipe` (full table in the README, _`formatDate`_); unknown letters are emitted literally (`yyyy-MM-ddTHH:mm`), the timezone takes `+0430` or `+04:30`; `formatDateValue` is the same formatter as a plain function |

`formatDate`, `currency` and `percent` take their locale from the explicit argument, else
`context.currentLocale`, else `context.defaultLocale`, else `en-US`.

**Content types** never sanitise by themselves — they adapt to a sanitiser you choose:
`html(sanitizeHtmlAdapter(opts?), perTokenOptions?)` or `html(ultrahtmlAdapter(opts?))`,
`markdown(markedAdapter(), sanitiserAdapter, { parser?, sanitiser? })`. Markdown output is
**always** sanitised (Markdown permits raw HTML); `html()` without an adapter and `markdown()`
without a parser or a sanitiser adapter throw when the type is created. `sanitize-html` is
the recommended default, `ultrahtml` the light option for edge/browser — its adapter also
drops `on*` attributes and `javascript:` / `vbscript:` / `data:` URLs, and adds its
drop-list to your `dropElements`. The peers load lazily; a missing one fails the first cast
with an error naming the package to install. The README's _Content types & security_ has the
full guidance.

Which types are built in, which are opt-in, and which are deliberately not shipped (`uuid`,
`iban`, `postalCode`, vendor IDs, …) follows the five-question admission test in the README
(_Why a type is (or isn't) built in_) — point people there, and at `pattern`/`schema`/`defineType`,
before writing a new built-in.

### Failure behaviour

Exactly two flows. A present-but-uncastable value throws `ParserCastError` (carrying `path`,
`type`, `key`, `received`, `cause`) — or, under `looseCasting: true`, is logged and dropped
(the key is omitted / the default fills). Nothing ever passes through uncast, so a value that
is present always has its declared type; what can differ is presence — a `.required` field
without a default is typed non-optional but is dropped under `looseCasting` / `.loose`. Per
token: `.strict` always throws, `.loose` always drops (silently; `onCastError` still fires).
`defineType({ strict: true })` is the object-form equivalent. A standalone `.cast(value)`
throws on failure; its error path reads `<root>`.

**Missing never fails.** `undefined`, `null` and `''` (not `false`, not `0`) skip casting for
every type and the key is omitted (or the default fills). The only exception is `.required`
/ `{ required: true }`: a missing value then fails like any other failure (thrown by
default, dropped under `looseCasting`, always thrown with `.strict`), and the field is
non-optional in the inferred type.

## Default values

Every token has `.default(value)`:

```ts
createParser({
  title: types.string, // → string | undefined
  displayName: types.text.default('Item'), // → string; '' and '  ' also become 'Item'
  retries: types.number.default(0), // → number
  tags: types.array.of(types.string).default([]), // → string[]
  year: types.date.year.default(1970), // → number; a default at the END is used as written
  slug: types.string.default('Untitled').kebab, // → 'untitled'; an EARLIER default runs through the later steps
});
```

The default applies whenever the field would end up `undefined` — missing input (`''`
included), a cast that reports "missing" (`text` on whitespace), or a failed cast under
`looseCasting: true` / `.loose`. A token's
own default is returned **as-is and not cast** by that token (TypeScript already enforces it
matches). It never masks
hard failures: under the default policy a present-but-invalid value still throws, and
`.strict` types always do.

Its most important side effect is on the type: a defaulted field is non-optional in the
inferred output, which removes a whole class of `?.` from consuming code.

**Position decides what happens to the default.** The last-set default is used as written. A
default set earlier in the chain runs through every later step — accessor, `.extend`,
`.to(fn)`, `.to(token)`, `defineType({ extends })` — and the field stays non-optional either
way:

| Chain                                              | Missing input gives        | Field type |
| -------------------------------------------------- | -------------------------- | ---------- |
| `types.string`                                     | key omitted                | `string?`  |
| `types.string.default('draft')`                    | `'draft'`                  | `string`   |
| `types.string.default('draft').upperCase`          | `'DRAFT'`                  | `string`   |
| `types.string.upperCase.default('draft')`          | `'draft'`                  | `string`   |
| `types.date.default(d).iso`                        | `d.toISOString()`          | `string`   |
| `types.string.default('a').upperCase.default('b')` | `'b'` (the later one wins) | `string`   |
| `types.email.required.domain`                      | cast failure               | `string`   |

The flowed default also fills a failed cast under `looseCasting` / `.loose`. If a later step
**throws** on the default it is a normal cast failure (thrown; dropped under a non-throwing
policy); if it returns `undefined` for it (`types.array.default([]).first`) the key is omitted.
Steps that only reconfigure the token (`.required`, `.strict`, `.loose`, `.of()` on `array` /
`record`, `url.base()`) keep the default as written.

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

Returning `undefined` omits the key; returning `'_inherit'` passes `data[key]` through.
Returning a parser runs it against `data[key]` (projection-driven when that can't feed it) —
which is how you make a nested parse conditional. A returned `parser.flat` is **nested under
the key, not merged**: `.flat` only merges when it is the projection value itself. Returning a
**type token** applies it as the cast for the raw value at the key, so a function can pick the
type dynamically: `flag: ({ data }) => (data.kind === 'strict' ? types.boolean : types.string)`.

Whatever a value function returns then goes through transformers and patterns like any other
picked value. `value`, `variable`, `get(path, token)` and `store(key, fn)` are ready-made
value functions (see `features.md` and `caching.md`).

## The ParserContext object

Passed to every value function, transformer, pipe, hook, and pattern resolver.

| Field          | Meaning                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data`         | Raw input at the **current nesting level**. `{}` during projection-driven resolution; the piped / transformed value inside pipes and transformers                                           |
| `value`        | The raw incoming value at this key (`data?.[key]`), never eagerly resolved; `undefined` for a missing key and during projection-driven resolution. Mirrors `data` in pipes and transformers |
| `key`          | The key currently being evaluated (the item index for array items)                                                                                                                          |
| `index`        | Numeric index when inside an array                                                                                                                                                          |
| `isRoot`       | `true` only at the actual root — `false` inside every kind of nesting                                                                                                                       |
| `parent`       | The enclosing level's context, chaining to the root (`undefined` at root) — details below                                                                                                   |
| `path`         | Chain of projection references from the root to the current level                                                                                                                           |
| `datalessPath` | Present **only** during projection-driven resolution — how a value function detects it is running without data                                                                              |
| `projection`   | The active projection at this level                                                                                                                                                         |
| `variables`    | Merged global + schema + instance variables, plus `current` (root input)                                                                                                                    |
| `pipes`        | Merged pipe functions                                                                                                                                                                       |
| `types`        | Merged type namespace: built-ins plus everything registered at any level — what templates resolve type pipes from                                                                           |
| `params`       | Inside a pipe: resolved parameters after the pipe name; `undefined` if none                                                                                                                 |
| `resolve`      | Contextual `resolve` that inherits the active context. `resolve()` with no arguments resolves `context.value` (memoized); `resolve(undefined)` is a different call — arity decides          |
| `store`        | `store(key, fn, options?)` — get-or-compute caching for one value, plus `match` / `add` / `remove` / `clear`                                                                                |
| `storage`      | Direct access to the configured storage backend                                                                                                                                             |
| `cache`        | Merged caching options                                                                                                                                                                      |
| `parser`       | The underlying `Parser` instance                                                                                                                                                            |
| `onCastError`  | The configured cast-error observer, if any                                                                                                                                                  |
| `looseCasting` | The active loose-casting policy                                                                                                                                                             |

**`parent`:** `parent.key` is the key the current level sits under, `parent.value` the raw
value it was fed from, `parent.data` the enclosing level's data. For array items the parent is
the **array level** — `parent.data` is the array and `parent.key` the index — so the object
containing the array is `parent.parent`. An `@if` then-parser's parent is the `@if` level, so
its `parent.data` is the same data it receives.

A cast inside `types.array.of(x)` / `record.of(x)` sees an item context: `value` is the item,
`key` (and `index` for arrays) its position, `parent` the context of the array key — which is
why an item error path reads `tags.1`. Item tokens keep their own `.default` / `.required`.

When a `before` hook returns a new context object, `store` and `resolve` are re-bound to it,
so they always act on the active context.

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
`types`, `isRoot`, `cache`, `value`, `parent`, `path`, `store`, `resolve`. Treat
`datalessPath`, `parser`, `index`, and `params` as reserved too (see `gotchas.md`).

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

**What feeds a nested level** — one rule for inline objects, nested parsers, `.flat` and
parsers returned from value functions:

| `data[key]` is                                                                                 | Result                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| an object (or array)                                                                           | parsed as the nested data                                                                                                                                                            |
| a stringified object/array (`'{"a":1}'`)                                                       | `JSON.parse`d, then parsed (invalid JSON throws)                                                                                                                                     |
| a full-string pattern resolving to an object (`'{{settings}}'`)                                | the resolved object is parsed                                                                                                                                                        |
| anything else — missing, `null`, a number, a boolean, a plain string, a scalar-valued variable | **projection-driven**: resolved against `{}`, so constants, defaults, value functions, `@if` and `@combine` still produce output; the incoming value stays at `context.parent.value` |

Array-shaped projections (`'@array': true`, array literals, `.asArray`) are the exception to
the last row: without usable data they are omitted. A projection-driven resolution with zero
keys is dropped, which cascades through deep nesting. Recursive schemas terminate: a
projection already resolved in the current data-less chain is not entered again, also through
`@if` then-parsers.

A nested parser stays bound to the engine that created it: it keeps its own transformers,
whole-parse cache storage, and variable cache, while parent context values still merge down
(on collisions the parent's values win). That's what makes cross-configuration composition
safe.

`.flat` behaves like `@combine`: merged fields override same-named regular keys and are typed
optional, and the flat key disappears from the output type. The result must be an object —
`.flat` on array data throws (`.flat at "<key>" merges object results only`). With missing
input it resolves projection-driven like any nested parser, so its constants and defaults
still merge.

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

  // Arrays of scalars are a type, not a projection
  scores: types.array.of(types.number),
});
```

Array items expose `index` on the context, and their `parent` is the array level (see the
context table). Unlike object projections, all three array projection forms **require array
input** and are skipped when it's missing — they are never produced projection-driven.

`types.array.of(x)` keeps an `undefined` slot for an item that casts to missing
(`['1', '', '3']` → `[1, undefined, 3]`) so indices stay stable; add `.compact` to drop the
holes. `record.of(x)` drops such entries instead.

`parser.asArray` is a derived variant, not the parser itself: `parser.asArray !== parser`.
It still hashes as its base parser (`String(parser.asArray) === String(parser)`), and calling
it directly bypasses whole-parse caching — see `caching.md`.

## Type inference and optionality

The output type is derived from the projection literal. There is nothing to write and no
generic to pass.

```ts
const parser = createParser({
  title: types.string,
  count: types.number.default(0),
  tags: types.array.of(types.string),
  kind: typed<'a' | 'b'>,
});

type Out = ParserReturnValue<typeof parser>;
// { title?: string; count: number; tags?: string[]; kind?: 'a' | 'b' }
```

Rules:

- Plain type tokens → optional
- Tokens with `default` or `.required` (or the options form) → non-optional, **wherever it sits
  in the chain**: `types.email.required.domain`, `types.date.default(d).year`,
  `types.string.required.to((v) => v.length)`, `types.array.required.of(types.number).first`
- Constants → their literal type
- Value functions → their return type (annotate the function if inference is too wide);
  `get(path, token)` / `value` / `variable(expr, token)` → the token's output
- Nested projections → recursively inferred, optional
- `.flat`, `@if` and `@combine` merged fields → optional

`typed<T>` forces a specific type where a token can't express it; it passes `data[key]`
through **without casting**, so it's a type assertion, not a guarantee.

Where type and runtime can differ, all worth knowing:

- Under `looseCasting: true` / `.loose` a `.required` field without a default is typed
  non-optional but dropped when missing or invalid.
- Accessors added through `defineType({ accessors, methods })` or an accessor-map registration
  do not see a `.default` / `.required` placed **before** them in the type (runtime is right) —
  put it after: `types.date.relative.required`. An accessor map that re-uses a name the family
  already declares keeps the family's typing.
- A `'{{ … }}'` literal is typed `string` whatever its pipes return (`'{{ n | number }}'` is a
  number at runtime) — use `variable('n', types.number)` / `value('{{n}}', types.number)`.
- A transformer or pattern that reshapes a value under `typed<T>` or a value function (localize
  collapsing an object to a string) makes the inferred type inaccurate.

A value that passed a type token always has the token's type. Elsewhere, assert: `resolve<T>(input)`
/ `resolve<T>()`, `variables.x as T`, `typed<T>`.

## The three context levels

Context merges from three places, most specific winning:

1. **Global** — `initializeParser(config)`. Engine-wide. The only place `patterns` and
   `storage` can be set.
2. **Schema** — `createParser(projection, options)`. All executions of this parser. Good for
   schema-specific `variables`, `pipes`, `cache`, and `before`/`after` hooks.
3. **Instance** — `parser(data, options)`. This execution only. Good for request-scoped
   values: current user, active locale.

`variables`, `pipes` and `types` are configurable at all three. `patterns` is global-only — the
registry is compiled once per engine.

`types` registrations take a token or factory by name, or an **accessor map** that extends an
existing family (`types: { date: { relative: (value: Date) => timeAgo(value) } }` →
`types.date.relative`, still callable and chainable like the original). An accessor map under
a name that is not a registered type, or an entry that is none of the three, throws. A token
under a built-in's name replaces it and warns once. Only the object-form **global** config
extends the `types` namespace returned by `initializeParser`; schema-level, instance-level and
function-form global registrations are visible to templates as pipes only.
