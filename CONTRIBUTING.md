# Contributing to the Agora demo

Contributions are welcome and appreciated. 💜 This app is a **1:1 compatibility harness** for the
Agora SDK — each tab drives one SDK surface end-to-end against a real server. The best
contributions either **exercise a new SDK surface**, **tighten an existing one**, or **surface a
server ↔ SDK contract mismatch**. You don't need to be an expert to help — if a tab misbehaves, an
issue with the failing request/response is genuinely useful.

## Ways to contribute

- 🐛 **Report a bug** — open an issue with what you clicked, what you expected, and (ideally) the
  failing network request. Because this is a harness, "the demo broke" is often really "the server
  and SDK disagree about a payload" — that's exactly what we want to catch.
- ✨ **Exercise a new SDK surface** — pick a hook the demo doesn't use yet (see the SDK surface map)
  and add a panel that drives it. One file per surface; small and focused beats sprawling.
- 🎨 **Improve an existing panel** — clearer states, better error handling, accessibility.
- 📝 **Docs** — fix or extend the README / CLAUDE.md when behavior changes.

## Getting set up

You need a running Agora server (the demo is a client). See [README.md](./README.md#quick-start-local)
for the full local stack; the short version:

```bash
cd ../agora-server/apps/api && npm run dev               # 1. boot the Agora server
cd ../agora-server/apps/api && node scripts/seed-demo-user.mjs   # 2. seed a confirmed demo user (once)
npm install && npm run dev                               # 3. run this demo → http://localhost:5175
```

Point `VITE_API_BASE_URL` in `.env` at your server. Login is prefilled from `.env`.

## Project conventions (please match these)

This is a deliberately small, opinionated harness. New code should read like the code already here:

- **One file per SDK surface.** Each feature file maps to one hook (and notes the server route it
  hits in a header comment). Adding a feature usually means: a new `Tab` in `Shell.tsx` + one panel
  file, or a drill-down conditional render within an existing tab. There is **no router** — tabs and
  drill-downs are local-state conditional renders.
- **The SDK is a [Replyke](https://github.com/replyke/monorepo) fork** rescoped to `@agora-sdk/*`.
  Import from `@agora-sdk/react-js`, never `@replyke/*`. A few APIs diverge from upstream Replyke
  docs (notably: pass `baseUrl` to `ReplykeProvider`; `signUpWithEmailAndPassword` returns a
  `SignUpResult` union; the feed adds `decay`/`gravity`/`wilson`/`bayesian` ranking). When in doubt,
  the installed `.d.ts` under `node_modules/@agora-sdk/core/dist/esm/` is the source of truth.
- **Hook returns are cast `as any`** on purpose — the SDK's exported types are incomplete and the
  demo treats them loosely. Keep this rather than fighting the types. ⚠️ Because of this, a wrong
  field name is a *silent* `undefined`, not a compile error — verify field names against the `.d.ts`.
- **Fail closed on access.** Private-space content must degrade gracefully; mirror the server's gate
  client-side (see `EntityView.tsx` / `SpaceView.tsx`). The server is the real authority — never
  rely on the UI to enforce privacy, but don't show affordances the server will reject either.
- **Styling** is one hand-written `styles.css` with utility-ish classes (`col`, `row`, `panel`,
  `card`, `pill`, `msg`, `mine`, `muted`, `spacer`, `prewrap`, `clamp3`, `linklike`). No CSS
  framework — reuse the existing classes.

See [CLAUDE.md](./CLAUDE.md) for the full per-file SDK-surface map and the finer editing patterns
(optimistic comment merge, the `fileImageSrc` image helper, chat provider nesting, etc.).

## Verifying your change

There are **no automated tests and no linter** — verification is manual:

1. `npm run build` — `tsc -b` (typecheck) + `vite build`. **This is the one static check and it
   must pass.** Mind the `as any` caveat above: a clean build does *not* prove your hook fields are
   right, so also…
2. **Click through the affected tab(s)** against a running server and confirm the behavior.
3. If you touched auth, private spaces, or anything permission-gated, test as a **non-owner /
   non-member** too (a fresh seeded user) — not just the prefilled demo account, which is a
   project operator with god-view.

## Submitting a pull request

1. Branch off `root` (the default branch).
2. Keep PRs **small and atomic** — one logical change. If you touched several surfaces, prefer
   several commits (or several PRs).
3. Use **conventional commits with an emoji prefix**, matching the existing history
   (`git log --oneline`): e.g. `✨ feat(demo): …`, `🐛 fix(demo): …`, `📝 docs: …`,
   `♻️ refactor(demo): …`, `🔒 security(demo): …`.
4. In the PR description, say **which SDK surface/hook** the change exercises and **how you
   verified** it (build + which tab you clicked through).
5. Make sure `npm run build` passes before opening the PR. CI builds and publishes the image on
   merge to `root`, so a broken build blocks the pipeline.

## Be excellent to each other

This project welcomes contributors of every background and experience level. Be kind, assume good
faith, and keep discussion focused on the work. Harassment of any kind isn't tolerated.

Thank you for helping make the Agora demo a better harness. 🌸
