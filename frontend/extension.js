"use strict";

if (typeof browser !== "undefined") {
  // Firefox Extension
  console.log("Browser Extension!");
  browser.runtime.sendMessage({ action: "getToasts", url: window.location.href }, response => {
    console.log("Toastr DB Rows (total): " + response.total + ", Toastr DB Rows (domain): " + response.domain_count);
    if (response.domain_count >= 1) {
      //document.body.style.borderTop = "5px solid #cb0031";
    }
  });
} else {
  // Not a browser extension
  console.log("Website!");
}
