/**
 * mio-shortcode.js — wires every `.mio-realtime-feed` div rendered by
 * `[mio_realtime]` (see `includes/Shortcode.php`) to a live
 * `MioRealtimeClient`: fetches a token from the REST route (never the
 * tenant secret — that stays server-side), connects, subscribes to the
 * channel named in the div's `data-mio-channel`, and appends each
 * message's payload as a list item.
 *
 * Plain script, no build step, loaded after `mio-protocol.js` and
 * `mio-client.js` (enqueue order in `Shortcode::enqueueAssets`) and
 * `wp_localize_script`'s `mioRealtimeConfig.restTokenUrl`.
 */
(function () {
  'use strict';

  function setStatus(root, text) {
    var el = root.querySelector('.mio-realtime-status');
    if (el) el.textContent = text;
  }

  function appendMessage(root, message, limit) {
    var list = root.querySelector('.mio-realtime-messages');
    if (!list) return;
    var item = document.createElement('li');
    item.className = 'mio-realtime-message';
    item.textContent = message.payload;
    list.appendChild(item);
    while (list.children.length > limit) {
      list.removeChild(list.firstChild);
    }
  }

  function fetchToken() {
    return fetch(window.mioRealtimeConfig.restTokenUrl, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('token request failed: HTTP ' + res.status);
      return res.json();
    });
  }

  function wireFeed(root) {
    var channel = root.getAttribute('data-mio-channel');
    var limit = parseInt(root.getAttribute('data-mio-limit'), 10) || 20;
    var replay = root.getAttribute('data-mio-replay') === 'true';

    setStatus(root, 'Connecting…');

    fetchToken()
      .then(function (data) {
        var client = new window.MioRealtimeClient({
          host: data.ws_host,
          port: data.ws_port,
          tenantId: data.tenant_id,
          token: data.token,
        });

        client.on('open', function () {
          setStatus(root, 'Live');
        });
        client.on('close', function () {
          setStatus(root, 'Reconnecting…');
        });
        client.on('error', function (err) {
          setStatus(root, 'Connection error: ' + err.message);
        });

        client.subscribe(channel, function (message) {
          appendMessage(root, message, limit);
        });

        client.connect();
        if (replay) client.replay(channel, 0);
      })
      .catch(function (err) {
        setStatus(root, 'Failed to connect: ' + err.message);
      });
  }

  function init() {
    var feeds = document.querySelectorAll('.mio-realtime-feed');
    feeds.forEach(wireFeed);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
