# VueFileManager API 文档

## 认证方式

### JWT Token
在请求头中添加：
```
Authorization: Bearer <token>
```

### API Key
在请求头中添加：
```
X-API-Key: <your-api-key>
```

---

## 认证 API `/api/auth`

### POST `/api/auth/send-code` — 发送注册验证码（SMTP 启用时可用）
```json
// Request Body
{ "email": "user@example.com" }
// Response
{ "message": "验证码已发送" }
// 错误
400 { "error": "SMTP 未启用" }
409 { "error": "该邮箱已被注册" }
```

### POST `/api/auth/register` — 注册
```json
// Request Body（SMTP 启用时需传 email + code）
{ "username": "string", "password": "string", "email": "user@example.com", "code": "123456" }
// Request Body（SMTP 未启用时 email 可选）
{ "username": "string", "password": "string", "email": "user@example.com" }
// Response
{ "message": "注册成功", "token": "jwt-token", "user": { "id": 1, "username": "test", "role": "user" } }
```

### POST `/api/auth/login` — 登录
```json
// Request Body
{ "username": "string", "password": "string" }
// Response
{ "message": "登录成功", "token": "jwt-token", "user": { "id": 1, "username": "admin", "role": "admin" } }
// 封禁用户
403 { "error": "账号已被封禁" }
```

### GET `/api/auth/me` — 当前用户信息（需认证）
```json
// Response
{
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "registerIp": "127.0.0.1",
    "lastLoginIp": "127.0.0.1",
    "createdAt": "2024-01-01T00:00:00Z",
    "settings": {
      "guestEnabled": false,
      "guestPath": "",
      "theme": "system"
    }
  }
}
```

---

## 文件 API `/api/files`（需认证或 API Key）

> 所有文件操作均支持 `poolId` 参数（query 或 body），指定操作的存储池。不传则使用默认存储池。

### GET `/api/files/list?path=&poolId=` — 文件列表
权限：`read`

> 注意：`._` 开头的 macOS 系统文件、`.DS_Store` 等会在服务端自动过滤，不会出现在列表中。

当不传 `poolId` 且不传 `path` 时，返回所有存储池作为虚拟文件夹（`isPool: true`）。
```json
// Response（普通文件列表）
{
  "files": [
    { "name": "file.txt", "type": "file", "size": 1024, "modified": "2024-01-01T00:00:00Z", "path": "file.txt", "poolId": 1, "directUrl": "/api/files/preview?path=file.txt&poolId=1&token=...", "fileUrl": "/api/files/preview?path=file.txt&poolId=1&token=..." }
  ]
}
// Response（根目录无 poolId，返回存储池列表）
{
  "files": [
    { "name": "本地存储", "type": "folder", "size": 0, "modified": "...", "path": "", "poolId": 1, "isPool": true }
  ]
}
```

### GET `/api/files/info?path=&poolId=` — 文件信息
权限：`read`
```json
// Response
{ "info": { "name": "file.txt", "type": "file", "size": 1024, "modified": "...", "path": "file.txt", "poolId": 1, "directUrl": "/api/files/preview?path=file.txt&poolId=1&token=...", "fileUrl": "/api/files/preview?path=file.txt&poolId=1&token=..." } }
```

### POST `/api/files/upload?path=&poolId=` — 上传文件
权限：`write`
```
Content-Type: multipart/form-data
Form Field: file
```
```json
// Response
{ "message": "上传成功", "path": "dir/file.txt", "poolId": 1, "storageType": "local", "directUrl": "/api/files/preview?path=dir%2Ffile.txt&poolId=1&token=...", "fileUrl": "/api/files/preview?path=dir%2Ffile.txt&poolId=1&token=..." }
```

### POST `/api/files/upload-stream` — 流式上传
权限：`write`

支持 chunked transfer encoding，适合大文件。
```
Headers:
  X-File-Name: encodeURIComponent(文件名)
  X-Dir-Path: encodeURIComponent(目标目录，可选)
  X-Pool-Id: 存储池ID（可选）
Content-Type: application/octet-stream
Body: 文件二进制流
```
```json
// Response
{ "message": "流式上传成功", "path": "dir/file.txt", "poolId": 1, "storageType": "local", "directUrl": "/api/files/preview?path=dir%2Ffile.txt&poolId=1&token=...", "fileUrl": "/api/files/preview?path=dir%2Ffile.txt&poolId=1&token=..." }
```

