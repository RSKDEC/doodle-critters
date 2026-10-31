// Runs on the Chromecast. Phones (senders) tell it which room to show over a
// custom message channel; it answers with the room code so they can join.
(() => {
  const NS = 'urn:x-cast:com.doodlecritters.game';
  const logo = document.getElementById('splash-logo');
  if (logo) {
    logo.innerHTML = 'Doodle Critters'.split('').map((ch, i) =>
      (ch === ' ' ? ' ' : `<span style="color:${CRITTER_COLORS[i % 8]}">${ch}</span>`)).join('');
  }
  const onChromecast = typeof cast !== 'undefined' && cast.framework && /CrKey/.test(navigator.userAgent);

  // Opened in a normal browser (e.g. for testing): behave like /host.
  if (!onChromecast) {
    window.crittersShow(new URLSearchParams(location.search).get('room'));
    return;
  }

  const ctx = cast.framework.CastReceiverContext.getInstance();
  const options = new cast.framework.CastReceiverOptions();
  options.customNamespaces = { [NS]: cast.framework.system.MessageType.JSON };
  // A party game has no media playing; keep the app open between games.
  options.disableIdleTimeout = true;
  options.maxInactivity = 3600;

  let current = null;
  window.onCrittersRoom = (code) => {
    current = code;
    try { ctx.sendCustomMessage(NS, undefined, { type: 'room', code }); } catch (e) { console.warn(e); }
  };

  ctx.addCustomMessageListener(NS, (event) => {
    const msg = event.data || {};
    if (msg.type === 'show') window.crittersShow(msg.code || null);
    else if (msg.type === 'hello' && current) window.onCrittersRoom(current);
  });

  ctx.start(options);
})();
