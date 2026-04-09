# Security Implementation Roadmap

## Overview

This document provides a complete roadmap for implementing all security fixes identified in the comprehensive security audit.

**Current Status:** ✅ Audit Complete | ⏳ Remediation In Progress  
**Deployment Status:** ❌ BLOCKED - Do not deploy until CRITICAL issues are fixed

---

## Phase 1: CRITICAL Issues (Required Before Any Deployment)

**Estimated Time:** 4-6 hours  
**Blocker:** YES

### Issue #1.1: Missing Authorization on Delete Operations

**Files:**
- `/app/api/ordenes/[id]/delete/route.js` (create new)
- `/components/DetalleOrdenModal.js` (update)
- `/lib/data.js` (update)
- `/supabase/009_soft_delete_ordenes.sql` (run migration)

**What's Wrong:**
- Delete operations have no server-side authorization
- Employees can delete any order from any branch
- No audit trail of who deleted what

**What You Need to Do:**
1. Run database migration 009 to add `deleted_at` and `deleted_by` columns
2. Create new API endpoint with authorization checks
3. Update component to call API endpoint instead of client-side function
4. Test all authorization scenarios

**Reference Documents:**
- `START_HERE_SECURITY_FIXES.md` - Step-by-step implementation guide
- `SOFT_DELETE_IMPLEMENTATION.md` - Detailed soft delete guide with testing
- `SECURITY_REMEDIATION_PRIORITY.md` - Code snippets and verification steps

**Commit Message Template:**
```
security: implement delete authorization with role and branch checks
```

**Testing:**
- [ ] Employee can delete own INGRESADO order
- [ ] Employee cannot delete order from other branch
- [ ] Employee cannot delete non-INGRESADO order
- [ ] Owner can delete any order
- [ ] Deleted orders have audit trail (deleted_at, deleted_by)

---

### Issue #1.2: Query Injection in Search Filters

**Files:**
- `/lib/data.js` - getOrdenes() function (lines 24-63)
- `/lib/data.js` - buscarClientes() function (lines 168-176)

**What's Wrong:**
```javascript
// VULNERABLE: String interpolation in Supabase filter
.or(`cliente_nombre.ilike.%${busqueda}%,marca.ilike.%${busqueda}%,...`)
```

An attacker could search for `test%neq.%` to bypass security filters.

**What You Need to Do:**
1. Move search filtering to application layer (after data is fetched)
2. Keep server-side filters (estado, sucursal_id) - these are safe
3. Apply search filter client-side on retrieved data
4. Test that search still works and injection attempts fail

**Reference Documents:**
- `START_HERE_SECURITY_FIXES.md` - Step-by-step implementation
- `SECURITY_REMEDIATION_PRIORITY.md` - Exact code replacement

**Why This is Safe:**
- Server-side security filters applied first (cannot be bypassed by search)
- Search is UI-only, filters non-critical data
- Malicious search input cannot access data it shouldn't

**Commit Message Template:**
```
security: fix query injection in search filters
```

**Testing:**
- [ ] Normal search for "Juan" works
- [ ] Search for "test%neq.%" returns empty (not an injection)
- [ ] Special characters don't cause errors
- [ ] Server-side filters still applied correctly

---

## Phase 2: HIGH Issues (Required Before Production)

**Estimated Time:** 6-8 hours  
**Blocker:** YES (for production)

### Issue #2.1: Weak Password Requirements

**File:** `/app/api/admin/usuarios/route.js` (lines 49-50)

**Current:** Password minimum is 6 characters  
**Required:** 12 characters minimum + complexity

**Implementation:**
- Update validation to require 12+ characters
- Add regex to require: uppercase + lowercase + number + special char (@$!%*?&)

**Time:** 30 minutes

**Reference:** `SECURITY_REMEDIATION_PRIORITY.md` lines 186-207

---

### Issue #2.2: Stats Endpoint Data Leak

**File:** `/lib/data.js` - getStats() function

**Current:** Employees see metrics for all branches  
**Required:** Employees see only their branch metrics

