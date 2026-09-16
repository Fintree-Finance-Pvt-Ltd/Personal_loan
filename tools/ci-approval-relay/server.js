// A tiny, standalone approval relay for the Jenkins "Deploy to Production" gate.
//
// Why this exists: email clients strip <form>/JavaScript from message bodies, so no
// email can run a real click-to-approve action from inside itself. This service is the
// small, dedicated page that a button-link in the approval email opens instead — two
// big buttons, one click, done. No Jenkins login, no Jenkins UI.
//
// Flow: Jenkinsfile generates a single-use token and POSTs it here (/register, with a
// shared secret only Jenkins knows) right before it opens its `input` step. The email
// links to /a/<token>. Whichever button gets clicked here calls Jenkins' own REST API
// to proceed or abort that exact input step — functionally identical to a human
// clicking the button inside Jenkins, just triggered from here.
//
// State is a single JSON file on disk (tokens.json) — this only ever needs to hold a
// handful of short-lived entries, a real database would be overkill.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 4100;
const JENKINS_BASE_URL = process.env.JENKINS_BASE_URL; // e.g. https://ci.yourdomain.com
const JENKINS_API_USER = process.env.JENKINS_API_USER;
const JENKINS_API_TOKEN = process.env.JENKINS_API_TOKEN;
const RELAY_SHARED_SECRET = process.env.RELAY_SHARED_SECRET; // Jenkins -> relay auth only
const TOKEN_TTL_MINUTES = Number(process.env.TOKEN_TTL_MINUTES || 4320); // 3 days default

for (const [name, value] of Object.entries({
  JENKINS_BASE_URL, JENKINS_API_USER, JENKINS_API_TOKEN, RELAY_SHARED_SECRET,
})) {
  if (!value) {
    console.error(`Missing required env var ${name} — see .env.example`);
    process.exit(1);
  }
}

const STORE_PATH = path.join(__dirname, 'tokens.json');

function loadStore() {
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); } catch { return {}; }
}
function saveStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

// Jenkins calls this right before opening its `input` step. Authenticated by a shared
// secret header (never exposed to the browser/email) — nothing else may register tokens.
app.post('/register', (req, res) => {
  if (req.headers['x-relay-secret'] !== RELAY_SHARED_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { token, jobName, buildNumber, inputId, pusherName, pusherEmail, commitMessage, branch } = req.body || {};
  if (!token || !jobName || !buildNumber || !inputId) {
    return res.status(400).json({ error: 'missing fields' });
  }
  const store = loadStore();
  store[token] = {
    jobName, buildNumber, inputId,
    pusherName: pusherName || 'unknown',
    pusherEmail: pusherEmail || '',
    commitMessage: commitMessage || '',
    branch: branch || '',
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_MINUTES * 60 * 1000,
    used: false,
  };
  saveStore(store);
  res.json({ ok: true });
});

function getValidEntry(token) {
  const store = loadStore();
  const entry = store[token];
  if (!entry) return { error: 'This approval link is invalid or has already been used.' };
  if (entry.used) return { error: 'This build has already been approved or rejected.' };
  if (Date.now() > entry.expiresAt) return { error: 'This approval link has expired.' };
  return { entry, store };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pageShell(title, body) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; background: #f4f6f5; margin: 0; padding: 40px 16px; }
  .card { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
  h1 { font-size: 18px; margin: 0 0 16px; color: #102A2E; }
  dl { font-size: 13px; color: #4b5a5c; margin: 0; }
  dt { font-weight: 700; color: #102A2E; margin-top: 10px; }
  dd { margin: 2px 0 0; }
  .actions { display: flex; gap: 12px; margin-top: 28px; }
  form { flex: 1; margin: 0; }
  button { width: 100%; padding: 14px; border-radius: 8px; border: none; font-weight: 700; font-size: 14px; cursor: pointer; }
  .approve { background: #1b7a4d; color: #fff; }
  .reject { background: #b3261e; color: #fff; }
  .result { text-align: center; font-size: 16px; font-weight: 700; color: #102A2E; }
</style></head><body><div class="card">${body}</div></body></html>`;
}

app.get('/a/:token', (req, res) => {
  const { entry, error } = getValidEntry(req.params.token);
  if (error) return res.status(410).send(pageShell('Approval link', `<p class="result">${escapeHtml(error)}</p>`));

  res.send(pageShell('Approve production deploy', `
    <h1>Production deploy waiting for your review</h1>
    <dl>
      <dt>Pushed by</dt><dd>${escapeHtml(entry.pusherName)}${entry.pusherEmail ? ` (${escapeHtml(entry.pusherEmail)})` : ''}</dd>
      <dt>Branch</dt><dd>${escapeHtml(entry.branch)}</dd>
      <dt>Commit message</dt><dd>${escapeHtml(entry.commitMessage)}</dd>
      <dt>Jenkins build</dt><dd>#${escapeHtml(entry.buildNumber)}</dd>
    </dl>
    <div class="actions">
      <form method="POST" action="/a/${encodeURIComponent(req.params.token)}/approve">
        <button type="submit" class="approve">✅ Approve &amp; deploy</button>
      </form>
      <form method="POST" action="/a/${encodeURIComponent(req.params.token)}/reject">
        <button type="submit" class="reject">❌ Reject</button>
      </form>
    </div>
  `));
});

// Multibranch job names look like "personal-loan-platform/main" — each segment needs
// its own "job/" prefix in the Jenkins REST URL.
function jenkinsJobPath(jobName) {
  return jobName.split('/').map(encodeURIComponent).join('/job/');
}

async function callJenkinsInput(entry, action) {
  const url = `${JENKINS_BASE_URL}/job/${jenkinsJobPath(entry.jobName)}/${entry.buildNumber}/input/${encodeURIComponent(entry.inputId)}/${action === 'approve' ? 'proceedEmpty' : 'abort'}`;
  const auth = Buffer.from(`${JENKINS_API_USER}:${JENKINS_API_TOKEN}`).toString('base64');
  const resp = await fetch(url, { method: 'POST', headers: { Authorization: `Basic ${auth}` } });
  if (!resp.ok) {
    throw new Error(`Jenkins responded ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }
}

function handleDecision(action) {
  return async (req, res) => {
    const { entry, store, error } = getValidEntry(req.params.token);
    if (error) return res.status(410).send(pageShell('Approval link', `<p class="result">${escapeHtml(error)}</p>`));

    try {
      await callJenkinsInput(entry, action);
    } catch (err) {
      return res.status(502).send(pageShell('Error', `<p class="result">Could not reach Jenkins: ${escapeHtml(err.message)}</p>`));
    }

    store[req.params.token].used = true;
    saveStore(store);

    res.send(pageShell(action === 'approve' ? 'Approved' : 'Rejected', `
      <p class="result">${action === 'approve' ? '✅ Approved — production deploy is proceeding.' : '❌ Rejected — nothing was deployed.'}</p>
    `));
  };
}

app.post('/a/:token/approve', handleDecision('approve'));
app.post('/a/:token/reject', handleDecision('reject'));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`ci-approval-relay listening on :${PORT}`));