### POST `/api/files/upload/init` — 断点续传：初始化
权限：`write`
```json
// Request Body
{ "fileName": "large-file.zip", "fileSize": 104857600, "dirPath": "target-dir", "poolId": 1 }
// Response
{ "uploadId": "abc123...", "message": "分片上传已初始化" }
```
> 上传缓存保留时长由 `config.yml` 中的 `resumable_upload_cache_minutes` 控制，超时未完成会自动清理。

### PATCH `/api/files/upload/:uploadId/chunk` — 断点续传：上传分片
权限：`write`
```
Headers:
  Content-Range: bytes 0-10485759/104857600
Body: 分片二进制数据
```
```json
// Response
{ "message": "分片上传成功", "partIndex": 0, "uploadedParts": [0] }
```

### GET `/api/files/upload/:uploadId/status` — 断点续传：查询状态
权限：`read`
```json
// Response
{ "fileName": "large-file.zip", "fileSize": 104857600, "uploadedParts": [0, 1, 2], "createdAt": 1704067200000, "updatedAt": 1704068200000, "expiresAt": 1704075400000 }
```

### POST `/api/files/upload/:uploadId/complete` — 断点续传：完成
权限：`write`
```json
// Response
{ "message": "分片上传完成", "path": "target-dir/large-file.zip", "poolId": 1, "storageType": "local", "directUrl": "/api/files/preview?path=target-dir%2Flarge-file.zip&poolId=1&token=...", "fileUrl": "/api/files/preview?path=target-dir%2Flarge-file.zip&poolId=1&token=..." }
```

### DELETE `/api/files/upload/:uploadId` — 断点续传：取消并清理缓存
权限：`write`
```json
// Response
{ "message": "上传缓存已清理" }
```

### GET `/api/files/download?path=&poolId=` — 下载文件
权限：`read`
```
Response: 文件流（Content-Disposition: attachment）
```

### GET `/api/files/preview?path=&poolId=` — 预览文件
权限：`read`
```
Response: 文件流（对应 MIME 类型，浏览器可直接显示）
支持：图片/视频/音频/PDF/文本/代码
```

### DELETE or POST `/api/files/delete` — 删除文件/文件夹
权限：`delete`

> 推荐使用 POST + JSON body 传 path，避免 unicode 文件名 URL 编码问题。

默认移到回收站。`permanent=true` 时永久删除。

**方式 1：POST JSON body（推荐）**
```json
// Request Body
{ "path": "file.txt", "poolId": 1, "permanent": false }
// Response
{ "message": "删除成功" }
```

**方式 2：DELETE query 参数（旧版兼容）**
```
DELETE /api/files/delete?path=file.txt&poolId=1&permanent=false
```
```json
// Response
{ "message": "删除成功" }
```

### POST `/api/files/delete` — 删除文件/文件夹（POST 别名）
权限：`delete`

> 专为 unicode 文件名设计。使用 POST JSON body 传 path，避免 URL 编码问题。行为与上述 DELETE 接口完全相同。

```json
// Request Body
{ "path": "string", "poolId": 1, "permanent": false }
// Response
{ "message": "删除成功" }
```

### POST `/api/files/mkdir` — 创建文件夹
权限：`write`
```json
// Request Body
{ "path": "new-folder", "poolId": 1 }
// Response
{ "message": "文件夹创建成功" }
```

### POST `/api/files/write` — 保存文本文件内容
权限：`write`
```json
// Request Body
{ "path": "string", "content": "string", "poolId": 1 }
// Response
{ "success": true, "path": "string" }
```
> 注意：content 上限 10MB，30秒超时保护。

### POST `/api/files/rename` — 重命名
权限：`write`
```json
// Request Body
{ "path": "old-name.txt", "newName": "new-name.txt", "poolId": 1 }
// Response
{ "message": "重命名成功" }
```

### POST `/api/files/move` — 移动文件/文件夹（同池）
权限：`write`
```json
// Request Body
{ "src": "source-path", "dest": "dest-path", "poolId": 1 }
// Response
{ "message": "移动成功" }
```

### POST `/api/files/copy` — 复制文件/文件夹（同池）
权限：`write`
```json
// Request Body
{ "src": "source-path", "dest": "dest-path", "poolId": 1 }
// Response
{ "message": "复制成功" }
```

