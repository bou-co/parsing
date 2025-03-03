# Bou Parsing

Package to help you with simple data manipulation & validation, type generation and splitting queries into smaller pieces.

## Get started

```bash
npm i @bou-co/parsing
```

```ts
// parser-config.ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser } = initializeParser();
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
  postType: BLOG_POST

  // 2. Function return value
  randomNumber: () => Math.random()

  // 3. Promises supported
  asyncText: async () => {
    const awaited = await fetch('your-api').then(res => res.text())
    return awaited;
  }

  // 4. Custom override for priority
  priority: (context) => {
    const { data } = context;
    if (!data.priority) return 1;
    return data.priority
  }

  // 5. Variation of raw value
  metaTitle: (context) => {
    const { data } = context;
    if (!data.title) return 'Untitled blog post';
    return `${data.title} - Our blog`
  }
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
    currentYear,
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
{ "title": "Hello from 2025", "description": "Is the current year really 2025?" }
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
  entity: 'world',
};

const result = await myParser(rawDataFromApi, instanceData);
```

Result in case above is:

```json
{ "title": "Message for the whole world", "description": "Hello world!" }
```
