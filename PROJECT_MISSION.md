# Project Mission — Claudosseum

## What this project is

Claudosseum is the promotion engine for clauDNA. Skills enter the arena, battle each other through automated LLM-judged scenarios, accrue ELO and telemetry signal, and the strongest get promoted into the canonical set that ships in clauDNA. It also evolves new skills via close-loss recombination of existing competitors.

The repo currently includes a centralized skill registry and MCP-based distribution layer, which were appropriate when Claudosseum was conceived as a standalone platform. With clauDNA taking over distribution as a marketplace plugin, Claudosseum's identity sharpens: it is the trust layer that decides what becomes canonical, not the runtime delivery channel.

## What it's becoming

The most differentiated piece of the Claudfather ecosystem — the thing nobody else is doing. Claudosseum sheds its old runtime-distribution role, refocuses on promotion, and grows the public arena into a credible signal that "this skill was tested in real conditions and won." That credibility is what makes clauDNA worth installing.

## North star

A continuously-refreshed champion roster grounded in real-world performance.

## Guiding principles

- **Promotion is irreversible-ish.** Demotion from clauDNA is disruptive for users. The bar to enter is high precisely so the bar to exit doesn't have to be hit often.
- **ELO + telemetry beats ELO alone.** A skill that wins battles but gets rated poorly in real deployments is not a champion. Combine both signals.
- **Public arena, opt-in private arena.** Public arena uses public Claudron packs, public submissions, public results. Private arena lets organizations evaluate against their own context without exposure.
- **Self-hostable.** OSS credibility requires the option to run your own instance. Hosted is the convenience path, not the only path.
- **Visible lineage.** Every evolved skill carries its lineage — which parents, which battles, which scenarios. Trust requires provenance.
- **Kill switches everywhere.** Arena evolution can produce regressions. Staging tiers, kill switches, and rollback paths are foundational, not afterthoughts.
- **Telemetry is opt-in and scrubbed.** No skill content. No prompts. No outputs. Just structured signals: invocation count, completion status, user rating.

## Position in the ecosystem

**Consumes:** skill submissions from humans (community, maintainers); telemetry from Claudlobby deployments (opt-in); scenarios from Claudron (local vault for private arena, public packs for public arena).

**Produces:** promotions to clauDNA — the curated champion set that ships in the next plugin release; the public leaderboard, lineage trees, and battle history that serve as the differentiated marketing surface; private arena results for opted-in tenants.

**Sibling boundaries:**
- Claudosseum does not distribute skills to bots at runtime. clauDNA does (via plugin).
- Claudosseum does not store reference knowledge. Claudron does.
- Claudosseum does not run bots. Claudlobby does.
- Claudosseum's hosted infra is the only hosted component in the ecosystem. Other repos must work without it.

## In bounds for autonomous work

**Standing permissions:**
- Bug fixes in arena code, judging logic, MCP server
- New battle scenarios drawn from public Claudron packs
- Documentation and architecture diagrams
- Test additions, including new judge prompts and evaluation rubrics
- Performance improvements to battle execution and indexing
- Leaderboard UI improvements that don't change the underlying data model

**Current sprint focus:**
1. Rename pass: claudiator → claudosseum across code, URLs, infrastructure, OAuth callbacks, documentation
2. Public arena leaderboard as a marketing-grade page anyone can browse without logging in
3. Define the promotion contract to clauDNA: what triggers a promotion, what the artifact looks like, how it gets handed off
4. Wind-down plan for legacy MCP distribution tools — deprecate in favor of clauDNA, with migration notes for existing users
5. Telemetry feedback loop: how does Claudlobby's signal flow into arena scoring?
6. Self-hostable variant: docker-compose, documentation, sane defaults

## Requires approval

- Changes to promotion criteria (high-stakes — affects what ends up in clauDNA)
- Schema changes to skill submission format
- New OAuth scopes or auth model changes
- Anything touching telemetry collection (privacy implications)
- Pricing or paid features in any tier
- Adding new LLM dependencies (judge models, evolution models — affects cost and behavior)
- Database schema migrations

## Success metrics

- Public arena activity: battles per week, submissions per week trending up
- Skill diversity: skills surviving multiple challenge rounds, evolution producing useful descendants
- Promotion accuracy: % of promoted skills that don't get demoted later
- Telemetry signal coverage: % of clauDNA installations contributing telemetry (opt-in conversion)
- Lineage depth: evolved skills successfully producing further evolutions
- Time from submission to first battle decreasing as throughput improves

## What we choose not to build

- **A runtime skill distribution channel.** Was the old pitch. clauDNA-as-plugin replaces it. Keep the MCP tools alive in maintenance mode for existing users; do not invest further.
- **A general-purpose AI evaluation framework.** Claudosseum is specifically for Claude Code skills, not arbitrary LLM evaluation. Resist scope creep into broader benchmarking.
- **Paid features in the public arena.** The public arena is a public good. Any monetization happens around private arenas, hosted convenience, or enterprise tooling — never by gating public results.
- **Skills as a product.** Skills are content. The arena is the product. Mixing the two muddies positioning.
- **Auto-promotion without gates.** Even when scoring is automated, promotion to clauDNA requires a defined gate (telemetry threshold, time-in-arena, maintainer sign-off, or some combination). Pure auto-promotion is too risky.
