# Gotchas

Ordered roughly by how often they bite. Entries marked **[verified]** were confirmed by
running against the v3 source rather than read from the docs — several are not documented
anywhere, and a couple contradict what the README implies.

## Templating

### A misspelled variable path produces the literal string `"undefined"` **[verified]**

A missing or misspelled path resolves to `undefined` with **no log at all** — walking through
a missing key or a non-object just returns `undefined`. (`console.debug` fires only when
something actually throws along the way: a throwing getter, a throwing variable function, a
duck-typed `get()` that errors.)

```ts
await parser({ b: 'Hi {{user.nmae.deep}}' });
// → { b: 'Hi undefined' }
```

That string ships to production looking like real content, and nothing in the logs points at
it. If editors control the templates, validate the rendered output or supply fallbacks
(`{{user.name || ""}}`) as a house rule.

### Embedded vs full-string matches behave differently **[verified]**

The same missing variable produces two different outcomes depending on position:

```ts
createParser({ a: types.string, n: types.number });
// { a: 'Hi {{nope}}' }  → { a: 'Hi undefined' }   ← literal string spliced in
// { n: '{{nope}}' }     → { }                     ← undefined, so key omitted
```

A full-string match returns the raw resolved value, which stays `undefined` and is dropped by
the normal optionality rule. An embedded match is spliced into surrounding text, and
`undefined` stringifies. Neither is wrong, but they are easy to conflate when debugging.

### Escaping is not idempotent across two passes **[verified]**

The backslash is _consumed_ on the first pass, so escaped content survives one parse and then
resolves on the next:

```ts
await parser({ a: 'hi {{who}} and \\{{who}}' });
// pass 1 → 'hi world and {{who}}'     ← correct
// re-parse that output → 'hi world and world'  ← the escape is gone
```

This matters because parser output loses its "already parsed" marker at any serialization
boundary (see below), so a second pass is easy to trigger accidentally. If you need `{{...}}`
to survive as literal text through storage or an RSC boundary, escape it at render time, not
at parse time — or use a placeholder the pattern doesn't match.

### The `_parsed` marker doesn't survive serialization **[verified]**

Parser output is a `Proxy` whose `get` trap answers `_parsed: true`. That marker is how the
engine knows not to re-resolve already-parsed objects. But:

```ts
out._parsed          // true
'_parsed' in out     // false
Object.keys(out)     // ['a']  — marker absent
JSON.parse(JSON.stringify(out))._parsed   // undefined
{ ...out }._parsed                        // undefined
```

So spreading, `JSON` round-tripping, `structuredClone`, storing in Redis, or crossing the RSC
serialization boundary all strip it. Any of those followed by another parse re-runs
transformers and patterns on the content. Usually harmless; occasionally not (see escaping,
above, and non-deterministic variable resolvers).

Deliberate chaining (`await stepTwo(await stepOne(raw))`) is fine — it happens in-process with
the Proxy intact.

### Any object with a `.get()` method becomes a lookup interface **[verified]**

Undocumented duck-typing in the variable resolver: if a value along a dot path has a `get`
method, it is called with the next key.

```ts
initializeParser({ variables: { cfg: new Map([['token', 'FROM_MAP']]) } });
// '{{cfg.token}}' → 'FROM_MAP'
```

Handy for `Map`, `Headers`, `URLSearchParams`, and custom stores. Surprising if your data
happens to have a field literally named `get` that is a function — the path will be routed
through it instead of read as a property.

### Resolver-cached variables shadow everything **[verified]**

Values cached through the `variableResolver`'s `cache()` callback are merged into
`context.variables` **last** on every later parse — after global, schema, and instance
variables. Once a head is cached, even an instance variable of the same name can't override
it for the life of the engine.

### Resolved output is re-scanned by default

A variable resolving to a string containing `{{other}}` resolves that too. Cycles and chains
deeper than 10 levels throw `ParserPatternCycleError` rather than hanging. Opt out with
`patterns: { variables: { rescan: false } }`. If editors can put variable syntax into variable
_values_, this is either a feature or an injection vector depending on your setup.

### `$` sequences in resolved values are inserted literally

`$&`, `$1`, `$$` in a resolved value are no longer mangled by the string splice. Correct
behaviour, but a change if you had worked around the old mangling.

