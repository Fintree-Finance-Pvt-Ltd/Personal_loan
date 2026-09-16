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
  }

  stages {
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

    stage('Lint') {
      parallel {
        stage('Backend lint') {
          steps { dir('backend') { sh 'npm run lint' } }
        }
        stage('Frontend lint') {
          steps { dir('frontend') { sh 'npm run lint' } }
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
