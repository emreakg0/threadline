import { readFileSync, existsSync } from 'node:fs';
const { packageManager } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expected = packageManager.replace('@', '/');
if (process.env.npm_config_user_agent?.split(' ')[0] !== expected) {
  console.error(`Use ${packageManager} and pnpm install --frozen-lockfile. Other installers are unsupported.`);
  process.exit(1);
}
for (const file of ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock']) {
  if (existsSync(new URL('../' + file, import.meta.url))) {
    console.error(`Unexpected ${file}; review it before installing. No files were deleted.`);
    process.exit(1);
  }
}
