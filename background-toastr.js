browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getToasts") {
    console.log();
    sendResponse({ toasts: "Toastr DB Rows: " + db.exec("SELECT COUNT(*) from toasts;")[0].values[0][0] });
  }
});

config = {
  locateFile: filename => `${filename}`
}

function toBinArray(str) {
  var l = str.length,
    arr = new Uint8Array(l);
  for (var i = 0; i < l; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

function toBinString(arr) {
  var uarr = new Uint8Array(arr);
  var strings = [], chunksize = 0xffff;
  // There is a maximum stack size. We cannot call String.fromCharCode with as many arguments as we want
  for (var i = 0; i * chunksize < uarr.length; i++) {
    strings.push(String.fromCharCode.apply(null, uarr.subarray(i * chunksize, (i + 1) * chunksize)));
  }
  return strings.join('');
}

initSqlJs(config).then(function(SQL){
  function importSQL(value, index, array) {
    //console.log(value);
    db.run("INSERT INTO toasts (id, timestamp, domain, url, username, message, note) VALUES (?, ?, ?, ?, ?, ?, ?)", [value['id'], value['timestamp'], value['domain'], value['url'], value['username'], value['message'], value['note']]);
  }

  var dbstr = window.localStorage.getItem("toastr.sqlite");

  if (dbstr) {
    var db = new SQL.Database(toBinArray(dbstr));
  } else {
    var db = new SQL.Database();
    db.run("CREATE TABLE IF NOT EXISTS toasts (id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL, domain TEXT NOT NULL, url TEXT NOT NULL, username TEXT NOT NULL, message TEXT NOT NULL, note TEXT);");
  }

  let url = 'https://toastr.tylerfreedman.com/toasts';
  fetch(url)
  .then(res => res.json())
  .then(out =>
    out.forEach(importSQL)
  )
  .catch(err => console.log(err));

  var dbstr = toBinString(db.export());
  window.localStorage.setItem("toastr.sqlite", dbstr);
  window.db = db;
});