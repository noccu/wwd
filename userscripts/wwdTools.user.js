// ==UserScript==
// @name         4chanX thread utils
// @namespace    https://github.com/noccu
// @version      1.4.2
// @description  Bump limit notify, post marker, signup enabler, custom text highlighting.
// @author       noccu
// @match        https://boards.4chan.org/*/thread/*
// @match        https://boards.4channel.org/*/thread/*
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    //Settings
    GM_registerMenuCommand("Settings", settingsDialog);
    var signupMatch; //A regexp to notify when matched.
    var postHighlight; //Add custom highlight regexp.
    const signupColor = "#1a68e9";
    const signupBorder = "6px solid #1a68e9";
    const highlightcolor = "#63a21b";
    const highlightBorder = "6px solid #63a21b";
    const defaultNotifyState = false;
    var autoMarkSignups = true;
    var autoMarkOwnImagePosts = true;

    //Global
    const threadId = location.pathname.match(/\/(\d+)/)[1];
    const LIST = {};
    var postCount,
        threadEnded = false;
    var markedPosts,
        lastMarked,
        listUI,
        scriptSettings;
    

    function notify(title, text) {
        if (Notification.permission == "granted") {
            new Notification(title, {body: text});
        }
    }
    function getThreadData () {
        let data = document.title.match(/^(?:\((\d+)\) )?(\/.+\/) - (.*?) -/);
        return {thread: data[3], board: data[2], newPosts: data[1]}
    }
    function settingsDialog() {
        if (scriptSettings) {
            loadSettings(scriptSettings);
            scriptSettings.hidden = !scriptSettings.hidden;
        }
        else {
            scriptSettings = document.createElement("div");
            scriptSettings.id = "wwdTools-settings";
            scriptSettings.innerHTML = `
                <input type="checkbox" id="wwdTools-autoSignup" style="margin-left: 0;">
                <label for="wwdTools-autoSignup">Auto mark signups</label>
                <input type="checkbox" id="wwdTools-autoOwnImg" style="margin-left: 0;">
                <label for="wwdTools-autoOwnImg">Auto mark own image posts</label>
                <div id="wwdTools-re-signup">Signup regex: <textarea style="width: 40em; height: 10em;"></textarea></div>
                <div id="wwdTools-re-highlight">Highlight regex: <textarea style="width: 40em; height: 3em;"></textarea></div>
                <button data-save="x">Save</button>
                <button data-cancel="x">Cancel</button>
            `;
            loadSettings(scriptSettings);
            scriptSettings.addEventListener("click", e => {
                if (e.target.dataset.save) {
                    saveSettings();
                    settingsDialog()
                }
                else if (e.target.dataset.cancel) {
                    settingsDialog()
                }
            });
            document.body.appendChild(scriptSettings);
        }
    }
    function saveSettings() {
        let data = {
            autoMarkSignups: scriptSettings.children.namedItem("wwdTools-autoSignup").checked,
            autoMarkOwnImagePosts: scriptSettings.children.namedItem("wwdTools-autoOwnImg").checked,
            signupRe: scriptSettings.children.namedItem("wwdTools-re-signup").firstElementChild.value,
            highlightRe: scriptSettings.children.namedItem("wwdTools-re-highlight").firstElementChild.value
        };
        if (!data) {
            console.error("Aborting save: no data");
            return
        };
        setSettings(data);
        localStorage.setItem("wwdTools", JSON.stringify(data));
    }
    function loadSettings(e) {
        if (e) {
            e.children.namedItem("wwdTools-autoSignup").checked = autoMarkSignups;
            e.children.namedItem("wwdTools-autoOwnImg").checked = autoMarkOwnImagePosts;
            if (signupMatch) e.children.namedItem("wwdTools-re-signup").firstElementChild.value = signupMatch.source;
            if (postHighlight) e.children.namedItem("wwdTools-re-highlight").firstElementChild.value = postHighlight.source;
        }
        
        else {
            let cfg = localStorage.getItem("wwdTools");
            if (cfg) {
                cfg = JSON.parse(cfg);
                setSettings(cfg);
            }
        }
    }
    function setSettings(options) {
        autoMarkSignups = options.autoMarkSignups || autoMarkSignups;
        autoMarkOwnImagePosts = options.autoMarkOwnImagePosts || autoMarkOwnImagePosts;
        signupMatch = options.signupRe ? new RegExp(options.signupRe, "im") : undefined;
        postHighlight = options.highlightRe ? new RegExp(options.highlightRe, "im") : undefined;
    }

    //Bump limit notify
    function checkThreadEnd() {
        if (!postCount) {
            postCount = document.getElementById("post-count");
        }
        if (!threadEnded && parseInt(postCount.textContent) > 500) {
            let data = getThreadData();
            notify("Thread has reached bump limit!", `${data.thread} on ${data.board}\nNew posts: ${data.newPosts || 0}`);
            threadEnded = true;
        }
    }

    //Post marker
    function createList () { 
        listUI = document.createElement("div");
        listUI.id = "pm-list";

        markedPosts = document.createElement("div");
        markedPosts.id = "pm-entry-list"
        markedPosts.onclick = function (ev) {
            if (ev.target.isUnmark) {
                delete LIST[ev.target.postID];
                ev.target.entry.remove();
                if (!Object.keys(LIST)) { listUI.hidden = true }
                saveList();
            }
        };
        listUI.appendChild(markedPosts);

        let clearList = document.createElement("button");
        clearList.textContent = "Clear list";
        clearList.onclick = function () {
            listUI.hidden = true;
            markedPosts.innerHTML = "";
            LIST = {};
            saveList();
        };
        listUI.appendChild(clearList);
        listUI.hidden = true;

        document.body.appendChild(listUI);
    }
    function saveList() {
        let data = localStorage.getItem("markedPosts");
        if (data) {
            data = JSON.parse(data);
            for (let thread in data) {
                if (Date.now() - data[thread].date > 604800000) { // a week
                    delete data[thread];
                }
            }
        }
        else { data = {} } // new

        data[threadId] = {
            date: Date.now(),
            posts: LIST,
            lastMarked
        }
        localStorage.setItem("markedPosts", JSON.stringify(data));
    }
    function loadList() {
        let data = localStorage.getItem("markedPosts");
        if (data) { data = JSON.parse(data) }
        else { return }

        let thread = data[threadId];
        if (thread) {
            createList();
            lastMarked = thread.lastMarked || 0;
            let posts = thread.posts;
            for (let postId in posts) {
                markPost(posts[postId], postId, true);
            }
        }
    }
    function createMarkButton (id) {
        let e = document.createElement("span");
        e.className = "pm-mark";
        e.textContent = "Mark this post";
        e.isMarkButton = true;
        e.postID = id;
        return e;
    }
    function addMarkButton (post) {
        let info = post.getElementsByClassName("postInfo")[0];
        let btn = createMarkButton(info.firstElementChild.name);
        info.children[3].insertAdjacentElement("afterend", btn);
        post.markBtnAdded = true;
        return btn;
    }
    function markPost (blurb, id, load) {
        if (!listUI) createList();
        if (listUI.hidden) listUI.hidden = false;
        let entry = document.createElement("div");

        let li = document.createElement("a");
        li.textContent = blurb;
        li.href = `#p${id}`;

        let unmark = document.createElement("span");
        unmark.textContent = " X";
        unmark.className = "pm-unmark"
        unmark.isUnmark = true;
        unmark.entry = entry;
        unmark.postID = id;

        entry.appendChild(li);
        entry.appendChild(unmark);
        markedPosts.appendChild(entry);
        LIST[id] = blurb;
        if (!load) {
            id = parseInt(id);
            if (id > lastMarked) lastMarked = id;
            saveList();
        }
    }
    function listen (ev) {
        if ((ev.target.isMarkButton || ev.target.className == "pm-mark")) {
            let id = ev.target.postID || ev.target.parentElement.firstElementChild.name;
            if (!LIST[id]) {
                if (ev.autoAdd && parseInt(id) <= lastMarked) return;
                let m = document.getElementById(`m${id}`);
                markPost(m.textContent.slice(0,40), id);
            }
        }
    }
    function injectCSS () {
        let css = document.createElement("style");
        css.type = "text/css";

        css.innerHTML = `
            #pm-list {
                position: fixed;
                right: 2em;
                top: 4em;
                background-color: inherit;
            }
            .pm-mark {
                cursor: pointer;
                margin: 0 0.5em;
                text-decoration: underline;
                color: rgb(88, 93, 152);
            }
            .pm-unmark {
                color: darkred;
                font-weight: bold;
                cursor: pointer;
            }
            #pm-entry-list {
                margin: 0.3em;
            }
            .markSignup .post {
                border-left: ${signupBorder} !important;
            }
            .markHighlight .post {
                border-left: ${highlightBorder} !important;
            }
            .markSignup .hlTxt {
                color: ${signupColor};
            }
            .markHighlight .hlTxt {
                color: ${highlightcolor};
            }
            #wwdTools-settings {
                position: fixed;
                top: 50%;
                left: 50%;
                background-color: inherit;
                padding: 1rem;
                transform: translate(-50%, -50%);
                line-height: 2;
            }
        `;
        document.head.appendChild(css);
    }
    function handlePosts (records, cgfNotify = true) {
        checkThreadEnd();
        for (let r of records) {
            for (let node of r.addedNodes) {
                //Add "mark" button to new posts.
                if (node.classList.contains("postContainer")) {
                    let markBtn;
                    if (!node.markBtnAdded) {
                        markBtn = addMarkButton(node);
                    }

                    if (node.classList.contains("yourPost")) {
                        if (autoMarkOwnImagePosts && node.querySelector(".file")) {
                            listen({target: markBtn, autoAdd: true});
                        }
                    }
                    else { // Ignore your own posts
                        //Check if it's a signup and notify accordingly.
                        let post = node.getElementsByClassName("postMessage")[0],
                            postTxt = post.innerText,
                            match;
                        if (signupMatch && (match = postTxt.match(signupMatch))) {
                            let data = getThreadData();
                            if (cgfNotify) notify(`Signup in ${data.thread}!`, postTxt);
                            node.classList.add("markSignup");
                            post.innerHTML = post.innerHTML.replace(match, `<span class="hlTxt">${match}</span>`);
                            if (autoMarkSignups && markBtn) listen({target: markBtn, autoAdd: true});
                        }

                        //Check for custom highlights
                        else if (postHighlight){
                            match = postTxt.match(postHighlight);
                            if (match) {
                                let data = getThreadData();
                                if (cgfNotify) notify(`${match[0]} mentioned in ${data.thread}!`, postTxt.textContent);
                                node.classList.add("markHighlight");
                                post.innerHTML = post.innerHTML.replace(match, `<span class="hlTxt">${match[0]}</span>`);
                            }
                        }
                    }
                }
            }
        }
    }

    injectCSS();
    loadList();
    loadSettings();
    //export for testing.
    window.wwdToolsCheckThread = function (notify = defaultNotifyState) {
        let t = document.getElementsByClassName("thread")[0];
        if (t) {
            handlePosts([{addedNodes: t.children}], notify);
        }
        return t;
    }
    let t = wwdToolsCheckThread();
    if (t) {
        t.addEventListener("click", listen);
        let OBSERVER = new MutationObserver(handlePosts);
        OBSERVER.observe(t, {childList: true});
    }
})();
