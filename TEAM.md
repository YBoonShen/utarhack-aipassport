# AI Passport — 队友须知（现在做到哪 + 怎么改代码）

> 一句话:**代码 push 到 `main`,Vercel 前端 + Render 后端会自动重新部署,约 1–2 分钟线上就更新。不用手动 deploy。**

---

## 🟢 现在的状态（已完成 + 上线）

线上地址（任何人任何设备可用）:
- **网站(前端):** https://utarhack-aipassport.vercel.app
- **后端 API:** https://utarhack-aipassport.onrender.com

已经做好的:
- ✅ **登录系统**:Firebase 认证 —— 员工用 **Google 登录**(任何 gmail 自动建成 Level 1),或表单注册;管理员用密码登录。
- ✅ **注册账号永久保存**:账号存进 **Firestore**,后端重新部署也不会丢。
- ✅ **敏感数据检测**:Layer 1 正则 + Layer 2 Gemini(名字/上下文),检测事件写进 Firestore 审计。
- ✅ **Admin 仪表盘 / 审计日志 / 培训 / AI 工具审批 / 合规报告** —— seed 数据自动有。
- ✅ **Chrome 扩展(Smart Gateway)**、**公开部署**(Vercel + Render + Firebase)。

测试登录:
| 角色 | 怎么登 |
|---|---|
| **管理员** | `admin@abcd.com` / `Admin@123456` |
| **员工** | 点 “Continue with Google”(gmail),或表单注册 |

---

## 🔧 改代码 → 自动上线（核心流程）

**前提:** 你要是这个 GitHub 仓库的 collaborator（找 Boon Shen 在 GitHub → repo → Settings → Collaborators 加你）。

```bash
# 1. 拉最新代码
git pull origin main

# 2. 改代码…（改完在本地测,见下面“本地怎么跑”）

# 3. 提交并推送
git add -A
git commit -m "说明你改了什么"
git push origin main
```

push 之后:
- 改**前端**（`frontend/`）→ **Vercel 自动重新部署** → 1–2 分钟后刷新网站就看到。
- 改**后端**（`backend/`）→ **Render 自动重新部署** → 1–2 分钟后 API 更新。

看部署进度(可选):Vercel 面板 / Render 面板里有实时 log。**部署完直接刷新 https://utarhack-aipassport.vercel.app 就是新版。**

> ⚠️ 不要各自在 Vercel/Render 手动点 deploy —— 交给 push 自动触发就好,避免互相覆盖。

---

## 💻 本地怎么跑（改代码前先本地测）

需要 **Node.js**(18+）。第一次:

```bash
# 后端
cd backend
npm install
npm run dev        # 跑在 http://localhost:5001

# 前端(另开一个终端)
cd frontend
npm install
npm run dev        # 跑在 http://localhost:5173
```

前端会自动把 `/api` 代理到本地后端(`localhost:5001`),所以本地是完整的一套。

跑测试(push 前建议跑一下):
```bash
cd backend
npm test           # 全绿再 push
```

---

## 🔑 关于密钥(重要)

`.env` 和 `serviceAccount.json` **不在仓库里**（gitignore,安全)。分两种情况:

- **只改代码、不碰 Firebase/检测**:不用密钥也能跑 —— 没配 Firebase/Gemini 时 app 会自动降级（登录用密码/demo、检测只跑正则层),照样能开发。
- **要在本地测 Firebase 登录 / Gemini 检测**:找 Boon Shen 要这两个文件,放到:
  - `backend/.env`（Gemini key、Firebase project id 等）
  - `backend/serviceAccount.json`（Firebase Admin 私钥)
  - `frontend/.env`（Firebase 公开 config，见 `frontend/.env.example`）

**永远不要把这些密钥 commit 上去。**（已 gitignore,正常不会误传。）

---

## 🗂️ 代码在哪（快速地图）

| 想改什么 | 去哪 |
|---|---|
| 检测规则(正则:IC/电话/银行卡…) | `backend/src/detector.js`(扩展要同步 `extension/rules.js`) |
| 名字/上下文检测(Gemini) | `backend/src/layer2.js` |
| 后端 API / 路由 | `backend/src/server.js` |
| 登录逻辑 | `backend/src/accounts.js`、`auth.js`、`firebase.js` |
| 前端页面 | `frontend/src/pages/`(登录 `Auth.jsx`,管理端 `admin/`) |
| Chrome 扩展 | `extension/` |

其它文档:`DEPLOY.md`(部署细节)、`backend/FIREBASE_SETUP.md`(Firebase 配置)。

---

## ✅ 一个安全的改动循环

```
git pull → 改代码 → npm test(后端)→ 本地 npm run dev 看效果
   → git commit → git push origin main → 等 1–2 分钟 → 刷新线上确认
```
