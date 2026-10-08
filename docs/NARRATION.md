# Fangfang 和合本配音

现有 93 个段落覆盖 175 节不同的和合本经文，同一节在多个关卡出现时共用一个录音。
经文范围来自 `data/verses.json`，完整和合本文字来自 `public/cuv/*.json`，以 `USFM.章.节` 标识。

## 状态与试听

`data/narration-cuv-fangfang.json` 逐节记录原文、文字/音频 SHA-256、实际声线配置、机器识别结果、所有者试听确认及发布状态。
本机试听页在 `/Users/yqin/Downloads/lucas-bible-narration-fangfang/status.html`。

| status | 含义 |
| --- | --- |
| missing | 未配音，包括后来新增的经文 |
| stale | 经文文字或声线配置与已有录音不符，需要重录 |
| invalid | 文件损坏、空音频或静音，需要重录 |
| generated | 已生成，尚未完成文字核对 |
| needs_review | 识别发现漏字、音节、额外声音或节奏疑点 |
| checked | 文件与机器文字核对通过，尚未确认线上发布 |
| reviewed | 所有者已人工试听确认当前录音，尚未确认线上发布 |
| published | 部署后的公网文件已验证 |

`checked` 不代表人工听审。ASR 会错认人名、同音字和繁简字；保留识别原文及疑点。声调文字比对只作为参考，ASR 选字不能测量真实发声的声调。
`cuv-slow-reading/1` 对完整音节匹配、无额外词或异常声音的录音，允许最长 2 秒自然停顿及 0.6–1.8 倍本批中位数的朗读时长，原疑点保存在 `reviewNotes`。

2026-10-08，所有者确认“我检查语音了 没问题”，175 节均已完成人工试听确认；罗马书 5:2、以弗所书 1:14 和 4:5 的原 ASR 疑点仍保留。
确认记录在输出目录的 `owner-reviews.json`，绑定当前 WAV、经文文字及声线配置。替换录音或改文字后，机器检查和人工确认自动失效。
只有取得所有者明确的试听确认，才可运行 `review --note '<所有者的确认原话>'`；用 `--only` 限定实际试听的经文，不指定时记录当前全部经文。

## 后来新增经文

在项目目录运行（音频准备过程不上传或部署）：

```sh
python3 scripts/fangfang_narration.py status
OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 ../lucas-academy-media/.conda/bin/python scripts/fangfang_narration.py generate
OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 ../lucas-academy-media/.conda/bin/python scripts/fangfang_narration.py check
python3 scripts/fangfang_narration.py package
```

`status` 自动把新增经文标为 `missing`，原文改动标为 `stale`。`generate` 默认只补缺少、过期或损坏的录音。
可以单独复核或重录：

```sh
OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 ../lucas-academy-media/.conda/bin/python scripts/fangfang_narration.py check --model medium --only JHN.3.16
OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 ../lucas-academy-media/.conda/bin/python scripts/fangfang_narration.py generate --only JHN.3.16
```

旧 WAV 保留在外部输出目录的 `retained/`，不会覆盖旧母版。声线或模型配置变化应创建新的外部输出目录。

## 配音与静态资源

使用已有授权的 Fangfang 中文声线、本机 CosyVoice3、zero-shot、速度 0.85，没有收费 TTS API 调用。
参考声线、配置文件、WAV 母版和模型文件均不进入 Git；只有通过机器核对或所有者试听确认的 MP3 和公开元数据进入网站。
去掉 eBible 的显示括号但保留其中全部文字；实际合成输入哈希和预处理版本逐节保存。
少量录音使用拼音、声调完全相同的提示字（如“牧长”用“牧掌”提示 mù zhǎng），原经文不改，`pronunciationAliases` 保留提示。提示后的录音仍须核对。
首批参考为原始 22.2 秒 Fangfang 录音，后续参考为其前 8.5 秒完整句子片段；两者来自同一录音，声纹余弦相似度 0.960。逐节记录实际配置，不更换已完成录音的配置。

`package` 使用 ffmpeg 编码为 Safari/iPad 可播放的 MPEG-1 MP3，单声道、32 kHz、48 kbps，并准备：

- `public/audio/cuv-fangfang/<configId>/<BOOK>/<chapter>/<verse>-<SHA256>.mp3`：随网站一起部署的录音；
- 同目录带哈希文件名的完整 JSON 清单；
- `public/audio/cuv-fangfang/catalog.json`：其他子域可读取的最新清单，含逐节原文、配置、哈希和完整音频 URL；
- `data/narration-cuv-fangfang-release.json`：网站使用的相对路径索引；`enabled:true` 表示文件已纳入当前构建，不代表该分支已上线；
- 外部输出目录的 `static-release.json`：本次网站文件、URL 路径、哈希、字节数和预期响应头。

