# B1-B4 Trust Boundary Model for AI Code Generation Agents

**Author**: Alok Tibrewala  
**Affiliation**: Senior Member, IEEE | Independent Researcher  
**Presented at**: OWASP BASC 2026  
**Slides**: https://speakerdeck.com/aloktibrewala/threat-modeling-development-workflows-with-autonomous-code-generation  
**Contact**: alokt2151 AT gmail DOT com  
**Status**: Community Contribution  
**Related Risks**: AST01, AST02, AST03, AST04, AST06, AST07, AST08, AST09

---

## Overview

The B1-B4 framework is a pipeline-level threat model for AI coding agents operating across software development pipelines. Where AST10 documents individual skill risks, B1-B4 maps how those risks **chain across trust boundaries** from developer intent to production deployment.

This model is designed to help Application Security (AppSec) teams identify where controls must be applied in sequence and avoid isolated controls.

---

## The Four Boundaries

### B1 — Developer ↔ AI Agent

**What crosses this boundary**: Developer prompts, context files, tool permissions, memory state

**Primary threats**:
- Prompt injection via untrusted context (AGENTS.md, MEMORY.md, issue tickets)
- Over-permission grants at session initialization
- Goal hijack through poisoned developer environment

**AST Mapping**: AST03, AST09  
**Control**: Least-privilege permission manifests; explicit trust confirmation before agent session; context sanitization

---

### B2 — AI Agent ↔ Code Repository

**What crosses this boundary**: Generated source code, dependency declarations, IaC templates, configuration files

**Primary threats**:
- Slopsquatting — hallucinated package names registered by attackers
- Insecure defaults in generated code (no prepared statements, open CORS, etc.)
- Secret injection via generated config files
- Malicious skill payloads embedded in generated dependency files

**AST Mapping**: AST01, AST02, AST04  
**Control**: Dependency validation before commit; generated code SAST; secret scanning on all AI-generated output; human review gate at B2 crossing

**Real-world evidence**: Snyk ToxicSkills (Feb 2026) — 36.82% of scanned skills contained security flaws introduced at or before this boundary

---

### B3 — Code Repository ↔ CI/CD

**What crosses this boundary**: Build scripts, IaC files, Dockerfiles, Kubernetes manifests, environment configs

**Primary threats**:
- AI-generated IaC with insecure defaults reaching build pipeline
- Unvalidated shell commands in generated CI scripts
- Dependency confusion attacks on build-time package resolution
- Update drift — pinned versions silently updated through AI-generated changes

**AST Mapping**: AST02, AST07, AST08  
**Control**: CI-level scanning of all AI-generated build artifacts; immutable dependency pinning; hash verification; IaC policy gates

---

### B4 — CI/CD ↔ Production

**What crosses this boundary**: Deployed containers, infrastructure configurations, secrets, runtime agents

**Primary threats**:
- AI-generated infrastructure running with excessive cloud permissions
- Misconfigured network exposure from generated Kubernetes manifests
- Privilege escalation through AI-generated IAM policies
- Host-mode agent execution without sandboxing

**AST Mapping**: AST06, AST08, AST09  
**Control**: Production policy enforcement (OPA/Gatekeeper); runtime isolation defaults; no host-mode execution without explicit override; audit logging of all agent-initiated actions

**Real-world evidence**: SecurityScorecard (Feb 2026) — 135,000+ agent instances publicly internet-exposed; CVE-2026-28363 (CVSS 9.9) enabling remote WebSocket hijack of local agent instances

---

## Pipeline View
```
Developer Intent
│
[B1] ── AST03, AST09
│      Prompt injection, over-permission
▼
AI Agent
│
[B2] ── AST01, AST02, AST04
│      Slopsquatting, insecure defaults, hallucinated deps
▼
Code Repository
│
[B3] ── AST02, AST07, AST08
│      IaC risks, dependency confusion, update drift
▼
CI/CD Pipeline
│
[B4] ── AST06, AST08, AST09
│      Privilege escalation, host-mode execution, no audit trail
▼
Production
```
---

## Using This Model

**For AppSec teams**: Use B1-B4 as a review checklist when onboarding AI coding agents. Each boundary should have an explicit control owner and a validation gate before artifacts cross.

**For threat modeling**: Map your agent architecture against the four boundaries. Identify which AST risks are present at each crossing. Prioritize controls starting at B2 - the highest-density risk boundary based on 2026 incident data.

**For compliance**: The B1-B4 model maps to NIST AI RMF GOVERN and MANAGE functions, and to ISO 42001 AI management system controls.

---

## References

### Primary Presentation
- OWASP BASC 2026: *"Threat Modeling Development Workflows with Autonomous Code Generation"* — Alok Tibrewala  
  Slides: https://speakerdeck.com/aloktibrewala/threat-modeling-development-workflows-with-autonomous-code-generation

### Research Sources
- Veracode, "2025 GenAI Code Security Report" — 45% insecure implementation rate across 100+ LLMs; AI commits leak secrets at 2x baseline rate
- Apiiro, "4x Velocity, 10x Vulnerabilities: AI Coding Assistants Are Shipping More Risks," August 2025 — 322% increase in privilege escalation paths; 153% increase in architectural design flaws (Fortune 50 dataset)
- GitGuardian, "The State of Secrets Sprawl 2026" — 28.65M hardcoded secrets on public GitHub; AI credential leaks +81% YoY; 24,008 secrets in MCP config files
- arXiv:2406.10279 — "We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs": ~20% of AI code suggestions reference nonexistent package names; 58% of hallucinated packages repeat across queries
- arXiv:2504.19956 — AI code security analysis
- Schneider, "Threat Modeling Agentic AI"

### OWASP Standards
- OWASP Agentic AI Top 10 (December 2025)
- OWASP Agentic Skills Top 10 / AST10 (March 2026)

### Incident Evidence
- Snyk ToxicSkills (Feb 2026) — 36.82% of scanned skills contained security flaws
- Check Point Research CVE-2025-59536 (Feb 2026) — CVSS 8.7 RCE in Claude Code via repository config files
- SecurityScorecard (Feb 2026) — 135,000+ agent instances publicly internet-exposed
- CVE-2026-28363 (CVSS 9.9) — WebSocket hijack of local agent instances