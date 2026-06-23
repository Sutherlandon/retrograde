# Retrograde - Mission Control for Retrospectives

## Architecture
- react-router 7 based
- polling for updating boards in realish time

## Services used
- Keycloak in Docker for local OAuth 2.0 IDP
- OAuth for public facing IDP
- Vercel for webapp hosting
- Neon for postgres database hosting

## Project docs
- [`docs/STATE.md`](docs/STATE.md) — current project snapshot: what's shipped, in flight, and known rough edges. Read first when picking up this project.
- [`docs/adr/`](docs/adr/) — Architecture Decision Records. The long-memory log of decisions that shape the product and architecture. Start with the README.
- [`docs/AI_AGENT_API.md`](docs/AI_AGENT_API.md) — JSON API reference for AI agents.
- [`CLAUDE.md`](CLAUDE.md) — engineering rules, architecture patterns, and conventions for AI assistants and human contributors.