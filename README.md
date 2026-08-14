# Bou Parsing

`@bou-co/parsing` is a TypeScript library for picking, validating, and transforming data from a declarative schema. Define the shape you want. Run the parser. Get back a typed result — async-native, no boilerplate, no manual type-writing.

It's isomorphic and works in the browser. **The stronger case is on the server** — in Next.js App Router, Astro, NestJS, or Express — where you can fetch massive API responses, run expensive computations, parse them into exact type-safe structures, cache the result, and send the frontend only what it needs. Less database load, less network payload, cleaner components.

The central concept is a **projection** — a plain object that maps input keys to output rules. Rules can be casting types (`types.string`, `types.number`, …), literal constants, plain functions, async functions, nested projections, or other parsers. The library walks the projection, resolves every rule against your raw data in parallel, and returns a strictly-typed output object whose TypeScript type is inferred automatically from the schema — no hand-written interfaces required.

Key capabilities at a glance:

- **Field picking** — select only the keys you need from any input shape
- **Type casting** — declared types are enforced at runtime: `types.number` turns `'21'` into `21`, with strict or loose failure handling
- **Custom types** — define reusable validation/casting types (emails, slugs, date shapes) once, use them like built-ins
- **Value transformation** — sync or async functions, static constants, derived values
- **Nested structures** — objects, arrays, and reusable sub-parsers compose naturally
- **Conditional fields** — `@if` blocks add or override fields based on runtime conditions
- **Data merging** — `@combine` fetches secondary data and merges it into the output
- **Variable interpolation** — `{{variable}}` templates with fallbacks, pipes, and async resolvers
- **Transformers** — global hooks that auto-convert matching values (e.g. localisation objects)
- **Lifecycle hooks** — `before`/`after` callbacks for shared context setup and post-processing
- **Server-side caching** — pluggable storage (Redis, etc.) with deterministic cache-key generation
- **TypeScript inference** — output types derived entirely from the projection literal, no generics to write

