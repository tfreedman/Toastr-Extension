var browserUrl = "";

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

function toast(parentSelector, data) {
  const div = document.createElement('div');
  var epoch_timestamp = new Date(0);
  epoch_timestamp.setUTCSeconds(data.created_at);

  div.innerHTML = `
    <div class="toast">
      <header>
        <img class="avatar" src="${data.avatar_url}" />
        <div>
          <div class="username">${data.username}</div>
          <span class="created_at"><time datetime="${epoch_timestamp}">Posted on ${epoch_timestamp.toLocaleDateString()}</time></span>
        </div>

      </header>
      <span class="caption">${data.message}</span>
    </div>
  `

  const parentNode = document.querySelector(parentSelector);
  parentNode.appendChild(div)
}

initSqlJs(config).then(function(SQL){
  console.log("Hello from the background script!");
  function importToast(value, index, array) {
    console.log(value);

    var note = JSON.stringify(value);

    var taggedUrl = '';
    value["tags"].forEach((tag) => {
      if (tag[0] == "r" && tag[1].toLowerCase().startsWith('http')) {
        taggedUrl = tag[1];
      }
    });

    const url = new URL(taggedUrl);
    var domain = url.hostname.toLowerCase();
    
    console.log('url: ' + taggedUrl);
    console.log('domain: ' + domain);
    
    console.log('Inserting ' + value['id'] + ' into DB...');
    db.run("INSERT OR IGNORE INTO toasts (id, created_at, domain, url, pubkey, kind, note) VALUES (?, ?, ?, ?, ?, ?, ?)", [value['id'], value['created_at'], domain, taggedUrl, value['pubkey'], value['kind'], note]);
  }

  function importNote(value, index, array) {
    console.log(value);
    var note = JSON.stringify(value);

    console.log(note);
    if (value['kind'] == 0) {
      var existing_note = db.exec("SELECT * FROM notes WHERE pubkey = ? AND kind = 0", [value['pubkey']]).length
      if (length == 0) {
        console.log('Inserting ' + value['id'] + ' into DB...');
        db.run("INSERT INTO notes (id, created_at, pubkey, kind, note) VALUES (?, ?, ?, ?, ?)", [value['id'], value['created_at'], value['pubkey'], value['kind'], note]);
      } else {
        console.log('Updating ' + value['id'] + ' into DB...');
        db.run("UPDATE notes SET id = ? created_at = ?, kind = ?, note = ? WHERE pubkey = ? AND created_at < ?)", [value['id'], value['created_at'], value['kind'], note, value['pubkey'], value['created_at']]);
      }
    } else {
      console.log('Not inserting ' + value['id'] + ' into DB - not a valid kind 0 event'); // Worry about non-kind 0 stuff later
    }
  }

  var dbstr = window.localStorage.getItem("toastr.sqlite");

  if (dbstr) {
    var db = new SQL.Database(toBinArray(dbstr));
  } else {
    var db = new SQL.Database();
    db.run("CREATE TABLE IF NOT EXISTS toasts (id TEXT NOT NULL PRIMARY KEY, created_at INTEGER NOT NULL, domain TEXT NOT NULL, url TEXT NOT NULL, pubkey TEXT NOT NULL, kind INTEGER NOT NULL, note TEXT NOT NULL);");
    db.run("CREATE TABLE IF NOT EXISTS notes (id TEXT NOT NULL PRIMARY KEY, created_at INTEGER NOT NULL, pubkey TEXT NOT NULL, kind INTEGER NOT NULL, note TEXT NOT NULL);");
    db.run("CREATE INDEX idx_toasts_domain ON toasts (domain);")
  }

  var dbstr = toBinString(db.export());
  window.localStorage.setItem("toastr.sqlite", dbstr);
  window.db = db;

  if (typeof browser !== "undefined") {
    // Firefox Extension
    window.browserExtension = true;

    browser.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      var tabURL = tabs[0].url;
      console.log("TabURL is " + tabURL);
      document.querySelector('#debugger input[name="url"]').value = tabURL;
      browserUrl = tabURL;
    });    

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === "getToasts") {

        const url = new URL(message.url);
        var domain = url.hostname.toLowerCase();

        console.log("getToasts URL is " + message.url);

        const stmt = db.prepare("SELECT * FROM toasts WHERE domain = $domain");
        stmt.bind({$domain: domain});
      
        var rows = [];
        // Bind new values
        while(stmt.step()) {
          const row = stmt.getAsObject();
          rows.push(JSON.stringify(row));     
        }
    
        sendResponse({ total: db.exec("SELECT COUNT(*) from toasts;")[0].values[0][0], domain_count: rows.length});
      }
    });
  } else {
    // Not a browser extension
    window.browserExtension = false;
  }

	console.log("Cached Notes: " + db.exec("SELECT COUNT(*) FROM notes")[0].values[0][0]);
  console.log("Cached Toasts: " + db.exec("SELECT COUNT(*) FROM toasts WHERE kind = 1")[0].values[0][0]);
  const stmt = db.prepare("SELECT * FROM toasts");

  var rows = [];
  // Bind new values
  while(stmt.step()) {
//    const row = stmt.getAsObject();
//    rows.push(JSON.stringify(row));
  }

  // Start Nostr connections

  var sk = localStorage.getItem('privkey');
  var pk;

  if (typeof window.nostr !== 'undefined') {
    // Detected NIP-07 support
    document.querySelector('#debugger input[name="privkey"]').value = "NIP-07 supported - using browser keys";
    document.querySelector('#debugger input[name="privkey"]').disabled = true;
    window.nostr.getPublicKey().then(pubKey => {
      pk = pubKey;
    })
  } else if (sk === null) {
    document.querySelector('#debugger input[name="privkey"]').value = window.NostrTools.nip19.nsecEncode(window.NostrTools.generateSecretKey());
    localStorage.setItem("privkey", document.querySelector('#debugger input[name="privkey"]').value);
    sk = Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data);
    pk = window.NostrTools.getPublicKey(sk);
  } else {
    sk = Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data);
    document.querySelector('#debugger input[name="privkey"]').value = localStorage.getItem('privkey');
    pk = window.NostrTools.getPublicKey(sk);
  }

  document.querySelector('#debugger input[name="privkey"]').addEventListener("change", function() {
    pk = window.NostrTools.getPublicKey(sk) // `pk` is a hex string
  });

  var default_relays = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol", "wss://relay.snort.social"];
  var relays;
  var override_relays = true;

  if (override_relays) {
    var relays = ["wss://toastr.tylerfreedman.com"] //"wss://relay.primal.net", "wss://nos.lol"]
    document.querySelector('#debugger input[name="relays"]').value = 'Overriding NIP-07 Relays for debugging purposes';
    document.querySelector('#debugger input[name="relays"]').disabled = true;
  } else {
    if (typeof window.nostr !== 'undefined') {
      // Detected NIP-07 support
      window.nostr.getRelays().then(r => {
        var relayString = "";
        Object.entries(r).forEach(([key, value]) => {
          if (relayString != "") {
            relayString += ",";
          }
          relayString += key;
        });
        relays.push(key);
        document.querySelector('#debugger input[name="relays"]').value = relayString;
      })
    } else {
      relays = default_relays;
    }
    document.querySelector('#debugger input[name="relays"]').value = default_relays;
    document.querySelector('#debugger input[name="relays"]').addEventListener("change", function() {
      relays = document.querySelector('#debugger input[name="relays"]').value.split(',');
    });
  }

  window.pool = new window.NostrTools.SimplePool()
  var dirty = false;

  document.querySelector('#debugger input[name="privkey"]').disabled = true;

  let h = window.pool.subscribeMany(
    relays,[
      {kinds: [1], '#t': "toastr"}
    ],
    {
      onevent(event) {
        if (event && event.pubkey && event.content && event.kind == 1 && window.NostrTools.verifyEvent(event, event.pubkey)) {
          importToast(event);
          dirty = true;
        }
      },
      oneose() {
        if (dirty) {
     			var dbstr = toBinString(window.db.export());
          window.localStorage.setItem("toastr.sqlite", dbstr);
        }
        console.log('EOSE on toasts - Calling fetchAuthorInfo...')
        fetchAuthorInfo();
        //h.close()
      }
    }
  )

  function fetchAuthorInfo() {
    var users = {};
    var userPubkeys = [];
    var dirty = false;

    var stmt = db.prepare("SELECT * FROM notes WHERE kind = 0");
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      users[event.pubkey] = event;
      userPubkeys.push(event.pubkey)
    }

    let h = pool.subscribeMany(
      relays,[
        {kinds: [0], authors: userPubkeys}
      ],
      {
        onevent(event) {
          if (event && event.pubkey && event.kind == 0) {
            importNote(event);
            dirty = true;
          }
        },
        oneose() {
          if (dirty) {
            var dbstr = toBinString(window.db.export());
            window.localStorage.setItem("toastr.sqlite", dbstr);
          }
          drawToasts(users);
          //h.close()
        }
      }
    )
  }

  function drawToasts(knownUsers) {
    console.log("Drawing Toasts!");
    var users = {}
    var stmt = db.prepare("SELECT * FROM notes WHERE kind = 0");
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      users[event.pubkey] = event;
    }

    if (window.browserExtension) {
      const url = new URL(browserUrl);
      var domain = url.hostname.toLowerCase();

      console.log("Filtering to domain name " + domain);
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND domain = $domain");
      stmt.bind({$domain: domain});
    } else {
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1");
    }
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      var username = '';
      var avatar_url = '';
      if (users[event.pubkey]) {
        var user = JSON.parse(users[event.pubkey].content);
        avatar_url = user.picture;
        username = user.name;
        console.log('Using custom profile image: ' + avatar_url);
      }
      else {
        avatar_url = '201.png'
        username = 'Unknown';
      }
      toast('.toasts', { username: username + ' (' + event.pubkey + ')', message: event.content, avatar_url: avatar_url, created_at: event.created_at})
    }
  }

  function uploadNote(data, note) {
    console.log("Sending " + JSON.stringify(note));
    Promise.any(window.pool.publish(relays, note)).then(relay => {
      toast('.toasts', {username: 'Unknown', message: note.content, avatar_url: 0, created_at: Date.now() / 1000})
      data.reset();
    });
  }

  document.querySelector('.toast-new-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var data = this;
    data.url.value = document.querySelector('#debugger input[name="url"]').value || window.location.href;

    if (typeof window.nostr !== 'undefined') {
      // NIP07 supported
      window.nostr.signEvent({ created_at: Math.floor(Date.now() / 1000), kind: 1, tags: [['r', data.url.value], ['t', 'toastr']], content: data.message.value }).then(note => {
        console.log("signed note via nip07: " + note);
        uploadNote(data, note);
      })
    } else {
    // NIP07 unsupported
      var note = window.NostrTools.finalizeEvent({
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['r', data.url.value], ['t', 'toastr']],
        content: data.message.value,
      }, sk)
      console.log("signed note without nip07: " + note);
      uploadNote(data, note);
      }
  });
});
