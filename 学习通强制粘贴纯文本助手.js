// ==UserScript==
// @name         学习通强制纯文本粘贴助手
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自动识别 UEditor 实例并开启 Ctrl+V 强制纯文本粘贴，保留换行
// @author       Bart
// @match        *://*.chaoxing.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 核心注入函数
    function injectPasteHandler() {
        // 检查 UE 是否存在且已初始化
        if (typeof UE === 'undefined' || !UE.instants) return;

        Object.keys(UE.instants).forEach(key => {
            let myEditor = UE.instants[key];

            // 确保有 iframe 且还没被我们“处理”过
            if (myEditor.iframe && !myEditor.iframe.dataset.pasteInjected) {
                let iframe = myEditor.iframe;
                let editorDoc = iframe.contentDocument || iframe.contentWindow.document;

                if (editorDoc && editorDoc.body) {
                    // 标记该 iframe 已处理，防止重复绑定监听器
                    iframe.dataset.pasteInjected = "true";

                    // 监听粘贴事件
                    editorDoc.body.addEventListener('paste', function(e) {
                        // 1. 彻底拦截默认逻辑
                        e.preventDefault();
                        e.stopPropagation();

                        // 2. 获取纯文本内容
                        let text = (e.clipboardData || window.clipboardData).getData('text');

                        if (!text) return;

                        // 3. 将 \n 换行符替换为 <br>，保留段落格式
                        let formattedText = text.replace(/\n/g, '<br>');

                        // 4. 强制焦点并注入
                        myEditor.focus();
                        myEditor.execCommand('insertHtml', formattedText);

                        console.log(`[PasteHelper] 实例 ${key} 粘贴成功 (纯文本模式)`);
                    }, true); // 使用捕获模式，确保优先级最高
                }
            }
        });
    }

    // 因为学习通的编辑器是动态加载的，所以每隔 2 秒扫描一次页面
    const timer = setInterval(injectPasteHandler, 2000);

    // 5秒后如果还没加载出来，可能是页面没编辑器，或者需要手动触发一次扫描
    setTimeout(injectPasteHandler, 5000);

    console.log("学习通粘贴助手已启动，正在监控编辑器加载...");
})();