[NPM](https://www.npmjs.com/package/@bou-co/parsing) | [GitHub](https://github.com/bou-co/parsing)

## Table of Contents

- [Get Started](#get-started)
- [Basic Usage](#basic-usage)
  - [Defining the data you want](#defining-the-data-you-want)
  - [Types & casting](#types--casting)
  - [Adding and modifying values](#adding-and-modifying-values)
  - [Nested data structures](#nested-data-structures)
  - [Conditional data](#conditional-data)
- [Advanced Usage](#advanced-usage)
  - [Custom types & casting options](#custom-types--casting-options)
  - [Multiple parser configurations](#multiple-parser-configurations)
  - [Merging data](#merging-data)
  - [Variables](#variables)
  - [Dynamic projections](#dynamic-projections)
  - [Extending parsers](#extending-parsers)
  - [Context overriding](#context-overriding)
  - [Lifecycle hooks](#lifecycle-hooks)
  - [Transformers](#transformers)
  - [Chaining parsers (Reparsing)](#chaining-parsers-reparsing)
- [Examples & Use Cases](#examples--use-cases)
  - [Next.js App Router & Server Components](#nextjs-app-router--server-components)
  - [Server-Side Data Fetching & Caching](#server-side-data-fetching--caching)
  - [CMS Content Templating with Variables](#cms-content-templating-with-variables)
  - [Advanced TypeScript Generation & Utilities](#advanced-typescript-generation--utilities)
  - [Global Localization via Transformers](#global-localization-via-transformers)
  - [Client-Side React Integration](#client-side-react-integration)
- [API Reference](#api-reference)
- [Maintainers](#maintainers)

---

## Get Started

### 1 - Install the package

Install the Bou Parsing package from NPM. It supports all frameworks.

```bash
npm i @bou-co/parsing
```

### 2 - Initialize the parser

In the root level of your code, run the `initializeParser` function to export your tailored `createParser` function and `types` object. This allows you to set up global configurations like caching and variables once.

```ts
// parser-config.ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser, types } = initializeParser(/** Global configurations comes here **/);
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

Every `types.*` entry both **types** the output and **casts** the value at runtime — the declared type is guaranteed in the result, not just suggested to TypeScript.

The `types` object with all built-ins is returned by `initializeParser` — re-export it from your parser config alongside `createParser` (as shown in [Get Started](#get-started)). The same built-ins are also individually importable from the tree-shakeable `@bou-co/parsing/types` entry point, which is ideal for standalone type files. Custom types are created with `defineType` and used directly in projections — no registration involved. See [Custom types & casting options](#custom-types--casting-options).

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

The built-in types cast conservatively — only lossless, unambiguous conversions are performed:

| Type                          | Accepted inputs                                                                             | Fails on                          |
| ----------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------- |
| `types.string`                | strings; finite numbers, booleans (`String(value)`); valid dates (ISO string)               | objects, arrays, `NaN`/`Infinity` |
| `types.number`                | numbers; booleans (`1`/`0`); dates (`getTime()`); whole numeric strings (`'12.5'`, `'1e3'`) | `''`, `'12px'`, objects           |
| `types.boolean`               | booleans; `1`/`0`; `'true'`/`'false'` (case-insensitive)                                    | other numbers/strings             |
| `types.date`                  | `Date` instances; parseable date strings and epoch numbers                                  | unparseable values                |
| `types.object`                | plain objects (validated, passed through)                                                   | arrays, primitives                |
| `types.array`                 | arrays (passed through); `types.array(types.x)` also casts each item                        | non-arrays                        |
| `types.any` / `types.unknown` | anything — pure pass-through, never fails                                                   | —                                 |

`undefined` and `null` values always skip casting and are omitted from the output, so declared fields stay optional. When a present value cannot be cast, the parser throws a `ParserCastError` by default — see [Custom types & casting options](#custom-types--casting-options) for loose modes and defining your own types.

#### Default values

Every type accepts an options object with a `default`, used whenever the field would otherwise end up `undefined` — missing input (`undefined`/`null`) as well as failed casts resolved to `undefined` under `looseCasting: 'undefined'`. A field with a default is therefore never `undefined`, and its inferred output type is non-optional:

```ts
const myParser = createParser({
  title: types.string, // → string | undefined
  displayName: types.string({ default: 'List item' }), // → string
  retries: types.number({ default: 0 }), // → number
  tags: types.array(types.string)({ default: [] }), // → string[]
});
```

The default is returned as-is (it is not cast — TypeScript already enforces it matches the output type) and also works with `defineType` via the object form: `defineType({ fn, default })`. It never masks hard failures: without `looseCasting`, a present-but-invalid value still throws, and `strict` types always do.

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

Nested projections resolve from the schema, not from the shape of the incoming data. When the input lacks a key (or holds a scalar that cannot feed an object projection — `null`, `0`, `''`, `false`, `5`), the nested projection still resolves: constants, value functions, type-token defaults, `@combine`, and `@if` inside it all produce output as usual.

```ts
const myParser = createParser({
  title: types.string,
  meta: {
    version: 3, // constant — always present
    theme: types.string({ default: 'light' }), // default — always present
    description: types.string, // needs data — omitted without it
  },
});

const result = await myParser({ title: 'Hello' });
// → { title: 'Hello', meta: { version: 3, theme: 'light' } }
```

The rules that keep this predictable:

- **Empty results are omitted.** If everything inside a nested projection depended on the missing data, the resolved object has no keys and the key is dropped entirely — purely data-mapping projections keep their omit behavior. This cascades naturally through deep nesting.
- **Arrays are never conjured without data.** Projections marked `'@array': true`, array literals, and `parser.asArray` values keep requiring array input.
- **The incoming value stays reachable.** During projection-driven resolution `context.data` is an empty object, and the original value (if any) is available through `context.parent.data`.
- **Recursive schemas terminate.** A parser that references itself (directly or mutually) stops at the first repeat: the cycle is resolved once more with its data-independent fields, then cut.
- **Opting out is a one-liner.** A value function can make any nested parser data-driven again: `child: ({ data }) => (data['child'] ? childParser : undefined)`.

Note that value functions and `@combine` resolvers inside nested projections now run even when the key is absent from the data — including any API fetches or `context.store` calls they make.

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

`.flat` is the composable sibling of the `@combine` directive and behaves the same way: merged fields override same-named regular keys and they are typed as optional in the output. With missing input the sub-parser resolves projection-driven — data-independent fields (constants, defaults) still merge; if nothing resolves, nothing is merged. The result must be an object — using `.flat` on array data throws.

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

## Advanced Usage

### Custom types & casting options

Create your own types with `defineType` — a casting function `(value, context) => output` (sync or async) that returns the cast value or throws when the input is invalid. The result is a type token used **directly** in projections; there is no registration step, and one-off types are perfectly fine:

```ts
// my-types.ts — a standalone types file, no parser needed
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

The `@bou-co/parsing/types` entry point exports every built-in token individually (`string`, `number`, `boolean`, `date`, `object`, `array`, `any`, `unknown`) plus `defineType`, is tree-shakeable, and never pulls in the parser engine — so shared type files stay lightweight and work with any parser configuration.

#### Loose casting

By default a failed cast throws a `ParserCastError` (with the failing key path, target type, and received value). Set `looseCasting` to relax this globally — or per parser / per call, since it is a regular context option:

```ts
export const { createParser, types } = initializeParser({
  looseCasting: true, // default is false — pass the original value through and log a warning
});
```

```ts
export const { createParser, types } = initializeParser({
  looseCasting: 'undefined', // return undefined instead (the key is omitted from the output)
});
```

> Note: with `looseCasting: true` the declared output types become best-effort — the runtime may pass through an uncast original value that TypeScript still types as the declared type. Use `'undefined'` if the output types should stay fully honest (the fields are optional in the inferred type anyway).

To observe cast failures (e.g. for telemetry) instead of relying on the console warning, register an `onCastError` callback. It receives the `ParserCastError` (with `path`, `type`, and `received`) before the failure policy is applied, and replaces the default warning when set. Like `looseCasting`, it can be set globally, per parser, or per call.

```ts
export const { createParser, types } = initializeParser({
  looseCasting: true,
  onCastError: (error) => telemetry.report('parser-cast-error', { path: error.path, type: error.type }),
});
```

#### Strict types

A type marked `strict` always throws on failure, even when `looseCasting` is enabled — for values where silently passing bad data through is never acceptable. Pass an object definition `{ fn, strict }` to `defineType`:

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

Each `initializeParser` call creates a fully isolated parser engine — its own variables, casting options (`looseCasting`/`onCastError`), transformers, lifecycle hooks, and caches/storage. This makes it possible to run separate configurations in one app, for example a strict server setup with Redis-backed caching next to a lenient client setup:

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

Parsers stay permanently bound to the engine that created them — nesting a parser from one configuration inside another keeps its own transformers, storage, and variables for the nested parse, while parent context values still merge down. Since type tokens carry their casting implementation, projections and type files are freely shareable across configurations.

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

> Tip: when the data you want to merge already lives under a key and has its own parser, use [`.flat`](#flattening-nested-parsers-with-flat) instead of a `@combine` resolver — same merge behavior, composed declaratively.

### Variables

Variables provide advanced template logic for string values coming from raw data. They allow content editors (e.g., in a CMS) to use dynamic data without requiring coders to build an entire EJS or templating engine.

Variables support:

- **Functions:** Resolve dynamic data (e.g., `currentYear: () => new Date().getFullYear()`).
- **Async Execution:** Fetch variable values from a DB or CMS dynamically.
- **Deep object resolution:** Access nested properties using dot notation (e.g., `{{user.address.city}}`).
- **Fallbacks:** Chain variable checks (e.g., `{{user.name || "Guest"}}` or `{{score || 0}}`).
- **Pipes:** Transform output values inline (e.g., `{{date | toDateString}}` or `{{title | uppercase}}`).

```ts
// 1. Global Setup (in parser-config.ts)
import { initializeParser } from '@bou-co/parsing';

export const { createParser, types } = initializeParser(() => ({
  variables: {
    currentYear: () => new Date().getFullYear(),
    uppercase: ({ data }) => String(data).toUpperCase(),
  },
}));

// 2. Usage
import { createParser, types } from '../path-to/parser-config';

// Imagine this string comes directly from database or CMS
const rawDataFromApi = {
  title: 'Copyright {{currentYear}}',
  user: 'Hello {{user.firstName || "Guest" | uppercase}}!',
};

const myParser = createParser({
  title: types.string,
  user: types.string,
});

// Provide instance variables overriding or supplementing global ones
const instanceData = {
  variables: {
    user: { firstName: 'john' },
  },
};

const result = await myParser(rawDataFromApi, instanceData);

/* Result:
{
  "title": "Copyright 2026",
  "user": "Hello JOHN!"
}
*/
```

#### Dynamic Variable Resolvers

Instead of defining every possible variable upfront, `variableResolver` allows you to dynamically intercept and resolve variables by their exact name when they are encountered. This is incredibly powerful for catching wildcards, fetching data on-demand from a database, or handling dynamic keys.

```ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser, types } = initializeParser(() => ({
  variableResolver: async (variableName, context) => {
    // Dynamically catch variables named 'userName'
    if (variableName === 'userName') {
      const { userId } = context.data; //

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

Merge a new projection onto an existing parser securely without mutating the original definition.

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

Transformers run conditionally globally against properties. Helpful for automatic data morphing based on context.

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
  const { title, content, authorBadge } = await articleBlockParser(initialProps);

  return (
    <article>
      <h1>{title}</h1>
      {/* Pass the fully parsed and typed `author` object to the child component */}
      <AuthorBadge {...authorBadge} />
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

**Why:** Whole-parse caching (above) keys on the full input data — but often a single value function makes an expensive async request whose result is shared across many different parses (e.g. fetching a referenced author). `context.store` caches individual computations through the same globally configured `storage`.

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

- Caches whenever a global `storage` is configured — **independent of `cache.enabled`** (calling `store` is the opt-in).
- With no storage configured (e.g. client-side) it simply runs the function, so value functions stay isomorphic.
- Concurrent calls with the same key share one in-flight computation — array items parse in parallel, but the request fires once.
- Errors are never cached; a failed computation rejects all waiters and the next call retries.
- `null`/`undefined` from `storage.match` count as misses, so falsy values (`0`, `''`, `false`) cache correctly.
- The optional third argument is merged into `context.cache` for the backend's `match`/`add` (e.g. a `ttl`).
- The cache identity is your explicit key — the context passed to the backend carries no per-key information.

For manual control, the configured backend is also directly available as `context.storage` (`match`/`add`/`remove`/`clear`).

### CMS Content Templating with Variables

**Why:** Instead of building complex string-replacement utilities or integrating heavy templating engines like EJS, Bou Parsing allows content editors in a CMS to use double curly braces (`{{variable}}`) for dynamic injection. Coders define the variable resolvers (which can even be async DB lookups), and the parser handles replacing them safely.

**Features Used:** `variables` (Global & Instance), Async resolvers, Fallbacks (`||`), Pipes (`|`), Deep object resolution.

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

**Why:** Often in CMS systems, content editors want to embed reusable snippets or documents directly into their text (e.g., `{{snippets/summer-sale.title}}`). Instead of pre-fetching all possible snippets upfront—which can be slow and resource-heavy—you can use `variableResolver` to fetch only the exact snippets used in the text on-demand.

**Features Used:** `variableResolver`, Deep object resolution.

```ts
// 1. Global Setup in parser-config.ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser, types } = initializeParser(() => ({
  variableResolver: async (variableName, context) => {
    // Intercept any variable starting with 'snippets/'
    if (variableName.startsWith('snippets/')) {
      const slug = variableName.split('/')[1];

      // Fetch the snippet from the CMS
      const dataFromCMS = {
        'current-sale-title': '50% Off Summer Sale',
        'current-sale-description': 'Get the best deals of the season.',
      };
      const snippet = await Promise.resolve(slug.toUpperCase());

      // Cache the result globally so subsequent usages of this exact
      // variableName don't trigger another CMS fetch
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
  const { data: user, loading } = useParserValue(rawData, userParser);

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

Initializes an isolated parsing engine with global settings (loose casting, transformers, storage caching, variables, lifecycle hooks).

- **Returns:** `{ createParser, types }` — `types` contains the built-in casting types.

#### `createParser(projection, options?)`

Creates an executable parser function based on the provided schema projection.

- **Returns:** An asynchronous parsing function that takes `(rawData, contextOverride?)`.
- **Methods:** `.extend(newProjection)`, `.withContext(newContext)`

### Context Object (`ParserContext`)

The `context` object is passed to all dynamic resolver functions in your projection. It contains the raw data, some info about current execution and custom properties.

- **`data`**: The raw input data at the currently executing nested level. During projection-driven resolution (no matching input for a nested projection) this is an empty object; the parent's value remains available via `context.parent.data`.
- **`variables`**: A merged dictionary of global, schema, and instance variables, including a `current` reference to the input data. Used automatically in string template replacement. See [Variables](#variables).
- **`key`**: The string key of the property currently being evaluated.
- **`index`**: The numeric index if the current data is being evaluated inside an array. See [Nested Arrays](#nested-data-structures).
- **`isRoot`**: A boolean indicating if this is the top-level execution of the parser.
- **`projection`**: The active projection schema definition for the current level.
- **`cache`**: The merged caching options. See [Caching](#server-side-data-fetching--caching).
- **`parser`**: A reference to the underlying `Parser` instance handling the execution.
- **`path`**: The chain of projection references from the root to the current level, present in every parse.
- **`datalessPath`**: The chain of projection references accumulated during projection-driven resolution. Present only when the current parse has no matching input data — its presence tells a value function it is running data-lessly. See [The projection is the point of truth](#the-projection-is-the-point-of-truth).
- **Custom Properties**: Any additional properties passed via context overriding or lifecycle hooks. To enable strong typing for custom properties, use TypeScript module augmentation. See [Advanced TypeScript Generation](#advanced-typescript-generation--utilities) and [Context Overriding](#context-overriding).

### Context Configuration & Modifiers

Context can be configured at three distinct levels, allowing you to scope variables, caching, and hooks appropriately.

1. **Global Level (`initializeParser`)**: Each call creates an isolated parser engine; settings applied here affect all parsers created from the returned `createParser`. Ideal for `storage`, global `transformers`, and global `variables`. See [Multiple parser configurations](#multiple-parser-configurations).
2. **Schema Level (`createParser`)**: Settings applied here affect all executions of this specific parser schema. Ideal for schema-specific `variables`, `cache` definitions, or `before`/`after` hooks.
3. **Instance Level (`myParser(data, context)`)**: Settings applied during execution. Ideal for request-specific `variables` (e.g., currently logged-in user, active locale).

### Projection Directives

Advanced structural controls available as keys within your schema definition.

- **`@if`**: Accepts an array of objects containing `when` (a condition function) and `then` (the projection to merge if true). Allows fully conditional object picking. Inside projection-driven resolution the condition runs against an empty data object. See [Conditional Data](#conditional-data).
- **`@combine`**: Accepts an async function returning an object. Merges the returned object directly into the current parsed output. Useful for fetching secondary datasets. See [Merging Data](#merging-data).
- **`@array`**: When set to `true` at the root of a nested projection, signals the parser to iterate over the input data as an array and apply the remaining properties to each item. See [Nested Arrays](#nested-data-structures).
- **`parser.flat`**: Not a key but a projection value — parses the data under its key with the given parser and merges the result into the parent output, dropping the key. See [Flattening nested parsers](#flattening-nested-parsers-with-flat).

### Built-in Types

The `types` object — returned by `initializeParser` and also available as individual named exports from the tree-shakeable `@bou-co/parsing/types` entry point — provides casting types for standard properties:

- **Primitives**: `types.string`, `types.number`, `types.boolean`, `types.date`, `types.object`, `types.any`, `types.unknown`.
- **Arrays**: `types.array` (pass-through validation) or per-item casting via `types.array(types.string)`, `types.array(types.number)`, including nesting (`types.array(types.array(types.number))`).
- **Custom types**: created anywhere with `defineType` and used directly as projection values. See [Custom types & casting options](#custom-types--casting-options).

Every type casts its value at runtime after variables and transformers have resolved; `undefined`/`null` values skip casting and are omitted — unless the type carries a `default` (`types.string({ default: 'x' })`), which fills in whenever the field would end up `undefined` and makes it non-optional. Failed casts throw a `ParserCastError` unless `looseCasting` allows them through. See [Types & casting](#types--casting) for the full casting table and [Default values](#default-values).

> **Migration note:** the v2 string identifiers (`title: 'string'`, `items: 'array<string>'`, …) are no longer supported — using one as a projection value throws a migration error at runtime. Other string literals still work as constants.

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

Types hash into cache keys by their implementation source, so caching stays correct when a type changes. When a **factory** creates several types from one function (closures are invisible to hashing), give each a `name` to keep their cache identities apart — the name also shows up in `ParserCastError.type`:

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

Deterministically hashes an object or primitive into a stable string. Highly useful for generating deterministic Cache/Storage keys in `initializeParser`.

```ts
import { toHash } from '@bou-co/parsing';

const obj1 = { a: 1, b: 2 };
const obj2 = { b: 2, a: 1 }; // Same content, different order

console.log(toHash(obj1) === toHash(obj2)); // true
```

#### `useParserValue(data, parser)`

React hook exported from `@bou-co/parsing/react`. Safely resolves async parsers inside React components, returning `{ data, loading, error }`.

```tsx
import React from 'react';
import { useParserValue } from '@bou-co/parsing/react';
import { myParser } from './parser';

export const MyComponent = ({ rawProps }) => {
  const { data, loading, error } = useParserValue(rawProps, myParser);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{data?.title}</div>;
};
```

---

## Maintainers

Developed and maintained by the [Bou](https://bou.co/) team.

- Teemu Lahjalahti
- Anne Kokkonen
- Richard Grosjean