### POST `/api/files/cross-copy` — 跨存储池复制
权限：`write`
```json
// Request Body
{ "srcPaths": ["file1.txt", "file2.txt"], "names": ["file1.txt", "file2.txt"], "srcPoolId": 1, "destPoolId": 2, "destPath": "target-dir" }
// Response
{ "message": "跨池复制完成", "errors": [] }
```

### POST `/api/files/cross-move` — 跨存储池移动
权限：`write`
```json
// Request Body
{ "srcPaths": ["file1.txt"], "names": ["file1.txt"], "srcPoolId": 1, "destPoolId": 2, "destPath": "target-dir" }
// Response
{ "message": "跨池移动完成", "errors": [] }
```

### POST `/api/files/batch-delete` — 批量删除
权限：`delete`
```json
// Request Body
{ "paths": ["file1.txt", "file2.txt"], "poolId": 1, "permanent": false }
// Response
{ "message": "批量删除完成", "errors": [] }
```

### POST `/api/files/batch-move` — 批量移动（同池）
权限：`write`
```json
// Request Body
{ "paths": ["file1.txt", "file2.txt"], "dest": "target-dir", "poolId": 1 }
// Response
{ "message": "批量移动完成", "errors": [] }
```

### GET `/api/files/search?q=&path=&poolId=` — 搜索文件
权限：`read`
```json
// Response
{ "files": [{ "name": "match.txt", "type": "file", "size": 1024, "modified": "...", "path": "path/to/match.txt" }] }
```

### POST `/api/files/download-zip` — ZIP 打包下载
权限：`read`
```json
// Request Body
{ "paths": ["file1.txt", "dir/"], "poolId": 1 }
// Response: ZIP 文件流
```

### POST `/api/files/remote-upload` — 远程 URL 上传
权限：`write`
```json
// Request Body
{ "url": "https://example.com/file.zip", "dirPath": "target-dir", "poolId": 1 }
// Response
{ "message": "远程上传成功", "path": "target-dir/file.zip", "poolId": 1, "storageType": "local", "directUrl": "/api/files/preview?path=target-dir%2Ffile.zip&poolId=1&token=...", "fileUrl": "/api/files/preview?path=target-dir%2Ffile.zip&poolId=1&token=..." }
```

### GET `/api/files/storage-stats?poolId=` — 存储统计（需认证）
```json
// Response
{ "totalSize": 1048576, "fileCount": 42, "folderCount": 5 }
```

---

## 存储池 API `/api/storage-pools`（需认证）

