# RepairTrack - Developer Security Remediation Checklist

## Before You Start
- [ ] Read `SECURITY_REVIEW.md` for full context
- [ ] Read `SECURITY_REMEDIATION_PRIORITY.md` for implementation details
- [ ] Create a new branch: `git checkout -b security/fix-critical-issues`
- [ ] Each fix should be a separate commit with `security:` prefix

---

## CRITICAL ISSUES (Blocker - Do First)

### Issue #1: Delete Authorization Check
- **File:** `lib/data.js`, `components/DetalleOrdenModal.js`, and new `app/api/ordenes/[id]/delete/route.js`
- **Status:** ⬜ Not Started

**Checklist:**
- [ ] Create new API route: `/app/api/ordenes/[id]/delete/route.js`
- [ ] Add authorization check (role + sucursal_id + estado)
- [ ] Implement soft delete (deleted_at + deleted_by columns)
- [ ] Update component to call new DELETE endpoint
- [ ] Test: Employee can delete INGRESADO orders in own branch
- [ ] Test: Employee cannot delete INGRESADO from other branch
- [ ] Test: Employee cannot delete non-INGRESADO orders
- [ ] Test: Owner (dueno) can delete any order
- [ ] Commit with message: `security: implement delete authorization`

**Key Code Locations:**
- Authorization logic: Check `session.user.role`, `session.user.sucursal_id`, `orden.estado`
- Soft delete: Update `ordenes` table with `deleted_at`, `deleted_by` fields
- Validation: Verify `orden.sucursal_id === session.user.sucursal_id` for employees

---

### Issue #2: Query Injection in Search
- **File:** `lib/data.js` (lines 54-57, 168-172)
- **Status:** ⬜ Not Started

**Checklist:**
- [ ] Replace `.or(interpolated_string)` with application-level filtering
- [ ] Update `getOrdenes()` - move search filter to client-side
- [ ] Update `buscarClientes()` - move search filter to client-side
- [ ] Add comment explaining why filtering is client-side (safe from injection)
- [ ] Test: Search for "test%neq.%" - should NOT bypass filters
- [ ] Test: Search functionality still works normally
- [ ] Verify: Regular searches for "Juan", "099", etc. work correctly
- [ ] Commit with message: `security: fix query injection in search filters`

**Key Code Locations:**
- `getOrdenes()`: Line 54-58
- `buscarClientes()`: Line 168-176

**Important:** Moving to client-side filtering is safe here because:
1. Data is already fetched from server
2. Malicious input cannot bypass database-level filters (estado, sucursal_id)
3. Search is non-critical functionality (UI only, no data exposure)

---

## HIGH SEVERITY ISSUES (Before Production)

### Issue #3: Weak Password Requirements
- **File:** `app/api/admin/usuarios/route.js:49-50`
- **Status:** ⬜ Not Started

**Checklist:**
- [ ] Replace length check with 12-character minimum
- [ ] Add regex for complexity (uppercase, lowercase, number, special char)
- [ ] Update error message to describe requirements
- [ ] Test: "password" (8 chars) → rejected ❌
- [ ] Test: "Pass123456" (10 chars) → rejected ❌
- [ ] Test: "Pass@123456" (11 chars) → rejected ❌
- [ ] Test: "Pass@1234567" (12 chars, no special) → rejected ❌
- [ ] Test: "Pass@12345!" (valid) → accepted ✓
- [ ] Commit with message: `security: enforce strong password policy`

**Password Regex:**
```javascript
/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/
```

---

### Issue #4: Stats Endpoint Multi-Tenant Data Leak
- **File:** `lib/data.js` (getStats function, lines 244-266)
- **Status:** ⬜ Not Started

**Checklist:**
- [ ] Add `sucursal_id` parameter to `getStats()` function
- [ ] Add filtering: `if (sucursal_id) query = query.eq("sucursal_id", sucursal_id)`
- [ ] Update call in `app/page.js` to pass `sucursal_id`
- [ ] Test: Employee sees stats for own branch only
- [ ] Test: Owner sees stats for selected branch (or all if no filter)
- [ ] Test: Stats numbers match filtered orders
- [ ] Commit with message: `security: filter stats by sucursal_id`

