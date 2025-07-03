// Electron 主进程 与 渲染进程 交互的桥梁
const {contextBridge, ipcRenderer} = require("electron");

// 在window对象下导出只读对象
contextBridge.exposeInMainWorld("encrypt_chat", {
    messageEncryptor: (message) => ipcRenderer.invoke("LiteLoader.encrypt_chat.messageEncryptor", message),
    messageDecryptor: (message, peerUid) => ipcRenderer.invoke("LiteLoader.encrypt_chat.messageDecryptor", message, peerUid),
    imgDecryptor: (imgPath, peerUid) => ipcRenderer.invoke("LiteLoader.encrypt_chat.imgDecryptor", imgPath, peerUid),
    imgChecker: (imgPath) => ipcRenderer.invoke("LiteLoader.encrypt_chat.imgChecker", imgPath),
    decodeHex: (message) => ipcRenderer.invoke("LiteLoader.encrypt_chat.decodeHex", message),
    getWindowID: () => ipcRenderer.invoke("LiteLoader.encrypt_chat.getWindowID"),
    getMenuHTML: () => ipcRenderer.invoke("LiteLoader.encrypt_chat.getMenuHTML"),
    ecFileHandler: (fileBuffer, fileName, peerUid) => ipcRenderer.send("LiteLoader.encrypt_chat.ecFileHandler", fileBuffer, fileName, peerUid),
    openPath: (filePath) => ipcRenderer.send("LiteLoader.encrypt_chat.openPath", filePath),
    isFileExist: (filePathArray) => ipcRenderer.invoke("LiteLoader.encrypt_chat.isFileExist", filePathArray),
    //设置相关，给renderer进程用
    getConfig: () => ipcRenderer.invoke("LiteLoader.encrypt_chat.getConfig"),
    setConfig: (newConfig) => ipcRenderer.invoke("LiteLoader.encrypt_chat.setConfig", newConfig),
    addEventListener: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
    isChatWindow: () => ipcRenderer.invoke("LiteLoader.encrypt_chat.isChatWindow"),
    sendIPC: (channel, arg) => ipcRenderer.send(channel, arg),//渲染进程用来发送IPC消息,其实不需要，NTQQ的window对象有ipcRenderer
    showMainProcessInfo: (message) => ipcRenderer.send("LiteLoader.encrypt_chat.showMainProcessInfo", message),
    //发送消息到所有聊天窗口
    sendMsgToChatWindows: (message, arg) => {
        //console.log(message,arg)
        ipcRenderer.send("LiteLoader.encrypt_chat.sendMsgToChatWindows", message, arg)
    },

    invokeNative: (eventName, cmdName, registered, webContentId, ...args) => invokeNativeV2(eventName, cmdName, webContentId, ...args)
});


/**
 * 调用一个qq底层函数，并返回函数返回值。来自
 * https://github.com/xtaw/LiteLoaderQQNT-Euphony/blob/master/src/main/preload.js
 *
 * @param { String } eventName 函数事件名。
 * @param { String } cmdName 函数名。
 * @param { Boolean } registered 函数是否为一个注册事件函数。
 * @param {Number} webContentId 当前窗口的webContentsId，在window对象中有这个属性。
 * @param  { ...Object } args 函数参数。
 * @returns { Promise<any> } 函数返回值。
 */
function invokeNative(eventName, cmdName, registered, webContentId, ...args) {
    console.log(`尝试发送IPC消息，webContentsId${webContentId},eventName${eventName},cmdName${cmdName},registered${registered},args${args}`)
    return new Promise(resolve => {
        const callbackId = crypto.randomUUID();
        const callback = (event, ...args) => {
            if (args?.[0]?.callbackId == callbackId) {
                ipcRenderer.off(`IPC_DOWN_${webContentId}`, callback);
                resolve(args[1]);
            }
        };
        ipcRenderer.on(`IPC_DOWN_${webContentId}`, callback);
        ipcRenderer.send(`IPC_UP_${webContentId}`, {
            type: 'request',
            callbackId,
            eventName: `${eventName}-${webContentId}${registered ? '-register' : ''}`
        }, [cmdName, ...args]);
    });
}

