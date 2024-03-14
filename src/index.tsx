import { Context, Schema, Logger, h } from 'koishi'
import FormData from 'form-data'
import axios from 'axios'
import { FileUploader } from './upload'

export const name = 'imgupload'

export const usage = `
## 配置项参考
alistUrl: http://alist.example.com  
alistUser: admin (有上传权限的用户)  
alistPassword: password (该用户的密码)  
2FA: 2FA_KEY (如果alist开了2FA啾必须填2FA码)  
basePath: /mnt/img (alist挂载能上传文件的路径)

## 注意
* 命令imgupload <img> 中img为链接的话只能解析一个链接，图片可以解析多张
* 命令imgupload -f <folder> 的foler不能有除了下滑线与减号的符号，可以使用中文
`

const logger = new Logger(name)

export interface Config {
  alistUrl: string,
  alistUser: string,
  alistPassword: string,
  alist_opt_code: string,
  basePath: string,
  sendnotice: boolean,
  imgshareUrl: string,
  sendwait: number,
  coiledCount: number,
}

export const Config: Schema<Config> = Schema.object({
  alistUrl: Schema.string().default('http://localhost:5244').role('link')
  .description('alist地址'),
  alistUser: Schema.string().required()
  .description('alist账号（请确认账号有权限操作）'),
  alistPassword: Schema.string().required().role('secret')
  .description('alist密码'),
  alist_opt_code: Schema.string().role('secret')
  .description('两步验证码(2FA), alist开了2FA就得填'),
  basePath: Schema.string().required()
  .description('图片存储基本路径'),
  sendnotice: Schema.boolean().default(false)
  .description('图片上传前是否发送开始上传……'),
  imgshareUrl: Schema.string().default('http://localhost:8080').role('link')
  .description('图片分享地址'),
  sendwait: Schema.number().default(30000)
  .description('等待图片发送时间(ms)'),
  coiledCount: Schema.number().default(10)
  .description('连续发送夺少张图后退出循环')
})