## Casting

### `looseCasting: true` makes declared types dishonest **[verified]**

```ts
initializeParser({ looseCasting: true });
await createParser({ n: types.number })({ n: '12px' });
// → { n: '12px' }, typeof n === 'string', but TypeScript says number
```

Use `looseCasting: 'undefined'` when output types must stay honest — the fields are optional
in the inferred type anyway, so dropping is type-safe in a way passing through is not.
Reserve `true` for migration triage.

### `types.date` is stricter than v2's `'date'`

Inputs that previously produced an `Invalid Date` now throw — `''` and `false` included. Any
code relying on getting an Invalid Date back needs a custom type. Note that `0` is **not** one
of them: it's a valid epoch number and casts to `new Date(0)`.

### `default` is not cast

The default is returned as-is; TypeScript enforces that it matches the output type, but no
runtime casting happens. `types.number({ default: '0' as any })` will hand you a string.

### `default` does not rescue hard failures

Without `looseCasting`, a present-but-invalid value still throws even when a default exists.
Defaults cover _absent_, not _invalid_. `strict` types always throw.

### Custom type factories need `name` for correct caching

Closures are invisible to hashing, so two types built from one factory function hash
identically and share cache entries:

```ts
// Wrong — scaled(2) and scaled(3) collide in the cache
const scaled = (f: number) => defineType({ fn: (v) => Number(v) * f });

// Right
const scaled = (f: number) => defineType({ fn: (v) => Number(v) * f, name: `scaled-${f}` });
```

### `toHash` is key-order sensitive **[verified]**

```ts
toHash({ a: 1, b: 2 }); // 'jGsBKp'
toHash({ b: 2, a: 1 }); // 'bOmXNt'
```

`toHash` is `JSON.stringify` + a djb2-style string hash, with no key sorting anywhere, so key
insertion order feeds straight into the digest. Since `toHash` is the documented tool for
building cache keys, this matters: an object assembled in varying key order — conditionally
built, spread from differently-ordered sources, merged in different sequences — produces
different keys for identical content and silently misses the cache forever.

Sort before hashing when the input's key order isn't guaranteed:

```ts
const stable = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const key = toHash(stable(data)); // shallow; recurse if nested keys also vary
```

Data parsed from a single JSON response is fine — `JSON.parse` preserves document order
consistently. The risk is objects your own code assembles.

Related quirk: **all falsy inputs hash identically** — `0`, `''`, `false`, `null`,
`undefined`, and `NaN` collapse to one hash, so none of them can distinguish a key.

### Parsers in positional array slots silently misbehave **[verified]**

A positional array projection works with plain projections and silently fails with parsers:

```ts
createParser({ pair: [{ name: types.string }, { v: types.number }] });
// → { pair: [{ name: 'x' }, { v: 2 }] }   ✅

createParser({ pair: [parserA, parserB] });
// → { pair: [{}, {}] }                    ❌ empty objects, no error
```

The mechanism: a function in a positional slot is treated as a **projection factory** — the
parser is invoked with the item context as its input and its _parsed output_ becomes the
projection. For token-only parsers that output is `{}`; a parser with constants or value
functions produces a nonsense projection built from its own output instead. No warning, no
throw. Use plain projections in positional slots, or `parser.asArray` when every item shares
one projection. Root-level positional projections (`createParser([projA, projB])`) work
correctly.

### Unknown `@`-prefixed keys are silently dropped **[verified]**

Only `'@combine'` is prefix-matched — any key starting with it works (`'@combine:stats'`,
`'@combine:2'`), which is how you put several combines in one projection. `'@if'` and
`'@array'` are **exact** matches: a typo like `'@if2'` or `'@arrays'` doesn't error, doesn't
resolve — the key just vanishes from the output.

## Projection-driven nesting

### Side effects run for missing keys **[verified]**

The biggest behavioural surprise in v3:

```ts
const child = createParser({
  fetched: async () => {
    calls++;
    return await expensiveFetch();
  },
});
const parent = createParser({ title: types.string, child });

await parent({ title: 'only title' });
// → { title: 'only title', child: { fetched: '…' } }, and the fetch RAN
```

