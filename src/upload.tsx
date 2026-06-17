import axios, { AxiosInstance } from 'axios'
import fs from 'fs'
import FormData from 'form-data'

// ─── 类型定义 ────────────────────────────────────────────

export interface UploadResult {
  message: string
  path: string
  poolId: number
  storageType: string
  directUrl: string
  fileUrl: string
}

export interface FileItem {
  name: string
  type: 'file' | 'folder'
  size: number
  modified: string
  path: string
  poolId: number
  directUrl?: string
  fileUrl?: string
  isPool?: boolean
}

export interface FileInfo {
  name: string
  type: 'file' | 'folder'
  size: number
  modified: string
  path: string
  poolId: number
  directUrl: string
  fileUrl: string
}

export interface StoragePool {
  id: number
  name: string
  storageType: string
  isDefault: boolean
  config: Record<string, any>
  createdAt: string
}

export interface ShareInfo {
  id: number
  user_id: number
  file_path: string
  file_type: string
  share_code: string
  password: string | null
  expires_at: string | null
  download_count: number
  max_downloads: number | null
  sign_key: string
  created_at: string
  username: string
  signUrl: string
}

export interface CreateShareResult {
  message: string
  shareCode: string
  signKey: string
  url: string
  signUrl: string
}

export interface TrashItem {
  id: number
  user_id: number
  original_path: string
  file_name: string
  file_type: string
  storage_pool_id: number
  deleted_at: string
  pool_name: string
  storage_type: string
}

export interface FavouriteItem {
  id: number
  user_id: number
  file_path: string
  file_name: string
  file_type: string
  storage_pool_id: number
  created_at: string
  pool_name: string
  storage_type: string
}

export interface StorageStats {
  totalSize: number
  fileCount: number
  folderCount: number
}

export interface BatchResult {
  message: string
  errors: string[]
}

export interface ResumableUploadInit {
  uploadId: string
  message: string
}

export interface ChunkUploadResult {
  message: string
  partIndex: number
  uploadedParts: number[]
}

export interface ResumableUploadStatus {
  fileName: string
  fileSize: number
  uploadedParts: number[]
  createdAt: number
  updatedAt: number
  expiresAt: number
}

// ─── FileManager 类 ──────────────────────────────────────

export class FileManager {
  private http: AxiosInstance

  constructor(apiURL: string, apiKey: string) {
    this.http = axios.create({
      baseURL: apiURL.replace(/\/+$/, ''),
      timeout: 60000,
      headers: { 'X-API-Key': apiKey },
    })
  }

  // ─── 文件列表 & 信息 ───────────────────────────────────

  /**
   * 列出文件夹内容
   * 不传 poolId 和 path 时返回所有存储池列表
   */
  async list(path?: string, poolId?: number): Promise<FileItem[]> {
    const params: Record<string, any> = {}
    if (path !== undefined) params.path = path
    if (poolId !== undefined) params.poolId = poolId

    const res = await this.http.get('/api/files/list', { params })
    return res.data.files || []
  }

  /**
   * 获取单个文件信息
   */
  async info(path: string, poolId?: number): Promise<FileInfo> {
    const params: Record<string, any> = { path }
    if (poolId !== undefined) params.poolId = poolId

    const res = await this.http.get('/api/files/info', { params })
    return res.data.info
  }

  /**
   * 搜索文件
   */
  async search(q: string, path?: string, poolId?: number): Promise<FileItem[]> {
    const params: Record<string, any> = { q }
    if (path !== undefined) params.path = path
    if (poolId !== undefined) params.poolId = poolId

    const res = await this.http.get('/api/files/search', { params })
    return res.data.files || []
  }

  // ─── 上传 ─────────────────────────────────────────────

  /**
   * 上传本地文件（multipart/form-data）
   */
  async upload(filePath: string, targetDir?: string, poolId?: number): Promise<UploadResult> {
    const formData = new FormData()
    formData.append('file', fs.createReadStream(filePath))

    const params: Record<string, any> = {}
    if (targetDir) params.path = targetDir
    if (poolId !== undefined) params.poolId = poolId

    const res = await this.http.post('/api/files/upload', formData, {
      headers: formData.getHeaders(),
      params,
    })
    return res.data
  }

  /**
   * 上传 Buffer 数据
   */
  async uploadBuffer(buffer: Buffer, filename: string, targetDir?: string, poolId?: number): Promise<UploadResult> {
    const formData = new FormData()
    formData.append('file', buffer, { filename })

    const params: Record<string, any> = {}
    if (targetDir) params.path = targetDir
    if (poolId !== undefined) params.poolId = poolId

    const res = await this.http.post('/api/files/upload', formData, {
      headers: formData.getHeaders(),
      params,
    })
    return res.data
  }

