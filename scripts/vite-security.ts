// Vite configuration only: never imported by browser application code.
// Preserve local/Replit development without trusting arbitrary Host headers.
export function developmentHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  const candidates = [env.APP_ORIGIN, env.REPLIT_DEV_DOMAIN, ...(env.REPLIT_DOMAINS ?? '').split(',')];
  return [...new Set(candidates.flatMap(value => {
    if (!value?.trim()) return [];
    try {
      const url = new URL(value.includes('://') ? value.trim() : `https://${value.trim()}`);
      const host = url.hostname;
      return ['http:', 'https:'].includes(url.protocol) && /^[a-z0-9][a-z0-9.-]*$/i.test(host) && !host.includes('..') ? [host] : [];
    } catch { return []; }
  }))];
}

// Extend Vite defaults to protect machine credentials anywhere in the workspace.
export const developmentFileDeny = [
  '**/.env', '**/.env.*', '**/*.{crt,pem,key,p12,pfx}', '**/.git/**',
  '**/.config/**', '**/.aws/**', '**/.ssh/**', '**/.git-credentials', '**/.netrc',
  '**/*credentials*.json', '**/client_secret*.json', '**/client-secret*.json',
  '**/*oauth*.json', '**/token*.json', '**/*-token.json', '**/service-account*.json',
  '**/service_account*.json', '**/backups/**', '**/data/**', '**/*.{dump,backup,sqlite,sqlite3,db}',
];