同名哈希 MP3 的内容若不一致会拒绝覆盖；更新录音使用新文件名，旧 URL 保留。新增未配音经文暂时使用浏览器朗读。
`package` 不生成 R2 上传清单，也不写 Cloudflare、R2、DNS 或部署配置。

项目使用现有 Cloudflare Workers Static Assets；`public/_headers` 为音频开放 GET/HEAD 的跨域读取。
哈希文件缓存一年，稳定 `catalog.json` 缓存 5 分钟。其他 Lucas Academy 子域读取 `https://bible.lucasacademy.org/audio/cuv-fangfang/catalog.json`，即可取得可共用的完整音频 URL。
网站播放器使用同源相对路径，开发预览与线上使用同一文件；只有点击 Listen 才加载，不预载整套音频。10 秒 MP3 约传输 60 KB。
本地 Cloudflare 静态资源预览和现有线上音频对 Range 请求均返回完整文件（200），没有 206 分段响应；本批短音频按整节加载，不依赖服务端分段。以后长录音若需要分段加载或快速跳转，应单独评估托管方式。

Listen 仅在明确为 CUV、完整经文、逐节文字完全匹配且整段全部有配音时播放 MP3；片段、其他译本、缺少录音及网络失败保留浏览器朗读。
Stop、切换页面和下一次 Listen 会取消旧播放；文件连续播放失败时，只回退剩余经文。
Vite 的 `narrationBuild` 插件把配音索引和 MP3 从 itch 及 iOS 离线目标中排除；保留现有离线浏览器朗读。

开 PR 时状态保留为 `reviewed` / `published:false`。合并并部署后，再验证公网文件 SHA、MIME、缓存、CORS 及浏览器播放，然后记录 `published`。

2026-10-08，[PR #4](https://github.com/yancyqin/lucas-academy-bible/pull/4) 已合并并上线，175 节均已标为 `published`。部署代码提交为 `678a3579051cb97af28e2a937008dd47eb48fdd0`，Cloudflare 验证版本为 `c6319508-9d15-4af8-b577-ea066146c337`。公网 175 个 MP3 及两份 JSON 清单全部通过 SHA-256、字节数、MIME、缓存和跨域核验；Chrome/WebKit 实际单节及连续播放、点击前不加载、停止操作均通过。公开清单可直接从 `https://bible.lucasacademy.org/audio/cuv-fangfang/catalog.json` 读取。
当前 R2 资源的迁移不在这次改动范围内。

[Workers 静态资源费用](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [响应头配置](https://developers.cloudflare.com/workers/static-assets/headers/)

## NIV 官方音频申请

个人免费收听不等于获准在自己的应用中使用或将录音复制到 R2。

- [Biblica 授权条件](https://www.biblica.com/permissions/)：符合条件的非商业网站/应用可取得免版税 Express License，但平台可能收费；当前条件还要求没有 AI/ML 功能。本项目的和合本合成音频应在申请中披露，请 Biblica 确认适用授权。现有文字许可也不能自动当作音频许可。
- [Biblica 申请表](https://www.biblica.com/permission-request-form/)：申请使用最新 NIV 官方录音的在线串流。无需为 NIV 自行生成新录音。
- [API.Bible 音频说明](https://docs.api.bible/guides/audio-bibles/)：音频须专项授权，询问 `support@api.bible`。音频以章提供，不支持直接逐节请求；部分录音有 verse timecodes，需要确认 NIV 录音是否提供，以及许可是否允许应用内按经文定位播放。

申请内容建议使用以下描述，并根据实际情况补全机构、访问量和商业模式；尚未发送或提交：

> Lucas Academy operates a Bible memorization and reading application at bible.lucasacademy.org. We would like to stream existing, unmodified official NIV audio recordings in our website, with verse-level playback where licensed timecodes are available. Please advise on the appropriate audio license, recording availability, API access, fees, attribution, permitted caching, and whether access can cover our other lucasacademy.org subdomains. Our requested NIV use is ordinary playback of the official recordings, without model training or creating a new NIV recording. The application also offers locally generated Fangfang narration of the public-domain Chinese Union Version; please confirm whether this separate CUV feature affects Express License eligibility. The app currently includes browser text-to-speech; please advise whether it must be disabled for NIV under the proposed license. We can provide the legal entity, current traffic, commercial/noncommercial model, and the completed application for review.

Biblica 公布的初审时间最多 10 个工作日；若进入完整许可协议流程，约 4–6 周。能否免费由具体用途、AI 条件及音频平台决定，目前没有音频授权确认。