### GET `/api/storage-pools` — 存储池列表
```json
// Response
{
  "pools": [
    {
      "id": 1,
      "name": "本地存储",
      "storageType": "local",
      "isDefault": true,
      "config": { "localPath": "./uploads" },
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### POST `/api/storage-pools` — 创建存储池
```json
// Request Body（本地存储）
{ "name": "本地存储", "storageType": "local", "config": { "localPath": "./uploads" } }
// Request Body（又拍云）
{ "name": "又拍云", "storageType": "upyun", "config": { "upyunOperator": "op", "upyunPassword": "pwd", "upyunBucket": "bucket", "upyunEndpoint": "v0.api.upyun.com" } }
// Response
{ "message": "存储池创建成功", "pool": { "id": 2, "name": "...", "storageType": "...", "isDefault": false, "config": { ... } } }
```

### PUT `/api/storage-pools/:id` — 更新存储池
```json
// Request Body
{ "name": "新名称", "storageType": "local", "config": { "localPath": "./new-path" } }
// Response
{ "message": "存储池更新成功" }
```

### DELETE `/api/storage-pools/:id` — 删除存储池
> 不能删除默认存储池，需先切换默认。
```json
// Response
{ "message": "存储池删除成功" }
```

### POST `/api/storage-pools/batch-delete` — 批量删除存储池
```json
// Request Body
{ "ids": [2, 3, 4] }
// Response
{ "message": "已删除 3 个存储池", "deletedIds": [2, 3, 4], "errors": [] }
```
> 默认存储池不会被删除；失败项会出现在 `errors` 中。

### POST `/api/storage-pools/:id/set-default` — 设为默认存储池
```json
// Response
{ "message": "默认存储池设置成功" }
```

### POST `/api/storage-pools/:id/test` — 测试存储池连接
```json
// Response
{ "success": true, "message": "本地路径可访问" }
// 或
{ "success": false, "message": "又拍云连接失败: ..." }
```

---

## 回收站 API `/api/trash`（需认证）

### GET `/api/trash` — 回收站列表
```json
// Response
{
  "items": [
    {
      "id": 1,
      "user_id": 1,
      "original_path": "docs/file.txt",
      "file_name": "file.txt",
      "file_type": "file",
      "storage_pool_id": 1,
      "deleted_at": "2024-01-01T00:00:00Z",
      "pool_name": "本地存储",
      "storage_type": "local"
    }
  ]
}
```

### POST `/api/trash/:id/restore` — 恢复文件
```json
// Response
{ "message": "文件已恢复" }
// 原路径已存在时
{ "error": "原路径已存在同名文件，无法恢复" }
```

### DELETE `/api/trash/:id` — 永久删除单个
```json
// Response
{ "message": "已永久删除" }
```

### DELETE `/api/trash` — 清空回收站
```json
// Response
{ "message": "回收站已清空" }
```

---

## 收藏 API `/api/favourites`（需认证）

### GET `/api/favourites?poolId=` — 收藏列表
```json
// Response
{
  "items": [
    {
      "id": 1,
      "user_id": 1,
      "file_path": "docs/file.txt",
      "file_name": "file.txt",
      "file_type": "file",
      "storage_pool_id": 1,
      "created_at": "2024-01-01T00:00:00Z",
      "pool_name": "本地存储",
      "storage_type": "local"
    }
  ]
}
```

### POST `/api/favourites` — 添加收藏
```json
// Request Body
{ "filePath": "docs/file.txt", "fileName": "file.txt", "fileType": "file", "storagePoolId": 1 }
// Response
{ "message": "已添加到收藏" }
```

### DELETE `/api/favourites?filePath=&storagePoolId=` — 取消收藏
```json
// Response
{ "message": "已取消收藏" }
```

### GET `/api/favourites/check?filePath=&storagePoolId=` — 检查收藏状态
```json
// Response
{ "isFavourited": true }
```

---

## 分享 API `/api/share`（部分需认证）

### POST `/api/share/create` — 创建分享链接（需认证）
```json
// Request Body
{
  "filePath": "path/to/file.txt",
  "fileType": "file",
  "password": "optional-password",
  "expiresIn": 24,          // 小时，可选
  "maxDownloads": 100        // 可选
}
// Response
{
  "message": "分享链接创建成功",
  "shareCode": "abc123",
  "signKey": "def456...",        // 签名密钥，前端可自行生成签名
  "url": "/s/abc123",
  "signUrl": "/s/abc123?sign=...&t=..."  // 带签名的完整 URL
}
```

### GET `/api/share/list` — 我的分享列表（需认证）
```json
// Response
{
  "shares": [
    {
      "id": 1,
      "user_id": 1,
      "file_path": "file.txt",
      "file_type": "file",
      "share_code": "abc123",
      "password": null,
      "expires_at": null,
      "download_count": 0,
      "max_downloads": null,
      "sign_key": "...",
      "created_at": "...",
      "username": "admin",
      "signUrl": "/s/abc123?sign=...&t=..."
    }
  ]
}
```

### DELETE `/api/share/:id` — 删除分享（需认证）
```json
// Response
{ "message": "分享已删除" }
```

### GET `/api/share/s/:code` — 访问分享链接（公开）
```json
// 如果需要密码
{ "needPassword": true, "fileType": "file", "fileName": "file.txt", "owner": "username" }
// 如果不需要密码
{ "needPassword": false, "fileType": "file", "filePath": "file.txt", "fileName": "file.txt", "owner": "username", "shareCode": "abc123" }
```

### GET `/api/share/download/:code?password=&sign=&t=` — 下载分享文件（公开）

需要 `sign` 和 `t` 签名参数（由创建接口返回的 signKey 生成）。
```
Response: 文件流
```

### GET `/api/share/preview/:code?password=&sign=&t=` — 预览分享文件（公开）

需要 `sign` 和 `t` 签名参数。
```
Response: 文件流（对应 MIME 类型）
```

### 签名机制

分享下载/预览需要签名验证。签名算法：
```
1. hash = MD5(username + signKey)
2. sign = hash[4:12] + timestamp
3. URL 参数：?sign={sign}&t={timestamp}
```

---

## 用户 API `/api/user`（需认证）

### GET `/api/user/info` — 当前用户完整信息
```json
// Response
{
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "registerIp": "127.0.0.1",
    "lastLoginIp": "127.0.0.1",
    "lastLoginAt": "2024-01-01T00:00:00Z",
    "createdAt": "2024-01-01T00:00:00Z",
    "settings": { "guestEnabled": true, "guestPath": "", "theme": "dark" },
    "pools": [
      { "id": 1, "name": "本地存储", "storageType": "local", "isDefault": true, "createdAt": "..." }
    ],
    "stats": { "trashCount": 3, "favCount": 5, "shareCount": 2, "apiKeyCount": 1, "guestShareCount": 1 }
  }
}
```

### GET `/api/user/settings` — 获取设置
```json
// Response
{ "settings": { "guestEnabled": false, "guestPath": "", "theme": "system" } }
```

### PUT `/api/user/settings` — 更新设置
```json
// Request Body（所有字段可选）
{ "guestEnabled": true, "guestPath": "photos", "theme": "dark" }
// Response
{ "message": "设置已更新" }
```

### GET `/api/user/apikeys` — API Key 列表
```json
// Response
{
  "keys": [
    { "id": 1, "name": "我的Key", "key": "vfm_abc123...", "permissions": "read,write", "created_at": "..." }
  ]
}
```

### POST `/api/user/apikeys` — 创建 API Key
```json
// Request Body
{ "name": "我的Key", "permissions": "read,write,delete" }
// Response
{ "message": "API Key 创建成功", "key": "vfm_abc123...", "name": "我的Key", "permissions": "read,write,delete" }
```

### DELETE `/api/user/apikeys/:id` — 删除 API Key
```json
// Response
{ "message": "API Key 已删除" }
```

### GET `/api/user/guest-shares` — 我的访客分享列表
```json
// Response
{
  "shares": [
    { "id": 1, "user_id": 1, "folder_path": "photos", "storage_pool_id": 1, "label": "照片", "created_at": "...", "pool_name": "本地存储" }
  ]
}
```

### POST `/api/user/guest-shares` — 创建访客分享
```json
// Request Body
{ "folderPath": "photos", "storagePoolId": 1, "label": "照片", "permissions": "preview,download,upload" }
// permissions 可选，默认 "preview,download"
// Response
{ "message": "已分享至访客模式", "share": { "id": 1, "folder_path": "photos", "storage_pool_id": 1, "label": "照片", "permissions": "preview,download,upload", "pool_name": "本地存储" } }
```

### PUT `/api/user/guest-shares/:id` — 更新访客分享（权限/标签）
```json
// Request Body（均为可选）
{ "label": "新名称", "permissions": "preview,download" }
// Response
{ "message": "已更新", "share": { "id": 1, "permissions": "preview,download", "label": "新名称" } }
```

### DELETE `/api/user/guest-shares/:id` — 删除访客分享
```json
// Response
{ "message": "已取消访客分享" }
```

---

## 管理 API `/api/admin`（需 admin 角色）

### GET `/api/admin/users` — 用户列表
```json
// Response
{
  "users": [
    {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "banned": 0,
      "register_ip": "127.0.0.1",
      "last_login_ip": "127.0.0.1",
      "last_login_at": "...",
      "created_at": "...",
      "guest_enabled": 1
    }
  ]
}
```

### GET `/api/admin/users/:id` — 用户详情
```json
// Response
{
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "banned": false,
    "registerIp": "127.0.0.1",
    "lastLoginIp": "127.0.0.1",
    "lastLoginAt": "...",
    "createdAt": "...",
    "settings": { "guestEnabled": true, "guestPath": "", "theme": "dark" },
    "pools": [
      { "id": 1, "name": "本地存储", "storageType": "local", "isDefault": true, "config": { "localPath": "./uploads" }, "createdAt": "..." }
    ],
    "stats": { "trashCount": 3, "favCount": 5, "shareCount": 2, "apiKeyCount": 1 }
  }
}
```

### POST `/api/admin/users` — 创建用户
```json
// Request Body
{ "username": "newuser", "password": "123456", "role": "user" }
// Response
{ "message": "用户创建成功", "user": { "id": 2, "username": "newuser", "role": "user" } }
```

### PUT `/api/admin/users/:id/role` — 修改用户角色
```json
// Request Body
{ "role": "admin" }  // 或 "user"
// Response
{ "message": "角色已更新" }
```

### PUT `/api/admin/users/:id/ban` — 封禁/解封用户
```json
// Response
{ "message": "用户已封禁", "banned": true }
// 或
{ "message": "用户已解封", "banned": false }
// 管理员不可被封禁
400 { "error": "不能封禁管理员账户" }
// 不能封禁自己
400 { "error": "不能封禁自己" }
```

### PUT `/api/admin/users/:id/password` — 重置用户密码
```json
// Request Body
{ "password": "newpassword" }
// Response
{ "message": "密码已重置" }
```

### DELETE `/api/admin/users/:id` — 删除用户
```json
// Response
{ "message": "用户已删除" }
```

### GET `/api/admin/ip-blacklist` — IP 黑名单/白名单列表
```json
// Response
{ "entries": [{ "id": 1, "ip_pattern": "192.168.1.0/24", "reason": "恶意扫描", "created_by": 1, "created_by_name": "admin", "created_at": "..." }] }
```

### POST `/api/admin/ip-blacklist` — 添加 IP 黑名单/白名单条目
```json
// Request Body
{ "ip_pattern": "192.168.1.1", "reason": "可选原因" }
// Response
{ "message": "IP 黑名单添加成功", "entry": { "id": 1, "ip_pattern": "192.168.1.1", "reason": "" } }
```

### DELETE `/api/admin/ip-blacklist/:id` — 删除 IP 黑名单/白名单条目
```json
// Response
{ "message": "IP 黑名单条目已删除" }
// 注意：白名单模式下 127.0.0.1 不可删除，返回 400
```

### GET `/api/admin/ip-list/mode` — 获取 IP 列表模式
```json
// Response
{ "mode": "blacklist" }  // 或 "whitelist"
```

### PUT `/api/admin/ip-list/mode` — 切换 IP 列表模式
```json
// Request Body
{ "mode": "whitelist" }  // 或 "blacklist"
// Response
{ "message": "已切换为白名单模式", "mode": "whitelist" }
// 切换到白名单时，若列表为空自动添加 127.0.0.1、::1、localhost
```

---

## 访客 API `/api/guest`（公开）

### GET `/api/guest` — 有访客分享的用户列表
```json
// Response
{ "users": [{ "username": "admin", "share_count": 3 }] }
```

### GET `/api/guest/:username/list` — 用户的访客分享文件夹列表
```json
// Response
{ "shares": [{ "id": 1, "folder_path": "photos", "label": "照片", "permissions": "preview,download", "pool_name": "本地存储", "created_at": "..." }], "owner": "admin" }
```

### GET `/api/guest/:username/:shareId/list?path=` — 访客文件列表
```json
// Response
{ "files": [{ "name": "file.txt", "type": "file", "size": 1024, "modified": "...", "path": "file.txt" }], "owner": "admin", "shareLabel": "照片", "permissions": "preview,download" }
```

### GET `/api/guest/:username/:shareId/preview?path=` — 访客预览
需 `preview` 权限。
```
Response: 文件流（对应 MIME 类型，Content-Disposition: inline）
```

### GET `/api/guest/:username/:shareId/download?path=` — 访客下载
需 `download` 权限。
```
Response: 文件流（Content-Disposition: attachment）
```

### POST `/api/guest/:username/:shareId/upload` — 访客上传
需 `upload` 权限。
```
Content-Type: multipart/form-data
Form Fields: file（文件）、dirPath（目标子目录，可选）
```
```json
// Response
{ "message": "上传成功", "path": "file.txt" }
```

### POST `/api/guest/:username/:shareId/write` — 访客编辑文件内容
需 `edit` 权限。
```json
// Request Body
{ "path": "file.txt", "content": "new content" }
// Response
{ "success": true, "path": "file.txt" }
// 内容超过 10MB
400 { "error": "文件内容不能超过 10MB" }
```

### POST `/api/guest/:username/:shareId/delete` — 访客删除文件
需 `delete` 权限。删除的文件会移入回收站并标注为访客删除。
```json
// Request Body
{ "path": "file.txt" }
// Response
{ "message": "删除成功" }
```

### POST `/api/guest/:username/:shareId/rename` — 访客重命名文件
需 `edit` 权限（edit 包含 rename）。
```json
// Request Body
{ "path": "old-name.txt", "newName": "new-name.txt" }
// Response
{ "message": "重命名成功" }
```

### POST `/api/guest/:username/:shareId/mkdir` — 访客创建文件夹
需 `write` 权限（write 包含 upload）。
```json
// Request Body
{ "path": "new-folder" }
// Response
{ "message": "创建成功", "path": "new-folder" }
```

### 访客权限

创建访客分享时可指定 `permissions` 字段（逗号分隔），控制访客可执行的操作：

| 权限 | 说明 | 包含操作 |
|------|------|----------|
| `read` | 读取 | 预览文件、下载文件 |
| `write` | 写入 | 上传文件 |
| `delete` | 删除 | 删除文件与文件夹 |
| `edit` | 文件编辑 | 编辑文件内容、重命名 |

权限支持别名：`read` 自动包含 `preview` 和 `download`，`write` 自动包含 `upload`，`edit` 自动包含 `rename`。
默认权限：`read`（只读）。

---

## 公开访问 API `/f`（无需认证）

### GET `/f/:username/*filePath` — 匿名访问文件

通过访客模式的旧版公开链接访问文件（inline 显示）。路径格式：`/f/{username}/{file-path}`。
```
Response: 文件流（Content-Disposition: inline，带 Cache-Control: 86400s）
```

---

## 主题 API `/api/themes`（公开/需认证）

### GET `/api/themes/styles` — 获取已启用主题的 CSS 路径（公开）
```json
// Response
{ "styles": [{ "name": "example-theme", "cssPath": "/plugins/example-theme/style.css" }] }
```

### GET `/api/themes/list` — 获取所有主题列表（公开）
```json
// Response
{ "themes": [{ "name": "example-theme", "version": "1.0.0", "description": "示例主题", "enabled": true }] }
```

### PUT `/api/themes/:name/toggle` — 切换主题启用/禁用（需认证）
```json
// Request Body
{ "enabled": false }
// Response
{ "message": "主题已禁用（重启后生效）" }
```

---

## API Key 权限

| 权限 | 说明 |
|------|------|
| `read` | 查看文件列表、下载、预览、搜索 |
| `write` | 上传、创建文件夹、重命名、移动、复制 |
| `delete` | 删除文件/文件夹 |

权限用逗号分隔，例如：`read,write,delete`

---

## 错误响应

所有接口在出错时返回：
```json
{ "error": "错误信息" }
```

常见 HTTP 状态码：
| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 参数错误 |
| 401 | 未认证 / Token 无效 |
| 403 | 无权限 / 账号被封禁 |
| 404 | 资源不存在 |
| 409 | 冲突（如用户名已存在） |
| 410 | 已过期（分享链接过期或下载次数达上限） |
| 500 | 服务器内部错误 |

---

## curl 示例

```bash
# 登录获取 Token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# 获取当前用户完整信息
curl -s http://localhost:3000/api/user/info \
  -H "Authorization: Bearer $TOKEN"

# 列出文件（默认存储池）
curl -s http://localhost:3000/api/files/list \
  -H "Authorization: Bearer $TOKEN"

# 列出指定存储池的文件
curl -s "http://localhost:3000/api/files/list?poolId=2" \
  -H "Authorization: Bearer $TOKEN"

# 上传文件到指定存储池
curl -X POST "http://localhost:3000/api/files/upload?path=test&poolId=1" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./myfile.txt"

# 搜索文件
curl -s "http://localhost:3000/api/files/search?q=readme&poolId=1" \
  -H "Authorization: Bearer $TOKEN"

# 跨存储池复制
curl -X POST http://localhost:3000/api/files/cross-copy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"srcPaths":["file.txt"],"names":["file.txt"],"srcPoolId":1,"destPoolId":2,"destPath":""}'

# 创建分享
curl -X POST http://localhost:3000/api/share/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filePath":"myfile.txt","expiresIn":24}'

# 创建访客分享
curl -X POST http://localhost:3000/api/user/guest-shares \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"folderPath":"photos","storagePoolId":1,"label":"照片"}'

# 存储池列表
curl -s http://localhost:3000/api/storage-pools \
  -H "Authorization: Bearer $TOKEN"

# 回收站列表
curl -s http://localhost:3000/api/trash \
  -H "Authorization: Bearer $TOKEN"

# 收藏列表
curl -s http://localhost:3000/api/favourites \
  -H "Authorization: Bearer $TOKEN"

# 管理员：用户列表
curl -s http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer $TOKEN"

# 用 API Key 访问
curl -s http://localhost:3000/api/files/list \
  -H "X-API-Key: vfm_your_api_key_here"
```