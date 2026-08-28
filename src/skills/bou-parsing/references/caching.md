# Caching — three mechanisms, one storage

v3 has three caching mechanisms plus per-pattern cache modes. They all go through the same
pluggable `storage`, but they cache different things at different granularities. Picking the
wrong one is the most common caching mistake, so start here.

## Choose the granularity

| You want to cache                             | Use                                | Keyed on                                                    |
| --------------------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| The **entire parse result** for a given input | `cache: { enabled: true }`         | Hash of the projection + the raw call arguments, by default |
| **One async value** shared across many parses | `cacheResult(keyTemplate, fn)`     | Your key template, variable-interpolated                    |
| **One async value**, key built imperatively   | `context.store(key, fn, options?)` | Your explicit key                                           |
| A **pattern's** resolved lookups              | `cache: 'storage'` on the pattern  | `pattern:<name>:<path>`                                     |

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
    ttl?: number;
  }
}

export const { createParser, resolve, cacheResult, types } = initializeParser({
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

Augment `ParserCachingOptions` via module declaration to type your own cache options (`name`,
`ttl`, tags, whatever your backend needs).

One caution on that `generateKey`: `toHash` is **key-order sensitive** (see `gotchas.md`).
Hashing `context.data` straight from a parsed API response is fine, since `JSON.parse`
preserves document order consistently. Hashing an object your own code assembles
conditionally is not — sort the keys first, or you get silent permanent cache misses.
(`generateKey` itself is optional — omit it and the default key applies.)

Without a configured storage, all three mechanisms degrade gracefully — the functions simply
run. That's deliberate: value functions stay isomorphic and work unchanged on the client.

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

## 2. `cacheResult` — declarative value caching

The one to reach for by default at value level. Give it a key template and a function.

```ts
const myParser = createParser({
  name: types.string,
  profile: cacheResult('profile-{{data.uid}}', async (ctx) => await fetchProfile(ctx.data.uid)),
});
```

The key is interpolated with the variables pattern against the active context when the value
resolves — `{{data.uid}}`, `{{ctx.currentLocale}}`, explicit variables, fallbacks and pipes
all work.

It also works outside a parse:

```ts
// Standalone — the third argument becomes the context data for key interpolation
const raw = await cacheResult('raw-{{data.uid}}', query, { uid });
const raw2 = await cacheResult(`raw-${uid}`, query); // or skip interpolation

// Or inside a resolve input
await resolve({ name: 'John', profile: cacheResult(`profile-${uid}`, query) });
```

Signature: `cacheResult(key, fn, extraData?, options?)`. `extraData` feeds key interpolation
(standalone it becomes the context data; inside a parse it's merged over the current `data`
for the key only). `options` merges into `context.cache` for the backend.

**The key template is the sharp edge.** A variable that resolves to nothing stringifies to
`undefined` inside the key — `'profile-undefined'` — which silently collides across every
input that misses the value. Give key variables a fallback, or assert the field exists before
caching on it.

## 3. `context.store` — imperative value caching

Same engine, but you build the key in code. Use it when the key needs logic a template can't
express.

```ts
const articleParser = createParser({
  title: types.string,
  author: async ({ data, store }) => {
    const key = `author:${data.authorId}`;
    return store(key, () => fetch(`/authors/${data.authorId}`).then((r) => r.json()), { ttl: 3600 });
  },
});
```

## Shared semantics of `cacheResult` and `context.store`

Both behave identically, and these guarantees are the reason to prefer them over hand-rolled
memoisation:

- **Storage-gated, not `cache.enabled`-gated.** They cache whenever a storage is configured;
  calling them _is_ the opt-in. `cache: { enabled: false }` does not disable them.
- **In-flight dedupe per key.** Concurrent calls share one computation, so an array of 100
  items parsing in parallel fires one request.
- **Errors are never cached.** A failure rejects all waiters and the next call retries.
- **`null`/`undefined` from `storage.match` count as misses**, so falsy values (`0`, `''`,
  `false`) cache correctly rather than being re-fetched forever.
- **The cache identity is your explicit key.** The context passed to the backend carries no
  per-key information, so `generateKey` is not consulted for these.
- Awaiting the same `cacheResult` wrapper twice standalone computes once (memoized per
  wrapper).

For manual control, the backend is directly available as `context.storage`
(`match`/`add`/`remove`/`clear`).

## 4. Pattern cache modes

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