Guard it with a value function when the fetch should only happen when data exists:

```ts
child: ({ data }) => (data['child'] ? childParser : undefined);
```

Audit every nested parser and `@combine` that performs I/O. This applies to `context.store`
calls and `variableResolver` invocations too.

### `context.data` is `{}` during projection-driven resolution

Value functions that assume `data` is populated will read `undefined` rather than crash, which
means the bug shows up as missing output rather than an error. The parent level's data object
is reachable via `context.parent.data` (the raw value at the key itself is
`context.parent.value`), and `context.datalessPath` is present _only_ in this mode
— test for it when a function needs to behave differently:

```ts
summary: ({ data, datalessPath }) => (datalessPath ? undefined : buildSummary(data));
```

### An `after` hook that returns data instead of a context is silently ignored **[verified]**

The engine does `if (afterResult.data) combined = afterResult.data`, so the hook must return a
**context-shaped** object. Returning the modified data directly discards it — no error, no
warning, output unchanged:

```ts
after: (ctx) => ({ ...ctx.data, stamped: true }); // ❌ → { a: 'x' }
after: (ctx) => ({ ...ctx, data: { ...ctx.data, stamped: true } }); // ✅ → { a: 'x', stamped: true }
```

Worse than a no-op if your output happens to contain a key named `data`: the raw-data return
would then set the whole result to `data.data`. Always spread the context.

### An unconditional `after` hook defeats empty-result omission

"Empty results are omitted" counts _keys, not values_. An `after` hook or `@combine` that
always injects a key makes every projection-driven resolution non-empty, so nested keys stop
being dropped. Hook output is output.

### Arrays still require data

`'@array': true`, array literals, and `.asArray` are never conjured without array input. If
you expected a defaulted empty array, declare it: `tags: types.array(types.string)({ default: [] })`.

### Literal recursive object cycles can't be cached

Self-referencing schemas built as literal object cycles cannot be hashed. Reference parsers
through value functions instead. Recursion itself terminates fine — the cycle resolves once
more with data-independent fields, then cuts.

### A scalar under an object projection no longer leaks the projection