**Key Code Locations:**
- `lib/data.js`: `getStats()` function
- `app/page.js`: Line 49 (call to getStats)

---

### Issue #5: Notification Endpoint Input Validation
- **File:** `app/api/notify/route.js`
- **Status:** ⬜ Not Started

**Checklist:**
- [ ] Add ALLOWED_TYPES whitelist
- [ ] Add REQUIRED_FIELDS mapping by type
- [ ] Add email validation function
- [ ] Validate notification type is in whitelist
- [ ] Validate required fields present
- [ ] Validate email format
- [ ] Validate string lengths
- [ ] Test: Invalid type → 400 error ❌
- [ ] Test: Missing email → 400 error ❌
- [ ] Test: Invalid email format → 400 error ❌
- [ ] Test: Valid notification → 200 OK ✓
- [ ] Commit with message: `security: add input validation to notify endpoint`

---

### Issue #6: Cron Endpoint Secret Verification
- **File:** `app/api/cron/recordatorios/route.js:7-15`
- **Status:** ⬜ Not Started

**Checklist:**
- [ ] Import `crypto` module
- [ ] Replace simple string comparison with HMAC verification
- [ ] Generate expected signature from request URL + secret
- [ ] Compare signatures (use constant-time comparison if available)
- [ ] Test: Request with no signature → 401 ❌
- [ ] Test: Request with wrong signature → 401 ❌
- [ ] Test: Request with correct signature → 200 ✓
- [ ] Commit with message: `security: implement cron signature verification`

**Signature Verification Code:**
```javascript
const crypto = require("crypto");
const expectedSignature = crypto
  .createHmac("sha256", cronSecret)
  .update(requestMessage)
  .digest("hex");
```

---

### Issue #7: Remove Session Secret from Repository
- **File:** `.env.local`
- **Status:** ⬜ Not Started