**Implementation:**
- Add `sucursal_id` parameter to getStats()
- Filter results by `sucursal_id` if provided
- Update calling code to pass branch ID

**Time:** 1 hour

**Reference:** `SECURITY_REMEDIATION_PRIORITY.md` lines 211-244

---

### Issue #2.3: Notification Endpoint - No Input Validation

**File:** `/app/api/notify/route.js`

**Current:** Accepts any notification type and data  
**Required:** Validate type is in whitelist, validate required fields

**Implementation:**
- Create ALLOWED_TYPES whitelist
- Create REQUIRED_FIELDS mapping by type
- Validate email format
- Validate string lengths

**Time:** 1 hour

**Reference:** `SECURITY_REMEDIATION_PRIORITY.md` lines 250-290

---

### Issue #2.4: Cron Endpoint - Weak Secret Verification

**File:** `/app/api/cron/recordatorios/route.js` (lines 7-15)

**Current:** Simple string comparison `if (secret !== env.CRON_SECRET)`  
**Required:** HMAC-based signature verification

**Implementation:**
- Replace simple comparison with HMAC-SHA256 verification
- Constant-time comparison to prevent timing attacks
- Add rate limiting (optional but recommended)

**Time:** 1 hour

**Reference:** `SECURITY_REMEDIATION_PRIORITY.md` lines 310-340

---

### Issue #2.5: SESSION_SECRET Exposed in Repository

**File:** `.env.local`

**Current:** AUTH_SECRET is committed to repo  
**Required:** Remove from git, use environment variables only

**Implementation:**
1. Generate new secret: `openssl rand -base64 32`
2. Remove from git: `git rm --cached .env.local`
3. Verify in .gitignore
4. Set in production via Vercel dashboard
5. Update local .env.local (not committed)

**Time:** 30 minutes

**Reference:** `DEVELOPER_SECURITY_CHECKLIST.md` lines 148-170

---

## Phase 3: MEDIUM Issues (Next Sprint)

**Estimated Time:** 3-4 hours  
**Blocker:** NO (nice to have, but recommended)

### Issue #3.1: Missing Security Headers

**File:** `next.config.js`

**Add Headers:**
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin

**Time:** 1 hour

**Reference:** `DEVELOPER_SECURITY_CHECKLIST.md` lines 175-189

---

### Issue #3.2: Input Validation on Order Creation

**File:** Create `/app/api/ordenes/route.js` (or enhance existing)

**Validate:**
- cliente_id (required string)
- tipo_articulo (required enum)
- problema_reportado (required, max 500 chars)
- monto_presupuesto (optional, 0-999999)

**Time:** 2 hours

**Reference:** `DEVELOPER_SECURITY_CHECKLIST.md` lines 192-212

---

## Document Reference Map

| Document | Purpose | When to Use |
|----------|---------|-----------|
| `START_HERE_SECURITY_FIXES.md` | **Start here** - Step-by-step implementation | First thing to read |
| `SECURITY_REVIEW.md` | Detailed analysis of all 13 vulnerabilities | Deep dive into each issue |
| `SECURITY_REMEDIATION_PRIORITY.md` | Code snippets and implementation guides | Copy-paste code examples |
| `DEVELOPER_SECURITY_CHECKLIST.md` | Detailed checklist with testing steps | Track progress on each fix |
| `SOFT_DELETE_IMPLEMENTATION.md` | Complete soft delete guide | Understanding soft deletes |
| `SECURITY_ISSUES_SUMMARY.txt` | Executive summary with OWASP mapping | High-level overview |
| `README_SECURITY_AUDIT.md` | Entry point, links all documents | Navigation and quick ref |
| `SECURITY_DASHBOARD.txt` | Visual overview of findings | Dashboard visualization |

---

## Git Workflow for Security Fixes

### Step 1: Create Security Branch
```bash
git checkout -b security/fix-critical-issues
```

### Step 2: Implement Each Fix
- One fix per commit
- Use `security:` prefix in commit message
- Reference the issue number

