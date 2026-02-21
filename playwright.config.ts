import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        // GitHub Pages のサブディレクトリ構成を再現するための baseURL
        baseURL: 'http://localhost:4173/Markdown-Notes/',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    // テスト実行前にプレビューサーバーを立ち上げる
    webServer: {
        command: 'npx cross-env GITHUB_ACTIONS=true pnpm vite preview',
        url: 'http://localhost:4173/Markdown-Notes/',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});
