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

function getRelays() {
  var default_relays = ["wss://relay.damus.io", "wss://relay.primal.net", "wss://nos.lol", "wss://relay.snort.social"];
  var relays = [];
  var override_relays = true;

  if (override_relays) {
    var relays = ["wss://toastr.tylerfreedman.com"]
    document.querySelector('#settings #relays .message').innerHTML = 'Overriding NIP-07 Relays for debugging purposes';
  } else {
    if (typeof window.nostr !== 'undefined') {
      // Detected NIP-07 support
      document.querySelector('#settings #relays .message').innerHTML = 'Retrieving relays via NIP-07';
      window.nostr.getRelays().then(r => {
        for (const [key, value] of Object.entries(r)) {
          relays.push(key);
        }
        displayRelays(relays);
      })
    } else {
      relays.concat(default_relays);
    }
  }
  displayRelays(relays);
  return relays;
}

function displayRelays(relays) {
  const div = document.createElement('div');
  relays.forEach((relay) => {
    div.innerHTML += `
      <input class="relay" name="relay[]" disabled value="${relay}" /><br />
    `
  });

  document.querySelector('#settings .relays').innerHTML = div.innerHTML;  
}

function displayProfile(pubKey) {
  if (pubKey !== undefined) {
    window.pubKey = pubKey;
    document.querySelector('#profile input[name="pubkey"]').value = pubKey;
    document.querySelector('#profile input[name="pubkey"]').disabled = true;
    document.querySelector('#profile input[name="npub"]').value = window.NostrTools.nip19.npubEncode(pubKey);
    document.querySelector('#profile input[name="npub"]').disabled = true;
  
    document.querySelector('#profile button').addEventListener('click', updateProfile);

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
  var container = document.querySelector('#profile');
  var name = container.querySelector('input[name="name"]').value;
  var displayName = container.querySelector('input[name="display_name"]').value;
  var website = container.querySelector('input[name="website"]').value;
  var banner = container.querySelector('input[name="banner"]').value;
  var picture = container.querySelector('input[name="picture"]').value;

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
    }, Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data))
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
      uploadNote(data, note, data.parentElement.parentElement.parentElement);
    })
  } else {
  // NIP07 unsupported
    var note = window.NostrTools.finalizeEvent({
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['r', data.url.value], ['t', 'toastr']],
      content: data.message.value,
    }, Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data))
    console.log("signed note without nip07: " + note);
    uploadNote(data, note, data.parentElement.parentElement.parentElement);
  }
}

function uploadNote(data, note, parent) {
  console.log("Sending " + JSON.stringify(note));
  Promise.any(window.pool.publish(relays, note)).then(relay => {
    var avatar_url = '';
    var username = '';
    if (window.users[note.pubkey]) {
      var user = JSON.parse(users[note.pubkey].content);
      avatar_url = user.picture;
      username = user.name;
    }
    else {
      avatar_url = 'Unknown'
      username = 'Unknown';
    }
    displayToast(parent.querySelector('.toasts'), {username: username, pubkey: note.pubkey, message: note.content, avatar_url: avatar_url, created_at: Date.now() / 1000})

    // Hide Cancel Button
    parent.querySelector('.toast-close').classList.add('hidden');
    // Hide Message Box
    parent.querySelector('.toast-new').classList.add('hidden');
    // Show New Toast
    parent.querySelector('.toast-new-button').classList.remove('hidden');
    data.reset();
  });
}

function displayToast(parent, data) {
  const div = document.createElement('div');
  div.classList.add('toast');
  var epoch_timestamp = new Date(0);
  epoch_timestamp.setUTCSeconds(data.created_at);

  var imageClass = '';

  if (data.avatar_url == 'Unknown') {
    data.avatar_url = hashicon(data.pubkey).toDataURL();
    imageClass = 'hashicon';
  }

  div.innerHTML = `
    <div class="avatar left"><img src="${data.avatar_url}" class="${imageClass}"/></div>
    <div class="content">
      <header>
        <div class="details">
          <span class="username left">${data.username}</span>
          <span class="created_at right"><time datetime="${epoch_timestamp}">${epoch_timestamp.toLocaleString()}</time></span>
        </div>
        <div class="pubkey">${data.pubkey}</div>
      </header>
      <div class="caption">${data.message}</div>
    </div>
  `

  parent.appendChild(div)
}

