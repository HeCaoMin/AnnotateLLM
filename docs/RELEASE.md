# 版本与构建

当前版本：0.0.1。数据 schema：1。

提交范围及隐私规则见 [PUBLISHING.md](PUBLISHING.md)。

```sh
npm ci
npm run check:publication
npm run check
npm test
npm run build
pwsh -File scripts/package.ps1
```

打包目录：dist/dialog-notes。ZIP 文件位于 dist；其中只包含运行所需文件、LICENSE 和第三方许可证。GitHub 版本与扩展商店分发独立，当前未上架商店。

浏览器回归使用外部安装的 Playwright：设置 DN_PLAYWRIGHT_PACKAGE 为该包 package.json 的绝对路径，DN_BROWSER 为 Chromium 浏览器可执行文件路径，执行 npm run test:browser。测试使用独立临时配置及合成页面，不登录真实账户。

发布前核对真实 ChatGPT、Chrome 和 Edge 的关键流程；实际覆盖范围记入 TEST-REPORT.md，不把模拟页面通过写成真实站点验证。
