# 参与贡献

感谢你对 DeskPet 的兴趣！这是一个 Electron + 原生 HTML/CSS/JS 的桌面宠物项目，无前端框架、无构建步骤，欢迎提交 PR。

## 快速开始

```bash
npm install
npm start          # 运行（桌面宠物出现在屏幕右下角/中央）
npm run smoke      # 冒烟测试（3 秒自动退出）
npm run gen-icon   # 重新生成托盘图标
node scripts/preview-bead.js   # 渲染拼豆鸭预览图到 preview/
```

> 国内网络安装 Electron 慢时：`ELECTRON_MIRROR=https://mirrors.huaweicloud.com/electron/ npm install`

## 目录结构

```
main.js            # 主进程：窗口 / 托盘 / IPC / 设置存储
preload.js         # contextBridge 桥接层
config.js          # 默认设置与读写
src/pet.*          # 宠物窗口（渲染、动画、拖拽、点击、走动、拼豆）
src/settings.*     # 设置窗口
src/bubble.*       # 说话气泡窗口
pets/*.svg         # 内置矢量卡通形象
pets/duck.json     # 拼豆橡皮鸭图案（网格 + 颜色）
scripts/           # 托盘图标生成、拼豆预览渲染
```

## 新增一个 SVG 形象

1. 在 `pets/` 下新增 `<id>.svg`（建议 viewBox `0 0 200 200`，内部可复用 `.eye`（眨眼）、`.tail`（摇尾）、`.antenna`（摆动）等 class 以继承动画）
2. 在 `main.js` 的 `BUILTIN_PETS` 数组加一项 `{ id, label, file }`
3. 在 `src/settings.js` 的 `BUILTIN` 数组加一项（`src` 指向 SVG）
4. 重启 `npm start` 即可在托盘/设置中看到

## 新增一个拼豆形象

1. 在 `pets/` 下新增 `<name>.json`（`palette` 颜色映射 + `grid` 字符画）
2. 用 `node scripts/preview-bead.js` 渲染预览图肉眼校验
3. 在 `main.js` 的 `getBeadPattern` 中指向新 JSON，并把新形象接入托盘/设置

## 提交规范

- 建议使用约定式提交：`feat:` / `fix:` / `chore:` / `docs:`
- 提交前 `node --check` 检查改动的 JS 文件
- 保持一个 PR 只做一件事

## License

[Apache License 2.0](LICENSE)
