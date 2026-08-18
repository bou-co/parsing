# API reference

Condensed signature lookup. For behaviour and use cases see `features.md`.

## Entry points

| Import path                   | Contains                                                                    |
| ----------------------------- | --------------------------------------------------------------------------- |
| `@bou-co/parsing`             | `initializeParser`, `Parser`, utils, errors, types-as-types                 |
| `@bou-co/parsing/types`       | Every built-in token individually + `defineType`. Tree-shakeable, no engine |
| `@bou-co/parsing/react`       | `useParserValue`                                                            |
| `@bou-co/parsing/templates/*` | Shipped templates, e.g. `templates/localize`                                |

Node `^20.19.0 || >=22.12.0`. React is an optional peer dependency.

## Core functions

### `initializeParser(config?)`

Creates an isolated engine. `config` is an object, or a sync/async function returning one.

**Returns** `{ createParser, resolve, cacheResult, types }`.

Config keys:

| Key                | Type                                            | Scope                  | Notes                                                            |
| ------------------ | ----------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `variables`        | object                                          | global/schema/instance | Values, functions, nested objects                                |
| `pipes`            | object                                          | global/schema/instance | Pipe functions for expressions                                   |
| `patterns`         | object                                          | **global only**        | Custom inline syntaxes; `variables` key customises the built-in  |
| `variableResolver` | `(name, ctx, cache) => unknown`                 | global                 | On-demand lookup; `cache(v)` opts into the engine-lifetime store |
| `transformers`     | `{ [name]: { when, then } }`                    | global                 | Whole-value replacement                                          |
| `storage`          | `{ match, add, generateKey?, remove?, clear? }` | global                 | Cache backend (`StorageLike`)                                    |
| `cache`            | `ParserCachingOptions`                          | global/schema/instance | `{ enabled, ...your options }`                                   |
| `looseCasting`     | `false \| true \| 'undefined'`                  | global/schema/instance | Cast failure policy                                              |
| `onCastError`      | `(error, ctx) => void`                          | global/schema/instance | Observe `ParserCastError`                                        |
| `before` / `after` | `(ctx) => ctx`                                  | global/schema/instance | Lifecycle hooks                                                  |
| `pipeUndefined`    | boolean                                         | any                    | Run pipes on `undefined` values                                  |

### `createParser(projection, options?)`

`projection` is an object literal or a `(context) => projection` function.

**Returns** an async parser `(input, instanceContext?, parentContext?) => Promise<Output>`.

Properties and methods on the returned parser:

| Member                  | Type   | Effect                                                    |
| ----------------------- | ------ | --------------------------------------------------------- |
| `.extend(projection)`   | parser | Merged projection, original unmutated                     |
| `.withContext(context)` | parser | Merged context                                            |
| `.asArray`              | parser | Per-item parse; `!== parser`, hashes like its base parser |
| `.flat`                 | parser | Parse `data[key]`, merge into parent, drop the key        |
| `.projection`           | object | The projection definition                                 |

Passing a full parser context as the **second** argument throws — forward it as the third.

### `resolve(input, contextOverride?)`

Runs transformers and patterns on raw input with no projection, casting, or hooks. Accepts
objects, arrays, strings, and functions. Return type inferred from input; pass an explicit
generic when a transformer reshapes values.

### `cacheResult(key, fn, extraData?, options?)`

Caches `fn`'s result in storage under a variable-interpolated `key`. Usable as a projection
value, inside a `resolve` input, or awaited standalone. `extraData` feeds key interpolation;
`options` merges into `context.cache`.

### `new Parser(globalContext)`

Advanced form of `initializeParser`, when you need the engine instance itself. The v2 statics
`Parser.parserGlobalContext` and `Parser.createParser` are removed and throw on access.

## Built-in types

From `initializeParser().types`, or individually from `@bou-co/parsing/types`.

`string` · `number` · `boolean` · `date` · `object` · `array` · `any` · `unknown`

- `types.array(token)` — per-item casting; nests
- `types.x({ default: v })` — fill-in value, makes the field non-optional
- No `types.undefined` — accessing it throws

See the casting table in `basics.md`.

## Projection directives

