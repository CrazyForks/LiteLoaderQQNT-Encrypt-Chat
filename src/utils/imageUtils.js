const axios = require("axios");
const FormData = require('form-data');
const {encryptImg} = require("./cryptoUtils.js");
const fs = require('fs')
const config = require("../Config.js").Config.config;
const sizeOf = require('image-size');
const path = require('path')
const {decryptImg} = require("./cryptoUtils.js");
const {pluginLog} = require("./logUtils");
const {hashMd5} = require("./aesUtils.js");
const uploadUrl = 'https://chatbot.weixin.qq.com/weixinh5/webapp/pfnYYEumBeFN7Yb3TAxwrabYVOa4R9/cos/upload'
const singlePixelGifBuffer = Buffer.from('R0lGODdhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=', 'base64')//用来加密图片
//1x1png格式iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=
const singlePixelPngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

/**
 * 图片加密，把图片加密到1x1的gif里面。返回对象
 * @param imgPath
 * @param peerUid   群号字符串
 * @returns {{picPath: string, picMD5: string}}
 */
function imgEncryptor(imgPath, peerUid) {
    try {
        const bufferImg = fs.readFileSync(imgPath);//需要被加密的图片文件
        // console.log('bufferimg')
        // console.log(bufferImg)
        //加密图片，返回加密后的buffer
        const encryptedBuffer = encryptImg(bufferImg, peerUid);
        // console.log('encryptedBuffer')
        // console.log(encryptedBuffer)
        const tempImg = fs.readFileSync(config.tempImgPath)//一共35个字节
        // console.log('tempImg')
        // console.log(tempImg)
        const resultImage = Buffer.concat([tempImg, encryptedBuffer])
        // console.log('resultImage')
        // console.log(resultImage)
        fs.writeFileSync(path.join(config.pluginPath, 'src/assests/encrypted.gif'), resultImage);

        return {
            picPath: path.join(config.pluginPath, 'src/assests/encrypted.gif'),
            picMD5: hashMd5(resultImage).toString('hex')
        }
    } catch (e) {
        console.log(e)
    }
}


/**
 * 图片解密，把加密后的图片解密，保存到本地。
 * @param imgPath
 * @param peerUid 群号字符串
 * @returns {{
 *             decryptedImgPath: String,
 *             width: Number,
 *             height: Number,
 *             type: String,
 *         }|false}
 */
function imgDecryptor(imgPath, peerUid) {
    try {
        // pluginLog('下面输出加密图片的buffer')
        // console.log(fs.readFileSync(imgPath))
        const bufferImg = fs.readFileSync(imgPath).slice(35);//需要解密的图片文件,前35个是固定值，表示1x1白色gif
        // pluginLog('用来解密的图片buffer为')
        // console.log(bufferImg)

        const decryptedBufImg = decryptImg(bufferImg, peerUid);
        if (!decryptedBufImg) return {
            decryptedImgPath: "",
            width: 0,
            height: 0,
            type: "",
        }//解密失败就不需要继续了

        const imgMD5 = hashMd5(decryptedBufImg).toString('hex')

        const filePath = path.join(config.pluginPath, 'decryptedImgs')
        const decryptedImgPath = path.join(config.pluginPath, `decryptedImgs/${imgMD5}.png`)

        if (!fs.existsSync(decryptedImgPath)) //目录不存在才写入
        {   //连文件夹都没有，就创建文件夹
            if (!fs.existsSync(filePath)) fs.mkdirSync(filePath, {recursive: true}); // 递归创建文件夹

            fs.writeFileSync(decryptedImgPath, decryptedBufImg);//写入图片
        }
        const dimensions = sizeOf(decryptedBufImg)
        return {
            decryptedImgPath: decryptedImgPath,
            width: dimensions.width,
            height: dimensions.height,
            type: dimensions.type,
        }
    } catch (e) {
        pluginLog(e)
    }

}

async function uploadImage(imgBuffer, onProgress) {
    try {
        const formData = new FormData();
        formData.append('media', imgBuffer, {
            filename: 'img.png',
            contentType: 'image/png'
        });
        const config = {
            onUploadProgress: (progressEvent) => {
                console.log(JSON.stringify(progressEvent))
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                onProgress(percentCompleted); // 通过回调函数发送进度信息
            }
        };
        //发送请求
        const response = await axios.post(uploadUrl, formData, config)
        return response.data
    } catch (e) {
        console.error(e)
    }
}

/**
 * 检查图片是否为加密过的图像
 * @param imgPath
 * @returns {boolean}
 */
function imgChecker(imgPath) {
    try {
        const bufferImg = fs.readFileSync(imgPath).slice(0, 35);
        // console.log(bufferImg)
        return bufferImg.equals(singlePixelGifBuffer)
    } catch (e) {
        return false
    }
}

module.exports = {uploadImage, imgEncryptor, imgDecryptor, imgChecker, singlePixelPngBuffer}