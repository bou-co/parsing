# API reference

Condensed signature lookup. For behaviour and use cases see `features.md`.

## Entry points

| Import path                      | Contains                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `@bou-co/parsing`                | `initializeParser`, `Parser`, utils, errors, types-as-types                                   |
| `@bou-co/parsing/types`          | Every built-in token and class individually + `defineType`. Tree-shakeable, no engine         |
| `@bou-co/parsing/types/*`        | Opt-in subsets `format`, `data`, `content`, `all`, or a single type (`types/format/currency`) |
| `@bou-co/parsing/react`          | `useParserValue`                                                                              |
| `@bou-co/parsing/templates/*`    | Shipped templates, e.g. `templates/localize`                                                  |
| `npx @bou-co/parsing add-skills` | CLI (`bin: bou-parsing`) — copies the bundled agent skills into a repo, see [CLI](#cli)       |

Node `^20.19.0 || >=22.12.0`. React, `sanitize-html`, `ultrahtml` and `marked` are optional
peer dependencies (the last three only for `types/content`).

## Core functions

### `initializeParser(config?)`

Creates an isolated engine. `config` is an object, or a sync/async function returning one.

**Returns** `{ createParser, resolve, store, types, variables }`.

Config keys:

| Key                | Type                                            | Scope                  | Notes                                                                                                                       |
| ------------------ | ----------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `variables`        | object                                          | global/schema/instance | Values, functions, nested objects                                                                                           |
| `pipes`            | object                                          | global/schema/instance | Pipe functions for expressions                                                                                              |
| `types`            | `{ [name]: token \| factory \| accessorMap }`   | global/schema/instance | Register types: on the namespace (global object form) and as pipes at every level; accessor maps extend a built-in family   |
| `patterns`         | object                                          | **global only**        | Custom inline syntaxes; `variables` key customises the built-in                                                             |
| `variableResolver` | `(name, ctx, cache) => unknown`                 | global                 | On-demand lookup; `cache(v)` opts into the engine-lifetime store                                                            |
| `transformers`     | `{ [name]: { when, then } }`                    | global                 | Whole-value replacement                                                                                                     |
| `storage`          | `{ match, add, generateKey?, remove?, clear? }` | global                 | Cache backend (`StorageLike`)                                                                                               |
| `cache`            | `ParserCachingOptions`                          | global/schema/instance | `{ enabled, ttl, ...your options }`; `ttl` is forwarded to the backend as `context.cache.ttl`, never applied by the library |
| `looseCasting`     | `boolean`                                       | global/schema/instance | `true`: log and drop failed casts (`'undefined'` is a deprecated alias)                                                     |
| `onCastError`      | `(error, ctx) => void`                          | global/schema/instance | Observe `ParserCastError`                                                                                                   |
| `before` / `after` | `(ctx, inherited?) => ctx`                      | global/schema/instance | Lifecycle hooks; declaring `inherited` means the hook calls the earlier hooks itself (`await inherited(ctx)`)               |
| `pipeUndefined`    | boolean                                         | any                    | Run pipes on `undefined` values                                                                                             |

### `createParser(projection, options?)`

`projection` is an object literal or a `(context) => projection` function.

**Returns** an async parser `(input, instanceContext?, parentContext?) => Promise<Output>`.
`instanceContext` becomes required once `InstanceContext` is augmented with a required key.

Properties and methods on the returned parser:

| Member                  | Type   | Effect                                                    |
| ----------------------- | ------ | --------------------------------------------------------- |
| `.extend(projection)`   | parser | Merged projection, original unmutated                     |
| `.withContext(context)` | parser | Merged context                                            |
| `.asArray`              | parser | Per-item parse; `!== parser`, hashes like its base parser |
| `.flat`                 | parser | Parse `data[key]`, merge into parent, drop the key        |
| `.as<T>(data, ctx?)`    | call   | The same parse with the output type asserted as `T`       |
| `.projection`           | object | The projection definition                                 |

`.extend`/`.withContext` deep-merge context **except `before`/`after` hooks, which compose**
into one chain per level: global → base → each `.extend` → `.withContext` → per call (identical
references dedupe). A hook declaring `(context, inherited)` runs the earlier part of the chain
itself, or skips it by not calling `inherited`. `.extend` throws on a
parser built from a function projection.

Passing a full parser context as the **second** argument throws — forward it as the third.

### `resolve(input, contextOverride?)`

Runs transformers and patterns on raw input with no projection, projection-level casting, or
hooks (`value` / `variable` / `get` with a token still cast). Accepts objects, arrays, strings,
promises, and functions. Return type inferred from input; pass an explicit
generic when a transformer reshapes values. Like a parser call, the instance context becomes required once `InstanceContext` is augmented with a required key (`context.resolve` overrides stay optional).

### `store(key, fn, options?)`

Get-or-compute: the value cached under the variable-interpolated `key`, or `fn(context)`'s
result stored there on a miss. Usable standalone (lazy — runs when awaited), as a projection
value or inside a `resolve` input (runs per parse, key interpolated against the live context).
Every context carries a bound `context.store` (eager) with the same members. `options` merges
into `context.cache` for the backend (e.g. `ttl`). The returned value is a value function, an
awaitable (`.then` / `.catch` / `.finally`) and a zero-arg callable in one.

| Member                                                                       | Returns                   | Notes                                                    |
| ---------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| `store.match<T>(key, options?)`                                              | `Promise<T \| undefined>` | `null` from the backend is a miss                        |
| `store.add({ key?, value, ...options })` / `store.add(key, value, options?)` | `Promise<string>` (key)   | No `key` → `store:<content hash>`; one arg = object form |
| `store.remove(key, options?)` / `store.clear(options?)`                      | `Promise<void>`           | No-op when the backend lacks `remove` / `clear`          |

### `new Parser(globalContext)`

Advanced form of `initializeParser`, when you need the engine instance itself — it carries
`createParser`, `resolve`, `store` and `types`. The v2 statics
`Parser.parserGlobalContext` and `Parser.createParser` are removed and throw on access.

## Built-in types

From `initializeParser().types`, or individually from `@bou-co/parsing/types`.

`string` · `number` · `boolean` · `date` · `object` · `array` · `any` · `unknown` · `text` ·
`email` · `url` · `slug` · `color` · `tel` · `mimeType` · `json` · `unique(item)` ·
`oneOf(...values)` · `pattern(regex | source, flags?)` (named groups → group map)

- `types.array.of(token)` — per-item casting; nests. `types.json.of(token)` decodes then casts
- Universal chain: `.default(v)` (non-optional field) · `.required` (missing = failure, non-optional) · `.strict` · `.loose` · `.extend(fn)` (same family) · `.to(fn)` / `.to(token)` (new output / composition) · `.cast(value)`; read-only `name`, `id`, `defaultValue`, `isRequired`, `policy`; or call the token: `types.x({ default, required, strict, loose })`. `.of()` on `array`/`record` keeps a default/required set before it. `defaultValue` is the token's own (last-set) default only
- Accessors per family — see `basics.md`; string-valued derivations are `StringType`s. `required`/`strict`/`loose` carry through accessors and `.to()`; a `default` set earlier runs through the later steps, the last-set one is used as written; the field is non-optional wherever `default`/`required` sits
- Class helpers (protected): `this.transform(key, fn, params?)` → same family; `this.derive(key, fn, params?, to?)` → new output, composed onto the family token `to` when given, typed `Carry<this, …>`
- Classes: `TypeToken`, `StringType`, `NumberType`, `BooleanType`, `DateType`, `ObjectType`, `ArrayType`, `AnyType`, `UnknownType`, `TextType`, `EmailType`, `UrlType`, `SlugType`, `ColorType`, `TelType`, `MimeTypeType`, `JsonType`, `OneOfType`, `PatternType`
- Subsets: `types/format` (`formatDate(format = 'mediumDate', tz?, locale?)` — Angular `DatePipe` presets/tokens on `Intl`, `currency(code?, locale?, options?)`, `percent(digits?, locale?)`, `time`, `duration`, `money`, `formatDateValue`, spread object `formatTypes`), `types/data` (`record`, `schema`, `coords`, `locale`, spread object `dataTypes`), `types/content` (`html(adapter, options?)`, `markdown(parser, sanitiser, { parser?, sanitiser? }?)`, `sanitizeHtmlAdapter`, `ultrahtmlAdapter`, `markedAdapter`, `toPlainText`, `DEFAULT_DROP_ELEMENTS`, `createLoader`, `SanitiserAdapter`/`MarkdownAdapter`), `types/all` (`allTypes` = format + data); subset classes `DurationType`, `MoneyType`, `TimeType`, `CoordsType`, `LocaleType`, `RecordType`, `HtmlType`, `MarkdownType`. Accepted inputs per subset type: `basics.md`
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

See the full table in `basics.md` (_The ParserContext object_). Reserved keys (engine-written after your spreads,
overwrite yours): `data`, `key`, `projection`, `variables`, `pipes`, `types`, `isRoot`,
`cache`, `value`, `parent`, `path`, `store`, `resolve` — plus `datalessPath` (inherited from
the parent context during projection-driven resolution), `parser` (engine-set before the
spreads), `index` (array items), and `params` (pipes), which you should treat as reserved too.

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
type (`email`, `date.iso`, root accessor `upperCase`, factory `oneOf:"a":"b"`; universal members
`strict` / `loose` / `required` / `default:"x"`). `{{...}}`
returns the full merged variables object (no pipes). Pipe params resolve from `context.variables` only.
Escape a whole match with a preceding backslash.

## Utilities

| Export             | Signature                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defineType`       | `(fn \| Class \| { fn, name?, default?, required?, strict?, loose?, extends?, accessors?, methods? }, options?) => token` — `defineType(Class, options?)` is the factory form of `new`; with `extends`, `fn` refines the parent's output and its accessors are inherited        |
| `isMissing`        | `(v) => boolean` — `undefined`, `null` or `''`                                                                                                                                                                                                                                  |
| `isTypeToken`      | `(v) => v is TypeToken`                                                                                                                                                                                                                                                         |
| `applyCast`        | `(value, token, context?, { fallback? }?) => Promise<unknown>` — cast with the failure policy applied                                                                                                                                                                           |
| `notAPipe`         | `(factory) => factory` — mark a token-parameter factory so templates never call it                                                                                                                                                                                              |
| `typed<T>`         | Type-only marker; passes raw value through uncast                                                                                                                                                                                                                               |
| `optional`         | Marks a key optional without a type                                                                                                                                                                                                                                             |
| `condition`        | `(when, then) => { when, then }`                                                                                                                                                                                                                                                |
| `get`              | `(path) => (ctx) => Promise<T>` \| `(path, token) => value fn` \| `(path, from) => Promise<T>` \| `(path, from, token) => value fn & PromiseLike` — with a token the engine casts the looked-up value like a token at the key (`phoneLink: get('phoneNumber', types.tel.href)`) |
| `value`            | `(input, token) => value fn` — patterns in `input` resolve, then the engine casts like a token at the key (`title: value('{{siteName}}', types.string.required)`); a function input is called with the context first                                                            |
| `variable`         | `(expression) => (ctx) => Promise<T>` \| `(expression, token) => value fn` — evaluates the inside of a variable (`'user.name \|\| "Guest" \| upperCase'`) through the active variables pattern; with a token cast like `value`                                                  |
| `toHash`           | `(data) => string` — deterministic, but **key-order sensitive** (see gotchas); functions and `RegExp` values hash by source                                                                                                                                                     |
| `asDate`           | `(v: string \| number) => Date \| undefined` — `undefined` for falsy input; unparseable input yields an `Invalid Date`, not `undefined`                                                                                                                                         |
| `mergeObjects`     | `(a, b) => merged`                                                                                                                                                                                                                                                              |
| `resolveVariables` | `(input, context) => Promise<T>` — deep pattern resolution only (no transformers/casting); needs a caller-supplied `ParserContext`, which is why `context.resolve` is the usual entry                                                                                           |
| `getVariableValue` | `(expression, context) => Promise<T>` — evaluates one variable expression; accepts the active variables syntax, the legacy `{{path}}` form, or a bare expression (v3 no longer auto-wraps bare names in `{{ }}`)                                                                |

## Errors

| Error                     | Thrown when                          | Carries                                    |
| ------------------------- | ------------------------------------ | ------------------------------------------ |
| `ParserCastError`         | A cast fails (and policy says throw) | `path`, `type`, `key`, `received`, `cause` |
| `ParserPatternCycleError` | Pattern cycle, or rescan >10 deep    | `chain` (`<pattern>:<match>` steps)        |

`ParserCastError.name` is `'ParserCastError'`; a standalone `.cast()` reports the path `<root>`.

## Types

| Type                                                                                      | Purpose                                                                                                |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ParserReturnValue<typeof parser>`                                                        | Extract output type                                                                                    |
| `ParserContext`                                                                           | The context object                                                                                     |
| `ParserFunction<T>`                                                                       | A parser's callable shape                                                                              |
| `ParserProjection`                                                                        | Projection constraint                                                                                  |
| `ParserCachingOptions`                                                                    | Augment via module declaration for your backend's options                                              |
| `CommonContext`, `GlobalContext`, `CreateContext`, `InstanceContext`, `FunctionalContext` | Augment via module declaration to type custom context                                                  |
| `ParserProjectionValue`                                                                   | Legal projection values (incl. `Promise<unknown>`)                                                     |
| `GetValueFunction<T>`, `GetValue<T>`, `GetOutput<T>`, `GetDefaulted<T>`                   | Return/output types behind `get`/`value`/`variable` casts                                              |
| `Carry<This, T>`                                                                          | `T`, non-optional when `This` has a default or is required — the return type of custom class accessors |
| `ParserContextHook`, `ParserInheritedHook`                                                | `(context, inherited) => context` and the `inherited` function it receives                             |

## React

```ts
useParserValue(data, parser) => { result, loading, error, revalidate }
```

`revalidate(updatedData?)` re-parses; passing data bypasses change detection. A later change
of the `data` prop (to a different hash) parses the prop again.

## CLI

```
npx @bou-co/parsing add-skills [names...] [--all] [--dir <path> | --dir=<path>]
```

Copies the bundled skills (`bou-parsing`, `bou-parsing-v2-to-v3-migration`) into
`.claude/skills/` (or `--dir`). An existing skill folder is **deleted and replaced**, so local
edits inside it are lost. With no names and no `--all`: an interactive prompt on a TTY
(`1,2`, `all`, empty cancels), otherwise usage plus the available list and exit code 1.
Unknown options, unknown skill names and `--dir` without a path are errors. `npx @bou-co/parsing`
with no command prints usage; an unknown command prints usage with exit code 1.
