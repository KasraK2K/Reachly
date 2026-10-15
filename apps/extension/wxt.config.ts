import { defineConfig } from 'wxt';
import { loadEnv } from 'vite';

export default defineConfig({
  manifest: ({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'WXT_');
    const api = env.WXT_API_URL ?? 'http://localhost:4000';
    const web = env.WXT_WEB_URL ?? 'http://localhost:3000';
    return {
      name: 'Reachly Sender',
      description: 'Sends your Reachly campaign messages from your own Instagram account, at human pace.',
      permissions: ['storage', 'alarms', 'tabs', 'scripting', 'notifications', 'cookies'],
      host_permissions: ['https://www.instagram.com/*', `${api}/*`, `${web}/*`],
    };
  },
});
