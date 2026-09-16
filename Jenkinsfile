// CI/CD for Personal Loan Platform (backend + frontend monorepo).
//
// Runs as a Jenkins Multibranch Pipeline. The same file is read from whichever branch
// triggered the build, so `env.BRANCH_NAME` below is how a single Jenkinsfile drives two
// different deploy targets:
//   - `uat`  branch -> auto-deploys to the UAT environment on every push.
//   - `main` branch -> builds and tests on every push, but requires a manual approval
//     click in Jenkins before it touches production.
//   - any other branch -> build + test only, no deploy stage runs at all.
//
// One-time server setup (deploy folders, PM2 process names, .env files, Node/PM2
// installed for the `jenkins` user) is NOT done here — see the setup guide. This file
// only assumes that setup already exists.

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }

  environment {
    UAT_DIR  = '/var/www/personal-loan-uat'
    PROD_DIR = '/var/www/finle-prod'
    // Skip Puppeteer's own Chrome-for-Testing download on every `npm ci` — it was failing
    // against this VPS's network and isn't needed anyway: the app launches a system-
    // installed Chromium instead (see PUPPETEER_EXECUTABLE_PATH in each environment's
    // backend/.env, read at runtime, separate from this build-time-only variable).
    PUPPETEER_SKIP_DOWNLOAD = 'true'
    // Where the ci-approval-relay service (tools/ci-approval-relay) is reachable, and who
    // gets emailed when a prod deploy is waiting on approval. See that folder's README.
    CI_RELAY_URL        = 'https://ci.yourdomain.com/approvals'
    PROD_APPROVAL_EMAIL = 'you@fintreefinance.com'
  }

  stages {
    stage('Prepare CI env') {
      steps {
        // The Jenkins WORKSPACE checkout (used only for build/lint/test validation) is a
        // separate folder from the live deploy directories and never has a real .env —
        // but `prisma generate` and the app's own Zod-validated config (src/config/
        // environment.ts) both require every field with no default to be present. These
        // are throwaway placeholder values that are never used to reach a real database
        // or external service; the real secrets live only in each deploy folder's own
        // untouched .env (see the setup guide) and this stage never runs there.
        dir('backend') {
          sh '''
            cat > .env <<'ENVEOF'
NODE_ENV=test
PORT=3005
DATABASE_URL=mysql://ci:ci@localhost:3306/ci_placeholder
FRONTEND_URL=http://localhost:5173
JWT_ACCESS_SECRET=ci-placeholder-value-not-a-real-secret-0123456789
JWT_ISSUER=personal-loan-platform-ci
JWT_AUDIENCE=personal-loan-admin-ci
REFRESH_TOKEN_PEPPER=ci-placeholder-value-not-a-real-secret-0123456789
COOKIE_NAME=plp_admin_refresh_ci
SECURITY_HMAC_KEY=ci-placeholder-value-not-a-real-secret-0123456789
DOCUMENT_URL_SIGNING_KEY=ci-placeholder-value-not-a-real-secret-0123456789
BANK_ACCOUNT_ENCRYPTION_KEY=ci-placeholder-value-not-a-real-secret-0123456789
BANK_ACCOUNT_HMAC_KEY=ci-placeholder-value-not-a-real-secret-0123456789
AUDIT_INTEGRITY_KEY=ci-placeholder-value-not-a-real-secret-0123456789
ENVEOF
          '''
        }
      }
    }

    stage('Install backend deps') {
      steps {
        dir('backend') {
          sh 'npm ci'
          sh 'npx prisma generate'
        }
      }
    }

    stage('Install frontend deps') {
      steps {
        dir('frontend') {
          sh 'npm ci'
        }
      }
    }

    // Non-blocking on purpose: there's a real, pre-existing backlog of lint violations in
    // this codebase (never enforced by any CI before this pipeline existed) that would
    // otherwise fail every single build, forever, until someone works through all of it.
    // Output still shows in full in the console log below — worth cleaning up as its own
    // task — but it shouldn't hold up an otherwise-working deploy.
    stage('Lint') {
      parallel {
        stage('Backend lint') {
          steps { dir('backend') { sh 'npm run lint || true' } }
        }
        stage('Frontend lint') {
          steps { dir('frontend') { sh 'npm run lint || true' } }
        }
      }
    }

    stage('Test — backend') {
      steps { dir('backend') { sh 'npm test' } }
    }

    stage('Build') {
      parallel {
        stage('Backend build') {
          steps { dir('backend') { sh 'npm run build' } }
        }
        stage('Frontend build') {
          steps { dir('frontend') { sh 'npm run build' } }
        }
      }
    }

    stage('Deploy to UAT') {
      when { branch 'uat' }
      steps {
        sh """
          set -e
          cd ${UAT_DIR}
          git fetch origin uat
          git reset --hard origin/uat

          cd backend
          npm ci --omit=dev
          npx prisma generate
          npm run build
          npx prisma migrate deploy

          cd ../frontend
          npm ci
          npm run build

          # reload if the process already exists (zero-downtime), otherwise start it fresh —
          # makes the first-ever run self-healing instead of requiring a manual `pm2 start` first
          pm2 reload pl-uat-backend --update-env || pm2 start dist/main.js --name pl-uat-backend --cwd ${UAT_DIR}/backend
          pm2 save
        """
      }
    }

    stage('Approve production deploy') {
      when { branch 'main' }
      steps {
        // Auto-deploying prod on every push to main is exactly the kind of high-blast-
        // radius action that should never happen unattended — this stage blocks on
        // Jenkins' own `input` step until someone approves or rejects it. Approval can
        // come two ways: clicking Proceed/Abort directly in the Jenkins UI (always
        // available as a fallback), or via the email below, whose button-links open the
        // ci-approval-relay service (tools/ci-approval-relay) instead — which calls this
        // exact input step's REST API on the approver's behalf. Either path unblocks the
        // same step; nothing runs twice.
        withCredentials([string(credentialsId: 'ci-relay-shared-secret', variable: 'RELAY_SECRET')]) {
          script {
            def token = sh(script: 'openssl rand -hex 24', returnStdout: true).trim()
            def pusherName = sh(script: 'git log -1 --pretty=%an', returnStdout: true).trim()
            def pusherEmail = sh(script: 'git log -1 --pretty=%ae', returnStdout: true).trim()
            def commitMsg = sh(script: 'git log -1 --pretty=%s', returnStdout: true).trim()

            writeFile file: 'register-payload.json', text: groovy.json.JsonOutput.toJson([
              token: token,
              jobName: env.JOB_NAME,
              buildNumber: env.BUILD_NUMBER,
              inputId: 'prod-approval',
              pusherName: pusherName,
              pusherEmail: pusherEmail,
              commitMessage: commitMsg,
              branch: 'main',
            ])

            sh """
              set -e
              curl -sf -X POST '${CI_RELAY_URL}/register' \
                -H 'Content-Type: application/json' \
                -H "x-relay-secret: \$RELAY_SECRET" \
                --data @register-payload.json
            """

            emailext(
              to: "${PROD_APPROVAL_EMAIL}",
              subject: "Action needed: approve prod deploy — build #${env.BUILD_NUMBER}",
              mimeType: 'text/html',
              body: """
                <p><strong>${pusherName}</strong> (${pusherEmail}) pushed to <code>main</code>:</p>
                <p style="color:#4b5a5c">&ldquo;${commitMsg}&rdquo;</p>
                <p>Build #${env.BUILD_NUMBER} is built, tested, and ready — review and decide:</p>
                <p>
                  <a href="${CI_RELAY_URL}/a/${token}" style="display:inline-block;padding:12px 24px;background:#1b7a4d;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Review &amp; Approve / Reject</a>
                </p>
                <p style="color:#94a3a3;font-size:12px">This link works once and expires in 3 days. Console log: ${env.BUILD_URL}console</p>
              """,
            )
          }
        }

        input message: 'Waiting for approval — via the emailed link, or click Proceed here directly.', ok: 'Deploy to prod', id: 'prod-approval'
      }
    }

    stage('Deploy to Production') {
      when { branch 'main' }
      steps {
        sh """
          set -e
          cd ${PROD_DIR}
          git fetch origin main
          git reset --hard origin/main

          cd backend
          npm ci --omit=dev
          npx prisma generate
          npm run build
          npx prisma migrate deploy

          cd ../frontend
          npm ci
          npm run build

          # reload if the process already exists (zero-downtime), otherwise start it fresh —
          # makes the first-ever run self-healing instead of requiring a manual `pm2 start` first
          pm2 reload pl-prod-backend --update-env || pm2 start dist/main.js --name pl-prod-backend --cwd ${PROD_DIR}/backend
          pm2 save
        """
      }
    }
  }

  post {
    failure {
      echo "Build failed on ${env.BRANCH_NAME} — nothing was deployed."
    }
    success {
      echo "Build succeeded on ${env.BRANCH_NAME}."
    }
  }
}