**Checklist:**
- [ ] Generate new AUTH_SECRET: `openssl rand -base64 32`
- [ ] Remove .env.local from git: `git rm --cached .env.local`
- [ ] Verify .env.local is in .gitignore
- [ ] Copy new secret to `.env.local` (local only, don't commit)
- [ ] Set in production (Vercel or environment):
  ```bash
  vercel env add AUTH_SECRET
  # Paste the generated secret
  ```
- [ ] Test: Authentication still works locally
- [ ] Test: Production authentication works with new secret
- [ ] Commit with message: `chore: remove .env.local from git`

**Do Not Commit:**
```
.env.local (file itself - will be recreated)
```

---

## MEDIUM SEVERITY ISSUES (Next Sprint)

### Issue #8: Missing Security Headers
- **File:** `next.config.js`
- **Status:** ⬜ Not Started

**Checklist:**
- [ ] Add `headers` function to next.config.js
- [ ] Add X-Content-Type-Options: nosniff
- [ ] Add X-Frame-Options: DENY
- [ ] Add X-XSS-Protection: 1; mode=block
- [ ] Add Referrer-Policy: strict-origin-when-cross-origin
- [ ] Add Permissions-Policy for camera, microphone, geolocation
- [ ] Test: Response headers present in browser DevTools
- [ ] Test: CSP doesn't break inline styles (Tailwind)
- [ ] Commit with message: `security: add security headers`

---

### Issue #9: Input Validation on Order Creation
- **File:** Create `app/api/ordenes/route.js`
- **Status:** ⬜ Not Started

**Checklist:**
- [ ] Create new POST endpoint for order creation
- [ ] Add validation for all fields:
  - [ ] cliente_id (required, string)
  - [ ] tipo_articulo (required, enum)
  - [ ] problema_reportado (required, max 500 chars)
  - [ ] marca (optional, max 100 chars)
  - [ ] modelo (optional, max 100 chars)
  - [ ] monto_presupuesto (optional, 0-999999)
  - [ ] nombre_articulo (required if tipo_articulo="Otro")
- [ ] Add error responses for validation failures
- [ ] Test: Invalid tipo_articulo → 400 ❌
- [ ] Test: Empty problema_reportado → 400 ❌
- [ ] Test: monto_presupuesto > 999999 → 400 ❌
- [ ] Test: Valid order → 200 ✓
- [ ] Commit with message: `security: add server-side input validation for orders`

---

## VERIFICATION STEPS

After each fix, run these tests:

```bash
# Unit tests (if available)
npm run test

# Build check
npm run build

# Local testing
npm run dev
# Test the fixed functionality manually

# Code quality
npm run lint
```

---

## Git Commit Convention

Use this format for security commits:

```
security: <description of fix>

This commit fixes <CVE or issue ID>.
Impact: <who is affected>
Risk Level: <CRITICAL|HIGH|MEDIUM|LOW>
```

Example:
```
security: implement delete authorization for orders

This commit adds server-side authorization checks to the delete endpoint.
Previously, deleteOrden() had no authorization, allowing employees to
delete any order from any branch.

Impact: Orders can no longer be deleted without proper authorization
Risk Level: CRITICAL
```

---

## Testing Checklist

After all fixes are complete, verify:

- [ ] **Delete Authorization**
  - Employee deletes own INGRESADO order ✓
  - Employee tries to delete LISTO_PARA_RETIRO order (fails) ✓
  - Employee tries to delete order from other branch (fails) ✓
  - Owner deletes order from any branch ✓

- [ ] **Query Injection**
  - Search for "normal text" works ✓
  - Search for "test%neq.%" doesn't break filters ✓
  - Special characters in search don't cause errors ✓

- [ ] **Password Policy**
  - 6-character password rejected ✓
  - 12-character password without complexity rejected ✓
  - Valid 12+ char password accepted ✓

- [ ] **Stats Filtering**
  - Employee sees only their branch stats ✓
  - Owner sees all branch stats ✓
  - Switching branches updates stats ✓

- [ ] **Notification Validation**
  - Invalid type rejected ✓
  - Missing required fields rejected ✓
  - Invalid email rejected ✓

- [ ] **Cron Security**
  - Cron runs with valid signature ✓
  - Cron rejects invalid signature ✓
  - Emails sent correctly ✓

- [ ] **Input Validation**
  - Invalid tipo_articulo rejected ✓
  - Very long strings rejected ✓
  - Negative monto_presupuesto rejected ✓

- [ ] **Security Headers**
  - X-Content-Type-Options header present ✓
  - X-Frame-Options header present ✓
  - Other security headers present ✓

---

## Code Review Checklist

When creating a PR, verify these points:

- [ ] All CRITICAL issues addressed
- [ ] All HIGH issues addressed
- [ ] No debug logging introduced
- [ ] No commented-out code left
- [ ] No TODOs added without context
- [ ] Tests pass locally
- [ ] No new console.error() calls
- [ ] Error messages don't leak sensitive data
- [ ] All new secrets removed from code

---

## Rollback Plan

If something breaks:

```bash
# Revert specific commit
git revert <commit-hash>

# Or revert entire branch
git reset --hard origin/main
git checkout security/fix-critical-issues
# Fix the issue
```

---

## Questions?

Refer to:
1. `SECURITY_REVIEW.md` - Detailed analysis
2. `SECURITY_REMEDIATION_PRIORITY.md` - Implementation guide
3. Issue comments in this checklist

**Contact:** Security Review Agent  
**Questions about fixes:** Check the detailed REMEDIATION file

---

**Status Tracking:**

```
Critical Issues: 0/2 Complete
High Issues: 0/5 Complete
Medium Issues: 0/3 Complete
Overall: 0/10 Complete (0%)
```

Update this as you complete each issue!