### Step 3: Test Each Fix
```bash
npm run build   # Verify it compiles
npm run dev     # Test locally
npm run lint    # Check code quality
```

### Step 4: Create Pull Request
Push your branch and create PR with:
- Clear title: "Security: Fix [issue name]"
- Detailed description of changes
- Testing checklist
- Link to original security report

### Step 5: Code Review
- Request review from security-focused developer
- Address feedback
- Verify tests pass

### Step 6: Merge & Deploy
- Merge to main
- Deploy to staging for final verification
- Deploy to production
- Monitor logs for any issues

---

## Deployment Checklist

Before deploying to production, verify:

- [ ] Issue #1.1: Delete Authorization ✓
- [ ] Issue #1.2: Query Injection ✓
- [ ] Issue #2.1: Password Requirements ✓
- [ ] Issue #2.2: Stats Filtering ✓
- [ ] Issue #2.3: Notification Validation ✓
- [ ] Issue #2.4: Cron Verification ✓
- [ ] Issue #2.5: Remove AUTH_SECRET ✓
- [ ] All builds pass
- [ ] All tests pass
- [ ] Staging environment tested
- [ ] Database migrations applied
- [ ] Secrets rotated and secured
- [ ] Monitoring and logging configured

---

## Timeline Estimate

| Phase | Work | Time | Status |
|-------|------|------|--------|
| Phase 1 | Fix CRITICAL issues | 4-6 hrs | ⏳ Not Started |
| Phase 1 | Test thoroughly | 2-3 hrs | ⏳ Not Started |
| Phase 2 | Fix HIGH issues | 6-8 hrs | ⏳ Not Started |
| Phase 2 | Test & Code review | 2-3 hrs | ⏳ Not Started |
| Phase 3 | Fix MEDIUM issues | 3-4 hrs | 📅 Next Sprint |
| **Total** | **All Critical + High** | **14-20 hrs** | **Starting now** |

---

## Getting Started Right Now

1. **Read:** `START_HERE_SECURITY_FIXES.md` (15 minutes)
2. **Prepare:** Create security branch (1 minute)
3. **Implement:** Issue #1.1 - Delete Authorization (2-3 hours)
4. **Test:** All test scenarios (30 minutes)
5. **Commit:** Push to branch (5 minutes)
6. **Repeat:** Issue #1.2 - Query Injection (2-3 hours)
7. **Code Review:** Get approval
8. **Deploy:** Merge and deploy

---

## Questions?

Refer to the appropriate document:

- **"How do I implement X?"** → `SECURITY_REMEDIATION_PRIORITY.md`
- **"Why is X a vulnerability?"** → `SECURITY_REVIEW.md`
- **"What do I need to test?"** → `DEVELOPER_SECURITY_CHECKLIST.md`
- **"How do soft deletes work?"** → `SOFT_DELETE_IMPLEMENTATION.md`
- **"What's the big picture?"** → `SECURITY_ISSUES_SUMMARY.txt`
- **"Where do I start?"** → `START_HERE_SECURITY_FIXES.md` ← **You are here**

---

## Contact & Support

If you encounter issues:
1. Check the relevant security documentation
2. Review the code examples provided
3. Run the test scenarios to verify
4. Check git history for similar implementations
5. Reach out to the security reviewer

---

## Success Criteria

Phase 1 Complete:
- ✓ Delete endpoint created with authorization
- ✓ Search filtering moved to application layer
- ✓ All tests passing
- ✓ Code reviewed and approved
- ✓ Ready to merge

Phase 2 Complete:
- ✓ All HIGH issues fixed
- ✓ Security headers added
- ✓ Input validation comprehensive
- ✓ Ready for production deployment

**Status:** ⏳ **Ready to begin Phase 1**

---

**Next Step:** Open `START_HERE_SECURITY_FIXES.md` and begin implementation.

---

*Last Updated: 2026-04-09*  
*Security Audit Status: Complete - Remediation Phase Starting*