| Key           | Value                   | Effect                                                                                                         |
| ------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `'@if'`       | `Array<{ when, then }>` | Conditionally merge projections (exact key)                                                                    |
| `'@combine*'` | `async (ctx) => object` | Merge the returned object into output; prefix-matched, so `'@combine:stats'` etc. allow several per projection |
| `'@array'`    | `true`                  | Apply the rest of this projection per array item (exact key)                                                   |

Other `@`-prefixed keys are silently dropped from the output.

## Context object

See the full table in `basics.md`. Reserved keys (engine-written after your spreads,
overwrite yours): `data`, `key`, `projection`, `variables`, `pipes`, `isRoot`, `cache`,
`value`, `parent`, `path`, `store`, `resolve`, `datalessPath` — plus `parser` (engine-set
before the spreads), `index` (array items), and `params` (pipes), which you should treat as
reserved too.

## Pattern interface

```ts
interface ParserPattern {
  delimiters?: [string, string];
  match?: RegExp;
  resolve: (input: PatternResolveInput) => unknown | Promise<unknown>;
  expressions?: boolean; // default true when delimited; on a token pattern throws at first parse
  rescan?: boolean; // default true
  cache?: 'run' | 'none' | 'storage'; // default 'run'
}

interface PatternResolveInput {
  path: string;
  raw: string;
  groups: RegExpExecArray;
  context: ParserContext;
}
```

## Expression grammar

Inside a delimited pattern's delimiters:

```
expression := candidate ( '||' candidate )* ( '|' pipeName ( ':' param )* )?
candidate  := dotted.path | "string" | integer | true | false | ...
param      := "string" | integer | true | false | variableName
```

One pipe per expression (a second is silently discarded), and it binds to its own fallback
branch. First **defined** candidate wins (`false`/`0`/`''`/`null` stop the chain). Literals:
double quotes and integers only — no floats, negatives, or single quotes. `{{...}}` returns
the full merged variables object. Pipe params resolve from `context.variables` only. Escape a
whole match with a preceding backslash.

## Utilities

| Export             | Signature                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defineType`       | `(fn \| { fn, strict?, name?, default? }) => token`                                                                                                                                   |
| `isTypeToken`      | `(v) => v is ParserTypeToken`                                                                                                                                                         |
| `typed<T>`         | Type-only marker; passes raw value through uncast                                                                                                                                     |
| `optional`         | Marks a key optional without a type                                                                                                                                                   |
| `condition`        | `(when, then) => { when, then }`                                                                                                                                                      |
| `get`              | `(path) => (ctx) => Promise<T>` \| `(path, from) => Promise<T>`                                                                                                                       |
| `toHash`           | `(data) => string` — deterministic, but **key-order sensitive** (see gotchas)                                                                                                         |
| `asDate`           | `(v: string \| number) => Date \| undefined` — `undefined` for falsy input; unparseable input yields an `Invalid Date`, not `undefined`                                               |
| `mergeObjects`     | `(a, b) => merged`                                                                                                                                                                    |
| `resolveVariables` | `(input, context) => Promise<T>` — deep pattern resolution only (no transformers/casting); needs a caller-supplied `ParserContext`, which is why `context.resolve` is the usual entry |

## Errors

| Error                     | Thrown when                          | Carries                                    |
| ------------------------- | ------------------------------------ | ------------------------------------------ |
| `ParserCastError`         | A cast fails (and policy says throw) | `path`, `type`, `key`, `received`, `cause` |
| `ParserPatternCycleError` | Pattern cycle, or rescan >10 deep    | `chain` (the resolution chain)             |

## Types

| Type                                                                                      | Purpose                                                   |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `ParserReturnValue<typeof parser>`                                                        | Extract output type                                       |
| `ParserContext`                                                                           | The context object                                        |
| `ParserFunction<T>`                                                                       | A parser's callable shape                                 |
| `ParserProjection`                                                                        | Projection constraint                                     |
| `ParserCachingOptions`                                                                    | Augment via module declaration for your backend's options |
| `CommonContext`, `GlobalContext`, `CreateContext`, `InstanceContext`, `FunctionalContext` | Augment via module declaration to type custom context     |

## React

```ts
useParserValue(data, parser) => { result, loading, error, revalidate }
```

`revalidate(updatedData?)` re-parses; passing data bypasses change detection.
