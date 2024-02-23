import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import path from 'path';

export class FileUploader {
    username: string;
    password: string;
    apiURL: string;
    otp_code?: string|undefined

    constructor(username: string, password: string, apiURL: string, otp_code?:string) {
        this.username = username;
        this.password = password;
        this.apiURL = apiURL;
        this.otp_code = otp_code? otp_code:null
    }

    async test() {
        return `${this.username} | ${this.password} | ${this.apiURL}`;
    }

    async getToken(): Promise<string | undefined> {
        try {
            const token = await axios.post(`${this.apiURL}/api/auth/login`, { 'username': this.username, 'password': this.password, 'otp_code': this.otp_code }, { headers: { 'content-type': 'application/json' } });
            console.log(token.data.data.token);
            return token.data.code ? token.data.data.token : undefined;
        } catch (err) {
            throw err;
        }
    }

    async postMkdir(path: string): Promise<string | undefined> {
        const token = await this.getToken();
        if (token) {
            try {
                const res = await axios.post(`${this.apiURL}/api/fs/mkdir`, { 'path': `${path}` }, { headers: { "Authorization": `${token}`, 'content-type': 'application/json' } });
                return res.data.code == 200 ? "创建成功!" : undefined;
            } catch (err) {
                throw err;
            }
        } else {
            return undefined;
        }
    }

    async uploadLocalFile(filePath: string, targetFilePath: string): Promise<any | undefined> {
        const token = await this.getToken();
        if (token) {
            try {
                const formData = new FormData();
                formData.append('file', fs.createReadStream(filePath));

                const headers = {
                    'Authorization': token,
                    'File-Path': encodeURIComponent(targetFilePath),
                    'As-Task': 'true',
                    ...formData.getHeaders()
                };
                const response = await axios.put(`${this.apiURL}/api/fs/form`, formData, {
                    headers: headers
                });

                return response.data;
            } catch (error) {
                throw error;
            }
        } else {
            console.log('未获得token');
            return undefined;
        }
    }

    async uploadRemoteFile(imgUrl: string, targetFilePath: string): Promise<any | undefined> {
        let imageData: Buffer | undefined;
        try {
            const response = await axios.get(imgUrl, { responseType: 'arraybuffer' });
            imageData = Buffer.from(response.data);
        } catch (err) {
            throw err;
        }

        const token = await this.getToken();
        if (token && imageData) {
            try {
                const formData = new FormData();
                formData.append('file', imageData, { filename: path.basename(targetFilePath) });

                const headers = {
                    'Authorization': token,
                    'File-Path': encodeURIComponent(targetFilePath),
                    'As-Task': 'true',
                    ...formData.getHeaders()
                };
                console.log(`收到来自${imgUrl}的${targetFilePath}上传请求`);
                const response = await axios.put(`${this.apiURL}/api/fs/form`, formData, {
                    headers: headers
                });

                return response.data;
            } catch (error) {
                console.error('Error uploading file:', error);
            }
        } else {
            return undefined;
        }
    }
}
