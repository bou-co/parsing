---
name: bou-parsing-v2-to-v3-migration
description: Migrate a codebase from @bou-co/parsing v2 to v3, and diagnose v3 migration errors. Covers replacing string type identifiers like 'string' and 'array of string' with types.* tokens, moving pipes out of variables into pipes, the removed Parser statics and global singleton, projection-driven nested resolution, nested-parser context and isRoot changes, the new patterns API, and the staged looseCasting rollout. Use this skill whenever code mixes v2 and v3 conventions, or when you see errors such as Legacy type string is not supported in v3, or Pipe is defined in variables, or Parser.parserGlobalContext was removed in v3, or There is no types.undefined in v3, or the parent context is the third argument, or Caching options must have a name defined, or an unexpected ParserCastError after an upgrade. Also use it proactively when asked to upgrade or modernise anything using this library, because the mechanical find and replace is the small half of the job and skipping the behavioural audit ships silent breakage.
---

# Migrating @bou-co/parsing v2 → v3

## What this migration actually is

There are two very different kinds of change in this release, and conflating them is how
migrations go wrong:

- **Tier 1 — mechanical.** Type identifiers become tokens, pipes move namespace, removed
  statics. These are find/replace, and v3 **throws targeted errors** for every one of them.
  You cannot ship a Tier 1 mistake silently.
- **Tier 2 — behavioural.** Nested resolution is now driven by the projection instead of the
  data, nested parsers get a proper parent-context channel, casting is real, and patterns
  re-scan their output. These change _when code runs and what values come out_. Nothing
  throws. A codebase can pass a full type-check and test suite and still behave differently
  in production.

So the work is: do Tier 1 with a codemod, then **audit** for Tier 2. Budget accordingly — the
find/replace is an afternoon; the audit is the migration.

## Order of operations

Follow this sequence. It is ordered so that each step's failures are visible before the next
step can hide them.

1. **Inventory.** Find every `initializeParser` call, every `createParser` projection, every
   `variables` config, and every place a parser is called with more than one argument. The
   inventory tells you how big the Tier 2 audit is.
2. **Tier 1 codemod.** Type strings → tokens, pipes → `pipes`, remove static usage. See
   `references/mechanical.md`. Run the type-checker; it catches most of this statically.
3. **Turn on triage mode.** Set `looseCasting: 'undefined'` plus an `onCastError` reporter
   before running anything against real data. This converts what would be a wall of thrown
   `ParserCastError`s into a list of fields to fix. See `references/rollout.md`.
4. **Tier 2 audit.** Walk the checklist in `references/behavioural.md`. This is the part that
   needs reading code, not running a script.
5. **Fix the cast-error list.** Either correct the data mapping or retype the field
   (`types.any` for intentional raw passthroughs).
6. **Remove triage mode.** Drop `looseCasting` to return to the default throwing behaviour.
   Leaving it on permanently forfeits the main reason to be on v3.
7. **Expect one cold cache.** Projection hashes changed when identifiers became tokens.

Steps 3 and 6 bracket the whole thing deliberately: you want strict casting as the end state,
but not as the state you debug in.

## Error → fix lookup

v3 fails fast on the common v2 leftovers. When one of these appears, this is the fix:

| Error message contains                                                                                           | Cause                                                                                                                          | Fix                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `Legacy type string 'string'` (or `number`, `boolean`, `date`, `object`, `array`, `any`, `unknown`, `undefined`) | A v2 string identifier used as a projection value                                                                              | `types.string` etc. Error names the key path                     |
| `Legacy type string 'array<string>'`                                                                             | v2 array identifier                                                                                                            | `types.array(types.string)`                                      |
| `There is no types.undefined in v3`                                                                              | `types.undefined` accessed                                                                                                     | Use the `optional` util, or omit the key                         |
| `Pipe "x" at "key" is defined in \`variables\``                                                                  | Pipe function left in the `variables` namespace                                                                                | Move the function into the `pipes` config                        |
| `Pipe "x" not found at "key"`                                                                                    | Pipe genuinely missing                                                                                                         | Register it in `pipes`                                           |
| `Parser.parserGlobalContext was removed in v3`                                                                   | Code reads or assigns the removed static                                                                                       | Use `initializeParser(config)` or `new Parser(config)`           |
| `Parser.createParser was removed in v3`                                                                          | Static factory call                                                                                                            | Use the instance from `initializeParser`                         |
| `the parent context is the third argument`                                                                       | A full parser context passed as a parser's 2nd arg                                                                             | Move it to the 3rd: `child(data, instanceCtx, parentCtx)`        |
| `Caching options must have a name defined` (or whatever your own `generateKey` throws)                           | A nested parser used to inherit the parent's cache `name` — the error comes from your storage's `generateKey`, not the library | Give the nested parser its own `cache` config                    |
| `ParserCastError` after upgrade                                                                                  | Casting is real now; the value never matched the declared type                                                                 | Fix the mapping, retype the field, or triage with `looseCasting` |
| `ParserPatternCycleError`                                                                                        | A variable resolves to text containing itself, or rescan >10 deep                                                              | Break the cycle, or set `rescan: false` on the pattern           |

