// ==UserScript==
// @name        RNG request picker.
// @description Pick random request.
// @version     0.1.1
// @author      noccu
// @namespace   https://github.com/noccu
// @match       https://boards.4channel.org/a/*
// @grant       none
// ==/UserScript==

'use strict';

const posts = document.getElementsByClassName("post reply");
const highlightColor = "#07a874";
const reSearch = /request/i;

function pickRandom() {
    let requests = Array.prototype.filter.call(posts, p => {
        if (Array.prototype.find.call(p.children, c => c.className == "file") && reSearch.test(p.lastElementChild.textContent)) {
            return true;
        }
    })
    let chosenPost = requests[Math.floor(Math.random() * requests.length)];
    chosenPost.scrollIntoView();
    highlight(chosenPost);
}

function highlight (post) {
    post.style.backgroundColor = highlightColor;
    setTimeout(() => {
        post.style.backgroundColor = "";
    }, 500);
}

let css = document.createElement("style");
css.innerHTML = "div.post {transition: background-color 0.5s}";
document.head.appendChild(css);

document.addEventListener("keydown", e => {
    if (e.key == "w" && e.altKey) {
        pickRandom();
    }
});