  /**
   * 远程 URL 直传（VFM 服务端拉取）
   */
  async remoteUpload(url: string, dirPath?: string, poolId?: number): Promise<UploadResult> {
    const body: Record<string, any> = { url }
    // 使用统一的 `path` 字段传递目标目录（与其它接口保持一致）
    if (dirPath) body.path = dirPath
    if (poolId !== undefined) body.poolId = poolId

    try {
      const res = await this.http.post('/api/files/remote-upload', body, {
        headers: { 'Content-Type': 'application/json' },
      })
      return res.data
    } catch (err: any) {
      // 如果服务器返回响应体，附加到错误信息中，便于排查 500 错误
      if (err.response && err.response.data) {
        const e: any = new Error(`remoteUpload failed: ${JSON.stringify(err.response.data)}`)
        e.original = err
        throw e
      }
      throw err
    }
  }

  /**
   * 下载远程图片后上传到 VFM（适用于 VFM 无法直接访问的 URL）
   * filename 可不传扩展名，会自动从响应头 Content-Type 推断
   */
  async downloadAndUpload(imgUrl: string, targetDir: string, filename: string, poolId?: number): Promise<UploadResult> {
    const response = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 30000 })

    // 从 Content-Type 推断扩展名
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp',
      'image/svg+xml': 'svg',
    }
    const contentType = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    const ext = mimeToExt[contentType]

    // 如果文件名没有扩展名，根据 Content-Type 补上
    const hasExt = /\.\w{2,5}$/.test(filename)
    const finalName = (!hasExt && ext) ? `${filename}.${ext}` : filename

    return this.uploadBuffer(Buffer.from(response.data), finalName, targetDir, poolId)
  }

  /**
   * 流式上传（适合大文件，chunked transfer encoding）
   */
  async uploadStream(filePath: string, fileName: string, dirPath?: string, poolId?: number): Promise<UploadResult> {
    const headers: Record<string, any> = {
      'X-File-Name': encodeURIComponent(fileName),
      'Content-Type': 'application/octet-stream',
    }
    if (dirPath) headers['X-Dir-Path'] = encodeURIComponent(dirPath)
    if (poolId !== undefined) headers['X-Pool-Id'] = String(poolId)

    const stream = fs.createReadStream(filePath)
    const res = await this.http.post('/api/files/upload-stream', stream, { headers })
    return res.data
  }

  // ─── 断点续传 ──────────────────────────────────────────

  /**
   * 初始化断点续传
   */
  async resumableInit(fileName: string, fileSize: number, dirPath?: string, poolId?: number): Promise<ResumableUploadInit> {
    const body: Record<string, any> = { fileName, fileSize }
    if (dirPath) body.dirPath = dirPath
    if (poolId !== undefined) body.poolId = poolId

    const res = await this.http.post('/api/files/upload/init', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data
  }

  /**
   * 上传分片
   * @param uploadId 断点续传 ID
   * @param chunk 分片数据
   * @param start 字节起始位置
   * @param end 字节结束位置
   * @param total 文件总大小
   */
  async resumableChunk(uploadId: string, chunk: Buffer, start: number, end: number, total: number): Promise<ChunkUploadResult> {
    const res = await this.http.patch(`/api/files/upload/${uploadId}/chunk`, chunk, {
      headers: {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Type': 'application/octet-stream',
      },
    })
    return res.data
  }

  /**
   * 查询断点续传状态
   */
  async resumableStatus(uploadId: string): Promise<ResumableUploadStatus> {
    const res = await this.http.get(`/api/files/upload/${uploadId}/status`)
    return res.data
  }

  /**
   * 完成断点续传
   */
  async resumableComplete(uploadId: string): Promise<UploadResult> {
    const res = await this.http.post(`/api/files/upload/${uploadId}/complete`)
    return res.data
  }

  /**
   * 取消断点续传并清理缓存
   */
  async resumableCancel(uploadId: string): Promise<string> {
    const res = await this.http.delete(`/api/files/upload/${uploadId}`)
    return res.data.message
  }

  // ─── 文件操作 ──────────────────────────────────────────

  /**
   * 创建文件夹
   */
  async mkdir(dirPath: string, poolId?: number): Promise<string> {
    const body: Record<string, any> = { path: dirPath }
    if (poolId !== undefined) body.poolId = poolId

    const res = await this.http.post('/api/files/mkdir', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data.message
  }

  /**
   * 保存文本文件内容
   */
  async writeFile(path: string, content: string, poolId?: number): Promise<{ success: boolean; path: string }> {
    const body: Record<string, any> = { path, content }
    if (poolId !== undefined) body.poolId = poolId

    const res = await this.http.post('/api/files/write', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data
  }

  /**
   * 重命名文件/文件夹
   */
  async rename(path: string, newName: string, poolId?: number): Promise<string> {
    const body: Record<string, any> = { path, newName }
    if (poolId !== undefined) body.poolId = poolId

    const res = await this.http.post('/api/files/rename', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data.message
  }

  /**
   * 移动文件/文件夹（同池）
   */
  async move(src: string, dest: string, poolId?: number): Promise<string> {
    const body: Record<string, any> = { src, dest }
    if (poolId !== undefined) body.poolId = poolId

    const res = await this.http.post('/api/files/move', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data.message
  }

  /**
   * 复制文件/文件夹（同池）
   */
  async copy(src: string, dest: string, poolId?: number): Promise<string> {
    const body: Record<string, any> = { src, dest }
    if (poolId !== undefined) body.poolId = poolId

    const res = await this.http.post('/api/files/copy', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data.message
  }

  /**
   * 删除文件/文件夹（默认移到回收站）
   */
  async delete(path: string, poolId?: number, permanent = false): Promise<string> {
    const body: Record<string, any> = { path, permanent }
    if (poolId !== undefined) body.poolId = poolId

    const res = await this.http.post('/api/files/delete', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data.message
  }

  /**
   * 批量删除
   */
  async batchDelete(paths: string[], poolId?: number, permanent = false): Promise<BatchResult> {
    const body: Record<string, any> = { paths, permanent }
    if (poolId !== undefined) body.poolId = poolId

    const res = await this.http.post('/api/files/batch-delete', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data
  }

  /**
   * 批量移动（同池）
   */
  async batchMove(paths: string[], dest: string, poolId?: number): Promise<BatchResult> {
    const body: Record<string, any> = { paths, dest }
    if (poolId !== undefined) body.poolId = poolId

    const res = await this.http.post('/api/files/batch-move', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data
  }

  /**
   * 跨存储池复制
   */
  async crossCopy(srcPaths: string[], names: string[], srcPoolId: number, destPoolId: number, destPath?: string): Promise<BatchResult> {
    const body: Record<string, any> = { srcPaths, names, srcPoolId, destPoolId }
    if (destPath !== undefined) body.destPath = destPath

    const res = await this.http.post('/api/files/cross-copy', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data
  }

  /**
   * 跨存储池移动
   */
  async crossMove(srcPaths: string[], names: string[], srcPoolId: number, destPoolId: number, destPath?: string): Promise<BatchResult> {
    const body: Record<string, any> = { srcPaths, names, srcPoolId, destPoolId }
    if (destPath !== undefined) body.destPath = destPath

    const res = await this.http.post('/api/files/cross-move', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data
  }

  // ─── 下载 & 预览 ──────────────────────────────────────

  /**
   * 获取文件预览 URL
   */
  getPreviewUrl(path: string, poolId?: number): string {
    const params = new URLSearchParams({ path })
    if (poolId !== undefined) params.set('poolId', String(poolId))
    return `${this.http.defaults.baseURL}/api/files/preview?${params}`
  }

  /**
   * 获取文件下载 URL
   */
  getDownloadUrl(path: string, poolId?: number): string {
    const params = new URLSearchParams({ path })
    if (poolId !== undefined) params.set('poolId', String(poolId))
    return `${this.http.defaults.baseURL}/api/files/download?${params}`
  }

  /**
   * 下载文件到 Buffer
   */
  async downloadToBuffer(path: string, poolId?: number): Promise<Buffer> {
    const params: Record<string, any> = { path }
    if (poolId !== undefined) params.poolId = poolId

    const res = await this.http.get('/api/files/download', {
      params,
      responseType: 'arraybuffer',
    })
    return Buffer.from(res.data)
  }

  /**
   * ZIP 打包下载（返回 Buffer）
   */
  async downloadZip(paths: string[], poolId?: number): Promise<Buffer> {
    const body: Record<string, any> = { paths }
    if (poolId !== undefined) body.poolId = poolId

    const res = await this.http.post('/api/files/download-zip', body, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
    })
    return Buffer.from(res.data)
  }

  // ─── 存储统计 ──────────────────────────────────────────

  /**
   * 获取存储统计信息
   */
  async storageStats(poolId?: number): Promise<StorageStats> {
    const params: Record<string, any> = {}
    if (poolId !== undefined) params.poolId = poolId

    const res = await this.http.get('/api/files/storage-stats', { params })
    return res.data
  }

  // ─── 存储池管理 ────────────────────────────────────────

  /**
   * 获取存储池列表
   */
  async listPools(): Promise<StoragePool[]> {
    const res = await this.http.get('/api/storage-pools')
    return res.data.pools || []
  }

  /**
   * 创建存储池
   */
  async createPool(name: string, storageType: string, config: Record<string, any>): Promise<StoragePool> {
    const res = await this.http.post('/api/storage-pools', { name, storageType, config }, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data.pool
  }

  /**
   * 更新存储池
   */
  async updatePool(id: number, name: string, storageType: string, config: Record<string, any>): Promise<string> {
    const res = await this.http.put(`/api/storage-pools/${id}`, { name, storageType, config }, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data.message
  }

  /**
   * 删除存储池
   */
  async deletePool(id: number): Promise<string> {
    const res = await this.http.delete(`/api/storage-pools/${id}`)
    return res.data.message
  }

  /**
   * 设为默认存储池
   */
  async setDefaultPool(id: number): Promise<string> {
    const res = await this.http.post(`/api/storage-pools/${id}/set-default`)
    return res.data.message
  }

  /**
   * 测试存储池连接
   */
  async testPool(id: number): Promise<{ success: boolean; message: string }> {
    const res = await this.http.post(`/api/storage-pools/${id}/test`)
    return res.data
  }

  // ─── 分享 ─────────────────────────────────────────────

  /**
   * 创建分享链接
   */
  async createShare(filePath: string, fileType: string, options?: {
    password?: string
    expiresIn?: number
    maxDownloads?: number
  }): Promise<CreateShareResult> {
    const body: Record<string, any> = { filePath, fileType }
    if (options?.password) body.password = options.password
    if (options?.expiresIn) body.expiresIn = options.expiresIn
    if (options?.maxDownloads) body.maxDownloads = options.maxDownloads

    const res = await this.http.post('/api/share/create', body, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data
  }

  /**
   * 获取我的分享列表
   */
  async listShares(): Promise<ShareInfo[]> {
    const res = await this.http.get('/api/share/list')
    return res.data.shares || []
  }

  /**
   * 删除分享
   */
  async deleteShare(id: number): Promise<string> {
    const res = await this.http.delete(`/api/share/${id}`)
    return res.data.message
  }

  // ─── 收藏 ─────────────────────────────────────────────

  /**
   * 获取收藏列表
   */
  async listFavourites(poolId?: number): Promise<FavouriteItem[]> {
    const params: Record<string, any> = {}
    if (poolId !== undefined) params.poolId = poolId

    const res = await this.http.get('/api/favourites', { params })
    return res.data.items || []
  }

  /**
   * 添加收藏
   */
  async addFavourite(filePath: string, fileName: string, fileType: string, storagePoolId: number): Promise<string> {
    const res = await this.http.post('/api/favourites', { filePath, fileName, fileType, storagePoolId }, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data.message
  }

  /**
   * 取消收藏
   */
  async removeFavourite(filePath: string, storagePoolId: number): Promise<string> {
    const res = await this.http.delete('/api/favourites', {
      params: { filePath, storagePoolId },
    })
    return res.data.message
  }

  /**
   * 检查收藏状态
   */
  async checkFavourite(filePath: string, storagePoolId: number): Promise<boolean> {
    const res = await this.http.get('/api/favourites/check', {
      params: { filePath, storagePoolId },
    })
    return res.data.isFavourited
  }

  // ─── 回收站 ────────────────────────────────────────────

  /**
   * 获取回收站列表
   */
  async listTrash(): Promise<TrashItem[]> {
    const res = await this.http.get('/api/trash')
    return res.data.items || []
  }

  /**
   * 恢复回收站文件
   */
  async restoreTrash(id: number): Promise<string> {
    const res = await this.http.post(`/api/trash/${id}/restore`)
    return res.data.message
  }

  /**
   * 永久删除回收站单个文件
   */
  async deleteTrashItem(id: number): Promise<string> {
    const res = await this.http.delete(`/api/trash/${id}`)
    return res.data.message
  }

  /**
   * 清空回收站
   */
  async emptyTrash(): Promise<string> {
    const res = await this.http.delete('/api/trash')
    return res.data.message
  }

  // ─── 用户信息 ──────────────────────────────────────────

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<any> {
    const res = await this.http.get('/api/user/info')
    return res.data.user
  }

  /**
   * 获取用户设置
   */
  async getSettings(): Promise<any> {
    const res = await this.http.get('/api/user/settings')
    return res.data.settings
  }

  /**
   * 更新用户设置
   */
  async updateSettings(settings: Record<string, any>): Promise<string> {
    const res = await this.http.put('/api/user/settings', settings, {
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data.message
  }
}

/** @deprecated 使用 FileManager 代替 */
export const FileUploader = FileManager