# What has changed?

Bou Parsing V3 is the biggest release yet. Types are no longer strings that describe values, they are **tokens that cast them at runtime** — with a use-case catalogue (`email`, `url`, `slug`, `tel`, `text`, …), chainable accessors (`types.date.iso`, `types.number.round(2)`), and every type usable as a `{{ value | pipe }}` in templates. The projection is now the point of truth for what gets resolved, every `initializeParser` call is its own isolated engine, and the `{{variable}}` syntax has grown into a full **patterns** API you can extend with your own inline syntaxes. Full details for every change live in [migration.md](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/migration.md).

~ The new version can be tested with dev tag: `npm i @bou-co/parsing@v3-rc` (`latest` is still V2).
~ To migrate faster using AI, you can add skills for your agents with: `npx @bou-co/parsing@v3-rc add-skills --all`

## Breaking Changes

### 1. String type identifiers → type tokens

Legacy identifiers (`'string'`, `'number'`, `'array<string>'`, …) throw a migration error. Use the `types` object returned by `initializeParser` (or the tree-shakeable `@bou-co/parsing/types` entry point — `types` is **not** a root export of `@bou-co/parsing`):

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
  tags: types.array.of(types.string),
});
```

`initializeParser` now returns `{ createParser, resolve, cacheResult, types }`. Types are never call arguments: items go through `.of()`, composition through `.to()` — `types.array(types.string)` throws, and so does a token placed in `variables`/`pipes` (register it under `types` instead). There is no `types.undefined` — use the `optional` util. ([migration.md §1](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/migration.md))

### 2. Types now actually cast

V2 identifiers passed values through untouched; V3 tokens coerce at runtime (`types.number` turns `'21'` into `21`) and throw a `ParserCastError` when they can't. Exactly two failure flows exist: **throw** (the default) or **log and drop** (`looseCasting: true` — the key is omitted or the token's `.default()` fills it). There is no pass-through mode, so the inferred output types are true at runtime in every configuration; `looseCasting: 'undefined'` is now a deprecated alias of `true`. A token can pin its own flow with `.strict` / `.loose`, and `onCastError` observes every failure before the policy applies.

Missing data is never a failure: `undefined`, `null` and the empty string `''` skip casting for **every** type and the key is omitted (V2's `'string'` passed `''` through) — unless the token is `.required`. `false` and `0` are values. `types.date` got stricter than V2's `'date'`: `false` and unparseable strings throw, `0` stays a valid epoch. ([migration.md §2–§3](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/migration.md))

### 3. The projection is the point of truth

Nested projections resolve from the schema instead of following the incoming data. Constants, token defaults, `@combine`, and `@if` inside a nested projection now produce output even when the input lacks the key — and **value functions run, side effects included**. Guard expensive nested fetches with a value function: `child: ({ data }) => (data['child'] ? childParser : undefined)`. Arrays stay data-driven. ([migration.md §5](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/migration.md))

### 4. Isolated parser engines

Each `initializeParser` call is its own engine with its own global context and caches — no more process-wide singleton, so separate server/client (or per-tenant) configurations coexist safely. The `Parser.parserGlobalContext` / `Parser.createParser` statics are gone and throw. ([migration.md §4](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/migration.md))

### 5. Nested parser context is fixed

`context.isRoot` is now `false` inside nested parsers (V2 leaked `true`), hooks fire **once** per nesting level instead of twice, `.extend()`/`.withContext()` **compose** hooks instead of replacing them, schema-level `cache` no longer flows into nested parsers, and a parser's signature is now `parser(input, instanceContext, parentContext)` — a full context in the second slot throws. ([migration.md §6](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/migration.md))

### 6. Pipes move out of `variables`

Pipe functions live in the new `pipes` config (all three levels); a pipe left in `variables` throws a targeted error. The `{{value | pipe}}` usage strings stay identical. One thing to grep for first: pipes resolve from `pipes`, then from **types**, then hit the `variables` catch — so a V2 pipe named like a built-in type or accessor (`email`, `trim`, `round`, `join`, …) is silently replaced by the type pipe instead of throwing. ([migration.md §8](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/migration.md))

### 7. Variables are now a pattern

`{{ }}` behaves as before with a few deltas: resolved output is **re-scanned** by default (cycles throw `ParserPatternCycleError`), `\` now escapes a match, repeated expressions in one string are deduped, `$`-sequences in resolved values are inserted literally, and the built-in heads (`data`, `ctx`, `context`) shadow the `variableResolver`. ([migration.md §9](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/migration.md))

### 8. Smaller breaking details

- `react` is now an **optional peerDependency** — install it yourself if you use `@bou-co/parsing/react`. `sanitize-html`, `ultrahtml` and `marked` are optional peers too, needed only by `@bou-co/parsing/types/content`.
- New engines floor: Node `^20.19.0 || >=22.12.0`.
- `valueKeys` export removed; `parser.asArray !== parser` anymore (it still hashes the same); `value`, `parent`, `path`, `store`, `resolve`, `pipes`, `types` are now reserved context keys written after your context spreads — treat `datalessPath` as reserved too.
- Expect a **one-time cache invalidation** if your storage relies on the default cache key (projection hashes changed when identifiers became tokens). Going forward token hashes are content-derived: editing a custom type's implementation or options intentionally invalidates the entries that used it.
- `asyncMapObject` resolves entries in parallel; `getVariableValue` no longer auto-wraps bare names; `mergeObjects` treats non-plain objects (tokens, `Date`) as atomic when merging contexts. ([migration.md §7](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/migration.md))

## New Features in V3

### Types & casting

- **Type tokens with a universal chain:** `types.*` validate _and_ cast at runtime. Every token is configured by chaining — `.default(v)`, `.required`, `.strict`, `.loose`, `.extend(fn)` (refine, keep the family), `.to(fn | token)` (derive or compose), `.cast(value)` — or with the same options as an object (`types.string({ default: 'Untitled' })`). A default makes the field non-optional in the inferred type; `.required` makes a missing value an error.
- **Use-case catalogue, no dependencies:** `text` (textarea tidying, line breaks kept), `email`, `url` (+ `.base(url)` for relative CMS links), `slug`, `color`, `tel`, `mimeType`, `json`, `unique(item)`, `oneOf(...values)` and `pattern(regex)` ship next to the primitives. They are named after **use cases, not rules** (no `min`/`max`/`nonEmpty`), and each documents what it accepts, normalises and rejects.
- **Accessors:** `types.date.iso`, `types.date.year`, `types.number.round(2)`, `types.string.trim.upperCase.truncate(80)`, `types.url.pathname`, `types.email.domain`, `types.text.wordCount`, `types.array.of(types.number).unique` — inference follows the last link of the chain. Every string-based type inherits the full `string` accessor set, and string-valued derivations keep chaining (`types.email.domain.upperCase`).
- **Custom types, three ways:** `defineType(fn)`, `defineType(SkuType)` for `class SkuType extends StringType` (inheriting every `string` accessor, with `super.cast`), or `defineType({ name, extends, fn, accessors, methods, default, … })`. Custom types are plain values — use them unregistered, from any file, with full inference.
- **Types as pipes:** every type, built-in or registered, is a template pipe under the same name — `{{ price | round:2 }}`, `{{ event.date | date.iso }}`, `{{ status | oneOf:"draft":"published" }}`. A template expression can now **validate**: `{{ contact | email || "n/a" }}` — a written `||` fallback turns a failed cast into `undefined` silently, even under the throwing policy.
- **`types` registration:** a new context option at all three levels (global, `createParser`, per call). Register tokens and factories by name, or an accessor map that extends a built-in family (`date: { relative: (value: Date) => timeAgo(value) }` → `types.date.relative`); object-form global registrations also extend the returned `types` namespace with full typing.
- **Opt-in subsets:** `@bou-co/parsing/types/format` (`formatDate` with Angular `DatePipe` pattern syntax on top of `Intl` — every runtime locale works with no locale data shipped —, `currency`, `percent`, `time`, `duration`, `money`), `types/data` (`record.of(value)`, `schema(validator)` for any [Standard Schema](https://standardschema.dev) — Zod 4, Valibot, ArkType —, `coords`, `locale`), `types/content` (`html` and `markdown` behind sanitiser adapters — `sanitizeHtmlAdapter`, `ultrahtmlAdapter`, `markedAdapter`; the only path with peer dependencies, loaded lazily with an error naming the package to install), and `types/all` (format + data). Single types import directly (`@bou-co/parsing/types/format/currency`). The package is `sideEffects: false` and the build verifies that named imports tree-shake.
- **Content types & security:** `html`/`markdown` never implement sanitisation, they adapt to one you choose; Markdown output always passes through the sanitiser. `sanitize-html` is the recommended default, `ultrahtml` the light option for edge/browser.
- **`get(path, type)` / `get(path, from, type)`:** cast a looked-up value in the engine, under the active failure policy, so one raw field feeds several outputs: `phoneTitle: get('phone', types.tel), phoneLink: get('phone', types.tel.href)`.
- **Casting failure policy:** `looseCasting` (global, schema, or per-call), `.strict`/`.loose` per token, and the `onCastError` reporter, which receives the `ParserCastError` (`path`, `key`, `type`, `received`, `cause`) before the policy applies and replaces the default warning.

### Engine & context

- **`parser.flat`:** parse `data[key]` and merge the result into the parent output, like `@combine` without the resolver.
- **`context.value` + zero-arg `await resolve()`:** the raw value at the current key, resolved lazily on demand.
- **`resolve`:** run variable/pattern resolution and transformers on hard-coded data without a projection — exported from `initializeParser` and contextually as `context.resolve`.
- **`cacheResult(key, fn)`:** declarative per-value caching through the global `storage` under a variable-interpolated key (`'profile-{{data.uid}}'`) — works in projections, `resolve` inputs, or standalone.
- **`context.store(key, fn)` / `context.storage`:** imperative get-or-compute caching with in-flight dedupe, independent of `cache.enabled`.
- **`context.parent` / `context.path`:** walk the context chain up to the root; know where you are in the projection tree.
- **Custom patterns:** define your own inline syntaxes (e.g. `$products.count`) via the `patterns` config — same engine as `{{variables}}`, with fallbacks, pipes, escaping, rescan control, and per-pattern cache modes.
- **Built-in context variables:** `{{data.*}}` and `{{ctx.*}}` / `{{context.*}}` read the current level's data and the live parser context from any string.
- **Richer expression grammar** shared by every pattern: quoted literals may contain `|`, `||`, `:` and `\"` (`{{ x | replace:"a|b":"c" }}`), plus negative/decimal numbers and `null`/`undefined` literals (`{{ a || -1.5 }}`).
- **React `revalidate`:** `useParserValue` now returns `{ result, loading, error, revalidate }` for on-demand re-parses.

