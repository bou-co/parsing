# Bou Parsing

Bou Parsing is your ultimate sidekick for taming unruly data! Whether you're wrangling data from APIs, generating TypeScript types on the fly, or splitting complex queries into bite-sized pieces, Bou Parsing has got you covered. With its powerful yet easy-to-use functions, you can effortlessly manipulate, validate, and transform your data into exactly what you need.

While Bou Parsing is fully isomorphic and works perfectly in the browser, **it truly shines on the server-side** (e.g., in Next.js App Router, Astro, NestJS, or Express). It allows you to fetch massive API responses or do complex mappings and calculations, parse them into exact, type-safe structures, and cache the computations to drastically reduce server, database and network load before sending data to the frontend.

[NPM](https://www.npmjs.com/package/@bou-co/parsing) | [GitHub](https://github.com/bou-co/parsing)

## Get Started

### 1 - Install the package

Install the Bou Parsing package from NPM. It supports all frameworks.

```bash
npm i @bou-co/parsing
```

### 2 - Initialize the parser

In the root level of your code, run the `initializeParser` function to export your tailored `createParser` function. This allows you to set up global configurations like caching and variables once.

```ts
// parser-config.ts
import { initializeParser } from '@bou-co/parsing';

export const { createParser } = initializeParser(/** Global configurations comes here **/);
```

### 3 - Start using the parser

Use your customized `createParser` anywhere in your app's data flow to safely pick, validate, and type your data.

```ts
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = {
  _id: 'abc-123',
  title: 'Hello World',
  description: 'Lorem ipsum',
  priority: 1,
};

const myParser = createParser({
  title: 'string',
  description: 'string',
  priority: 'number',
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

## Table of Contents

- [Basic Usage](#basic-usage)
  - [Defining the data you want](#defining-the-data-you-want)
  - [Adding and modifying values](#adding-and-modifying-values)
  - [Nested data structures](#nested-data-structures)
  - [Conditional data](#conditional-data)
- [Advanced Usage](#advanced-usage)
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

---

## Basic Usage

### Defining the data you want

When querying data with an API that returns more than you need, you can use the parser to pick only the exact fields you want, omitting the rest.

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

const result = await myParser(rawDataFromApi);

/* Result:
{
  "title": "Test",
  "description": "Lorem ipsum",
  "priority": 1
}
*/
```

### Adding and modifying values

You can append static values, compute synchronous/asynchronous values, or derive new properties from the raw input data.

```ts
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = {
  title: 'Test',
  priority: 1,
};

const myParser = createParser({
  title: 'string',

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
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = {
  title: 'Nested Test',
  details: { desc: 'Inner description', level: 5 },
  tags: [{ name: 'ts' }, { name: 'js' }],
};

const tagParser = createParser({
  name: 'string',
  isAwesome: () => true,
});

const myParser = createParser({
  title: 'string',

  // Nested Object
  nestedDataObject: {
    desc: 'string',
    level: 'number',
  },

  // Nested Array
  nestedDataArray: {
    '@array': true,
    name: 'string',
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

### Conditional data

Support for fully conditional data picking and addition using `@if`.

```ts
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = {
  title: 'Test',
  priority: 2,
};

const myParser = createParser({
  title: 'string',
  priority: 'number',
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

### Merging data

Use `@combine` to fetch or compute large external datasets and merge them directly into the current parser projection.

```ts
import { createParser } from '../path-to/parser-config';

const rawDataFromApi = { _id: '123', title: 'Test' };

const additionalDataParser = createParser({
  readCount: 'number',
});

const myParser = createParser({
  title: 'string',
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

export const { createParser } = initializeParser(() => ({
  variables: {
    currentYear: () => new Date().getFullYear(),
    uppercase: ({ data }) => String(data).toUpperCase(),
  },
}));

// 2. Usage
import { createParser } from '../path-to/parser-config';

// Imagine this string comes directly from database or CMS
const rawDataFromApi = {
  title: 'Copyright {{currentYear}}',
  user: 'Hello {{user.firstName || "Guest" | uppercase}}!',
};

const myParser = createParser({
  title: 'string',
  user: 'string',
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

export const { createParser } = initializeParser(() => ({
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

const dynamicParser = createParser({ message: 'string' });

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
import { createParser } from '../path-to/parser-config';

const dynamicParser = createParser(({ data }) => {
  if (data.type === 'detailed') {
    return { value: 'number', metadata: 'string' };
  }
  return { value: 'number' };
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
import { createParser } from '../path-to/parser-config';

const original = createParser({ value: 'number' });
const extended = original.extend({ additional: 'string' });

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
import { createParser } from '../path-to/parser-config';

const parser = createParser({ value: 'string' }, { variables: { first: 1 } });
const overriddenParser = parser.withContext({ variables: { second: 2 } });

// overriddenParser now has both { first: 1, second: 2 } available in variables context.
```

### Lifecycle hooks

Register `before` and `after` hooks. `before` hooks inject shared context values prior to parsing, which trickle down to nested/extended parsers.

```ts
import { createParser } from '../path-to/parser-config';

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

export const { createParser } = initializeParser({ transformers: { localize } });

// 2. Usage
import { createParser } from '../path-to/parser-config';

const myParser = createParser({ greeting: 'string' });

const rawData = { greeting: { en: 'Hello', fi: 'Hei' } };
const result = await myParser(rawData);

/* Result: { "greeting": "Hello" } */
```

### Chaining parsers (Reparsing)

The data output by one parser can be safely passed into another parser for multi-pass executions.

```ts
import { createParser } from '../path-to/parser-config';

const stepOne = createParser({ value: 'number' });
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
import { createParser } from '../../path-to/parser-config';

export const heroBlockParser = createParser({
  title: 'string',
  description: 'string',
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
import { createParser } from '../../path-to/parser-config';

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
  name: 'string',
  role: 'string',
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
import { createParser } from '../../path-to/parser-config';
import { authorBadgeParser } from '../author-badge/parser';

// 3. Nest the generic author parser inside the parent parser
export const articleBlockParser = createParser({
  title: 'string',
  content: 'string',
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

export const { createParser } = initializeParser({
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
import { createParser } from '../path-to/parser-config';

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

### CMS Content Templating with Variables

**Why:** Instead of building complex string-replacement utilities or integrating heavy templating engines like EJS, Bou Parsing allows content editors in a CMS to use double curly braces (`{{variable}}`) for dynamic injection. Coders define the variable resolvers (which can even be async DB lookups), and the parser handles replacing them safely.

**Features Used:** `variables` (Global & Instance), Async resolvers, Fallbacks (`||`), Pipes (`|`), Deep object resolution.

```ts
// 1. Global Setup in parser-config.ts
import { initializeParser } from '@bou-co/parsing';
import { db } from '../database';

export const { createParser } = initializeParser(() => ({
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
import { createParser } from '../path-to/parser-config';

const cmsBlockParser = createParser({
  heading: 'string',
  body: 'string',
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

export const { createParser } = initializeParser(() => ({
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
import { createParser } from '../path-to/parser-config';

const pageParser = createParser({
  content: 'string',
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
import { createParser } from '../path-to/parser-config';

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
  title: 'string',
  category: typed<'blog' | 'news'>, // Forces union type instead of generic 'string'
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

export const { createParser } = initializeParser({
  transformers: { localize },
});

// 2. Create the Parser
import { createParser } from '../path-to/parser-config';

const pageParser = createParser({
  heading: 'string',
  body: 'string',
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
import { createParser } from '../path-to/parser-config';

const userParser = createParser({
  name: 'string',
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

Initializes the parsing engine with global settings (transformers, storage caching, variables, lifecycle hooks).

- **Returns:** `{ createParser, resolveVariables, getVariableValue }`

#### `createParser(projection, options?)`

Creates an executable parser function based on the provided schema projection.

- **Returns:** An asynchronous parsing function that takes `(rawData, contextOverride?)`.
- **Methods:** `.extend(newProjection)`, `.withContext(newContext)`

### Utility Functions

#### `typed<T>(value?)`

Forces TypeScript to infer a specific custom type instead of basic primitives. Used inside projection definitions.

#### `optional<T>(value?)`

Similar to `typed<T>`, but explicitly marks the inferred TypeScript type as possibly `undefined`.

#### `condition(when, then)`

Helper to create conditional projection logic structurally, typically used inside `@if`.

#### `get(path, from?)`

Utility to easily pick nested string properties (e.g. `get('user.address.street')`) when writing custom value resolver functions.

#### `toHash(data)`

Deterministically hashes an object or primitive into a stable string. Highly useful for generating deterministic Cache/Storage keys in `initializeParser`.

#### `useParserValue(data, parser)`

React hook exported from `@bou-co/parsing/react`. Safely resolves async parsers inside React components, returning `{ data, loading, error }`.

---

<footer>

Developed by [Bou](https://bou.co/)

</footer>
