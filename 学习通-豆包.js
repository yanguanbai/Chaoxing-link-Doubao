// ==UserScript==
// @name         学习通豆包全自动答题
// @namespace    com.chaoxing.doubao.auto
// @version      1.0.0
// @author       Bart
// @description  修正答案错乱、增加文字/截图按钮、适配SPA自动重载
// @match        *://*.chaoxing.com/mooc-ans*
// @match        *://*.doubao.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @require      https://html2canvas.hertzen.com/dist/html2canvas.min.js
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';
    const win = unsafeWindow;

    // --- SPA 监听与初始化逻辑 ---
    // 监听 URL 变化，解决单页应用（SPA）不触发页面刷新导致脚本失效的问题
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(checkAndInit, 1000); // 页面变动后延迟1秒初始化，等待 DOM 渲染完成
        }
    }).observe(document.body, { childList: true, subtree: true });

    checkAndInit();

    // 根据当前域名选择运行哪个模块
    function checkAndInit() {
        // 清理旧的 UI 元素，防止重复注入
        const oldBox = document.querySelector('#ai-box');
        if (oldBox) oldBox.remove();

        switch (true) {
            case location.host.includes("chaoxing.com"):
                initChaoxing();
                break;
            case location.host.includes("doubao.com"):
                initDoubao();
                break;
        }
    }

    // --- 学习通模块 ---
    function initChaoxing() {
        let statusDiv, autoNextCheckbox;
        createUI();
        listenAnswer();

        // 创建悬浮窗界面
        function createUI() {
            const box = document.createElement('div');
            box.id = 'ai-box';
            box.style = "position:fixed;top:10%;left:10px;z-index:9999999;padding:12px;background:#fff;border:2px solid #409EFF;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-family:sans-serif;width:220px;font-size:12px;";
            box.innerHTML = `
                <div style="font-weight:bold;margin-bottom:8px;">📗 学习通自动答题</div>
                <button id="btn-init" style="width:100%;padding:6px;margin-bottom:4px;background:#E6A23C;color:white;border:none;border-radius:4px;">初始化规则</button>
                <button id="btn-send-txt" style="width:100%;padding:6px;margin-bottom:4px;background:#409EFF;color:white;border:none;border-radius:4px;">发送文字</button>
                <button id="btn-send-img" style="width:100%;padding:6px;margin-bottom:4px;background:#67C23A;color:white;border:none;border-radius:4px;">发送截图</button>
                <label style="display:flex;align-items:center;margin-top:6px;">
                    <input type="checkbox" id="autoNext" checked>
                    <span style="margin-left:4px;">自动下一题</span>
                </label>
                <div id="status" style="margin-top:8px;line-height:1.4;color:#666;">状态：就绪</div>
            `;
            document.body.appendChild(box);
            statusDiv = document.getElementById('status');
            autoNextCheckbox = document.getElementById('autoNext');

            // 按钮点击事件绑定
            document.getElementById('btn-init').onclick = () => {
                setStatus("初始化中...", "#409EFF");
                GM_setValue("cx_ai_result", "");
                sendSignal({ type: "init" });
            };
            document.getElementById('btn-send-txt').onclick = () => sendText();
            document.getElementById('btn-send-img').onclick = () => sendImg();
        }

        // 更新状态提示
        function setStatus(text, color = "#666") {
            if (statusDiv) {
                statusDiv.innerText = text;
                statusDiv.style.color = color;
            }
        }

        // 获取页面内所有题目元素
        function getAllQuestions() {
            const items = Array.from(document.querySelectorAll('.questionLi'));
            return items.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        }

        // 获取文字并发送给豆包
        function sendText() {
            GM_setValue("cx_ai_result", "");
            const wrap = document.querySelector('.exam-content') || document.body;
            const text = wrap.innerText.replace(/\s+/g, ' ').trim();
            if (text.length > 0) {
                sendSignal({ type: "txt", data: text });
                setStatus("文字已发送", "#409EFF");
            } else {
                setStatus("未获取到文字", "#F56C6C");
            }
        }

        // 截图并转换为 Base64 发送给豆包
        async function sendImg() {
            GM_setValue("cx_ai_result", "");
            const wrap = document.querySelector('.exam-content') || document.body;
            setStatus("高清截图处理中...", "#409EFF");
            try {
                // scale调高放大分辨率，dpi提升清晰度
                const canvas = await html2canvas(wrap, {
                    useCORS: true,
                    allowTaint: false,
                    scale: 2.5,    // 放大倍率，数值越大图越清晰
                    dpi: 300
                });
                sendSignal({ type: "img", data: canvas.toDataURL('image/png') });
                setStatus("高清截图已发送", "#67C23A");
            } catch (e) {
                setStatus("截图失败", "#F56C6C");
            }
        }

        // 通过 GM_setValue 发送信号给豆包端脚本
        function sendSignal(data) {
            GM_setValue("cx_ai_signal", JSON.stringify({ ...data, ts: Date.now() }));
        }

        // 监听豆包端返回的答案
        function listenAnswer() {
            GM_addValueChangeListener("cx_ai_result", (_, oldVal, val) => {
                if (!val || val === oldVal) return;
                const [raw] = val.split("|_|");
                try {
                    const answers = JSON.parse(raw);
                    const quesList = getAllQuestions();
                    answers.forEach((ans, idx) => {
                        if (ans.intercept) {
                            // 跳过此题 → 直接触发下一题
                            if (autoNextCheckbox.checked) {
                                setTimeout(nextQuestion, 800);
                            }
                            return;
                        }
                        setTimeout(() => {
                            if (quesList[idx]) fillAns(ans, quesList[idx]);
                        }, idx * 1200);
                    });
                    // 执行自动下一题
                    if (autoNextCheckbox.checked) setTimeout(nextQuestion, answers.length * 1200 + 2000);
                } catch (e) {
                    setStatus("答案解析异常", "#F56C6C");
                }
            });
        }

        // 将 AI 解析出的答案填入页面
        function fillAns(res, block) {
            const type = res.type + "";
            const ansArr = res.answer || [];
            // 处理单选、多选、判断
            if (["0", "1", "3"].includes(type)) {
                const opts = block.querySelectorAll("span.num_option");
                ansArr.forEach(target => {
                    opts.forEach(item => {
                        const d = item.dataset.data?.trim();
                        const t = item.textContent.trim();
                        if (d === target || t === target) {
                            item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                            item.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
                            item.click();
                        }
                    });
                });
                setStatus(`已选${ansArr.join("")}`, "#67C23A");
            }
            // 处理简答题
            else if (["2", "4"].includes(type)) {
                const content = ansArr.join("\n");
                const ue = win.UE;
                const textarea = block.querySelector('textarea[id^="answer"]');
                if (textarea && ue?.getEditor) {
                    const ed = ue.getEditor(textarea.id);
                    if (ed?.setContent) {
                        ed.setContent(content);
                        ed.fireEvent?.("contentChange");
                        setStatus("简答填写完成", "#67C23A");
                        return;
                    }
                }
                const editDom = block.querySelector("[contenteditable=true]");
                if (editDom) {
                    editDom.innerText = content;
                    editDom.dispatchEvent(new Event("input", { bubbles: true }));
                } else if (textarea) {
                    textarea.value = content;
                    textarea.dispatchEvent(new Event("input", { bubbles: true }));
                }
            }
        }

        // 自动触发下一题按钮
        function nextQuestion() {
            document.activeElement?.blur();
            const btn = document.querySelector(".nextBtn,.nextChapter") || [...document.querySelectorAll("button,a")].find(el => /下一/.test(el.innerText));
            btn?.click();
        }
    }

    // --- 豆包模块 ---
    function initDoubao() {
        if (document.readyState !== "complete") {
            window.addEventListener("load", initDoubao);
            return;
        }
        const bindUrl = GM_getValue("cx_exclusive_url", "");
        if (bindUrl && bindUrl !== location.href) return;

        let isWait = false, pollTimer, watchDog, statusDom;
        createPanel();
        listenMsg();

        // 创建豆包端监控面板
        function createPanel() {
            const p = document.createElement("div");
            p.style = "position:fixed;bottom:10px;right:10px;z-index:999999;padding:10px;background:#fff;border:2px solid #409EFF;border-radius:6px;font-size:12px;width:240px;";
            p.innerHTML = `<span id="dbSta" style="font-weight:bold;color:#409EFF">● 待命</span><button id="bindBtn" style="margin-left:8px;padding:2px 6px;border:1px solid #ccc;border-radius:3px;">绑定</button>`;
            document.body.appendChild(p);
            statusDom = document.getElementById("dbSta");
            document.getElementById("bindBtn").onclick = () => {
                GM_setValue("cx_exclusive_url", location.href);
                alert("绑定成功，刷新生效");
            };

            // 按钮点击触发手动抓取
            document.getElementById('bindBtn').insertAdjacentHTML('afterend', '<button id="catch-btn" style="margin-left:5px;padding:2px 6px;border:1px solid #409EFF;border-radius:3px;">手动抓取</button>');
            document.getElementById('catch-btn').onclick = doCatchAnswer;
        }

        function setSta(text, color = "#409EFF") {
            if (statusDom) {
                statusDom.innerText = "● " + text;
                statusDom.style.color = color;
            }
        }

        function getInputBox() {
            return document.querySelector('textarea.semi-input-textarea') || document.querySelector('textarea[placeholder="发消息..."]');
        }

        // 强制写入输入框逻辑
        function writeText(el, txt) {
            const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
            set.call(el, txt);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        }

        function getSendBtn() {
            return document.querySelector('button[aria-label="send"]') || document.getElementById("flow-end-msg-send");
        }

        // 监听来自学习通的信号
        function listenMsg() {
            GM_addValueChangeListener("cx_ai_signal", (_, __, val) => {
                if (!val) return;
                try { handleMsg(JSON.parse(val)) } catch (e) { }
            });
        }

        // 处理核心逻辑：根据信号执行（初始化、传图片、传文字）
        async function handleMsg(data) {
            // 【解锁】去掉这里的限制，允许连续发送
            // if (isWait) return;

            isWait = true;
            watchDog = setTimeout(() => { isWait = false; clearInterval(pollTimer); setSta("超时重置", "#F56C6C"); }, 60000);
            const input = getInputBox();
            if (!input) { isWait = false; setSta("无输入框", "#F56C6C"); return; }
            let ok = false;

            // 类型判断
            if (data.type === "init") {
                setSta("加载答题规则");
                const rule = `严格按规范输出答案，仅返回JSON格式内容，禁止多余解释、话术、换行修饰
答题分类与格式标准：
1.单选题{"type":"0","answer":["选项字母"]}
示例：{"type":"0","answer":["A"]}
2.多选题{"type":"1","answer":["A","B"]}
示例：{"type":"1","answer":["B","C"]}
3.判断题{"type":"3","answer":["正确/错误"]}
示例：{"type":"3","answer":["正确"]}
4.填空题{"type":"2","answer":["填写内容"]}
示例：{"type":"2","answer":["123"]}
5.简答题{"type":"4","answer":["作答文字"]}
示例：{"type":"4","answer":["学习使人进步"]}
6.无法作答、手写绘图、超纲题目统一返回{"intercept":true}

硬性要求：
- 一题对应一条独立JSON，多题按顺序罗列数组
- 只保留标准JSON字符，不要表情、序号、说明文字
- 简答内容换行用HTML换行标签<br>，适配页面录入格式`;
                ok = writeText(input, rule);
            } else if (data.type === "img") {
                setSta("识别图片题目");
                try {
                    const [_, b64] = data.data.split(",");
                    const buf = atob(b64);
                    const arr = new Uint8Array([...buf].map(c => c.charCodeAt(0)));
                    const file = new File([arr], "q.png", { type: "image/png" });
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
                    ok = true;
                } catch (e) { }
            } else {
                setSta("录入文字题目");
                ok = writeText(input, data.data);
            }
            if (!ok) { isWait = false; setSta("录入失败", "#F56C6C"); return; }

            setTimeout(() => {
                const sendBtn = getSendBtn();
                if (sendBtn) { sendBtn.disabled = false; sendBtn.click(); setSta("AI解析答题"); startCatch(); }
                else { isWait = false; setSta("发送失败", "#F56C6C"); }
            }, 1500);
        }



        // 无限次手动抓取 —— 修复大数溢出，永远抓最新
        function doCatchAnswer() {
            setSta("⏳ 抓取中...", "#E6A23C");

            // 每次点击都重新获取全部消息，绝不缓存
            const allMessages = document.querySelectorAll('div[data-message-id]');
            if (!allMessages.length) {
                setTimeout(() => setSta("❌ 未找到对话消息", "#F56C6C"), 400);
                return false;
            }

            // 永远取最后一条 = 最新的
            let latestMsg = allMessages[allMessages.length - 1];

            if (!latestMsg) {
                setTimeout(() => setSta("❌ 找不到最新消息", "#F56C6C"), 400);
                return false;
            }

            const nowTxt = latestMsg.innerText.trim();
            const jsArr = nowTxt.match(/\{[^{}]*\}/g)?.filter(v => v.includes('"type"') || v.includes('"intercept"')) || [];
            const resStr = `[${jsArr.join(",")}]`;

            try {
                JSON.parse(resStr);
                const unique = Date.now() + "_" + Math.random();
                GM_setValue("cx_ai_result", resStr + "|_|" + unique);

                isWait = false;
                clearInterval(pollTimer);
                clearTimeout(watchDog);

                setTimeout(() => setSta("✅ 已获取最新答案", "#67C23A"), 500);
                return true;
            } catch (e) {
                setTimeout(() => setSta("❌ 答案格式错误", "#F56C6C"), 500);
                return false;
            }
        }
        // 持续轮询获取 AI 输出的答案
        function startCatch() {
            clearInterval(pollTimer);
            let lastTxt = "";
            let stable = 0;

            pollTimer = setInterval(() => {
                // 每次都重新查全部消息
                const allMessages = document.querySelectorAll('div[data-message-id]');
                if (!allMessages.length) return;

                // 直接取最后一条，不比较ID，不缓存
                const latestMsg = allMessages[allMessages.length - 1];
                if (!latestMsg) return;

                const nowTxt = latestMsg.innerText.trim();

                if (nowTxt === lastTxt && nowTxt) {
                    stable++;
                    if (stable >= 18) {
                        clearInterval(pollTimer);
                        clearTimeout(watchDog);
                        isWait = false;
                        doCatchAnswer();
                    }
                } else {
                    stable = 0;
                    lastTxt = nowTxt;
                }
            }, 400);
        }
    }
})();