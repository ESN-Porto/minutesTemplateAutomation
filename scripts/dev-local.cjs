const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');

if (!existsSync('.env.local')) {
  console.error('Create .env.local from .env.example before starting the local server.');
  process.exit(1);
}
process.loadEnvFile('.env.local');
const child = spawn('vercel', ['dev', '--local'], { stdio: 'inherit', env: process.env });
child.on('error', () => { console.error('Could not start the Vercel CLI. Install it and try again.'); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
