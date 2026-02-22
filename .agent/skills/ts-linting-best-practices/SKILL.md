---
name: TypeScript Linting Best Practices
description: Best practices for handling TypeScript linting errors, specifically regarding @ts-ignore vs @ts-expect-error and mandatory descriptions.
---

# TypeScript Linting Best Practices

TypeScript プロジェクトにおいて、静的解析エラーを適切に管理するためのベストプラクティス。

## 1. @ts-ignore ではなく @ts-expect-error を使用する

`@ts-ignore` は、次の行にエラーがあるかどうかに関わらず常にエラーを無視します。
`@ts-expect-error` は、次の行にエラーがある場合にのみ抑制し、エラーがない場合には「未使用」としてエラーを出力します。

これにより、ライブラリのアップデート等によって型エラーが解消された際に、不要になった抑制コメントを漏れなく削除できます。

## 2. 説明文の付与

ESLint ルール (`@typescript-eslint/ban-ts-comment`) の設定により、抑制ディレクティブには説明文の付与が推奨（または強制）されます。

```typescript
// @ts-expect-error: Intentional type violation for testing
expect(renderMarkdown(null)).toBe('');
```

## 3. 不要な抑制の削除

コードの修正や環境の変化により、以前必要だった `@ts-ignore` や `@ts-expect-error` が不要になることがあります。
定期的に `pnpm lint` を実行し、`Unused '@ts-expect-error' directive` などの警告が出た場合は積極的に削除してください。

## 4. JSDOM での window.location 操作

テスト環境 (JSDOM 等) で `window.location` を操作・復元する場合、型不整合が発生しやすいです。
復元時には `as any` を併用して型チェックを回避するのが現実的です。

```typescript
beforeEach(() => {
  // @ts-expect-error: JSDOM location is partially read-only
  delete window.location;
  window.location = { ...originalLocation, origin: 'https://example.com' } as any;
});

afterEach(() => {
  window.location = originalLocation as any;
});
```
