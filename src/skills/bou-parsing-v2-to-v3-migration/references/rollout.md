# Rollout and verification

How to land the migration without a bad afternoon, and how to prove it worked rather than
assuming it did.

## The staged casting rollout

Casting is the change most likely to take a live site down, because v2 let mis-shaped values
through silently and v3 throws on them. Don't discover the whole list at once in production.

### Stage 1 — triage mode

Before running against real data, set:

```ts
export const { createParser, resolve, cacheResult, types } = initializeParser({
  looseCasting: true,
  onCastError: (error) => {
    telemetry.report('parser-cast-error', {
      path: error.path, // e.g. 'article.author.joinedAt'
      type: error.type, // the target type, or a custom type's name
      received: error.received,
    });
  },
});
```

`looseCasting: true` drops uncastable values (applying the token's `default` when one
exists) instead of throwing. It is a regular context option, so a large codebase can loosen one
parser (`createParser(projection, { looseCasting: true })`) or one call at a time instead of
the whole engine. `onCastError` fires _before_ the failure policy is applied, so you
see every failure regardless of what happens next. Setting it also replaces the default console
warning, which keeps logs readable.

**`true` is the flag.** `'undefined'` is an identical, deprecated alias (marked `TODO(v4)`);
both drop the value and neither passes the original through, so output types stay honest either
way. Note that triage mode also silences `.required`: a missing required value goes through the
same policy, so it is dropped (or defaulted) rather than thrown — re-verify required fields in
stage 3.

### Stage 2 — collect and fix

Run your real traffic (or a representative sample of production data) through the parsers and let
`onCastError` build the list. Then for each entry decide:

| Situation                                  | Fix                                     |
| ------------------------------------------ | --------------------------------------- |
| The mapping was wrong                      | Fix the projection or the upstream data |
| The field genuinely carries arbitrary data | `types.any`                             |
| The field is optional and sometimes absent | Nothing — `undefined` never fails       |
| The field should have a fallback           | `types.x.default(…)`                    |
| The input needs lenient coercion           | A custom `defineType`                   |
| Bad data must never pass                   | `defineType({ fn, strict: true })`      |

Cast errors carry the full key path (array items include their index: `tags.2`), so this list is
directly actionable — you're not guessing which field failed.

### Stage 3 — tighten

Remove `looseCasting` to return to the default throwing mode. Keep `onCastError` if you want the
telemetry; it's useful permanently as an early warning on upstream data drift.

**Don't skip stage 3.** Leaving `looseCasting` on permanently forfeits the runtime guarantee
that is the main reason to be on v3 at all. If you can't get to zero cast errors, the honest
move is to retype the offending fields as `types.any` and keep strict casting everywhere else,
rather than loosening the whole engine for a handful of fields.

## Incremental migration for large codebases

v3 makes each `initializeParser` call an isolated engine, which turns a partial migration into a
valid intermediate state instead of a broken one.

```ts
// legacy-config.ts — unchanged v2-style engine, still serving
// v3-config.ts — new engine
export const { createParser, types } = initializeParser({/* v3 config */});
```

Move parsers across a module at a time. Parsers stay permanently bound to their creating engine,
and a parser from one configuration nested inside another keeps its own transformers,
whole-parse cache storage, and variable cache for the nested parse while parent context values
still merge down (on collisions the parent's win). Type tokens
carry their own casting implementation, so projections and type files are freely shareable across
both.

This is the right shape for anything with more than a few dozen parsers: you get to verify each
slice against real traffic rather than betting the whole surface on one deploy.

## Verification

The migration is not done when it compiles. Type-checking proves Tier 1; it says nothing about
Tier 2.

### What the compiler covers

Tier 1, mostly. Type tokens are typed values, so a leftover string identifier in a projection
usually surfaces as a type error. Run the full typecheck, not just the build — in this repo
that's three tsconfigs:

```bash
npm run typecheck   # tsc across lib, root, and templates configs
```

The repo's own CI runs both `npm run test` and `npm run typecheck`; do the same locally in
your project so Tier 1 leftovers surface before a deploy.

### What only tests cover

Write or extend tests specifically for the Tier 2 changes. The valuable ones assert behaviour
that changed, not behaviour that stayed the same:

**Side-effect counts.** The highest-value test in the whole migration, because this is the
change with real cost:

```ts
it('does not fetch the author when the key is absent', async () => {
  let calls = 0;
  const authorParser = createParser({
    profile: async () => {
      calls++;
      return 'x';
    },
  });
  const articleParser = createParser({ title: types.string, author: authorParser });

  await articleParser({ title: 'no author' });
  expect(calls).toBe(0); // fails until you guard it
});
```

**Nested output shape.** Assert what nested projections now produce without matching input:

```ts
it('resolves nested constants and defaults without input', async () => {
  const parser = createParser({ title: types.string, meta: { version: 3 } });
  expect(await parser({ title: 'T' })).toEqual({ title: 'T', meta: { version: 3 } });
});
```

**Casting boundaries.** Test both directions on the fields that matter: a value that should cast,
and one that should fail.

**Hook call counts**, if anything downstream depends on them.

**Content with `{{` as literal text**, if your CMS has any.

### Ruling out the leak risk

The one item in the audit that is a correctness hazard rather than a behaviour change is the
`variableResolver` `cache()` callback holding an engine-lifetime store. If any resolver caches
user- or tenant-scoped values there, they are served across requests. Verify by inspection —
this is not something a test will surface unless you write it deliberately:

```ts
it("does not serve one user's resolved variable to another", async () => {
  const a = await parser({ msg: '{{userName}}' }, { variables: { userId: 1 } });
  const b = await parser({ msg: '{{userName}}' }, { variables: { userId: 2 } });
  expect(a.msg).not.toBe(b.msg);
});
```

Move any such resolver to a pattern with `cache: 'run'` (per-parse, the default for user
patterns) or `'storage'`.

### Cache cold start

Projection hashes changed when identifiers became tokens, so expect a one-time invalidation if
your storage uses the default cache key. Storages with their own `generateKey` are unaffected
unless they hash the projection.

Plan for it: a cold cache on a deploy that also carries behavioural changes makes it harder to
tell a performance regression from an empty cache. If you can, warm the cache or deploy during
low traffic.

## Definition of done

- [ ] `npm run typecheck` clean across all tsconfigs
- [ ] Test suite green
- [ ] Every checkbox in `behavioural.md` §7 either checked or explicitly ruled out
- [ ] Side-effect count tests in place for nested parsers that perform I/O
- [ ] `onCastError` list worked down to zero, or remaining fields deliberately `types.any`
- [ ] `looseCasting` removed (stage 3 complete)
- [ ] No `variableResolver` caching user- or tenant-scoped data
- [ ] Cache cold start planned for

## A note on the v4 horizon

v3's migration catches — the targeted errors for legacy type strings, misplaced pipes, the
removed statics, `types.undefined`, the second-argument context, and the `looseCasting: 'undefined'`
alias — are transitional. Six catches, seven `TODO(v4)` markers in the source (one catch has two), and they will be removed. That has two implications:

Finish the migration properly rather than living on the error messages as documentation. And
don't build tooling that parses those messages, because they're scheduled for deletion.
