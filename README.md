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
- **Type casting**: declared types are enforced at runtime: `types.number` turns `'21'` into `21`, with strict or loose failure handling
- **Custom types**: define reusable validation/casting types (emails, slugs, date shapes) once, use them like built-ins
- **Value transformation**: sync or async functions, static constants, derived values
- **Nested structures**: objects, arrays, and reusable sub-parsers compose naturally
- **Conditional fields**: `@if` blocks add or override fields based on runtime conditions
- **Data merging**: `@combine` fetches secondary data and merges it into the output
- **Variable interpolation**: `{{variable}}` templates with fallbacks, pipes, and async resolvers
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
    - [Default values](#default-values)
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
    - [Loose casting](#loose-casting)
    - [Strict types](#strict-types)
  - [Multiple parser configurations](#multiple-parser-configurations)
  - [Merging data](#merging-data)
  - [Variables](#variables)
    - [Dynamic Variable Resolvers](#dynamic-variable-resolvers)
  - [Expressions & pipes](#expressions--pipes)
    - [Fallbacks & literals](#fallbacks--literals)
    - [Pipes](#pipes)
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
  - [CMS Content Templating with Variables](#cms-content-templating-with-variables)
  - [CMS Dynamic Variables with On-Demand Fetching & Caching](#cms-dynamic-variables-with-on-demand-fetching--caching)
  - [Advanced TypeScript Generation & Utilities](#advanced-typescript-generation--utilities)
  - [Global Localization via Transformers](#global-localization-via-transformers)
  - [Client-Side React Integration](#client-side-react-integration)
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

### 2 - Initialize the parser

In the root level of your code, run the `initializeParser` function to export your tailored `createParser` function and `types` object. This allows you to set up global configurations like caching and variables once. The returned `resolve` function runs the same variable and transformer resolution on hard-coded values without a projection. See [Resolving values without parsing](#resolving-values-without-parsing).

```ts
// parser-config.ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser, resolve, types } = initializeParser(/** Global configurations come here **/);
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

The `types` object with all built-ins is returned by `initializeParser`. Re-export it from your parser config alongside `createParser` (as shown in [Get Started](#get-started)). The same built-ins are also individually importable from the tree-shakeable `@bou-co/parsing/types` entry point, which is ideal for standalone type files. Custom types are created with `defineType` and used directly in projections, no registration involved. See [Custom types & casting options](#custom-types--casting-options).

```ts
import { createParser, types } from '../path-to/parser-config';

const myParser = createParser({
  age: types.number,
  active: types.boolean,
  published: types.date,
  tags: types.array(types.string),
});

const result = await myParser({
  age: '21', // numeric string
  active: 'true', // boolean-like string
  published: '2026-01-01', // date string
  tags: ['ts', 42], // mixed array
});

/* Result:
{
  "age": 21,
  "active": true,
  "published": Date('2026-01-01T00:00:00.000Z'),
  "tags": ["ts", "42"]
}
*/
```

The built-in types cast conservatively: only lossless, unambiguous conversions are performed.

| Type                          | Accepted inputs                                                                       | Fails on                          |
| ----------------------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| `types.string`                | strings; finite numbers, booleans (`String(value)`); valid dates (ISO string)         | objects, arrays, `NaN`/`Infinity` |
| `types.number`                | numbers; booleans (`1`/`0`); dates (`getTime()`); numeric strings (`'12.5'`, `'1e3'`) | `''`, `'12px'`, objects           |
| `types.boolean`               | booleans; `1`/`0`; `'true'`/`'false'` (case-insensitive)                              | other numbers/strings             |
| `types.date`                  | `Date` instances; parseable date strings and epoch numbers                            | unparseable values                |
| `types.object`                | plain objects (validated, passed through)                                             | arrays, primitives                |
| `types.array`                 | arrays (passed through); `types.array(types.x)` also casts each item                  | non-arrays                        |
| `types.any` / `types.unknown` | anything (pure pass-through, never fails)                                             | —                                 |

`undefined` and `null` values always skip casting and are omitted from the output, so declared fields stay optional. When a present value cannot be cast, the parser throws a `ParserCastError` by default. See [Custom types & casting options](#custom-types--casting-options) for loose modes and defining your own types.

#### Default values

Every type accepts an options object with a `default`, used whenever the field would otherwise end up `undefined`: missing input (`undefined`/`null`) as well as failed casts resolved to `undefined` under `looseCasting: 'undefined'`. A field with a default is therefore never `undefined`, and its inferred output type is non-optional:

```ts
const myParser = createParser({
  title: types.string, // → string | undefined
  displayName: types.string({ default: 'List item' }), // → string
  retries: types.number({ default: 0 }), // → number
  tags: types.array(types.string)({ default: [] }), // → string[]
});
```

The default is returned as-is (it is not cast; TypeScript already enforces it matches the output type) and also works with `defineType` via the object form: `defineType({ fn, default })`. It never masks hard failures: without `looseCasting`, a present-but-invalid value still throws, and `strict` types always do.

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
    theme: types.string({ default: 'light' }), // default, always present
    description: types.string, // needs data, omitted without it
  },
});

const result = await myParser({ title: 'Hello' });
// → { title: 'Hello', meta: { version: 3, theme: 'light' } }
```

The rules that keep this predictable:

- **Empty results are omitted.** If everything inside a nested projection depended on the missing data, the resolved object has no keys and the key is dropped entirely, so purely data-mapping projections keep their omit behavior. This cascades naturally through deep nesting.
- **Arrays are never conjured without data.** Projections marked `'@array': true`, array literals, and `parser.asArray` values keep requiring array input.
- **The incoming value stays reachable.** During projection-driven resolution `context.data` is an empty object, and the original value (if any) is available through `context.parent.data`.
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

Create your own types with `defineType`: a casting function `(value, context) => output` (sync or async) that returns the cast value or throws when the input is invalid. The result is a type token used **directly** in projections; there is no registration step, and one-off types are perfectly fine:

```ts
// my-types.ts, a standalone types file, no parser needed
import { array, number, defineType } from '@bou-co/parsing/types';

export const email = defineType(async (value, context) => {
  if (typeof value !== 'string') throw new Error('Invalid email (not a string)');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value)) throw new Error('Invalid email (not a valid email format)');

  return value;
});

export const dmy = defineType(async (value, context) => {
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (isNaN(date.getTime())) throw new Error('Invalid date (not a valid date format)');
  return { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() };
});

// reusable combinations are just values too
export const numbers = array(number); // → number[]
```

```ts
import { createParser } from '../path-to/parser-config';
import { email, dmy, numbers } from '../path-to/my-types';

const myParser = createParser({
  email, // → string
  date: dmy, // → { day: number; month: number; year: number }
  scores: numbers, // → number[]
});
```

The `@bou-co/parsing/types` entry point exports every built-in token individually (`string`, `number`, `boolean`, `date`, `object`, `array`, `any`, `unknown`) plus `defineType`, is tree-shakeable, and never pulls in the parser engine, so shared type files stay lightweight and work with any parser configuration.

#### Loose casting

By default a failed cast throws a `ParserCastError` (with the failing key path, target type, and received value). Set `looseCasting` to relax this globally, or per parser / per call, since it is a regular context option:

```ts
export const { createParser, types } = initializeParser({
  looseCasting: true, // default is false: pass the original value through and log a warning
});
```

```ts
export const { createParser, types } = initializeParser({
  looseCasting: 'undefined', // return undefined instead (the key is omitted from the output)
});
```

> Note: with `looseCasting: true` the declared output types become best-effort: the runtime may pass through an uncast original value that TypeScript still types as the declared type. Use `'undefined'` if the output types should stay fully honest (the fields are optional in the inferred type anyway).

To observe cast failures (e.g. for telemetry) instead of relying on the console warning, register an `onCastError` callback. It receives the `ParserCastError` (with `path`, `type`, and `received`) before the failure policy is applied, and replaces the default warning when set. Like `looseCasting`, it can be set globally, per parser, or per call.

```ts
export const { createParser, types } = initializeParser({
  looseCasting: true,
  onCastError: (error) => telemetry.report('parser-cast-error', { path: error.path, type: error.type }),
});
```

#### Strict types

A type marked `strict` always throws on failure, even when `looseCasting` is enabled. Use it for values where silently passing bad data through is never acceptable. Pass an object definition `{ fn, strict }` to `defineType`:

```ts
import { defineType } from '@bou-co/parsing/types';

export const hexColor = defineType({
  fn: (value) => {
    if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Invalid hex color');
    return value;
  },
  strict: true,
});

// createParser({ brandColor: hexColor }) throws on bad input even under looseCasting: true
```

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
  looseCasting: 'undefined', // render what we can, drop what we can't
});
```

Parsers stay permanently bound to the engine that created them. Nesting a parser from one configuration inside another keeps its own transformers, storage, and variables for the nested parse, while parent context values still merge down. Since type tokens carry their casting implementation, projections and type files are freely shareable across configurations.

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

#### Dynamic Variable Resolvers

Instead of defining every possible variable upfront, `variableResolver` allows you to dynamically intercept and resolve variables by their exact name when they are encountered. This is useful for catching wildcards, fetching data on-demand from a database, or handling dynamic keys.

```ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser, types } = initializeParser(() => ({
  variableResolver: async (variableName, context) => {
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

### Expressions & pipes

Everything between the delimiters of a variable (`{{ here }}`) is an **expression**, and the same grammar is shared by any custom [pattern](#patterns) that declares its own delimiters. Expressions stay deliberately small: fallback chains, literals, and a single pipe. No loops, no conditionals, no arbitrary code.

#### Fallbacks & literals

Chain candidates with `||`; they evaluate left to right and the first **defined** value wins. Only `undefined` falls through: `false`, `0`, and `''` are valid results and stop the chain.

Literals can appear as fallback candidates or as pipe parameters:

- **Strings** in double quotes: `"Guest"`
- **Numbers** (integers): `42`
- **Booleans**: `true` / `false`

A literal in the value position is returned exactly as written. A pipe after a literal does not apply.

```ts
const rawDataFromCMS = {
  greeting: 'Hello {{user.name || "Guest"}}!',
  discount: '{{campaign.discount || 0}}% off',
  banner: '{{flags.showBanner || false}}',
};
```

#### Pipes

A pipe transforms the resolved value inline: `{{value | pipe}}`, or with parameters, `{{value | pipe:param1:param2}}`. One pipe per expression. Parameters may be literals or variable names (resolved from `variables`).

Pipe functions are plain value functions registered under the `pipes` config, at the global, schema, or instance level, exactly like variables, with the more specific level winning on a name collision. Each pipe is called with the parser context, where `data` (and `value`) is the resolved value being piped and `params` holds the parsed parameters:

```ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser, types } = initializeParser({
  variables: {
    user: { firstName: 'john' },
  },
  pipes: {
    uppercase: ({ data }) => String(data).toUpperCase(),
    truncate: ({ data, params: [length = 50] = [] }) => String(data).slice(0, length),
  },
});

const parser = createParser({ user: types.string, teaser: types.string });

const result = await parser({
  user: 'Hello {{user.firstName || "Guest" | uppercase}}!',
  teaser: '{{article.teaser | truncate:120}}',
});

/* result.user === 'Hello JOHN!' */
```

When a value resolves to `undefined`, its pipe is skipped and the fallback chain moves on; set `pipeUndefined: true` in the context to run pipes on `undefined` values anyway.

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

Because a half-working grammar would be worse than none, setting `expressions: true` on a token pattern **throws at setup** with guidance instead of silently misbehaving. Delimited patterns can opt out with `expressions: false` (the raw captured text then arrives as `path`, untouched). Declaring both `delimiters` and a custom `match` is allowed for fine-tuning: your regex wins (first capture group is the expression) while the delimiters vouch that its capture is bounded. This is exactly how the built-in variables pattern is defined.

Beyond that, the engine owns everything that isn't the lookup itself: scanning, deduplication, splicing, parallel resolution, re-scanning, and cycle protection. Your `resolve` only turns a path into a value.

Rules worth knowing:

- **Full-string matches return the raw value.** When a string consists solely of one match, the resolved value is returned untouched: objects, numbers, and arrays survive, and an object result can feed a nested projection.
- **Precedence:** overlapping matches resolve longest-first, then by registration order (the built-in `variables` pattern registers first).
- **Escaping:** a backslash directly before a match suppresses it and is consumed: `\{{foo}}` outputs `{{foo}}`, and `\\{{foo}}` outputs a literal backslash followed by the resolved value. Uniform across all patterns.
- **Re-scanning & cycles:** resolved string output is scanned again by all patterns (opt out per pattern with `rescan: false`). Cycles throw `ParserPatternCycleError` instead of hanging.
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
      if (!context.cache.name) throw new Error('Caching options must include a name');
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

## API Reference

### Core Functions

#### `initializeParser(config?)`

Initializes an isolated parsing engine with global settings (loose casting, transformers, patterns, pipes, storage caching, variables, lifecycle hooks).

- **Returns:** `{ createParser, resolve, types }`, where `types` contains the built-in casting types.

#### `createParser(projection, options?)`

Creates an executable parser function based on the provided schema projection.

- **Returns:** An asynchronous parsing function that takes `(rawData, contextOverride?)`.
- **Methods:** `.extend(newProjection)`, `.withContext(newContext)`

#### `resolve(input, contextOverride?)`

Resolves variables and applies global transformers on raw input (an object, array, plain string, or function) without a projection, casting, or hooks. Transformers apply at every nesting level, and functions are invoked with the parser context and resolved recursively. See [Resolving values without parsing](#resolving-values-without-parsing).

- **Returns:** A promise of the resolved input, typed from the input shape; an explicit generic always overrides the inferred type (e.g. when a transformer reshapes values).

### Context Object (`ParserContext`)

The `context` object is passed to all dynamic resolver functions in your projection. It contains the raw data, some info about current execution and custom properties.

- **`data`**: The raw input data at the currently executing nested level. During projection-driven resolution (no matching input for a nested projection) this is an empty object; the parent's value remains available via `context.parent.data`.
- **`value`**: The raw incoming data value at the current key (`data?.[key]`), so `({ value }) => value * 5` replaces `({ data, key }) => data[key] * 5`. Never resolved eagerly: a `"{{variable}}"` string arrives as-is; call `resolve()` with no arguments to resolve it on demand. `undefined` during projection-driven resolution. Inside transformers and pipes, `value` mirrors `data` (the candidate value being processed).
- **`variables`**: A merged dictionary of global, schema, and instance variables, including a `current` reference to the input data. Used automatically in string template replacement. See [Variables](#variables).
- **`pipes`**: A merged dictionary of global, schema, and instance pipe functions, available to every pattern with expressions enabled. See [Patterns](#patterns).
- **`key`**: The string key of the property currently being evaluated.
- **`index`**: The numeric index if the current data is being evaluated inside an array. See [Nested Arrays](#nested-data-structures).
- **`isRoot`**: A boolean indicating if this is the top-level execution of the parser.
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
- **`@combine`**: Accepts an async function returning an object. Merges the returned object directly into the current parsed output. Useful for fetching secondary datasets. See [Merging Data](#merging-data).
- **`@array`**: When set to `true` at the root of a nested projection, signals the parser to iterate over the input data as an array and apply the remaining properties to each item. See [Nested Arrays](#nested-data-structures).
- **`parser.flat`**: Not a key but a projection value. It parses the data under its key with the given parser and merges the result into the parent output, dropping the key. See [Flattening nested parsers](#flattening-nested-parsers-with-flat).

### Built-in Types

The `types` object (returned by `initializeParser` and also available as individual named exports from the tree-shakeable `@bou-co/parsing/types` entry point) provides casting types for standard properties:

- **Primitives**: `types.string`, `types.number`, `types.boolean`, `types.date`, `types.object`, `types.any`, `types.unknown`.
- **Arrays**: `types.array` (pass-through validation) or per-item casting via `types.array(types.string)`, `types.array(types.number)`, including nesting (`types.array(types.array(types.number))`).
- **Custom types**: created anywhere with `defineType` and used directly as projection values. See [Custom types & casting options](#custom-types--casting-options).

Every type casts its value at runtime after variables and transformers have resolved; `undefined`/`null` values skip casting and are omitted, unless the type carries a `default` (`types.string({ default: 'x' })`), which fills in whenever the field would end up `undefined` and makes it non-optional. Failed casts throw a `ParserCastError` unless `looseCasting` allows them through. See [Types & casting](#types--casting) for the full casting table and [Default values](#default-values).

> **Migration note:** the v2 string identifiers (`title: 'string'`, `items: 'array<string>'`, …) are no longer supported: using one as a projection value throws a migration error at runtime. Other string literals still work as constants.

### Utility Functions

#### `defineType(definition)`

Creates a standalone reusable type from a casting function or `{ fn, strict?, name?, default? }` object, with the output type inferred from `fn`. The result is used directly as a projection value. Exported from both the package root and `@bou-co/parsing/types`.

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

#### `get(path, from?)`

Utility to easily pick nested string properties (e.g. `get('user.address.street')`) when writing custom value resolver functions.

```ts
import { get } from '@bou-co/parsing';

const myParser = createParser({
  // Automatically resolves from the current context.data
  city: get('user.address.city'),

  // Can also be used to query arbitrary objects manually
  externalValue: async () => {
    const complexData = await fetchExternalData();
    return await get('settings.theme.color', complexData);
  },
});
```

#### `toHash(data)`

Deterministically hashes an object or primitive into a stable string. Useful for generating deterministic cache/storage keys in `initializeParser`.

```ts
import { toHash } from '@bou-co/parsing';

const obj1 = { a: 1, b: 2 };
const obj2 = { b: 2, a: 1 }; // Same content, different order

console.log(toHash(obj1) === toHash(obj2)); // true
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

| Aspect                              | Zod                                             | Bou Parsing                                                 |
| ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Primary job                         | validate that data matches a schema             | project raw data into a new shape                           |
| Schema style                        | chained builders (`z.object(...)`)              | plain-object projections                                    |
| Validation & casting                | core feature: `z.coerce`, codecs (`z.codec()`)  | final pipeline stage; every `types.*` token casts           |
| Custom types                        | `.refine()`, `.transform()`, `z.custom()`       | `defineType` (sync/async, `strict`)                         |
| Default values                      | `.default()`                                    | `types.x({ default })`, field becomes non-optional          |
| Type inference                      | `z.infer<>`, `z.input<>`/`z.output<>`           | inferred from the projection literal                        |
| Composition                         | `.extend()`, `.pick()`, `.omit()`, `.partial()` | `.extend()`, `.flat`, `.asArray`, nested parsers            |
| Conditional shapes                  | unions, `z.discriminatedUnion`                  | `@if`, dynamic projections                                  |
| Recursive schemas                   | first-class, recursive type inference           | lazy value functions, no recursive inference                |
| Field picking / derived values      | `.pick()` / `.omit()` for shape¹                | the core concept²                                           |
| Async                               | opt-in (`.parseAsync()`)                        | async-native, all keys resolve in parallel                  |
| Error handling                      | full issue array, non-throwing `safeParse`      | throws on first cast failure; `looseCasting`, `onCastError` |
| Standard Schema & JSON Schema       | implements both                                 | —                                                           |
| Size & performance                  | ~2 kb core, `z.compile()` AOT³                  | parallel resolution, server-side caching                    |
| React                               | via ecosystem resolvers                         | `useParserValue` hook                                       |
| Ecosystem                           | huge, the standard                              | focused; meta-framework level API capabilities              |
| Sub-queries / merging external data | —                                               | `@combine`, value functions, `.flat`                        |
| Context (per-request values)        | —                                               | global / schema / instance levels                           |
| Templating & custom patterns        | —⁴                                              | `{{variables}}`, pipes, pattern API                         |
| Global value transformers           | —⁵                                              | `transformers` config, shipped localize                     |
| Lifecycle hooks                     | —                                               | `before` / `after`                                          |
| Caching                             | —                                               | pluggable storage, whole-parse cache, `context.store`       |
| Schema-less resolution              | —                                               | `resolve()` on plain values                                 |

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

To be equally clear about the other direction, Zod has things Bou Parsing does not. It implements the Standard Schema spec, so it drops straight into tRPC, TanStack Form, and anything else that speaks it. It converts schemas to JSON Schema (fed by its metadata registries), reports every problem at once through `ZodError` and the non-throwing `safeParse`, and its ~2 kb core with AOT-compiled hot paths is hard to beat when validation is all you need.

### Which one to use

- **Lean towards Zod** when you are validating untrusted input at a boundary: form submissions, request bodies, environment variables. Same if you need JSON Schema output or the ecosystem around it (tRPC, react-hook-form, and friends).
- **Lean towards Bou Parsing** in the data layer: shaping CMS content, aggregating multiple APIs on the server, computing or fetching per-field values, templating editor content, caching the results.
- **They compose.** Validate a request body with Zod at the edge, then project it (and everything it references) onward with a parser. Use Zod when the output you want is an error report; lean on Bou Parsing when the output is the data your UI renders.

---

## Maintainers

Developed and maintained by the [Bou](https://bou.co/) team.

- Teemu Lahjalahti
- Anne Kokkonen
- Richard Grosjean
