---
name: security-audit
description: Full security audit of the project using OWASP Agentic Skills Top 10. Checks backend API, frontend, dependencies, secrets, authentication, injection vulnerabilities, and skill/config safety. Run with /security-audit.
version: 1.0.0
allowed-tools: Read, Grep, Glob, Bash
---

# Security Audit — OWASP Agentic Skills Top 10

When this skill is activated, perform a comprehensive security audit of the current project.

## Audit Protocol

Work through each category below. For each issue found, report:
- **Severity**: Critical / High / Medium / Low
- **Location**: file path + line number
- **Issue**: what the problem is
- **Fix**: concrete code change to resolve it

---

## AST01 — Secrets & Credential Exposure (Critical)

Scan for hardcoded secrets, tokens, API keys, passwords in code and config:

```bash
grep -rn "password\s*=\s*['\"]" --include="*.js" --include="*.ts" --include="*.env*" .
grep -rn "secret\|apiKey\|api_key\|token\|private_key" --include="*.js" --include="*.ts" . | grep -v "node_modules\|.git\|test"
grep -rn "process\.env\." --include="*.js" . | grep -v "node_modules"
```

Check `.env` files are in `.gitignore`. Check no secrets committed to git.

---

## AST02 — Supply Chain & Dependencies (Critical)

Check for outdated or vulnerable packages:

```bash
cd student && npm audit 2>&1 | head -50
cd back && npm audit 2>&1 | head -50
```

Check `package.json` for unpinned version ranges (`^`, `~`). Check for packages not used.

---

## AST03 — Authentication & Authorization (High)

In the backend (`back/src/`), check:
- Every API route has authentication middleware
- JWT tokens are verified properly, not just decoded
- No routes accessible without auth that should require it
- Role checks (student vs admin) are enforced server-side

```bash
grep -rn "router\.\(get\|post\|put\|delete\)" back/src/routes/ --include="*.js"
grep -rn "authenticateToken\|requireAuth\|isAuthenticated" back/src/ --include="*.js"
```

---

## AST04 — Injection Vulnerabilities (High)

Check for SQL injection, NoSQL injection, command injection:

```bash
grep -rn "query\|exec\|eval\|\.raw(" back/src/ --include="*.js" | grep -v "node_modules\|test"
grep -rn "req\.body\|req\.params\|req\.query" back/src/ --include="*.js" | grep -v "node_modules"
```

Check all user input is validated before reaching database queries.
Check Sequelize queries use parameterized queries, not string concatenation.

---

## AST05 — XSS & Frontend Security (High)

In frontend (`student/src/`):

```bash
grep -rn "dangerouslySetInnerHTML\|innerHTML\|document\.write" student/src/ --include="*.js" --include="*.jsx"
grep -rn "eval(" student/src/ --include="*.js"
```

Check Content Security Policy headers are set on the backend.

---

## AST06 — CORS & Network Exposure (High)

Check CORS configuration in the backend:

```bash
grep -rn "cors\|CORS\|origin" back/src/ --include="*.js" | grep -v "node_modules"
```

Ensure CORS is not set to `*` in production. Check allowed origins list.

---

## AST07 — Rate Limiting & DoS Protection (Medium)

```bash
grep -rn "rateLimit\|rate-limit\|express-rate" back/src/ back/package.json --include="*.js" --include="*.json"
```

Check login, registration, and API endpoints have rate limiting applied.

---

## AST08 — Data Validation & Sanitization (Medium)

Check that all incoming request bodies are validated:

```bash
grep -rn "req\.body\." back/src/controllers/ --include="*.js" | head -30
grep -rn "joi\|zod\|express-validator\|sanitize" back/src/ --include="*.js"
```

---

## AST09 — Error Handling & Information Disclosure (Medium)

```bash
grep -rn "console\.error\|console\.log\|stack\b" back/src/ --include="*.js" | grep -v "node_modules"
grep -rn "err\.stack\|error\.stack\|process\.env\.NODE_ENV" back/src/ --include="*.js"
```

Ensure stack traces are never sent to the client in production. Error messages should not reveal internal details.

---

## AST10 — Security Headers & Config (Medium)

```bash
grep -rn "helmet\|x-frame\|content-security\|strict-transport" back/src/ --include="*.js"
```

Check `helmet` or equivalent security headers middleware is used.

---

## Output Format

After running all checks, produce a structured report:

```
## Security Audit Report — [project name]

### CRITICAL
- [ ] Issue description (file:line) — Fix: ...

### HIGH  
- [ ] ...

### MEDIUM
- [ ] ...

### LOW
- [ ] ...

### PASSED ✅
- List of categories with no issues found

### Recommended next steps
1. ...
```

Fix all Critical and High issues immediately. For each fix, make the actual code change.
