# API reference

Condensed signature lookup. For behaviour and use cases see `features.md`.

## Entry points

| Import path                   | Contains                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| `@bou-co/parsing`             | `initializeParser`, `Parser`, utils, errors, types-as-types                                   |
| `@bou-co/parsing/types`       | Every built-in token and class individually + `defineType`. Tree-shakeable, no engine         |
| `@bou-co/parsing/types/*`     | Opt-in subsets `format`, `data`, `content`, `all`, or a single type (`types/format/currency`) |
| `@bou-co/parsing/react`       | `useParserValue`                                                                              |
| `@bou-co/parsing/templates/*` | Shipped templates, e.g. `templates/localize`                                                  |

Node `^20.19.0 || >=22.12.0`. React, `sanitize-html`, `ultrahtml` and `marked` are optional
peer dependencies (the last three only for `types/content`).

## Core functions

### `initializeParser(config?)`

Creates an isolated engine. `config` is an object, or a sync/async function returning one.

**Returns** `{ createParser, resolve, cacheResult, types }`.

Config keys:

| Key                | Type                                            | Scope                  | Notes                                                                                                                     |
| ------------------ | ----------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `variables`        | object                                          | global/schema/instance | Values, functions, nested objects                                                                                         |
| `pipes`            | object                                          | global/schema/instance | Pipe functions for expressions                                                                                            |
| `types`            | `{ [name]: token \| factory \| accessorMap }`   | global/schema/instance | Register types: on the namespace (global object form) and as pipes at every level; accessor maps extend a built-in family |
| `patterns`         | object                                          | **global only**        | Custom inline syntaxes; `variables` key customises the built-in                                                           |
| `variableResolver` | `(name, ctx, cache) => unknown`                 | global                 | On-demand lookup; `cache(v)` opts into the engine-lifetime store                                                          |
| `transformers`     | `{ [name]: { when, then } }`                    | global                 | Whole-value replacement                                                                                                   |
| `storage`          | `{ match, add, generateKey?, remove?, clear? }` | global                 | Cache backend (`StorageLike`)                                                                                             |
| `cache`            | `ParserCachingOptions`                          | global/schema/instance | `{ enabled, ...your options }`                                                                                            |
| `looseCasting`     | `boolean`                                       | global/schema/instance | `true`: log and drop failed casts (`'undefined'` is a deprecated alias)                                                   |
| `onCastError`      | `(error, ctx) => void`                          | global/schema/instance | Observe `ParserCastError`                                                                                                 |
| `before` / `after` | `(ctx) => ctx`                                  | global/schema/instance | Lifecycle hooks                                                                                                           |
| `pipeUndefined`    | boolean                                         | any                    | Run pipes on `undefined` values                                                                                           |

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

`.extend`/`.withContext` deep-merge context **except `before`/`after` hooks, which compose**:
base hook first, then the extension's (identical references dedupe).

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

`string` · `number` · `boolean` · `date` · `object` · `array` · `any` · `unknown` · `text` ·
`email` · `url` · `slug` · `color` · `tel` · `mimeType` · `json` · `unique(item)` ·
`oneOf(...values)` · `pattern(regex)`

- `types.array.of(token)` — per-item casting; nests. `types.json.of(token)` decodes then casts
- Universal chain: `.default(v)` (non-optional field) · `.required` (missing = failure, non-optional) · `.strict` · `.loose` · `.extend(fn)` (same family) · `.to(fn)` / `.to(token)` (new output / composition) · `.cast(value)`; or call the token: `types.x({ default, required, strict, loose })`
- Accessors per family — see `basics.md`; string-valued derivations are `StringType`s
- Classes: `TypeToken`, `StringType`, `NumberType`, `BooleanType`, `DateType`, `ObjectType`, `ArrayType`, `TextType`, `EmailType`, `UrlType`, `SlugType`, `ColorType`, `TelType`, `MimeTypeType`, `JsonType`, `OneOfType`, `PatternType`
- Subsets: `types/format` (`formatDate`, `currency`, `percent`, `time`, `duration`, `money`), `types/data` (`record`, `schema`, `coords`, `locale`), `types/content` (`html`, `markdown`, `sanitizeHtmlAdapter`, `ultrahtmlAdapter`, `markedAdapter`), `types/all`
- No `types.undefined` — accessing it throws. Tokens are callable with an options object only; types are never call parameters (`.of()`)

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
expression  := alternative ( '||' alternative )*
alternative := candidate ( '|' pipe )*
pipe        := name ( ':' param )*
candidate   := literal | dotted.path | ...
param       := literal | variableName
literal     := "string" | -?digits(.digits)? | true | false | null | undefined
```

Splitting is quote-aware (`"a | b:c"` stays one literal; `\"` escapes). Pipes chain; each
binds to its own fallback branch. First **defined** result wins (`false`/`0`/`''`/`null` stop
the chain; a pipe chain yielding `undefined` continues it). `name` is an explicit pipe, else a
type (`email`, `date.iso`, root accessor `upperCase`, factory `oneOf:"a":"b"`). `{{...}}`
returns the full merged variables object. Pipe params resolve from `context.variables` only.
Escape a whole match with a preceding backslash.

## Utilities

| Export             | Signature                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `defineType`       | `(fn \| Class \| { fn, name?, default?, required?, strict?, loose?, extends?, accessors?, methods? }, options?) => token` — `defineType(Class, options?)` is the factory form of `new`; with `extends`, `fn` refines the parent's output and its accessors are inherited |
| `isMissing`        | `(v) => boolean` — `undefined`, `null` or `''`                                                                                                                                                                                                                           |
| `isTypeToken`      | `(v) => v is TypeToken`                                                                                                                                                                                                                                                  |
| `applyCast`        | `(value, token, context?, { fallback? }?) => Promise<unknown>` — cast with the failure policy applied                                                                                                                                                                    |
| `notAPipe`         | `(factory) => factory` — mark a token-parameter factory so templates never call it                                                                                                                                                                                       |
| `typed<T>`         | Type-only marker; passes raw value through uncast                                                                                                                                                                                                                        |
| `optional`         | Marks a key optional without a type                                                                                                                                                                                                                                      |
| `condition`        | `(when, then) => { when, then }`                                                                                                                                                                                                                                         |
| `get`              | `(path) => (ctx) => Promise<T>` \| `(path, from) => Promise<T>`                                                                                                                                                                                                          |
| `toHash`           | `(data) => string` — deterministic, but **key-order sensitive** (see gotchas)                                                                                                                                                                                            |
| `asDate`           | `(v: string \| number) => Date \| undefined` — `undefined` for falsy input; unparseable input yields an `Invalid Date`, not `undefined`                                                                                                                                  |
| `mergeObjects`     | `(a, b) => merged`                                                                                                                                                                                                                                                       |
| `resolveVariables` | `(input, context) => Promise<T>` — deep pattern resolution only (no transformers/casting); needs a caller-supplied `ParserContext`, which is why `context.resolve` is the usual entry                                                                                    |
| `getVariableValue` | `(expression, context) => Promise<T>` — evaluates one variable expression; accepts the active variables syntax, the legacy `{{path}}` form, or a bare expression (v3 no longer auto-wraps bare names in `{{ }}`)                                                         |

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
