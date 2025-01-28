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

initSqlJs(config).then(function(SQL){
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

    var domain = ''.toLowerCase(); // TODO: get domain from R value
    
    console.log(note);

    console.log('Inserting ' + value['id'] + ' into DB...');
    db.run("INSERT OR IGNORE INTO toasts (id, created_at, domain, url, pubkey, kind, note) VALUES (?, ?, ?, ?, ?, ?, ?)", [value['id'], value['created_at'], domain, taggedUrl, value['pubkey'], value['kind'], note]);
  }

  function importNote(value, index, array) {
    console.log(value);
    var note = JSON.stringify(value);

    console.log(note);
    if (value['kind'] == 0) {
      console.log('Inserting ' + value['id'] + ' into DB...');
      db.run("INSERT OR IGNORE INTO notes (id, created_at, pubkey, kind, note) VALUES (?, ?, ?, ?, ?)", [value['id'], value['created_at'], value['pubkey'], value['kind'], note]);
    } else {
      console.log('Not inserting ' + value['id'] + ' into DB - not a valid kind 0 event');
    }
  }

  var dbstr = window.localStorage.getItem("toastr.sqlite");

  if (dbstr) {
    var db = new SQL.Database(toBinArray(dbstr));
  } else {
    var db = new SQL.Database();
    db.run("CREATE TABLE IF NOT EXISTS toasts (id TEXT NOT NULL PRIMARY KEY, created_at INTEGER NOT NULL, domain TEXT NOT NULL, url TEXT NOT NULL, pubkey TEXT NOT NULL, kind INTEGER NOT NULL, note TEXT NOT NULL);");
    db.run("CREATE TABLE IF NOT EXISTS notes (id TEXT NOT NULL PRIMARY KEY, created_at INTEGER NOT NULL, domain TEXT NOT NULL, url TEXT NOT NULL, pubkey TEXT NOT NULL, kind INTEGER NOT NULL, note TEXT NOT NULL);");
  }

  var dbstr = toBinString(db.export());
  window.localStorage.setItem("toastr.sqlite", dbstr);
  window.db = db;

	console.log("Cached Notes: " + db.exec("SELECT COUNT(*) FROM toasts")[0].values[0][0]);
  console.log("Cached Toasts: " + db.exec("SELECT COUNT(*) FROM toasts WHERE kind = 0")[0].values[0][0]);
  const stmt = db.prepare("SELECT * FROM toasts");

  var rows = [];
  // Bind new values
  while(stmt.step()) {
//    const row = stmt.getAsObject();
//    rows.push(JSON.stringify(row));
      console.log('OHAI');
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

  window.toasts = [];
  window.users = {};

  document.querySelector('#debugger input[name="privkey"]').disabled = true;

  let h = pool.subscribeMany(
    relays,[
      {kinds: [0, 1], '#t': "toastr"}
    ],
    {
      onevent(event) {
        if (event && event.pubkey && event.kind == 0) {
          //window.users[event.pubkey] = event;
        }
        if (event && event.pubkey && event.content && event.kind == 1 && window.NostrTools.verifyEvent(event, event.pubkey)) {
          window.toasts.push(event);
        }
      },
      oneose() {
        window.toasts.forEach((event) => {
          importToast(event);
        });
        //window.users.forEach((event) => {
        //  importNote(event);
        //});
   			var dbstr = toBinString(window.db.export());
        window.localStorage.setItem("toastr.sqlite", dbstr);
        drawToasts();
        //h.close()
      }
    }
  )

  function drawToasts(toasts) {
    console.log("Drawing Toasts!");
    const stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1");
    var rows = [];
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      var username = '';
      var avatar_url = '';
      if (window.users[event.pubkey]) {
        var user = JSON.parse(window.users[event.pubkey].content);
        avatar_url = user.picture;
        username = user.name;
        console.log('Using custom profile image: ' + avatar_url);
      }
      else {
        avatar_url = '201.png'
        username = event.pubkey;
      }
      toast('.toasts', { username: username + ' (' + event.pubkey + ')', message: event.content, avatar_url: avatar_url, created_at: event.created_at, replies: 0, zaps: 0, likes: 0, reposts: 0 })
    }
  }

  function uploadNote(data, note) {
    console.log("Sending " + JSON.stringify(note));
    Promise.any(window.pool.publish(relays, note)).then(relay => {
      toast('.toasts', {username: 'Unknown (nostr)', message: note.content, avatar_url: 0, created_at: Date.now() / 1000, replies: 0, zaps: 0, likes: 0, reposts: 0})
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
        tags: [['r', data.url.value]],
        content: data.message.value,
      }, sk)
      console.log("signed note without nip07: " + note);
      uploadNote(data, note);
      }
  });
});
