var users = {};
window.pool = null;
var pubKey;

config = {
  locateFile: filename => `${filename}`
}

function setExtensionIcon(tab, currentURL) {
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
    var relays = ["wss://toastr.tylerfreedman.com"];
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
      <div class="field">
        <label for="relay[]">Relay</label>
        <input class="input relay" name="relay[]" disabled value="${relay}" type="text" />
      </div>
    `
  });

  document.querySelector('#settings .relays').innerHTML = div.innerHTML;  
}

function displayProfile(pubKey) {
  if (pubKey !== undefined) {
    window.pubKey = pubKey;
    document.querySelector('#keys input[name="pubkey"]').value = pubKey;
    document.querySelector('#keys input[name="pubkey"]').disabled = true;
    document.querySelector('#keys input[name="npub"]').value = window.NostrTools.nip19.npubEncode(pubKey);
    document.querySelector('#keys input[name="npub"]').disabled = true;
  
    document.querySelector('#keys button').addEventListener('click', updateProfile);
    document.querySelector('#profile button').addEventListener('click', updateProfile);

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

  var e = {
    created_at: Math.floor(Date.now() / 1000),
    kind: 0,
    tags: [],
    content: JSON.stringify(content)
  }

  if (typeof window.nostr !== 'undefined') {
    // NIP07 supported
    window.nostr.signEvent(e).then(event => {
      console.log("signed event via nip07: " + event);
      uploadProfileEvent(event);
    })
  } else {
  // NIP07 unsupported
    var event = window.NostrTools.finalizeEvent(e, Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data))
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

function newToastClose(event) {
  let button = event.target.parentElement.parentElement.parentElement.previousElementSibling;
  button.classList.remove('hidden');

  let div = event.target.parentElement.parentElement.parentElement;
  div.classList.add('hidden');
}

function newToastSubmit(event) {
  event.preventDefault();
  window.data = event.target;

  var data = event.target;
  var e = event.target.querySelectorAll("input[name='e']");

  if (data.url.value != "") {
    // Root Note
    var e = {created_at: Math.floor(Date.now() / 1000), kind: 1, tags: [['r', data.url.value], ['t', 'toastr']], content: data.message.value};
  } else if (e[0] && (e[0].dataset.marker == "reply" || e[0].dataset.marker == "root")) {
    // Reply
    var tags = [];
    e.forEach((el) => {
      tags.push(['e', el.dataset.eventId, el.dataset.relayUrl, el.dataset.marker, el.dataset.pubkey]);
    });

    console.log('tags: ' + tags);
    var e = {created_at: Math.floor(Date.now() / 1000), kind: 1, tags: tags, content: data.message.value};
  }

  if (typeof window.nostr !== 'undefined') {
    // NIP07 supported
    window.nostr.signEvent(e).then(note => {
      console.log("signed note via nip07: " + note);
      uploadNote(data, note, data.parentElement.parentElement.parentElement);
    })
  } else {
  // NIP07 unsupported
    var note = window.NostrTools.finalizeEvent(e, Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data))
    console.log("signed note without nip07: " + note);
    uploadNote(data, note, data.parentElement.parentElement.parentElement);
  }
}

function uploadNote(data, note, parent) {
  console.log("Sending " + JSON.stringify(note));
  Promise.any(window.pool.publish(relays, note)).then(relay => {
    var avatarURL = null;
    var username = '';
    if (window.users[note.pubkey]) {
      var user = JSON.parse(users[note.pubkey].content);
      avatarURL = user.picture;
      username = user.name;
    }
    else {
      username = 'Unknown';
    }
    displayToast(parent.querySelector('.toasts'), {username: username, pubkey: note.pubkey, message: note.content, avatarURL: avatarURL, created_at: Date.now() / 1000}, note)

    // Hide Message Box
    parent.querySelector('.toast-new').classList.add('hidden');
    // Show New Toast
    parent.querySelector('.toast-new-button').classList.remove('hidden');
    data.reset();
  });
}

function displayToast(parent, data, note) {
  const div = document.createElement('div');
  div.classList.add('toast');
  var epoch_timestamp = new Date(0);
  epoch_timestamp.setUTCSeconds(data.created_at);

  var imageClass = '';

  if (data.avatarURL === null) {
    data.avatarURL = hashicon(data.pubkey).toDataURL();
    imageClass = 'hashicon';
  }

  div.innerHTML = `
    <div class="avatar left"><img src="${data.avatarURL}" class="${imageClass}"/></div>
    <div class="content">
      <header>
        <div class="details">
          <span class="username left">${data.username}</span>
          <span class="created_at right"><time datetime="${epoch_timestamp}">${epoch_timestamp.toLocaleString()}</time></span>
        </div>
        <div class="pubkey">${data.pubkey}</div>
      </header>
      <div class="caption">${data.message.replace(/\n/g, '<br />')}</div>
      <footer>
      </footer>
    </div>
  `
  const link = document.createElement('a');
  link.classList += 'raw';
  link.onclick = function(event) {
    event.preventDefault();
    console.log(note);
    writeClipboardText(JSON.stringify(note));
  }

  link.innerHTML = '<img src="code.svg" alt="Copy Raw" />';
  div.querySelector('.pubkey').prepend(link)


  const reply = document.createElement('a');
  reply.innerHTML = '<img src="reply.svg" alt="Reply" />';

  reply.onclick = function() {
    window.node = this;
    var form = this.parentElement.parentElement.parentElement.nextSibling.querySelector('& > .toast-new');
    form.classList.remove('hidden');
  }

  div.querySelector('footer').prepend(reply)
  parent.appendChild(div)
}

async function writeClipboardText(text) {
  if (text === undefined) {
    text = "<blank>";
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error(error.message);
  }
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
        
    console.log('Inserting ' + value['id'] + ' into Toasts DB...');
    db.run("INSERT OR IGNORE INTO toasts (id, created_at, domain, url, pubkey, kind, note) VALUES (?, ?, ?, ?, ?, ?, ?)", [value['id'], value['created_at'], domain, taggedUrl, value['pubkey'], value['kind'], note]);
  }

  function importNote(value, index, array) {
    var note = JSON.stringify(value);
    if (value['kind'] == 0) {
      var existing_note_length = db.exec("SELECT * FROM notes WHERE pubkey = ? AND kind = 0", [value['pubkey']]).length
      if (existing_note_length == 0) {
        console.log('Inserting ' + value['id'] + ' into Notes DB...');
        window.users[value['pubkey']] = value;
        if (value['pubkey'] == window.pubKey) {
          displayProfile(window.pubKey);
        }
        db.run("INSERT INTO notes (id, created_at, pubkey, kind, note) VALUES (?, ?, ?, ?, ?)", [value['id'], value['created_at'], value['pubkey'], value['kind'], note]);
        console.log('Adding ' + value['pubkey'] + ' to window.users...');
      } else {
        console.log('Updating ' + value['id'] + ' into Notes DB...');
        window.users[value['pubkey']] = value;
        if (value['pubkey'] == window.pubKey) {
          displayProfile(window.pubKey);
        }
        db.run("UPDATE notes SET id = ? created_at = ?, kind = ?, note = ? WHERE pubkey = ? AND created_at < ?)", [value['id'], value['created_at'], value['kind'], note, value['pubkey'], value['created_at']]);
        console.log('Adding ' + value['pubkey'] + ' to window.users...');
      }
    } else if (value['kind'] == 1) {
      // Confirm it isn't a toast...
      var isToast = false;
      value["tags"].forEach((tag) => {
        if (tag[0] == "t" && tag[1].toLowerCase().startsWith('toastr')) {
          console.log("This is a toast - rejecting from Notes DB")
          isToast = true;
        }
      });

      if (isToast) {
        return
      }

      console.log('Inserting ' + value['id'] + ' into Notes DB...');
      db.run("INSERT INTO notes (id, created_at, pubkey, kind, note) VALUES (?, ?, ?, ?, ?)", [value['id'], value['created_at'], value['pubkey'], value['kind'], note]);
      console.log('Adding ' + value['id'] + ' to notes');
    } else {
      console.log('Not inserting ' + value['id'] + ' into Notes DB - not a valid kind 0 event'); // Worry about non-kind 0 stuff later
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
        setExtensionIcon(tab, tab.url);
      });
    });

    browser.tabs.onUpdated.addListener((tabId, change, tab) => {
      if (tab.active && change.url) {
        setExtensionIcon(tab, change.url);
      }
    });

    browser.tabs.query({
      active: true,
      currentWindow: true
    }, function(tabs) {
      searchBar.value = tabs[0].url;
      onInput(searchBar.value);
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
    document.querySelector('#keys input[name="privkey"]').value = "NIP-07 supported - using browser keys";
    document.querySelector('#keys input[name="privkey"]').disabled = true;
    window.nostr.getPublicKey().then(pubKey => {
      displayProfile(pubKey);
      return pubKey;
    })
  } else if (sk === null) {
    document.querySelector('#keys input[name="privkey"]').value = window.NostrTools.nip19.nsecEncode(window.NostrTools.generateSecretKey());
    localStorage.setItem("privkey", document.querySelector('#keys input[name="privkey"]').value);
    sk = Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data);
    pk = window.NostrTools.getPublicKey(sk);
  } else {
    sk = Uint8Array.from(window.NostrTools.nip19.decode(localStorage.getItem('privkey')).data);
    document.querySelector('#keys input[name="privkey"]').value = localStorage.getItem('privkey');
    pk = window.NostrTools.getPublicKey(sk);
  }

  document.querySelector('#keys input[name="privkey"]').addEventListener("change", function() {
    pk = window.NostrTools.getPublicKey(sk) // `pk` is a hex string
  });

  window.pool = new window.NostrTools.SimplePool()

  window.relays = getRelays();

  var dirty = false;
  document.querySelector('#keys input[name="privkey"]').disabled = true;

  if (pk) {
    displayProfile(pk);
  }

  var h = window.pool.subscribeMany(
    relays,[
      {kinds: [1], '#t': ["toastr"]}
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
        //h.close();
      }
    }
  )

  var filters = [];
  var stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1");
  while(stmt.step()) {
    const row = stmt.getAsObject();
    var event = JSON.parse(row.note);
    filters.push({kinds: [1], '#e': [event.id]});
  }

  window.filters = filters;
  console.log('filters: '+ filters.toString());

  var h = window.pool.subscribeMany(
    relays, filters,
    {
      onevent(event) {
        if (event && event.pubkey && event.content && event.kind == 1 && window.NostrTools.verifyEvent(event, event.pubkey)) {
          importNote(event);
        }
      },
      oneose() {
        console.log('EOSE on notes/comments - Calling fetchAuthorInfo...');
        fetchAuthorInfo();
        h.close();
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
    if (!searchValue || searchValue == "" || searchValue == "https://" || searchValue == "http://") {
      mode = 'recent';
      document.querySelectorAll('#toastr nav a').forEach(l => {
        if (l.dataset.mode == "recent") {
          l.classList.add("active");
        }
      });

    } else if ((searchValue.startsWith('https://') || searchValue.startsWith('http://')) && (searchValue.split("/").length - 1) > 2) {
      mode = 'url-' + searchValue;
    } else if (searchValue.startsWith('npub')) {
      mode = 'profile-' + searchValue;
    } else if (searchValue.startsWith('note')) {
      mode = 'toast-' + searchValue;
    } else {
      mode = 'domain-' + searchValue;
    }

    const searchHeading = document.querySelector('.search-results');
    searchHeading.classList.add('active');
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


  function onlyUnique(value, index, array) {
    return array.indexOf(value) === index;
  }

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

    // Get the public keys of everyone who's written a note
    var stmt = db.prepare("SELECT * FROM notes WHERE kind = 1");
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      userPubkeys.push(event.pubkey)
    }

    // Suppress duplicate authors
    userPubkeys = userPubkeys.filter(onlyUnique);

    console.log("userPubkeys: " + userPubkeys);

    var h = window.pool.subscribeMany(
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
          h.close();
        }
      }
    )
  }

  function drawToasts(container, knownUsers, mode) {
    console.log("Drawing Toasts! - Mode = " + mode);
    try {
      container.querySelector('.toasts-loading').classList.add("active");
      container.querySelector('.toasts').innerHTML = '';
    } catch (e) {}

    var users = {}
    var stmt = db.prepare("SELECT * FROM notes WHERE kind = 0");
    while(stmt.step()) {
      const row = stmt.getAsObject();
      var event = JSON.parse(row.note);
      users[event.pubkey] = event;
    }

    if (mode.slice(-1) == '#') {
      mode = mode.substring(0, mode.length - 1);
    }

    var emptyMsg = '';
    var oldHeading = '';
    var oldSubHeading = '';

    if (mode.startsWith("domain-")) {
      console.log("Filtering to domain name " + mode.substring(7));
      emptyMsg = "Sorry, there are no toasts for the domain " + mode.substring(7);
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND domain = $domain ORDER BY created_at ASC");
      stmt.bind({$domain: mode.substring(7)});
    } else if (mode == "recent") {
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 ORDER BY created_at DESC");
      emptyMsg = "Sorry, there are no toasts";
    } else if (mode.startsWith("url-")) {
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND url = $url ORDER BY created_at ASC");
      console.log("Filtering to URL " + mode.substring(4));
      stmt.bind({$url: mode.substring(4)});
      emptyMsg = "Sorry, there are no toasts for URL " + mode.substring(4) + " - why not be the first to write one?";
    } else if (mode.startsWith("profile")) {
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND pubkey = $pubkey ORDER BY created_at ASC");
      console.log("Filtering to profile " + mode.substring(8));
      var pubkey = window.NostrTools.nip19.decode(mode.substring(8)).data;
      stmt.bind({$pubkey: pubkey});
      emptyMsg = "Sorry, there are no toasts from profile " + mode.substring(8) + ' (' + pubkey + ')';
    } else if (mode.startsWith("toast")) {
      stmt = db.prepare("SELECT * FROM toasts WHERE kind = 1 AND id = $id ORDER BY created_at ASC");
      console.log("Filtering to toast " + mode.substring(6));
      var id = window.NostrTools.nip19.decode(mode.substring(6)).data;
      stmt.bind({$id: id});
      emptyMsg = "Sorry, there are no toasts corresponding to " + mode.substring(6) + ' (' + id + ')';
    } else if (mode.startsWith("replies-")) {
      console.log('Loading replies for ' + mode.substring(8));
      var dirty = false;
      var replies = [];

      // TODO: rewrite this to not use LIKE, and properly search for replies
      // This is only doable with an index of tags though.
      // {kinds: [1], '#e': [mode.substring(8), "", "root/reply"]}

      stmt = db.prepare("SELECT * FROM notes WHERE kind = 1 AND id <> $id AND note LIKE $noteid");
      stmt.bind({$id: mode.substring(8), $noteid: '%' + mode.substring(8) + '%'});

      emptyMsg = "";
    }

    var count = 0;
    var row;
    var lastRow;

    var drawHeadings = false;
    while(true) {
      if (!mode.startsWith("replies-")) { // Toasts
        if (stmt.step()) {
          row = stmt.getAsObject();
          drawHeadings = true;
        } else {
          break;
        }
      } else { // Replies
        if (stmt.step()) {
          row = stmt.getAsObject();
        } else {
          return;
        }
      }

      // console.log('iteration: ' + count);
      var event = JSON.parse(row.note);

      // Our database code currently does not support properly parsing the tag column of Nostr notes,
      // so you can't just ask for 'direct children of note X' - instead, you have to ask for notes
      // that reference X, which might include great-great-grandchildren, or other insane relationships.
      // Then you have to parse every response to the query and actually perform the check by parsing
      // the note directly, and short circuit rendering if it isn't actually what you wanted.

      var parent = '';

      if (mode.startsWith("replies-")) {
        // Copy all of the e Tags from the references in the parent post
        event["tags"].forEach((tag) => {
          if (tag[0] == "e") {
            parent = tag[1];
          }
        });

        if (parent != mode.substring(8)) {
          continue; // Cancel rendering if the parent isn't actually an exact match.
        }
      }

      count += 1;
      var username = '';
      var avatarURL = null;
      if (users[event.pubkey]) {
        var user = JSON.parse(users[event.pubkey].content);
        avatarURL = user.picture;
        username = user.name;
      }
      else {
        username = 'Unknown';
      }
      if (drawHeadings) {
        var newHeading = row.domain;
        var newSubHeading = row.url.split(row.domain, 2)[1];

        if (oldHeading != newHeading) {
          const heading = document.createElement('h2');
          const link = document.createElement('a');
          link.onclick = function(event) {
            event.preventDefault();
            searchBar.value = event.target.dataset.domain;
            onInput(event.target.dataset.domain);
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
          }
          link.href = row.url;
          link.dataset.domain = row.domain;
          link.dataset.url = row.url;
          link.innerHTML = newSubHeading;
          heading.appendChild(link);

          container.querySelector('.toasts').appendChild(heading);
          oldSubHeading = newSubHeading;
        }
      }
  
      console.log('Displaying toast!');
      displayToast(container.querySelector('.toasts'), {username: username, pubkey: event.pubkey, message: event.content, avatarURL: avatarURL, created_at: event.created_at}, event)

      if (count > 0) {
        // Draw replies
        const children = document.createElement('div');
        children.classList.add('children');

        container.querySelector('.toasts').appendChild(children);

        const toasts = document.createElement('div');
        toasts.classList.add('toasts');
        children.appendChild(toasts);

        var marker = 'root';
        // Copy all of the e Tags from the references in the parent post
        var eTags = [];
        event["tags"].forEach((tag) => {
          if (tag[0] == "e") {
            eTags.push(tag);
            if (tag[3] && tag[3] == 'root') {
              marker = 'reply'; // If there's a root e tag defined, mark it as a reply instead.
            }
          }
        });

        // Add the parent post itself as a reference
        eTags.push(['e', event.id, '', marker, event.pubkey])
  
        newToast(children, {eTags: eTags});
        drawToasts(children, knownUsers, "replies-" + event.id);
      }
      lastRow = row;
    }
    try {
      container.querySelector('.toasts-loading').classList.remove("active");
      if (count == 0) {
        container.querySelector('.toasts-empty').classList.add("active");
        container.querySelector('.toasts').innerHTML = emptyMsg;
      } else {
        container.querySelector('.toasts-empty').classList.remove("active");
      }
      if (mode.startsWith('url-')) {
        newToast(container, {url: mode.substring(4)});
      } else {
        // Hide New Toast Button and Form
        try {
          container.querySelector('.toast-new-button').classList.add("hidden");
          container.querySelector('.toast-new').classList.add("hidden");
        } catch (e) {}
      }
    } catch (e) {}
  }

  function newToast(node, params) {
    if (node.querySelector('& > .toast-new') !== null) {
      console.log('New toast form already exists - showing the old one');
      node.querySelector('.toast-new-button').classList.remove("hidden");
      return;
    }

    // Grab the profile picture URL from the settings box for the time being
    var avatarURL;
    if (document.querySelector('#profile input[name="picture"]').value !== "") {
      avatarURL = document.querySelector('#profile input[name="picture"]').value
    } else {
      avatarURL = 'circle-user.svg'
    }
    
    const div = document.createElement('div');
    div.classList.add('toast-new');
    div.classList.add('hidden');

    var url = '';
    var eTags = [];
    var placeholderText = 'Write a toast...';
    var actionText = 'Toast';

  
    if (params.url !== undefined) {
      // This is a root toast
      url = params.url;    
    } else if (params.eTags !== undefined) { 
      // This is a reply
      eTags = params.eTags;
      placeholderText = 'Write a reply...';
      actionText = 'Reply';
    }

    var innerHTML = `
      <img class="avatar" src="${avatarURL}" />
      <div class="content">
        <form class="toast-new-form" autocomplete="off" onsubmit="newToastSubmit(event)" action="">
          <input type="hidden" name="url" value="${url}" />
    `
          eTags.forEach(function (tag, index) {
            innerHTML += `
          <input type="hidden" name="e" data-event-id="${tag[1]}" data-relay-url="${tag[2]}" data-marker="${tag[3]}" data-pubkey="${tag[4]}" />
            `
          })

       innerHTML += `
          <textarea type="text" name="message" placeholder="${placeholderText}"></textarea>
          <button type="submit" class="toast-submit-button">${actionText}</button>
          <button type="button" class="toast-close-button" onclick="newToastClose(event)">Close</button>
        </form>
      </div>
    `

    div.innerHTML = innerHTML;

    if (params.eTags === undefined) { // Do not add a New Toast button to replies
      const button = document.createElement('button');
      button.innerHTML = `New Toast`
      button.setAttribute('type', 'button');


      button.classList.add("toast-new-button");
      button.onclick = function() {
        let div = this.nextElementSibling;
        div.classList.remove('hidden');

        this.classList.add('hidden');
      }

      node.append(button);
    }

    node.append(div);
  }

  document.querySelectorAll('#toastr nav a').forEach(link => {
    link.addEventListener("click", (e) => {
      if (e.currentTarget.dataset.mode == "search") {
        return false;
      }
      var num = Array.from(document.querySelectorAll("#toastr nav a")).indexOf(e.currentTarget);
      document.querySelectorAll('#toastr nav a').forEach(l => {
        l.classList.remove("active");
      });
      e.currentTarget.classList.add("active")
      searchBar.value = '';
      drawToasts(document.querySelector('.toasts-container'), window.users, e.currentTarget.dataset.mode);
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
