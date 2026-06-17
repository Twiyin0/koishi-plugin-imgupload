# koishi-plugin-imgupload

[![npm](https://img.shields.io/npm/v/koishi-plugin-imgupload?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-imgupload)

将聊天中的图片或 URL 上传到 VueFileManager (VFM) 存储服务，并提供文件管理功能。

[VueFileManager](https://github.com/Twiyin0/vueFileManager)是一个基于 Vue 3、Express 和 TypeScript 的文件管理系统，支持多存储池、访客分享、WebDAV、回收站、收藏、API Key、主题与插件发现、跨池共享挂载、后台离线下载、远程上传，以及前后端统一的运行时 i18n。

## 功能

| 命令 | 别名 | 说明 |
|------|------|------|
| `imgupload <图片/链接>` | `图片上传` | 将聊天中的图片或 URL 上传到 VFM |
| `imgupload/randomImg [路径]` | `随机图片` | 从 VFM 随机获取一张图片 |

### 上传命令选项

| 选项 | 说明 |
|------|------|
| `-f <path>` | 指定上传的子目录 |
| `-t <time>` | 等待图片上传时间 (ms) |
| `-g` | 标记为 gif |
| `-c` | 开启连续上传模式，以 `$` 或 `￥` 结束 |

## 配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| vfmUrl | VueFileManager 服务地址 | http://localhost:3000 |
| apiKey | VFM API Key（需有 read、write 权限） | (必填) |
| savePath | 图片存储目标目录路径 | (空 = 根目录) |
| poolId | 存储池 ID（0 = 默认） | 0 |
| imgshareUrl | 图片分享地址前缀 | (空) |
| sendnotice | 上传前发送提示消息 | false |
| sendwait | 等待用户发送图片的时间 (ms) | 30000 |
| coiledCount | 连发模式最大张数 | 10 |

## API 支持

本插件基于 VueFileManager API，底层 `FileManager` 类支持以下完整 API：

- **文件操作**: 上传、下载、流式上传、断点续传、远程 URL 上传
- **文件管理**: 列表、搜索、重命名、移动、复制、删除、批量操作
- **存储池**: 列表、创建、更新、删除、设默认、测试连接
- **分享**: 创建、列表、删除分享链接
- **收藏**: 添加、删除、检查收藏状态
- **回收站**: 列表、恢复、永久删除、清空
- **用户**: 信息、设置管理

# CHANGELOG

## v0.3.1
### 修改
* 删除不必要的命令

## v0.3.0
### 重构
* 基于 VueFileManager API.md 全面重写，`FileUploader` → `FileManager`
* 新增 `list`、`search`、`delete`、`share` 命令
* 支持流式上传、断点续传、批量操作、跨池复制/移动
* 支持分享链接创建（含密码、过期时间、下载次数限制）
* 支持回收站管理、收藏管理、存储池管理
* `FileUploader` 保留为兼容别名

## v0.2.0
### 重构
* 迁移到 VueFileManager API，不再依赖 alist
* 认证方式改为 API Key（X-API-Key），无需账号密码
* 新增 poolId 配置项支持多存储池
* 随机图片功能改用 VFM 预览接口

## v0.1.3
### 修复
* 修复了无法获取回复消息图片的问题

## v0.1.2
### 修复
* 修复了一点小bug

## v0.1.1
### 修复
* 修复了一点小bug

## v0.1.0
### 新增
* 新增配置项可以配置连发模式下的上限
* 新增option -c 开启-c可以进入连发模式

## v0.0.1
* 自检测试通过，发布插件
