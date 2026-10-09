# Louise WEB 英文配音

范围为 `data/verses.json` 中现有 93 个常用段落、175 节不同经文。同一节只生成一次。
使用仓库内 World English Bible **Classic，2020 stable text** 原文，不换成新版 WEB 或 NIV。
[WEB 官方公有领域声明](https://ebible.org/eng-web/copyright.htm)允许朗读、播送和公开分享。

声线为已授权的 `lucas-academy-media/profiles/louise/en`，本机 CosyVoice3、zero-shot、速度 0.85。
不使用收费 TTS API。私人声线参考、模型及 WAV 母版保存在仓库之外；不会提交它们。
英文配音的人工确认独立记录，不沿用 Fangfang 中文配音的试听批准。

## 查看与补充

逐节状态在 `data/narration-web-louise.json`。
本机试听清单为 `/Users/yqin/Downloads/lucas-bible-narration-web/status.html`，支持搜索、状态筛选及每节播放。

| 状态 | 含义 |
| --- | --- |
| missing | 未配音，包括后来新增的经文 |
| stale | 经文或配置改变，需要重录 |
| invalid | 损坏、空文件或静音 |
| generated | 已生成，待文字核对 |
| needs_review | 识别文字、额外声音或停顿有疑点 |
| checked | 文件与逐词机器核对通过，仍待人工试听 |
| reviewed | 所有者已确认当前录音 |
| published | 部署后公网文件已验证 |

新增经文后，在项目目录运行：

```sh
python3 scripts/web_narration.py status
OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 ../lucas-academy-media/.conda/bin/python scripts/web_narration.py generate
OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 ../lucas-academy-media/.conda/bin/python scripts/web_narration.py check
python3 scripts/web_narration.py package
```

`generate` 默认只补缺少、过期或损坏的录音；`--only JHN.3.16 --seed 6011` 可用不同采样种子重录指定经文，种子逐节保存。
长句反复出现发音疑点时可加 `--clause-pacing`：按原文逗号分句，句首大写、补句号，分句间留 250 毫秒；不改变经文用词，实际合成片段逐节保存，合并后的完整录音仍需核对。
`--emphasize a` 可把指定词大写后交给模型，帮助读清短词；仅改变合成输入的大小写，仍保存输入并要求全部原文用词核对通过。该选项也可能导致拼读字母，未通过核对的版本仍排除在网站清单之外。
旧母版保留在外部 `retained/`；改文字或换录音后，旧 ASR 检查及人工确认自动失效。
`check --watch --fallback-model medium` 可边生成边检查，并用第二个识别模型复查疑点；疑点也可用 `check --model medium --only JHN.3.16` 再核对。
前期录音使用原始 15.85 秒 Louise 参考；后续录音与部分重录使用同一参考的前 5.6 秒、两个完整句子。逐节记录实际配置与参考音频指纹，原参考文件不变。
首次准备新输出目录，先运行 `prepare --out <目录>`；声线/模型变化应使用新的输出目录。

机器检查保留实际识别全文及逐词差异，同时检查 WAV 完整性、能量、额外词和异常声音。
大小写、句读和直/弯撇号不影响对照；`bondservant`、`uncircumcision` 等明确列出的复合词接受识别器的分词差异，保留识别原文。漏词或换词仍会阻止发布；机器通过不等于人工试听通过。
只有取得所有者对这些具体录音的明确确认后，才运行 `review --only <实际试听范围> --note '<确认原话>'`。
不指定 `--only` 时确认当前全部录音；不得用旧批次的批准确认新音频。

## 网站播放和共享

`package` 仅打包 `checked`、`reviewed` 或已验证的 `published` 录音。
MP3 为单声道、32 kHz、48 kbps，与 CUV 使用同样的 Safari/iPad 播放格式。

- 录音：`public/audio/web-louise/<configId>/<BOOK>/<chapter>/<verse>-<SHA256>.mp3`。
- 网站索引：`data/narration-web-louise-release.json`。
- 其他子域使用的清单：`https://bible.lucasacademy.org/audio/web-louise/catalog.json`，部署后可访问。
- 外部 `static-release.json` 保存待部署文件、字节数、SHA、MIME、缓存及 URL 路径。

全部随 Cloudflare 网站静态资源部署；不写 R2。音频允许跨域 GET/HEAD，带哈希资源缓存一年，清单缓存五分钟。
更新录音使用新 URL；同名哈希文件内容冲突时拒绝覆盖。
`enabled:true` 仅表示文件纳入当前构建，不能当作已上线。公网核验成功后才标记 `published`。

Listen 点击后才请求当前经文，不预载整套 MP3。只为完整、明确为 WEB 且逐字匹配的段落选择 Louise 文件。
默认 Challenge 和这 175 节的选经文入口使用仓库内同一份 WEB Classic 原文，保留诗篇标题等原文内容；其他选经文仍走原有 API。译本选择依据稳定 translationKey，再比较全部文字。其他译本不能借用 WEB 录音。
片段、未配音或缺失经文保留现有浏览器朗读；连续播放失败时，浏览器只接着读剩余经文，并保持英文语言。
Stop、切换页面和再次 Listen 会取消旧会话。itch 和 iOS 离线构建均排除这批网站录音及索引。

2026-10-09，[PR #5](https://github.com/yancyqin/lucas-academy-bible/pull/5) 已由所有者合并并授权部署，175 节 Louise WEB 录音均已上线并标为 `published`。
部署代码为 `72bfa85b9d1e3abb1c25e0b06a75250cc2599e99`，Cloudflare 版本为 `707b10ed-2094-44cd-a741-1c534a9d2415`。
公网核验涵盖 WEB 和 CUV 的 350 个 MP3 及四份清单：SHA-256、字节数、MIME、缓存、跨域读取均通过；两种译本均通过 Chromium/WebKit 的单节、连续播放、Stop 和点击前不加载检查。
部署状态与人工试听确认分别记录，合并和部署指令不写入人工试听记录。
部署收据与核验结果保存在外部输出目录的 `production-receipt.json`、`production-static-verification.json` 和 `production-browser-verification-WEB.json` / `production-browser-verification-CUV.json`。
