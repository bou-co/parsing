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
conservative — only lossless, unambiguous conversions happen. Tokens are configured by
**chaining** (`types.string.default('x')`, `types.number.round(2)`, `types.date.iso`,
`types.array.of(types.string).unique`) — no-parameter accessors are properties, parameterised
ones are methods — or by calling the token with an **options object** for the universal
options: `types.string({ default: 'x', required: true, strict: true })` ≡ the chain. Items go
through `.of()`, never as call parameters (`types.array(x)` from early RCs is `.of(x)`).

| Type                          | Accepts                                                                                                                                               | Fails on                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `types.string`                | strings; finite numbers; booleans; valid `Date` (→ ISO string)                                                                                        | objects, arrays, `NaN`, `Infinity`            |
| `types.number`                | numbers (incl. `NaN`/`Infinity`, unchecked); booleans (`1`/`0`); `Date` (→ `getTime()`); numeric strings (`'12.5'`, `'1e3'`)                          | `'12px'`, objects (`''` is missing)           |
| `types.boolean`               | booleans; `1`/`0`; `'true'`/`'false'` (case-insensitive)                                                                                              | other numbers and strings                     |
| `types.date`                  | `Date` instances; parseable date strings; epoch numbers (incl. `0`)                                                                                   | unparseable values, `false` (`''` is missing) |
| `types.object`                | any non-array object (`Date`, `Map`, class instances pass through)                                                                                    | arrays, primitives                            |
| `types.array`                 | arrays (passed through)                                                                                                                               | non-arrays                                    |
| `types.array.of(types.x)`     | arrays, casting each item with `x`                                                                                                                    | non-arrays; any failing item                  |
| `types.any` / `types.unknown` | anything (pure pass-through)                                                                                                                          | never fails                                   |
| `types.text`                  | what `string` does; textarea tidying (trim, collapse spaces, fold blank lines, **line breaks kept**), empty → **missing**                             | what `string` rejects                         |
| `types.email`                 | `local@domain.tld`; trimmed, **case kept** (`.normalized` lower-cases, `.href` → `mailto:`)                                                           | anything else                                 |
| `types.url`                   | absolute URLs (`new URL()`), normalised `href`; `.base(url)` for relative fields                                                                      | `/relative`, `//protocol-relative`            |
| `types.slug`                  | any string → ASCII slug (Latin folded/transliterated, lower-case, `-` separated); non-Latin scripts dropped; pre-step via `.to(types.slug)`           | nothing URL-safe left                         |
| `types.color`                 | hex / `rgb()` / `hsl()` → lower-case `#rrggbb[aa]`                                                                                                    | named colours, malformed                      |
| `types.tel`                   | kept **as written**; separators, optional `+`, extension (`ext. 12`/`x12`/`#12`), 3–15 digits (not country-aware); `.normalized` `.href` `.extension` | wrong length, letters                         |
| `types.mimeType`              | `type/subtype+suffix; params`, lower-cased                                                                                                            | no `type/subtype`                             |
| `types.json`                  | JSON strings parsed, non-strings pass; `.of(inner)` for a typed result                                                                                | invalid JSON                                  |
| `types.unique(item)`          | arrays, deduplicated like a `Set`, returned as a plain array                                                                                          | non-arrays                                    |
| `types.oneOf(...v)`           | one of the literals (numeric/boolean members also as strings); union type                                                                             | anything else                                 |
| `types.pattern(re)`           | matching strings; named groups → group map                                                                                                            | non-matches                                   |

Accessor families (transforms keep the type and chain; derivations change it): `string`
`.upperCase .lowerCase .capitalize .titleCase .camel .pascal .kebab .snake .trim .truncate(n)
.replace(a, b)` / `.length .split(sep)`; `number` `.round(n) .floor .ceil .abs .clamp(min, max)`;
`date` `.iso .isoDate .timestamp .year .month (1–12) .day .hours .minutes .seconds` (UTC);
`array` `.of(item) .unique .compact .reverse` / `.first .last .length .join(sep)`; `text` `.singleLine` /
`.characterCount .wordCount .lineCount .readingTime(wpm) .lines .paragraphs`; `email` `.normalized` /
`.local .domain .href`; `url` `.protocol .origin .host .hostname .port .pathname .search .params .hash`;
`color` `.hex .rgb .hsl .channels .alpha`; `tel` `.normalized` / `.href .extension`; `mimeType` `.type .subtype .suffix
.essence`. Every string-based type (and every string-valued derivation) has the full `string`
set. An accessor fails at the base cast — never a partial. Universal on every token:
`.default(v) .required .strict .loose .extend(fn) .to(fn | token) .cast(value)`, the read-only
`name id defaultValue isRequired policy`, and the options object `({ default, required, strict, loose })`.

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
deps), `types/all` (format + data). Register them: `initializeParser({ types: { ...formatTypes } })`.

Which types are built in, which are opt-in, and which are deliberately not shipped (`uuid`,
`iban`, `postalCode`, vendor IDs, …) follows the five-question admission test in the README
(_Why a type is (or isn't) built in_) — point people there, and at `pattern`/`schema`/`defineType`,
before writing a new built-in.

### Failure behaviour

Exactly two flows. A present-but-uncastable value throws `ParserCastError` (carrying `path`,
`type`, `key`, `received`, `cause`) — or, under `looseCasting: true`, is logged and dropped
(the key is omitted / the default fills). Nothing ever passes through uncast, so inferred
types are true at runtime. Per token: `.strict` always throws, `.loose` always drops
(silently; `onCastError` still fires). `defineType({ strict: true })` is the object-form
equivalent.

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
  year: types.date.year.default(1970), // → number — the default goes at the END of a chain
});
```

The default applies whenever the field would end up `undefined` — missing input (`''`
included), a cast that reports "missing" (`text` on whitespace), or a failed cast under
`looseCasting: true` / `.loose`. It
is returned **as-is and not cast** (TypeScript already enforces it matches). It never masks
hard failures: under the default policy a present-but-invalid value still throws, and
`.strict` types always do.

Its most important side effect is on the type: a defaulted field is non-optional in the
inferred output, which removes a whole class of `?.` from consuming code.

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
