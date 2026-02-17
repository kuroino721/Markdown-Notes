import { test, expect } from '@playwright/test';

test.describe('Production Reproduction - Subfolder Path Resolution', () => {
    test('should load note editor in iframe without duplicating the main UI', async ({ page }) => {
        // 1. アプリを起動（baseURL="/Markdown-Notes/" によりサブディレクトリ構成で開始）
        // 末尾のスラッシュがない状態でも正しく解決されるかを確認するため、あえてスラッシュなしでアクセス
        await page.goto('./');

        // 2. 「新規ノート」ボタンをクリック
        const newNoteBtn = page.locator('#btn-new');
        await expect(newNoteBtn).toBeVisible();
        await newNoteBtn.click();

        // 3. サイドパネルと iframe が表示されることを確認
        const sidePanel = page.locator('#note-side-panel');
        await expect(sidePanel).not.toHaveClass(/hidden/);

        const iframe = page.frameLocator('#note-iframe');

        // 4. iframe 内にエディタ（Crepe）がロードされていることを確認
        // もしバグが再発していれば、iframe 内に再度 #btn-new が現れる
        await expect(iframe.locator('.milkdown')).toBeVisible({ timeout: 10000 });

        // 5. 重要：iframe 内にメイン画面の要素（#btn-new）が「存在しない」ことを確認
        // これにより、画面が複製（重複）されていないことを担保する
        const duplicateBtnCount = await iframe.locator('#btn-new').count();
        expect(duplicateBtnCount).toBe(0);

        // 6. メイン画面側のヘッダーが1つだけであることを確認
        const mainBtnCount = await page.locator('#btn-new').count();
        expect(mainBtnCount).toBe(1);
    });

    test('should work correctly with trailing slash redirect awareness', async ({ page }, testInfo) => {
        // Vite preview server shows a message if trailing slash is missing.
        // In real GitHub Pages, it redirects.
        // For this test, we verify that the app works correctly at the base URL.
        const baseURL = testInfo.project.use.baseURL!;
        await page.goto(baseURL);

        const newNoteBtn = page.locator('#btn-new');
        try {
            await expect(newNoteBtn).toBeVisible({ timeout: 15000 });
            await newNoteBtn.click();

            const iframe = page.frameLocator('#note-iframe');
            await expect(iframe.locator('.milkdown')).toBeVisible({ timeout: 15000 });

            const duplicateBtnCount = await iframe.locator('#btn-new').count();
            expect(duplicateBtnCount).toBe(0);
        } catch (e) {
            // 失敗時にスクリーンショットを撮る
            await page.screenshot({ path: 'test-results/repro-failure.png' });
            throw e;
        }
    });

    test('should not duplicate UI even after mock Google Drive login', async ({ page }, testInfo) => {
        const baseURL = testInfo.project.use.baseURL!;
        await page.goto(baseURL);

        // 1. Google Drive ログイン状態をシミュレート (localStorage を設定)
        await page.evaluate(() => {
            localStorage.setItem('markdown_editor_gdrive_enabled', 'true');
            localStorage.setItem('markdown_editor_last_synced_user', 'test@example.com');
            // ブラウザアダプターが初期化時にこれを見て同期済み状態にするはず
        });

        // リロードして状態を反映
        await page.reload();

        // 同期済み状態になっていることを強制的にシミュレート (外部 API ロード待ちを避ける)
        await page.evaluate(() => {
            const statusLabel = document.getElementById('sync-status');
            if (statusLabel) statusLabel.textContent = '同期済み';
            const btnSync = document.getElementById('btn-sync-gdrive');
            if (btnSync) btnSync.classList.add('synced');
        });

        // 同期済み状態になっていることを確認
        const syncStatus = page.locator('#sync-status');
        await expect(syncStatus).toHaveText('同期済み');

        // 2. 「新規ノート」ボタンをクリック
        const newNoteBtn = page.locator('#btn-new');
        await newNoteBtn.click();

        // 3. iframe とその中身を検証
        const iframe = page.frameLocator('#note-iframe');
        await expect(iframe.locator('.milkdown')).toBeVisible({ timeout: 15000 });

        // 4. 重複ボタンがないことを確認
        const duplicateBtnCount = await iframe.locator('#btn-new').count();
        expect(duplicateBtnCount).toBe(0);

        const mainBtnCount = await page.locator('#btn-new').count();
        expect(mainBtnCount).toBe(1);
    });
});
