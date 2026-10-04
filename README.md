# 蓝鲸游戏厅 (bluefish)

程序员爱好小组的 **DeepSeek 拟人形象（蓝鲸）小游戏合集**：格斗、闯关、塔防、跑图逃生……全部整合进同一个网页大厅。

## 架构一句话

零构建静态大厅（`index.html`）按 `games.json` 清单加载各游戏（同源 iframe 岛），游戏与大厅之间用 postMessage 协议通信（`shared/js/bluefish-shell.js` 单点封装）。整合成本 ≈ 复制模板文件夹 + 登记一行。

## 快速开始

```bash
# 仓库根目录起一个静态服务（二选一）
npx serve .
# 或
python -m http.server 8000
```

浏览器打开 `http://127.0.0.1:8000`（或对应端口）即可看到大厅。**不要 file:// 直接双击打开**，fetch 与绝对路径会全部失效。

## 新增一个游戏（3 步）

1. 复制 `games/whale-run/` 为 `games/<你的id>/`（小写字母/数字/连字符）
2. 任意技术开发，产物为纯静态文件、入口 `index.html`，引入 `../../shared/js/bluefish-shell.js`（相对路径）并按协议上报（ready / score / gameover / exit）
3. 在 `games.json` 登记一行，提 PR（只动自己文件夹 + games.json）

完整契约（协议表、BFShell API、自测清单、常见坑）见 [docs/游戏接入指南.md](docs/游戏接入指南.md)。

## 目录结构

```
bluefish/
  index.html            # 大厅入口（零构建）
  hub/                  # 大厅样式与逻辑
  games.json            # 游戏登记表（大厅动态渲染）
  games/<id>/           # 每个游戏独占一个文件夹（自有 index.html）
  shared/js/            # bluefish-shell.js：游戏侧协议壳
  shared/assets/        # 共享形象素材包（待产出）
  docs/                 # 项目文档（Obsidian 仓库）
```

## 文档

- 技术框架定稿（ADR）：[docs/技术框架定稿.md](docs/技术框架定稿.md)
- 游戏接入指南：[docs/游戏接入指南.md](docs/游戏接入指南.md)
- 文档索引：[docs/HOME.md](docs/HOME.md)

## 部署

整仓即纯静态站点：GitHub Pages 开根目录即可上线；也可整体复制到任何静态托管（Cloudflare Pages / nginx），代码零改动。无后端、无数据库，大厅用 localStorage 记录各游戏最高分。
