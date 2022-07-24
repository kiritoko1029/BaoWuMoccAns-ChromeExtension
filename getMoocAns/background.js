const crTabs = chrome.tabs;
const crCookies = chrome.cookies;
let lastActiveInfo;
//监听激活的标签页
crTabs.onActivated.addListener((activeInfo) => {
    console.log('激活', activeInfo);
    handel(activeInfo);
})
//监听新创建的标签页
crTabs.onCreated.addListener((activeInfo) => {
    handel(activeInfo);
    console.log('创建', activeInfo);
})

function handel(activeInfo) {
    //根据tabId获得标签页跟详细的信息
    crTabs.get(activeInfo.tabId).then((tab) => {
        const url = new URL(tab.url === '' ? tab.pendingUrl : tab.url);
        const b = '/es/index_exam.html';
        if (url.hash.startsWith('#/course')) {
            lastActiveInfo = {tabId: activeInfo.tabId};
        }
        if (url.pathname === b) {
            console.log('进入考试页面')
            // 为什么不用在考试页面进行js注入?
            // 1是考试页面无法打开控制台，2是考试页面注入js可能会导致考试页面无法正常显示
            executeJs(lastActiveInfo.tabId, getParams(url.href), getExamId(url.href))
        }
    })
}

//examId在url两个/之间
function getExamId(url) {
    return url.split("//")[1].split('/')[4]
}

//获取url上的param参数
function getParams(url) {
    const res = {}
    if (url.includes('?')) {
        const str = url.split('?')[1]
        const arr = str.split('&')
        arr.forEach(item => {
            const key = item.split('=')[0]
            const val = item.split('=')[1]
            res[key] = decodeURIComponent(val) // 解码
        })
    }
    return res
}

//执行插件中注入的js代码
function executeJs(tabId, params, examId) {
    chrome.scripting.executeScript({
        target: {tabId: tabId},
        func: jsFun,
        args: [params, examId]
    }, () => {
        console.log('jsFun加载完成')
    })
}

//封装js，注意，这段代码是在目的页面执行的，而不是在插件内部
function jsFun(params, examId) {
    const promise = fetch('http://mooc.baosteel.com/exam/api/admin/teacher/examPaperDetail/H', {
        method: 'POST',
        credentials: 'include',
        headers: {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json, text/javascript"},
        body: `id=${params.jid}&exam_id=${examId}`
    }).then((response) => {
        return response.json();
    });
    promise.then((res) => {
        //答案集
        let result = [];
        //答案选项和答案之间的映射
        let sqRes = {}
        //解析答案 sq：single question；mq：multiple question，sc：single choice，mc：multiple choice
        const {examAnswer} = res.data.answer;
        const {que_list: sq} = res.data.userPaper.part_list[1];
        const {que_list: mq} = res.data.userPaper.part_list[2]
        const ansMap = {
            0: 'A',
            1: 'B',
            2: 'C',
            3: 'D',
            4: 'E',
            5: 'F',
        }
        for (let i = 0; i < sq.length; i++) {
            const ol = sq[i].opion_list;
            for (let j = 0; j < ol.length; j++) {
                sqRes[ol[j].op_id] = ansMap[j];
            }
        }
        for (let i = 0; i < mq.length; i++) {
            const ol = mq[i].opion_list;
            for (let j = 0; j < ol.length; j++) {
                sqRes[ol[j].op_id] = ansMap[j];
            }
        }
        for (let i in examAnswer) {
            if (examAnswer[i].base_type === 'JQ') {
                result[i] = examAnswer[i].content === 'T' ? '正确' : '错误';
            }
            if (examAnswer[i].base_type === 'SC') {
                result[i] = sqRes[examAnswer[i].content];
            }
            if (examAnswer[i].base_type === 'MC') {
                let tempList = [];
                for (let j = 0; j < examAnswer[i].content.length; j++) {
                    tempList.push(sqRes[examAnswer[i].content[j]]);
                }
                result[i] = tempList;
            }
        }
        console.log(result);
        //注入的js代码往插件发送消息
        chrome.runtime.sendMessage("kecopgnkmoemcnibilimjlblnhcmjppk", result)
    }).catch((error) => {
        console.log(error)
    })
}

//插件监听收到消息
chrome.runtime.onMessage.addListener((message, sender, _) => {
    console.log(message)
})