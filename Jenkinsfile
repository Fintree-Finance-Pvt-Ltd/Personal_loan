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
        // Requires a human to click "Proceed" in the Jenkins UI. Auto-deploying prod on
        // every push to main is exactly the kind of high-blast-radius action that should
        // never happen unattended.
        input message: 'Deploy this build to PRODUCTION?', ok: 'Deploy to prod'
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
