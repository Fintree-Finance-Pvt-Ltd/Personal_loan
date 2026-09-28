/**
 * PM2 layout for scaling out.
 *
 * NOT used automatically: the current deploy (Jenkinsfile) still starts/reloads a single
 * process, and nothing changes until you deliberately switch to this file.
 *
 * Two apps from the same build:
 *   finle-prod-api     N copies (cluster mode). Serves HTTP only (APP_ROLE=api).
 *   finle-prod-worker  exactly ONE copy. Runs the lender outbox worker, the partner
 *                      webhook worker and every scheduled job (APP_ROLE=worker).
 *
 * Switching over (rehearse on UAT first, in a quiet window):
 *   1. pm2 delete finle-prod-api          # stop the current single process
 *   2. pm2 start ecosystem.config.js      # run from the backend folder
 *   3. pm2 save
 *
 * Never run the worker app more than once: the scheduled jobs (SMS/IVR/WhatsApp
 * reminders, Easebuzz debit presentment) have no distributed lock.
 *
 * Notes
 *  - The worker still opens an HTTP port, so its PORT must differ from the API's.
 *  - kill_timeout gives in-flight lender calls time to finish on reload/stop.
 *  - Rate limiting is per process (in-memory), so with several API copies the effective
 *    limit is multiplied. Move it to Redis or Nginx before relying on exact numbers.
 *  - Confirm on UAT that provider tokens cached in memory (e.g. Unaport) tolerate one
 *    token per process before running more than one API copy.
 */
module.exports = {
  apps: [
    {
      name: 'finle-prod-api',
      script: 'dist/main.js',
      cwd: __dirname,
      exec_mode: 'cluster',
      instances: 2, // raise toward the number of CPU cores
      kill_timeout: 30000,
      env: { APP_ROLE: 'api' },
    },
    {
      name: 'finle-prod-worker',
      script: 'dist/main.js',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 30000,
      env: { APP_ROLE: 'worker', PORT: 3101 },
    },
  ],
};
