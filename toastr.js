"use strict";

browser.runtime.sendMessage({ action: "getToasts", domain: window.location.hostname }, response => {
  console.log("Toastr DB Rows (total): " + response.total + ", Toastr DB Rows (domain): " + response.count);
  if (response.count >= 0) {
    document.body.style.border = "5px solid red";
    //toast('.toasts', {username: element.username, message: element.message, avatar_url: element.avatar_url, timestamp: element.timestamp, replies: element.replies, zaps: element.zaps, likes: element.likes, reposts: element.reposts})
  }
});

function toast(parentSelector, data) {
  const div = document.createElement('div');

  var epoch_timestamp = new Date(0);
  epoch_timestamp.setUTCSeconds(data.timestamp);

  div.innerHTML = `
    <div class="toast">
      <header>
        <img class="avatar" src="${data.avatar_url}" />
        <div>
          <div class="username">${data.username}</div>
          <span class="timestamp"><time datetime="${epoch_timestamp}">Posted on ${epoch_timestamp.toLocaleDateString()}</time></span>
        </div>

      </header>
      <span class="caption">${data.message}</span>
      <footer>
        <span class="replies">
          <a href="#"><img class="reply" /> ${data.replies}</a>
        </span>
        <span class="zaps">
          <a class="zap" href="#"><img class="zap" /> ${data.zaps}</a>
        </span>
        <span class="likes">
          <a class="like" href="#"><img class="like" /> ${data.likes}</a>
        </span>
        <span class="reposts">
          <a class="repost" href="#"><img class="repost" /> ${data.reposts}</a>
        </span>
      </footer>
    </div>
  `

  const parentNode = document.querySelector(parentSelector);
  parentNode.appendChild(div)
}

document.addEventListener('DOMContentLoaded', function() {
  document.querySelector('.toast-new-form').addEventListener('submit', function (event) {
    var data = this;
    var element = Object.fromEntries(new FormData(data))
    fetch(data.getAttribute('action'), {
      method: data.getAttribute('method'),
      body: new FormData(data)
    }).then(res=>res.json())
    .then(out => {
        data.reset();
        toast('.toasts', {username: element.username, message: element.message, avatar_url: element.avatar_url, timestamp: Date.now() / 1000, replies: element.replies, zaps: element.zaps, likes: element.likes, reposts: element.reposts})
      }
    );
    event.preventDefault();
  });
});