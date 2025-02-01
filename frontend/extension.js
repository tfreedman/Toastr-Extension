"use strict";

if (typeof browser !== "undefined") {
  // Firefox Extension
  console.log("Browser Extension!");
  browser.runtime.sendMessage({ action: "getToasts", domain: window.location.hostname }, response => {
    console.log("Toastr DB Rows (total): " + response.total + ", Toastr DB Rows (domain): " + response.count);
    if (response.count >= 0) {
      document.body.style.border = "5px solid red";
      //toast('.toasts', {username: element.username, message: element.message, avatar_url: element.avatar_url, timestamp: element.timestamp, replies: element.replies, zaps: element.zaps, likes: element.likes, reposts: element.reposts})
    }
  });

  function openPage() {
    browser.tabs.create({
      url: "https://developer.mozilla.org",
    });
  }
  
  browser.browserAction.onClicked.addListener(openPage);
  
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getToasts") {
      console.log();
  
      const stmt = db.prepare("SELECT * FROM toasts WHERE domain = $domain");
      stmt.bind({$domain: message.domain});
    
      var rows = [];
      // Bind new values
      while(stmt.step()) {
        const row = stmt.getAsObject();
        rows.push(JSON.stringify(row));     
      }
  
      sendResponse({ total: db.exec("SELECT COUNT(*) from toasts;")[0].values[0][0], count: rows.length});
    }
  });
} else {
  // Not a browser extension
  console.log("Website!");
}
