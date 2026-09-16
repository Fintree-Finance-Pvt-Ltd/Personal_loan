# ci-approval-relay

The page behind the "Approve" / "Reject" buttons in the production-deploy approval
email. Email clients strip `<form>`/JavaScript from message bodies, so no email can run
a real click-to-approve action by itself — this is the small dedicated page a link in
the email opens instead, and it does the actual approving by calling Jenkins' own REST
API for you.

## How it fits together

1. When a `main` build reaches the "Approve production deploy" stage, the Jenkinsfile
   generates a single-use token and `POST`s it here (`/register`), then emails a link to
   `/a/<token>`.
2. Opening that link shows who pushed, the commit message, and two buttons.
3. Clicking one calls Jenkins' REST API to proceed or abort that exact pending `input`
   step — the same thing that happens when someone clicks the button inside Jenkins
   itself, just triggered from here instead.

## One-time setup on the VPS

```bash
cd /var/www/personal-loan-uat/tools/ci-approval-relay   # or wherever you keep this checked out
npm install
cp .env.example .env
nano .env   # fill in JENKINS_BASE_URL, JENKINS_API_USER, JENKINS_API_TOKEN, RELAY_SHARED_SECRET
pm2 start server.js --name ci-approval-relay
pm2 save
```

Put Nginx in front of it on whatever domain/path the Jenkinsfile's `CI_RELAY_URL` points
at, e.g.:

```nginx
location /approvals/ {
    proxy_pass http://127.0.0.1:4100/;
    proxy_set_header Host $host;
}
```

`JENKINS_API_TOKEN` comes from Jenkins → your user icon (top right) → **Configure** →
**API Token** → **Add new Token**. `RELAY_SHARED_SECRET` is any long random string
(`openssl rand -hex 32`) — put the same value in Jenkins as the `ci-relay-shared-secret`
credential (Secret text) referenced by the Jenkinsfile.

State (`tokens.json`) is a single small JSON file next to `server.js` — no database
needed for this volume of traffic.
