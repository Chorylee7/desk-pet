# 🐾 DeskPet · 桌面宠物

跨平台桌面宠物（macOS / Windows），基于 **Electron + 原生 HTML/CSS/JS**，无前端框架、无构建步骤。

## 功能

- 🖱️ **拖拽 + 置顶悬浮**：透明无边框窗口，始终置顶，手动拖拽（自动区分点击/拖动，拖出屏幕自动夹回）
- 👆 **点击互动**：随机跳跃/旋转/摇摆动画 + 爱心粒子 + 说话气泡
- 🎭 **多形象切换**：内置 5 个 SVG 卡通（小猫 / 小狗 / 史莱姆 / 小兔 / 外星人）
- 📥 **自定义导入**：支持 PNG/GIF/JPG/WebP/SVG，可拖图片到宠物身上或从设置窗导入
- 🚶 **随机走动**：每 8–20 秒在桌面边缘随机散步，走动时翻转朝向
- 🦆 **拼豆橡皮鸭**：拼豆玩法——点几下把 118 颗豆子拼成小鸭子，再**熨烫**（熨斗来回滑动、豆子融合）→**撕下熨烫纸** → 鸭子诞生成为活宠物

## 运行

```bash
npm install
npm start
```

> 国内网络安装 Electron 慢时，可指定镜像：
> `ELECTRON_MIRROR=https://mirrors.huaweicloud.com/electron/ npm install`

退出：点击菜单栏/系统托盘图标 →「退出」。

## 开发

```bash
npm start          # 运行
npm run smoke      # 冒烟测试（3 秒自动退出）
npm run gen-icon   # 重新生成托盘图标
node scripts/preview-bead.js   # 渲染拼豆鸭预览图到 preview/
```

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

## License

[Apache License 2.0](LICENSE)
