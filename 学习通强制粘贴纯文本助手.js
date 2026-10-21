// ==UserScript==
// @name         学习通强制纯文本粘贴助手
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  自动识别剪贴板：有图片则原生粘贴，只有文本自动转纯文本粘贴（保留换行）
// @author       Bart
// @match        *://*.chaoxing.com/*
// @grant        none
// @run-at       document-end
// @license MIT
// ==/UserScript==
(function() {
    'use strict';
    function injectPasteHandler() {
        if (typeof UE === 'undefined' || !UE.instants) return;
        Object.keys(UE.instants).forEach(key => {
            let myEditor = UE.instants[key];
            if (myEditor.iframe && !myEditor.iframe.dataset.pasteInjected) {
                let iframe = myEditor.iframe;
                let editorDoc = iframe.contentDocument || iframe.contentWindow.document;
                if (editorDoc && editorDoc.body) {
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

                        // 只有文本：拦截，转为纯文本粘贴
                        e.preventDefault();
                        e.stopPropagation();
                        let text = (e.clipboardData || window.clipboardData).getData('text');
                        if (!text) return;
                        let formattedText = text.replace(/\n/g, '<br>');
                        myEditor.focus();
                        myEditor.execCommand('insertHtml', formattedText);
                        console.log(`[PasteHelper] 实例 ${key} 纯文本粘贴成功`);
                    }, true);
                }
            }
        });
    }
    const timer = setInterval(injectPasteHandler, 2000);
    setTimeout(injectPasteHandler, 5000);
    console.log("学习通粘贴助手 v1.2 启动：有图片直接贴图片，文本自动纯文本");
})();
