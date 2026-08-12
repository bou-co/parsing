# What has changed?

## V3

Bou Parsing V3 replaces the string-based type identifiers with a `types` object that both types **and casts** values at runtime.

### 1. String type identifiers are removed

Legacy identifiers (`'string'`, `'number'`, `'boolean'`, `'date'`, `'object'`, `'array'`, `'array<...>'`, `'any'`, `'unknown'`, `'undefined'`) are no longer valid projection values — using one throws a migration error at runtime. Other string literals still work as constants.

**V2:**

```ts
const myParser = createParser({
  title: 'string',
  priority: 'number',
  tags: 'array<string>',
});
```

**V3:**

```ts
import { createParser, types } from '../path-to/parser-config';

const myParser = createParser({
  title: types.string,
  priority: types.number,
  tags: types.array(types.string),
});
```

Migration is a find/replace: `'string'` → `types.string`, `'number'` → `types.number`, `'array<x>'` → `types.array(types.x)`, and so on. `initializeParser` now returns `{ createParser, types }` — re-export `types` from your parser config. The built-in tokens are also individually importable from the tree-shakeable `@bou-co/parsing/types` entry point. There is no `types.undefined`; use the `optional` util instead.

### 2. Types now always cast values

Unlike the V2 identifiers (which passed values through untouched), V3 types coerce at runtime: `types.number` turns `'21'` into `21`, `types.date` parses date strings into `Date` instances, and values that cannot be cast throw a `ParserCastError`. Behavior on failure is configurable via `initializeParser({ looseCasting })` (`true` passes the original value through with a warning, `'undefined'` drops the value). Fields whose input is `undefined`/`null` skip casting and stay optional.

### 3. Custom types

Define your own types with `defineType` — pass a casting function or a `{ fn, strict? }` object — and use the result directly as a projection value, with full type inference. There is no registration: custom types are plain values you create and import from anywhere (one-off inline types are fine too). A `strict: true` type always throws on failure regardless of `looseCasting`. For standalone type files, compose from the `@bou-co/parsing/types` entry point (e.g. `export const numbers = array(number);`).

### 4. Isolated parser engines

Each `initializeParser` call now creates an isolated engine with its own global context (variables, transformers, storage, casting options) and caches — previously the last call replaced the global state for every parser in the process. Parsers stay permanently bound to the engine that created them, which enables e.g. separate server and client configurations. The `Parser` statics (`Parser.parserGlobalContext`, `Parser.createParser`) are gone; `new Parser(globalContext)` is the advanced equivalent. Cast failures can be observed via the new `onCastError` context option.

### 5. Smaller breaking details

- The `valueKeys` export (the V2 list of string type identifiers) is removed.
- If your `storage` relies on the **default** cache key (no custom `generateKey`), expect a one-time cache invalidation: projection hashes changed when type identifiers became tokens. Storages with their own `generateKey` are unaffected unless they hash the projection. Going forward, token hashes are content-derived — editing a custom type's implementation (or its `strict`/`name`) intentionally invalidates entries that used it, and nested parsers hash by their own projection.

### Migrating a live site

Casting means values that silently passed through with a wrong shape in V2 now throw a `ParserCastError`. For a low-risk rollout, migrate with `looseCasting: 'undefined'` plus an `onCastError` reporter to surface those fields first, fix or retype them (`types.any` for intentional raw passthroughs), then remove `looseCasting` to return to the default throwing mode.

## V2

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
