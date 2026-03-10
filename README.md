# Bou Parsing

Bou Parsing is your ultimate sidekick for taming unruly data! Whether you're wrangling data from APIs, generating TypeScript types on the fly, or splitting complex queries into bite-sized pieces, Bou Parsing has got you covered. With its powerful yet easy-to-use functions, you can effortlessly manipulate, validate, and transform your data into exactly what you need. Say goodbye to tedious data handling and hello to a smoother, more efficient workflow with Bou Parsing!

[NPM](https://www.npmjs.com/package/@bou-co/parsing) | [GitHub](https://github.com/bou-co/parsing)

## Get started

### 1 - Install Bou Parsing package from NPM. Same package supports is made to support all frameworks.

```bash
npm i @bou-co/parsing
```

### 2 - In root level of your code, run `initializeParser` function to export `createParser` function.

```ts
// parser-config.ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser } = initializeParser();
```

### 3 - Start using parser anywhere in your app's or website's data flow

```ts
import { createParser } from '../path-to/parser-config';

const myParser = createParser({
  title: 'string',
  description: 'string',
  priority: 'number',
});

const dataThatYouWanted = await myParser(rawDataFromApi);
```

[View simple usage example](#define-the-data-you-want)

## Features

1. [Define the data you want](#define-the-data-you-want)
2. [Generate types](#generate-types-to-your-picked-data)
3. [Add and modify values](#adding-additional-data-or-modifying-raw-values)
4. [Nested data structures](#nested-data-structures)
5. [Conditional data](#conditional-data)
6. [Merging data](#merging-data)
7. [Variables](#variables)
8. [Caching results](#caching-and-storage)
9. [Dynamic projections](#dynamic-projections)
10. [Extending parsers](#extending-parsers)
11. [Context overriding](#context-overriding)
12. [Lifecycle hooks](#lifecycle-hooks)
13. [Transformers](#transformers)
14. [Chaining parsers](#chaining-parsers-reparsing)

## API

1. [Initialize parser](#initialize-parser)
1. [Create parser](#create-parser)

### Define the data you want

When querying data with an API that does not support picking what you want, `createParser` function can be used to pick the data you need and remove the rest.

```ts
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = {
  _id: 'abc-123',
  title: 'Test',
  description: 'Lorem ipsum',
  priority: 1,
};

const myParser = createParser({
  title: 'string',
  description: 'string',
  priority: 'number',
});

const dataThatYouWanted = await myParser(rawDataFromApi);
```

In the example above we pick to get `title, description and priority` but omit the `_id`.

**Note:** value returned by `createParser` is an async function as parsers do have a wide support for promises. For React.js component usage we have developed a client side hook `useParserValue` to allow parser usage easily inside of React.js.

### Dynamic projections

Instead of passing a static object definition to `createParser`, you can pass a synchronous or asynchronous function. This function receives the parser context and can return a different projection structure dynamically based on the input data.

```ts
import { createParser } from '../path-to/parser-config';

const dynamicParser = createParser(({ data }) => {
  if (data['addMetadata']) {
    return { value: 'number', metadata: 'string' };
  }
  return { value: 'number' };
});
```

### Generate types to your picked data

Rarely you can get good and easy type generation from external APIs (especially from CMS). With `ParserReturnValue` it's possible to use your parser projection as the TypeScript type instead of writing the types on your own.

```ts
import { ParserReturnValue } from '@bou-co/parsing';
import { createParser } from '../path-to/parser-config';

const myParser = createParser({
  title: 'string',
  description: 'string',
  priority: 'number',
});

export type MyParserData = ParserReturnValue<typeof myParser>;
```

Type `MyParserData` equals to:

```ts
interface MyParserData {
  title?: string;
  description?: string;
  priority?: number;
}
```

Possible values that are automatically turned to types are `string, number, boolean, object, any, unknown, undefined, date, array` or `array<string etc.>`.

**Note:** `@bou-co/parsing` type generation by default expects that any value can also be undefined!

#### Using custom types

It's also possible to use custom types for value with `typed` function. With `typed` you can pass any custom TypeScript values to be used as values generated with the typing.

```ts
import { typed } from '@bou-co/parsing';
import { createParser } from '../path-to/parser-config';

interface Author {
  name?: string;
  title?: string;
}

const anotherParser = createParser({
  title: 'string',
  category: typed<'blog' | 'news' | 'releases'>,
  author: typed<Author>,
});

export type AnotherParserData = ParserReturnValue<typeof anotherParser>;
```

In this case type `AnotherParserData` equals to:

```ts
interface AnotherParserData {
  title?: string;
  category?: 'blog' | 'news' | 'releases';
  author?: Author;
}
```

### Adding additional data or modifying raw values

With `@bou-co/parsing` it's also possible to add values that are not part of the initial data.

```ts
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = {
  _id: 'abc-123',
  title: 'Test',
  description: 'Lorem ipsum',
  priority: 1,
};

const BLOG_POST = 'blogPost';

const myParser = createParser({
  title: 'string',
  description: 'string',

  // 1. Static value added as is
  postType: BLOG_POST,

  // 2. Function return value
  randomNumber: () => Math.random(),

  // 3. Promises supported
  asyncText: async () => {
    const awaited = await fetch('your-api').then((res) => res.text());
    return awaited;
  },

  // 4. Custom override for priority
  priority: (context) => {
    const { data } = context;
    if (!data.priority) return 1;
    return data.priority;
  },

  // 5. Variation of raw value
  metaTitle: (context) => {
    const { data } = context;
    if (!data.title) return 'Untitled blog post';
    return `${data.title} - Our blog`;
  },
});

const dataThatYouWanted = await myParser(rawDataFromApi);
```

**Note:** When using functions to set data, you might need to manually define the type of the value that the function returns!

**Good to know:** The type of first argument (context) for any function is `ParserContext` and it contains current raw data as "data" but also some information about the current parser!

### Nested data structures

Parsers can handle nested objects as properties defined in projection or as additional parsers.

#### Nested objects in parsers

```ts
import { createParser } from '../path-to/parser-config';

const myParser = createParser({
  title: 'string',
  nestedDataObject: {
    description: 'string',
    priority: 'number',
  },
});
```

#### Nested arrays in parsers

Adding `'@array': true,` defines that projection inside of current level should be defined as array.

```ts
import { createParser } from '../path-to/parser-config';

const myParser = createParser({
  title: 'string',
  nestedDataArray: {
    '@array': true,
    description: 'string',
    priority: 'number',
  },
});
```

When parsing an array of items, the parser automatically populates an `index` property in the context. This allows your value functions to know their positional index within the parsed array.

```ts
const parserWithIndex = createParser({
  items: {
    '@array': true,
    title: 'string',
    indexTimesThree: ({ index }) => (index !== undefined ? index * 3 : undefined),
  },
});
```

#### Nested parsers

```ts
import { createParser } from '../path-to/parser-config';

const innerParser = createParser({
  description: 'string',
  priority: 1,
});

const myParser = createParser({
  title: 'string',
  nestedDataObject: innerParser,
  nestedDataArray: innerParser.asArray,
});
```

### Conditional data

Parsing supports fully conditional data picking and addition with `@if`.

```ts
import { createParser } from '../path-to/parser-config';

const myParser = createParser({
  title: 'string',
  priority: 'number',
  '@if': [
    // 1. Show description only if priority is 1
    {
      when: (context) => context.data.priority === 1,
      then: {
        description: 'string',
      },
    },
    // 2. Omit description and add "highPriority: true" if priority is above 1
    {
      when: (context) => context.data.priority > 1,
      then: {
        highPriority: true,
      },
    },
    // 3. Modify description and add "lowPriority: true" if priority is below 1
    {
      when: (context) => context.data.priority < 1,
      then: {
        lowPriority: true,
        description: (context) => context.data.description + '?',
      },
    },
  ],
});
```

### Merging data

Adding data as individual property & value pairs is good when only few values are added but to manage larger additions you can use `@combine`.

```ts
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = {
  _id: 'abc-123',
  title: 'Test',
  description: 'Lorem ipsum',
  priority: 1,
};

const additionalDataParser = createParser({
  readCount: 'number',
  likes: 'number',
});

const myParser = createParser({
  title: 'string',
  priority: 'number',
  description: 'string',
  '@combine': (context) => {
    const { _id } = context.data;
    const query = `your-api?id=${_id}`;
    const rawAdditionalData = await fetch(query).then((res) => res.json());
    return additionalDataParser(rawAdditionalData);
  },
});

const mergedData = await myParser(rawDataFromApi);
```

### Variables

Variables in parsing are a way to easily edit string values that are coming from raw data. Variables can be used to easily add data about the build, render or current user.

#### Global variables

To use variables anywhere, define them in your parsing config.

```ts
// parser-config.ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser } = initializeParser(() => {
  const currentYear = new Date().getFullYear();
  return {
    variables: {
      currentYear,
    },
  };
});
```

After definition you can use them in the raw data.

```ts
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = {
  title: 'Hello from {{currentYear}}',
  description: 'Is the current year really {{currentYear}}?',
};

const myParser = createParser({
  title: 'string',
  description: 'string',
});

const result = await myParser(rawDataFromApi);
```

Result in case above is:

```json
{ "title": "Hello from 2026", "description": "Is the current year really 2026?" }
```

#### Instance variables

```ts
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = {
  title: 'Message for the whole {{entity}}',
  description: 'Hello {{entity}}!',
};

const myParser = createParser({
  title: 'string',
  description: 'string',
});

const instanceData = {
  variables: {
    entity: 'world',
  },
};

const result = await myParser(rawDataFromApi, instanceData);
```

Result in case above is:

```json
{ "title": "Message for the whole world", "description": "Hello world!" }
```

#### Variable fallbacks

For any variable provided in the data, there can be a fallback value in a form of another variable, string, number or boolean. Fallback values can be added with adding `||` after the initial variable and after that a secondary variable or just a value.

```ts
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = {
  title: 'Message for the whole {{notFound || "city"}}',
  description: 'Hello {{firstName || lastName || "Doe"}}!',
  score: '{{score || 0}}',
  active: '{{isActive || false}}',
};

const myParser = createParser({
  title: 'string',
  description: 'string',
  score: 'number',
  active: 'boolean',
});

const instanceData = {
  variables: {
    lastName: 'Johnson',
  },
};

const result = await myParser(rawDataFromApi, instanceData);
```

Result in case above is:

```json
{
  "title": "Message for the whole city",
  "description": "Hello Johnson!",
  "score": 0,
  "active": false
}
```

#### Variable pipes

If you need to transform the value of a variable, you can do that with pipes. Pipes are useful for example when you want to transform an ISO date to something meant for humans. Pipes are defined in code as variables that are funtions and get the current variable value in the context as data. Pipes can also take in params that are then an array in the context.

```ts
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = {
  title: 'Hello from {{title | uppercase}}',
  publishedAt: 'This is published at {{date | toDateString}}',
  score: '{{score | multiply:100 }}', // Add param for how much should the value be multiplied
};

const myParser = createParser({
  title: 'string',
  publishedAt: 'string',
  score: 'number',
});

const instanceData = {
  variables: {
    // Variable values
    title: 'the space',
    publishedAt: '2026-05-22T12:00:00',
    score: 0.42,
    // Pipe functions (could most likely be added with initializeParser and not per instance)
    uppercase: ({ data }) => data.toUpperCase(),
    toDateString: ({ data }) => new Date(data).toLocaleString(),
    multiply: ({ data, params: [by] = [2] }) => data * by,
  },
};

const result = await myParser(rawDataFromApi, instanceData);
```

Result in case above is:

```json
{
  "title": "Message for THE SPACE",
  "publishedAt": "5/22/2026, 12:00:00 PM",
  "score": 42
}
```

### Extending parsers

You can build upon an existing parser by using the `.extend()` method. It merges a new projection object with the original one, allowing you to append new fields or override existing ones without mutating the original parser.

```ts
import { createParser } from '../path-to/parser-config';

const original = createParser({ value: 'number' });
const extended = original.extend({ additional: 'string' });

const result = await extended({ value: 456, additional: 'test' });
```

**Note:** parsers created with a function projection cannot be extended.

### Context overriding

You can inject new context properties (like variables) into a pre-existing parser by calling `.withContext()`. This returns a new instance of the parser containing the updated context, allowing you to reuse the same parser blueprint seamlessly without affecting the original definition.

```ts
import { createParser } from '../path-to/parser-config';

const parser = createParser({ values: 'string' }, { variables: { first: 1 } });

// Creates a cloned instance with 'second' merged into the context variables
const withAdditionalContext = parser.withContext({ variables: { second: 2 } });
```

### Lifecycle hooks

You can register `before` and `after` hooks either globally in `initializeParser` or locally in `createParser`. A `before` hook is especially useful for injecting shared context values before parsing begins. Those values are then available to all value functions and are also inherited automatically by child parsers created with `.extend()`. An `after` hook can still manipulate the resulting data before it gets returned when needed.

```ts
import { initializeParser } from '@bou-co/parsing';

declare module '@bou-co/parsing' {
  interface FunctionalContext {
    basePrice: number;
  }
}

const { createParser } = initializeParser();

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

const productCardParser = productParser.extend({
  label: ({ data, basePrice }) => `${data.name} (${data.price + basePrice} EUR)`,
});

const result = await productCardParser({
  name: 'Notebook',
  price: 25,
});
```

Result in case above is:

```json
{
  "finalPrice": 35,
  "label": "Notebook (35 EUR)"
}
```

### Transformers

You can define a suite of global `transformers` inside `initializeParser`. A transformer contains a `when` conditional statement and a `then` transformation method. This is highly effective for things like custom data structures or global automatic localization (e.g., returning the correct translation string out of an object of translations).

```ts
import { initializeParser } from '@bou-co/parsing';

const localize = {
  when: ({ data, locales = [] }) => Object.keys(data).every((k) => locales.includes(k)),
  then: ({ data, currentLocale = 'en' }) => data[currentLocale],
};

const { createParser } = initializeParser({
  transformers: { localize },
});
```

### Chaining parsers (Reparsing)

The data returned by one parser is fully compatible to be passed directly into another parser. This makes it possible to parse objects in multiple passes, chain parser executions, or apply different structural projections sequentially.

```ts
import { createParser } from '../path-to/parser-config';

const baseParser = createParser({ value: 'number' });
const doubleParser = createParser({ value: ({ data }) => data.value * 2 });

const baseData = await baseParser({ value: 123 });
const finalData = await doubleParser(baseData);
```

Result in case above is:

```json
{
  "value": 246
}
```

### Caching and storage

Caching is build in to the library to make less requests agains databases and save calculations without need for additional hassle. Caching configuration connects to a storage you define and any results of queries or computations can be saved to the storage when needed.

---

### Initialize parser

```ts
import { initializeParser, toHash } from '@bou-co/parsing';
import { redis } from '../redis';

declare module '@bou-co/parsing' {
  // Additional context options for caching
  interface ParserCachingOptions {
    name?: string;
    ttl?: number;
  }
}

const { createParser } = initializeParser({
  storage: {
    generateKey: (context) => {
      if (!context.cache.name) throw new Error('Caching options must include a name');
      const valueHash = toHash(context.data);
      const key = `${context.cache.name}:${valueHash}`;
      return key;
    },
    add(key, value, context) {
      const asString = typeof value === 'string' ? value : JSON.stringify(value);
      await redis.set(key, asString, { ex: context.cache.ttl });
    },
    match: async (key, context) => {
      const value = await redis.get(key);
      return value;
    },
  },
});
```

### Create parser

```ts
import { createParser } from '../path-to/parser-config';

const parser = createParser(
  {
    title: async () => {
      // Let's imagine that this is complex computation or big query that takes long time to resolve
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return 'Hello World';
    },
  },
  {
    cache: {
      enabled: true, // Enable caching for this parser
      ttl: 60 * 60 // 1 hour in seconds
      name: 'title-cache'
    },
  },
);
```

Result in case above is:

```json
{
  "title": "Hello World"
}
```

First function run will take 1 second to complete but the next ones will be gotten from redis cache making parsing a lot faster. For more complex cases, better key generation is possible as the key can get the same data as any parser.

---

<footer>

Developed by [Bou](https://bou.co/)

</footer>
