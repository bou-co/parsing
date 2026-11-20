# Caching — two mechanisms, one storage

v3 has two caching mechanisms — whole-parse caching and the value-level `store` — plus
per-pattern cache modes. They all go through the same pluggable `storage`, but they cache
different things at different granularities. Picking the wrong one is the most common caching
mistake, so start here.

## Choose the granularity

| You want to cache                             | Use                                             | Keyed on                                                    |
| --------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| The **entire parse result** for a given input | `cache: { enabled: true }`                      | Hash of the projection + the raw call arguments, by default |
| **One async value** shared across many parses | `store(key, fn, options?)`                      | Your key, variable-interpolated                             |
| A value you **read or write directly**        | `store.match(key)` / `store.add({ key, value })` | Your key, or a content hash when `add` gets none            |
| A **pattern's** resolved lookups              | `cache: 'storage'` on the pattern               | `pattern:<name>:<path>`                                     |

The distinction that matters: whole-parse caching keys on the _input_, so two different
articles never share an entry. Value-level caching keys on _your_ identifier, so a hundred
articles referencing the same author share one fetch. If an expensive call is shared across
inputs, whole-parse caching won't help you at all.

## Storage backend

Set once, globally. Everything else uses it.

```ts
declare module '@bou-co/parsing' {
  interface ParserCachingOptions {
    name?: string;
  }
}

export const { createParser, resolve, store, types, variables } = initializeParser({
  storage: {
    generateKey: (context) => {
      if (!context.cache.name) throw new Error('Caching options must have a name defined');
      return `${context.cache.name}:${toHash(context.data)}`;
    },
    add: async (key, value, context) => {
      await redis.set(key, JSON.stringify(value), { ex: context.cache.ttl });
    },
    match: async (key) => await redis.get(key),
    remove: async (key) => await redis.del(key),
    clear: async () => await redis.flushdb(),
  },
});
```

`enabled` and `ttl` are built in; augment `ParserCachingOptions` via module declaration to type
your own cache options (`name`, tags, whatever your backend needs). `ttl` is only forwarded —
the backend reads `context.cache.ttl` and applies it; the library never expires entries.

One caution on that `generateKey`: `toHash` is **key-order sensitive** (see `gotchas.md`).
Hashing `context.data` straight from a parsed API response is fine, since `JSON.parse`
preserves document order consistently. Hashing an object your own code assembles
conditionally is not — sort the keys first, or you get silent permanent cache misses.
(`generateKey` itself is optional — omit it and the default key applies.)

Without a configured storage, every mechanism degrades gracefully — the functions simply run,
`store.match` misses and `store.add` still returns the key. That's deliberate: value functions
stay isomorphic and work unchanged on the client.

## 1. Whole-parse caching

```ts
const expensiveParser = createParser({ summary: async ({ data }) => await generateSummary(data.id) }, { cache: { enabled: true, ttl: 3600, name: 'summary-cache' } });
```

Caches the parser's entire output. Configurable globally, per parser, or per call.

Things to know:

- The **default key is `toHash(projection) + ':' + toHash(args)`** — the projection plus the
  raw call arguments (data, instance context, and the parent context when nested). It does not
  hash the resolved global/schema context, but it's correct out of the box for normal calls.
- A **custom `generateKey`** built only from projection + data is dangerous under
  projection-driven resolution: those parses always receive `{}` as data, so keys collide
  across different parents. Include something distinguishing, or rely on the default.
- **Schema-level cache options do not flow into nested parsers.** Each parser brings its own
  `createParser` cache config. If your `generateKey` requires a `name` and a nested parser has
  no cache config, you'll get `Caching options must have a name defined` — give the nested
  parser its own.
- Per-call cache options **do** propagate.
- **Type tokens hash by content**, so editing a custom type's implementation (or its
  `strict`/`name`/`default`) intentionally invalidates entries that used it. Nested parsers
  hash by their own projection; `parser.asArray` hashes **the same as** `parser` (only `.flat`
  gets a distinct hash), and calling `parser.asArray(...)` directly bypasses whole-parse
  caching entirely — it participates in caching only inside a cached parent parse.

## 2. `store` — value caching

The one to reach for at value level. `store(key, fn, options?)` is get-or-compute: the value
cached under `key`, or `fn(context)`'s result stored there on a miss. The same `store` works in
three places:

```ts
// Standalone — lazy, runs when awaited
const profile = await store(`profile-${uid}`, () => fetchProfile(uid), { ttl: 60 });

// As a projection value (or inside a resolve input) — runs per parse, key interpolated per parse
const myParser = createParser({
  name: types.string,
  profile: store('profile-{{data.uid}}', ({ data }) => fetchProfile(data.uid)),
});

// In a value function — context.store is bound to the active context and starts eagerly
const articleParser = createParser({
  author: ({ store, data }) => store(`author:${data.authorId}`, () => fetchAuthor(data.authorId)),
});
```

The key is interpolated with the variables pattern (and any other registered pattern) against
the active context — `{{data.uid}}`, `{{ctx.currentLocale}}`, explicit variables, fallbacks and
pipes all work, in every `store` method.

Direct reads and writes:

```ts
await store.add({ key: 'profile-1', value, ttl: 3600 }); // → 'profile-1'
await store.add('profile-1', value, { ttl: 3600 }); // positional
const key = await store.add({ value: report }); // no key → 'store:<content hash>', returned
await store.match<Report>(key); // undefined on a miss
await store.remove('profile-1');
await store.clear();
```

A single argument to `store.add` is **always** the `{ key?, value, ...options }` object — never
pass raw data as the only argument (see `gotchas.md`). `add` rejects `null`/`undefined`
values, since they read back as a miss. `remove`/`clear` are no-ops when the backend lacks them.

**The key template is the sharp edge.** A variable that resolves to nothing stringifies to
`undefined` inside the key — `'profile-undefined'` — which silently collides across every
input that misses the value. Give key variables a fallback, or assert the field exists before
caching on it.

## Semantics of `store`

These guarantees are the reason to prefer it over hand-rolled memoisation:

- **Storage-gated, not `cache.enabled`-gated.** It caches whenever a storage is configured;
  calling it _is_ the opt-in. `cache: { enabled: false }` does not disable it.
- **In-flight dedupe per key.** Concurrent `store(key, fn)` calls share one computation, so an
  array of 100 items parsing in parallel fires one request.
- **Errors are never cached.** A failure rejects all waiters and the next call retries.
- **`null`/`undefined` from `storage.match` count as misses**, so falsy values (`0`, `''`,
  `false`) cache correctly rather than being re-fetched forever.
- **Options merge into `context.cache`** for the backend (e.g. `ttl`), falling back to the
  merged global/schema/instance `cache` config when omitted.
- **The cache identity is your key** (or the content hash from a keyless `add`). The context
  passed to the backend carries no per-key information, so `generateKey` is not consulted.
- **Standalone is lazy, `context.store` is eager.** Awaiting the same standalone value twice
  computes once (memoized per value); two standalone values awaited one after the other run
  sequentially — use `Promise.all`.

The raw backend stays available as `context.storage` for anything `store` does not cover.

## 3. Pattern cache modes

Each user-defined pattern picks a mode:

| Mode              | Lifetime                                              | Use for                                                                |
| ----------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| `'run'` (default) | Memoized per parse                                    | Per-request data — safe default                                        |
| `'none'`          | No caching                                            | Context-sensitive lookups (the built-in `variables` pattern uses this) |
| `'storage'`       | The configured storage, under `pattern:<name>:<path>` | Stable shared lookups, e.g. CMS snippets                               |

**Watch the `variableResolver` `cache()` callback specifically.** It keeps an
**engine-lifetime** store, so values cached there are served for the life of the process —
across requests and across tenants — and they merge into `variables` last, shadowing even
instance variables of the same name on later parses. That is a correctness hazard for
anything user-scoped. For per-request data, use a pattern with `cache: 'run'` or `'storage'`
instead.

## Invalidation

There is no automatic invalidation beyond your backend's TTL. What does change keys:

- Editing a projection changes its hash (default key only)
- Editing a custom type's implementation, `strict`, `name`, or `default` changes its `_id`
- Upgrading from v2 changed every projection hash once, because type identifiers became
  tokens — expect a one-time cold cache

Storages with their own `generateKey` are unaffected by projection changes unless they hash
the projection themselves.

## Serialization caution

Cached output travels through `JSON.stringify` in most backends. Parser output carries a
non-enumerable `_parsed` marker that tells a second parse "already resolved" — and that
marker does **not** survive serialization. A cached result re-fed into a parser is treated as
unparsed and gets pattern-resolved again. See `gotchas.md` for what that does to escaped
`{{...}}` content.
