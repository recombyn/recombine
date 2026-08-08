# 桌面端

recombyn 提供 **Tauri** 桌面应用，有两种口味：

| 版本 | 用途 | API |
|------|------|-----|
| **Local（本地版）** | 数据与模型都在本机；适合自用、离线向工作流 | 内嵌 API（SQLite），本机 `127.0.0.1:8000` |
| **Cloud（云端版）** | 界面是桌面壳，业务走线上账号与云端 API | 默认 `https://recombyn.com`（可用环境变量覆盖） |

## 本地版 vs 云端版（使用差异）

| | 本地版 | 云端版 |
|--|--------|--------|
| 登录 | 按系统用户**自动登录**，一般无邮箱验证码 | 与网页相同（邮箱 / Google 等） |
| 项目数据 | 本机 SQLite + 本地上传目录 | 云端同步 |
| 平台模型目录 | **不提供**（无 Seedream 等平台列表） | 与网页一致 |
| 第三方模型 | **必配**才能对话 / 出图；不强制会员 | 标准档及以上可配 |
| 方案 / 卡密 / 升级 | 界面通常**隐藏** | 与网页一致 |

本地版配置第三方模型的步骤见 [自定义与第三方模型](/guide/custom-models)。

## 开发与打包（命令）

在仓库根目录先装好依赖：Node、`npm install`；本地版发布还需 **Rust** 工具链，以及 API 侧 Python 环境（见仓库 `docs/desktop.md`）。

```bash
# 开发：本地版（热更新 API + 桌面窗口）
npm run dev:desktop

# 开发：云端版（连远程 API）
npm run dev:desktop:cloud

# 只构建 API 边车（PyInstaller → sidecars）
npm run build:desktop:sidecar

# 打包发布：本地版（会嵌入边车）
npm run build:desktop

# 打包发布：云端版（无边车）
npm run build:desktop:cloud
```

强制重打边车再打包时，可设环境变量（Windows PowerShell 示例）：

```powershell
$env:RECOMBYN_REBUILD_SIDECAR="1"; npm run build:desktop
```

## 打包产物路径

执行 `npm run build:desktop`（或 cloud）成功后，常见输出：

| 产物 | 路径 |
|------|------|
| 安装包（NSIS / MSI 等） | `apps/web/src-tauri/target/release/bundle/` |
| 未打包的主程序 | `apps/web/src-tauri/target/release/recombyn.exe` |
| API 边车（构建暂存） | `apps/web/src-tauri/sidecars/recombyn-api/recombyn-api.exe` |

云端版安装包也在同一 `bundle/` 目录下，产品名一般为 **Recombyn Cloud**。

> 更细的架构、边车入口与排错见仓库内工程文档：`docs/desktop.md`（面向开发者）。

## 常见问题

**提示 Request failed / 技能加载失败？**  
本地库是新的 SQLite 时，旧的云端登录态可能不匹配。退出后让本地版重新自动登录，或清掉本地库后再开（开发环境常见路径见 `docs/desktop.md`）。

**仍然出现邮箱登录页？**  
自动登录失败时会出现。拉最新代码、重启 `dev:desktop`，或按工程文档清理本地 DB 后再试。

**边车构建失败？**  
在 `apps/api` 虚拟环境中安装桌面依赖（`pip install -e ".[desktop]"`），再跑 `npm run build:desktop:sidecar`。

**8000 端口被占用？**  
关掉其它占用 8000 的 API / 旧桌面进程后再启动。

**想用云端账号与会员？**  
请使用 **Cloud** 桌面构建，或直接用网页版，而不是 Local。

## 相关文档

- [自定义与第三方模型](/guide/custom-models)
- [账户与积分](/guide/account)
- [快速入门](/guide/getting-started)
- [常见问题](/faq/)
