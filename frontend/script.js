function toast(parentSelector, data) {
  const div = document.createElement('div');

  var epoch_timestamp = new Date(0);
  epoch_timestamp.setUTCSeconds(data.timestamp);

  div.innerHTML = `
    <div class="toast">
      <header>
        <img class="avatar" src="${data.avatar_url}" />
        <div>
          <div class="username">${data.username}</div>
          <span class="timestamp"><time datetime="${epoch_timestamp}">Posted on ${epoch_timestamp.toLocaleDateString()}</time></span>
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


window.addEventListener("load", function(){
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
    var relays = ["wss://toastr.tylerfreedman.com"] //relay.primal.net", "wss://nos.lol"] //, 'wss://relay.primal.net']
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
      //{authors: ['32e1827635450ebb3c5a7d12c1f8e7b2b514439ac10a67eef3d9fd9c5c68e245']},
      //{authors: ['4ebc074827c53f4782d25fa9b3d1f6fda47ffa46c957015b62e7eea3453907a9']},
      {kinds: [0, 1], '#t': "toastr"}
    ],
    {
      onevent(event) {
        if (event && event.pubkey && event.kind == 0) {
          window.users[event.pubkey] = event;
        }
        if (event && event.pubkey && event.content && event.kind == 1 && window.NostrTools.verifyEvent(event, event.pubkey)) {
          window.toasts.push(event);
        }
      },
      oneose() {
        drawToasts();
        //h.close()
      }
    }
  )

  function drawToasts(toasts) {
    window.toasts = window.toasts.sort(({created_at:a}, {created_at:b}) => a-b);
    console.log("Drawing Toasts!");
    window.toasts.forEach((event) => {
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
      toast('.toasts', { username: username + ' (' + event.pubkey + ')', message: event.content, avatar_url: avatar_url, timestamp: event.created_at, replies: 0, zaps: 0, likes: 0, reposts: 0 })
    });
  }

  function uploadNote(data, note) {
    console.log("Sending " + JSON.stringify(note));
    Promise.any(window.pool.publish(relays, note)).then(relay => {
      toast('.toasts', {username: 'Unknown (nostr)', message: note.content, avatar_url: 0, timestamp: Date.now() / 1000, replies: 0, zaps: 0, likes: 0, reposts: 0})
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