A truthy scalar at an object-projection key used to return the raw projection object (live
functions included). It now resolves the projection, with the scalar reachable at
`context.parent.value` (or `context.parent.data[key]` — `context.parent.data` itself is the
parent's whole data object).

## Context

### `isRoot` is `false` inside every kind of nesting

Once-per-parse work guarded by `context.isRoot` will not run inside a nested parser. Walk the
`context.parent` chain to find the root.

### Reserved context keys are silently overwritten

`data`, `key`, `projection`, `variables`, `pipes`, `isRoot`, `cache`, `value`, `parent`,
`path`, `store`, `resolve`, and `datalessPath` are written by the engine _after_ your context
spreads. A custom context property with one of these names disappears without warning.
Namespace your additions.

Two near-misses worth knowing: `parser` is written _before_ the spreads, so custom context can
override it (a nested cross-engine parser actually sees the parent engine there), and `index`
is injected through the instance context only for array items — outside arrays a custom
`index` survives. `params` is engine-set inside pipe contexts. Treat all of them as reserved
anyway.

### Calling a token takes an options object, never a type

`types.string({ default: 'x' })` and `types.string.default('x')` are the same token. But
`types.array(types.string)` (an early v3 RC form) throws — items go through `.of()`. A token
placed in `pipes` or `variables` gets called with a context and throws a targeted error:
register it under `types`. Use `.cast(value)` for a standalone cast.

### The empty string is missing

`''` skips casting for every type, like `undefined`/`null`: `{ title: '' }` yields no `title`
(or its default). `false` and `0` are values. Only `.required` tokens fail on missing input,
and `types.text` also treats whitespace-only strings as missing.

### `.to(fn)` leaves the family; `.extend(fn)` keeps it

`types.string.to((v) => v.length)` is a base `TypeToken<number>` with no string accessors —
correct, it's a number. `types.text.extend(fn)` is still a `text`. String-valued built-in
derivations (`email.domain`, `url.pathname`, `date.iso`, `html.plain`) _are_ `StringType`s,
so `.plain.truncate(160)` works; a user `.to()` returning a string is not, unless you
`.to(types.string)` afterwards.

### `length` has no root pipe name

Both `string` and `array` declare `.length`, so `{{ x | length }}` is "Pipe not found" —
use `string.length` / `array.length`. Built-in collisions are silent by design; a
registered type colliding with a built-in accessor name logs a warning once.

### `null` in a fallback chain stops it — and drops the key

`{{ a || null }}` returns `null` (a defined value). As a whole-string projected value that
`null` is treated as missing: the key is omitted or the token default applies. Inside text it
splices as `"null"`.

### Type pipes throw unless you write a fallback

`{{ contact | email }}` throws on an invalid email under the default policy, exactly like
`contact: types.email` would. `{{ contact | email || "n/a" }}` falls back; `|| undefined` or
`email.loose` for "undefined is fine".

### Pipes must live in `pipes`, not `variables`

A function left in `variables` and used as `{{x | fn}}` throws a targeted error naming the key
path. Pipe _parameters_ that reference variables (`{{x | join:firstName}}`) still resolve from
`variables` — those are data references, and that asymmetry is intentional.

### `context.resolve` vs the exported `resolve`

The exported `resolve` never inherits ambient context. Inside a value function, using it
instead of `context.resolve` silently loses merged variables, transformers, and locale. Prefer
destructuring: `async ({ resolve }) => resolve('…')`.

### Zero-arg `resolve()` recurses inside `resolve()` inputs

Within a function value in a `resolve()` **input** (not a projection), calling `resolve()` with
no arguments re-resolves the input containing that function. Parse-mode value functions are
immune because their `value` is raw data.

### `context.resolve(input)` rebinds the built-in heads

It rebinds `data`/`value`/`current` to the input being resolved, so `{{data.x}}` inside such a
string refers to _that input_, not the surrounding parse data.

## Configuration

### `patterns` is global-only

Unlike `variables` and `pipes`, it cannot be set per-parser or per-call. The registry compiles
once per engine.

### `expressions: true` on a token pattern throws on the first parse

Deliberate — a half-working grammar is worse than none. Token patterns have no end delimiter,
so `||` after a match is just surrounding text. Note the timing: the pattern registry compiles
lazily, so the throw surfaces as a rejected promise on the **first parse or resolve**, not at
`initializeParser`.

### Nested parsers don't inherit schema cache options

Each parser brings its own `createParser` cache config. With a `generateKey` that requires a
`name`, a nested parse that previously inherited the parent's name now throws
`Caching options must have a name defined`.

### `parser.asArray !== parser`, but they hash the same **[verified]**

It's a derived variant now, so identity comparisons against `parser` fail. Its **hash is the
base parser's** though — `String(parser.asArray) === String(parser)` — so as a projection
value or `toHash` input the two are indistinguishable. And direct `parser.asArray(...)` calls
bypass the whole-parse caching proxy entirely: they get no whole-parse cache entries at all
(the caching applies when `asArray` sits inside a cached parent parse).

## Ecosystem and packaging

### `types` is not a root export

Get it from `initializeParser`, or import tokens individually from `@bou-co/parsing/types`.
`import { types } from '@bou-co/parsing'` does not work.

### `initializeParser` returns four things

`{ createParser, resolve, cacheResult, types }` — destructure and re-export all four from your
parser config; `cacheResult` is easy to forget because it was added later in v3.

### `export *` leaks internals into the public surface

`asyncMapObject`, `filterNill`, `filterUndefinedEntries`, `mergeObjects`, and `toHash` are all
importable from the root. `toHash` is documented and intended; the others are engine internals
that happen to be reachable. Don't build on them. (If you did anyway: `asyncMapObject` resolves
entries in parallel in v3 — v2 ran the callback sequentially in key order.)

### No lint script

The repo has `eslint` in devDependencies but no config file and no `lint` script. CI runs both
`npm run test` and `npm run typecheck`; run the same two locally when contributing — the
typecheck covers three tsconfigs and catches things tests don't.

### Version state

`3.0.0-dev.x` on the `v3` branch; `2.1.0` is the published `latest`. Seven `TODO(v4)`
migration catches are load-bearing in v3 and will be removed in v4, so code that depends on
those error messages is depending on something temporary.
