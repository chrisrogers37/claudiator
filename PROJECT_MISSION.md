# Project Mission — Claudlobby

## What this project is

Claudlobby is a framework for running a fleet of always-on Claude Code bots on a single Linux or macOS host. Each bot has its own persona, its own Telegram bot for communication, its own MCP servers, isolated state, and a distinct identity. A manager bot orchestrates workers via tmux dispatch; workers report back via shared scripts and a fleet-state ledger.

The name is the metaphor: a COD lobby. Bots gather in a shared room (Telegram group chat), the manager assigns missions, workers execute and report back. It's a coordination layer for a squad.

## What it's becoming

The reference runtime for operating Claude Code bots in production. Bots install clauDNA via marketplace plugin, get distinct GitHub App identities, query Claudron before tasks and write findings after, and optionally emit telemetry to Claudosseum. The framework stays local-first: a fleet runs on a Pi in a closet with zero required hosted dependencies. The hosted Claudosseum arena exists for those who want it.

## North star

Trivial to run a fleet of distinct, cooperating bots on cheap hardware.

## Guiding principles

- **Local-first, no required hosted dependencies.** A Claudlobby fleet works offline. Anything that connects to a hosted service is opt-in.
- **Distinct identities.** Each bot has its own Telegram bot, GitHub App, persona, isolated state. Bots are entities, not threads of a single account.
- **Reliable orchestration over flashy orchestration.** tmux dispatch is unsexy and works. Telegram-based dispatch drops messages. Use the reliable channel for control, the visible channel for reporting.
- **Manager-worker pattern as the default.** One bot listens, others activate on demand. Scales naturally from 2 bots to a dozen without architectural changes.
- **Ecosystem-aware.** Claudlobby bots know clauDNA, Claudron, and Claudosseum exist. They install clauDNA, query and write to Claudron, optionally emit to Claudosseum. They aren't generic Claude Code processes — they're citizens of the ecosystem.
- **Bootstrap as a first-class operation.** Adding a new bot should be one command that handles every layer: directory scaffold, systemd unit, Telegram pairing, GitHub App provisioning, clauDNA install, Claudron vault wiring.
- **Resource-conscious.** Targets cheap hardware (Pi 5, Mac mini). RAM and CPU budgets are real constraints, not afterthoughts.

## Position in the ecosystem

**Consumes:** clauDNA (installed as marketplace plugin on each bot, providing skills/hooks/agents); Claudron (queried for context before tasks, written to with findings after); optionally Claudosseum (receives telemetry signal from bots).

**Produces:** real-world telemetry that Claudosseum uses to score skills; knowledge content written into Claudron vaults; the actual work — PRs, code reviews, deployments, customer responses, whatever the operator's domain demands.

**Sibling boundaries:**
- Claudlobby does not define skills. clauDNA does.
- Claudlobby does not store the long-lived knowledge corpus. Claudron does.
- Claudlobby does not evaluate skill quality. Claudosseum does.
- Claudlobby is not a hosted service. It's a framework users run on their own hardware.

## In bounds for autonomous work

**Standing permissions:**
- Bug fixes in lifecycle scripts, keepalive, dispatch, fleet-state tooling
- Documentation and examples (bot archetypes, integration guides, setup walkthroughs)
- New utility scripts in `bot-common/`
- Test additions and coverage improvements
- Bot persona templates and example configurations
- Improvements to bootstrap tooling that don't change its public interface
- Telegram formatting helpers and channel reliability improvements

**Current sprint focus:**
1. Migrate from shared GitHub PAT to per-bot GitHub Apps, with token-vending sidecar for installation token refresh
2. Replace the manual "GitHub PAT in env vars" pattern in bot config with App-based auth
3. Integrate clauDNA marketplace plugin install into `bootstrap-bot.sh`
4. Add Claudron MCP server config to bot bootstrap and document the query-before / write-after pattern
5. Optional telemetry emitter: bots write structured signal to Claudosseum if configured
6. Extend `bot.conf` with ecosystem-aware fields (clauDNA version pin, Claudron vault path, Claudosseum tenant ID)

## Requires approval

- Architectural changes to the manager-worker pattern or dispatch mechanism
- New required dependencies (anything that adds to the prereq install list)
- Breaking changes to `bot.conf` format
- Changes that introduce a hosted dependency for the framework itself
- Cross-host fleet coordination work (explicitly out of scope for v1)
- Changes to how bot identities are provisioned (Telegram, GitHub App, MCP server config)
- New MCP servers added to the default bot template

## Success metrics

- Fleets in production (humans actually running Claudlobby on their own hardware)
- Bot uptime and mean time between restarts trending up
- Time from `bootstrap-bot.sh` invocation to a running, paired bot trending down
- Resource efficiency holding on the Pi 5 baseline as features are added
- Number of distinct bot personas in active fleets (system supports diversity, not just one-bot deployments)
- Reduction in tribal-knowledge issues filed (docs and bootstrap maturity)

## What we choose not to build

- **A hosted version.** Claudlobby is software users run themselves. We are not becoming "Claude Code Bots as a Service."
- **Web UI for fleet management.** Telegram + tmux + systemctl + fleet-state.json is the management surface. Adding a web UI would double the surface area for marginal benefit.
- **Cross-host fleet coordination.** A Claudlobby fleet runs on one host. Multi-host coordination is interesting and explicitly out of scope for v1 — the architecture would change too much.
- **Skill or knowledge management.** That's clauDNA and Claudron. Claudlobby orchestrates bots that consume those; it does not become them.
- **Per-bot LLM provider abstraction.** Claudlobby is for Claude Code specifically. Bots running on other LLMs would require enough divergence that they belong in a different framework.