These migration catches are transitional (`TODO(v4)` in the source) and will be removed in v4,
so don't build tooling that depends on the message text.

## The five Tier 2 changes to audit

Detail and audit procedure in `references/behavioural.md`. The summary, because these are the
ones that don't announce themselves:

1. **Nested projections resolve without matching input.** Constants, type-token defaults,
   `@combine`, and `@if` inside a nested projection now appear in output when the key is
   absent — and **value functions run, including their fetches**. Previously the whole nested
   level short-circuited. This was widely considered a bug, but fixing it means side effects
   fire where they didn't before.
2. **`context.isRoot` is `false` inside nested parsers.** v2 leaked `true`. Once-per-parse work
   guarded by `isRoot` inside a nested parser stops running.
3. **Hooks fire once per level instead of twice, and `.extend()`/`.withContext()` now
   _compose_ hooks instead of replacing them** (base first, then the extension's). Idempotent
   hooks won't notice; hooks that count, push, or emit telemetry will report different
   numbers, and a base hook an extension used to silence now runs again.
4. **Casting is real.** Most v2 identifiers passed values through untouched. Fields that were
   quietly the wrong shape now throw. `'date'` in particular got stricter.
5. **Patterns re-scan resolved output, and escaping now exists.** A variable resolving to a
   string containing `{{other}}` now resolves that too. And `\` immediately before `{{`
   changes meaning — existing content with that sequence renders differently.

Additionally: `parser.asArray !== parser` anymore (it used to be the same function, which
meant it shared cache entries — a real bug, now fixed), schema-level `cache` no longer flows
into nested parsers, six more context keys are reserved, the new `{{data.*}}`/`{{ctx.*}}`
built-in heads intercept those head segments before the `variableResolver`, and `react` is now
an **optional peer dependency** — install it yourself wherever `@bou-co/parsing/react` is used
(the package also declares a Node `^20.19.0 || >=22.12.0` engines floor).

## Reference files

- **`references/mechanical.md`** — Tier 1 in full: every rename with before/after, the
  `initializeParser` return-shape change, the `valueKeys` removal, and a codemod strategy.
  Read this when doing the mechanical pass.
- **`references/behavioural.md`** — Tier 2 in full: what changed, why, how to find affected
  code, and how to fix each pattern. This is the substance of the migration. Read it before
  declaring the migration done.
- **`references/rollout.md`** — the staged `looseCasting` rollout, verification strategy, and
  how to prove the migration worked rather than assuming it did.

## Working notes

**Don't migrate and refactor in the same commit.** Tier 2 changes runtime behaviour; you want
a diff where every behavioural change is attributable to the upgrade, not to improvements made
along the way. Land the migration, verify, then refactor.

**The type-checker is your best Tier 1 tool and no help at all for Tier 2.** Type strings are a
compile error; a nested parser whose fetch now fires unconditionally type-checks perfectly.
Plan for that asymmetry — it's the reason step 4 is a code read, not a build.

**When the codebase is large, migrate one engine at a time.** v3 makes each
`initializeParser` call an isolated engine, which means you can stand up a v3 engine alongside
the existing configuration and move parsers across incrementally. Parsers stay bound to their
creating engine and nest safely across configurations, so a partial migration is a valid
intermediate state rather than a broken one.

**Verify against the source when docs disagree.** v3 is still a moving `-dev` line, so prose
can lag the code. `initializeParser` returns `{ createParser, resolve, cacheResult, types }`
— all four. Where this skill and any doc conflict, trust the code and the tests.
