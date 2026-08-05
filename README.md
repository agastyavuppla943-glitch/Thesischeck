# ThesisCheck

An advisory-only MCP agent, built on [NitroStack](https://nitrostack.ai), that
intervenes at the moment *before* a trade is confirmed — checking the
investor's own stated reasoning against their behavioral history, real
company fundamentals/sentiment, and the trade's portfolio-risk impact.

ThesisCheck never recommends what to buy or sell, and never executes,
modifies, or cancels a trade. It reflects the investor's own thesis back at
them, with evidence, and asks better questions.

## Architecture

```
src/
  modules/
    behavioral/     # logs trade decisions, detects impulsive patterns
    market-data/     # fundamentals + sentiment providers, divergence signal
    portfolio/       # holdings/cash tracking, concentration-risk impact
    thesis-check/    # orchestrator: the core evaluate_trade_thesis tool
  widgets/
    app/thesis-check-result/  # interactive reasoning-interface widget
  shared/
    storage.ts       # simple JSON-file persistence (data/*.json)
```

### Behavioral patterns detected

`panic_selling`, `fomo_buying`, `doubling_down`, `overtrading`,
`revenge_trading`, and `impulsive_language` in the stated rationale itself —
each derived from the investor's own logged history, not from any external
"advice."

### Fundamentals & sentiment

Deterministic **simulated** fundamentals/sentiment providers run out of the
box with zero API keys, so the server is fully functional for demos/testing.
Set `FMP_API_KEY` (Financial Modeling Prep) and/or `NEWSAPI_KEY` to switch to
live data; the server falls back to simulated data automatically if a live
call fails for any reason. The live-provider code paths have not been tested
against real endpoints in this environment (no network egress to those
hosts here) — validate them yourself before relying on live data in
production.

### Portfolio concentration

Computes projected ticker/sector weight after a proposed trade, carefully
isolating "value held outside this position" first so the position's own
current value is never double-counted.

### Guardrails

- **`AdvisoryOnlyGuard`** — a real `Guard` (`canActivate(context)`). NitroStack
  guards only ever see `ExecutionContext` (auth/metadata), never raw tool
  input, so this guard cannot and does not try to inspect trade arguments —
  it enforces authentication only when `THESISCHECK_REQUIRE_AUTH=true` is
  set (e.g. behind `ApiKeyModule`/`JWTModule`), and is a no-op otherwise.
- **Strict input validation** — every tool's Zod schema uses `.strict()`
  *and* is explicitly `.parse()`d at the top of the handler. NitroStack
  advertises `inputSchema` as JSON Schema for MCP clients but does **not**
  auto-validate incoming calls against it at runtime, so explicit parsing is
  what actually rejects unexpected/injected fields (verified in testing —
  see below).
- **`AuditLogMiddleware`** — a real `MiddlewareInterface` that persists every
  call (success or failure) to `data/audit_log.json`, exposed as the
  `thesischeck://audit-log` MCP resource so the evidence trail is
  independently inspectable rather than a black box.

## Tools

| Tool | Description |
|---|---|
| `evaluate_trade_thesis` | The core advisory check. Returns a caution level (`green`/`yellow`/`red`), an evidence trail, and reflective questions. |
| `get_trade_history` | View logged trade decisions, optionally filtered by ticker. |
| `log_trade_outcome` | Record how a trade actually turned out (closes the feedback loop). |
| `get_market_snapshot` | Standalone fundamentals/sentiment/divergence lookup for any ticker. |
| `get_portfolio` / `set_portfolio` | View/initialize the demo portfolio snapshot used for concentration-risk math. |

## Resources

- `thesischeck://audit-log` — full audit trail of every advisory-tool call.

## Running locally

```bash
npm install
npm run build
npm start          # production, stdio (+ HTTP SSE)
# or, for hot reload during development:
npm run dev
```

Or with [NitroStudio](https://nitrostack.ai/studio) for a visual test client.

## Deploying

This is a standard NitroStack MCP server — deploy it the same way you'd
deploy any Node process (Docker, a cloud MCP host, etc.), pointing your
MCP client at `dist/index.js` over stdio, or at the HTTP/SSE transport in
production mode. See the [NitroStack docs](https://docs.nitrostack.ai) for
platform-specific deployment guides.

## Verified

Type-checked (`tsc --noEmit`), built (`nitrostack-cli build`, widget bundled
+ compiled), and smoke-tested end-to-end over stdio with the official
`@modelcontextprotocol/sdk` client: portfolio setup, market snapshot,
`evaluate_trade_thesis` (including a FOMO-buy scenario), trade history,
audit-log resource read, and rejection of a tool call with an injected
unexpected field all pass.
