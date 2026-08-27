# Bou Parsing ~ project any data into a shape that resolves your typing problems

Sketch the shape of your data. The parser fills it in.

Bou Parsing is a declarative data layer for TypeScript. A projection looks like a plain
object but behaves like a canvas: every key can hold whatever produces its value, from a
casting type to an async fetch to a whole other parser. The engine resolves it all against
your raw data and infers the exact TypeScript type on the way out. Built for highly
dynamic websites: await a parser in a Next.js Server Component or an Astro page, and your
content comes out joined, templated, cached, and typed.

[NPM](https://www.npmjs.com/package/@bou-co/parsing) | [GitHub](https://github.com/bou-co/parsing)

---

## Key capabilities at a glance

- **Field picking**: select only the keys you need from any input shape
- **Type casting**: declared types are enforced at runtime: `types.number` turns `'21'` into `21`, with exactly two failure flows (throw, or drop and log)
- **Use-case types**: `email`, `url`, `slug`, `color`, `tel`, `mimeType`, `json`, `oneOf`, `pattern` and a CMS-friendly `text` ship in, with chainable accessors (`types.date.iso`, `types.number.round(2)`, `types.url.pathname`)
- **Custom types**: `defineType` or `class Sku extends StringType` — extend a built-in and inherit its whole accessor surface
- **Types as pipes**: every type, built-in or registered, is a template pipe under the same name: `{{ price | round:2 }}`, `{{ contact | email || "n/a" }}`
- **Value transformation**: sync or async functions, static constants, derived values
- **Nested structures**: objects, arrays, and reusable sub-parsers compose naturally
- **Conditional fields**: `@if` blocks add or override fields based on runtime conditions
- **Data merging**: `@combine` fetches secondary data and merges it into the output
- **Variable interpolation**: `{{variable}}` templates with fallbacks, chained pipes, and async resolvers
- **Patterns**: define your own inline syntaxes (e.g. `$products.count`) resolved from any string; variables are just the built-in one
- **Transformers**: global hooks that auto-convert matching values (e.g. localisation objects)
- **Lifecycle hooks**: `before`/`after` callbacks for shared context setup and post-processing
- **Server-side caching**: pluggable storage (Redis, etc.) with deterministic cache-key generation
- **TypeScript inference**: output types derived entirely from the projection literal, no generics to write

## Table of Contents

- [The core idea](#the-core-idea)
- [Get Started](#get-started)
- [Basic Usage](#basic-usage)
  - [Defining the data you want](#defining-the-data-you-want)
  - [Types & casting](#types--casting)
    - [The built-in catalogue](#the-built-in-catalogue)
    - [Accessors](#accessors)
    - [Missing values and defaults](#missing-values-and-defaults)
    - [Failure behaviour](#failure-behaviour)
  - [Adding and modifying values](#adding-and-modifying-values)
  - [Nested data structures](#nested-data-structures)
    - [The projection is the point of truth](#the-projection-is-the-point-of-truth)
    - [Flattening nested parsers with `.flat`](#flattening-nested-parsers-with-flat)
  - [Conditional data](#conditional-data)
- [Fundamentals](#fundamentals)
  - [The value resolution pipeline](#the-value-resolution-pipeline)
  - [Transformers vs patterns](#transformers-vs-patterns)
- [Advanced Usage](#advanced-usage)
  - [Custom types & casting options](#custom-types--casting-options)
    - [Extending types](#extending-types)
    - [Registering types](#registering-types)
    - [Loose casting](#loose-casting)
    - [Strict and loose types](#strict-and-loose-types)
    - [Opt-in type subsets](#opt-in-type-subsets)
    - [`formatDate`](#formatdate)
    - [Why a type is (or isn't) built in](#why-a-type-is-or-isnt-built-in)
    - [Content types & security](#content-types--security)
  - [Multiple parser configurations](#multiple-parser-configurations)
  - [Merging data](#merging-data)
  - [Variables](#variables)
    - [Built-in context variables](#built-in-context-variables)
    - [Dynamic Variable Resolvers](#dynamic-variable-resolvers)
  - [Expressions & pipes](#expressions--pipes)
    - [Fallbacks & literals](#fallbacks--literals)
    - [Pipes](#pipes)
    - [Types as pipes](#types-as-pipes)
    - [Escaping](#escaping)
  - [Resolving values without parsing](#resolving-values-without-parsing)
    - [Function values & the contextual `resolve`](#function-values--the-contextual-resolve)
  - [Dynamic projections](#dynamic-projections)
  - [Extending parsers](#extending-parsers)
  - [Context overriding](#context-overriding)
  - [Lifecycle hooks](#lifecycle-hooks)
  - [Transformers](#transformers)
  - [Patterns](#patterns)
  - [Chaining parsers (Reparsing)](#chaining-parsers-reparsing)
- [Examples & Use Cases](#examples--use-cases)
  - [Next.js App Router & Server Components](#nextjs-app-router--server-components)
  - [Server-Side Data Fetching & Caching](#server-side-data-fetching--caching)
  - [Value-Level Caching with `context.store`](#value-level-caching-with-contextstore)
  - [Caching individual values with `cacheResult`](#caching-individual-values-with-cacheresult)
  - [CMS Content Templating with Variables](#cms-content-templating-with-variables)
  - [CMS Dynamic Variables with On-Demand Fetching & Caching](#cms-dynamic-variables-with-on-demand-fetching--caching)
  - [Advanced TypeScript Generation & Utilities](#advanced-typescript-generation--utilities)
  - [Global Localization via Transformers](#global-localization-via-transformers)
  - [Client-Side React Integration](#client-side-react-integration)
- [Gotchas](#gotchas)
  - [Templating](#templating)
  - [Casting & types](#casting--types)
  - [Projection-driven nesting & directives](#projection-driven-nesting--directives)
  - [Context & resolve](#context--resolve)
  - [Configuration & caching](#configuration--caching)
- [API Reference](#api-reference)
  - [Core Functions](#core-functions)
  - [Context Object (`ParserContext`)](#context-object-parsercontext)
  - [Context Configuration & Modifiers](#context-configuration--modifiers)
  - [Projection Directives](#projection-directives)
  - [Built-in Types](#built-in-types)
  - [Utility Functions](#utility-functions)
- [Comparison with Zod](#comparison-with-zod)
  - [Feature overview](#feature-overview)
  - [What actually makes the difference](#what-actually-makes-the-difference)
  - [Which one to use](#which-one-to-use)
- [Agent skills](#agent-skills)
- [Maintainers](#maintainers)

---

## The core idea

Everything in Bou Parsing is a **projection**. Not a form to fill in, a canvas to compose
on: casting types (`types.string`, `types.number`, …), constants, sync or async functions,
nested projections, other parsers, all valid values for any key. The engine walks your
composition, resolves every rule against the raw data in parallel, and returns a strictly
typed object, with the type inferred from the projection itself. You never write an
interface for data you already described.

Because a projection declares output instead of describing input, it can do things a schema
never could. A field can join in data from another API mid-parse. A string from your CMS
can carry `{{variables}}` with fallbacks and pipes, so content editors get templating
without you building a template engine. The expensive parts can be cached through Redis or
any storage you plug in. The inspiration comes from GraphQL queries and GROQ projections
rather than validation schemas, and it shows: this is a data layer for sites that need
their data fetched, shaped, and typed in one pass.

Every parser is an async function, which makes the server its natural home. Await it in a
React Server Component or an Astro page and the props arrive fully typed, no generics, no
interface files. Fetch a heavy API response, join what's missing, cache the result, and
send the frontend only the fields it renders. The library is isomorphic and runs in the
browser too, with a `useParserValue` hook for the client side.

Looking for a validation library? That's [Zod](https://zod.dev), and it's excellent at it.
Bou Parsing overlaps with Zod on validation, casting, and inference, but treats them as one
stage of a larger pipeline that also picks, derives, joins, templates, and caches. In
short: Zod checks the data you have, Bou Parsing produces the data you want. The full
rundown lives in [Comparison with Zod](#comparison-with-zod).

## Get Started

### 1 - Install the package

Install the Bou Parsing package from NPM. It supports all frameworks.

```bash
npm i @bou-co/parsing
```

> While v3 is a release candidate it is published under the `v3-rc` tag — `npm i @bou-co/parsing@v3-rc`; `latest` is still v2.

The package has no runtime dependencies and requires Node `^20.19.0 || >=22.12.0`. React is an **optional peer dependency** — install `react` yourself only if you use the [`@bou-co/parsing/react`](#client-side-react-integration) entry point.

### 2 - Initialize the parser

In the root level of your code, run the `initializeParser` function to export your tailored `createParser` function and `types` object. This allows you to set up global configurations like caching and variables once. The returned `resolve` function runs the same variable and transformer resolution on hard-coded values without a projection. See [Resolving values without parsing](#resolving-values-without-parsing).

```ts
// parser-config.ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser, resolve, cacheResult, types } = initializeParser(/** Global configurations come here **/);
```

### 3 - Start using the parser

Use your customized `createParser` anywhere in your app's data flow to safely pick, validate, and type your data.

```ts
import { createParser, types } from '../path-to/parser-config';

const rawDataFromApi = {
  _id: 'abc-123',
  title: 'Hello World',
  description: 'Lorem ipsum',
  priority: 1,
};

const myParser = createParser({
  title: types.string,
  description: types.string,
  priority: types.number,
});

const result = await myParser(rawDataFromApi);

/* Result:
{
  "title": "Hello World",
  "description": "Lorem ipsum",
  "priority": 1
}
*/
```

## Basic Usage

### Defining the data you want

When querying data with an API that returns more than you need, you can use the parser to pick only the exact fields you want, omitting the rest.

```ts
import { createParser, types } from '../path-to/parser-config';

const rawDataFromApi = {
  _id: 'abc-123',
  title: 'Test',
  description: 'Lorem ipsum',
  priority: 1,
};

const myParser = createParser({
  title: types.string,
  description: types.string,
  priority: types.number,
});

const result = await myParser(rawDataFromApi);

/* Result:
{
  "title": "Test",
  "description": "Lorem ipsum",
  "priority": 1
}
*/
```

### Types & casting

Every `types.*` entry both **types** the output and **casts** the value at runtime: the declared type is guaranteed in the result, not just suggested to TypeScript.

The `types` namespace with all built-ins is returned by `initializeParser`. Re-export it from your parser config alongside `createParser` (as shown in [Get Started](#get-started)). The same built-ins are also individually importable from the tree-shakeable `@bou-co/parsing/types` entry point, which is ideal for standalone type files. Custom types are created with `defineType` (or by extending a type class) and used directly in projections; registering them is optional and only needed to use them as [pipes](#types-as-pipes). See [Custom types & casting options](#custom-types--casting-options).

```ts
import { createParser, types } from '../path-to/parser-config';

const myParser = createParser({
  age: types.number,
  active: types.boolean,
  published: types.date,
  tags: types.array.of(types.string),
  contact: types.email,
  website: types.url,
});

const result = await myParser({
  age: '21', // numeric string
  active: 'true', // boolean-like string
  published: '2026-01-01', // date string
  tags: ['ts', 42], // mixed array
  contact: 'bob@example.com',
  website: 'HTTPS://Example.com/a/../docs',
});

/* Result:
{
  "age": 21,
  "active": true,
  "published": Date('2026-01-01T00:00:00.000Z'),
  "tags": ["ts", "42"],
  "contact": "bob@example.com",
  "website": "https://example.com/docs"
}
*/
```

Every type is configured by **chaining**, left to right: `types.string.default('Untitled')`, `types.number.round(2)`, `types.date.iso`, `types.array.of(types.number).unique`. Accessors without parameters are properties, parameterised ones are methods, and the inferred type of the field follows the last link of the chain (`types.date.year` is a `number`). The universal options — `default`, `required`, `strict`, `loose` — are also accepted as an **options object** by calling the token, so both of these are the same token:

```ts
title: types.string({ default: 'Untitled' }),
title: types.string.default('Untitled'),

tags: types.array({ default: [] }).of(types.number),
tags: types.array.of(types.number).default([]),
```

Types are never parameters of a call: items go through `.of()` (`types.array.of(types.string)`), composition through `.to()`.

#### The built-in catalogue

The core types cast conservatively: only lossless, unambiguous conversions are performed.

| Type                          | Accepted inputs                                                                       | Fails on                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `types.string`                | strings; finite numbers, booleans (`String(value)`); valid dates (ISO string)         | objects, arrays, `NaN`/`Infinity`                              |
| `types.number`                | numbers; booleans (`1`/`0`); dates (`getTime()`); numeric strings (`'12.5'`, `'1e3'`) | `'12px'`, objects (`''` is missing, not a failure — see below) |
| `types.boolean`               | booleans; `1`/`0`; `'true'`/`'false'` (case-insensitive)                              | other numbers/strings                                          |
| `types.date`                  | `Date` instances; parseable date strings and epoch numbers                            | unparseable values                                             |
| `types.object`                | any non-array object (`Date`, `Map`, class instances pass through)                    | arrays, primitives                                             |
| `types.array`                 | arrays (passed through); `types.array.of(types.x)` also casts each item               | non-arrays                                                     |
| `types.any` / `types.unknown` | anything (pure pass-through, never fails)                                             | —                                                              |

The use-case types are always available too, with no configuration and no dependencies. They are named after **use cases, not rules** — `email`, `slug`, `tel`, never `min`, `max` or `nonEmpty` — which is why the catalogue stays this small and every name is guessable ([why a type is built in](#why-a-type-is-or-isnt-built-in)). Every one of them documents what it accepts, what it normalises, and what it rejects, because the normalisation is what surprises people:

| Type                           | Output    | Accepts                                                                                                                             | Normalises to                                                                                                                                                                       | Rejects                                                         |
| ------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `types.text`                   | `string`  | everything `string` does                                                                                                            | textarea-style tidying: trimmed, line endings `\n`, spaces/tabs collapsed, extra blank lines folded; **line breaks kept**; nothing left counts as **missing**                       | what `string` rejects                                           |
| `types.email`                  | `string`  | `local@domain.tld` shapes                                                                                                           | trimmed, **case kept as written** (`.normalized` lower-cases, `.href` → `mailto:`)                                                                                                  | anything else                                                   |
| `types.url`                    | `string`  | absolute URLs, exactly like `new URL()`                                                                                             | `href` (host lower-cased, path resolved, `..` collapsed)                                                                                                                            | relative paths (`/about`, `//cdn…`) — see `.base()` below       |
| `types.slug`                   | `string`  | any string                                                                                                                          | ASCII slug: Latin letters folded/transliterated, lower-cased, everything else becomes `-` (`Hyvää yötä` → `hyvaa-yota`) — see [Gotchas](#slug-is-ascii-only--non-latin-input-fails) | strings with no URL-safe characters left (non-Latin-only input) |
| `types.color`                  | `string`  | `#abc`, `#abcd`, `#aabbcc`, `#aabbccdd` (with or without `#`), `rgb()`/`rgba()`, `hsl()`/`hsla()`                                   | lower-case hex: `#rrggbb`, or `#rrggbbaa` when translucent                                                                                                                          | named colours, malformed values                                 |
| `types.tel`                    | `string`  | digits with spaces, dashes, dots, slashes, parentheses, an optional leading `+` and an optional extension (`ext. 12`, `x12`, `#12`) | **kept as written** (trimmed) — `.normalized` → `+358401234567` (a parenthesised `(0)` after `+` is dropped), `.href` → `tel:+358401234567;ext=12`                                  | fewer than 3 or more than 15 digits; letters                    |
| `types.mimeType`               | `string`  | `type/subtype+suffix; params` (IANA media types)                                                                                    | type parts lower-cased, spacing around `;` normalised (spaces around `=` are rejected), parameter values keep their case                                                            | anything without a `type/subtype`                               |
| `types.json`                   | `unknown` | JSON strings; non-strings pass through                                                                                              | `JSON.parse`d; compose `.of(inner)` for a real output type                                                                                                                          | invalid JSON                                                    |
| `types.unique(item)`           | `T[]`     | arrays                                                                                                                              | deduplicated like a `Set` (SameValueZero), order kept, returned as a **plain array**                                                                                                | non-arrays, failing items                                       |
| `types.oneOf(...values)`       | union     | one of the given literals; numeric/boolean members also as strings                                                                  | the matching member                                                                                                                                                                 | anything else (the error lists the allowed values)              |
| `types.pattern(regex, flags?)` | `string`  | strings matching the regex                                                                                                          | unchanged, or the **named-group map** when the regex has named groups                                                                                                               | non-matches (the error names the regex)                         |

`types.tel` is the display form: it validates the shape (3–15 digits plus the usual separators) and keeps the editor's formatting, so the same raw field feeds both the visible label and the link — `phoneTitle: get('phoneNumber', types.tel), phoneLink: get('phoneNumber', types.tel.href)` (see [`get`](#getpath-from-type)). It is explicitly not country-aware: no dialling plan is checked and `00`/`011` prefixes are not rewritten to `+`. `types.email` follows the same idea — the address is kept as written (the local part is technically case-sensitive), with `.normalized` for a lower-cased comparison key and `.href` for the `mailto:` link. `types.url` is absolute-only because that is what the platform does; CMS link fields that hold relative paths pair with `types.url.base('https://site.com')`, which mirrors `new URL(value, base)`:

```ts
const linkParser = createParser({
  href: types.url.base('https://site.com'), // '/about' → 'https://site.com/about', absolute links pass through
  path: types.url.base('https://site.com').pathname,
});
```

`types.json` is about input **encoding** (a string that needs decoding), while a dictionary shape is about **output**: `types.json.of(types.record.of(types.number))` (with `record` from [`types/data`](#opt-in-type-subsets)) decodes a `'{"a": "1"}'` string into `{ a: 1 }`, typed `Record<string, number>`. The two `.of()` forms treat a missing item differently: `record.of()` drops an entry whose value casts to missing, while `array.of()` keeps the position as `undefined` so indices stay stable — add `.compact` to drop them.

#### Accessors

An accessor returns a differently typed token, so inference follows it. Two kinds exist: a **transform** returns the same type in a different form and keeps chaining (`types.string.trim.upperCase.truncate(80)`), a **derivation** extracts or reinterprets part of the value and changes its type (`types.date.year` → `number`). Four rules decide which accessors exist. **Names are nouns describing the output** — `date.iso`, `email.domain`, `color.rgb` — never a verb, and never something like `date.time`, which a reader cannot predict as a clock string or an epoch. **Predictable without opening the docs** — if a reasonable user would have to check, it is a parameterised method or nothing. **Concepts are capped, members are not**: a type carries roughly four ideas at most (`date` has two, representations and calendar fields, across nine accessors); counting members would punish the uniformity that makes a set easy to remember. **The absence-surprise test**: if you would be surprised that something is missing, that is a catalogue bug to report, not an invitation to extend — families ship whole, never sampled, and `.extend`/`defineType` exist for genuinely custom needs. Where the platform already has names (`URL`), the accessors reuse them (`pathname`, not `path`).

| Family     | Transforms (same type)                                                                                                                             | Derivations                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `string`   | `.upperCase` `.lowerCase` `.capitalize` `.titleCase` `.camel` `.pascal` `.kebab` `.snake` `.trim` `.truncate(n, ellipsis = true)` `.replace(a, b)` | `.length` → number · `.split(sep)` → `string[]`                                                                                                              |
| `number`   | `.round(decimals = 0)` `.floor` `.ceil` `.abs` `.clamp(min, max)`                                                                                  | —                                                                                                                                                            |
| `date`     | —                                                                                                                                                  | `.iso` `.isoDate` (`YYYY-MM-DD`) `.timestamp` · `.year` `.month` (**1–12**) `.day` `.hours` `.minutes` `.seconds` (UTC)                                      |
| `array`    | `.of(item)` `.unique` `.compact` `.reverse`                                                                                                        | `.first` `.last` → item · `.length` → number · `.join(sep = ',')` → string                                                                                   |
| `text`     | all of `string` · `.singleLine`                                                                                                                    | `.characterCount` `.wordCount` `.lineCount` `.readingTime(wpm = 200)` → number · `.lines` `.paragraphs` → `string[]`                                         |
| `email`    | all of `string` · `.normalized` (lower-cased)                                                                                                      | `.local` `.domain` · `.href` (`mailto:…`)                                                                                                                    |
| `url`      | all of `string` · `.base(url)`                                                                                                                     | `.protocol` `.origin` `.host` `.hostname` `.port` `.pathname` `.search` `.hash` · `.params` → `Record<string, string>` (a repeated key keeps its last value) |
| `color`    | all of `string`                                                                                                                                    | `.hex` `.rgb` `.hsl` · `.channels` → `{ r, g, b }` · `.alpha` → number                                                                                       |
| `tel`      | all of `string` · `.normalized` (`+` and digits only)                                                                                              | `.href` (`tel:+…;ext=…`) · `.extension`                                                                                                                      |
| `mimeType` | all of `string`                                                                                                                                    | `.type` `.subtype` `.suffix` `.essence`                                                                                                                      |
| `json`     | `.of(inner)` (keeps `inner`'s family)                                                                                                              | —                                                                                                                                                            |

Inheritance is uniform: every string-based type — `text`, `email`, `slug`, `url`, `color`, `tel`, `mimeType`, `pattern`, and anything you build on `string` — exposes the full `string` set, and string-valued derivations (`email.domain`, `url.pathname`, `date.iso`, `array.join()`) are strings too, so `types.email.domain.upperCase` works. Some combinations are meaningless (`types.email.kebab`); that is fine, and better than a table of which type supports what. `.clamp` bounds a value rather than rejecting it, `.round` is decimal-safe (`1.005` → `1.01`), `.truncate` keeps the result within `n` characters including the `…`, and `.unique` compares like a `Set`.

An accessor **inherits its base type's failure**: `types.email.domain` on an invalid email fails at the email cast and never returns a partial or a best guess. Accessors also cast first: `types.string.upperCase` on the number `12` yields `'12'`.

Two accessors deliberately do not exist: `.int` on `number` (ambiguous between rounding and rejecting — use `.round()`; a constraint is the Zod boundary this library does not cross, see [`schema`](#opt-in-type-subsets)) and `.sort` on `array` (JavaScript's default sort is lexicographic and the resulting bug is silent).

#### Missing values and defaults

Missing data is the everyday reality of CMS-backed pages, so casting never punishes it: a value that is **missing** — `undefined`, `null`, or the empty string `''` (never `false` or `0`) — skips the cast and the key is left out of the output, for every type. Only a value that is present _and does not fit_ is a cast failure. Think of `types.string` as the raw value of an `<input>` — only the exact `''` is missing and nothing else is touched (`'  '` is a value) — and `types.text` as a `<textarea>`: tidied, so whitespace-only content is missing too, and line breaks are kept. Most CMS fields want `text`; `string` is the familiar word, but it is the raw one.

`.default(value)` (or `{ default: value }`) fills in whenever the field would otherwise end up `undefined`: missing input, a type that reports the value as missing, and failed casts under a non-throwing policy. A field with a default is therefore never `undefined`, and its inferred output type is non-optional:

```ts
const myParser = createParser({
  title: types.string, // → string | undefined
  displayName: types.text.default('List item'), // → string ('' and '   ' also become 'List item')
  retries: types.number.default(0), // → number
  tags: types.array.of(types.string).default([]), // → string[]
  year: types.date.year.default(1970), // → number, the default sits at the end of the chain
});
```

The default is returned as-is (it is not cast; TypeScript already enforces it matches the output type) and also works with `defineType` via `{ fn, default }`. It never masks hard failures: under the default policy a present-but-invalid value still throws, and `.strict` types always do.

When a field genuinely must be there, say so with `.required` (or `{ required: true }`): a missing value then fails like any other cast failure — thrown by default, dropped and logged under `looseCasting`, always thrown with `.strict` — and the field is non-optional in the inferred type:

```ts
const pageParser = createParser({
  title: types.text.required, // '' or a missing title is an error
  slug: types.slug({ required: true, strict: true }), // and always throws, even under looseCasting
});
```

#### Failure behaviour

Exactly two flows exist across the whole system, at the cast site and when a type runs as a [pipe](#types-as-pipes):

1. **Throw.** A `ParserCastError` carrying `path`, `key`, `type`, `received` and `cause`. The default.
2. **Log and undefined.** The value is dropped (the key is omitted from the output, or `.default()` fills it) and a warning is logged unless `onCastError` observes it.

A failure is a value that is present and does not fit — or a missing value on a `.required` token. `looseCasting: true` switches a context to the second flow; a token can pin either flow for itself with `.strict` (always throw) or `.loose` (always undefined, silently). Because an uncast value never passes through, the inferred output types are true at runtime in every configuration. See [Loose casting](#loose-casting).

### Adding and modifying values

You can append static values, compute synchronous/asynchronous values, or derive new properties from the raw input data.

```ts
import { createParser, types } from '../path-to/parser-config';

const rawDataFromApi = {
  title: 'Test',
  priority: 1,
};

const myParser = createParser({
  title: types.string,

  // 1. Static value added as is
  postType: 'blogPost',

  // 2. Function return value
  randomNumber: () => 42,

  // 3. Promises supported
  asyncText: async () => {
    return await Promise.resolve('Fetched later');
  },

  // 4. Custom override based on existing data
  priority: (context) => {
    if (!context.data.priority) return 100;
    return context.data.priority * 10;
  },

  // 5. Variation of raw value
  metaTitle: (context) => `${context.data.title} - Our blog`,
});

const result = await myParser(rawDataFromApi);

/* Result:
{
  "title": "Test",
  "postType": "blogPost",
  "randomNumber": 42,
  "asyncText": "Fetched later",
  "priority": 10,
  "metaTitle": "Test - Our blog"
}
*/
```

### Nested data structures

Parsers seamlessly handle nested objects, arrays, and even other parsers as property definitions.

```ts
import { createParser, types } from '../path-to/parser-config';

const rawDataFromApi = {
  title: 'Nested Test',
  details: { desc: 'Inner description', level: 5 },
  tags: [{ name: 'ts' }, { name: 'js' }],
};

const tagParser = createParser({
  name: types.string,
  isAwesome: () => true,
});

const myParser = createParser({
  title: types.string,

  // Nested Object
  nestedDataObject: {
    desc: types.string,
    level: types.number,
  },

  // Nested Array
  nestedDataArray: {
    '@array': true,
    name: types.string,
    indexLabel: ({ index }) => `Item ${index}`, // Arrays expose 'index' in context
  },

  // Nested Parser
  parsedTags: tagParser.asArray,
});

// Notice we map 'details' to 'nestedDataObject' and 'tags' to 'nestedDataArray'/'parsedTags'
// Since input keys don't match exactly, we'd normally alias them or pass data directly.
// Let's execute assuming the raw data matches the parser schema structure for simplicity:
const structuredData = {
  title: rawDataFromApi.title,
  nestedDataObject: rawDataFromApi.details,
  nestedDataArray: rawDataFromApi.tags,
  parsedTags: rawDataFromApi.tags,
};

const result = await myParser(structuredData);

/* Result:
{
  "title": "Nested Test",
  "nestedDataObject": { "desc": "Inner description", "level": 5 },
  "nestedDataArray": [
    { "name": "ts", "indexLabel": "Item 0" },
    { "name": "js", "indexLabel": "Item 1" }
  ],
  "parsedTags": [
    { "name": "ts", "isAwesome": true },
    { "name": "js", "isAwesome": true }
  ]
}
*/
```

#### The projection is the point of truth

Nested projections resolve from the schema, not from the shape of the incoming data. When the input lacks a key (or holds a scalar that cannot feed an object projection, like `null`, `0`, `''`, `false`, or `5`), the nested projection still resolves: constants, value functions, type-token defaults, `@combine`, and `@if` inside it all produce output as usual.

```ts
const myParser = createParser({
  title: types.string,
  meta: {
    version: 3, // constant, always present
    theme: types.string.default('light'), // default, always present
    description: types.string, // needs data, omitted without it
  },
});

const result = await myParser({ title: 'Hello' });
// → { title: 'Hello', meta: { version: 3, theme: 'light' } }
```

The rules that keep this predictable:

- **Empty results are omitted.** If everything inside a nested projection depended on the missing data, the resolved object has no keys and the key is dropped entirely, so purely data-mapping projections keep their omit behavior. This cascades naturally through deep nesting.
- **Arrays are never conjured without data.** Projections marked `'@array': true`, array literals, and `parser.asArray` values keep requiring array input.
- **The incoming value stays reachable.** During projection-driven resolution `context.data` is an empty object, and the original value (if any) is available through `context.parent.value` (`context.parent.data` is the parent level's data object).
- **Recursive schemas terminate.** A parser that references itself (directly or mutually) stops at the first repeat: the cycle is resolved once more with its data-independent fields, then cut.
- **Opting out is a one-liner.** A value function can make any nested parser data-driven again: `child: ({ data }) => (data['child'] ? childParser : undefined)`.

Note that value functions and `@combine` resolvers inside nested projections now run even when the key is absent from the data, including any API fetches or `context.store` calls they make.

#### Flattening nested parsers with `.flat`

Use `.flat` instead of nesting when a sub-parser's fields should live directly on the parent output. The parser still receives the data under its key, but the parsed fields are merged into the parent object and the key itself disappears:

```ts
const seoParser = createParser({ title: types.string, description: types.string });

const pageParser = createParser({
  name: types.string,
  seo: seoParser.flat,
});

const result = await pageParser({ name: 'Home', seo: { title: 'T', description: 'D' } });
// → { name: 'Home', title: 'T', description: 'D' }
```

`.flat` is the composable sibling of the `@combine` directive and behaves the same way: merged fields override same-named regular keys and they are typed as optional in the output. With missing input the sub-parser resolves projection-driven: data-independent fields (constants, defaults) still merge, and if nothing resolves, nothing is merged. The result must be an object; using `.flat` on array data throws.

### Conditional data

Support for fully conditional data picking and addition using `@if`.

```ts
import { createParser, types } from '../path-to/parser-config';

const rawDataFromApi = {
  title: 'Test',
  priority: 2,
};

const myParser = createParser({
  title: types.string,
  priority: types.number,
  '@if': [
    {
      // Adds 'highPriority' if priority is above 1
      when: (context) => context.data.priority > 1,
      then: { highPriority: true },
    },
    {
      // Modifies 'title' if priority is below 10
      when: (context) => context.data.priority < 10,
      then: { title: (context) => `${context.data.title} (Draft)` },
    },
  ],
});

const result = await myParser(rawDataFromApi);

/* Result:
{
  "title": "Test (Draft)",
  "priority": 2,
  "highPriority": true
}
*/
```

---

## Fundamentals

A few concepts pay off across everything else in this document. Values flow through a fixed resolution pipeline, and the library offers extension points at different levels of ambition: [variables](#variables) are the everyday tool most projects never outgrow, [transformers](#transformers) are the mid tier for reshaping whole values, and custom [patterns](#patterns) are the expert tier for defining your own inline syntaxes.

### The value resolution pipeline

Every projected key resolves its value through the same stages, in order:

1. **Pick**: the raw value is read from the input data, or produced by a value function or nested parser in the projection.
2. **Transformers**: every global transformer whose `when` condition matches may replace the whole value. See [Transformers](#transformers).
3. **Patterns**: string values are scanned for pattern matches (`{{variable}}` interpolation by default); each match is resolved and spliced back into the text. See [Variables](#variables) and [Patterns](#patterns).
4. **Casting**: the declared `types.*` token casts the final value at the very end. See [Types & casting](#types--casting).

The standalone [`resolve`](#resolving-values-without-parsing) function runs the same middle stages without a projection: transformers apply at every nesting level and patterns resolve in every string, but nothing is picked or cast. Output that comes from a nested parser is already fully resolved and is not re-processed by the parent.

### Transformers vs patterns

[Transformers](#transformers) and [patterns](#patterns) are the two value-level extension points, and they never overlap:

**Transformers operate on values. Patterns operate on text inside values.**

|                | Transformers                               | Patterns                                                                                          |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Detects        | the shape/type of a whole property value   | a regex match inside a string                                                                     |
| Granularity    | one value in, one value out                | many matches per string, each resolved independently                                              |
| Typical `when` | `typeof data === 'object' && 'en' in data` | `/\{\{([^}]+)\}\}/g`                                                                              |
| Output         | replaces the entire value                  | spliced back into the surrounding text (or replaces the value if the string was _only_ the match) |
| Runs           | once per projected key                     | on every string the parser touches, at any depth                                                  |

The one-line rule: **if you're reacting to what the value _is_, use a transformer; if you're reacting to something written _inside_ the value, use a pattern.**

- CMS returns `{ en: 'Hello', fi: 'Hei' }` and you want the current locale → **transformer**. You're keying off the value's shape.
- Editor typed `Copyright {{currentYear}}` → **pattern**. It's text inside a string, and there could be five of them.
- Editor typed `{{snippets/sale-banner}}` and you want to fetch on demand → **pattern**.
- You want every `Date` string coerced to a `Date` object → **transformer**.
- You want `$products.count` anywhere in any string to become a live DB count → **pattern**.
- You want to strip HTML from every string value → **transformer** (you're rewriting the whole value, not a token in it).

**Ordering guarantee:** patterns resolve **after** transformers. A transformer's output is still scanned for patterns, so "rewrite my legacy `[[token]]` syntax into `{{token}}`" is a legitimate one-line transformer. The reverse is not true: pattern output is re-scanned by patterns, not by transformers.

Remember that for the common case you rarely define either: the built-in variables pattern with its [expressions](#expressions--pipes) covers everyday templating out of the box.

## Advanced Usage

### Custom types & casting options

Create your own types with `defineType`: a casting function `(value, context) => output` (sync or async) that returns the cast value or throws when the input is invalid. The result is a type token used **directly** in projections; one-off types are perfectly fine, and registration is only needed to use a type as a [pipe](#types-as-pipes):

```ts
// my-types.ts, a standalone types file, no parser needed
import { array, number, defineType } from '@bou-co/parsing/types';

export const dmy = defineType(async (value, context) => {
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (isNaN(date.getTime())) throw new Error('Invalid date (not a valid date format)');
  return { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() };
});

// reusable combinations are just values too
export const numbers = array.of(number); // → number[]
```

```ts
import { createParser } from '../path-to/parser-config';
import { dmy, numbers } from '../path-to/my-types';

const myParser = createParser({
  date: dmy, // → { day: number; month: number; year: number }
  scores: numbers, // → number[]
});
```

The `@bou-co/parsing/types` entry point exports every built-in token and class individually plus `defineType`, is tree-shakeable (named imports keep only the types you use), and never pulls in the parser engine, so shared type files stay lightweight and work with any parser configuration.

#### Extending types

A type can be **built from another type**, inheriting its casting behaviour and its whole accessor surface. This is the load-bearing case behind `types.text`, which is not a sibling of `string` but `string` plus CMS tidying, and it is how your own types get the full chain for free. Two styles produce exactly the same kind of object; pick whichever reads naturally to you.

The functional style: `defineType` with `extends`. The parent's cast runs first, `fn` refines its output (so `value` is already a `string` below), `accessors` add property accessors and `methods` add parameterised ones:

```ts
import { defineType, types } from '@bou-co/parsing/types';

export const productCode = defineType({
  name: 'productCode',
  extends: types.string,
  fn: (value) => {
    if (!/^P\d{4}$/.test(value)) throw new Error('Invalid product code');
    return value;
  },
  accessors: { number: (code) => Number(code.slice(1)) }, // types.productCode.number → number
  methods: { prefixed: (prefix: string) => (code) => `${prefix}${code}` }, // types.productCode.prefixed('#')
});

productCode.upperCase; // inherited from string
productCode.default('P0000').number; // own accessors survive default/strict/loose
```

The class style, for the same result, with `super.cast` giving you the parent's coercion (a cast may return `undefined` to say "treat as missing"). `defineType(Class)` is the factory that turns the class into a token — the same call the built-ins use — and takes the options object too:

```ts
import { StringType, type ParserContext } from '@bou-co/parsing/types';

export class SkuType extends StringType {
  override async cast(value: unknown, context?: ParserContext) {
    const text = await super.cast(value, context);
    if (text === undefined) return undefined;
    if (!/^[A-Z]+-\d+$/i.test(text)) throw new Error('Invalid SKU');
    return text.toUpperCase();
  }
  get vendor() {
    return this.derive('vendor', (sku) => sku.split('-')[0]); // memoised, hashed by name + implementation
  }
}

export const sku = defineType(SkuType);
export const requiredSku = defineType(SkuType, { required: true });
```

Inline, inside a projection, the universal chain covers the small cases: `.extend(fn)` keeps the family (a transform: `types.text.extend((v) => v.replace(/\s+/g, ' '))` is still a `text`), `.to(fn)` derives a new output (`types.slug.to((v) => v.length)` is a `number`), and `.to(token)` composes two casts while keeping the target's family (`types.json.to(types.array.of(types.number)).unique`). Every token also has `.cast(value)` for standalone use, which throws on failure.

Types hash into cache keys by their implementation (accessor names, parameters and function sources included), so caching stays correct when a type changes. When a **factory** creates several types from one function (closures are invisible to hashing), give each a `name` to keep their cache identities apart; the name also shows up in `ParserCastError`.

#### Registering types

Registering a type puts it on the `types` namespace **and** makes it available as a pipe under the same name. Registration follows the three context levels; at the global (object form) level it also extends the returned namespace, with full typing:

```ts
import { initializeParser } from '@bou-co/parsing';
import { formatTypes } from '@bou-co/parsing/types/format';
import { productCode } from './my-types';

export const { createParser, types } = initializeParser({
  types: {
    ...formatTypes, // an opt-in subset
    productCode, // types.productCode, and '{{ code | productCode }}'
    date: { relative: (value: Date) => timeAgo(value) }, // an accessor map extends the built-in date: types.date.relative
  },
});
```

Namespace registration deep-merges: an accessor map under an existing family's name adds accessors (annotate the value parameter, `(value: Date)`, for a typed accessor), a token or factory under a new name adds a type, and a token under a built-in's name replaces it with a warning. Schema-level (`createParser(projection, { types })`) and instance-level (`parser(data, { types })`) registrations reach the pipe layer as well. A function-form global context can register types too, but they are pipe-visible only, since the returned namespace has to exist synchronously.

#### Loose casting

By default a failed cast throws a `ParserCastError` (with the failing key path, target type, and received value). Set `looseCasting: true` to switch to the other flow — log a warning and drop the value, so the key is omitted or the token's `.default()` fills it — globally, or per parser / per call, since it is a regular context option:

```ts
export const { createParser, types } = initializeParser({
  looseCasting: true, // default false: throw — true: log a warning and drop the value
});
```

There is no mode that passes an uncast original value through, so the declared output types are true in every configuration (the fields are optional in the inferred type anyway).

To observe cast failures (e.g. for telemetry) instead of relying on the console warning, register an `onCastError` callback. It receives the `ParserCastError` (with `path`, `key`, `type`, `received` and `cause`) before the failure policy is applied, and replaces the default warning when set. Like `looseCasting`, it can be set globally, per parser, or per call.

```ts
export const { createParser, types } = initializeParser({
  looseCasting: true,
  onCastError: (error) => telemetry.report('parser-cast-error', { path: error.path, type: error.type }),
});
```

#### Strict and loose types

A token can pin its own failure flow regardless of `looseCasting`. `.strict` always throws, for values where silently dropping bad data is never acceptable; `.loose` never throws (the value becomes `undefined`, then the default, silently — `onCastError` still fires), for fields that are nice to have:

```ts
createParser({
  brandColor: types.color.strict, // throws on bad input even under looseCasting: true
  avatar: types.url.loose, // omitted on bad input even under the default policy
  score: types.number.loose.default(0),
});
```

The object form of `defineType` accepts `strict: true` for the same effect.

#### Opt-in type subsets

The opinionated and the heavy types live behind their own import paths, so the default surface stays scannable and nothing unused reaches a bundle. The presentation helpers exist only because templates have no other escape hatch (`{{ price | currency:"EUR" }}`); this is not a formatting library, and none of the subsets adds a required dependency. Each subset is a plain object that spreads into a registration, and every type in it works as a pipe once registered (except token-parameter factories such as `schema(validator)`, which have no template form):

| Import                          | Contents                                                                                                                                                                        | Why opt-in                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bou-co/parsing/types/format`  | `formatDate(format?, timezone?, locale?)`, `currency(code?, locale?, options?)`, `percent(digits?, locale?)`, `time`, `duration` (+ `.iso`), `money` (+ `.amount`, `.currency`) | presentation: the formatters take a pattern and produce locale output; `time` normalising to 24h, `duration`'s output shape and `money`'s `{ amount, currency }` are opinions           |
| `@bou-co/parsing/types/data`    | `record.of(value)`, `schema(validator)`, `coords` (+ `.lat`, `.lng`), `locale` (+ `.language`, `.region`)                                                                       | `record` is an output shape rather than a use case; `schema` wraps an external validator; `coords` accepting `"60.16, 24.93"` and `locale`'s BCP-47 region/script handling are opinions |
| `@bou-co/parsing/types/content` | `html(adapter, options?)`, `markdown(parser, sanitiser, options?)` with `.plain`, and the adapters — the only path that touches peer dependencies                               | peer dependencies, and a security policy you have to choose                                                                                                                             |
| `@bou-co/parsing/types/all`     | `format` + `data` (never the content types)                                                                                                                                     | —                                                                                                                                                                                       |

Single types import directly too (`@bou-co/parsing/types/format/currency`).

`schema(validator)` accepts anything implementing [Standard Schema](https://standardschema.dev) — Zod 4, Valibot, ArkType — and infers its output type. The answer to "can I do complex validation" is "bring your schema", never a refinement API of our own:

```ts
import { z } from 'zod';
import { schema } from '@bou-co/parsing/types/data';

const parser = createParser({
  settings: schema(z.object({ theme: z.enum(['light', 'dark']) })), // → { theme: 'light' | 'dark' }
});
```

#### `formatDate`

`formatDate(format = 'mediumDate', timezone?, locale?)` formats a `date` with Angular `DatePipe` pattern syntax on top of `Intl.DateTimeFormat`, so every locale the runtime knows works with no locale data shipped and no import step — Angular itself ships `en-US` only and needs extra data for anything else. The locale defaults to the context's `currentLocale`/`defaultLocale` (the [localize](#global-localization-via-transformers) fields), then `en-US`; the other presentation types (`currency`, `percent`) follow the same rule.

Presets map onto `Intl`'s `dateStyle`/`timeStyle`, which is simpler and more locale-correct than reproducing Angular's `en-US`-derived patterns:

| Preset                                                          | Maps to                                 |
| --------------------------------------------------------------- | --------------------------------------- |
| `short`, `medium`, `long`, `full`                               | `dateStyle` + `timeStyle` at that level |
| `shortDate`, `mediumDate` (the default), `longDate`, `fullDate` | `dateStyle` only                        |
| `shortTime`, `mediumTime`, `longTime`, `fullTime`               | `timeStyle` only                        |

Tokens follow Angular's table; a pattern that works in an Angular template produces the same output here, in any locale:

| Field                            | Tokens                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Era                              | `G`…`GGGGG`                                                                                                   |
| Year                             | `y`, `yy`, `yyyy` (longer forms pad)                                                                          |
| ISO week-numbering year          | `Y`, `YY`, `YYYY`                                                                                             |
| Month                            | `M`, `MM` (numeric) · `MMM`, `MMMM`, `MMMMM` (the name as it appears inside a date)                           |
| Month, standalone                | `L`, `LL` · `LLL`, `LLLL`, `LLLLL` (the name on its own)                                                      |
| Day of month                     | `d`, `dd`                                                                                                     |
| Weekday                          | `E`…`EEEEEE` (`EEEEEE` is the two-letter short form)                                                          |
| Weekday, standalone              | `c`…`cccccc`                                                                                                  |
| Period                           | `a`…`aaaaa` (`aaaaa` is narrow, lower-case)                                                                   |
| Hour                             | `h`, `hh` (1–12) · `H`, `HH` (0–23)                                                                           |
| Minute · second                  | `m`, `mm` · `s`, `ss`                                                                                         |
| Fractional seconds               | `S`, `SS`, `SSS`                                                                                              |
| ISO week of year · week of month | `w`, `ww` · `W`                                                                                               |
| Zone                             | `z`…`zzzz` (name) · `Z`…`ZZZ` `+0200`, `ZZZZ` `GMT+02:00`, `ZZZZZ` `+02:00` · `O` `GMT+2`, `OOOO` `GMT+02:00` |

- **Standalone versus format forms** (`L`/`c` versus `M`/`E`) genuinely differ in many locales, Finnish among them: `LLLL` gives `tammikuu`, `MMMM` inside a date gives `tammikuuta`. Invisible in `en-US`, obvious to a Finnish reader.
- **Literal segments in single quotes** pass through untouched (`"MMM d, y 'at' h:mm a"`; `''` inside them is a single quote). In a template the parameter is double-quoted, so the two quoting systems nest: `{{ event.date | formatDate:"MMM d 'at' HH:mm" }}`.
- **Unknown letters are emitted literally**, so `yyyy-MM-ddTHH:mm` needs no escaping of the `T`.
- **Not supported, as parity:** the extended day periods `B`/`b` ("in the morning"). They need CLDR extra data that a default Angular install lacks as well, so an Angular pattern never relied on them.
- **Timezones:** IANA names (`Europe/Helsinki`) are the recommendation — they handle daylight saving correctly. Angular's numeric offsets (`+0430`) are accepted as a fixed shift so a pattern ported verbatim keeps working.

#### Why a type is (or isn't) built in

Any proposal for a new built-in answers five questions:

1. **Is it a common field in web and headless-content work**, independent of any one project's data model, auth system or backend? This admits `mimeType` — an IANA media type is a public format anyone can look up — and rejects `uuid`, a convention of someone's database.
2. **Is there exactly one correct behaviour** — no configuration, no locale knowledge, no jurisdiction knowledge?
3. **Does it do more than match?** Normalise, parse or decompose. A type whose whole implementation is a regex is `types.pattern`.
4. **Does the output survive `JSON.stringify`?**
5. **Is it dependency-free?**

All five → built in. Common but failing 2, 3 or 5 → an [opt-in subset](#opt-in-type-subsets). Failing 1 → not shipped: write it with `types.pattern`, `defineType` or `schema`. A subset type is promoted when it proves both common and light; promotion is a minor release with no migration (the import simply becomes unnecessary), demotion is breaking, so a borderline type starts in a subset.

What that rules out, and what to use instead:

| Not shipped                                | Why                                                                                                                                                 | Use instead                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `uuid`                                     | only matches a pattern, and the pattern is a convention of your data model                                                                          | `types.pattern(/^[0-9a-f-]{36}$/i)`               |
| `postalCode`, per-country phone validation | jurisdiction-specific knowledge we cannot ship                                                                                                      | `types.pattern`; `types.tel` for the shape        |
| `iban`, `vat`, `creditCard`                | business-domain checksum algorithms, and in the card case a compliance surface                                                                      | `schema(validator)` with a specialist library     |
| `password`, `username`                     | boundary validation, not content                                                                                                                    | `schema(validator)`                               |
| Vendor IDs (YouTube, social handles)       | someone else's format, changing without us                                                                                                          | `types.pattern`                                   |
| `image`                                    | framework-specific                                                                                                                                  | a `defineType` in your project                    |
| `set`, `map`                               | deferred: real `Set`/`Map` outputs do not survive `JSON.stringify`, a poor default across a server/client boundary; `unique` covers the common case | `types.unique(item)`, or `.to((v) => new Set(v))` |
| `css`                                      | not shipped — see [Content types & security](#content-types--security)                                                                              | inline-style allow-listing in `sanitize-html`     |

#### Content types & security

`html` and `markdown` do not implement sanitisation: they adapt to an established sanitiser, and the choice is yours. Two adapters ship, the peer packages are optional (installing `@bou-co/parsing` never installs them), and a missing one produces an error naming the package to install:

```ts
import { html, markdown, markedAdapter, sanitizeHtmlAdapter, ultrahtmlAdapter } from '@bou-co/parsing/types/content';

export const { createParser, types } = initializeParser({
  types: {
    html: html(sanitizeHtmlAdapter()), // options pass straight through: sanitizeHtmlAdapter({ allowedTags: [...] })
    markdown: markdown(markedAdapter(), sanitizeHtmlAdapter()),
  },
});

createParser({
  body: types.html, // safe HTML string
  teaser: types.html.plain.truncate(160), // stripped to text
  notes: types.markdown, // rendered and sanitised
});
```

- **`sanitizeHtmlAdapter`** (`sanitize-html`) is the recommended default: the most configurable (`transformTags`, `exclusiveFilter`, allow-listed inline `style` properties) and, decisively for a security control, actively maintained. Around 60 KB gzipped, server-oriented.
- **`ultrahtmlAdapter`** (`ultrahtml`) is the light option for edge runtimes, workers and the browser at under 2 KB. Its sanitizer follows the HTML Sanitizer API's element model, so the adapter adds the attribute policy: event handlers and `javascript:`/`data:` URLs are always dropped, plus a conservative element drop-list unless you pass `allowElements`. Its release cadence is the concern; the adapter shape is the contingency, and the browser-native Sanitizer API becomes a zero-dependency adapter once it is broadly available.
- `isomorphic-dompurify` is deliberately not offered: it needs jsdom on the server and accumulates DOM state in long-running processes. A user-written adapter is a few lines if you already sanitise with DOMPurify in the browser.
- **`markedAdapter`** (`marked`) is the documented Markdown parser: the smallest of the mainstream options by a wide margin, the fastest, pure JavaScript, and the most edge-compatible. `micromark` is the alternative where strict CommonMark compliance matters more than size. The parser is an adapter for the same reason the sanitiser is — implement `MarkdownAdapter` to swap it.

`html(adapter, options?)` hands `options` straight to the adapter's library (`sanitize-html`'s options object, `ultrahtml`'s sanitizer options — nothing is re-modelled); `markdown(parser, sanitiser, options?)` takes them as `{ parser, sanitiser }` groups. The path also exports `toPlainText` (what `.plain` uses), `DEFAULT_DROP_ELEMENTS` (the `ultrahtml` adapter's drop-list), `createLoader` (lazy peer loading with an actionable error), and the `SanitiserAdapter`/`MarkdownAdapter` interfaces for adapters of your own. The `ultrahtml` adapter targets the main `ultrahtml` package, not a fork.

Zero-config behaviour is the safe one for both adapters, and **Markdown output always passes through the sanitiser** — Markdown permits raw HTML, so rendering without sanitising is an XSS hole. Guidance, not enforcement: rich text from your own CMS editors is semi-trusted and the light adapter is a reasonable choice; genuinely user-generated content (comments, profiles) warrants the hardened one. A `css` type is not shipped: CSS sanitisation is its own specialist discipline, and inline-style allow-listing in `sanitize-html` covers the realistic CMS need.

### Multiple parser configurations

Each `initializeParser` call creates a fully isolated parser engine: its own variables, casting options (`looseCasting`/`onCastError`), transformers, lifecycle hooks, and caches/storage. This makes it possible to run separate configurations in one app, for example a strict server setup with Redis-backed caching next to a lenient client setup:

```ts
// server-config.ts
export const { createParser, types } = initializeParser({
  storage: redisStorage,
  cache: { enabled: true },
});
```

```ts
// client-config.ts
export const { createParser, types } = initializeParser({
  looseCasting: true, // render what we can, drop what we can't
});
```

Parsers stay permanently bound to the engine that created them. Nesting a parser from one configuration inside another keeps its own transformers, whole-parse cache storage, and variable cache for the nested parse, while parent context values still merge down (on collisions the parent's values win). Since type tokens carry their casting implementation, projections and type files are freely shareable across configurations.

### Merging data

Use `@combine` to fetch or compute large external datasets and merge them directly into the current parser projection.

```ts
import { createParser, types } from '../path-to/parser-config';

const rawDataFromApi = { _id: '123', title: 'Test' };

const additionalDataParser = createParser({
  readCount: types.number,
});

const myParser = createParser({
  title: types.string,
  '@combine': async (context) => {
    // Imagine an API call here based on context.data._id
    const externalData = { readCount: 42 };
    return await additionalDataParser(externalData);
  },
});

const result = await myParser(rawDataFromApi);

/* Result:
{
  "title": "Test",
  "readCount": 42
}
*/
```

> Tip: when the data you want to merge already lives under a key and has its own parser, use [`.flat`](#flattening-nested-parsers-with-flat) instead of a `@combine` resolver: same merge behavior, composed declaratively.

### Variables

Variables provide template logic for string values coming from raw data. They are the everyday tool for dynamic content, and for most projects all you ever need. They allow content editors (e.g., in a CMS) to use dynamic data without requiring coders to build an entire EJS or templating engine.

Variables support:

- **Functions:** Resolve dynamic data (e.g., `currentYear: () => new Date().getFullYear()`).
- **Async Execution:** Fetch variable values from a DB or CMS dynamically.
- **Deep object resolution:** Access nested properties using dot notation (e.g., `{{user.address.city}}`).
- **Fallbacks & literals:** Chain checks like `{{user.name || "Guest"}}`. See [Expressions & pipes](#expressions--pipes).
- **Pipes:** Transform output inline like `{{title | uppercase}}`. See [Expressions & pipes](#expressions--pipes).

Under the hood, variables are the built-in [pattern](#patterns). That only matters once you want to re-delimit them, disable them, or register your own syntaxes alongside them, which is the expert tier of the same machinery.

```ts
// 1. Global Setup (in parser-config.ts)
import { initializeParser } from '@bou-co/parsing';

export const { createParser, types } = initializeParser(() => ({
  variables: {
    currentYear: () => new Date().getFullYear(),
  },
}));

// 2. Usage
import { createParser, types } from '../path-to/parser-config';

// Imagine this string comes directly from database or CMS
const rawDataFromApi = {
  title: 'Copyright {{currentYear}}',
  user: 'Hello {{user.firstName}}!',
};

const myParser = createParser({
  title: types.string,
  user: types.string,
});

// Provide instance variables overriding or supplementing global ones
const instanceData = {
  variables: {
    user: { firstName: 'John' },
  },
};

const result = await myParser(rawDataFromApi, instanceData);

/* Result:
{
  "title": "Copyright 2026",
  "user": "Hello John!"
}
*/
```

#### Built-in context variables

A few variable heads are always available without any configuration:

- **`{{data.*}}`** — the input data of the current nesting level (e.g. `{{data.uid}}`). Inside a nested projection it refers to that level's data, not the root.
- **`{{ctx.*}}` / `{{context.*}}`** — the full [parser context](#context-object-parsercontext) of the spot being resolved. Anything on the context is reachable: `{{ctx.data.uid}}`, `{{ctx.key}}`, `{{ctx.currentLocale}}` (when using the localize template), or your own context augmentations. `{{data.*}}` is simply a shortcut for `{{ctx.data.*}}`.
- **`{{current.*}}`** — the root input of the current parse or resolve run (kept for continuity; prefer `{{data.*}}` / `{{ctx.*}}`).

```ts
const parser = createParser({
  greeting: types.string,
  user: { profileUrl: types.string },
});

await parser({
  name: 'John',
  greeting: 'Hello {{data.name}}!', // → 'Hello John!'
  user: { uid: '1234', profileUrl: '/profiles/{{data.uid}}' }, // → '/profiles/1234' — nested level data
});
```

Resolution order for a variable head is: explicit variables (global, schema, and instance) → built-in heads → [`variableResolver`](#dynamic-variable-resolvers). Explicit variables can therefore shadow the built-ins, and the built-in heads are terminal — `{{data.missing}}` never falls through to a `variableResolver`, so context lookups can't trigger external fetches. One caveat: `context.resolve(input)` rebinds the context's `data`/`value` (and `current`) to the input being resolved, so built-ins inside such strings refer to that input rather than the surrounding parse data.

#### Dynamic Variable Resolvers

Instead of defining every possible variable upfront, `variableResolver` allows you to dynamically intercept and resolve variables by their exact name when they are encountered. This is useful for catching wildcards, fetching data on-demand from a database, or handling dynamic keys.

```ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser, types } = initializeParser(() => ({
  variableResolver: async (variableName, context, cache) => {
    // Dynamically catch variables named 'userName'
    if (variableName === 'userName') {
      const { userId } = context.data;

      // Simulated DB fetch (e.g., await db.getUser(userId))
      const userName = await Promise.resolve('Alice');
      return userName;
    }

    // Return undefined to let standard fallbacks or other variables take over
    return undefined;
  },
}));

const dynamicParser = createParser({ message: types.string });

const result = await dynamicParser({ message: 'Welcome back, {{userName}}!', userId: 123 });

/* Result:
{
  "message": "Welcome back, Alice!"
}
*/
```

The resolver is called with the **head segment only** (`{{user.name}}` calls it with `'user'`; the engine walks the rest of the path afterwards). The third argument `cache(value)` opts the returned value into an **engine-lifetime** store keyed by the head: later parses get the cached value without calling the resolver again, and it shadows same-named variables from then on. Because that store lives for the life of the engine — across requests — don't `cache()` user- or request-scoped values; use a [pattern](#patterns) with `cache: 'run'` or `'storage'` for those.

### Expressions & pipes

Everything between the delimiters of a variable (`{{ here }}`) is an **expression**, and the same grammar is shared by any custom [pattern](#patterns) that declares its own delimiters. Expressions stay deliberately small: fallback chains, literals, and pipes. No loops, no conditionals, no arbitrary code.

#### Fallbacks & literals

Chain candidates with `||`; they evaluate left to right and the first **defined** value wins. Only `undefined` falls through: `false`, `0`, `''` and `null` are valid results and stop the chain.

Literals can appear as candidates or as pipe parameters:

- **Strings** in double quotes: `"Guest"`, `""`, `"say \"hi\""`. Quoted text may contain `|`, `:` and single quotes (`"MMM d 'at' HH:mm"`), which is what date patterns need.
- **Numbers**: `42`, `-1.5`
- **Booleans**: `true` / `false`
- **`null`** and **`undefined`**

```ts
const rawDataFromCMS = {
  greeting: 'Hello {{user.name || "Guest"}}!',
  discount: '{{campaign.discount || 0}}% off',
  banner: '{{flags.showBanner || false}}',
};
```

A whole-string expression returns its value raw, so `'{{ missing || null }}'` in a projected key resolves to `null` — which the projection treats as missing (the key is dropped, or the token default applies).

#### Pipes

A pipe transforms the resolved value inline: `{{value | pipe}}`, or with parameters, `{{value | pipe:param1:param2}}`. Pipes chain left to right (`{{ price | round:2 | currency:"EUR" }}`), a literal candidate can be piped, and parameters may be literals or variable names (resolved from `variables`).

Pipe functions are plain value functions registered under the `pipes` config, at the global, schema, or instance level, exactly like variables, with the more specific level winning on a name collision. Each pipe is called with the parser context, where `data` (and `value`) is the resolved value being piped and `params` holds the parsed parameters:

```ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser, types } = initializeParser({
  variables: {
    user: { firstName: 'john' },
  },
  pipes: {
    displayName: async ({ data }) => (await fetchProfile(String(data))).displayName,
  },
});

const parser = createParser({ user: types.string, teaser: types.string });

const result = await parser({
  user: 'Hello {{user.firstName || "Guest" | upperCase}}!',
  teaser: '{{article.teaser | truncate:120}}',
});

/* result.user === 'Hello JOHN!' */
```

When a value resolves to `undefined`, its pipes are skipped and the fallback chain moves on; set `pipeUndefined: true` in the context to run pipes on `undefined` values anyway. When a pipe chain _yields_ `undefined`, the chain moves on as well.

Casting types are the shallow end of this: simple, usually pure, no configuration, and available in every template without writing a pipe (next section). Pipes are the deep end, where the work gets advanced — resolving a display name from a UID, reaching into per-request context, coordinating a fetch. That is a difference of convention and complexity, not capability: types receive the context and may be async too. The one hard difference is inference — if a value needs to be typed in the projection output, it has to be a type.

A pipe name is looked up in `pipes` first, then among the registered types (next section), so a same-named type silently wins over a function you left in `variables`; a function in `variables` that no type shadows throws a targeted error (a transitional v2 migration catch).

#### Types as pipes

Every casting type is automatically a pipe under the same name, with the same parameters. The projection form and the template form are two syntaxes over one implementation, and a name learned in one works in the other unchanged:

```ts
createParser({
  publishedAt: types.date.iso, // projection
  meta: types.string,
});
// '{{ event.date | date.iso }}'   ← template, same behaviour, same name
```

- **Qualified names** are always available: `date.iso`, `number.round:2`, `url.base:"https://site.com"`, `email.domain`, `email.loose`. Parameters attach to the last member.
- **Root names** exist for every accessor whose name is unique across families: `upperCase`, `round:2`, `unique`, `join:", "`, `iso`, `domain`. The root form carries its base type's cast — `{{ someNumber | upperCase }}` casts to string first, then upper-cases, which is what a template author expects. A name declared by two families has no root form and needs the qualified one — `length` (`string`/`array`), `normalized` and `href` (`email`/`tel`), `of` (`array`/`json`); a registered type that introduces such a collision logs a warning. Explicit `pipes` always win over type names.
- **Parameterised types** take their parameters as pipe parameters: `{{ status | oneOf:"draft":"published" }}`, `{{ code | pattern:"^P\\d{4}$" }}`. Types whose parameters are tokens (`unique(item)`, `array.of`, `schema`) cannot be called from a template; `{{ tags | unique }}` resolves to the `array.unique` accessor instead.
- **Registered types** are pipes at whichever level they were registered — global, schema, or instance.

Because a type can fail, a template expression can now **validate**:

```ts
'{{ profile.contact | email || "hello@example.com" }}';
```

The failure policy is the same as at the cast site — throw by default, undefined under `looseCasting: true`, `.strict`/`.loose` pinned per token — with one deliberate addition: a written `||` fallback is the author's stated policy for that expression, so a failed cast yields `undefined` and the chain continues, even under the throwing policy. `{{ contact | email }}` alone still throws by default; `{{ contact | email || undefined }}` or `{{ contact | email.loose }}` say "undefined is fine" without a replacement. `onCastError` observes every failure either way.

#### Escaping

To output pattern syntax literally, prefix the match with a backslash: `\{{name}}` renders as `{{name}}` (the backslash is consumed, and `\\` directly before a match produces a literal backslash). This works uniformly across all patterns.

### Resolving values without parsing

The `resolve` function returned by `initializeParser` runs the engine's value resolution ([variable](#variables) interpolation and global [transformers](#transformers)) directly on hard-coded input, without a projection, casting, or hooks. This is useful for state management and other situations where the data is already in its final shape.

`resolve` walks the input recursively: transformers apply at every nesting level, functions are invoked with the parser context and their results resolved further, `{{variable}}` strings (and any registered [patterns](#patterns)) are interpolated, and other values pass through unchanged (branded type tokens and parsers included). Both objects and plain strings are accepted, and an optional instance context can supply call-specific variables (or e.g. `currentLocale` for a localize transformer).

```ts
import { resolve } from '../path-to/parser-config';

const data = await resolve({
  message: 'Hello {{name}}!',
  time: '{{currentTime}}',
});
// → { message: 'Hello John!', time: '2024-06-01T12:00:00Z' }

// Instance variables work like in parsers
const order = await resolve({ message: 'Your order {{orderId}} has been shipped.' }, { variables: { orderId: '12345' } });
// → { message: 'Your order 12345 has been shipped.' }

// Plain strings resolve directly
const message = await resolve('Hello {{name}}!');
// → 'Hello John!'

// Global transformers (e.g. localize) apply at every nesting level
const localized = await resolve<{ message: string }>({
  message: { en: 'Hello {{name}}!', fi: 'Hei {{name}}!' },
});
// → { message: 'Hello John!' }, or { message: 'Hei John!' } when the current locale is Finnish
```

The return type is inferred from the input (strings stay strings, objects and arrays recurse, functions map to their resolved return value). When a transformer reshapes a value (like localize collapsing a locale object into a string), pass an explicit generic (`resolve<{ message: string }>(...)`) to assert the output type.

#### Function values & the contextual `resolve`

Functions in the input are invoked with a `ParserContext` (like value functions in projections) and their results are resolved recursively: returned strings, objects, promises, and further functions all resolve fully. The context exposes its own `resolve`, which works exactly like the global one but **inherits the active context** (merged variables, transformers, locale, and so on), with optional per-call overrides merged on top. The globally exported `resolve` never inherits ambient context, so use `context.resolve` whenever inherited variables matter.

This also makes it possible to resolve strings whose variables are (async) functions:

```ts
export const { resolve } = initializeParser({
  variables: {
    random: async () => Math.random(),
  },
});

const data = await resolve(
  {
    randomValue: async ({ resolve }) => {
      return await resolve('{{random}}-{{uid}}');
    },
  },
  {
    variables: { uid: async () => '123' },
  },
);
// → { randomValue: '0.123456789-123' }
```

`context.resolve` is also available in regular parser value functions:

```ts
import { createParser, types } from '../path-to/parser-config';

const parser = createParser(
  {
    name: types.string,
    metadata: async ({ resolve }) => {
      const uid = await resolve('id-{{userId}}');
      return { uid };
    },
  },
  { variables: { userId: '123' } },
);
// metadata → { uid: 'id-123' }
```

In value functions, `resolve` can also be called with **no arguments** to resolve the current `context.value`, the raw incoming data at the function's own key. Nothing resolves until you call it (variables backed by a `variableResolver` stay untouched), and the result is memoized per context so calling it twice resolves once. Pass an explicit generic (`resolve<number>()`) to type the result; an explicit generic also overrides the inferred typing on the one-argument form.

```ts
const parser = createParser({
  price: ({ value }) => value * 5, // raw data value, e.g. must be a plain number
  total: async ({ resolve }) => (await resolve<number>()) * 5, // resolves "{{basePrice}}" etc. first
});
```

One caveat inside `resolve()` inputs (not projections): a zero-arg `resolve()` call within a resolve-mode function value re-resolves the input containing that very function, so it recurses. Parse-mode value functions are immune, since their `value` is raw data and never the function itself.

### Dynamic projections

Pass a function instead of a static object to return a different projection structure based on the input data dynamically.

```ts
import { createParser, types } from '../path-to/parser-config';

const dynamicParser = createParser(({ data }) => {
  if (data.type === 'detailed') {
    return { value: types.number, metadata: types.string };
  }
  return { value: types.number };
});

const result = await dynamicParser({ type: 'detailed', value: 10, metadata: 'extra info' });

/* Result:
{
  "value": 10,
  "metadata": "extra info"
}
*/
```

### Extending parsers

Merge a new projection onto an existing parser safely without mutating the original definition.

```ts
import { createParser, types } from '../path-to/parser-config';

const original = createParser({ value: types.number });
const extended = original.extend({ additional: types.string });

const result = await extended({ value: 456, additional: 'test' });

/* Result:
{
  "value": 456,
  "additional": "test"
}
*/
```

### Context overriding

Inject new context properties (like variables) into a pre-existing parser by calling `.withContext()`.

```ts
import { createParser, types } from '../path-to/parser-config';

const parser = createParser({ value: types.string }, { variables: { first: 1 } });
const overriddenParser = parser.withContext({ variables: { second: 2 } });

// overriddenParser now has both { first: 1, second: 2 } available in variables context.
```

### Lifecycle hooks

Register `before` and `after` hooks. `before` hooks inject shared context values prior to parsing, which trickle down to nested/extended parsers.

```ts
import { createParser, types } from '../path-to/parser-config';

const productParser = createParser(
  {
    finalPrice: ({ data, basePrice }) => data.price + basePrice,
  },
  {
    before: (context) => {
      context.basePrice = 10;
      return context;
    },
  },
);

const result = await productParser({ price: 25 });

/* Result:
{
  "finalPrice": 35
}
*/
```

Hooks are per-level: global, schema, and instance hooks each run (in that order), once per nesting level — global and per-call hooks fire at every nested parser, schema (`createParser`) hooks only for that parser's own levels (not inside inline object projections), and at arrays hooks run per item. An `after` hook receives the context with the parsed result as `context.data` and must return a **context-shaped** object — `after: (ctx) => ({ ...ctx, data: { ...ctx.data, stamped: true } })`; returning the data itself is silently ignored. Within a level, `.extend()` and `.withContext()` **compose** hooks instead of replacing them — the base parser's hook runs first, then the extension's, which sees (and may override) the base hook's context changes:

```ts
const extendedParser = productParser.extend(
  { discounted: ({ data, basePrice, discount }) => data.price + basePrice - discount },
  {
    before: (context) => {
      context.discount = context.basePrice / 2; // Runs after the base hook; basePrice is already set
      return context;
    },
  },
);
```

### Transformers

Transformers run conditionally globally against properties. Helpful for automatic data morphing based on context. They are the mid-tier extension point: they reshape whole values, while [patterns](#patterns) rewrite text inside them. For the ordering guarantee and how to choose between the two, see [Transformers vs patterns](#transformers-vs-patterns).

```ts
// 1. Setup in parser-config.ts
import { initializeParser } from '@bou-co/parsing';

const localize = {
  // If the object looks like a translation map (e.g. { en: 'Hello', fi: 'Hei' })
  when: ({ data, locales = ['en', 'fi'] }) => typeof data === 'object' && Object.keys(data).every((k) => locales.includes(k)),
  // Resolve the string of the current locale
  then: ({ data, currentLocale = 'en' }) => data[currentLocale],
};

export const { createParser, types } = initializeParser({ transformers: { localize } });

// 2. Usage
import { createParser, types } from '../path-to/parser-config';

const myParser = createParser({ greeting: types.string });

const rawData = { greeting: { en: 'Hello', fi: 'Hei' } };
const result = await myParser(rawData);

/* Result: { "greeting": "Hello" } */
```

### Patterns

A **pattern** detects a substring inside string data and resolves it to something else. `{{variable}}` interpolation is simply the pattern that ships with the library. You can register your own syntaxes next to it, replace its delimiters, or disable it.

This is the expert tier: if you just want `{{name}}` templating, [Variables](#variables) already covers you. Use the pattern API when you need a new inline syntax (like `$products.count` hitting a database) or need to change how the built-in one behaves. For choosing between a pattern and a transformer, see [Transformers vs patterns](#transformers-vs-patterns).

There are two kinds of patterns, and the difference decides whether [expressions](#expressions--pipes) work:

- **Delimited patterns** declare `delimiters: [start, end]`. The engine builds the match regex from them, and the full expression grammar (`||` fallbacks, literals, pipes) works inside the delimiters automatically.
- **Token patterns** declare a raw `match` regex with no end marker (like `$products.count`). Each match resolves independently, and expressions are off: there is no boundary that could contain a fallback chain.

```ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser, types } = initializeParser({
  patterns: {
    // Delimited: expressions work, e.g. '<<snippets/sale || "50% off" | uppercase>>'
    snippet: {
      delimiters: ['<<', '>>'],
      resolve: async ({ path }) => await cms.getSnippet(path),
    },
    // Token: bare '$products.count' anywhere in text, no expressions
    db: {
      match: /\$([a-zA-Z0-9_.]+)/g,
      resolve: async ({ path }) => await db.get(path),
    },
  },

  // Pipes are shared by every pattern with expressions enabled
  pipes: {
    uppercase: ({ data }) => String(data).toUpperCase(),
    truncate: ({ data, params: [len = 50] = [] }) => String(data).slice(0, len),
  },

  // Unchanged: this is just the data the built-in variables pattern reads from
  variables: {
    currentYear: () => new Date().getFullYear(),
  },
});
```

The pattern interface:

```ts
interface ParserPattern {
  /** Start and end strings bounding a match, e.g. ['{{', '}}']. Required for expressions */
  delimiters?: [string, string];
  /** Match regex, built from delimiters when omitted. First capture group is the expression */
  match?: RegExp;
  /** Called once per unique match in a string, never per occurrence */
  resolve: (input: PatternResolveInput) => unknown | Promise<unknown>;
  /** The ||/literal/pipe grammar. Defaults to true for delimited patterns; unavailable without delimiters */
  expressions?: boolean;
  /** Re-scan resolved string output for patterns. Default: true */
  rescan?: boolean;
  /** 'run' (memoized per parse, default), 'none', or 'storage' (uses the configured storage) */
  cache?: 'run' | 'none' | 'storage';
}

interface PatternResolveInput {
  /** The expression after grammar parsing, e.g. "user.name" */
  path: string;
  /** The full matched text, e.g. '{{user.name || "Guest" | uppercase}}' */
  raw: string;
  /** Raw regex capture groups, for patterns without expressions */
  groups: RegExpExecArray;
  context: ParserContext;
}
```

**Expressions require delimiters.** The grammar only works when the engine can capture the _whole_ expression, and only a start + end pair bounds one reliably. An open-ended token like `$animals.cat` has no end marker, so a `||` after it is just surrounding text, never a fallback. Compare:

```
Input:     'Favorite: $animals.cat.title || animals.dog.title'
Token:     'Favorite: Cat || animals.dog.title'    // the $-token resolves; " || …" is literal text

Input:     'Favorite: <<animals.cat.title || animals.dog.title>>'
Delimited: 'Favorite: Cat'                         // the whole fallback chain is the expression
```

Because a half-working grammar would be worse than none, setting `expressions: true` on a token pattern **throws with guidance** instead of silently misbehaving (the pattern registry compiles lazily, so the error surfaces on the first parse). Delimited patterns can opt out with `expressions: false` (the raw captured text then arrives as `path`, untouched). Declaring both `delimiters` and a custom `match` is allowed for fine-tuning: your regex wins (first capture group is the expression) while the delimiters vouch that its capture is bounded. This is exactly how the built-in variables pattern is defined.

Beyond that, the engine owns everything that isn't the lookup itself: scanning, deduplication, splicing, parallel resolution, re-scanning, and cycle protection. Your `resolve` only turns a path into a value.

Rules worth knowing:

- **Full-string matches return the raw value.** When a string consists solely of one match, the resolved value is returned untouched: objects, numbers, and arrays survive, and an object result can feed a nested projection.
- **Precedence:** the leftmost match wins; at the same start position the longest wins, then registration order (the built-in `variables` pattern registers first). Overlapping later matches are skipped.
- **Escaping:** a backslash directly before a match suppresses it and is consumed: `\{{foo}}` outputs `{{foo}}`, and `\\{{foo}}` outputs a literal backslash followed by the resolved value. Uniform across all patterns.
- **Re-scanning & cycles:** resolved string output is scanned again by all patterns (opt out per pattern with `rescan: false`). Cycles — and rescan chains deeper than 10 levels — throw `ParserPatternCycleError` instead of hanging.
- **Caching:** user patterns default to `cache: 'run'` (memoized per parse, safe for per-request data). `'storage'` persists results through the configured [storage](#server-side-data-fetching--caching) under `pattern:<name>:<path>` keys. The built-in variables pattern uses `'none'` because variable lookups are context-sensitive.
- **Customizing variables:** existing keys merge partially, so `patterns: { variables: { delimiters: ['${', '}'] } }` re-delimits `{{ }}` to `${ }` while keeping lookups, fallbacks, pipes, and the spread intact (a custom `match` regex works too); `patterns: { variables: false }` disables interpolation entirely.
- **Caveat:** a string that looks like a stringified object (`{...}`) under a nested projection is parsed as an object before patterns are consulted.
- **Type inference is unaffected**: a pattern that resolves a `types.string` field into an object makes the inferred type inaccurate, exactly as transformers already can.

### Chaining parsers (Reparsing)

The data output by one parser can be safely passed into another parser for multi-pass executions.

```ts
import { createParser, types } from '../path-to/parser-config';

const stepOne = createParser({ value: types.number });
const stepTwo = createParser({ value: ({ data }) => data.value * 2 });

const initialData = await stepOne({ value: 123 });
const finalData = await stepTwo(initialData);

/* Result: { "value": 246 } */
```

In-process chaining is safe because parser output is a `Proxy` carrying a `_parsed` marker that tells the engine not to re-resolve an already-parsed object. The marker is not a real property: spreading or `JSON` round-tripping the output drops it (and `structuredClone` throws on the Proxy), so data that crossed such a boundary is treated as fresh input and resolved again.

---

## Examples & Use Cases

### Next.js App Router & Server Components

**Why:** Bou Parsing is natively asynchronous, making it an ideal companion for React Server Components in the Next.js App Router. Instead of manually typing incoming API props or component structures, the parser automatically infers the final shape of the data based on your schema.

_Note: You do not need the `useParserValue` hook on the server. Just `await` the parser function directly! For Client Components, refer to the [Client-Side React Integration](#client-side-react-integration) section._

#### Example 1: The "CMS-Driven" Approach (Dynamic Input)

In this approach, the component receives a loosely typed object (e.g., a dynamic block from a headless CMS) and the parser validates and shapes the data, outputting strictly typed `props` for the JSX. It's a best practice to co-locate the parser and the component.

```ts
// components/hero-block/parser.ts
import { createParser, types } from '../../path-to/parser-config';

export const heroBlockParser = createParser({
  title: types.string,
  description: types.string,
  imageUrl: ({ data }) => `https://example.com/images/${data.imageId}`,
});
```

```tsx
// components/hero-block/hero-block.tsx
import React from 'react';
import { heroBlockParser } from './parser';

export const HeroBlock = async (initialProps: object) => {
  const props = await heroBlockParser(initialProps);
  // `props` is automatically typed as: { title: string, description: string, imageUrl: string }

  return (
    <section>
      <h1>{props.title}</h1>
      <p>{props.description}</p>
      <img src={props.imageUrl} alt={props.title} />
    </section>
  );
};
```

```tsx
// app/[...slug]/page.tsx
import { HeroBlock } from '../../components/hero-block/hero-block';

// Map CMS block types to React Components
const ComponentMap: Record<string, any> = {
  hero: HeroBlock,
};

// Catch-all route to handle dynamic nested paths (e.g. /about/our-team)
export default async function Page({ params }: { params: { slug?: string[] } }) {
  // Resolve the path, defaulting to 'home' if at the root
  const path = params.slug ? params.slug.join('/') : 'home';

  // Fake data fetching based on the dynamic route path
  const res = await fetch(`https://api.example.com/pages/${path}`);
  const data = await res.json();

  return (
    <main>
      {/* Dynamically resolve and pass raw, loosely typed data to the components */}
      {data.blocks?.map((block: any, index: number) => {
        const Component = ComponentMap[block.type];

        // Skip unknown block types safely
        if (!Component) return null;

        // The component's inner parser will handle typing and validation natively
        return <Component key={index} {...block} />;
      })}
    </main>
  );
}
```

#### Example 2: The "Traditional Component" Approach (Strictly Typed Input)

When you need excellent developer experience for hardcoding components manually, you can strictly type the `initialProps`. The parser takes these strict props, validates them, and can execute side-effects like fetching additional data.

```ts
// components/user-card/parser.ts
import { createParser, types } from '../../path-to/parser-config';

// Define the strict input interface
export interface UserCardInitialProps {
  userId: string;
  theme?: 'light' | 'dark';
}

export const userCardParser = createParser({
  theme: ({ data }) => data.theme || 'light', // Fallback
  userProfile: async ({ data }) => {
    // Fetch user details dynamically based on the strict userId prop
    const res = await fetch(`https://api.example.com/users/${data.userId}`);
    return await res.json();
  },
});
```

```tsx
// components/user-card/user-card.tsx
import React from 'react';
import { userCardParser, UserCardInitialProps } from './parser';

export const UserCard = async (initialProps: UserCardInitialProps) => {
  // `props` infers both the fallback theme and the resolved userProfile
  const props = await userCardParser(initialProps);

  return (
    <div className={`theme-${props.theme}`}>
      <h2>{props.userProfile.name}</h2>
    </div>
  );
};
```

```tsx
// app/page.tsx
import { UserCard } from '../components/user-card/user-card';

export default function Page() {
  return (
    <main>
      <h1>Our Team</h1>
      {/* Strongly typed props with excellent DX */}
      <UserCard userId="u_123" theme="dark" />
      <UserCard userId="u_456" /> {/* theme defaults to 'light' */}
    </main>
  );
}
```

#### Example 3: The "Hybrid" Approach (Nested Parsers & Reusable Sub-components)

In complex pages, you often have a large block of data coming from a CMS containing nested structures (like an article with an author). You can nest parsers to validate the entire tree at once.

Then, you can use `ParserReturnValue` to extract the inferred TypeScript type from the child parser, allowing you to pass the pre-parsed, strictly-typed data into a static, "dumb" React component that doesn't need to run any parsing itself.

```ts
// components/author-badge/parser.ts
import { createParser, ParserReturnValue } from '../../path-to/parser-config';

// 1. Define the child parser in its own generic folder
export const authorBadgeParser = createParser({
  name: types.string,
  role: types.string,
});

// 2. Export its inferred type for use in static components
export type AuthorBadgeProps = ParserReturnValue<typeof authorBadgeParser>;
```

```tsx
// components/author-badge/author-badge.tsx
import React from 'react';
import type { AuthorBadgeProps } from './parser';

// This is a "dumb" static component. It expects strictly typed, pre-parsed data.
export const AuthorBadge = (props: AuthorBadgeProps) => {
  return (
    <div className="author-badge">
      <strong>{props.name}</strong>
      <span>{props.role}</span>
    </div>
  );
};
```

```ts
// components/article-block/parser.ts
import { createParser, types } from '../../path-to/parser-config';
import { authorBadgeParser } from '../author-badge/parser';

// 3. Nest the generic author parser inside the parent parser
export const articleBlockParser = createParser({
  title: types.string,
  content: types.string,
  author: authorBadgeParser, // Nests the parser directly
});
```

```tsx
// components/article-block/article-block.tsx
import React from 'react';
import { articleBlockParser } from './parser';
import { AuthorBadge } from '../author-badge/author-badge';

// This is the parent component handling the raw, dynamic input
export const ArticleBlock = async (initialProps: object) => {
  // `props` is automatically typed and includes the parsed `author` object!
  const { title, content, author } = await articleBlockParser(initialProps);

  return (
    <article>
      <h1>{title}</h1>
      {/* Pass the fully parsed and typed `author` object to the child component */}
      <AuthorBadge {...author} />
      <p>{content}</p>
    </article>
  );
};
```

```tsx
// app/article/[slug]/page.tsx
import { ArticleBlock } from '../../../components/article-block/article-block';

export default async function Page({ params }: { params: { slug: string } }) {
  // Fake data fetching
  const res = await fetch(`https://api.example.com/articles/${params.slug}`);
  const articleData = await res.json();

  return (
    <main>
      <ArticleBlock {...articleData} />
    </main>
  );
}
```

### Server-Side Data Fetching & Caching

**Why:** Server-side environments (like Next.js App Router or Express) are perfect for parsing heavy API responses. By configuring the `storage` options, `createParser` can cache expensive computations (like DB calls or formatted strings) natively.

**Features Used:** `initializeParser` (storage), `createParser` (cache options), Async parsing.

```ts
// 1. Setup caching in parser-config.ts
import { initializeParser, toHash } from '@bou-co/parsing';
import { redis } from '../redis';

// Advanced typing: extend the context interface
declare module '@bou-co/parsing' {
  interface ParserCachingOptions {
    name?: string;
    ttl?: number;
  }
}

export const { createParser, types } = initializeParser({
  storage: {
    generateKey: (context) => {
      if (!context.cache.name) throw new Error('Caching options must have a name defined');
      return `${context.cache.name}:${toHash(context.data)}`;
    },
    add: async (key, value, context) => {
      await redis.set(key, JSON.stringify(value), { ex: context.cache.ttl });
    },
    match: async (key) => await redis.get(key),
  },
});

// 2. Create the parser with caching enabled
import { createParser, types } from '../path-to/parser-config';

const expensiveParser = createParser(
  {
    summary: async ({ data }) => {
      // Expensive DB Query or AI generation based on data.id
      await new Promise((r) => setTimeout(r, 1000));
      return `Processed: ${data.id}`;
    },
  },
  {
    cache: { enabled: true, ttl: 3600, name: 'summary-cache' },
  },
);

// 3. Execution (e.g., inside an Express route or Next.js Server Action)
const rawData = { id: 'user_123' };
const result = await expensiveParser(rawData); // Takes 1s first time, almost instant on subsequent calls!
```

Cache options do not flow from a parser into the parsers nested inside it: each `createParser` brings its own `cache` config (per-call `cache` still propagates), so a `generateKey` that requires a `name` needs one on every nested parser.

### Value-Level Caching with `context.store`

**Why:** Whole-parse caching (above) keys on the full input data. Often, though, a single value function makes an expensive async request whose result is shared across many different parses (e.g. fetching a referenced author). `context.store` caches individual computations through the same globally configured `storage`.

**Features Used:** `context.store`, `context.storage`, `initializeParser` (storage).

```ts
const articleParser = createParser({
  title: types.string,
  author: async ({ data, store }) => {
    const id = `author:https://api.example.com/authors/${data.authorId}`;

    const fetcher = async () => {
      const res = await fetch(`https://api.example.com/authors/${data.authorId}`);
      return res.json();
    };

    return store(id, fetcher, { ttl: 3600 });
  },
});
```

Semantics:

- Caches whenever a global `storage` is configured, **independent of `cache.enabled`** (calling `store` is the opt-in).
- With no storage configured (e.g. client-side) it simply runs the function, so value functions stay isomorphic.
- Concurrent calls with the same key share one in-flight computation: array items parse in parallel, but the request fires once.
- Errors are never cached; a failed computation rejects all waiters and the next call retries.
- `null`/`undefined` from `storage.match` count as misses, so falsy values (`0`, `''`, `false`) cache correctly.
- The optional third argument is merged into `context.cache` for the backend's `match`/`add` (e.g. a `ttl`).
- The cache identity is your explicit key: the context passed to the backend carries no per-key information.

For manual control, the configured backend is also directly available as `context.storage` (`match`/`add`/`remove`/`clear`).

### Caching individual values with `cacheResult`

**Why:** `context.store` requires writing a value function that builds its own key. `cacheResult` packages the same caching into a declarative wrapper: give it a key template and a function, and drop it anywhere — a projection, a [`resolve`](#resolving-values-without-parsing) input, or a plain `await` outside the parser entirely.

**Features Used:** `cacheResult`, `initializeParser` (storage), [Built-in context variables](#built-in-context-variables).

```ts
// parsing-config.ts — caching requires a configured storage; the export works without one too
export const { createParser, resolve, cacheResult, types } = initializeParser({ storage });
```

```ts
import { createParser, types, cacheResult } from './parsing-config';

const myParser = createParser({
  name: types.string,
  profile: cacheResult('profile-{{data.uid}}', async (ctx) => {
    /* Logic to fetch profile */
    return profile;
  }),
});

const data = await myParser({ name: 'John Doe', uid: '1234' });
// → profile is fetched once and cached under 'profile-1234'
```

The key is interpolated with the [variables pattern](#variables) against the active context when the value resolves — `{{data.uid}}`, `{{ctx.currentLocale}}`, explicit variables, fallbacks and pipes all work. The same wrapper also runs outside a parser:

```ts
import { resolve, cacheResult } from './parsing-config';

const uid = '1234';
const query = (ctx) => fetch(`https://api.example.com/profile/${uid}`).then((res) => res.json());

// Standalone: await it directly — the optional third argument provides the data for key interpolation
const rawData = await cacheResult('raw-data-{{data.uid}}', query, { uid });
const rawData2 = await cacheResult(`raw-data-${uid}`, query); // or skip interpolation entirely

// Or inside a resolve input
const data = await resolve({
  name: 'John Doe',
  profile: cacheResult(`profile-${uid}`, query),
});
```

Semantics:

- Same engine as `context.store`: storage-gated (no storage → the function just runs), independent of `cache.enabled`, in-flight dedup shared per key, errors never cached, `null`/`undefined` matches count as misses.
- The function always receives the active `ParserContext` (inside a parse the real per-key context; standalone a root context whose `data` is the third argument).
- The optional third argument feeds key interpolation: standalone it becomes the context data, inside a parse it is merged over the current `data` for the key only.
- The optional fourth argument is merged into `context.cache` for the storage backend (e.g. a `ttl`), like `context.store`'s third argument.
- Awaiting the same wrapper twice standalone computes once (memoized per wrapper).
- Watch the key template: a variable that resolves to nothing stringifies to `undefined` inside the key (`'profile-undefined'`), silently colliding across inputs.

### CMS Content Templating with Variables

**Why:** Instead of building complex string-replacement utilities or integrating heavy templating engines like EJS, Bou Parsing allows content editors in a CMS to use double curly braces (`{{variable}}`) for dynamic injection. Coders define the variable resolvers (which can even be async DB lookups), and the parser handles replacing them safely.

**Features Used:** `variables` (Global & Instance), `pipes`, Async resolvers, Fallbacks (`||`), Pipes (`|`), Deep object resolution.

```ts
// 1. Global Setup in parser-config.ts
import { initializeParser } from '@bou-co/parsing';
import { db } from '../database';

export const { createParser, types } = initializeParser(() => ({
  variables: {
    // Basic function resolver
    currentYear: () => new Date().getFullYear(),

    // Async DB fetch: only called if the variable is actually used in the text!
    latestRelease: async () => {
      const release = await db.query('SELECT version FROM releases ORDER BY date DESC LIMIT 1');
      return release.version;
    },
  },
  pipes: {
    // Pipe for transformation
    capitalize: ({ data }) => String(data).charAt(0).toUpperCase() + String(data).slice(1),
  },
}));

// 2. Parser definition
import { createParser, types } from '../path-to/parser-config';

const cmsBlockParser = createParser({
  heading: types.string,
  body: types.string,
});

// 3. Execution (e.g., inside an API route fetching CMS data)
// This raw data represents what a content editor typed into the CMS:
const rawDataFromCMS = {
  heading: 'Release {{latestRelease || "v1.0.0"}} is out!',
  body: 'Copyright {{currentYear}}. Welcome back, {{user.name || "friend" | capitalize}}.',
};

// We pass the current logged-in user dynamically via instance context
const instanceContext = {
  variables: {
    user: { name: 'alice' },
  },
};

const result = await cmsBlockParser(rawDataFromCMS, instanceContext);

/* Result:
{
  "heading": "Release v2.4.1 is out!",
  "body": "Copyright 2026. Welcome back, Alice."
}
*/
```

### CMS Dynamic Variables with On-Demand Fetching & Caching

**Why:** Often in CMS systems, content editors want to embed reusable snippets or documents directly into their text (e.g., `{{snippets/summer-sale.title}}`). Instead of pre-fetching all possible snippets upfront (which can be slow and resource-heavy), you can use `variableResolver` to fetch only the exact snippets used in the text on-demand.

**Features Used:** `variableResolver`, Deep object resolution.

```ts
// 1. Global Setup in parser-config.ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser, types } = initializeParser(() => ({
  variableResolver: async (variableName, context) => {
    // Intercept any variable starting with 'snippets/'
    if (variableName.startsWith('snippets/')) {
      const slug = variableName.split('/')[1];

      // Fetch the snippet from the CMS (simulated here with a static map)
      const dataFromCMS: Record<string, string> = {
        'current-sale-title': '50% Off Summer Sale',
        'current-sale-description': 'Get the best deals of the season.',
      };
      const snippet = await Promise.resolve(dataFromCMS[slug]);

      return snippet;
    }

    // Return undefined to let standard fallbacks or other variables take over
    return undefined;
  },
}));

// 2. Parser definition
import { createParser, types } from '../path-to/parser-config';

const pageParser = createParser({
  content: types.string,
});

// 3. Execution
// The raw data from the CMS contains a reference to a snippet
const rawDataFromCMS = {
  content: 'Check out our latest promo: {{snippets/current-sale-title}}! {{snippets/current-sale-description}}',
};

const result = await pageParser(rawDataFromCMS);

/* Result:
{
  "content": "Check out our latest promo: 50% Off Summer Sale! Get the best deals of the season."
}
*/
```

### Advanced TypeScript Generation & Utilities

**Why:** Hand-writing types for CMS or 3rd-party API responses is brittle. Bou Parsing allows you to infer exact TypeScript interfaces directly from your parser definitions.

**Features Used:** `ParserReturnValue`, `typed<T>`, `optional<T>`, Module Declaration Overrides.

```ts
import { ParserReturnValue, typed, optional } from '@bou-co/parsing';
import { createParser, types } from '../path-to/parser-config';

// 1. Extend global context for strict type safety inside functions
declare module '@bou-co/parsing' {
  interface FunctionalContext {
    userRole: 'admin' | 'guest';
  }
}

// 2. Define custom interfaces
interface Author {
  name: string;
  title?: string;
}

// 3. Create the Parser
const articleParser = createParser({
  title: types.string,
  category: typed<'blog' | 'news'>, // Forces union type instead of generic types.string
  author: optional<Author>, // Custom complex interface, explicitly optional
  canEdit: ({ userRole }) => userRole === 'admin', // userRole is typed!
});

// 4. Extract the exact TypeScript Type
export type Article = ParserReturnValue<typeof articleParser>;

/*
Article type equals:
interface Article {
  title?: string;
  category?: 'blog' | 'news';
  author?: Author | undefined;
  canEdit?: boolean;
}
*/

const rawData = { title: 'Hello', category: 'blog', author: { name: 'Jane' } };
const result = await articleParser(rawData, { userRole: 'admin' });

/* Result:
{ "title": "Hello", "category": "blog", "author": { "name": "Jane" }, "canEdit": true }
*/
```

### Global Localization via Transformers

**Why:** Content models often return localized data as objects (e.g. `{ en: 'Text', es: 'Texto' }`). Rather than parsing this manually in every component, transformers intercept and resolve the correct locale automatically across your entire dataset.

**Features Used:** `transformers`, Context variables.

```ts
// 1. Configure the transformer
import { initializeParser } from '@bou-co/parsing';

const localize = {
  when: ({ data }) => typeof data === 'object' && ('en' in data || 'es' in data),
  then: ({ data, locale = 'en' }) => data[locale] || data['en'], // Fallback to en
};

export const { createParser, types } = initializeParser({
  transformers: { localize },
});

// 2. Create the Parser
import { createParser, types } from '../path-to/parser-config';

const pageParser = createParser({
  heading: types.string,
  body: types.string,
});

// 3. Execution
const rawDataFromCMS = {
  heading: { en: 'Welcome', es: 'Bienvenido' },
  body: { en: 'Content', es: 'Contenido' },
};

const resultEn = await pageParser(rawDataFromCMS, { locale: 'en' });

/* Result: { "heading": "Welcome", "body": "Content" } */

const resultEs = await pageParser(rawDataFromCMS, { locale: 'es' });

/* Result: { "heading": "Bienvenido", "body": "Contenido" } */
```

### Client-Side React Integration

**Why:** When running the parser directly inside a React component, handling asynchronous resolution and states can be tedious. The `useParserValue` hook abstracts this safely.

**Features Used:** `useParserValue`

_React is an optional peer dependency — install `react` in your project to use this entry point; the core package never pulls it in._

```tsx
import React from 'react';
import { useParserValue } from '@bou-co/parsing/react';
import { createParser, types } from '../path-to/parser-config';

const userParser = createParser({
  name: types.string,
  profileUrl: async ({ data }) => `https://img.com/${data.id}`,
});

export const UserProfile = ({ rawData }) => {
  // Hook handles async resolution natively
  const { result: user, loading } = useParserValue(rawData, userParser);

  if (loading) return <div>Loading profile...</div>;

  return (
    <div>
      <h1>{user?.name}</h1>
      <img src={user?.profileUrl} alt="Profile" />
    </div>
  );
};
```

---

## Gotchas

Behaviours that surprise people, ordered roughly by how often they bite. Each entry states the surprise; where a section already explains the mechanism it points there instead of repeating it. The [agent skill](#agent-skills) carries the same list, plus a few contributor notes.

### Templating

#### A misspelled variable path produces the literal string `"undefined"`

A missing or misspelled path resolves to `undefined` with **no log at all** — walking through a missing key or a non-object just returns `undefined` (`console.debug` fires only when something actually throws along the way: a throwing getter, a throwing variable function, a duck-typed `get()` that errors).

```ts
await parser({ b: 'Hi {{user.nmae.deep}}' });
// → { b: 'Hi undefined' }
```

That string ships to production looking like real content, and nothing in the logs points at it. If editors control the templates, validate the rendered output or make fallbacks (`{{user.name || ""}}`) a house rule.

#### Embedded and whole-string matches behave differently

The same missing variable produces two outcomes depending on position:

```ts
createParser({ a: types.string, n: types.number });
// { a: 'Hi {{nope}}' }  → { a: 'Hi undefined' }   ← literal string spliced in
// { n: '{{nope}}' }     → { }                     ← undefined, so the key is omitted
```

A whole-string match returns the raw resolved value, which stays `undefined` and is dropped by the normal optionality rule; an embedded match is spliced into the surrounding text, and `undefined` stringifies. Neither is wrong, but they are easy to conflate when debugging. See [Patterns](#patterns).

#### Escaping is not idempotent across two passes

The backslash is _consumed_ on the first pass, so escaped content survives one parse and then resolves on the next:

```ts
await parser({ a: 'hi {{who}} and \\{{who}}' });
// pass 1 → 'hi world and {{who}}'          ← correct
// re-parse that output → 'hi world and world'  ← the escape is gone
```

This matters because parser output loses its "already parsed" marker at any serialization boundary (next entry), so a second pass is easy to trigger by accident. If `{{...}}` must survive as literal text through storage or an RSC boundary, escape it at render time, not at parse time — or use a placeholder the pattern does not match.

#### The `_parsed` marker does not survive serialization

Parser output is a `Proxy` whose `get` trap answers `_parsed: true`; that marker is how the engine knows not to re-resolve already-parsed objects. It is not a real property:

```ts
out._parsed; // true
'_parsed' in out; // false
Object.keys(out); // ['a'] — marker absent
JSON.parse(JSON.stringify(out))._parsed; // undefined
({ ...out })._parsed; // undefined
```

Spreading, `JSON` round-tripping, storing in Redis, or crossing the RSC serialization boundary all strip it (`structuredClone` cannot clone the Proxy at all and throws a `DataCloneError`), and a parse after any of those re-runs transformers and patterns on the content — usually harmless, occasionally not (see escaping above, and non-deterministic variable resolvers). Deliberate in-process chaining (`await stepTwo(await stepOne(raw))`) is fine; the Proxy is intact. See [Chaining parsers](#chaining-parsers-reparsing).

#### Any object with a `.get()` method becomes a lookup interface

If a value along a dot path has a `get` method, it is called with the next key:

```ts
initializeParser({ variables: { cfg: new Map([['token', 'FROM_MAP']]) } });
// '{{cfg.token}}' → 'FROM_MAP'
```

Handy for `Map`, `Headers`, `URLSearchParams` and custom stores; surprising if your data has a field literally named `get` that is a function — the path is routed through it instead of read as a property.

#### Resolver-cached variables shadow everything

Values cached through the `variableResolver`'s `cache()` callback merge into `context.variables` **last** on every later parse — after global, schema and instance variables — for the life of the engine. Never `cache()` user- or request-scoped values. See [Dynamic Variable Resolvers](#dynamic-variable-resolvers).

#### Resolved output is re-scanned by default

A variable resolving to a string that contains `{{other}}` resolves that too; cycles, and chains deeper than 10 levels, throw `ParserPatternCycleError` rather than hanging. Opt out with `patterns: { variables: { rescan: false } }`. If editors can put variable syntax into variable _values_, this is a feature or an injection vector depending on your setup. See [Patterns](#patterns).

#### `$` sequences in resolved values are inserted literally

`$&`, `$1` and `$$` in a resolved value are spliced as-is (the splicer never goes through `String.replace`). Correct, but a change if you had worked around the old mangling.

#### `null` in a fallback chain stops it — and drops the key

`{{ a || null }}` returns `null`, a defined value. As a whole-string value under a type token it is treated as missing — the key is omitted or the token default applies; without a token at the key the key survives with `null`; inside text it splices as `"null"`. See [Fallbacks & literals](#fallbacks--literals).

#### Type pipes throw unless you write a fallback

`{{ contact | email }}` throws on an invalid email under the default policy, exactly like `contact: types.email` would. `{{ contact | email || "n/a" }}` falls back; `|| undefined` or `email.loose` say "undefined is fine". See [Types as pipes](#types-as-pipes).

#### Pipes live in `pipes`, not `variables` — but pipe parameters read `variables`

A function left in `variables` and used as `{{x | fn}}` throws a targeted error naming the key path (a transitional v2 migration catch — in v4 it becomes a plain "Pipe not found"), unless a type of that name exists, in which case the type pipe wins silently. Pipe _parameters_ that reference variables (`{{x | join:firstName}}`) still resolve from `variables`: those are data references, and the asymmetry is intentional. See [Pipes](#pipes).

### Casting & types

#### `slug` is ASCII-only — non-Latin input fails

`types.slug` produces an ASCII slug (`[a-z0-9]` words joined by single `-`) without locale data: trim → transliterate the Latin letters Unicode cannot decompose (`ß` → `ss`, `æ` → `ae`, `œ` → `oe`, `ø` → `o`, `ł` → `l`, `đ`/`ð` → `d`, `þ` → `th`, `ħ` → `h`, `ŧ` → `t`, `ŋ` → `n`, `ı` → `i`, `ĸ` → `k`) → NFKD and strip every combining mark (`Hyvää yötä` → `hyvaa yota`, `Łódź` → `lodz`, `Tiếng Việt` → `tieng viet`; fullwidth and ligature forms fold too) → lower-case → every run of anything else becomes one `-`, trimmed at the ends → nothing left is `Invalid slug`. Two limits are deliberate: **non-Latin scripts** (Cyrillic, Greek, CJK, Arabic, …) have no ASCII form and are dropped, so `Привет 2024` → `2024` and a value made only of them **fails** rather than silently becoming `-`; and **locale conventions** (`ä` → `ae` in German, `&` → `and`, romanising Cyrillic) are not applied. Both belong in a pre-step composed in front — `.to(types.slug)` keeps the `slug` family, so every accessor still chains:

```ts
const germanSlug = types.string.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').to(types.slug);
const russianSlug = types.string.extend(romanise).to(types.slug); // your own transliteration first
const validated = types.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/); // validate only, never normalise
```

#### `types.date` throws on `false` and unparseable strings; `''` is missing

Anything that would have been an `Invalid Date` is a cast failure — except `''`, which is missing for every type (key omitted, or the default fills; `.required` to fail). `0` is a valid epoch number and casts to `new Date(0)`. Code that wants an `Invalid Date` back needs a custom type.

#### `default` is not cast

The default is returned as-is; TypeScript enforces that it matches the output type, but no runtime casting happens — `types.number({ default: '0' as any })` hands you a string. See [Missing values and defaults](#missing-values-and-defaults).

#### `default` does not rescue hard failures

Defaults cover _absent_, not _invalid_: under the default policy a present-but-invalid value still throws even when a default exists, and `.strict` types always do. See [Missing values and defaults](#missing-values-and-defaults).

#### Custom type factories need `name` for correct caching

Closures are invisible to hashing, so two types built from one factory function hash identically and share cache entries unless the factory gives each a `name` (`defineType({ fn, name: \`scaled-${factor}\` })`). See [`defineType`](#definetypedefinition).

#### Calling a token takes an options object, never a type

`types.string({ default: 'x' })` and `types.string.default('x')` are the same token, but `types.array(types.string)` throws — items go through `.of()`. A token placed in `pipes` or `variables` gets called with a context and throws a targeted error: register it under `types`. `.cast(value)` is the standalone cast.

#### The empty string is missing

`''` skips casting for every type, like `undefined`/`null`: `{ title: '' }` yields no `title` (or its default); `false` and `0` are values; only `.required` tokens fail on missing input. `types.string` keeps `'  '`, `types.text` treats whitespace-only content as missing and keeps line breaks. See [Missing values and defaults](#missing-values-and-defaults).

#### `email` and `tel` keep the value as written

Neither base cast rewrites the value: `email` keeps the case (`.normalized`, or the inherited `.lowerCase`), `tel` keeps the editor's formatting (`.normalized` → `+358401234567`, `.href` → `tel:…;ext=…`). Project the label and the link from one raw field with [`get`](#getpath-from-type): `phoneLink: get('phoneNumber', types.tel.href)`. See [The built-in catalogue](#the-built-in-catalogue).

#### `.to(fn)` leaves the family; `.extend(fn)` keeps it

`types.string.to((v) => v.length)` is a base `TypeToken<number>` with no string accessors — correct, it is a number. `types.text.extend(fn)` is still a `text`. The built-in string-valued derivations (`email.domain`, `url.pathname`, `date.iso`, `html.plain`) _are_ `StringType`s, so `.plain.truncate(160)` works; your own `.to()` returning a string is not, unless you `.to(types.string)` afterwards. See [Extending types](#extending-types).

#### Shared accessor names have no root pipe form

`length` (`string`/`array`), `normalized` and `href` (`email`/`tel`) and `of` (`array`/`json`) are only reachable qualified: `{{ x | length }}` is "Pipe not found", `string.length` works. Built-in collisions are silent by design; a registered type that introduces one logs a warning once. See [Types as pipes](#types-as-pipes).

#### `record.of` drops missing values, `array.of` keeps the slot

`record.of(x)` omits an entry whose value casts to missing; `array.of(x)` keeps the position as `undefined` so indices stay stable (`['1', '', '3']` → `[1, undefined, 3]`). Add `.compact` to drop the holes.

### Projection-driven nesting & directives

#### Side effects run for missing keys

The biggest behavioural surprise in v3: nested parsers, `@combine` resolvers, `context.store` calls and `variableResolver` lookups inside a nested projection run even when the input lacks the key, because the projection is resolved against `{}` instead of skipped:

```ts
const child = createParser({ fetched: async () => expensiveFetch() });
const parent = createParser({ title: types.string, child });
await parent({ title: 'only title' }); // → { title, child: { fetched: … } } — and the fetch RAN
```

Guard I/O that should only happen when data exists with a value function: `child: ({ data }) => (data['child'] ? childParser : undefined)`. Audit every nested parser and `@combine` that performs I/O. See [The projection is the point of truth](#the-projection-is-the-point-of-truth).

#### `context.data` is `{}` during projection-driven resolution

Value functions that assume `data` is populated read `undefined` rather than crash, so the bug shows up as missing output. The parent level's data is at `context.parent.data` (the raw value at the key itself at `context.parent.value`), and `context.datalessPath` is set by the engine only in this mode — test for it when a function needs to behave differently: `summary: ({ data, datalessPath }) => (datalessPath ? undefined : buildSummary(data))`.

#### An `after` hook that returns data instead of a context is silently ignored

The engine does `if (afterResult.data) combined = afterResult.data`, so the hook must return a **context-shaped** object. Returning the modified data directly discards it — no error, no warning, output unchanged:

```ts
after: (ctx) => ({ ...ctx.data, stamped: true }); // ❌ → { a: 'x' }
after: (ctx) => ({ ...ctx, data: { ...ctx.data, stamped: true } }); // ✅ → { a: 'x', stamped: true }
```

Worse than a no-op if your output happens to contain a key named `data`: the raw return would then set the whole result to `data.data`. Always spread the context. See [Lifecycle hooks](#lifecycle-hooks).

#### An unconditional `after` hook defeats empty-result omission

"Empty results are omitted" counts _keys, not values_. An `after` hook or `@combine` that always injects a key makes every projection-driven resolution non-empty, so nested keys stop being dropped. Hook output is output.

#### Arrays still require data

`'@array': true`, array literals and `.asArray` are never conjured without array input. If you expected a defaulted empty array, declare it: `tags: types.array({ default: [] }).of(types.string)`.

#### Literal recursive object cycles cannot be cached

Self-referencing schemas built as literal object cycles cannot be hashed (`toHash` goes through `JSON.stringify`). Reference parsers through value functions instead. The recursion itself terminates: the cycle resolves once more with its data-independent fields, then cuts.

#### A scalar under an object projection resolves the projection

A truthy scalar at an object-projection key does not return the projection object (as earlier versions did) — it resolves the projection, with the scalar reachable at `context.parent.value` (`context.parent.data` is the parent's whole data object).

#### Parsers in positional array slots silently misbehave

A positional array projection works with plain projections and silently fails with parsers:

```ts
createParser({ pair: [{ name: types.string }, { v: types.number }] }); // → { pair: [{ name: 'x' }, { v: 2 }] } ✅
createParser({ pair: [parserA, parserB] }); // → { pair: [{}, {}] }  ❌ empty objects, no error
```

A function in a positional slot is treated as a **projection factory**: the parser is invoked with the item context as its input and its _parsed output_ becomes the projection — `{}` for token-only parsers, a nonsense projection for anything else. Use plain projections in positional slots, or `parser.asArray` when every item shares one projection. Root-level positional projections (`createParser([projA, projB])`) work.

#### Unknown `@`-prefixed keys are silently dropped

Only `'@combine'` is prefix-matched — any key starting with it works (`'@combine:stats'`, `'@combine:2'`), which is how you put several combines in one projection. `'@if'` and `'@array'` are **exact** matches: a typo like `'@if2'` or `'@arrays'` neither errors nor resolves — the key just vanishes from the output. See [Projection Directives](#projection-directives).

### Context & resolve

#### `isRoot` is `false` inside every kind of nesting

Once-per-parse work guarded by `context.isRoot` will not run inside a nested parser. Walk the `context.parent` chain to find the root. See [Context Object](#context-object-parsercontext).

#### Reserved context keys are silently overwritten

`data`, `key`, `projection`, `variables`, `pipes`, `types`, `isRoot`, `cache`, `value`, `parent`, `path`, `store` and `resolve` are written by the engine _after_ your context spreads: a custom context property with one of these names disappears without warning. Namespace your additions. Near-misses to treat as reserved anyway: `datalessPath` (set on the parent context during projection-driven resolution and inherited from there), `parser` (written _before_ the spreads — a schema or global context can override it, while an instance context carrying `parser` hits the "parent context is the third argument" migration error), `index` (injected only for array items) and `params` (engine-set inside pipe contexts).

#### `get(path, token)` casts in the engine — but `resolve` data is the resolve input

`get('x', types.tel)` returns the raw value and carries the token; the parser casts it after transformers and patterns with the projection key as the error path. Inside `context.resolve` `data` is the value being resolved, so use `get('x', context.data, types.tel)` there. Awaiting `get(path, from, token)` standalone casts with a root context and throws on failure. See [`get`](#getpath-from-type).

#### `context.resolve` vs the exported `resolve`

The exported `resolve` never inherits ambient context. Inside a value function, using it instead of `context.resolve` silently loses merged variables, transformers and locale — destructure it: `async ({ resolve }) => resolve('…')`. See [Function values & the contextual resolve](#function-values--the-contextual-resolve).

#### Zero-arg `resolve()` recurses inside `resolve()` inputs

Within a function value in a `resolve()` **input** (not a projection), calling `resolve()` with no arguments re-resolves the input containing that function — which calls the function again, without bound: unguarded, it ends in a stack overflow. Parse-mode value functions are immune because their `value` is raw data.

#### `context.resolve(input)` rebinds the built-in heads

It rebinds `data`/`value`/`current` to the input being resolved, so `{{data.x}}` inside such a string refers to _that input_, not the surrounding parse data. See [Built-in context variables](#built-in-context-variables).

### Configuration & caching

#### `toHash` is key-order sensitive — and all falsy inputs hash identically

`toHash` is `JSON.stringify` plus a string hash with no key sorting, so an object assembled in a different key order produces a different key for identical content and misses the cache forever; sort before hashing when order is not guaranteed (see [`toHash`](#tohashdata)). Also, `0`, `''`, `false`, `null`, `undefined` and `NaN` all collapse to one hash, so none of them can distinguish a key.

#### `patterns` is global-only

Unlike `variables` and `pipes`, it cannot be set per parser or per call; the registry compiles once per engine. See [Context Configuration & Modifiers](#context-configuration--modifiers).

#### `expressions: true` on a token pattern throws on the first parse

Deliberate — token patterns have no end delimiter, so `||` after a match is just text. The registry compiles lazily, so the throw surfaces as a rejected promise on the **first parse or resolve**, not at `initializeParser`.

#### Nested parsers do not inherit schema cache options

Each parser brings its own `createParser` cache config (per-call cache still propagates). With a `generateKey` that requires a `name`, a nested parse that used to inherit the parent's name throws `Caching options must have a name defined` — give the nested parser its own cache config. See [Server-Side Data Fetching & Caching](#server-side-data-fetching--caching).

#### `parser.asArray !== parser`, but they hash the same

`asArray` is a derived variant, so identity comparisons against `parser` fail; its hash is the base parser's (`String(parser.asArray) === String(parser)`), so as a projection value or `toHash` input the two are indistinguishable. Direct `parser.asArray(...)` calls bypass the whole-parse caching proxy — caching applies when `asArray` sits inside a cached parent parse.

#### `types` is not a root export

`import { types } from '@bou-co/parsing'` does not work: get the namespace from `initializeParser`, or import tokens individually from `@bou-co/parsing/types`.

#### `initializeParser` returns four things

`{ createParser, resolve, cacheResult, types }` — destructure and re-export all four from your parser config; `cacheResult` is the one that gets forgotten.

## API Reference

### Core Functions

#### `initializeParser(config?)`

Initializes an isolated parsing engine with global settings (loose casting, transformers, patterns, pipes, storage caching, variables, lifecycle hooks).

- **Returns:** `{ createParser, resolve, cacheResult, types }`, where `types` contains the built-in casting types.

#### `createParser(projection, options?)`

Creates an executable parser function based on the provided schema projection.

- **Returns:** An asynchronous parsing function that takes `(rawData, instanceContext?, parentContext?)` — a full parser context belongs in the third slot.
- **Methods:** `.extend(newProjection, context?)`, `.withContext(newContext)`, `.asArray`, `.flat`, `.as`; `.projection` holds the projection

#### `resolve(input, contextOverride?)`

Resolves variables and applies global transformers on raw input (an object, array, plain string, or function) without a projection, casting, or hooks. Transformers apply at every nesting level, and functions are invoked with the parser context and resolved recursively. See [Resolving values without parsing](#resolving-values-without-parsing).

- **Returns:** A promise of the resolved input, typed from the input shape; an explicit generic always overrides the inferred type (e.g. when a transformer reshapes values).

#### `cacheResult(key, fn, extraData?, options?)`

Wraps a value function so its result is cached through the global `storage` under a variable-interpolated key (`'profile-{{data.uid}}'`). Works as a projection value, inside `resolve` inputs, or awaited directly outside a parse; without a configured storage it simply runs the function. See [Caching individual values with `cacheResult`](#caching-individual-values-with-cacheresult).

- **Returns:** A wrapper that is invoked with the active `ParserContext` inside a parse, and is awaitable standalone (`extraData` becomes the context data; `options` merge into `context.cache` for the backend).

### Context Object (`ParserContext`)

The `context` object is passed to all dynamic resolver functions in your projection. It contains the raw data, some info about current execution and custom properties.

- **`data`**: The raw input data at the currently executing nested level. During projection-driven resolution (no matching input for a nested projection) this is an empty object; the incoming value remains available via `context.parent.value` and the parent level's data via `context.parent.data`.
- **`value`**: The raw incoming data value at the current key (`data?.[key]`), so `({ value }) => value * 5` replaces `({ data, key }) => data[key] * 5`. Never resolved eagerly: a `"{{variable}}"` string arrives as-is; call `resolve()` with no arguments to resolve it on demand. `undefined` during projection-driven resolution. Inside transformers and pipes, `value` mirrors `data` (the candidate value being processed).
- **`variables`**: A merged dictionary of global, schema, and instance variables, including a `current` reference to the root input of the run. The built-in `data`/`ctx`/`context` heads resolve live from the context instead of this dictionary. Used automatically in string template replacement. See [Variables](#variables) and [Built-in context variables](#built-in-context-variables).
- **`pipes`**: A merged dictionary of global, schema, and instance pipe functions, available to every pattern with expressions enabled. See [Patterns](#patterns).
- **`key`**: The string key of the property currently being evaluated.
- **`index`**: The numeric index if the current data is being evaluated inside an array. See [Nested Arrays](#nested-data-structures).
- **`isRoot`**: A boolean indicating if this is the top-level execution of the parser — `false` inside every kind of nesting, nested parsers included; walk `parent` to reach the root.
- **`parent`**: The enclosing level's context, chaining all the way up to the root (`undefined` at the root). During nested or projection-driven resolution, `context.parent.data` reaches the surrounding input.
- **`projection`**: The active projection schema definition for the current level.
- **`cache`**: The merged caching options. See [Caching](#server-side-data-fetching--caching).
- **`store`**: `store(key, fn, options?)` runs get-or-compute caching for a single async value through the global `storage`, with in-flight dedupe, independent of `cache.enabled`. See [Value-Level Caching with `context.store`](#value-level-caching-with-contextstore).
- **`storage`**: Direct access to the configured storage backend.
- **`params`**: Inside a pipe function, the resolved parameters given after the pipe name (`{{x | pipe:param1:param2}}`); `undefined` when none were passed.
- **`resolve`**: A contextual version of [`resolve`](#resolveinput-contextoverride) that inherits the active context (variables, transformers, locale) with optional per-call overrides. Called with **no arguments** it lazily resolves the current `context.value`, memoized per context so repeated calls resolve once. See [Function values & the contextual resolve](#function-values--the-contextual-resolve).
- **`parser`**: A reference to the underlying `Parser` instance handling the execution.
- **`path`**: The chain of projection references from the root to the current level, present in every parse.
- **`datalessPath`**: The chain of projection references accumulated during projection-driven resolution. Present only when the current parse has no matching input data. Its presence tells a value function it is running data-lessly. See [The projection is the point of truth](#the-projection-is-the-point-of-truth).
- **Custom Properties**: Any additional properties passed via context overriding or lifecycle hooks. To enable strong typing for custom properties, use TypeScript module augmentation. See [Advanced TypeScript Generation](#advanced-typescript-generation--utilities) and [Context Overriding](#context-overriding).

### Context Configuration & Modifiers

Context can be configured at three distinct levels, allowing you to scope variables, caching, and hooks appropriately.

1. **Global Level (`initializeParser`)**: Each call creates an isolated parser engine; settings applied here affect all parsers created from the returned `createParser`. Ideal for `storage`, global `transformers`, `patterns` (global-only), global `variables`, and global `pipes`. See [Multiple parser configurations](#multiple-parser-configurations).
2. **Schema Level (`createParser`)**: Settings applied here affect all executions of this specific parser schema. Ideal for schema-specific `variables`, `pipes`, `cache` definitions, or `before`/`after` hooks.
3. **Instance Level (`myParser(data, context)`)**: Settings applied during execution. Ideal for request-specific `variables` and `pipes` (e.g., currently logged-in user, active locale).

### Projection Directives

Advanced structural controls available as keys within your schema definition.

- **`@if`**: Accepts an array of objects containing `when` (a condition function) and `then` (the projection to merge if true). Allows fully conditional object picking. Inside projection-driven resolution the condition runs against an empty data object. See [Conditional Data](#conditional-data).
- **`@combine`**: Accepts an async function returning an object. Merges the returned object directly into the current parsed output. Useful for fetching secondary datasets. Prefix-matched: any key starting with `@combine` (`'@combine:stats'`) is a combine, which is how several fit in one projection. See [Merging Data](#merging-data).
- **`@array`**: When set to `true` at the root of a nested projection, signals the parser to iterate over the input data as an array and apply the remaining properties to each item. See [Nested Arrays](#nested-data-structures).
- `@if` and `@array` are exact matches; any other `@`-prefixed key is silently dropped.
- **`parser.flat`**: Not a key but a projection value. It parses the data under its key with the given parser and merges the result into the parent output, dropping the key. See [Flattening nested parsers](#flattening-nested-parsers-with-flat).

### Built-in Types

The `types` namespace (returned by `initializeParser`, also available as individual named exports from the tree-shakeable `@bou-co/parsing/types` entry point) provides casting types for standard properties, all configured by chaining:

- **Primitives**: `types.string`, `types.number`, `types.boolean`, `types.date`, `types.object`, `types.any`, `types.unknown`.
- **Arrays**: `types.array` (pass-through validation) or per-item casting via `types.array.of(types.string)`, including nesting (`types.array.of(types.array.of(types.number))`); `types.unique(item)` for deduplicated arrays.
- **Use cases**: `types.text`, `types.email`, `types.url`, `types.slug`, `types.color`, `types.tel`, `types.mimeType`, `types.json`, `types.oneOf(...values)`, `types.pattern(regex | source, flags?)` (named groups return the group map; type it with `types.pattern<{ year: string }>(…)`).
- **Universal chain** on every token: `.default(value)`, `.required`, `.strict`, `.loose`, `.extend(fn)`, `.to(fn | token)`, `.cast(value)`; plus the read-only `name`, `id`, `defaultValue`, `isRequired` and `policy`. The same options are accepted as an object: `types.x({ default, required, strict, loose })`.
- **Classes**: `TypeToken`, `StringType`, `NumberType`, `BooleanType`, `DateType`, `ObjectType`, `ArrayType`, `AnyType`, `UnknownType`, `TextType`, `EmailType`, `UrlType`, `SlugType`, `ColorType`, `TelType`, `MimeTypeType`, `JsonType`, `OneOfType`, `PatternType` — for `class Mine extends StringType`. Configured tokens expose their configuration: `OneOfType.values`, `PatternType.regex`, `HtmlType.adapter`.
- **Custom types**: created anywhere with `defineType` or a class and used directly as projection values; registered through the `types` config to become pipes. See [Custom types & casting options](#custom-types--casting-options).
- **Opt-in subsets**: `@bou-co/parsing/types/format`, `types/data`, `types/content`, `types/all`. See [Opt-in type subsets](#opt-in-type-subsets).

Every type casts its value at runtime after variables and transformers have resolved; missing values (`undefined`, `null`, `''`) skip casting and are omitted, unless the type carries a `.default()`, which fills in whenever the field would end up `undefined` and makes it non-optional, or is `.required`, which makes a missing value a failure. Failed casts throw a `ParserCastError` unless `looseCasting` (or a `.loose` token) drops the value instead. See [Types & casting](#types--casting) for the full catalogue and accessor tables.

> **Migration note:** the v2 string identifiers (`title: 'string'`, `items: 'array<string>'`, …) are no longer supported: using one as a projection value throws a migration error at runtime. Other string literals still work as constants. The early v3 release-candidate form `types.array(types.x)` is `types.array.of(types.x)`.

### Utility Functions

#### `defineType(definition)`

Creates a standalone reusable type from a casting function, from a type class (`defineType(SkuType, options?)`), or from a definition object `{ fn, name?, default?, required?, strict?, loose?, extends?, accessors?, methods? }`, with the output type inferred from `fn` (or from `extends`, whose cast runs first and whose accessors are inherited). The result is used directly as a projection value. Exported from both the package root and `@bou-co/parsing/types`. See [Extending types](#extending-types).

```ts
import { defineType } from '@bou-co/parsing/types';

const slug = defineType((value) => {
  if (typeof value !== 'string') throw new Error('Invalid slug');
  return value.toLowerCase().replace(/\s+/g, '-');
});
```

Types hash into cache keys by their implementation source, so caching stays correct when a type changes. When a **factory** creates several types from one function (closures are invisible to hashing), give each a `name` to keep their cache identities apart (the name also shows up in `ParserCastError.type`):

```ts
const scaled = (factor: number) => defineType({ fn: (value) => Number(value) * factor, name: `scaled-${factor}` });
```

#### Casting helpers

Exported from the package root (`isTypeToken`, `isMissing` and `notAPipe` also from `@bou-co/parsing/types`) for code that works with tokens directly:

- `isTypeToken(value)` — type guard for tokens (also recognises tokens from another copy of the library).
- `isMissing(value)` — the engine's definition of missing: `undefined`, `null` or `''`.
- `applyCast(value, token, context?, { fallback? })` — cast with the failure policy applied (missing → default/required, `looseCasting`, `onCastError`, `.strict`/`.loose`); `fallback: true` turns a failure into `undefined` silently, the way a `||` alternative does in a template.
- `buildKeyPath(context)` — the dotted key path a `ParserCastError` reports for a context.
- `notAPipe(factory)` — mark a token-parameter factory (`unique(item)`) so templates never call it.

#### `typed<T>`

Forces TypeScript to infer a specific custom type instead of basic primitives. Used inside projection definitions.

```ts
import { typed } from '@bou-co/parsing';

type CustomValue = { lorem: string };

const myParser = createParser({
  value: typed<CustomValue>,
});
```

#### `condition(when, then)`

Helper to create conditional projection logic structurally, typically used inside `@if`.

```ts
import { condition } from '@bou-co/parsing';

const myParser = createParser({
  '@if': [condition(({ data }) => data.isAdmin, { adminPanelAccess: true })],
});
```

#### `get(path, from?, type?)`

Utility to pick nested properties by dot path (e.g. `get('user.address.street')`) — from the current `context.data` in the curried form, or from any object. With a **type** as the last argument the value is cast **by the engine**, after transformers and pattern resolution and under the active failure policy (`looseCasting`, `onCastError`, `.strict`/`.loose`, `.default`, `.required`), exactly as if the token sat at the projection key. That is how one raw field feeds several outputs:

```ts
import { get } from '@bou-co/parsing';

const myParser = createParser({
  // Resolves from the current context.data
  city: get('user.address.city'),

  // Cast like a token at the key — several outputs from the same raw field
  phoneTitle: get('contact.phoneNumber', types.tel), // '+358 (0)40-123 4567' as written
  phoneLink: get('contact.phoneNumber', types.tel.href), // 'tel:+358401234567'
  mailLink: get('contact.email', types.email.normalized.href), // 'mailto:bob@example.com'

  // Read from an explicit object, cast or not
  themeColor: get('settings.theme.color', externalData), // no casting, as before
  supportLink: get('support.phone', externalData, types.tel.href),

  // Also usable inside value functions
  externalValue: async () => {
    const complexData = await fetchExternalData();
    return await get('settings.theme.color', complexData); // plain value
    // return await get('settings.phone', complexData, types.tel.normalized); // cast, throws on failure
  },
});
```

The output type follows the token (`string | undefined`, non-optional with `.default`/`.required`), a missing source value is omitted or defaulted, and a cast error reports the **projection key** (`at "phoneLink"`). Inside `context.resolve`, `data` is the resolve input, so use the object form there (`get('phone', context.data, types.tel)`). The returned value functions hash by their path and type, so parsers that differ only in a `get` stay distinct in caches. A plain `Promise` is a valid projection value too (`get(path, from)` is one): it is awaited, never cast, and — because it was created when the projection literal was built — resolved once for the life of the parser.

#### `toHash(data)`

Deterministically hashes an object or primitive into a stable string. Useful for generating deterministic cache/storage keys in `initializeParser`. Note that the hash is **key-order sensitive** — same content in a different insertion order produces a different hash, so sort keys first when the input's key order isn't guaranteed:

```ts
import { toHash } from '@bou-co/parsing';

const obj1 = { a: 1, b: 2 };
const obj2 = { b: 2, a: 1 }; // Same content, different order

console.log(toHash(obj1) === toHash(obj2)); // false — insertion order feeds the hash

const stable = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
console.log(toHash(stable(obj1)) === toHash(stable(obj2))); // true
```

#### `useParserValue(data, parser)`

React hook exported from `@bou-co/parsing/react`. Safely resolves async parsers inside React components, returning `{ result, loading, error, revalidate }`. `revalidate(updatedData?)` re-runs the parse on demand: with the latest data by default, or with new data when passed (also bypassing the hook's change detection, e.g. after a mutation you know changed the output).

```tsx
import React from 'react';
import { useParserValue } from '@bou-co/parsing/react';
import { myParser } from './parser';

export const MyComponent = ({ rawProps }) => {
  const { result, loading, error, revalidate } = useParserValue(rawProps, myParser);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div onClick={() => revalidate()}>{result?.title}</div>;
};
```

---

## Comparison with Zod

[Zod](https://zod.dev) is the de-facto standard for TypeScript schema validation, deservedly so. If the question is _"does this data match this schema?"_, Zod answers it superbly, coerces values on the way through, and infers the static type for free.

Bou Parsing asks a different question: _"give me this shape out of that data."_ Validation and casting are in the pipeline, but they are one stage of it. The projection also picks the fields you need, derives new values, runs sub-queries against other systems, resolves templates, and caches expensive work. The design owes more to GraphQL queries and Sanity's GROQ than to validation libraries: the schema is not a description of the input to check, it is a declaration of the output to produce.

The same raw article through both makes the difference concrete:

```ts
// Zod validates that the data matches; the output is the input, now typed
const Article = z.object({ title: z.string(), body: z.string(), authorId: z.string() });
const article = Article.parse(raw);

// Bou Parsing projects the data into what the consumer needs
const articleParser = createParser({
  title: types.string,
  readingTime: ({ data }) => estimateReadingTime(data.body), // derived value
  author: async ({ data }) => await fetchAuthor(data.authorId), // sub-query
});
const article = await articleParser(raw);
```

### Feature overview

| Aspect                              | Zod                                             | Bou Parsing                                                                                                  |
| ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Primary job                         | validate that data matches a schema             | project raw data into a new shape                                                                            |
| Schema style                        | chained builders (`z.object(...)`)              | plain-object projections                                                                                     |
| Validation & casting                | core feature: `z.coerce`, codecs (`z.codec()`)  | final pipeline stage; every `types.*` token casts                                                            |
| Custom types                        | `.refine()`, `.transform()`, `z.custom()`       | `defineType` / `class … extends StringType`, chainable accessors                                             |
| Default values                      | `.default()`                                    | `.default()` / `{ default }`, field becomes non-optional; missing input is never an error unless `.required` |
| Type inference                      | `z.infer<>`, `z.input<>`/`z.output<>`           | inferred from the projection literal                                                                         |
| Composition                         | `.extend()`, `.pick()`, `.omit()`, `.partial()` | `.extend()`, `.flat`, `.asArray`, nested parsers                                                             |
| Conditional shapes                  | unions, `z.discriminatedUnion`                  | `@if`, dynamic projections                                                                                   |
| Recursive schemas                   | first-class, recursive type inference           | lazy value functions, no recursive inference                                                                 |
| Field picking / derived values      | `.pick()` / `.omit()` for shape¹                | the core concept²                                                                                            |
| Async                               | opt-in (`.parseAsync()`)                        | async-native, all keys resolve in parallel                                                                   |
| Error handling                      | full issue array, non-throwing `safeParse`      | throws on first cast failure; `looseCasting`, `onCastError`                                                  |
| Standard Schema & JSON Schema       | implements both                                 | consumes Standard Schema via `schema()` (`types/data`)                                                       |
| Size & performance                  | ~2 kb core, `z.compile()` AOT³                  | parallel resolution, server-side caching                                                                     |
| React                               | via ecosystem resolvers                         | `useParserValue` hook                                                                                        |
| Ecosystem                           | huge, the standard                              | focused; meta-framework level API capabilities                                                               |
| Sub-queries / merging external data | —                                               | `@combine`, value functions, `.flat`                                                                         |
| Context (per-request values)        | —                                               | global / schema / instance levels                                                                            |
| Templating & custom patterns        | —⁴                                              | `{{variables}}`, pipes, pattern API                                                                          |
| Global value transformers           | —⁵                                              | `transformers` config, shipped localize                                                                      |
| Lifecycle hooks                     | —                                               | `before` / `after`                                                                                           |
| Caching                             | —                                               | pluggable storage, whole-parse cache, `context.store`                                                        |
| Schema-less resolution              | —                                               | `resolve()` on plain values                                                                                  |

<sub>¹ Derived values are not the focus; `.transform()` can reshape output.</sub><br>
<sub>² There is no rename directive; renaming happens through value functions or `get('a.b')`.</sub><br>
<sub>³ The AOT fast path does not model `z.coerce.*`.</sub><br>
<sub>⁴ `z.templateLiteral()` validates template-literal types; it does not interpolate strings.</sub><br>
<sub>⁵ Transforms exist per schema (`.transform()`), not globally.</sub>

The Zod column is based on Zod 4.4.3 (August 2026).

### What actually makes the difference

The tail of that table is the point, so here it is in plain words:

- **Sub-queries.** A projection can fetch. `@combine`, async value functions, and nested parsers join other systems mid-parse. This is the GraphQL/GROQ heritage.
- **Context.** Three merged levels (global, schema, instance), `withContext`, and the `parent` chain, typed via module augmentation. Per-request locale and user reach every value function without threading arguments through the call stack.
- **Templating.** Variables with `||` fallbacks and `|` pipes, plus a full pattern API for your own inline syntaxes: custom delimiters, custom regex, rescan control, per-pattern cache modes.
- **Transformers.** Global value hooks that reshape matching values anywhere in the data. A ready localize transformer ships at `@bou-co/parsing/templates/localize`.
- **Caching.** Pluggable storage backends, whole-parse caching, and per-value `context.store` with in-flight dedup: concurrent calls for the same key share one request.
- **Resolving without a projection.** `resolve()` runs transformers and patterns on plain values, no schema needed.

None of this comes from plugins. Everything is core API built on the same context system, so when the built-ins are not enough, you extend the same machinery yourself instead of hunting for third-party packages. That is what "meta-framework level API capabilities" means in the table above.

To be equally clear about the other direction, Zod has things Bou Parsing does not. It implements the Standard Schema spec, so it drops straight into tRPC, TanStack Form, and anything else that speaks it (Bou Parsing sits on the other side of that contract: `schema(zodSchema)` consumes any Standard Schema inside a projection). It converts schemas to JSON Schema (fed by its metadata registries), reports every problem at once through `ZodError` and the non-throwing `safeParse`, and its ~2 kb core with AOT-compiled hot paths is hard to beat when validation is all you need. Leaf-level chaining (`types.string.default('x')`) does not change the contrast in schema style: the projection itself is still a plain object, and chaining only ever configures one leaf.

### Which one to use

- **Lean towards Zod** when you are validating untrusted input at a boundary: form submissions, request bodies, environment variables. Same if you need JSON Schema output or the ecosystem around it (tRPC, react-hook-form, and friends).
- **Lean towards Bou Parsing** in the data layer: shaping CMS content, aggregating multiple APIs on the server, computing or fetching per-field values, templating editor content, caching the results.
- **They compose**, as an API rather than advice. Validate a request body with Zod at the edge, then project it (and everything it references) onward with a parser; or drop a Zod schema straight into a projection with `schema()` where a field genuinely needs schema validation. Use Zod when the output you want is an error report; lean on Bou Parsing when the output is the data your UI renders.

---

## Agent skills

The package ships with agent skills — instruction folders (`SKILL.md` + reference docs) that teach AI coding agents such as Claude Code how to work with the library:

- **`bou-parsing`** — how to use the library: projections, types, variables, caching, gotchas.
- **`bou-parsing-v2-to-v3-migration`** — how to migrate a codebase from V2 to V3.

Copy them into your repo with:

```bash
npx @bou-co/parsing add-skills                 # interactive selection
npx @bou-co/parsing add-skills --all           # copy every skill
npx @bou-co/parsing add-skills bou-parsing     # copy by name
npx @bou-co/parsing add-skills --all --dir some/path   # custom destination
```

By default skills are copied into `.claude/skills/`, where Claude Code picks them up automatically. Re-running the command overwrites previously copied skills, so run it again after updating the package.

---

## Maintainers

Developed and maintained by the [Bou](https://wearebou.com/) team.

- Teemu Lahjalahti
- Anne Kokkonen
- Richard Grosjean
