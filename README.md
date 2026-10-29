<p align="center"><a href="README.md">简体中文</a> · <a href="README_EN.md">English</a> · <a href="README_KR.md">한국어</a></p>

<p align="center"><img src="docs/assets/banner.svg" alt="AnnotateLLM — Highlight the answer. Keep your thinking." width="100%"></p>

<p align="center"><img src="https://img.shields.io/badge/version-0.0.1-26654e" alt="v0.0.1"> <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT"></a> <img src="https://img.shields.io/badge/Manifest-V3-6750a4" alt="Manifest V3"> <img src="https://img.shields.io/badge/data-local-43834a" alt="Local storage"></p>

# 把思考留在对话里。

**AnnotateLLM** 为 ChatGPT 网页对话提供高亮、Markdown 批注和独立笔记。摘录与想法保存在当前浏览器，随时回看，也能导出为 Markdown。当前不调用模型，不提供云同步或付费托管。

[开始安装](#安装) · [功能](#功能) · [数据格式](docs/FORMAT.md) · [反馈问题](https://github.com/HeCaoMin/AnnotateLLM/issues)

## 功能

| 阅读时 | 思考时 | 回顾时 |
| :--- | :--- | :--- |
| 🟡 黄、绿、蓝、粉四色高亮 | ✍️ Markdown 实时编辑 | 🗂️ 独立笔记库与搜索筛选 |
| 📍 摘录、上下文与消息指纹定位 | 📌 可拖动批注、固定预览 | 📄 全量或单对话导出 |
| 🌗 深浅色与窄窗口适配 | 📝 可拖动、缩放的对话便利贴 | 🛟 导入预览、冲突处理与恢复快照 |

界面支持 **中文 / English / 한국어**。在插件弹窗右上角选择语言；用户笔记与原文摘录不会被翻译。

<img src="docs/assets/workflow.svg" alt="选择文字 → 批注 → 回看 → 导出" width="100%">

## 界面预览

以下图片来自隔离浏览器中的合成演示页面，使用虚构对话，不代表真实账户截图。

![页面批注与高亮](docs/assets/annotations.png)

<details><summary>查看笔记库</summary>

![本地笔记库](docs/assets/library.png)

</details>

## 安装

1. 下载 [v0.0.1](https://github.com/HeCaoMin/AnnotateLLM/releases/tag/v0.0.1) 对应浏览器的 ZIP 并解压；也可按下方命令从源码构建。
2. 打开 Chrome 的 chrome://extensions 或 Edge 的 edge://extensions，启用“开发人员模式”。
3. 选择“加载解压缩的扩展”，加载解压后的目录；源码构建则加载 **dist/dialog-notes**，不要直接加载 extension。
4. 点击工具栏 AnnotateLLM，阅读隐私说明并启用本地批注。
5. 刷新 ChatGPT，打开具有固定网址的已保存对话，选择消息文字即可开始。

更新前先导出备份。覆盖原加载目录后重新加载扩展，并刷新 ChatGPT；不要卸载重装，以免清除本地笔记。

## 隐私与使用范围

- 仅支持 chatgpt.com 的普通已保存对话；不支持其他 LLM 网站、分享页、临时对话或无痕模式。
- 保存所选摘录、短上下文、定位信息和笔记，不保存完整聊天；无分析埋点，不自动上传或同步。
- 本地存储与导出文件没有额外密码加密；卸载扩展会清除本地数据。
- 总文档上限 2 MiB，另保留一份恢复快照；每条笔记最多 100,000 字符，单条选文最多 20,000 字符。
- 不支持重叠批注或跨消息选择；原文改变或尚未加载时，定位可能失效，但本地记录仍可查看。
- 导入须使用本插件导出的完整格式，普通 Markdown 不是可恢复备份。

已进行 Edge 隔离模拟页面回归；真实登录 ChatGPT 与 Chrome 实机兼容性仍需进一步验证，尚未上架扩展商店。详见 [测试记录](docs/TEST-REPORT.md) 与 [隐私说明](docs/PRIVACY.md)。

## 技术栈与开发

<p align="center"><img src="https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&amp;logoColor=000" alt="JavaScript"> <img src="https://img.shields.io/badge/HTML5-E34F26?logo=html5&amp;logoColor=fff" alt="HTML5"> <img src="https://img.shields.io/badge/CSS-663399?logo=css&amp;logoColor=fff" alt="CSS"> <img src="https://img.shields.io/badge/Node.js_22+-339933?logo=nodedotjs&amp;logoColor=fff" alt="Node.js"> <img src="https://img.shields.io/badge/esbuild-FFCF00?logo=esbuild&amp;logoColor=000" alt="esbuild"> <img src="https://img.shields.io/badge/editor-ProseMirror-26654e" alt="ProseMirror"></p>

需要 Node.js 22 或更新版本。编辑器及第三方依赖随扩展打包，不加载远程脚本。

```sh
npm ci
npm run check:publication
npm run check
npm test
npm run build
```

Windows 打包：`pwsh -File scripts/package.ps1`。输出位于 dist。浏览器回归配置见 [构建说明](docs/RELEASE.md)。

| 目录 | 用途 |
| --- | --- |
| extension/ | 页面适配、本地存储、三语界面 |
| editor/ | ProseMirror Markdown 编辑器 |
| tests/、scripts/ | 合成测试、检查、构建与打包 |
| docs/ | 格式契约、发布规则与公开图片 |

## 参与与许可

提交前阅读 [仓库内容与隐私标准](docs/PUBLISHING.md)。请只用虚构示例报告问题，不要附上真实聊天、备份或密钥。

采用 [MIT License](LICENSE)，第三方组件保留各自许可。AnnotateLLM 是独立项目，与 OpenAI 无隶属关系。
