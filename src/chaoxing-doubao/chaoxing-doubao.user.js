// ==UserScript==
// @name         学习通豆包全自动答题
// @namespace    com.chaoxing.doubao.auto
// @version      1.6.4
// @author       Bart
// @description  学习通 + 豆包 双向联动全自动答题脚本，支持文字/截图答题、跳过已答题目、自动下一题
// @match        *://*.chaoxing.com/mooc-ans*
// @match        *://*.chaoxing.com/exam-ans*
// @match        *://*.doubao.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_listValues
// @grant        GM_openInTab
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @noframes
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @run-at       document-end
// @license MIT

// @homepageURL   https://github.com/yanguanbai/Chaoxing-link-Doubao
// @supportURL    https://github.com/yanguanbai/Chaoxing-link-Doubao/issues
// @downloadURL   https://raw.githubusercontent.com/yanguanbai/Chaoxing-link-Doubao/main/src/chaoxing-doubao/chaoxing-doubao.user.js
// @updateURL     https://raw.githubusercontent.com/yanguanbai/Chaoxing-link-Doubao/main/src/chaoxing-doubao/chaoxing-doubao.user.js
// ==/UserScript==

(function () {
    'use strict';
    // 挂载页面原生window对象，方便调用页面内置编辑器、全局方法
    const win = unsafeWindow;
    const DOUBAO_PRESENCE_PREFIX = "cx_doubao_presence_";
    const DOUBAO_DEFAULT_URL = "https://www.doubao.com/";
    // 豆包页心跳超过该时长即视为"心跳停了"，但停跳不等于页面已关闭：
    // 后台标签会被浏览器冻结/节流，定时器不再执行，因此还要留一段"疑似仍在"的宽限期
    const PRESENCE_STALE_MS = 120000;
    // 宽限期：有心跳记录但已停跳，或最近有过真实通信，都按"页面可能还在"处理，不自动开新页
    const PRESENCE_DORMANT_MS = 30 * 60000;
    // 自动开页冷却，避免一次发送流程里连开多个标签
    const OPEN_COOLDOWN_MS = 60000;
    // 绑定记录的信任期：这期间内有绑定就认为用户开过豆包页，不再自动新开
    const BINDING_TRUST_MS = 12 * 3600 * 1000;
    // 信号与答案的有效期，超过视为过期，避免旧消息串到新题目
    const SIGNAL_FRESH_MS = 120000;
    const ACK_TIMEOUT_MS = 75000;

    // 记录上一次页面地址，用于监听页面跳转/路由切换
    let lastUrl = location.href;

    /**
     * 地址轮询代替整棵 DOM 的 MutationObserver
     * 作用：路由变化时重新初始化；轮询只比较 href，开销可以忽略
     */
    setInterval(() => {
        if (location.href === lastUrl) return;
        lastUrl = location.href;
        // 同一窗口里作业页 ↔ 考试页切换时，"自动下一题"只属于考试页
        const examRow = document.getElementById("row-autoNext");
        const examNow = location.pathname.includes("/exam-ans");
        if (examRow) {
            examRow.style.display = examNow ? "flex" : "none";
            const box = document.getElementById("autoNext");
            // 进入考试页时按存储恢复开关，避免面板是在作业页创建时留下的未勾选状态
            if (examNow && box) box.checked = GM_getValue("autoNext_exam_state", true);
        }
        setTimeout(checkAndInit, 800);
    }, 300);

    /**
     * 跨标签值变更监听，兼容不支持 GM_addValueChangeListener 的脚本管理器
     * @param {string} key 存储键
     * @param {(val:any, oldVal:any)=>void} cb 回调
     */
    function onValueChange(key, cb) {
        if (typeof GM_addValueChangeListener === "function") {
            return GM_addValueChangeListener(key, (_, oldVal, val) => cb(val, oldVal));
        }
        let snapshot = JSON.stringify(GM_getValue(key, ""));
        return setInterval(() => {
            const raw = GM_getValue(key, "");
            const cur = JSON.stringify(raw);
            if (cur === snapshot) return;
            const oldVal = snapshot;
            snapshot = cur;
            cb(raw, oldVal);
        }, 500);
    }

    // 页面首次加载，执行初始化判断
    checkAndInit();

    /**
     * 入口分发函数
     * 根据当前域名，区分 学习通 / 豆包 分别初始化对应逻辑
     */
    function checkAndInit() {
        // 判断当前网站，进入对应初始化
        if (location.host.includes("chaoxing.com")) {
            if (document.querySelector('#ai-box')) return;
            initChaoxing(); // 初始化 学习通 答题端
        } else if (location.host.includes("doubao.com")) {
            if (document.querySelector('#db-panel')) return;
            initDoubao();   // 初始化 豆包 AI 解析端
        }
    }

    // 旧版按整条 URL 绑定，升级后只保留"打开页面"的地址，绑定关系交给标签页 token
    if (!GM_getValue("cx_doubao_url", "") && GM_getValue("cx_exclusive_url", "")) {
        GM_setValue("cx_doubao_url", GM_getValue("cx_exclusive_url", ""));
    }

    function getDoubaoUrl() {
        return GM_getValue("cx_doubao_url", "") || DOUBAO_DEFAULT_URL;
    }

    /**
     * 收集豆包页面的存在证据
     * @returns {{fresh: boolean, dormant: boolean, tabCount: number, boundRecently: boolean}}
     *  fresh          心跳新鲜，页面肯定在
     *  dormant        有心跳记录但已停跳，或最近有过通信，页面可能在（不能据此开新页）
     *  tabCount       带心跳记录的标签页数量
     *  boundRecently  近期有绑定记录，说明用户开过豆包页，只是可能被冻结
     */
    function getDoubaoPresence() {
        const now = Date.now();
        const target = GM_getValue("cx_doubao_target", "");
        const result = { fresh: false, dormant: false, tabCount: 0, boundRecently: false };

        GM_listValues().forEach(key => {
            if (!key.startsWith(DOUBAO_PRESENCE_PREFIX)) return;
            const page = GM_getValue(key, null);
            if (!page || typeof page.updatedAt !== "number") {
                GM_deleteValue(key);
                return;
            }
            const age = now - page.updatedAt;
            // 超过宽限期才真正认为页面已关闭
            if (age >= PRESENCE_DORMANT_MS) {
                GM_deleteValue(key);
                return;
            }
            // 绑定时只认绑定的那个标签页
            if (target && page.token !== target) return;
            result.tabCount += 1;
            if (age < PRESENCE_STALE_MS) result.fresh = true;
            else result.dormant = true;
        });

        // 最近一次真实通信（豆包回过接收/完成状态或答案）同样说明页面还在
        const lastActive = GM_getValue("cx_doubao_last_active", 0);
        if (!result.fresh && now - lastActive < PRESENCE_DORMANT_MS) result.dormant = true;

        // 有绑定记录且不算太久：页面即便被冻结，也不该由脚本再开一个
        const boundAt = GM_getValue("cx_doubao_bound_at", 0);
        if (target && boundAt && now - boundAt < BINDING_TRUST_MS) result.boundRecently = true;

        return result;
    }

    /**
     * 按需打开豆包页，已有页面时一律不重复打开
     * @param {boolean} force 用户明确要求强制新开（需连续两次点击才走到这里）
     * @returns {'active'|'maybe'|'cooldown'|'opened'} 处理结果
     */
    function openDoubaoIfNeeded(force = false) {
        const { fresh, dormant, tabCount, boundRecently } = getDoubaoPresence();
        if (fresh) return "active";
        // 有停跳记录、近期通信过、或近期绑定过：页面可能只是被冻结，绝不能当成"没开"再去开一个
        if (!force && (dormant || tabCount > 0 || boundRecently)) return "maybe";

        const now = Date.now();
        const lastOpen = GM_getValue("cx_doubao_last_open", 0);
        if (now - lastOpen < OPEN_COOLDOWN_MS) return "cooldown";

        GM_setValue("cx_doubao_last_open", now);
        GM_openInTab(getDoubaoUrl(), { active: true, insert: true, setParent: true });
        return "opened";
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
            // 定位改由 left/top 接管，必须清掉默认的 right/bottom，否则 fixed 元素会被拉伸
            el.style.right = 'auto';
            el.style.bottom = 'auto';
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

            // 从 right/bottom 定位切换到 left/top 定位
            const rect0 = el.getBoundingClientRect();
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.left = rect0.left + 'px';
            el.style.top = rect0.top + 'px';

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
            el.style.top = rect.top + 'px';

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
        // 实时判断，避免同一窗口从作业页跳到考试页后模式仍是旧的
        const isExam = () => location.pathname.includes("/exam-ans");
        let statusDiv;          // 状态显示文本容器
        let autoNextCheckbox;   // 自动下一题 复选框
        let skipFilled;         // 跳过已答题目 复选框
        let pendingSignalId = null; // 最近一次发出、尚未回终态的信号
        let sendWatchdog;       // 发送后等待豆包响应的看门狗

        // 1. 创建页面悬浮UI面板
        createUI();
        // 2. 开启答案接收监听（接收豆包返回的答案）
        listenAnswer();
        // 3. 开启处理状态监听（豆包是否收到、是否失败）
        listenAck();

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
                .btn-doubao { background: #202124; color: white; }

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
            box.setAttribute('data-html2canvas-ignore', 'true');//截图隐藏面板

            // 面板HTML结构
            box.innerHTML = `
                <div class="apple-title">📗 学习通自动答题</div>
                <button id="btn-init" class="apple-btn btn-warn">初始化规则</button>
                <button id="btn-open-doubao" class="apple-btn btn-doubao">打开豆包</button>
                <button id="btn-send-txt" class="apple-btn btn-primary">发送文字</button>
                <button id="btn-send-img" class="apple-btn btn-success">发送截图</button>

                <label class="apple-switch-label" id="row-autoNext" style="display:none">
                    <span>自动下一题</span>
                    <input type="checkbox" id="autoNext">
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

            // 读取本地记录，恢复上次开关状态
            // 作业页整页发送后不再翻页，"自动下一题"只对考试页有意义，作业页直接隐藏
            const autoNextRow = document.getElementById('row-autoNext');
            const examMode = isExam();
            autoNextRow.style.display = examMode ? 'flex' : 'none';
            autoNextCheckbox.checked = examMode ? GM_getValue("autoNext_exam_state", true) : false;
            autoNextCheckbox.addEventListener("change", () => {
                // 用实时判断而不是建面板时的快照，同窗口切到考试页后也能正确持久化
                if (isExam()) GM_setValue("autoNext_exam_state", autoNextCheckbox.checked);
            });
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
                sendSignal({ type: "init" }, "规则已发送");     // 发送【初始化规则】指令到豆包
            };
            let forceOpenArmedAt = 0; // 记录"再点一次就强制开"的时刻
            document.getElementById('btn-open-doubao').onclick = () => {
                const armed = Date.now() - forceOpenArmedAt < 3000;
                const openState = openDoubaoIfNeeded(armed);
                if (openState === "opened") {
                    forceOpenArmedAt = 0;
                    setStatus("正在打开豆包...", "#007aff");
                } else if (openState === "cooldown") {
                    setStatus("刚打开过豆包，稍后再试", "#ff9500");
                } else if (openState === "maybe") {
                    forceOpenArmedAt = Date.now();
                    setStatus("豆包页可能还开着，先切过去看看；确定关了再点一次强制新开", "#ff9500");
                } else {
                    forceOpenArmedAt = 0;
                    setStatus("豆包页面已打开", "#34c759");
                }
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
                // 优先读UEditor编辑器内容（统一用页面真实 window，沙箱 window 上通常没有 UE）
                if (win.UE && win.UE.getEditor) {
                    try {
                        const ed = win.UE.getEditor(ta.id);
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
         * 作业页发送整页题目；考试页只发送当前可见题目，避免把考试导航、题号卡片一并发送。
         */
        function getQuestionContent() {
            if (!isExam()) {
                return document.querySelector('.exam-content') || document.body;
            }
            return getVisibleQuestion()
                || document.querySelector('.exam-content .TiMu, .TiMu')
                || document.querySelector('.exam-content');
        }

        /**
         * 考试页当前可见的题目容器
         * @returns {HTMLElement|null}
         */
        function getVisibleQuestion() {
            return Array.from(document.querySelectorAll('.questionLi'))
                .find(question => question.getClientRects().length > 0
                    && getComputedStyle(question).visibility !== 'hidden') || null;
        }

        /**
         * 提取页面文字题目，发送给豆包AI
         * 作业页逐题拼装题干与选项，只保留有效信息，不整段抓 .exam-content 的页面噪音
         */
        function sendText() {
            GM_setValue("cx_ai_result", ""); // 清空历史答案
            const wrap = getQuestionContent();
            if (!wrap) {
                setStatus("未找到当前题目区域", "#ff3b30");
                return;
            }

            const text = isExam()
                ? wrap.innerText.replace(/\s+/g, ' ').trim()
                : buildQuestionText();

            if (text.length > 0) {
                sendSignal({ type: "txt", data: text }, "文字已发送");
            } else {
                setStatus("未获取到文字", "#ff3b30");
            }
        }

        /**
         * 按题目块拼装纯文本：第 N 题 + 题干 + 各选项字母与内容
         * 只读 .questionLi 内部有效节点，题量、满分、作答时间、答题卡等页面元素不会被带入
         * @returns {string}
         */
        function buildQuestionText() {
            const blocks = getAllQuestions();
            if (!blocks.length) return "";

            const parts = blocks.map((block, idx) => {
                const rawType = block.getAttribute("typename") || "";
                const type = rawType.replace(/题$/, "") || "未知题型";

                // 题干优先取标题节点，取不到再退回整块文本
                const stemEl = block.querySelector('.Zy_TItle, .qtContent, .Zy_TItle_title');
                const stemText = (stemEl ? stemEl.innerText : block.innerText)
                    .replace(/\s+/g, ' ').trim();

                // 选项：字母（页面展示）+ 选项内容
                const opts = [...block.querySelectorAll('div.answerBg')].map(option => {
                    const span = option.querySelector('span.num_option, span.num_option_dx');
                    const label = span ? span.textContent.trim() : "";
                    const content = option.innerText
                        .replace(label, "")
                        .replace(/\s+/g, ' ').trim();
                    return label ? `${label} ${content}`.trim() : content;
                }).filter(Boolean);

                const head = `第${idx + 1}题（${type}）`;
                return opts.length
                    ? `${head} ${stemText}\n${opts.join("\n")}`
                    : `${head} ${stemText}`;
            });

            return parts.join("\n\n");
        }

        /**
         * 对答题区域截图，转图片Base64发送给豆包AI
         * 作业页只渲染题目块，避免把页面导航、答题卡一起截进去
         */
        async function sendImg() {
            GM_setValue("cx_ai_result", ""); // 清空历史答案
            const wrap = getQuestionContent();
            if (!wrap) {
                setStatus("未找到当前题目区域", "#ff3b30");
                return;
            }
            if (typeof html2canvas !== "function") {
                setStatus("截图库未加载（检查 jsDelivr 与 CSP 扩展）", "#ff3b30");
                return;
            }
            setStatus("高清截图处理中...", "#007aff");

            const { target, cleanup } = buildShotTarget(wrap);
            try {
                // 调用html2canvas绘制高清画布
                const canvas = await html2canvas(target, {
                    useCORS: true,
                    allowTaint: false,
                    scale: 2.5,
                    dpi: 300
                });
                // 画布转图片Base64并发送
                sendSignal({ type: "img", data: canvas.toDataURL('image/png') }, "高清截图已发送");
            } catch (e) {
                setStatus("截图失败", "#ff3b30");
            } finally {
                cleanup();
            }
        }

        /**
         * 截图渲染目标：考试页直接用当前题目；作业页克隆所有题目块放进离屏容器
         * @param {HTMLElement} wrap 当前题目区域
         * @returns {{target: HTMLElement, cleanup: Function}}
         */
        function buildShotTarget(wrap) {
            const noop = () => { };
            if (isExam()) return { target: wrap, cleanup: noop };

            const blocks = getAllQuestions();
            if (!blocks.length) return { target: wrap, cleanup: noop };

            const width = Math.max(360, wrap.getBoundingClientRect().width || 900);
            const holder = document.createElement('div');
            holder.setAttribute('data-html2canvas-ignore', 'false');
            holder.style.cssText = `position: fixed; left: -10000px; top: 0; width: ${width}px;`
                + 'background: #fff; padding: 16px; font-family: -apple-system, "Microsoft YaHei", sans-serif; color: #1d1d1f;';

            blocks.forEach(block => {
                const clone = block.cloneNode(true);
                // 去掉评分、我的答案、解析、按钮等与题目无关的节点
                clone.querySelectorAll('button, .marking, .questionScore, .ans-cc, .analysis,'
                    + ' .Cy_ulTop, .Cy_ul, [data-html2canvas-ignore="true"]').forEach(node => node.remove());
                holder.appendChild(clone);
            });

            document.body.appendChild(holder);
            return { target: holder, cleanup: () => holder.remove() };
        }

        /**
         * 跨页面通信：发送指令/数据到豆包端
         * 依靠 GM 存储实现两页面数据互通，带目标标签页、消息 id 与超时看门狗
         * @param {object} data 要发送的对象：类型+内容
         * @param {string} okText 成功拿到接收回执前的提示文案
         */
        function sendSignal(data, okText) {
            const message = {
                ...data,
                ts: Date.now(),
                id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
                // 未绑定时为空，任意豆包页都可以接手；绑定后只投递给该标签页
                target: GM_getValue("cx_doubao_target", "")
            };
            pendingSignalId = message.id;
            GM_setValue("cx_ai_signal", message);

            const openState = openDoubaoIfNeeded();
            if (openState === "opened") {
                setStatus(`${okText}，正在打开豆包...`, "#007aff");
            } else if (openState === "cooldown") {
                setStatus(`${okText}，豆包刚开过，先等它加载`, "#ff9500");
            } else if (openState === "maybe") {
                setStatus(`${okText}，豆包页可能被冻结，切过去刷新一下`, "#ff9500");
            } else {
                setStatus(`${okText}，等待豆包接收...`, "#007aff");
            }

            // 豆包端没有回终态时不至于永远停在"已发送"
            clearTimeout(sendWatchdog);
            sendWatchdog = setTimeout(() => {
                if (pendingSignalId !== message.id) return;
                setStatus("豆包未响应，请检查豆包页面与绑定", "#ff3b30");
            }, ACK_TIMEOUT_MS);
        }

        /**
         * 监听豆包回传的处理状态
         */
        function listenAck() {
            onValueChange("cx_ai_ack", val => {
                if (!val || val.id !== pendingSignalId) return;
                if (val.state === "received") {
                    clearTimeout(sendWatchdog);
                    setStatus("豆包已接收，解析中...", "#007aff");
                } else if (val.state === "done") {
                    clearTimeout(sendWatchdog);
                } else if (val.state === "error") {
                    clearTimeout(sendWatchdog);
                    setStatus(`豆包端失败：${val.msg || "未知原因"}`, "#ff3b30");
                }
            });
        }

        /**
         * 监听豆包返回的答案并回填
         * 作业页：整页发送、按下标批量回填，不再自动翻页
         * 考试页：只回填当前可见题目，开关打开时自动点"下一题"（下一题仍需手动发送）
         */
        function listenAnswer() {
            onValueChange("cx_ai_result", (val, oldVal) => {
                // 无新数据 / 数据未变化，直接返回
                if (!val || val === oldVal) return;

                // 兼容两种载荷：{id, data} 对象，以及旧的 "JSON|_|唯一串" 字符串
                let payload = val;
                if (typeof val === "string") {
                    const [raw] = val.split("|_|");
                    payload = { id: "", data: raw };
                }
                // 过期答案：不是最近一次请求的应答就丢弃
                if (payload.id && pendingSignalId && payload.id !== pendingSignalId) return;

                let answers;
                try {
                    answers = normalizeAnswers(payload.data);
                } catch (e) {
                    setStatus("答案格式异常，已忽略", "#ff3b30");
                    return;
                }
                if (!answers.length) {
                    setStatus("未解析到答案", "#ff3b30");
                    return;
                }
                setStatus(`总答案数：${answers.length}`, "#007aff");

                // ---------- 作业页：整页回填，不做自动翻页 ----------
                if (!isExam()) {
                    const quesList = getAllQuestions();
                    let delay = 0;

                    answers.forEach((ans, idx) => {
                        const currentQues = quesList[idx];
                        if (!currentQues) return;

                        setTimeout(() => {
                            try {
                                if (skipFilled.checked && isQuestionAnswered(currentQues)) {
                                    setStatus(`第${idx + 1}题已作答，自动跳过`, "#34c759");
                                    return;
                                }
                                if (ans.intercept) {
                                    setStatus(`第${idx + 1}题无法作答，跳过`, "#ff9500");
                                    return;
                                }
                                fillAns(ans, currentQues);
                                setStatus(`第${idx + 1}题已填写`, "#007aff");
                            } catch (e) {
                                setStatus(`第${idx + 1}题填写失败，自动跳过`, "#ff3b30");
                            }
                        }, delay);
                        delay += 600;
                    });
                    return;
                }

                // ---------- 考试页：只处理当前可见题 ----------
                const curQ = getVisibleQuestion();
                if (!curQ) {
                    setStatus("未找到当前可见题目", "#ff3b30");
                    return;
                }
                if (answers.length > 1) {
                    setStatus(`收到 ${answers.length} 条，考试页仅用第 1 条`, "#ff9500");
                }
                const ans = answers[0];
                if (skipFilled.checked && isQuestionAnswered(curQ)) {
                    setStatus("当前题已作答，跳过", "#34c759");
                } else if (ans.intercept) {
                    setStatus("当前题无法作答，跳过", "#ff9500");
                } else {
                    try {
                        fillAns(ans, curQ);
                        setStatus("当前题已填写", "#34c759");
                    } catch (e) {
                        setStatus(`填写失败：${e.message}`, "#ff3b30");
                        return;
                    }
                }
                // 只有开关打开且确实翻页成功才继续，避免同一题被反复覆盖
                if (autoNextCheckbox.checked) {
                    setTimeout(() => {
                        if (nextQuestion()) setStatus("已切到下一题", "#007aff");
                    }, 1200);
                }
            });
        }

        /**
         * 把豆包返回的答案统一成数组
         * 兼容对象、数组、字符串三种形态（考试页单题常直接返回单个对象）
         * @param {*} raw
         * @returns {object[]}
         */
        function normalizeAnswers(raw) {
            let parsed = raw;
            if (typeof raw === "string") {
                parsed = JSON.parse(raw);
            }
            const list = Array.isArray(parsed) ? parsed : [parsed];
            return list.filter(item => item && typeof item === "object"
                && (item.type !== undefined || item.intercept));
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
                // 改为获取【外层选项容器】，事件绑定在父元素上
                const opts = block.querySelectorAll("div.answerBg");
                ansArr.forEach(target => {
                    opts.forEach(item => {
                        // 取内部的字母span
                        const span = item.querySelector("span.num_option, span.num_option_dx");
                        if(!span) return;
                        const realData = span.dataset.data?.trim();   // 后端真实提交值
                        const showText = span.textContent.trim();    // 页面展示字母

                        // 双向兼容：AI给【显示字母】 或 AI给【真实data值】都能匹配
                        if (realData === target || showText === target) {
                            // 只派发 click：学习通若同时绑了 mousedown 与 click，多发事件会把选项反选
                            item.click();
                            success = true;
                        }
                    });

                });
                if (!success) throw new Error("选项未找到");
            }
            // 题型 2填空 / 4简答 → 文本框/富文本编辑器赋值
            else if (["2", "4"].includes(type)) {
                // 填空题：按空顺序逐个填充，每个空的成功状态独立判断，避免前一个空掩盖后一个空失败
                if (type === "2") {
                    const textareaList = block.querySelectorAll('textarea[name^="answerEditor"]');
                    const failed = [];
                    // 按顺序遍历输入框和答案，一一对应填充
                    textareaList.forEach((ta, idx) => {
                        if (idx >= ansArr.length) return;
                        const content = ansArr[idx];
                        let ok = false;

                        // 优先使用学习通UE富文本编辑器赋值
                        if (win.UE && win.UE.getEditor) {
                            try {
                                const ed = win.UE.getEditor(ta.id);
                                ed.ready(function () {
                                    ed.setContent(content);
                                    ed.fireEvent?.("contentChange");
                                });
                                ok = true;
                            } catch (e) {
                                ok = false;
                            }
                        }
                        // 富文本失败 → 使用contenteditable普通富文本
                        if (!ok) {
                            const editDom = block.querySelector('[contenteditable="true"]');
                            if (editDom) {
                                editDom.innerText = content;
                                editDom.dispatchEvent(new Event("input", { bubbles: true }));
                                ok = true;
                            }
                        }
                        // 最后兜底：原生textarea直接赋值
                        if (!ok && ta) {
                            ta.value = content;
                            ta.dispatchEvent(new Event("input", { bubbles: true }));
                            ok = true;
                        }
                        if (!ok) failed.push(idx + 1);
                    });
                    if (failed.length) throw new Error(`第 ${failed.join("、")} 空赋值失败`);
                    success = true;
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
         * 点击【下一题】
         * 只在考试页生效；作业页整页发送后不翻页，避免误点"下一节/下一章"
         * @returns {boolean} 是否找到并点击了按钮
         */
        function nextQuestion() {
            if (!isExam()) return false;
            document.activeElement?.blur(); // 失焦当前输入框

            const pick = el => el && !el.disabled && !/下一(章|节)/.test(el.innerText || "");
            const explicit = document.querySelector(".nextBtn");
            if (pick(explicit)) {
                explicit.click();
                return true;
            }
            const btn = [...document.querySelectorAll("button,a")]
                .find(el => pick(el) && /下一题|下一道|下一頁/.test(el.innerText || ""));
            if (!btn) return false;
            btn.click();
            return true;
        }
    }
    // ===================== 学习通 答题端 逻辑结束 =====================


    // ===================== 豆包 AI 解析端 逻辑开始 =====================
    /**
     * 豆包页面初始化
     * 功能：创建悬浮按钮、监听学习通指令、自动抓取AI答案回传
     */
    function initDoubao() {
        if (document.querySelector('#db-panel')) return;
        // 等待页面完全加载再初始化
        if (document.readyState !== "complete") {
            window.addEventListener("load", initDoubao, { once: true });
            return;
        }
        let isWait = false;    // 是否正在等待AI回复
        let pollTimer;         // 轮询计时器（监听AI输出）
        let watchDog;          // 超时看门狗
        let statusDom;         // 状态文本容器
        let currentSignalId = ""; // 当前正在处理的信号 id，手动抓取时沿用

        // 标签页标识：sessionStorage 同标签页内跨地址保留，换成 /chat/<id> 也不会变
        let tabToken = "";
        try { tabToken = sessionStorage.getItem("cx_doubao_tab_token") || ""; } catch (e) { }
        if (!tabToken) {
            tabToken = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
            try { sessionStorage.setItem("cx_doubao_tab_token", tabToken); } catch (e) { }
        }

        // 识别当前地址里的对话号：/chat/<id>，用于自动绑定"专属豆包页"
        const getChatId = () => {
            const m = location.pathname.match(/\/chat\/([^/?#]+)/);
            return m ? m[1] : "";
        };

        const presenceKey = `${DOUBAO_PRESENCE_PREFIX}${tabToken}`;
        const updatePresence = () => {
            GM_setValue(presenceKey, { token: tabToken, url: location.href, chatId: getChatId(), updatedAt: Date.now() });
            if (GM_getValue("cx_doubao_target", "") !== tabToken) return;
            // 绑定在这个标签页时，同步更新"打开豆包"用的地址与对话号，避免地址变化后开到旧会话
            const chatId = getChatId();
            if (GM_getValue("cx_doubao_url", "") !== location.href) GM_setValue("cx_doubao_url", location.href);
            if (chatId && GM_getValue("cx_doubao_chat_id", "") !== chatId) GM_setValue("cx_doubao_chat_id", chatId);
        };

        /** 把当前标签页登记为专属豆包页（自动绑定/接手都走这里） */
        const claimBinding = () => {
            GM_setValue("cx_doubao_target", tabToken);
            GM_setValue("cx_doubao_url", location.href);
            GM_setValue("cx_doubao_bound_at", Date.now());
            const chatId = getChatId();
            GM_setValue("cx_doubao_chat_id", chatId || "");
        };

        let bindingNotice = "";   // 初始化时给用户的绑定提示
        try {
            const target0 = GM_getValue("cx_doubao_target", "");
            const chatIdNow = getChatId();
            if (!target0) {
                // 没绑过：能在地址里读到对话号，就直接认这一页，不需要手动绑
                if (chatIdNow) {
                    claimBinding();
                    bindingNotice = "已自动绑定当前会话";
                }
            } else if (target0 !== tabToken) {
                const ownerChat = GM_getValue("cx_doubao_chat_id", "");
                if (!anotherDoubaoTabAlive()) {
                    // 原绑定标签页已经不在了 → 本页接手，仍然是"只记一次"的绑定
                    claimBinding();
                    bindingNotice = "已接手上次绑定";
                } else if (chatIdNow && ownerChat === chatIdNow) {
                    bindingNotice = "该会话已由另一标签页接管";
                }
            }
        } catch (e) { }

        updatePresence();
        const presenceTimer = setInterval(updatePresence, 5000);
        window.addEventListener("pagehide", () => {
            clearInterval(presenceTimer);
            GM_deleteValue(presenceKey);
        }, { once: true });

        // 切换回这个标签页且它已是真实会话、又没有别的豆包页活着时，顺手接管绑定
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState !== "visible" || !getChatId()) return;
            if (GM_getValue("cx_doubao_target", "") === tabToken || anotherDoubaoTabAlive()) return;
            claimBinding();
            setSta("已自动绑定当前会话", "#34c759");
        });

        // 创建右下角悬浮面板
        createPanel();
        if (bindingNotice) setSta(bindingNotice, bindingNotice.startsWith("已") ? "#34c759" : "#ff9500");
        // 监听学习通发来的指令（文字/图片/初始化）
        listenMsg();

        /**
         * 是否还有别的豆包标签页在心跳（用于判断绑定是否该被本页接手）
         * @returns {boolean}
         */
        function anotherDoubaoTabAlive() {
            const now = Date.now();
            let alive = false;
            GM_listValues().forEach(key => {
                if (!key.startsWith(DOUBAO_PRESENCE_PREFIX)) return;
                const page = GM_getValue(key, null);
                if (!page || typeof page.updatedAt !== "number") return;
                if (page.token !== tabToken && now - page.updatedAt < PRESENCE_STALE_MS) alive = true;
            });
            return alive;
        }
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
                .db-settings { position: relative; }
                .db-settings-menu {
                    position: absolute; right: 0; bottom: calc(100% + 10px); width: 210px;
                    padding: 12px; background: white; border: 1px solid #e5e5e5;
                    border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,0.14);
                    display: flex; flex-direction: column; gap: 8px; cursor: default;
                }
                .db-settings-menu[hidden] { display: none; }
                .db-settings-menu .db-btn { width: 100%; }
            `;
            document.head.appendChild(style);
            const p = document.createElement("div");
            p.id = "db-panel";
            p.className = "db-apple-panel";
            p.innerHTML = `
                <span id="dbSta" class="db-status-dot" style="color:#007aff">● 待命</span>
                <button id="catch-btn" class="db-btn db-btn-primary">手动抓取</button>
                <div class="db-settings">
                    <button id="db-settings-btn" class="db-btn" title="设置" aria-label="设置" aria-expanded="false">⚙</button>
                    <div id="db-settings-menu" class="db-settings-menu" hidden>
                        <span id="bind-status" style="font-size:11px;color:#515154"></span>
                        <button id="bindBtn" class="db-btn">绑定当前页</button>
                        <button id="unbindBtn" class="db-btn">清除绑定</button>
                    </div>
                </div>
            `;
            document.body.appendChild(p);
            // 赋予面板拖拽与吸附能力 (默认出现在右下角附近)
            makeElementDraggableAndSnappable(p, "db_panel_pos", { bottom: '24px', right: '24px' });
            statusDom = document.getElementById("dbSta");
            const settingsButton = document.getElementById("db-settings-btn");
            const settingsMenu = document.getElementById("db-settings-menu");
            settingsButton.onclick = () => {
                refreshBindingStatus();
                settingsMenu.hidden = !settingsMenu.hidden;
                settingsButton.setAttribute("aria-expanded", String(!settingsMenu.hidden));
            };
            const bindingDom = document.getElementById("bind-status");
            const refreshBindingStatus = () => {
                const target = GM_getValue("cx_doubao_target", "");
                const chatId = GM_getValue("cx_doubao_chat_id", "");
                const suffix = chatId ? ` #${chatId.slice(0, 8)}` : "";
                if (!target) {
                    bindingDom.textContent = "未绑定（识别到会话后自动绑定）";
                } else if (target === tabToken) {
                    bindingDom.textContent = `已绑定此会话${suffix}（长期沿用）`;
                } else {
                    bindingDom.textContent = `其他豆包页持有绑定${suffix}`;
                }
            };
            refreshBindingStatus();
            // 手动兜底：需要换页时点一次即可，正常情况识别到会话号就会自动绑定
            document.getElementById("bindBtn").onclick = () => {
                claimBinding();
                refreshBindingStatus();
                setSta("已绑定当前会话", "#34c759");
            };
            document.getElementById("unbindBtn").onclick = () => {
                GM_setValue("cx_doubao_target", "");
                GM_setValue("cx_doubao_url", "");
                GM_setValue("cx_doubao_chat_id", "");
                GM_deleteValue("cx_doubao_bound_at");
                refreshBindingStatus();
                setSta("已清除绑定");
            };
            // 手动抓取答案按钮
            document.getElementById('catch-btn').onclick = () => doCatchAnswer();
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
         * 获取豆包新版输入框DOM (Tiptap contenteditable div)
         * @returns {HTMLElement|null} 输入框元素
         */
        function getInputBox() {
            return document.querySelector('div.tiptap.ProseMirror[contenteditable="true"]');
        }
        /**
         * 【新版适配】向contenteditable富文本框写入文本，触发编辑器更新事件
         * @param {HTMLElement} el 输入框div
         * @param {string} txt 要写入的内容
         * @returns {boolean} 是否写入成功
         */
        function writeText(el, txt) {
            if (!el) return false;
            el.focus();

            // 方案1：走原生插入命令，ProseMirror 会把它当成真实输入，换行也会变成段落
            try {
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(el);
                sel.removeAllRanges();
                sel.addRange(range);
                if (document.execCommand("insertText", false, txt) && el.innerText.trim()) {
                    moveCaretToEnd(el);
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                    return true;
                }
            } catch (e) { }

            // 方案2：按段落写入，保留原有换行语义
            el.innerHTML = txt.split("\n")
                .map(line => `<p>${escapeHtml(line) || "<br>"}</p>`)
                .join("");
            moveCaretToEnd(el);
            // 派发输入事件通知编辑器内容变更
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            return !!el.innerText.trim();
        }

        /**
         * 光标移到内容末尾（Tiptap 必须，否则发送按钮大概率灰掉不可点击）
         */
        function moveCaretToEnd(el) {
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        /**
         * HTML 转义，避免题目里的尖括号被当成标签
         */
        function escapeHtml(str) {
            return String(str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
        }
        /**
         * 获取新版豆包发送按钮（纸飞机图标按钮）
         * @returns {HTMLElement|null} 发送按钮
         */
        function getSendBtn() {
            return document.querySelector('button[aria-label="send"]')
            || document.querySelector('button[aria-label="发送"]')
            || document.getElementById("flow-end-msg-send");
        }
        /**
         * 监听学习通发来的指令信号
         */
        function listenMsg() {
            const receiveSignal = val => {
                if (!val) return;
                try {
                    const data = typeof val === "string" ? JSON.parse(val) : val;
                    if (!data.id) return;
                    // 大体一致：有绑定就只认绑定的标签页，没绑定任何豆包页都能接手
                    const target = GM_getValue("cx_doubao_target", "");
                    if (target && target !== tabToken) return;
                    const consumed = GM_getValue("cx_ai_signal_consumed", null);
                    if (consumed && consumed.id === data.id && Date.now() - (consumed.at || 0) < SIGNAL_FRESH_MS) return;
                    GM_setValue("cx_ai_signal_consumed", { id: data.id, at: Date.now(), token: tabToken });
                    // 能收到信号本身就是"这个页面还活着"的证据，供学习通端判断不要重复开页
                    GM_setValue("cx_doubao_last_active", Date.now());
                    handleMsg(data);
                } catch (e) { }
            };
            onValueChange("cx_ai_signal", val => receiveSignal(val));

            // 新打开的豆包页接收刚才触发自动打开的消息，忽略过期或已处理消息。
            const pending = GM_getValue("cx_ai_signal", "");
            try {
                const data = typeof pending === "string" ? JSON.parse(pending) : pending;
                if (data && data.id && Date.now() - data.ts < SIGNAL_FRESH_MS) receiveSignal(data);
            } catch (e) { }
        }
        /**
         * 回写处理状态，让学习通端能区分"已收到/已完成/失败"
         */
        function ack(id, state, msg = "") {
            if (!id) return;
            GM_setValue("cx_ai_ack", { id, state, msg, ts: Date.now() });
            GM_setValue("cx_doubao_last_active", Date.now());
        }

        /**
         * 处理学习通发来的指令：初始化规则 / 文字题目 / 图片题目
         * @param {object} data 指令对象
         */
        async function handleMsg(data) {
            const signalId = data.id || "";
            currentSignalId = signalId;
            isWait = true;
            ack(signalId, "received");
            // 全局60秒超时，防止无限等待
            clearTimeout(watchDog);
            watchDog = setTimeout(() => {
                isWait = false;
                clearInterval(pollTimer);
                setSta("超时重置", "#ff3b30");
                ack(signalId, "error", "等待 AI 回复超时");
            }, 60000);
            const input = getInputBox();
            if (!input) {
                isWait = false;
                setSta("无输入框", "#ff3b30");
                ack(signalId, "error", "未找到豆包输入框");
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
3.判断题{"type":"3","answer":["页面上的选项标签"]}
页面选项显示“正确/错误”时，answer填写“正确”或“错误”；页面选项显示“A/B”时，填写对应字母。必须按当前题目实际显示的选项作答，不要自行把正确/错误映射到固定字母。
4.填空题{"type":"2","answer":["第1空内容","第2空内容","第3空内容"]}
重要规则：一题存在多个填空时，按题目从上到下空的顺序依次填写，一个空对应数组一个元素
示例：两空题目 {"type":"2","answer":["3","4"]}
5.简答题{"type":"4","answer":["作答文字"]}
简答内容禁止直接换行，如需换行统一使用HTML <p> 标签
示例：{"type":"4","answer":["<p>第一行内容</p><p>第二行内容</p>"]}
6.无法作答、手写绘图、图片模糊、超纲题目统一返回{"intercept":true}
硬性要求：
- 硬性规则：所有文件路径禁止使用反斜杠 \\，一律改用正斜杠 /，禁止出现未转义反斜杠，避免JSON格式错误。
- 一题对应一条独立JSON，多题按顺序组合为数组
- 只保留标准JSON字符，不要表情、序号、额外说明文字
- 严格区分题型type值，不要混用
- 多空填空必须严格按照空的先后顺序排列答案数组，数量与空数量一致`;
                ok = writeText(input, rule);
            }
            // 2. 图片题目：Base64转图片，调用页面原生文件上传控件（彻底规避paste双监听）
            else if (data.type === "img") {
                setSta("识别图片");
                let ok = false;
                try {
                    // 分割base64字符串，切掉data:image/png;base64,前缀
                    const [_, b64] = data.data.split(",");
                    // base64解码成原始二进制字符串
                    const buf = atob(b64);
                    // 将二进制字符串逐个转为字符编码数字数组
                    const arr = [...buf].map(c => c.charCodeAt(0));
                    // 构建图片File对象
                    const file = new File([new Uint8Array(arr)], "q.png", { type: "image/png" });
                    // 1. 找到加号下拉按钮，固定 SVG path 只是首选，失败时按 aria-label 与 aria-haspopup 兜底
                    const plusBtn = document.querySelector('button[aria-haspopup="menu"] svg path[d*="M12.0005 2.25"]')?.closest("button")
                        || [...document.querySelectorAll('button[aria-haspopup="menu"]')]
                            .find(b => /上传|附件|upload|attach/i.test(b.getAttribute("aria-label") || ""))
                        || document.querySelector('button[aria-haspopup="menu"]');
                    if (!plusBtn) {
                        setSta("找不到加号按钮", "#ff3b30");
                        ack(signalId, "error", "未找到加号按钮，豆包界面可能已改版");
                        isWait = false;
                        return;
                    }
                    // 点击加号，打开下拉菜单，渲染隐藏file input
                    plusBtn.click();
                    // 等待菜单DOM渲染完成，轮询带 8 秒超时，避免永久挂起
                    const fileInput = await new Promise(resolve => {
                        const start = Date.now();
                        const poll = setInterval(() => {
                            const fi = document.querySelector('input[type="file"][multiple]')
                                || document.querySelector('input[type="file"]');
                            if (fi) {
                                clearInterval(poll);
                                resolve(fi);
                            } else if (Date.now() - start > 8000) {
                                clearInterval(poll);
                                resolve(null);
                            }
                        }, 100);
                    });
                    if (!fileInput) {
                        setSta("未找到文件上传input", "#ff3b30");
                        ack(signalId, "error", "上传菜单未出现");
                        isWait = false;
                        return;
                    }
                    // 构造DataTransfer装入图片
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    fileInput.files = dt.files;
                    // 触发change事件，触发豆包原生上传逻辑
                    fileInput.dispatchEvent(new Event("change", { bubbles: true }));

                    // =========轮询等待图片全部上传完毕=========
                    await new Promise(resolve => {
                        const start = Date.now();
                        const timer = setInterval(() => {
                            const uploading = document.querySelectorAll('[data-uploading="true"]');
                            const timeout = Date.now() - start > 6000;
                            if (uploading.length === 0 || timeout) {
                                clearInterval(timer);
                                if (timeout) setSta("图片上传超时，尝试发送");
                                resolve(true);
                            }
                        }, 200);
                    });
                    ok = true; // 所有图片就绪后，才标记ok
                } catch (e) {
                    console.error("图片上传异常", e);
                    setSta("图片处理异常", "#ff3b30");
                    ack(signalId, "error", "图片处理异常");
                }
                // 图片分支单独处理发送，不再走外层的ok判断！
                if(ok){
                    const sendBtn = getSendBtn();
                    if (sendBtn) {
                        sendBtn.disabled = false;
                        // 改用MouseEvent派发事件适配radix按钮
                        const clickEvt = new MouseEvent("click", {bubbles:true,cancelable:true});
                        sendBtn.dispatchEvent(clickEvt);
                        ack(signalId, "done");
                        setSta("解析中...");
                        startCatch(signalId);
                    } else {
                        isWait = false;
                        setSta("发送失败", "#ff3b30");
                        ack(signalId, "error", "未找到发送按钮");
                    }
                }else{
                    isWait = false;
                    setSta("录入失败", "#ff3b30");
                    ack(signalId, "error", "图片录入失败");
                }
                return;
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
                ack(signalId, "error", "题目文字写入失败");
                return;
            }
            // 延迟点击发送，模拟人工操作
            setTimeout(() => {
                const sendBtn = getSendBtn();
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.click();
                    ack(signalId, "done");
                    setSta("解析中...");
                    // 启动轮询，等待AI输出答案
                    startCatch(signalId);
                } else {
                    isWait = false;
                    setSta("发送失败", "#ff3b30");
                    ack(signalId, "error", "未找到发送按钮");
                }
            }, 1500);
        }
        /**
         * 手动抓取AI答案，并回传给学习通
         * @param {string} signalId 对应的信号 id，回传时带上便于学习通端配对
         * @returns {boolean} 抓取是否成功
         */
        function doCatchAnswer(signalId = currentSignalId) {
            const target = GM_getValue("cx_doubao_target", "");
            if (target && target !== tabToken) {
                setSta("请先在设置中绑定当前标签页", "#ff3b30");
                return false;
            }
            setSta("抓取中...", "#ff9500");
            const texts = recentMessageTexts();
            if (!texts.length) {
                setTimeout(() => setSta("未找见消息", "#ff3b30"), 400);
                return false;
            }
            if (deliverAnswer(texts, signalId)) return true;
            setTimeout(() => setSta("未找到有效JSON", "#ff3b30"), 400);
            return false;
        }

        /**
         * 最新一条消息文本
         * 只取最后一条：AI 尚未回复时最后一条是本条提问，不能回退到上一条旧答案
         * @returns {string[]} 最多一个元素的数组
         */
        function recentMessageTexts() {
            const nodes = [...document.querySelectorAll('div[data-message-id]')];
            const last = nodes[nodes.length - 1];
            const txt = last ? last.innerText.trim() : "";
            return txt ? [txt] : [];
        }

        /**
         * 从一段文本里提取最可能的答案 JSON
         * 用括号配平定位，而不是贪婪正则，避免跨段拼出非法 JSON
         * @param {string} text 消息文本
         * @returns {string} 合法的 JSON 字符串，找不到返回空串
         */
        function extractAnswerJson(text) {
            let best = "";
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (ch !== "[" && ch !== "{") continue;
                let depth = 0, inStr = false, esc = false, end = -1;
                for (let j = i; j < text.length; j++) {
                    const c = text[j];
                    if (inStr) {
                        if (esc) esc = false;
                        else if (c === "\\") esc = true;
                        else if (c === '"') inStr = false;
                        continue;
                    }
                    if (c === '"') { inStr = true; continue; }
                    if (c === "[" || c === "{") depth++;
                    else if (c === "]" || c === "}") {
                        depth--;
                        if (depth === 0) { end = j; break; }
                    }
                }
                if (end < 0) continue;
                const candidate = text.slice(i, end + 1);
                try {
                    const value = JSON.parse(candidate);
                    const list = Array.isArray(value) ? value : [value];
                    if (!list.length) continue;
                    const valid = list.every(item => item && typeof item === "object"
                        && (item.type !== undefined || item.intercept));
                    if (valid && candidate.length > best.length) best = candidate;
                } catch (e) { }
            }
            return best;
        }

        /**
         * 把提取到的答案回传学习通
         * @returns {boolean} 是否回传成功
         */
        function deliverAnswer(texts, signalId) {
            for (const txt of texts) {
                const resStr = extractAnswerJson(txt);
                if (!resStr) continue;
                GM_setValue("cx_ai_result", { id: signalId || "", data: resStr, ts: Date.now() });
                isWait = false;
                clearInterval(pollTimer);
                clearTimeout(watchDog);
                setSta("已传答案", "#34c759");
                ack(signalId, "done");
                return true;
            }
            return false;
        }

        /**
         * 自动轮询监听AI输出，稳定后自动抓取答案
         * 解析失败不终止轮询，直到看门狗超时，避免长答案被截断后直接判死
         */
        function startCatch(signalId = currentSignalId) {
            clearInterval(pollTimer);
            let lastTxt = "";
            let stable = 0;   // 内容稳定计数器
            let attempted = ""; // 已经尝试解析过的内容，避免对同一份内容反复重试
            // 每400毫秒轮询一次消息
            pollTimer = setInterval(() => {
                const texts = recentMessageTexts();
                if (!texts.length) return;
                const nowTxt = texts[0];
                // 内容连续不变 → 判断AI输出完成
                if (nowTxt === lastTxt) {
                    stable++;
                    if (stable >= 4 && nowTxt !== attempted) {
                        attempted = nowTxt;
                        if (!deliverAnswer(texts, signalId)) {
                            setSta("等待完整 JSON...", "#ff9500");
                        }
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