initSqlJs(config).then(function(SQL){
  function importToast(value, index, array) {
    var note = JSON.stringify(value);

    var taggedUrl = '';
    value["tags"].forEach((tag) => {
      if (tag[0] == "r" && tag[1].toLowerCase().startsWith('http')) {
        taggedUrl = tag[1];
      }
    });

    const url = new URL(taggedUrl);
    var domain = url.hostname.toLowerCase();
        
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
          displayProfile(window.pubKey);
        }
        db.run("INSERT INTO notes (id, created_at, pubkey, kind, note) VALUES (?, ?, ?, ?, ?)", [value['id'], value['created_at'], value['pubkey'], value['kind'], note]);
        console.log('Adding ' + value['pubkey'] + ' to window.users...');
      } else {
        console.log('Updating ' + value['id'] + ' into DB...');
        window.users[value['pubkey']] = value;
        if (value['pubkey'] == window.pubKey) {
          displayProfile(window.pubKey);
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

  // Start Nostr connections
  var sk = localStorage.getItem('privkey');
  var pk;

  if (typeof window.nostr !== 'undefined') {
    // Detected NIP-07 support
    document.querySelector('#profile input[name="privkey"]').value = "NIP-07 supported - using browser keys";
    document.querySelector('#profile input[name="privkey"]').disabled = true;
    window.nostr.getPublicKey().then(pubKey => {
      displayProfile(pubKey);
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

  window.pool = new window.NostrTools.SimplePool()

  window.relays = getRelays();
  displayRelays(window.relays);

  var dirty = false;

  document.querySelector('#profile input[name="privkey"]').disabled = true;

  if (pk) {
    displayProfile(pk);
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

  // Search Code

  const searchBar = document.getElementById('search-bar');
  const searchResults = (searchValue) => {
    document.querySelectorAll('#toastr nav a').forEach(l => {
      l.classList.remove("active");
    });
    var mode = '';
    if (!searchValue || searchValue == "") {
      mode = 'recent';
    } else if (searchValue.startsWith('https://') || searchValue.startsWith('http://')) {
      mode = 'url-' + searchValue;
    } else {
      mode = 'domain-' + searchValue;
    }

    drawToasts(document.querySelector('.toasts-container'), window.users, mode);
  };

  const debounce = (fn, delay = 1000) => {
    let timerId = null;
    return (...args) => {
      clearTimeout(timerId);
      timerId = setTimeout(() => fn(...args), delay);
    };
  };

  const onInput = debounce(searchResults, 500);
  searchBar.addEventListener("input", (e) => {
    onInput(e.target.value);
  });


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
            drawToasts(document.querySelector('.toasts-container'), window.users, "url-#");
            document.querySelectorAll('#toastr nav a').forEach(l => {
              if (l.dataset.mode == "url-#") {
                l.classList.add("active");
              }
            });
          } else {
            drawToasts(document.querySelector('.toasts-container'), window.users, "recent");
            document.querySelectorAll('#toastr nav a').forEach(l => {
              if (l.dataset.mode == "recent") {
                l.classList.add("active");
              }
            });
          }
          
          //h.close()
        }
      }
    )
  }

  function drawToasts(container, knownUsers, mode) {
    console.log("Drawing Toasts! - Mode = " + mode);
    container.querySelector('.toasts-loading').classList.add("active");
    container.querySelector('.toasts').innerHTML = '';

    var users = {}
    var stmt = db.prepare("SELECT * FROM notes WHERE kind = 0");
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      users[event.pubkey] = event;
    }

    // TODO: PASS IN URL
    if (!window.browserExtension) {
      currentURL = window.location.href;
    }

    console.log("CurrentURL: " + currentURL);

    if (currentURL.slice(-1) == '#') {
      currentURL = currentURL.substring(0, currentURL.length - 1);
    }

    const url = new URL(currentURL);
    var domain = url.hostname.toLowerCase();
    // END TODO

    var emptyMsg = '';
    var oldHeading = '';
    var oldSubHeading = '';

    if (mode.startsWith("domain-")) {
      if (mode == "domain-#") {
        console.log("Filtering to domain name " + domain);
        emptyMsg = "Sorry, there are no toasts for the domain " + domain;
        stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND domain = $domain");
        stmt.bind({$domain: domain});
      } else {
        console.log("Filtering to domain name " + mode.substring(7));
        emptyMsg = "Sorry, there are no toasts for the domain " + mode.substring(7);
        stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND domain = $domain");
        stmt.bind({$domain: mode.substring(7)});
      }
    } else if (mode == "recent") {
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1");
      emptyMsg = "Sorry, there are no toasts";
    } else if (mode.startsWith("url-")) {
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND url = $url");
      if (mode == "url-#") {
        console.log("Filtering to URL " + currentURL);
        stmt.bind({$url: currentURL});
        emptyMsg = "Sorry, there are no toasts for URL " + currentURL + " - why not be the first to write one?";
      } else {
        console.log("Filtering to URL " + mode.substring(4));
        stmt.bind({$url: mode.substring(4)});
        emptyMsg = "Sorry, there are no toasts for URL " + mode.substring(4) + " - why not be the first to write one?";
      }
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
        avatar_url = 'Unknown'
        username = 'Unknown';
      }
      var newHeading = row.domain;
      var newSubHeading = row.url.split(row.domain, 2)[1];

      if (oldHeading != newHeading) {
        const heading = document.createElement('h2');
        const link = document.createElement('a');
        link.onclick = function(event) {
          event.preventDefault();
          searchBar.value = event.target.dataset.domain;
          onInput(event.target.dataset.domain);
          //drawToasts(container, window.users, "domain-" + event.target.dataset.domain);
          
        }
        link.href = row.url;
        link.dataset.domain = row.domain;
        link.dataset.url = row.url;
        link.innerHTML = newHeading;
        heading.appendChild(link);

        container.querySelector('.toasts').appendChild(heading);
        oldHeading = newHeading;
        oldSubHeading = ''; // If the new domain changes, reset the subHeading
      }

      if (oldSubHeading != newSubHeading) {
        const heading = document.createElement('h3');
        const link = document.createElement('a');
        link.onclick = function(event) {
          event.preventDefault();

          searchBar.value = event.target.dataset.url;
          onInput(event.target.dataset.url);
          //drawToasts(container, window.users, "url-" + event.target.dataset.url);
        }
        link.href = row.url;
        link.dataset.domain = row.domain;
        link.dataset.url = row.url;
        link.innerHTML = newSubHeading;
        heading.appendChild(link);

        container.querySelector('.toasts').appendChild(heading);
        oldSubHeading = newSubHeading;
      }
      displayToast(container.querySelector('.toasts'), {username: username, pubkey: event.pubkey, message: event.content, avatar_url: avatar_url, created_at: event.created_at})
      lastRow = row;
    }

    container.querySelector('.toasts-loading').classList.remove("active");
    if (count == 0) {
      container.querySelector('.toasts-empty').classList.add("active");
      container.querySelector('.toasts').innerHTML = emptyMsg;
    } else {
      container.querySelector('.toasts-empty').classList.remove("active");
    }
    if (mode.startsWith('url-')) {
      newToast(container, currentURL);
    } else {
      // Hide New Toast Button
      try {
        container.querySelector('.toast-new-button').classList.add("hidden");
      } catch (e) {}
    }
  }

  function newToast(node, url) {
    if (node.querySelector('.toast-new') !== null) {
      console.log('New toast form already exists - showing the old one');
      node.querySelector('input[name="url"]').value = url; // Update the URL of the newToast form
      node.querySelector('.toast-new-button').classList.remove("hidden");
      return;
    }
    const button = document.createElement('button');
    button.innerHTML = `New Toast`
    button.setAttribute('type', 'button');

    button.classList.add("toast-new-button");
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
      <img class="avatar" src="${avatarURL}" />
      <div class="content">
        <form class="toast-new-form" autocomplete="off" onsubmit="newToastSubmit(event)" action="">
          <input type="hidden" name="domain" value="" />
          <input type="hidden" name="url" value="${url}" />
  
          <textarea type="text" name="message" placeholder="Write a toast..."></textarea>
          <button type="submit" class="toast-submit-button">Toast</button>
        </form>
      </div>
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

    node.append(button);
    node.append(div);
    node.append(closeButton);
  }

  function filterByDomain(event) {
    event.preventDefault();
    window.event = event;
    alert(event.target.dataset.domain);
  }

  document.querySelectorAll('#toastr nav a').forEach(link => {
    link.addEventListener("click", (e) => {
      var num = Array.from(document.querySelectorAll("#toastr nav a")).indexOf(e.currentTarget);
      document.querySelectorAll('#toastr nav a').forEach(l => {
        l.classList.remove("active");
      });
      e.currentTarget.classList.add("active")
      searchBar.value = '';
      drawToasts(document.querySelector('.toasts-container'), null, e.currentTarget.dataset.mode);
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
