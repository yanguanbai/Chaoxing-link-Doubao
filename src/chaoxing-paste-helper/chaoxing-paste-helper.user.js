// ==UserScript==
// @name         学习通强制纯文本粘贴助手
// @namespace    http://tampermonkey.net/
// @version      1.2.2
// @description  自动识别剪贴板：有图片则原生粘贴，只有文本自动转纯文本粘贴（保留换行）
// @author       Bart
// @match        *://*.chaoxing.com/*
// @grant        none
// @run-at       document-end
// @license MIT
// @homepageURL https://github.com/yanguanbai/Chaoxing-link-Doubao
// @supportURL  https://github.com/yanguanbai/Chaoxing-link-Doubao/issues
// @downloadURL https://raw.githubusercontent.com/yanguanbai/Chaoxing-link-Doubao/main/src/chaoxing-paste-helper/chaoxing-paste-helper.user.js
// @updateURL   https://raw.githubusercontent.com/yanguanbai/Chaoxing-link-Doubao/main/src/chaoxing-paste-helper/chaoxing-paste-helper.user.js
// ==/UserScript==
(function() {
    'use strict';

    /**
     * 纯文本转义，避免题干里的 < & 被富文本编辑器当成标签解析
     * @param {string} text
     * @returns {string}
     */
    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * 给所有已存在的 UEditor 实例绑定粘贴处理器
     * @returns {boolean} 是否还有未注入的实例（需要继续轮询）
     */
    function injectPasteHandler() {
        if (typeof UE === 'undefined' || !UE.instants) return true;
        let pending = false;
        const keys = Object.keys(UE.instants);
        // 编辑器还没创建出来，继续等
        if (!keys.length) return true;
        keys.forEach(key => {
            let myEditor = UE.instants[key];
            if (!myEditor || !myEditor.iframe) return;
            let iframe = myEditor.iframe;
            if (iframe.dataset.pasteInjected) return;
            let editorDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (!editorDoc || !editorDoc.body) {
                pending = true;
                return;
            }
            iframe.dataset.pasteInjected = "true";
            editorDoc.body.addEventListener('paste', function(e) {
                const items = e.clipboardData.items;
                let hasImage = false;
                for (let i of items) {
                    if (i.type.startsWith('image/')) {
                        hasImage = true;
                        break;
                    }
                }
                // 剪贴板包含图片：放行原生粘贴，可以贴图片
                if (hasImage) {
                    console.log(`[PasteHelper] 实例 ${key} 检测到图片，放行原生粘贴`);
                    return;
                }

                // 只有文本：拦截，转义后按纯文本粘贴，保留换行
                e.preventDefault();
                e.stopPropagation();
                let text = (e.clipboardData || window.clipboardData).getData('text');
                if (!text) return;
                let formattedText = escapeHtml(text).replace(/\n/g, '<br>');
                myEditor.focus();
                myEditor.execCommand('insertHtml', formattedText);
                console.log(`[PasteHelper] 实例 ${key} 纯文本粘贴成功`);
            }, true);
        });
        return pending;
    }

    // 编辑器可能晚于脚本初始化，也可能在切题时新建实例：
    // 前 30 秒每秒找一次，之后降到 5 秒一次，既覆盖新建实例也不至于一直高频空转
    const started = Date.now();
    const fastTimer = setInterval(() => {
        injectPasteHandler();
        if (Date.now() - started > 30000) {
            clearInterval(fastTimer);
            setInterval(injectPasteHandler, 5000);
        }
    }, 1000);
    setTimeout(injectPasteHandler, 5000);
    console.log("学习通粘贴助手 v1.2.2 启动：有图片直接贴图片，文本自动转义后纯文本粘贴");
})();
