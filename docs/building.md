# Building and Packaging GitHub Desktop

本文档介绍如何在本地构建和打包 GitHub Desktop 应用。

## 环境要求

- macOS 10.9 或更高版本
- Node.js >= 10
- Yarn >= 1.9
- Python 3（用于编译本地模块）

## 前置准备

首次构建前，需要安装依赖：

```bash
yarn install
```

这会安装根目录和 app 目录的所有依赖项。

## 开发模式运行

如果你想以开发模式运行应用（支持热重载）：

```bash
yarn start
```

应用将在开发模式下启动，默认监听 `http://localhost:3000`。

## 生产构建

### 1. 编译代码

首先编译所有生产环境代码：

```bash
yarn compile:prod
```

这会使用 webpack 编译以下模块：
- `main.js` - 主进程代码
- `renderer.js` - 渲染进程代码
- `cli.js` - 命令行工具
- `crash.js` - 崩溃报告界面
- `highlighter.js` - 语法高亮模块

编译后的文件会输出到 `out/` 目录。

### 2. 打包应用

使用 `tsx` 运行构建脚本（推荐）：

```bash
NODE_ENV=production npx tsx --tsconfig script/tsconfig.json script/build.ts
```

这个步骤会：
- 复制所有必要的依赖和资源
- 使用 `electron-packager` 创建应用包
- 输出到 `dist/GitHub Desktop-darwin-arm64/` 目录

**注意**：如果看到代码签名警告，这是正常的，因为没有配置 Apple 开发者账号。

### 3. 创建分发包（可选）

如果你想创建一个可分享的 zip 文件：

```bash
ditto -ck --keepParent "dist/GitHub Desktop-darwin-arm64/GitHub Desktop.app" "dist/GitHub Desktop-darwin-arm64.zip"
```

## 输出文件

构建完成后，你会得到以下文件：

```
dist/
└── GitHub Desktop-darwin-arm64/
    ├── GitHub Desktop.app    # 可执行应用
    ├── LICENSE                # 许可证文件
    ├── LICENSES.chromium.html # Chromium 依赖许可证
    └── version                # 版本信息
```

如果创建了 zip 包：
```
dist/
└── GitHub Desktop-darwin-arm64.zip  # 可分享的压缩包（约 170MB）
```

## 运行打包后的应用

### 直接运行

双击 `GitHub Desktop.app` 或使用命令行：

```bash
open "dist/GitHub Desktop-darwin-arm64/GitHub Desktop.app"
```

### 首次运行提示

由于应用没有代码签名，首次运行时可能会看到以下警告：

> "无法验证开发者"

**解决方案**：

1. **方法一**：右键点击应用，选择"打开"
2. **方法二**：在系统设置 -> 隐私与安全性中，点击"仍要打开"

## 常见问题

### 端口被占用

如果遇到 `EADDRINUSE: address already in use :::3000` 错误：

```bash
# 查找并杀死占用 3000 端口的进程
lsof -ti:3000 | xargs kill
```

### ES Module 导入错误

如果遇到 `ERR_REQUIRE_ESM` 错误，请使用 `tsx` 而不是 `ts-node`：

```bash
# 使用 tsx
NODE_ENV=production npx tsx --tsconfig script/tsconfig.json script/build.ts

# 而不是 ts-node（会有 ES Module 问题）
NODE_ENV=production ts-node -P script/tsconfig.json script/build.ts
```

### 构建失败

如果构建失败，尝试清理并重新构建：

```bash
# 清理构建产物
yarn clean-slate

# 重新构建
yarn rebuild-hard:prod
```

### 架构说明

默认情况下，构建会匹配你当前系统的架构：
- **Apple Silicon Mac** (M1/M2/M3) -> `arm64`
- **Intel Mac** -> `x64`

如果你需要为不同的架构构建，可以设置环境变量：

```bash
# 为 Intel Mac 构建（在 Apple Silicon 上）
export TARGET_ARCH=x64
NODE_ENV=production npx tsx --tsconfig script/tsconfig.json script/build.ts
```

## 快捷命令

### 完整打包流程

一键完成编译和打包：

```bash
# 编译 + 打包
yarn compile:prod && NODE_ENV=production npx tsx --tsconfig script/tsconfig.json script/build.ts

# 编译 + 打包 + 创建 zip
yarn compile:prod && NODE_ENV=production npx tsx --tsconfig script/tsconfig.json script/build.ts && ditto -ck --keepParent "dist/GitHub Desktop-darwin-arm64/GitHub Desktop.app" "dist/GitHub Desktop-darwin-arm64.zip"
```

## 开发模式构建

如果你需要开发模式的构建（带调试信息）：

```bash
yarn build:dev
NODE_ENV=development npx tsx --tsconfig script/tsconfig.json script/build.ts
```

开发版本会创建 `GitHub Desktop-dev.app`。

## 相关文档

- [安装指南](installation.md) - 如何安装 GitHub Desktop
- [贡献指南](contributing/README.md) - 如何为项目做贡献
- [技术文档](technical/) - 深入的技术细节
