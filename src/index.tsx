import { Context, Schema, Logger, h } from 'koishi'
import { FileManager } from './upload'

export const name = 'imgupload'

export const usage = `
[VueFileManager(VFM)仓库](https://github.com/Twiyin0/vueFileManager)
## 配置项参考
- **vfmUrl**: VueFileManager 服务地址，如 http://localhost:3000
- **apiKey**: VFM API Key（需有 read、write 权限，在 VFM 用户设置中创建）
- **savePath**: 图片存储的目标目录路径（留空则上传到存储池根目录）
- **poolId**: 存储池 ID（留空则使用默认存储池）

## 功能
- \`imgupload <图片/链接>\` — 将聊天中的图片或 URL 上传到 VFM
- \`imgupload -f <文件夹>\` — 指定上传的子目录
- \`imgupload/randomImg [路径]\` — 随机获取已上传的图片
`

const logger = new Logger(name)

export interface Config {
  vfmUrl: string
  apiKey: string
  savePath: string
  poolId: number
  imgshareUrl: string
  sendnotice: boolean
  sendwait: number
  coiledCount: number
}

export const Config: Schema<Config> = Schema.object({
  vfmUrl: Schema.string().default('http://localhost:3000').role('link')
    .description('VueFileManager 服务地址'),
  apiKey: Schema.string().required().role('secret')
    .description('VFM API Key（需有 read、write 权限）'),
  savePath: Schema.string().default('')
    .description('图片存储目标目录路径（留空则上传到存储池根目录）'),
  poolId: Schema.number().default(0)
    .description('存储池 ID（0 表示使用默认存储池）'),
  imgshareUrl: Schema.string().default('').role('link')
    .description('图片分享地址前缀（如 https://img.example.com），留空则不显示'),
  sendnotice: Schema.boolean().default(false)
    .description('图片上传前是否发送提示消息'),
  sendwait: Schema.number().default(30000)
    .description('等待用户发送图片的时间 (ms)'),
  coiledCount: Schema.number().default(10)
    .description('连续发送模式的最大张数'),
})

export function apply(ctx: Context, config: Config) {
  const getFM = () => new FileManager(config.vfmUrl, config.apiKey)
  const getPoolId = () => config.poolId > 0 ? config.poolId : undefined

  // ─── 图片上传命令 ───────────────────────────────────────

  ctx.command('imgupload <img>', '将聊天中的图片或 URL 上传到 VFM 图床').alias('图片上传')
    .option('folder', '-f <path:string> 指定上传的子目录')
    .option('time', '-t <time:number> 等待图片上传时间')
    .option('gif', '-g 是否为 gif')
    .option('coiled', '-c 开启连续上传模式，以 $ 或 ￥ 结束')
    .action(async ({ session, options }, img) => {
      const fm = getFM()
      const poolId = getPoolId()
      const regex = /^[\w\u4e00-\u9fff\-\/]+$/
      const savePath = config.savePath.replace(/\/+$/, '')
      const subDir = options.folder && !regex.test(options.folder) ? options.folder : ''
      const targetDir = [savePath, subDir].filter(Boolean).join('/') || ''

      // 如果输入是 URL，使用 VFM 服务端直拉上传
      const urlMatch = img?.match(/^https?:\/\/\S+/)
      if (urlMatch) {
        try {
          if (config.sendnotice) await session.send('图片开始上传……')
          const res = await fm.remoteUpload(urlMatch[0], targetDir || undefined, poolId)
          const shareHint = config.imgshareUrl ? ` 图片分享地址: ${config.imgshareUrl}` : ''
          return `远程 URL 图片上传成功! 路径: ${res.path}${shareHint}`
        } catch (err) {
          logger.error(`远程 URL 图片上传失败: ${urlMatch[0]}`, err)
          return `URL 图片上传失败，请检查 URL 是否可访问!`
        }
      }

      // 处理聊天中的图片
      let coiled = options.coiled ? (session.quote ? 1 : config.coiledCount) : 1
      coiled = session.quote ? 1 : coiled

      if (!session.quote && !img) {
        await session.send(`请发送图片${options.coiled ? `（连发模式，上限 ${config.coiledCount} 张，$ 或 ￥ 结束）` : ''}>>`)
      }

      while (coiled--) {
        let imgmsg: any = ''
        if (!session.quote && !img) {
          const waitTime = options.time && Number(options.time) > 0 ? options.time : config.sendwait
          imgmsg = await session.prompt(waitTime)
        } else if (session.quote) {
          imgmsg = 1
        }

        if (((imgmsg?.toString().includes('$') || imgmsg?.toString().includes('￥')) && options.coiled) || !imgmsg) break

        const imgMatches = img
          ? h.select(img, 'img')
          : session.quote
            ? h.select(session.quote.content, 'img')
            : imgmsg
              ? h.select(imgmsg, 'img')
              : null

        if (imgMatches?.length) {
          const failed: string[] = []
          for (const imgEl of imgMatches) {
            const { src } = imgEl.attrs
            try {
              if (config.sendnotice) await session.send('图片开始上传……')
              // 由 koishi 下载图片再上传，避免 VFM 服务端无法访问平台 CDN 及格式识别问题
              const filename = `${session.userId}_${Date.now()}`
              await fm.downloadAndUpload(src, targetDir || '', filename, poolId)
            } catch (err) {
              failed.push(src)
              logger.error(`图片上传失败: ${src}`, err)
            }
          }
          if (failed.length) {
            await session.send(`以下图片上传失败: ${failed.join(', ')}`)
          } else if (!options.coiled) {
            const shareHint = config.imgshareUrl ? ` 图片分享地址: ${config.imgshareUrl}` : ''
            await session.send(`所有图片上传完成!${shareHint}`)
          }
        } else {
          return `未检测到图片或输入超时……${options.coiled ? '已退出连发模式' : ''}`
        }
      }

      if (options.coiled) {
        const shareHint = config.imgshareUrl ? ` 图片分享地址: ${config.imgshareUrl}` : ''
        return `连发退出，所有图片上传完成!${shareHint}`
      }
    })

  // ─── 随机图片 ──────────────────────────────────────────
  ctx.command('imgupload/randomImg [path]', '从 VFM 随机获取一张图片').alias('随机图片')
    .action(async ({ session }, path) => {
      const fm = getFM()
      const poolId = getPoolId()
      const savePath = config.savePath.replace(/\/+$/, '')
      const targetPath = [savePath, path].filter(Boolean).join('/')

      try {
        const files = await fm.list(targetPath ? '/' + targetPath : '/', poolId)
        const images = files.filter(f =>
          f.type === 'file' && /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(f.name)
        )

        if (!images.length) {
          return `目录 ${targetPath || '/'} 中没有找到图片`
        }

        const picked = images[Math.floor(Math.random() * images.length)]
        const buf = await fm.downloadToBuffer(picked.path, poolId)
        const ext = picked.name.split('.').pop()?.toLowerCase() || 'png'
        return h.image(buf, `image/${ext}`)
      } catch (err) {
        logger.error(`获取随机图片失败:`, err)
        return `获取图片失败: ${err.message || err}`
      }
    })
}
