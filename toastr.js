config = {
  locateFile: filename => browser.extension.getURL(filename)
}

// The `initSqlJs` function is globally provided by all of the main dist files if loaded in the browser.
// We must specify this locateFile function if we are loading a wasm file from anywhere other than the current html page's folder.
initSqlJs(config).then(function(SQL){
  //Create the database
  const db = new SQL.Database();
  // Run a query without reading the results
  db.run("CREATE TABLE IF NOT EXISTS toasts (id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL, domain TEXT NOT NULL, url TEXT NOT NULL, username TEXT NOT NULL, message TEXT NOT NULL, note TEXT);");

  /*let url = 'https://toastr.tylerfreedman.com/toasts';

  fetch(url)
  .then(res => res.json())
  .then(out =>
    console.log('Checkout this JSON! ', out))
  .catch(err => console.log(err));

*/

  window.db = db;

  var toasts = [{"id":1,"domain":"google.com","url":"https://google.com","username":"Oshawott","message":"Wub Wub!","note":null,"timestamp":1},{"id":2,"domain":"www.mozilla.org","url":"https://www.mozilla.org","username":"Fuecoco","message":"Wub Wub!","note":null,"timestamp":2}];
  toasts.forEach(importSQL);

  function importSQL(value, index, array) {
    //console.log(value);
    db.run("INSERT INTO toasts (id, timestamp, domain, url, username, message, note) VALUES (?, ?, ?, ?, ?, ?, ?)", [value['id'], value['timestamp'], value['domain'], value['url'], value['username'], value['message'], value['note']]);
  }

  // Prepare a statement
  const stmt = db.prepare("SELECT * FROM toasts WHERE domain = $domain");
  stmt.bind({$domain: window.location.hostname});

  // Bind new values
  while(stmt.step()) {
    const row = stmt.getAsObject();
    console.log('Matching Rows: ' + JSON.stringify(row));

    window.alert(row['message'] + ' - ' + row['username']);

    /*
    const toast = document.createElement("div");
    const message = document.createTextNode(row['message']);
    message.appendChild(newContent);
    const currentDiv = document.getElementById("div1");
    document.body.insertBefore(newDiv, currentDiv);*/
   
  }
});

document.body.style.border = "5px solid red";
