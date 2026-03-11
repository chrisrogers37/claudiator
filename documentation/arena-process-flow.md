# Arena Process Flow

End-to-end pipeline from intake submission through battle to evolution.

## Full Pipeline

```mermaid
flowchart TD
    subgraph Intake["Intake Phase"]
        A[Candidate Submitted] --> B[Categorize - Haiku]
        B --> C{Matches existing skill?}
        C -->|Yes| D[Score Fight Worthiness - Haiku]
        C -->|No| E[Auto-score 80, new category]
        D --> F[Queue for Battle]
        E --> F
    end

    subgraph Matchmaking["Matchmaking"]
        F --> G[Find highest-scored queued candidate]
        G --> H[Get champion latest version]
        H --> I[Create Battle record]
    end

    subgraph BattleExec["Battle Execution"]
        I --> J[Generate 3 Scenarios - Haiku]
        J --> K[For each scenario x round]

        K --> L1[Execute Champion Skill - Sonnet]
        K --> L2[Execute Challenger Skill - Sonnet]
        L1 --> M[Judge Round x5 - Haiku]
        L2 --> M
    end

    subgraph Verdict["Aggregation & Verdict"]
        M --> N[Aggregate all judgments]
        N --> O{Determine verdict}
        O -->|Champion wins| P[Champion retains title]
        O -->|Challenger wins| Q[Challenger promoted]
        O -->|Draw| R[Draw recorded]
    end

    subgraph PostBattle["Post-Battle"]
        P --> S[Update ELO ratings]
        Q --> S
        R --> S
        S --> T[Record ELO history]
        T --> U{Close battle or evolve?}
        U -->|Score diff <= 10 or challenger won| V[Generate Evolved Version - Sonnet]
        V --> W[Create new candidate + evolution battle]
        W --> I
        U -->|Decisive champion win| X[Battle Complete]
    end
```

## LLM Calls Per Battle

| Phase | Model | Calls | Description |
|-------|-------|-------|-------------|
| Scenario Generation | Haiku | 1 | Generate 3 test scenarios |
| Skill Execution | Sonnet | 6 | 3 scenarios x 1 round x 2 skills |
| Judging | Haiku | 15 | 3 scenarios x 1 round x 5 judges |
| **Total per battle** | | **22** | |

Additional calls outside battle scope:
- Categorization: 1 Haiku call per candidate
- Fight Scoring: 1 Haiku call per candidate with champion match
- Evolution: 1 Sonnet call if triggered

## Observability Tables

| Table | Purpose |
|-------|---------|
| `arena_llm_calls` | Every LLM API call with tokens, latency, cost, status |
| `arena_elo_history` | ELO snapshots per battle for trend analysis |
| `arena_pipeline_events` | Phase transitions with timestamps and duration |
| `battle_rounds` (extended) | Per-execution model, tokens, latency |
| `battle_judgments` (extended) | Per-judge model, tokens, latency |
| `battles` (extended) | Aggregate LLM call count, tokens, cost |

## Pipeline Event Flow

### Candidate Lifecycle
```
submitted -> categorizing -> categorized -> scoring -> scored -> queued -> battling -> promoted/rejected
```

### Battle Lifecycle
```
creating_battle -> generating_scenarios -> executing_rounds -> judging -> aggregating -> complete
                                                                                      -> evolving -> evolved
                                                                                      -> failed
```
