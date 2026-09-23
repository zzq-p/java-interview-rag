# 码上答 · Java 面试 RAG 练习台

上传自己的 Java 笔记，按主题和难度生成面试题，并根据原文片段获得作答反馈。题目和点评都需要已上传的资料；项目不带预置题库。

## 功能

- 上传 TXT、Markdown、Java、JSON、XML、CSV、Properties 文本文件，单文件不超过 2 MB。
- 将全文切分后写入 Cloudflare D1，原文件保存在 R2。可在界面中删除资料。
- 按主题检索相关片段，生成 1–8 道带出处的题目。
- 保存本轮每道题的草稿和点评，切换题目时不会丢失；进度按已点评题目数统计。
- 点评时由服务端重新读取来源片段，避免仅依赖浏览器传入的原文。

## 本地运行

要求 Node.js 22.13 或更新版本。项目使用 Vinext、Cloudflare D1 和 R2。

```powershell
npm ci
Copy-Item .env.example .env.local
# 在 .env.local 中设置 OPENAI_API_KEY
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_open_titania.sql
npm run dev
```

打开终端显示的本地地址。迁移只需对同一个本地数据库执行一次。若尚未配置模型密钥，资料仍可上传，但出题和点评会返回明确的配置错误。

## 检查

```powershell
npx tsc --noEmit
npm run lint
npm run build
```

## 部署配置

`.openai/hosting.json` 声明了 D1 的 `DB` 和 R2 的 `BUCKET` 绑定。部署前需在目标环境执行 `drizzle/0000_open_titania.sql`，并设置服务端密钥 `OPENAI_API_KEY`。可选的 `OPENAI_MODEL` 默认为 `gpt-5-mini`。不要将密钥写入源码或提交到 Git。

这个项目当前按单个资料库设计。若要开放给多位用户，需要先按身份隔离文档、片段及删除操作。
