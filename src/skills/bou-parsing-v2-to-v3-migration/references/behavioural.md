# Tier 2 — behavioural changes (the audit)

Nothing in this file throws. Every item changes what your code does at runtime while
type-checking cleanly. This is the part of the migration that needs a code read.

Contents:

1. [Projection-driven nested resolution](#1-projection-driven-nested-resolution)
2. [Casting is real](#2-casting-is-real)
3. [Nested parser context: isRoot, parent, hooks, cache](#3-nested-parser-context-isroot-parent-hooks-cache)
4. [Patterns: re-scanning, escaping, deduping](#4-patterns-re-scanning-escaping-deduping)
5. [asArray identity and cache keys](#5-asarray-identity-and-cache-keys)
6. [Reserved context keys](#6-reserved-context-keys)
7. [Audit checklist](#7-audit-checklist)

---

## 1. Projection-driven nested resolution

**The single highest-risk change in the release.**

### What changed

In v2, a nested object projection, nested parser, or `.flat` parser was silently skipped
whenever the input lacked its key, or held a scalar there. In v3, nested projections resolve
from the schema. The nested level runs regardless of whether input data exists for it.

```ts
const parser = createParser({
  title: types.string,
  meta: {
    version: 3, // constant
    theme: types.string.default('light'), // default
    description: types.string, // needs data
  },
});

await parser({ title: 'Hello' });
// v2 → { title: 'Hello' }
// v3 → { title: 'Hello', meta: { version: 3, theme: 'light' } }
```

Most users considered the v2 behaviour a bug — parsing `{}` at the root already resolved
constants and defaults; only nested levels short-circuited. The fix is right. But it has
consequences that need auditing.

### The consequence that matters: side effects now run

Value functions, `@combine` resolvers, `context.store` fetches, and `variableResolver` calls
inside a nested projection **execute even when the input lacks the key**.

```ts
const authorParser = createParser({
  profile: async ({ data }) => await fetch(`/authors/${data.id}`).then((r) => r.json()),
});
const articleParser = createParser({ title: types.string, author: authorParser });

await articleParser({ title: 'No author on this one' });
// v2 → no fetch
// v3 → the fetch RUNS
```

At scale this is the difference between zero requests and one request per parse. On a listing
page parsing 100 items, it's 100 requests that didn't exist before.

**The fix is a one-liner.** Return the parser conditionally from a value function:

```ts
author: ({ data }) => (data['author'] ? authorParser : undefined);
```

Or detect dataless mode inside the function — `context.datalessPath` is present _only_ during
projection-driven resolution:

```ts
profile: async ({ data, datalessPath }) => {
  if (datalessPath) return undefined;
  return await fetch(`/authors/${data.id}`).then((r) => r.json());
};
```

### The rules that keep it predictable

- **Empty results are omitted.** If everything inside a nested projection depended on the
  missing data, the resolved object has no keys and the key is dropped entirely. Purely
  data-mapping projections therefore behave exactly as they did in v2 — which is why most
  parsers need no change at all. Cascades naturally through deep nesting.
- **Empty-result detection counts keys, not values.** An `after` hook or `@combine` that
  unconditionally injects keys makes every projection-driven resolution non-empty, so the
  omission stops applying. Hook output is output.
- **Arrays still require data.** `'@array': true`, array literals, and `parser.asArray` keep
  their data-driven skip and are never conjured from nothing.
- **`context.data` is `{}`** during projection-driven resolution. The parent level's data
  object is reachable via `context.parent.data`, the raw value at the key via
  `context.parent.value`.
- **Recursive schemas terminate.** A self-referencing (or mutually referencing) parser resolves
  the cycle once more with its data-independent fields, then stops — instead of relying on the
  data running out. Caveat: recursion built as a _literal object cycle_ can't be hashed for
  caching; reference parsers through value functions instead.
- **A truthy scalar at an object-projection key no longer leaks the projection.** v2 returned
  the raw projection object, live functions included. v3 resolves it, with the scalar reachable
  at `context.parent.value`.
- **Custom `generateKey` caveat.** Projection-driven parses always receive `{}` as data, so a
  cache key built only from projection + data collides across different parents. The default key
  (which hashes the full call) is unaffected.

### How to find affected code

Search for every nested parser and nested projection that performs I/O or has observable side
effects. Concretely: within `createParser` projections, look for `async` value functions,
`fetch`/client calls, `@combine`, `context.store`, and `cacheResult` that sit **inside a nested
level** rather than at the root. Those are the ones whose call count changes.

Rank by blast radius: a nested parser used inside an `.asArray` on a listing page is the worst
case, because the multiplier is the page size.

---

## 2. Casting is real

### What changed

Most v2 identifiers passed values through untouched — `'number'` did not make anything a
number. v3 tokens coerce: `types.number` turns `'21'` into `21`, `types.date` parses strings
into `Date` instances, and values that can't be cast throw `ParserCastError`.

This means **fields that were quietly the wrong shape in v2 now throw**. That is the point of
the upgrade, but it means a v2 codebase pointed at v3 will surface every latent mapping bug at
once. Handle it with the staged rollout in `rollout.md` rather than fixing them under a wall of
exceptions.

### The one that catches people: `date`

`'date'` was the single v2 identifier that already coerced (via `new Date(...)`), and it got
**stricter**. Inputs that previously yielded an `Invalid Date` — `false` and unparseable strings —
now throw. `''` does **not**: it is missing for every type (key omitted, or the default fills;
`.required` to fail). `0` is a valid epoch number and casts to `new Date(0)`.

If code relied on receiving an Invalid Date and checking `isNaN(d.getTime())` downstream, that
branch is now unreachable and the parse fails earlier. Either clean the input or define a
lenient custom type:

```ts
const looseDate = defineType((value) => {
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? undefined : d;
});
```

### What doesn't throw

`undefined`, `null` and `''` skip casting entirely and the key is omitted — for every type,
including `string`, which in v2 passed `''` through — so genuinely optional fields are
unaffected. Tokens with a `default` fill it in instead, and their field becomes
non-optional in the inferred type.

### Intentional passthroughs

Where a field really should carry arbitrary data, say so explicitly: `types.any`. It's honest,
it documents intent, and it won't throw. Reaching for `looseCasting: true` globally to avoid
retyping a handful of fields trades a permanent guarantee for a temporary convenience.

---

## 3. Nested parser context: isRoot, parent, hooks, cache

### What changed

In v2, a nested **parser** received the whole parent context in its instance-context slot. v3
passes the parent context as a proper third channel. That fixes several leaks at once:

**`context.isRoot` is now `false` inside nested parsers.** v2 leaked `isRoot: true` into every
nested parser (nested plain-object projections correctly reported `false`) and _mutated the
caller's context object_ to track it. v3 computes it per level without mutation: `true` only at
the actual root, for every kind of nesting.

→ **Audit:** once-per-parse work guarded by `context.isRoot` inside a nested parser no longer
runs there. Walk the new `context.parent` chain if you need to detect the root:

```ts
const isActualRoot = (ctx) => {
  while (ctx.parent) ctx = ctx.parent;
  return ctx;
};
```

**Hooks run once per level instead of twice.** Because the parent context no longer doubles as
the nested parser's instance context, global and per-call `before`/`after` hooks fire once per
nesting level. Schema (`createParser`) hooks fire for that parser's own levels but not inside
nested inline object projections, and at arrays the hooks run per item rather than for the
array level.

→ **Audit:** idempotent hooks won't notice. Hooks that count, push to an array, increment a
metric, or emit telemetry will report roughly half what they used to. If a dashboard is built on
those numbers, expect a step change that isn't a traffic change.

**`.extend()` / `.withContext()` compose hooks instead of replacing them.** In v2 the
extension's `before`/`after` overwrote the base parser's hook (last write wins, via the plain
context merge). In v3 they chain: the base hook runs first, then the extension's, which receives
the context the base hook returned. Identical function references are deduped, and all other
context keys keep the old merge semantics — only hooks compose.

→ **Audit:** find `.withContext(...)` / `.extend(...)` calls that pass `before` or `after` on a
parser whose `createParser` context also has one. In v2 that silenced the base hook; in v3 both
run, in base-then-extension order. If replacement was the intent, restructure: put the base
behavior behind a context flag the extension can switch off, or create the variant with a
separate `createParser` instead of extending.

**Schema-level `cache` options no longer flow into nested parsers.** Each parser brings its own
`createParser` cache config. Per-call cache still propagates.

→ **Audit:** with a custom `generateKey` that requires a cache `name`, a nested parse that
previously inherited the parent's name now throws `Caching options must have a name defined`.
This one _does_ announce itself — it's in the Tier 1 error table — but the cause is this
behavioural change, so fix it by giving the nested parser its own cache config rather than by
loosening `generateKey`.

**Calling conventions changed with it** — see `mechanical.md` §6.

### New context capabilities

While auditing, note what's now available, since it often simplifies code written around the v2
limitations:

- `context.parent` — the enclosing context, chaining to the root
- `context.path` — the chain of projections from root to here
- `context.value` — the raw `data?.[key]`, replacing `({ data, key }) => data[key]`
- `context.resolve()` — zero-arg form lazily resolves `context.value`, memoized
- `context.store(key, fn, options?)` — get-or-compute caching with in-flight dedupe
- `context.storage` — the configured backend directly

---

## 4. Patterns: re-scanning, escaping, deduping

`{{variable}}` interpolation is now implemented as a built-in **pattern**. Existing syntax,
fallbacks, pipes, dot paths, and `variableResolver` behave as before, with these deltas:

**Built-in context heads shadow the `variableResolver`.** `{{data.*}}`, `{{ctx.*}}` and
`{{context.*}}` now resolve from the live context — checked after explicit variables but before
the resolver, and they never fall through to it.

→ **Audit:** a `variableResolver` that previously received `data`, `ctx`, or `context` as its
head segment is no longer called for those. Rename the variable in content, or define it as an
explicit variable (explicit variables still win over the built-ins).

**Resolved output is re-scanned by default.** A variable resolving to a string containing
`{{other}}` now resolves that too; v2 left it literal. Cycles — and rescan chains more than 10
levels deep — throw `ParserPatternCycleError` instead of hanging.

→ **Audit:** if content in your CMS legitimately contains variable syntax as _text_ (docs
about templating, code samples, help articles), it now resolves. Opt out globally with
`patterns: { variables: { rescan: false } }`, or escape it.

**Escaping now exists, and it changes existing output.** A backslash directly before a match
suppresses it and is consumed: `\{{foo}}` outputs `{{foo}}`. `\\` before a match is a literal
backslash.

→ **Audit:** any existing content containing `\` immediately before `{{` renders differently
now. Rare, but a global search for `\{{` across your content store is cheap and definitive.

Worth knowing while you're there: escaping is **not idempotent across two passes**. The
backslash is consumed on pass one, so `\{{who}}` becomes the literal `{{who}}` — which a second
parse will resolve. This matters because parser output loses its "already parsed" marker at any
serialization boundary (JSON round-trip, cache storage, RSC boundary), making a second pass easy
to trigger accidentally.

**Matches are deduped per string.** The same `{{expression}}` occurring N times in one string
resolves once. Visible only with non-deterministic resolvers — if a variable returns a random
value or a timestamp, repeated occurrences in one string now agree with each other where they
used to differ.

**`$`-sequences in resolved values are now inserted literally.** `$&`, `$1`, and `$$` in a
resolved value were previously mangled by the string splice. If you worked around that, remove
the workaround.

**`patterns` is global-only config.** Unlike `variables` and `pipes`, it can't be set per
`createParser` or per call; the registry compiles once per engine.

**`variableResolver` cache lifetime.** The resolver's `cache()` callback keeps an
**engine-lifetime** store. Values cached there are served for the life of the engine — across
requests and across tenants. For per-request data, prefer a pattern with `cache: 'run'`
(memoized per parse, the default for user patterns) or `'storage'`.

→ **Audit:** this one is a potential data-leak class, not just a behaviour change. If any
`variableResolver` caches user-scoped or tenant-scoped values, it needs to move.

---

## 5. asArray identity and cache keys

`parser.asArray` is no longer the parser function itself but a derived variant.

- `parser.asArray === parser` is now `false`. Identity comparisons break.
- It still **hashes as its base parser** (`String(parser.asArray) === String(parser)`), so as
  a projection value the two are indistinguishable to `toHash`.
- Calling `parser.asArray(...)` directly bypasses the whole-parse caching proxy — such calls
  get no whole-parse cache entries; caching applies when it sits inside a cached parent parse.

The v2 bug was the shared function identity itself (`asArray` was literally the same object as
the parser). Projection hashes also changed across the board in v3, so if you have persisted
cache from v2, expect a cold start regardless.

**Cache invalidation generally:** if your `storage` relies on the **default** cache key, expect
a one-time invalidation — projection hashes changed when identifiers became tokens. Storages
with their own `generateKey` are unaffected unless they hash the projection. Going forward,
token hashes are content-derived, so editing a custom type's implementation (or its `name`,
`default`, `required`, `strict`/`loose` policy, item type or factory options) intentionally
invalidates entries that used it. `get()` readers now stringify by path and type (`__get:a.b__`)
instead of their shared closure source, so parsers that differ only in a `get` path get distinct
hashes — one more source of changed keys.

---

## 6. Reserved context keys

The keys the v3 engine writes _after_ your context spreads are: `data`, `key`, `projection`,
`variables`, `pipes`, `types`, `isRoot`, `cache`, `value`, `parent`, `path`, `store`, and
`resolve`; `datalessPath` is set on the parent context during projection-driven resolution and
inherited from there. New relative to v2 are **`value`, `parent`, `path`, `store`, `resolve`,
`pipes`, `datalessPath`, `types`**. Custom context properties with those names are **silently
overwritten** (a custom `datalessPath` survives but breaks the projection-driven guard) — no
error, no warning. (`parser` is engine-set _before_ the spreads, `index`
is injected for array items, `params` inside pipes — treat all three as reserved too.)

→ **Audit:** grep your `withContext` calls, per-call contexts, `before` hooks, and any
`declare module` augmentations for the new names. A custom `context.value` or
`context.resolve` from v2 is now gone, and the code reading it will see the engine's version
instead, which will usually look like a mysterious type mismatch rather than a naming
collision.

---

## 7. Audit checklist

Work through this against the inventory from step 1 of the SKILL.md sequence. Each line is a
search you can actually run.

**Side effects in nested levels** — the expensive one

- [ ] Every nested parser used as a projection value: does it perform I/O?
- [ ] Every `@combine` inside a nested projection: does its resolver fetch?
- [ ] Every `context.store` / `cacheResult` below the root level
- [ ] Every `variableResolver` that fetches, and whether nested projections can now reach it
- [ ] Nested parsers inside `.asArray` on list pages — highest multiplier, check first

**Casting**

- [ ] Fields typed `'date'` in v2 where input may be falsy or unparseable
- [ ] Fields where the declared v2 type never actually matched the data
- [ ] Intentional raw passthroughs — retype as `types.any` rather than loosening globally

**Context**

- [ ] `context.isRoot` used inside a nested parser
- [ ] Hooks that count, push, or emit telemetry (expect ~half the calls)
- [ ] `before`/`after` passed to `.extend()`/`.withContext()` on a parser that already has one (now both run, base first, instead of the extension replacing the base)
- [ ] Nested parsers relying on an inherited cache `name`
- [ ] Custom context properties named `value`, `parent`, `path`, `store`, `resolve`, `pipes`, `types`, `datalessPath`
- [ ] Manual nested parser calls passing context as the 2nd argument
- [ ] Code relying on `asyncMapObject` running its callback sequentially in key order (now parallel)

**Patterns and content**

- [ ] Content containing `{{` as literal text (now re-scanned)
- [ ] Content containing `\` immediately before `{{` (escaping changed)
- [ ] Non-deterministic variables appearing more than once in one string (now deduped)
- [ ] A `variableResolver` handling `data`, `ctx`, or `context` as a head segment (built-in heads now intercept those)
- [ ] `variableResolver` `cache()` holding user- or tenant-scoped values — **leak risk**
- [ ] Workarounds for `$&`/`$1`/`$$` mangling (now unnecessary)

**Caching**

- [ ] Custom `generateKey` built only from projection + data (collides under dataless parses)
- [ ] Storage callbacks (`generateKey`/`match`/`add`) reading `context.parser` (was `undefined` in v2, now the engine instance)
- [ ] Identity comparisons against `parser.asArray`
- [ ] Plan for one cold cache after deploy

When every box is either checked or explicitly ruled out, move to `rollout.md` for verification.