export function apply(ctx: Context, config: Config) {
  ctx.command('imgupload <img>', `将聊天中的图片或url分享到图床${config.imgshareUrl}`).alias('图片上传')
  .option('folder', '-f <path:string> 指定上传的文件夹')
  .option('time', '-t <time:number> 等待图片上传时间')
  .option('gif', '-g 是否为gif')
  .option('coiled', '-c 开启连续上传模式，以$或￥结束')
  .action(async ({session, options}, img) => {
    let urlmatch = /https?:\/\/((?:[\w-]+\.){0,}(?:[a-z]+\d*|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}))(?::\d{2,5})?\/?.*/;
    if(config.alistUrl.match(urlmatch)) {
    let imgmsg:any = '';
    let date = new Date();
    let dateinfo = `${date.getFullYear()}${date.getMonth()+1}${date.getDate()}${date.getHours()}${date.getMinutes()}${date.getSeconds()}`
    let datecnt = 0;
    let regex = /[^\w\u4e00-\u9fa5-]/;
    let basePath = (/\/$/).test(config.basePath)?  config.basePath : config.basePath+'\/';
    let savePath = options.folder ? (options.folder.toString()).match(regex) ? '' : options.folder.toString() : '';

    const upload = new FileUploader(config.alistUser, config.alistPassword, config.alistUrl, config.alist_opt_code? config.alist_opt_code:null);

    let img_msg_url = img? img.match(/^(\s+)?https?:\/\/(.*)/):null;
    if (img_msg_url && img_msg_url[0]) {
      try {
        if (config.sendnotice) session.send('图片开始上传……');
        const res:any = await upload.uploadRemoteFile(img_msg_url[0].replace(/(\s+)?/,''), `${basePath}${savePath? savePath+'\/':''}${session.userId}_${dateinfo}-p${datecnt++}.${options.gif? 'gif':'png'}`)
        if(res.code == 200)
          return `来自远程url的图片上传成功! 图片分享地址 ${config.imgshareUrl? config.imgshareUrl: '图片暂不公开分享'}`;
        else {
          logger.error(`图片上传失败!请检查配置是否正确${res}`);
          return `图片上传失败!${res.code} | ${res.message}`
        }
        // await uploadImageFromURL(config.alistUrl, img_msg_url[0].replace(/(\s+)?/,''), `${session.userId}_${dateinfo}-p${datecnt++}.${options.gif? 'gif':'png'}`);   // 自建图床上传函数
      } catch (err) {
        logger.error(`图片上传失败：(imgurl: ${img_msg_url[0].replace(/(\s+)?/,'')})`, err);
        return `url图片上传失败，请检查url是否可访问！`
      }
    }

    let coiled = (options.coiled)? session.quote? 1:config.coiledCount:1;
    coiled = session.quote? 1:coiled;
    if(!session.quote && !img)
      await session.send(`请发送图片${options.coiled? `(连发模式,上限${config.coiledCount})张,$或￥结束`:''}>>`);
    while (coiled--) {
      if(!session.quote && !img) {
        let waittime = options.time? Number(options.time)>0? options.time:config.sendwait:config.sendwait;
        imgmsg = await session.prompt(waittime);
      } else if (session.quote) imgmsg = 1;
      
      if (((imgmsg.toString().includes("$") || imgmsg.toString().includes("￥")) && options.coiled ) || !imgmsg) break;

      let imgmatches = img? h.select(img, 'img'):(session.quote? h.select(session.quote.content, 'img'): imgmsg? h.select(imgmsg, 'img'):null);
      
      if (imgmatches && imgmatches[0]) {
        const failedUploads = [];
        var faildcnt:number = 0;
        for (const imgmatch of imgmatches) {
          const { src } = imgmatch.attrs;
          try {
            if (config.sendnotice) session.send('图片开始上传……');
            const res:any = await upload.uploadRemoteFile(src, `${basePath}${savePath? savePath:''}/${session.userId}_${dateinfo}-p${datecnt++}.${options.gif? 'gif':'png'}`)
            if (res.code != 200) {
              faildcnt++;
              logger.error(`来自${src}的图片上传失败： ${res}`);
            }
            // await uploadImageFromURL(config.alistUrl, src, `${session.userId}_${dateinfo}-p${datecnt++}.${options.gif? 'gif':'png'}`);   // 自建图床上传函数
          } catch (err) {
            failedUploads.push(src);
            logger.error(`图片上传失败：(imgurl: ${src})`, err);
          }
        }
        if (failedUploads.length > 0 || faildcnt>0) {
          await session.send(`图片上传失败：${failedUploads.join(', ')}, 请查看log`);
        } else {
          !options.coiled? await session.send(`所有图片上传完成，图片分享地址 ${config.imgshareUrl? config.imgshareUrl: '图片暂不公开分享'}`):'';
        }
      } else {
        return `未检测到图片或输入超时……${options.coiled? '已退出连发模式':''}`;
      }
    }
    if (options.coiled) return `连发退出，所有图片上传完成！图片分享地址 ${config.imgshareUrl? config.imgshareUrl: '图片暂不公开分享'}`
  } else return <>错误的图片上传地址，请联系管理员……</>
  })
}

// 自建图床的上传函数就不删了，后面说不定用得到
async function uploadImageFromURL(uploadUrl:string, imageUrl: string, filename: string, savePath?: string) {
  try {
    // logger.info(`[${name} Debugger] 收到 ${imageUrl} 的上传请求...`)
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageData = Buffer.from(response.data, 'binary');
    const formData = new FormData();
    formData.append('file', imageData, { filename: filename }); // 为图像添加文件名

    const uploadResponse = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        "Authorization": "Bearer 1|Q3YW0TIB7jpJ038CqvEHjEmTEWEENsXOdxH0g9wX",
        "Accept": 'application/json'
      },
    });
    // if(response.data) logger.debug(`[${name} Debugger] ${savePath}/${filename} 完成上传!`);
    // else logger.error(`[${name} Debugger] ${savePath == null ? `uploads/${savePath}` : 'uploads/'}/${filename} 上传失败`);
  } catch (error) {
    // logger.error('上传图片时发生错误：', error);
    throw error;
  }
}
