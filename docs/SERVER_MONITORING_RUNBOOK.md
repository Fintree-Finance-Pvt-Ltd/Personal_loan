# Server Monitoring & Error-Management Runbook

How to see whether the platform is healthy, find server-side errors, and act on them.
No secret values belong in this file — use variable *names* only.

Names used below: production API process `finle-prod-api` (PM2), UAT `pl-uat-backend`
(PM2, jenkins user), prod URL `https://finle-prod.fintreelms.com`.
Run PM2 commands as the **same Linux user that started the process** (each user has its own PM2 daemon).

---

## 1. Is it up? (30-second check)

```bash
curl -s https://finle-prod.fintreelms.com/api/health         # process alive
curl -s https://finle-prod.fintreelms.com/api/health/ready   # DB + dependencies reachable
pm2 status                                                   # status=online, low restart count (↺)
```

- `health` fails → Nginx or process is down. Check `pm2 status`, then Nginx (section 6).
- `health` ok, `ready` fails → database / dependency problem. Check MySQL and `.env` DB settings.
- `↺` (restarts) climbing → crash loop. Read the error log (section 2).

Set up **UptimeRobot** (or similar) to ping `/api/health/ready` every 1–5 min with email/SMS alerts.

---

## 2. Where the logs are

| What | Where |
|---|---|
| App output (JSON lines) | `~/.pm2/logs/finle-prod-api-out.log` |
| App errors / crashes | `~/.pm2/logs/finle-prod-api-error.log` |
| Nginx access / error | `/var/log/nginx/access.log`, `/var/log/nginx/error.log` |
| Jenkins service | `/var/log/jenkins/jenkins.log` (+ each build's *Console Output*) |
| Lender API call history | Admin panel → application → **Stages — lender API call history** |

Live tail:

```bash
pm2 logs finle-prod-api --lines 100          # both streams, live
pm2 logs finle-prod-api --err --lines 200    # errors only
```

Rotation (do once so logs don't fill the disk):

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

---

## 3. Finding server-side errors

Every request is logged as one JSON line with a `requestId`. Errors are echoed to the client with the same id, so
**a customer's screenshot with a requestId is enough to find the exact failure.**

```bash
# Unexpected 5xx crashes (stack trace included)
grep '"event":"unhandled_exception"' ~/.pm2/logs/finle-prod-api-error.log | tail -20

# Trace one request end-to-end
grep "<requestId>" ~/.pm2/logs/finle-prod-api-*.log

# Slow requests (threshold = SLOW_REQUEST_MS)
grep '"slow":true' ~/.pm2/logs/finle-prod-api-out.log | tail -20

# Users being rate limited (possible abuse, or a shared carrier IP)
grep '"event":"rate_limited"' ~/.pm2/logs/finle-prod-api-out.log | tail -20

# Lender integration backlog warning
grep "Lender queue backlog" ~/.pm2/logs/finle-prod-api-out.log | tail -5

# Errors in the last day (rough)
grep -c '"level":"error"' ~/.pm2/logs/finle-prod-api-error.log
```

4xx responses are usually customer/input problems (validation, auth). **5xx and `unhandled_exception` are ours to fix.**

Optional switches (set in the backend `.env`, then `pm2 restart finle-prod-api --update-env`):

| Variable | Effect |
|---|---|
| `SLOW_REQUEST_MS` | Requests slower than this are logged with `"slow":true` |
| `PRISMA_SLOW_QUERY_MS` | e.g. `200` — logs DB queries slower than 200 ms (leave unset normally) |
| `SENTRY_DSN` | Send errors to Sentry (requires `npm i @sentry/node` in `backend/`); gives alerts + grouping |

---

## 4. Lender integration (Fintree) failures

Lender calls (consent, decision, update, disburse) run through a database outbox processed by a background worker.

Check for stuck or failed events (table `LenderIntegrationOutbox`; statuses `PENDING`, `PROCESSING`, `RETRY_PENDING`, `COMPLETED`, `FAILED`):

```sql
-- Anything not finished, oldest first
SELECT id, applicationReference, integrationStage, status, attemptCount,
       availableAt, lastErrorCode, lastErrorMessage
FROM LenderIntegrationOutbox
WHERE status IN ('FAILED','RETRY_PENDING','PENDING','PROCESSING')
ORDER BY createdAt
LIMIT 50;

-- Failures only
SELECT id, applicationReference, integrationStage, lastErrorCode, lastErrorMessage, updatedAt
FROM LenderIntegrationOutbox
WHERE status = 'FAILED'
ORDER BY updatedAt DESC;
```

Reading the picture:
- Many `PENDING` rows and growing + `Lender queue backlog` warnings → worker stalled or lender API slow. Check `pm2 logs`, then the lender's status.
- `RETRY_PENDING` → the system will retry automatically on its schedule; usually no action.
- `FAILED` → read `lastErrorCode`/`lastErrorMessage`, fix the cause, then replay.

Replay a failed event (admin-authenticated): `POST /admin/lender-integrations/events/:id/replay`
(only `FAILED` / `RETRY_PENDING` events; it re-sends the **same** idempotency key).

Rules of thumb:
- **Disbursal must be retried as the same V1 event.** Do not create a V2 for disbursal — the lender's disburse endpoint only accepts the `:V1` key. A validation-rejected key is not consumed, so retrying V1 after fixing data is safe.
- `DISBURSAL_AMOUNT_MISMATCH` → the amount sent must equal net disbursal (gross − 1% fee − 18% GST on fee). Check `pl_applications.approved_amount` is populated for the case.
- `DETAILS_VERSION_CONFLICT` on UPDATE → the lender holds a different details version; correlate by requestId in the pm2 logs and raise with the lender.
- Never edit outbox rows by hand without a note of what and why; never delete them (they are the audit trail).

---

## 5. Application / loan state checks (read-only SQL)

```sql
-- Loans approved but amount missing on the application (needs fixing before disbursal)
SELECT a.id, a.application_number, a.status, a.approved_amount
FROM pl_applications a
WHERE a.status = 'LENDER_APPROVED' AND a.approved_amount IS NULL;

-- Loans with a disbursal requested but no UTR yet
SELECT lan, status, disbursal_status, disbursal_requested_at
FROM pl_loans
WHERE disbursal_requested_at IS NOT NULL AND disbursal_utr IS NULL
ORDER BY disbursal_requested_at DESC;

-- Recent failed mandates
SELECT lan, status, failed_at FROM pl_loan_mandates
WHERE status = 'FAILED' ORDER BY failed_at DESC LIMIT 20;

-- Recent account-aggregator failures
SELECT lan, status, failed_at FROM customer_account_aggregator_requests
WHERE failed_at IS NOT NULL ORDER BY failed_at DESC LIMIT 20;
```

(Column status values differ by table — check the Prisma enum before filtering on a value not shown here.)

---

## 6. Server health

```bash
pm2 monit                     # live CPU / memory per process
pm2 describe finle-prod-api   # restarts, uptime, script path
free -h ; df -h ; uptime      # memory, disk, load
sudo systemctl status nginx
sudo nginx -t                 # validate config before any reload
tail -50 /var/log/nginx/error.log
```

Warning signs: disk > 85%, memory swapping, load consistently above core count, frequent PM2 restarts,
Nginx `502/504` in the error log (app down or too slow).

MySQL: enable the slow query log (`slow_query_log=1`, `long_query_time=1`) and review it weekly.
Watch connection count (`SHOW STATUS LIKE 'Threads_connected';`) against `max_connections`.

---

## 7. Deployment health (Jenkins)

- **UAT** deploys automatically on push to `uat`; **prod** deploys from `main` only after the emailed approval link is used.
- After every deploy: run section 1, then open the site and do a login. Confirm the new code landed, e.g.
  `grep -c "<a-new-symbol>" /var/www/finle-prod/backend/dist/...` returns > 0.
- Build failing: open the build's *Console Output*. Frequent causes: root-owned `node_modules`
  (`sudo chown -R jenkins:jenkins /var/www/<app>`; never run npm as root there), a failing test, Prisma migration state (P3009/P3018).
- Rollback: redeploy the last good commit through the same pipeline; if a migration ran, do not roll back the schema without a DBA-reviewed plan.

---

## 8. Behind-the-proxy settings to confirm

- `TRUST_PROXY=true` (otherwise every user appears to have the proxy's IP and rate limiting misfires).
- Multi-process modes: `APP_ROLE=all|api|worker` (default `all`). If you scale API out to several processes, run **exactly one** `worker` (cron jobs + lender worker + partner webhooks) and the rest as `api`. See `backend/ecosystem.config.js` header notes.
- Lender worker tuning: `LENDER_INTEGRATION_WORKER_CONCURRENCY` (default 3), `LENDER_INTEGRATION_POLL_MS` (default 2000).
- PDF generation: `PDF_MAX_CONCURRENT_PAGES` bounds Chromium usage (agreements, bank statements).

---

## 9. Routine checklists

**Daily (5 min)**
1. `/api/health/ready` ok; `pm2 status` online, restart count stable.
2. `grep -c unhandled_exception` on the error log — any new ones? Investigate by requestId.
3. Outbox query (section 4): nothing `FAILED`, nothing `PENDING` for more than a few minutes.
4. Disk usage (`df -h`).

**Weekly**
1. Slow requests (`"slow":true`) — group by route, fix the top offenders.
2. MySQL slow log review; check table growth.
3. `rate_limited` events — distinguish abuse from legitimate shared-IP users; adjust limits if needed.
4. Confirm log rotation is working and backups completed.

---

## 10. Incident checklist

1. **Scope**: is it everyone (health check fails) or one customer/case (requestId / LAN)?
2. **Stabilise**: app down → `pm2 restart finle-prod-api`; check that it stays up. Recent deploy suspected → roll back via pipeline.
3. **Find the cause**: error log → requestId → stack trace; for lender problems, outbox row + admin *Stages* history.
4. **Fix data safely**: prefer read-only queries first; state what you will change, change the minimum, record it.
5. **Verify**: re-run the failing journey/API; confirm the outbox event reaches `COMPLETED`.
6. **Follow up**: note root cause, add a test or alert so it is caught next time.

Never share DB credentials, JWT secrets, lender keys, or `.env` contents in tickets, chat, or logs.