//过时了！我们需要一个新版的底层函数！

/**
 * 【V2 版本】 - 调用 QQ 底层 NTAPI 函数
 * 该版本根据 QQ NT 9.9.9+ 的新版 IPC 格式进行了重构。
 *
 * @param {string} eventName - 基础事件名，例如 "ntApi"。函数会自动处理 peerId。
 * @param {string} cmdName - 具体要调用的方法名，例如 "nodeIKernelMsgService/forwardMsgWithComment"。
 * @param {number} peerId - 当前窗口的唯一标识，通常是 window.webContentId。
 * @param {...any} args - 要传递给目标方法的参数列表。
 * @returns {Promise<any>} - 返回一个 Promise，解析为目标方法的返回值。
 */
function invokeNativeV2(eventName, cmdName, peerId, ...args) {
    // 1. 定义新的 IPC 通道名称
    const ipc_up_channel = `RM_IPCFROM_RENDERER${peerId}`;
    const ipc_down_channel = `RM_IPCTO_RENDERER${peerId}`; // 这是基于发送通道的合理推测，如果收不到回调，可能需要抓包确认此名称

    // 2. 打印调试信息，方便排查
    console.log(`[invokeNativeV2] 准备发送 IPC 消息:
    - Channel: ${ipc_up_channel}
    - Event: ${eventName}
    - Command: ${cmdName}
    - PeerId: ${peerId}
    - Args:`, ...args);

    return new Promise((resolve, reject) => {
        const callbackId = crypto.randomUUID();

        // 3. 定义回调函数，用于接收返回数据
        const callback = (event, ...resultArgs) => {
            // 新版的回调结构也可能变了，这里我们假设它和以前类似，第一个参数是包含 callbackId 的对象
            // resultArgs[0] -> { "type": "response", "callbackId": "...", "eventName": "..." }
            // resultArgs[1] -> a.k.a the actual result
            if (resultArgs?.[0]?.callbackId === callbackId) {
                console.log('[invokeNativeV2] 收到回调:', resultArgs[1]);
                ipcRenderer.off(ipc_down_channel, callback);
                resolve(resultArgs[1]);
            }
        };

        // 4. 监听回调通道
        ipcRenderer.on(ipc_down_channel, callback);

        // 5. 构建全新的载荷 (Payload)
        const requestMetadata = {
            type: "request",
            callbackId: callbackId,
            eventName: eventName, // 使用简洁的 eventName
            peerId: peerId
        };

        const commandPayload = {
            cmdName: cmdName,
            cmdType: "invoke", // 从抓包结果看，这似乎是固定的
            payload: args // 将所有参数包裹在 payload 数组中
        };

        // 6. 发送 IPC 消息
        try {
            ipcRenderer.send(
                ipc_up_channel,
                requestMetadata,
                commandPayload
            );
            console.log('[invokeNativeV2] IPC 消息已发送。');
        } catch (error) {
            console.error('[invokeNativeV2] IPC 消息发送失败:', error);
            ipcRenderer.off(ipc_down_channel, callback);
            reject(error);
        }
    });
}


// contextBridge.exposeInMainWorld('euphonyNative', {
//     subscribeEvent,
//     unsubscribeEvent
// })

// /**
//  * 为qq底层事件 `cmdName` 添加 `handler` 处理器。
//  *
//  * @param { String } cmdName 事件名称。
//  * @param { Function } handler 事件处理器。
//  * @returns { Function } 新的处理器。
//  */
// function subscribeEvent(cmdName, handler) {
//     const listener = (event, ...args) => {
//         if (args?.[1]?.[0]?.cmdName == cmdName) {
//             handler(args[1][0].payload);
//         }
//     };
//     ipcRenderer.on(`IPC_DOWN_${webContentsId}`, listener);
//     return listener;
// }
//
//
// /**
//  * 移除qq底层事件的 `handler` 处理器。
//  *
//  * 请注意，`handler` 并不是传入 `subscribeEvent` 的处理器，而是其返回的新处理器。
//  *
//  * @param { Function } handler 事件处理器。
//  */
// function unsubscribeEvent(handler) {
//     ipcRenderer.off(`IPC_DOWN_${webContentsId}`, handler);
// }