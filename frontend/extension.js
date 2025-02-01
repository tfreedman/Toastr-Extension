"use strict";

if (typeof browser !== "undefined") {
  // Firefox Extension
  console.log("Browser Extension!");
  browser.runtime.sendMessage({ action: "getToasts", domain: window.location.hostname }, response => {
    console.log("Toastr DB Rows (total): " + response.total + ", Toastr DB Rows (domain): " + response.domain_count);
    if (response.domain_count >= 1) {
      document.body.style.border = "5px solid red";
      // TODO: Change extension icon to match
    }
  });
} else {
  // Not a browser extension
  console.log("Website!");
}