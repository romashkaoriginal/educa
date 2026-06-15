# Open Source Tools Supporting AST10 Mitigations

This page catalogs open source tools that implement mitigations for one or more AST10 risks. Listings are factual and vendor-neutral. Inclusion does not imply OWASP endorsement.

## How to Add a Tool

Submit a PR adding your tool using the template at the bottom of this page. All fields are required. Entries that read as promotional will be asked to revise.

## Summary


| Tool                                                                               | License | AST Risks Addressed                             | Language |
| ---------------------------------------------------------------------------------- | ------- | ----------------------------------------------- | -------- |
| [AgentMint](https://github.com/aniketh-maddipati/agentmint-python)| MIT     | AST01, AST02, AST03, AST04, AST07, AST08, AST09 | Python   |
| [SkillSpector](https://github.com/NVIDIA/SkillSpector)| Apache-2.0 | AST01, AST02, AST03, AST04, AST08, AST09, AST10 | Python   |


---

## AgentMint

**Description:** Runtime enforcement and signed evidence for AI agent tool calls. Evaluates every tool call against a human-approved scope before execution. Produces cryptographically signed, hash-chained receipts for every decision (allow or deny).

**License:** MIT  
**Repository:** [https://github.com/aniketh-maddipati/agentmint-python](https://github.com/aniketh-maddipati/agentmint-python)  
**Install:** `pip install agentmint`  
**Dependencies:** 2 (pynacl, requests)

### AST Risks Addressed

**AST01 — Malicious Skills:** Ed25519 signatures and SHA-256 hash chains on every receipt provide tamper-evident audit trails. Evidence packages are independently verifiable without vendor software.

**AST02 — Supply Chain Compromise:** Signed plans include key ID for provenance tracking. Receipt chains with optional RFC 3161 timestamps support independent verification of action history.

**AST03 — Over-Privileged Skills:** Runtime scope enforcement using pattern matching with wildcard hierarchies. Actions outside the approved scope are blocked before execution. Checkpoint mechanism requires human re-approval for sensitive actions.

**AST04 — Insecure Metadata:** Plan metadata (scope, delegates, checkpoints, expiry) is covered by Ed25519 signature. Modifying any field invalidates the plan.

**AST07 — Update Drift:** Plans have TTL-based expiry. Policy version is captured in every receipt via a policy hash (SHA-256 of canonical scope, checkpoints, and delegates).

**AST08 — Poor Scanning:** Shield module scans tool inputs for prompt injection (23 pattern categories), PII, secrets, encoding evasion, and structural injection. Pattern-based only; does not perform semantic analysis.

**AST09 — No Governance:** Per-agent session tracking with configurable escalation thresholds. Circuit breaker rate limiting prevents runaway execution. Signed audit trail links every action to a human-approved plan.

### Risks Not Addressed

**AST05 — Unsafe Deserialization:** Does not parse skill manifests or configs from untrusted sources.  
**AST06 — Weak Isolation:** Runs in-process. Does not provide containerization or sandbox isolation.  
**AST10 — Cross-Platform Reuse:** Receipt format is tool-specific; does not yet implement the Universal Skill Format.

### Known Limitations

- Scanning is regex-based. Semantic and behavioral attacks are not detected.
- Runs in-process alongside the agent. A compromised process can bypass enforcement.
- No web dashboard or UI. Designed as a library, not a platform.

### Framework Integration

Integrates via hooks with CrewAI, OpenAI Agents SDK, Google ADK, and MCP. Typical integration requires approximately 20 lines of code per framework.

---

## SkillSpector

**Description:** Open-source security scanner for AI agent skills (NVIDIA). Performs two-stage analysis — fast static checks plus optional LLM semantic evaluation — to answer "is this skill safe to install?" before installation. Produces a 0–100 risk score with severity labels and SARIF, JSON, or Markdown reports.

**License:** Apache-2.0  
**Repository:** [https://github.com/NVIDIA/SkillSpector](https://github.com/NVIDIA/SkillSpector)  
**Install:** `git clone https://github.com/NVIDIA/SkillSpector && make install` (or run via the included Dockerfile)  
**Dependencies:** Python 3.12+; optional LLM provider (Anthropic / OpenAI-compatible) for semantic analysis; OSV.dev for live CVE lookups

### AST Risks Addressed

**AST01 — Malicious Skills:** Detects malicious patterns and likely-malicious intent via YARA signatures, rogue-agent and trigger-abuse heuristics, and optional LLM intent analysis. Per NVIDIA's SkillSpector project, roughly 5.2% of scanned skills show likely malicious intent.

**AST02 — Supply Chain Compromise:** Supply-chain pattern category plus live OSV.dev CVE lookups against declared dependencies (with offline fallback).

**AST03 — Over-Privileged Skills:** Flags excessive agency, privilege escalation, tool misuse, and MCP least-privilege violations.

**AST04 — Insecure Metadata:** Scans `SKILL.md` prose and metadata for prompt injection and system-prompt leakage.

**AST08 — Poor Scanning:** Directly addresses the scanning gap — combines static analysis (AST-based dangerous-code detection, taint tracking, YARA) across both the code and natural-language layers with optional LLM semantic evaluation, covering 64 patterns across 16 categories.

**AST09 — No Governance:** Emits SARIF v2.1.0 for GitHub Code Scanning and CI gates; the 0–100 risk score supports approval workflows and scan-result inventories.

**AST10 — Cross-Platform Reuse:** Platform-agnostic content-layer scanner (Claude Code, Codex CLI, Gemini CLI) that evaluates skills independently of the runtime.

### Risks Not Addressed

**AST05 — Unsafe Deserialization:** Partial only — dangerous-code and taint analysis can flag unsafe parsing, but it does not sandbox deserialization.  
**AST06 — Weak Isolation:** Out of scope — a pre-install static/LLM scanner does not provide runtime sandboxing or process isolation.  
**AST07 — Update Drift:** Partial — re-scanning on update and OSV freshness help, but it does not pin versions or enforce an update policy.

### Known Limitations

- Pre-install analysis: catches issues before installation, not runtime behavior. Pair with sandboxing (AST06) and governance (AST09).
- The LLM semantic stage requires an API key / model provider; static-only mode (`--no-llm`) runs without one but with reduced intent coverage.
- Static pattern coverage, like any scanner, can be evaded by sufficiently novel obfuscation — use as one layer of a pipeline, not the sole gate.

### Framework Integration

CLI and Docker; scans Git repos, URLs, zip files, directories, or single files. Emits SARIF v2.1.0 for GitHub Code Scanning and other SARIF consumers, plus JSON and Markdown. Integrates into CI/CD as a pre-merge or pre-publish gate keyed on the risk score.

---

## Template for New Entries

```markdown
## [Tool Name]

**Description:** [One to two sentences. What the tool does, factually.]

**License:** [SPDX identifier]  
**Repository:** [URL]  
**Install:** [Command]  
**Dependencies:** [Count and notable ones]

### AST Risks Addressed

**AST[XX] — [Risk Name]:** [How the tool addresses this risk. Factual, no superlatives.]

[Repeat for each applicable risk.]

### Risks Not Addressed

**AST[XX] — [Risk Name]:** [Brief reason.]

[Repeat for each non-applicable risk.]

### Known Limitations

- [Limitation 1]
- [Limitation 2]

### Framework Integration

[Which agent frameworks it works with and how.]

```

