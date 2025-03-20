var currentURL = "";
var users = {};
var pubKey;

config = {
  locateFile: filename => `${filename}`
}

function setExtensionIcon(tab) {
   const u = new URL(currentURL);
   var domain = u.hostname.toLowerCase();

  const stmt = window.db.prepare("SELECT * FROM toasts WHERE domain = $domain");
  stmt.bind({$domain: domain});

  var rows = [];
  // Bind new values
  while(stmt.step()) {
    const row = stmt.getAsObject();
    rows.push(JSON.stringify(row));
  }

  console.log("Setting Extension! @ " + currentURL);
  if(rows.length > 0) {
    console.log("Toasting Icon");
    browser.browserAction.setIcon({
      path: {
        '16': "icons/toast_16.png",
        '32': "icons/toast_32.png",
        '64': "icons/toast_64.png",
    }, tabId: tab.id});
  } else {
    console.log("Untoasting Icon");
    browser.browserAction.setIcon({
      path: {
        '16': "icons/bread_16.png",
        '32': "icons/bread_32.png",
        '64': "icons/bread_64.png",
    }, tabId: tab.id});
  }
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

function setProfile(pubKey) {
  if (pubKey !== undefined) {
    window.pubKey = pubKey;
    document.querySelector('#profile input[name="pubkey"]').value = pubKey;
    document.querySelector('#profile input[name="pubkey"]').disabled = true;
    document.querySelector('#profile input[name="npub"]').value = window.NostrTools.nip19.npubEncode(pubKey);
    document.querySelector('#profile input[name="npub"]').disabled = true;
  
    document.querySelector('#profile button').addEventListener('click', updateProfile);

    console.log(pubKey);

    console.log("Users length: " + Object.keys(window.users).length);

    if (window.users[pubKey] !== undefined) {
      console.log("There's profile data!");
      var profile = JSON.parse(window.users[pubKey].content);
      if (profile.name !== undefined) {
        document.querySelector('#profile input[name="name"]').value = profile.name;
      }
      if (profile.displayName !== undefined) {
        document.querySelector('#profile input[name="display_name"]').value = profile.displayName;
      }
      if (profile.website !== undefined) {
        document.querySelector('#profile input[name="website"]').value = profile.website;
      }
      if (profile.banner !== undefined) {
        document.querySelector('#profile input[name="banner"]').value = profile.banner;
      }
      if (profile.picture !== undefined) {
        document.querySelector('#profile input[name="picture"]').value = profile.picture;
      }
      console.log(users[pubKey]);
    } else {
      console.log("No profile data :(");
    }
  }
}

function updateProfile() {
  var content = {};
  var name = document.querySelector('#profile input[name="name"]').value
  var displayName = document.querySelector('#profile input[name="display_name"]').value
  var website = document.querySelector('#profile input[name="website"]').value
  var banner = document.querySelector('#profile input[name="banner"]').value
  var picture = document.querySelector('#profile input[name="picture"]').value

  if (name.length > 0) {content.name = name}
  if (displayName.length > 0) {content.displayName = displayName}
  if (website.length > 0) {content.website = website}
  if (banner.length > 0) {content.banner = banner}
  if (picture.length > 0) {content.picture = picture}
  if (typeof window.nostr !== 'undefined') {
    // NIP07 supported
    window.nostr.signEvent({
      created_at: Math.floor(Date.now() / 1000),
       kind: 0,
       tags: [],
       content: JSON.stringify(content)
    }).then(event => {
      console.log("signed event via nip07: " + event);
      uploadProfileEvent(event);
    })
  } else {
  // NIP07 unsupported
    var event = window.NostrTools.finalizeEvent({
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(content),
    }, sk)
    console.log("signed event without nip07: " + event);
    uploadProfileEvent(event);
  }
}

function uploadProfileEvent(note) {
  console.log("Sending " + JSON.stringify(note));
  Promise.any(window.pool.publish(relays, note)).then(relay => {
    console.log("Uploaded kind 0 event")
  });
}

function newToastSubmit(event) {
  event.preventDefault();
  var data = event.target;

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
}

function uploadNote(data, note) {
  console.log("Sending " + JSON.stringify(note));
  Promise.any(window.pool.publish(relays, note)).then(relay => {
    var avatar_url = '';
    if (window.users[note.pubkey]) {
      var user = JSON.parse(users[note.pubkey].content);
      avatar_url = user.picture;
      username = user.name;
    }
    else {
      avatar_url = '201.png'
      username = 'Unknown';
    }
    toast('.toasts', {username: 'Unknown', pubkey: note.pubkey, message: note.content, avatar_url: avatar_url, created_at: Date.now() / 1000})
    data.reset();
  });
}

function toast(parentSelector, data) {
  const div = document.createElement('div');
  div.classList.add('toast');
  var epoch_timestamp = new Date(0);
  epoch_timestamp.setUTCSeconds(data.created_at);

  div.innerHTML = `
    <header>
      <img class="avatar" src="${data.avatar_url}" />
      <div class="left">
        <div class="username">${data.username}</div>
        <div class="pubkey">${data.pubkey}</div>
      </div>

      <div class="right">
        <span class="created_at"><time datetime="${epoch_timestamp}">${epoch_timestamp.toLocaleString()}</time></span>
      </div>

    </header>
    <span class="caption">${data.message}</span>
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
    
    console.log('Inserting ' + value['id'] + ' into DB...');
    db.run("INSERT OR IGNORE INTO toasts (id, created_at, domain, url, pubkey, kind, note) VALUES (?, ?, ?, ?, ?, ?, ?)", [value['id'], value['created_at'], domain, taggedUrl, value['pubkey'], value['kind'], note]);
  }

  function importNote(value, index, array) {
    var note = JSON.stringify(value);
    if (value['kind'] == 0) {
      var existing_note = db.exec("SELECT * FROM notes WHERE pubkey = ? AND kind = 0", [value['pubkey']]).length
      if (length == 0) {
        console.log('Inserting ' + value['id'] + ' into DB...');
        window.users[value['pubkey']] = value;
        if (value['pubkey'] == window.pubKey) {
          setProfile(window.pubKey);
        }
        db.run("INSERT INTO notes (id, created_at, pubkey, kind, note) VALUES (?, ?, ?, ?, ?)", [value['id'], value['created_at'], value['pubkey'], value['kind'], note]);
        console.log('Adding ' + value['pubkey'] + ' to window.users...');
      } else {
        console.log('Updating ' + value['id'] + ' into DB...');
        window.users[value['pubkey']] = value;
        if (value['pubkey'] == window.pubKey) {
          setProfile(window.pubKey);
        }
        db.run("UPDATE notes SET id = ? created_at = ?, kind = ?, note = ? WHERE pubkey = ? AND created_at < ?)", [value['id'], value['created_at'], value['kind'], note, value['pubkey'], value['created_at']]);
        console.log('Adding ' + value['pubkey'] + ' to window.users...');
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

    browser.tabs.onActivated.addListener( function(activeInfo){
      browser.tabs.get(activeInfo.tabId, function(tab){
        currentURL = tab.url;
        setExtensionIcon(tab);
      });
    });

    browser.tabs.onUpdated.addListener((tabId, change, tab) => {
      if (tab.active && change.url) {
        currentURL = change.url;
        setExtensionIcon(tab);
      }
    });

    browser.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      var tabURL = tabs[0].url;
      console.log("TabURL is " + tabURL);
      currentURL = tabURL;
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
    document.querySelector('#profile input[name="privkey"]').value = "NIP-07 supported - using browser keys";
    document.querySelector('#profile input[name="privkey"]').disabled = true;
    window.nostr.getPublicKey().then(pubKey => {
      setProfile(pubKey);
      return pubKey;
    })
  } else if (sk === null) {
    document.querySelector('#profile input[name="privkey"]').value = window.NostrTools.nip19.nsecEncode(window.NostrTools.generateSecretKey());
    localStorage.setItem("privkey", document.querySelector('#profile input[name="privkey"]').value);
    sk = Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data);
    pk = window.NostrTools.getPublicKey(sk);
  } else {
    sk = Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data);
    document.querySelector('#profile input[name="privkey"]').value = localStorage.getItem('privkey');
    pk = window.NostrTools.getPublicKey(sk);
  }

  document.querySelector('#profile input[name="privkey"]').addEventListener("change", function() {
    pk = window.NostrTools.getPublicKey(sk) // `pk` is a hex string
  });

  var default_relays = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol", "wss://relay.snort.social"];
  var override_relays = true;

  if (override_relays) {
    var relays = ["wss://toastr.tylerfreedman.com"] //"wss://relay.primal.net", "wss://nos.lol"]
    document.querySelector('#relays input[name="relays"]').value = 'Overriding NIP-07 Relays for debugging purposes';
    document.querySelector('#relays input[name="relays"]').disabled = true;
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
        document.querySelector('#relays input[name="relays"]').value = relayString;
      })
    } else {
      relays = default_relays;
    }
    document.querySelector('#relays input[name="relays"]').value = default_relays;
    document.querySelector('#relays input[name="relays"]').addEventListener("change", function() {
      relays = document.querySelector('#relays input[name="relays"]').value.split(',');
    });
  }

  window.pool = new window.NostrTools.SimplePool()
  window.relays = relays;

  var dirty = false;

  document.querySelector('#profile input[name="privkey"]').disabled = true;

  if (pk) {
    setProfile(pk);
  }

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
    var userPubkeys = [];
    var dirty = false;

    // Get the public keys of everyone who's written a toast
    var stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1");
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      userPubkeys.push(event.pubkey)
    }

    console.log("userPubkeys: " + userPubkeys);

    let h = window.pool.subscribeMany(
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
          if (window.browserExtension) {
            drawToasts(window.users, "url");
            document.querySelectorAll('#toastr nav a').forEach(l => {
              if (l.dataset.mode == "url") {
                l.classList.add("active");
              }
            });
          } else {
            drawToasts(window.users, "all");
            document.querySelectorAll('#toastr nav a').forEach(l => {
              if (l.dataset.mode == "all") {
                l.classList.add("active");
              }
            });
          }
          
          //h.close()
        }
      }
    )
  }

  function drawToasts(knownUsers, mode) {
    console.log("Drawing Toasts! - Mode = " + mode);
    document.querySelectorAll('#toastr .toasts-loading')[0].classList.add("active");
    document.querySelectorAll('#toastr .toasts')[0].innerHTML = '';
    var users = {}
    var stmt = db.prepare("SELECT * FROM notes WHERE kind = 0");
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      users[event.pubkey] = event;
    }

    if (!window.browserExtension) {
      currentURL = window.location.href;
    }

    console.log("CurrentURL: " + currentURL);

    if (currentURL.slice(-1) == '#') {
      currentURL = currentURL.substring(0, currentURL.length - 1);
    }

    const url = new URL(currentURL);
    var domain = url.hostname.toLowerCase();

    var emptyMsg = '';
    var oldHeading = '';
    var oldSubHeading = '';

    if (mode == "site") {
      console.log("Filtering to domain name " + domain);
      emptyMsg = "Sorry, there are no toasts for the domain " + domain;
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND domain = $domain");
      stmt.bind({$domain: domain});
    } else if (mode == "all") {
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1");
      emptyMsg = "Sorry, there are no toasts";
    } else if (mode == "url") {
      console.log("Filtering to URL " + currentURL);
      emptyMsg = "Sorry, there are no toasts for URL " + currentURL;
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND url = $url");
      stmt.bind({$url: currentURL});
    } else if (mode == "site") {
      console.log("Filtering to URL " + currentURL);
      emptyMsg = "Sorry, there are no toasts for URL " + currentURL;
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND url = $url");
      stmt.bind({$url: currentURL});
    }

    var count = 0;

    var row;
    var lastRow;

    while(stmt.step()) {
      row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      count += 1;
      var username = '';
      var avatar_url = '';
      if (users[event.pubkey]) {
        var user = JSON.parse(users[event.pubkey].content);
        avatar_url = user.picture;
        username = user.name;
      }
      else {
        avatar_url = '201.png'
        username = 'Unknown';
      }
      var newHeading = row.domain;
      var newSubHeading = row.url.split(row.domain, 2)[1];

      if (oldHeading != newHeading) {
        const parentNode = document.querySelector('.toasts');
        if (count > 1) {
          newToast(".toasts", lastRow.url);
        }

        const heading = document.createElement('h2');
        heading.innerHTML = `<a href="https://${newHeading}">${newHeading}:</a>`

        parentNode.appendChild(heading);
        oldHeading = newHeading;
      }

      if (oldSubHeading != newSubHeading) {
        const heading = document.createElement('h3');
        heading.innerHTML = `<a href="https://${newSubHeading}">${newSubHeading}:</a>`

        const parentNode = document.querySelector('.toasts');
        parentNode.appendChild(heading);
        oldSubHeading = newSubHeading;
      }

      toast('.toasts', {username: username, pubkey: event.pubkey, message: event.content, avatar_url: avatar_url, created_at: event.created_at})
      lastRow = row;
    }

    if (count == 0) {
      document.querySelectorAll('#toastr .toasts-empty')[0].classList.add("active");
      document.querySelectorAll('#toastr .toasts')[0].innerHTML = emptyMsg;
    } else {
      document.querySelectorAll('#toastr .toasts-empty')[0].classList.remove("active");
      newToast(".toasts", row.url);
    }
    document.querySelectorAll('#toastr .toasts-loading')[0].classList.remove("active");
  }

  function newToast(node, url) {
    const parentNode = document.querySelector(node);
    const button = document.createElement('button');
    button.innerHTML = `New Toast`
    button.setAttribute('type', 'button');

    button.classList.add("toast-submit");
    button.onclick = function() {
      let div = this.nextElementSibling;
      div.classList.remove('hidden');

      this.classList.add('hidden');

      let closeButton = this.nextElementSibling.nextElementSibling;
      closeButton.classList.remove('hidden');
    }

    // Grab the profile picture URL from the settings box for the time being
    var avatarURL;
    if (document.querySelector('#profile input[name="picture"]').value !== "") {
      avatarURL = document.querySelector('#profile input[name="picture"]').value
    } else {
      avatarURL = '201.png'
    }
    

    const div = document.createElement('div');
    div.classList.add('toast-new');
    div.classList.add('hidden');

    div.innerHTML = `
      <header>
        <img class="avatar" src="${avatarURL}" />
        <form class="toast-new-form" autocomplete="off" onsubmit="newToastSubmit(event)" action="">
          <input type="hidden" name="domain" value="" />
          <input type="hidden" name="url" value="${url}" />
  
          <textarea type="text" name="message" placeholder="Write a toast..."></textarea>
          <button type="submit" class="toast-submit">Toast</button>
        </form>
      </header>
    `

    const closeButton = document.createElement('button');
    closeButton.innerHTML = `Cancel`
    closeButton.setAttribute('type', 'button');

    closeButton.classList.add("toast-close");
    closeButton.classList.add("hidden");
    closeButton.onclick = function() {
      let button = this.previousElementSibling.previousElementSibling;
      button.classList.remove('hidden');

      let div = this.previousElementSibling;
      div.classList.add('hidden');

      this.classList.add('hidden');

    }

    parentNode.appendChild(button);
    parentNode.appendChild(div);
    parentNode.appendChild(closeButton);
  }

  document.querySelectorAll('#toastr nav a').forEach(link => {
    link.addEventListener("click", (e) => {
      var num = Array.from(document.querySelectorAll("#toastr nav a")).indexOf(e.currentTarget);
      document.querySelectorAll('#toastr nav a').forEach(l => {
        l.classList.remove("active");
      });
      e.currentTarget.classList.add("active")
      

      drawToasts(null, e.currentTarget.dataset.mode);
      return false;
    });
  });
});


document.querySelectorAll('#sidebar nav a').forEach(link => {
  link.addEventListener("click", (e) => {
    var num = Array.from(document.querySelectorAll("#sidebar nav a")).indexOf(e.currentTarget);
    document.querySelectorAll('#sidebar nav a').forEach(l => {
      l.classList.remove("active");
    });
    e.currentTarget.classList.add("active")
    document.querySelectorAll('#container article').forEach(l => {
      l.style.display = 'none';
    });
    document.querySelectorAll('#container article')[num].style.display = 'block';
    return false;
  });
});
