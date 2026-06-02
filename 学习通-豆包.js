// ==UserScript==
// @name         学习通豆包全自动答题
// @namespace    com.chaoxing.doubao.auto
// @version      1.5.2
// @author       Bart
// @description  学习通 + 豆包 双向联动全自动答题脚本，支持文字/截图答题、跳过已答题目、自动下一题
// @match        *://*.chaoxing.com/mooc-ans*
// @match        *://*.chaoxing.com/exam-ans*
// @match        *://*.doubao.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// @require      https://html2canvas.hertzen.com/dist/html2canvas.min.js
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @run-at       document-end
// @license MIT

// @downloadURL https://update.greasyfork.org/scripts/579463/%E5%AD%A6%E4%B9%A0%E9%80%9A%E8%B1%86%E5%8C%85%E5%85%A8%E8%87%AA%E5%8A%A8%E7%AD%94%E9%A2%98.user.js
// @updateURL https://update.greasyfork.org/scripts/579463/%E5%AD%A6%E4%B9%A0%E9%80%9A%E8%B1%86%E5%8C%85%E5%85%A8%E8%87%AA%E5%8A%A8%E7%AD%94%E9%A2%98.meta.js
// ==/UserScript==

(function () {
    'use strict';
    // 挂载页面原生window对象，方便调用页面内置编辑器、全局方法
    const win = unsafeWindow;

    // 记录上一次页面地址，用于监听页面跳转/路由切换
    let lastUrl = location.href;

    /**
     * 页面DOM变动监听器
     * 作用：监听页面刷新、切换题目、路由跳转，自动重新初始化脚本
     */
    new MutationObserver(() => {
        // 地址发生变化 = 页面跳转/切题
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            // 延迟1秒执行初始化，等待页面DOM加载完成
            setTimeout(checkAndInit, 1000);
        }
    }).observe(document.body, { childList: true, subtree: true });

    // 页面首次加载，执行初始化判断
    checkAndInit();

    /**
     * 入口分发函数
     * 根据当前域名，区分 学习通 / 豆包 分别初始化对应逻辑
     */
    function checkAndInit() {
        // 先移除旧的悬浮面板，防止重复创建
        const oldBox = document.querySelector('#ai-box');
        if (oldBox) oldBox.remove();

        // 判断当前网站，进入对应初始化
        if (location.host.includes("chaoxing.com")) {
            initChaoxing(); // 初始化 学习通 答题端
        } else if (location.host.includes("doubao.com")) {
            initDoubao();   // 初始化 豆包 AI 解析端
        }
    }

    /**
     * 辅助函数：使元素具备质感的拖拽与吸附弹性能力
     * @param {HTMLElement} el 拖拽目标元素
     * @param {string} storageKey 本地存储位置的key
     * @param {object} defaultPos 默认位置 {top, left, right, bottom}
     */
    function makeElementDraggableAndSnappable(el, storageKey, defaultPos) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        // 样式初始化准备
        el.style.transition = 'none';

        // 读取历史缓存位置或应用默认合适位置
        const savedPos = GM_getValue(storageKey, null);
        if (savedPos) {
            if (savedPos.left !== undefined) el.style.left = savedPos.left + 'px';
            if (savedPos.top !== undefined) el.style.top = savedPos.top + 'px';
        } else {
            Object.keys(defaultPos).forEach(k => el.style[k] = defaultPos[k]);
        }

        // 鼠标按下事件
        el.addEventListener('mousedown', (e) => {
            // 如果点在按钮或复选框上，不触发拖拽
            if (['BUTTON', 'INPUT', 'SPAN', 'LABEL'].includes(e.target.tagName)) return;
            isDragging = true;
            el.style.transition = 'none'; // 拖拽时关闭过渡动画

            const rect = el.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            startX = e.clientX;
            startY = e.clientY;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });

        function onMouseMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let x = initialX + dx;
            let y = initialY + dy;

            // 越界边界安全限制
            x = Math.max(0, Math.min(x, window.innerWidth - el.offsetWidth));
            y = Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight));

            el.style.left = x + 'px';
            el.style.top = y + 'px';
        }

        function onMouseUp() {
            if (!isDragging) return;
            isDragging = false;

            // 弹性吸附机制 (Spring Snapping)
            el.style.transition = 'all 0.5s cubic-bezier(0.19, 1, 0.22, 1)';

            const rect = el.getBoundingClientRect();
            const centerX = rect.left + el.offsetWidth / 2;
            let finalX = rect.left;

            // 左右自动吸附贴边，预留16px的优雅呼吸间距
            if (centerX < window.innerWidth / 2) {
                finalX = 16;
            } else {
                finalX = window.innerWidth - el.offsetWidth - 16;
            }

            el.style.left = finalX + 'px';

            // 实时保存位置状态
            GM_setValue(storageKey, { left: finalX, top: rect.top });

            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    }

    // ===================== 学习通 答题端 逻辑开始 =====================
    /**
     * 学习通页面初始化
     * 功能：创建悬浮控制面板、开启答案监听、答题核心逻辑
     */
    function initChaoxing() {
        let statusDiv;          // 状态显示文本容器
        let autoNextCheckbox;   // 自动下一题 复选框
        let skipFilled;         // 跳过已答题目 复选框

        // 1. 创建页面悬浮UI面板
        createUI();
        // 2. 开启答案接收监听（接收豆包返回的答案）
        listenAnswer();

        /**
         * 创建左侧悬浮控制面板
         * 包含：初始化规则、发送文字、发送截图、功能勾选框、状态提示
         */
        function createUI() {
            // 注入苹果风格统一全局CSS样式
            const style = document.createElement('style');
            style.innerHTML = `
                .apple-panel {
                    position: fixed; z-index: 9999999; width: 240px; padding: 16px;
                    background: rgba(255, 255, 255, 0.75); backdrop-filter: blur(20px) saturate(180%);
                    -webkit-backdrop-filter: blur(20px) saturate(180%);
                    border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 18px;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.08), inset 0 1px 1px rgba(255,255,255,0.2);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    cursor: grab; user-select: none; box-sizing: border-box;
                }
                .apple-panel:active { cursor: grabbing; }
                .apple-title { font-size: 14px; font-weight: 600; color: #1d1d1f; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
                .apple-btn {
                    width: 100%; padding: 8px 12px; margin-bottom: 8px; font-size: 12px; font-weight: 500;
                    border: none; border-radius: 10px; cursor: pointer; transition: all 0.2s ease;
                    display: flex; align-items: center; justify-content: center; box-sizing: border-box;
                }
                .apple-btn:active { transform: scale(0.97); filter: brightness(0.9); }
                .btn-warn { background: #ff9500; color: white; }
                .btn-primary { background: #007aff; color: white; }
                .btn-success { background: #34c759; color: white; }

                .apple-switch-label { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; font-size: 12px; color: #515154; cursor: pointer; }
                .apple-switch { position: relative; width: 36px; height: 20px; background: #e9e9ea; border-radius: 10px; transition: background 0.2s; }
                .apple-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; background: white; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.15); transition: transform 0.2s; }
                input[type="checkbox"] { display: none; }
                input[type="checkbox"]:checked + .apple-switch { background: #34c759; }
                input[type="checkbox"]:checked + .apple-switch::after { transform: translateX(16px); }

                .apple-status { margin-top: 14px; padding: 8px 10px; background: rgba(0,0,0,0.03); border-radius: 8px; font-size: 11px; line-height: 1.4; color: #86868b; word-break: break-all; text-align: center;}
            `;
            document.head.appendChild(style);

            const box = document.createElement('div');
            box.id = 'ai-box';
            box.className = 'apple-panel';

            // 面板HTML结构
            box.innerHTML = `
                <div class="apple-title">📗 学习通自动答题</div>
                <button id="btn-init" class="apple-btn btn-warn">初始化规则</button>
                <button id="btn-send-txt" class="apple-btn btn-primary">发送文字</button>
                <button id="btn-send-img" class="apple-btn btn-success">发送截图</button>

                <label class="apple-switch-label">
                    <span>自动下一题</span>
                    <input type="checkbox" id="autoNext" checked>
                    <div class="apple-switch"></div>
                </label>
                <label class="apple-switch-label">
                    <span>跳过已答题目</span>
                    <input type="checkbox" id="skipFilled">
                    <div class="apple-switch"></div>
                </label>
                <div id="status" class="apple-status">状态：就绪</div>
            `;
            document.body.appendChild(box);

            // 赋予面板拖拽与吸附能力 (默认出现在页面左上侧)
            makeElementDraggableAndSnappable(box, "cx_panel_pos", { top: '15%', left: '16px' });

            // 绑定DOM元素变量
            statusDiv = document.getElementById('status');
            autoNextCheckbox = document.getElementById('autoNext');
            skipFilled = document.getElementById('skipFilled');

            // 读取本地记录，恢复上次勾选状态
            const savedSkip = GM_getValue("skipFilled_state", false);
            skipFilled.checked = savedSkip;
            // 勾选状态改变时，实时保存到本地
            skipFilled.addEventListener("change", () => {
                GM_setValue("skipFilled_state", skipFilled.checked);
            });

            // 按钮点击事件
            document.getElementById('btn-init').onclick = () => {
                setStatus("初始化中...", "#007aff");
                GM_setValue("cx_ai_result", ""); // 清空旧答案
                sendSignal({ type: "init" });     // 发送【初始化规则】指令到豆包
            };
            document.getElementById('btn-send-txt').onclick = () => sendText();  // 发送文字题目
            document.getElementById('btn-send-img').onclick = () => sendImg();    // 发送截图题目
        }

        /**
         * 修改面板状态文本 + 字体颜色
         * @param {string} text 状态文字
         * @param {string} color 文字颜色
         */
        function setStatus(text, color = "#86868b") {
            if (statusDiv) {
                statusDiv.innerText = text;
                statusDiv.style.color = color;
                statusDiv.style.fontWeight = "500";
            }
        }

        /**
         * 获取页面所有题目DOM列表
         * 按页面视觉从上到下排序，保证题目顺序正确
         * @returns {HTMLElement[]} 题目元素数组
         */
        function getAllQuestions() {
            return Array.from(document.querySelectorAll('.questionLi'))
                .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        }

        /**
         * 判断当前题目是否已经作答
         * 区分：单选/多选/判断题、填空题/简答题
         * @param {HTMLElement} block 单个题目DOM容器
         * @returns {boolean} true=已作答  false=未作答
         */
        function isQuestionAnswered(block) {
            if (!block) return false;
            // 获取题目类型（单选/多选/判断/填空/简答）
            const type = block.getAttribute("typename") || "";

            // 1. 单选 / 多选 / 判断题：读取隐藏input的值判断
            if (type.includes("单选") || type.includes("多选") || type.includes("判断")) {
                const inputs = block.querySelectorAll('input[type="hidden"]');
                let targetVal = "";
                // 遍历隐藏域，找到答案对应的input
                for (let inp of inputs) {
                    if (inp.name.startsWith("answer") && !inp.name.includes("answertype")) {
                        targetVal = inp.value;
                        break;
                    }
                }
                // 去除空格，非空 = 已作答
                return targetVal.replace(/\s/g, "") !== "";
            }

            // 2. 填空题 / 简答题：读取对应输入框判断作答状态
            if (type.includes("填空")) {
                const textareaList = block.querySelectorAll('textarea[name^="answerEditor"]');
                // 遍历所有填空输入框，任意一个为空则判定未答
                for (let ta of textareaList) {
                    const cleanText = ta.value
                        .replace(/<[^>]+>/g, "")
                        .replace(/&nbsp;/g, " ")
                        .replace(/\s/g, "")
                        .trim();
                    if (cleanText === "") {
                        return false;
                    }
                }
                // 所有填空均有内容
                return true;
            }
            // 简答题：匹配 id^=answer 的隐藏 textarea + 读取UEditor内容
            if (type.includes("简答")) {
                const ta = block.querySelector('textarea[id^="answer"]');
                if (!ta) return false;
                let text = "";
                // 优先读UEditor编辑器内容
                if (window.UE && window.UE.getEditor) {
                    try {
                        const ed = UE.getEditor(ta.id);
                        text = ed.getContentTxt ? ed.getContentTxt() : ed.getContent();
                    } catch (e) {
                        text = ta.value;
                    }
                } else {
                    text = ta.value;
                }
                const cleanText = text
                    .replace(/<[^>]+>/g, "")
                    .replace(/&nbsp;/g, " ")
                    .replace(/\s/g, "")
                    .trim();
                return cleanText !== "";
            }

            // 其他题型默认返回未作答
            return false;
        }

        /**
         * 提取页面文字题目，发送给豆包AI
         */
        function sendText() {
            GM_setValue("cx_ai_result", ""); // 清空历史答案
            // 定位答题区域
            const wrap = document.querySelector('.exam-content') || document.body;
            // 提取纯文本并压缩空格
            const text = wrap.innerText.replace(/\s+/g, ' ').trim();

            if (text.length > 0) {
                sendSignal({ type: "txt", data: text });
                setStatus("文字已发送", "#007aff");
            } else {
                setStatus("未获取到文字", "#ff3b30");
            }
        }

        /**
         * 对答题区域截图，转图片Base64发送给豆包AI
         * 异步函数，依赖html2canvas
         */
        async function sendImg() {
            GM_setValue("cx_ai_result", ""); // 清空历史答案
            const wrap = document.querySelector('.exam-content') || document.body;
            setStatus("高清截图处理中...", "#007aff");

            try {
                // 调用html2canvas绘制高清画布
                const canvas = await html2canvas(wrap, {
                    useCORS: true,
                    allowTaint: false,
                    scale: 2.5,
                    dpi: 300
                });
                // 画布转图片Base64并发送
                sendSignal({ type: "img", data: canvas.toDataURL('image/png') });
                setStatus("高清截图已发送", "#34c759");
            } catch (e) {
                setStatus("截图失败", "#ff3b30");
            }
        }

        /**
         * 跨页面通信：发送指令/数据到豆包端
         * 依靠GM_setValue实现两页面数据互通
         * @param {object} data 要发送的对象：类型+内容
         */
        function sendSignal(data) {
            GM_setValue("cx_ai_signal", JSON.stringify({ ...data, ts: Date.now() }));
        }

        /**
         * 监听豆包返回的答案，自动批量答题
         * 采用【分页串行模式】，解决单页题目数量限制、懒加载问题
         */
        function listenAnswer() {
            // 监听 cx_ai_result 数据变化（豆包返回答案）
            GM_addValueChangeListener("cx_ai_result", (_, oldVal, val) => {
                // 无新数据 / 数据未变化，直接返回
                if (!val || val === oldVal) return;
                // 分割标记，分离纯答案JSON
                const [raw] = val.split("|_|");

                try {
                    // 解析答案数组
                    const answers = JSON.parse(raw);
                    setStatus(`总答案数：${answers.length}`, "#007aff");
                    let currentIndex = 0; // 全局答案指针（记录处理到第几条答案）

                    /**
                     * 单页处理主逻辑
                     * 一页一页处理题目，处理完自动翻页，适配分页/懒加载
                     */
                    function handlePage() {
                        // 所有答案全部处理完成，结束流程
                        if (currentIndex >= answers.length) {
                            setStatus("全部题目处理完成", "#34c759");
                            // 开启自动下一题则执行翻页
                            if (autoNextCheckbox.checked) nextQuestion();
                            return;
                        }

                        // 实时获取当前页面所有题目DOM
                        const pageQues = getAllQuestions();
                        const pageLen = pageQues.length;
                        setStatus(`DOM题目:${pageLen} | 处理到:${currentIndex}`, "#007aff");

                        // 当前页面无题目，终止
                        if (pageLen === 0) {
                            setStatus("【终止】页面无题目", "#ff3b30");
                            return;
                        }

                        let pageIdx = 0; // 当前页面内的题目下标

                        /**
                         * 串行处理当前页每一道题
                         * 一题执行完毕再执行下一题，防止队列阻塞
                         */
                        function handleOneInPage() {
                            // 当前页面所有题目处理完毕 → 翻页
                            if (pageIdx >= pageLen) {
                                setStatus("正在切换下一页...", "#007aff");
                                if (autoNextCheckbox.checked) {
                                    nextQuestion();
                                }
                                // 翻页延迟1秒，等待新页面加载，再继续处理剩余答案
                                setTimeout(handlePage, 1000);
                                return;
                            }

                            const globalIdx = currentIndex; // 全局答案序号
                            const localIdx = pageIdx;       // 本页题目序号
                            const ans = answers[globalIdx]; // 当前答案
                            const curQ = pageQues[localIdx]; // 当前题目DOM

                            setStatus(`处理: 全局${globalIdx + 1} / 本页${localIdx + 1}`, "#007aff");

                            // 单题超时兜底：2.5秒无响应则强制跳过，防止卡死
                            const guard = setTimeout(() => {
                                setStatus(`第${globalIdx + 1}题超时跳过`, "#ff9500");
                                currentIndex++;
                                pageIdx++;
                                setTimeout(handleOneInPage, 800);
                            }, 2500);

                            // 延迟执行答题逻辑，给DOM缓冲时间
                            setTimeout(() => {
                                clearTimeout(guard); // 清除超时计时器
                                try {
                                    // 勾选【跳过已答】且题目已作答 → 直接跳过
                                    if (skipFilled.checked && isQuestionAnswered(curQ)) {
                                        setStatus(`第${globalIdx + 1}题已答,跳过`, "#34c759");
                                    }
                                    // 题目标记为拦截（手写/图片模糊/超纲）→ 跳过
                                    else if (ans.intercept) {
                                        setStatus(`第${globalIdx + 1}题忽略`, "#ff9500");
                                    }
                                    // 正常执行答题填充
                                    else {
                                        fillAns(ans, curQ);
                                        setStatus(`第${globalIdx + 1}题填写成功`, "#34c759");
                                    }
                                } catch (e) {
                                    setStatus(`报错 ${globalIdx + 1}题:${e.message}`, "#ff3b30");
                                }
                                // 下标自增，进入下一题
                                currentIndex++;
                                pageIdx++;
                                setTimeout(handleOneInPage, 800);
                            }, 200);
                        }

                        // 启动当前页面答题流程
                        handleOneInPage();
                    }

                    // 整体开始执行
                    handlePage();
                } catch (e) {
                    setStatus(`顶层异常`, "#ff3b30");
                }
            });
        }

        /**
         * 答案填充核心函数
         * 根据题型自动填充 选择题 / 填空简答（适配多空填空题）
         * @param {object} res 单条答案对象 {type, answer, intercept}
         * @param {HTMLElement} block 题目DOM容器
         */
        function fillAns(res, block) {
            const type = res.type + ""; // 题型编号
            const ansArr = res.answer || []; // 答案内容数组
            let success = false;

            // 题型 0单选 / 1多选 / 3判断 → 点击选项作答
            if (["0", "1", "3"].includes(type)) {
                const opts = block.querySelectorAll("span.num_option, span.num_option_dx");
                // 遍历答案，逐个点击对应选项
                ansArr.forEach(target => {
                    opts.forEach(item => {
                        const d = item.dataset.data?.trim();
                        const t = item.textContent.trim();
                        // 匹配选项内容 / 自定义data值
                        if (d === target || t === target) {
                            // 模拟鼠标按下+抬起+点击，触发页面原生事件
                            item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                            item.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
                            item.click();
                            success = true;
                        }
                    });
                });
                if (!success) throw new Error("选项未找到");
            }
            // 题型 2填空 / 4简答 → 文本框/富文本编辑器赋值
            else if (["2", "4"].includes(type)) {
                // 填空题：保留原有多空逻辑不变
                if (type === "2") {
                    const textareaList = block.querySelectorAll('textarea[name^="answerEditor"]');
                    // 按顺序遍历输入框和答案，一一对应填充
                    textareaList.forEach((ta, idx) => {
                        if (idx >= ansArr.length) return;
                        const content = ansArr[idx];

                        // 优先使用学习通UE富文本编辑器赋值
                        if (win.UE && win.UE.getEditor) {
                            try {
                                const ed = win.UE.getEditor(ta.id);
                                ed.ready(function () {
                                    ed.setContent(content);
                                    ed.fireEvent?.("contentChange");
                                });
                                success = true;
                            } catch (e) {
                                success = false;
                            }
                        }
                        // 富文本失败 → 使用contenteditable普通富文本
                        if (!success) {
                            const editDom = block.querySelector('[contenteditable="true"]');
                            if (editDom) {
                                editDom.innerText = content;
                                editDom.dispatchEvent(new Event("input", { bubbles: true }));
                                success = true;
                            }
                        }
                        // 最后兜底：原生textarea直接赋值
                        if (!success && ta) {
                            ta.value = content;
                            ta.dispatchEvent(new Event("input", { bubbles: true }));
                            success = true;
                        }
                    });
                }
                // 简答题：type=4 全新修复逻辑
                else if (type === "4") {
                    const content = ansArr.join("\n");
                    // 精准选择 id 以 answer 开头的隐藏 textarea
                    const ta = block.querySelector('textarea[id^="answer"]');
                    if (!ta) throw new Error("未找到简答输入框");

                    const editorId = ta.id;
                    success = false;

                    // 方案1：优先操作UEditor，等待初始化完成
                    if (win.UE && win.UE.getEditor) {
                        try {
                            const ed = win.UE.getEditor(editorId);
                            ed.ready(function () {
                                ed.setContent(content);
                                // 触发原生内容变更事件
                                ed.fireEvent("contentChange");
                                // 同步隐藏域文本
                                ta.value = content;
                                ta.dispatchEvent(new Event("input", { bubbles: true }));
                            });
                            success = true;
                        } catch (e) {
                            success = false;
                        }
                    }
                    // 方案2：UEditor异常兜底，直接操作原生textarea
                    if (!success) {
                        ta.value = content;
                        ta.dispatchEvent(new Event("input", { bubbles: true }));
                        ta.dispatchEvent(new Event("change", { bubbles: true }));
                        success = true;
                    }

                    if (!success) throw new Error("简答题赋值失败");
                }

                if (!success) throw new Error("简答/填空编辑器赋值失败");
            }
        }

        /**
         * 自动点击【下一题 / 下一章】按钮
         */
        function nextQuestion() {
            document.activeElement?.blur(); // 失焦当前输入框
            // 匹配常规下一题按钮
            const btn = document.querySelector(".nextBtn,.nextChapter")
                || [...document.querySelectorAll("button,a")].find(el => /下一/.test(el.innerText));
            btn?.click();
        }
    }
    // ===================== 学习通 答题端 逻辑结束 =====================


    // ===================== 豆包 AI 解析端 逻辑开始 =====================
    /**
     * 豆包页面初始化
     * 功能：创建悬浮按钮、监听学习通指令、自动抓取AI答案回传
     */
    function initDoubao() {
        // 等待页面完全加载再初始化
        if (document.readyState !== "complete") {
            window.addEventListener("load", initDoubao);
            return;
        }

        // 读取绑定地址，非绑定页面直接返回（多标签隔离）
        const bindUrl = GM_getValue("cx_exclusive_url", "");
        if (bindUrl && bindUrl !== location.href) return;

        let isWait = false;    // 是否正在等待AI回复
        let pollTimer;         // 轮询计时器（监听AI输出）
        let watchDog;          // 超时看门狗
        let statusDom;         // 状态文本容器

        // 创建右下角悬浮面板
        createPanel();
        // 监听学习通发来的指令（文字/图片/初始化）
        listenMsg();

        /**
         * 创建豆包页面右下角悬浮面板
         * 包含：状态提示、绑定按钮、手动抓取答案按钮
         */
        function createPanel() {
            // 动态注入豆包专属优雅样式
            const style = document.createElement('style');
            style.innerHTML = `
                .db-apple-panel {
                    position: fixed; z-index: 999999; padding: 12px 16px;
                    background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(20px) saturate(180%);
                    -webkit-backdrop-filter: blur(20px) saturate(180%);
                    border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 16px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.08);
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    display: flex; align-items: center; gap: 10px; cursor: grab; user-select: none;
                }
                .db-apple-panel:active { cursor: grabbing; }
                .db-status-dot { font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 6px; }
                .db-btn {
                    padding: 5px 12px; font-size: 11px; font-weight: 500; border: none; border-radius: 8px;
                    cursor: pointer; transition: all 0.2s; background: rgba(0,0,0,0.05); color: #1d1d1f;
                }
                .db-btn:hover { background: rgba(0,0,0,0.08); }
                .db-btn-primary { background: #007aff; color: white; }
                .db-btn-primary:hover { background: #0066d6; }
            `;
            document.head.appendChild(style);

            const p = document.createElement("div");
            p.className = "db-apple-panel";
            p.innerHTML = `
                <span id="dbSta" class="db-status-dot" style="color:#007aff">● 待命</span>
                <button id="bindBtn" class="db-btn">绑定专页</button>
                <button id="catch-btn" class="db-btn db-btn-primary">手动抓取</button>
            `;
            document.body.appendChild(p);

            // 赋予面板拖拽与吸附能力 (默认出现在右下角附近)
            makeElementDraggableAndSnappable(p, "db_panel_pos", { bottom: '24px', right: '24px' });

            statusDom = document.getElementById("dbSta");
            // 绑定当前页面为专属通信页面
            document.getElementById("bindBtn").onclick = () => {
                GM_setValue("cx_exclusive_url", location.href);
                alert("绑定成功，刷新页面生效");
            };
            // 手动抓取答案按钮
            document.getElementById('catch-btn').onclick = doCatchAnswer;
        }

        /**
         * 修改豆包端状态文字与颜色
         * @param {string} text 状态文本
         * @param {string} color 字体颜色
         */
        function setSta(text, color = "#007aff") {
            if (statusDom) {
                statusDom.innerText = "● " + text;
                statusDom.style.color = color;
            }
        }

        /**
         * 获取豆包输入框DOM
         * @returns {HTMLElement|null} 输入框元素
         */
        function getInputBox() {
            return document.querySelector('textarea.semi-input-textarea')
                || document.querySelector('textarea[placeholder="发消息..."]');
        }

        /**
         * 向输入框写入文本，并触发页面原生input/change事件
         * @param {HTMLElement} el 输入框
         * @param {string} txt 要写入的内容
         * @returns {boolean} 是否写入成功
         */
        function writeText(el, txt) {
            const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
            set.call(el, txt);
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        }

        /**
         * 获取豆包发送按钮
         * @returns {HTMLElement|null} 发送按钮
         */
        function getSendBtn() {
            return document.querySelector('button[aria-label="send"]')
                || document.getElementById("flow-end-msg-send");
        }

        /**
         * 监听学习通发来的指令信号
         */
        function listenMsg() {
            GM_addValueChangeListener("cx_ai_signal", (_, __, val) => {
                if (!val) return;
                try { handleMsg(JSON.parse(val)) } catch (e) { }
            });
        }

        /**
         * 处理学习通发来的指令：初始化规则 / 文字题目 / 图片题目
         * @param {object} data 指令对象
         */
        async function handleMsg(data) {
            isWait = true;
            // 全局60秒超时，防止无限等待
            watchDog = setTimeout(() => {
                isWait = false;
                clearInterval(pollTimer);
                setSta("超时重置", "#ff3b30");
            }, 60000);

            const input = getInputBox();
            if (!input) {
                isWait = false;
                setSta("无输入框", "#ff3b30");
                return;
            }
            let ok = false;

            // 1. 初始化答题规则指令（已完善提示词，强化多空填空规则）
            if (data.type === "init") {
                setSta("加载规则");
                const rule = `严格按规范输出答案，仅返回JSON格式内容，禁止多余解释、话术、换行修饰
答题分类与格式标准：
1.单选题{"type":"0","answer":["选项字母"]}
示例：{"type":"0","answer":["A"]}
2.多选题{"type":"1","answer":["A","B"]}
示例：{"type":"1","answer":["B","C"]}
3.判断题{"type":"3","answer":["正确/错误"]}
示例：{"type":"3","answer":["A"]}
注意:判断题统一使用【A/B】作为答案内容
4.填空题{"type":"2","answer":["第1空内容","第2空内容","第3空内容"]}
重要规则：一题存在多个填空时，按题目从上到下空的顺序依次填写，一个空对应数组一个元素
示例：两空题目 {"type":"2","answer":["3","4"]}
5.简答题{"type":"4","answer":["作答文字"]}
简答内容禁止直接换行，如需换行统一使用HTML <p> 标签
示例：{"type":"4","answer":["<p>第一行内容</p><p>第二行内容</p>"]}
6.无法作答、手写绘图、图片模糊、超纲题目统一返回{"intercept":true}
硬性要求：
- 硬性规则：所有文件路径禁止使用反斜杠 \，一律改用正斜杠 /，禁止出现未转义反斜杠，避免JSON格式错误。
- 一题对应一条独立JSON，多题按顺序组合为数组
- 只保留标准JSON字符，不要表情、序号、额外说明文字
- 严格区分题型type值，不要混用
- 多空填空必须严格按照空的先后顺序排列答案数组，数量与空数量一致`;
                ok = writeText(input, rule);
            }
            // 2. 图片题目：Base64转图片粘贴到输入框
            else if (data.type === "img") {
                setSta("识别图片");
                try {
                    const [_, b64] = data.data.split(",");
                    const buf = atob(b64);
                    const arr = [...buf].map(c => c.charCodeAt(0));
                    const file = new File([new Uint8Array(arr)], "q.png", { type: "image/png" });
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    input.files = dt.files;
                    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }));
                    ok = true;
                } catch (e) { }
            }
            // 3. 纯文字题目：直接写入输入框
            else {
                setSta("录入文字");
                ok = writeText(input, data.data);
            }

            // 写入失败
            if (!ok) {
                isWait = false;
                setSta("录入失败", "#ff3b30");
                return;
            }

            // 延迟点击发送，模拟人工操作
            setTimeout(() => {
                const sendBtn = getSendBtn();
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.click();
                    setSta("解析中...");
                    // 启动轮询，等待AI输出答案
                    startCatch();
                } else {
                    isWait = false;
                    setSta("发送失败", "#ff3b30");
                }
            }, 1500);
        }

        /**
         * 手动抓取AI答案，并回传给学习通
         * @returns {boolean} 抓取是否成功
         */
        function doCatchAnswer() {
            setSta("抓取中...", "#ff9500");
            const allMessages = document.querySelectorAll('div[data-message-id]');
            if (!allMessages.length) {
                setTimeout(() => setSta("未找见消息", "#ff3b30"), 400);
                return false;
            }
            // 取最后一条消息（AI最新回复）
            const latestMsg = allMessages[allMessages.length - 1];
            if (!latestMsg) {
                setTimeout(() => setSta("无最新消息", "#ff3b30"), 400);
                return false;
            }
            const nowTxt = latestMsg.innerText.trim();
            // 正则提取所有JSON片段
            let resStr = "";
            // 优先抓取完整数组
            const fullArr = nowTxt.match(/\[[\s\S]*\]/);
            if (fullArr) {
                resStr = fullArr[0];
            } else {
                // 没找到外层[]，沿用原来拆分单对象逻辑，兼容零散{}
                const jsArr = nowTxt.match(/\{[^{}]*\}/g)?.filter(v => v.includes('"type"') || v.includes('"intercept"')) || [];
                resStr = `[${jsArr.join(",")}]`;
            }

            try {
                JSON.parse(resStr); // 校验JSON合法性
                const unique = Date.now() + "_" + Math.random();
                // 把答案回传给学习通
                GM_setValue("cx_ai_result", resStr + "|_|" + unique);
                isWait = false;
                clearInterval(pollTimer);
                clearTimeout(watchDog);
                setTimeout(() => setSta("已传答案", "#34c759"), 500);
                return true;
            } catch (e) {
                setTimeout(() => setSta("格式错误", "#ff3b30"), 400);
                return false;
            }
        }

        /**
         * 自动轮询监听AI输出，稳定后自动抓取答案
         */
        function startCatch() {
            clearInterval(pollTimer);
            let lastTxt = "";
            let stable = 0; // 内容稳定计数器

            // 每400毫秒轮询一次消息
            pollTimer = setInterval(() => {
                const allMessages = document.querySelectorAll('div[data-message-id]');
                if (!allMessages.length) return;
                const latestMsg = allMessages[allMessages.length - 1];
                if (!latestMsg) return;

                const nowTxt = latestMsg.innerText.trim();
                // 内容连续不变 → 判断AI输出完成
                if (nowTxt === lastTxt && nowTxt) {
                    stable++;
                    // 连续9次不变 = 输出结束，开始抓取
                    if (stable >= 9) {
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
    // ===================== 豆包 AI 解析端 逻辑结束 =====================
})();