### Packaging & tooling

- **New entry points:** tree-shakeable `@bou-co/parsing/types` for standalone type files (every built-in token and class plus `defineType`, never the parser engine), and `@bou-co/parsing/types/*` for the subsets and single types.
- **New exports:** `defineType`, `TypeToken` and the family classes (`StringType`, `NumberType`, …), `isTypeToken`, `isMissing`, `applyCast`, `notAPipe`, `ParserCastError`, `variablesPattern`, `ParserPatternCycleError`.
- **Docs:** the README now has a [Gotchas](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/README.md#gotchas) section (a misspelled variable path yields the literal string `"undefined"`, `''` is missing for every type, `slug` is ASCII-only, …) and a [why a type is (or isn't) built in](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/README.md#why-a-type-is-or-isnt-built-in) policy — what to use instead of `uuid`, `postalCode`, `iban`, `image`, …
- **Agent skills + CLI:** `npx @bou-co/parsing add-skills` installs the bundled `bou-parsing` and `bou-parsing-v2-to-v3-migration` skills for AI coding agents into your repo (`--all`, names, `--dir <path>`).

## Changed since rc2

Only relevant if you adopted an earlier `3.0.0-rc*` build, before the casting upgrade finished ([migration.md §10](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/migration.md)):

| rc2 form                                           | Now                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `types.array(types.string)`                        | `types.array.of(types.string)` — `types.array(token)` throws                          |
| `types.array(types.string)({ default: [] })`       | `types.array({ default: [] }).of(types.string)`                                       |
| `looseCasting: 'undefined'`                        | `looseCasting: true` (alias still accepted, removed in V4)                            |
| `looseCasting: true` passing the raw value through | removed — failed casts are dropped (or defaulted)                                     |
| `types.email` lower-casing the address             | kept as written — `.normalized` or `.lowerCase`                                       |
| `types.tel` → `+3580401234567`                     | kept as written — `.normalized` (`+358401234567`) / `.href`                           |
| `types.text` folding newlines to spaces            | line breaks kept — `.singleLine` folds                                                |
| `''` cast as a value                               | missing for every type — add `.required` where an empty value must be an error        |
| A token in `variables`/`pipes`                     | throws — register types under `types`                                                 |
| `types.x('nope')`                                  | throws `expected an options object` — `types.x({ default, required, strict, loose })` |
| `get(path, from)` only                             | unchanged — plus `get(path, type)` / `get(path, from, type)` casting in the engine    |

## Migrating

V3 fails fast on the common V2 leftovers — legacy type strings, pipes left in `variables`, the removed statics, `types.undefined`, a full context as a parser's second argument — with targeted errors that name the problem and the fix (these catches are transitional and will be removed in V4; a token passed as a call argument or placed in `variables`/`pipes` also throws, but that one is permanent design). For a low-risk rollout, migrate with `looseCasting: true` plus an `onCastError` reporter, fix or retype the reported fields (`types.any` for intentional raw passthroughs), then remove `looseCasting`. The step-by-step guide is in [migration.md](https://github.com/bou-co/parsing/blob/v3.0.0-rc3/migration.md), and `npx @bou-co/parsing add-skills` gives your coding agent the full migration playbook.

**Full Changelog**: https://github.com/bou-co/parsing/compare/v2.0.0...v3.0.0-rc3
