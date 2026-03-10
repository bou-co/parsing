# What has changed?

Bou Parsing V2 brings powerful new features like caching, dynamic projections, and context overriding. To support these new capabilities, the way context and variables are passed into parsers has been restructured.

## Breaking Changes

### 1. Variables in `initializeParser`

Global variables and pipe functions are now scoped under a `variables` key in the configuration returned by `initializeParser`.

**V1:**

```ts
export const { createParser } = initializeParser(() => {
  return {
    currentYear: new Date().getFullYear(),
  };
});
```

**V2:**

```ts
export const { createParser } = initializeParser(() => {
  return {
    variables: {
      currentYear: new Date().getFullYear(),
    },
  };
});
```

### 2. Instance Variables in Parser Executions

Instance data passed to a parser execution must now also be scoped under the `variables` key. This allows the second argument to accept other parser configurations like `cache` alongside `variables`.

**V1:**

```ts
const instanceData = {
  entity: 'world',
  uppercase: ({ data }) => data.toUpperCase(),
};

const result = await myParser(rawDataFromApi, instanceData);
```

**V2:**

```ts
const instanceOptions = {
  variables: {
    entity: 'world',
    uppercase: ({ data }) => data.toUpperCase(),
  },
};

const result = await myParser(rawDataFromApi, instanceOptions);
```

## New Features in V2

- **Caching and Storage:** Built-in caching support to store and retrieve query results, speeding up redundant parses.
- **Dynamic Projections:** Pass a function to `createParser` instead of a static object to evaluate projections dynamically based on the data.
- **Extending Parsers:** Use `.extend()` to build upon existing parsers without mutating the original definition.
- **Context Overriding:** Use `.withContext()` to inject or merge new context properties into an existing parser.
- **Lifecycle Hooks:** Register `before` and `after` hooks globally or locally to manage context or manipulate final results.
- **Transformers:** Define global conditional transformations (e.g., for automatic localization).
- **Array Index Tracking:** When parsing arrays, the `index` property is automatically populated in the context.
- **Chaining Parsers:** Output from one parser can easily be passed into another for multi-pass parsing.
