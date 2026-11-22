/* Meridian community: Google sign-in and visitor contributions (new places, tips, corrections).
   Uses Firebase Auth + Firestore, loaded only when js/config.js has a Firebase config. Reading is open to everyone,
   writing needs a Google sign-in. The rules that enforce this live in firestore.rules. */
(() => {
  'use strict';
  const CFG = window.MERIDIAN_CONFIG || {}, SDK = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const say = m => window.Meridian?.toast(m);
  const KINDS = { place: 'New place', tip: 'Tip', fix: 'Correction' };
  const CATS = ['Photo spot', 'Nature', 'Culture', 'Food and drink', 'Cafe', 'Nightlife', 'Shopping', 'Diving', 'Stay', 'Other'];
  let fb = null, ready = null, me = null, place = null, items = [], state = 'idle', showAll = false;

  const script = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
  const start = () => ready ||= (async () => {
    if (!CFG.firebase) throw new Error('not-configured');
    await script(SDK + 'app-compat.js');
    await Promise.all([script(SDK + 'auth-compat.js'), script(SDK + 'firestore-compat.js')]);
    fb = window.firebase; fb.initializeApp(CFG.firebase);
    fb.firestore().settings({ ignoreUndefinedProperties: true });   // empty optional fields are skipped instead of refusing the save
    fb.auth().onAuthStateChanged(u => { me = u; drawUser(); draw(); });
  })();

  /* ---------- account button ---------- */
  const btn = $('#account');
  const drawUser = () => {
    if (!btn) return;
    btn.innerHTML = me
      ? `${me.photoURL ? `<img src="${esc(me.photoURL)}" alt="" referrerpolicy="no-referrer">` : '<i class="ph ph-user-circle" aria-hidden="true"></i>'}<span>${esc((me.displayName || 'Account').split(' ')[0])}</span>`
      : '<i class="ph ph-google-logo" aria-hidden="true"></i><span>Sign in</span>';
    btn.setAttribute('aria-label', me ? `Signed in as ${me.displayName || 'your Google account'}. Press to sign out` : 'Sign in with Google');
  };
  const signIn = async () => {
    try { await start(); } catch { say('Google sign-in is not connected yet. The site owner needs to finish the setup in the README.'); return false; }
    if (me) return true;
    try { await fb.auth().signInWithPopup(new fb.auth.GoogleAuthProvider()); return true; }
    catch (e) { if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') say('Sign-in did not finish. Please try again.'); return false; }
  };
  btn?.addEventListener('click', async () => {
    if (me) { if (confirm('Sign out of Meridian?')) await fb.auth().signOut(); }
    else if (await signIn()) say(`Signed in as ${me?.displayName || 'your Google account'}`);
  });

  /* ---------- contributions for the open place ---------- */
  const box = $('#community');
  const when = t => { const d = t?.toDate ? t.toDate() : null; return d ? d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' }) : 'just now'; };
  const draw = () => {
    if (!box) return;
    if (!place) { box.innerHTML = ''; return; }
    const shown = showAll ? items : items.slice(0, 3);
    box.innerHTML = `<div class="com-head"><strong><i class="ph ph-users-three" aria-hidden="true"></i> From the community${items.length ? ` <span>${items.length}</span>` : ''}</strong>
        <button class="pill add" type="button" data-act="add"><i class="ph ph-plus"></i>Add a place or tip</button></div>
      ${state === 'loading' ? '<p class="note" style="margin:8px 0 0">Loading community notes.</p>' : ''}
      ${state === 'error' ? '<p class="note" style="margin:8px 0 0">Community notes could not load right now.</p>' : ''}
      ${state === 'ready' && !items.length ? `<p class="note" style="margin:8px 0 0">Nobody has added anything for ${esc(place.name)} yet. Be the first.</p>` : ''}
      ${state === 'off' ? '<p class="note" style="margin:8px 0 0">Sign in with Google to add places, tips and corrections for everyone.</p>' : ''}
      <ul class="com-list">${shown.map(d => `<li>
        <div class="spot-type"><span>${esc(KINDS[d.kind] || 'Tip')}${d.cat ? ', ' + esc(d.cat) : ''}</span><span>${esc(when(d.created))}</span></div>
        <strong>${esc(d.name)}</strong>${d.note ? `<p>${esc(d.note)}</p>` : ''}
        <div class="spot-actions">
          ${d.lat != null ? `<button class="pill" type="button" data-act="show" data-lat="${+d.lat}" data-lng="${+d.lng}"><i class="ph ph-globe-hemisphere-west"></i>Show</button>` : ''}
          ${d.url ? `<a class="pill" href="${esc(d.url)}" target="_blank" rel="noopener nofollow ugc"><i class="ph ph-link"></i>Link</a>` : ''}
          <span class="com-by">Added by ${esc(d.author || 'a traveller')}</span>
          ${me && me.uid === d.uid ? `<button class="pill" type="button" data-act="del" data-id="${esc(d.id)}"><i class="ph ph-trash"></i>Remove</button>` : ''}
        </div></li>`).join('')}</ul>
      ${items.length > 3 && !showAll ? `<button class="btn btn-ghost btn-wide" type="button" data-act="all">Show all ${items.length}</button>` : ''}
      ${CFG.repo ? `<p class="note">This site is open source. <a href="${esc(CFG.repo)}" target="_blank" rel="noopener">Help improve it</a>.</p>` : ''}`;
  };
  const load = async () => {
    items = []; showAll = false;
    if (!place) return draw();
    if (!CFG.firebase) { state = 'off'; return draw(); }
    state = 'loading'; draw();
    const id = place.id;
    try {
      await start();
      const snap = await fb.firestore().collection('contributions').where('placeId', '==', id).limit(100).get();
      if (place?.id !== id) return;
      items = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.created?.seconds || 0) - (a.created?.seconds || 0));
      state = 'ready';
    } catch { if (place?.id === id) state = 'error'; }
    draw();
  };
  document.addEventListener('meridian:place', e => { place = e.detail; load(); });

  /* ---------- add form ---------- */
  const dlg = $('#contribute'), form = $('#contribute-form');
  const openForm = async () => {
    if (!place) return;
    if (!await signIn()) return;
    form.reset();
    $('#contribute-title').textContent = `Add to ${place.name}`;
    $('#c-cat').innerHTML = CATS.map(c => `<option>${c}</option>`).join('');
    $('#contribute-who').textContent = `You are adding this as ${me.displayName || me.email}. Everyone can see it.`;
    dlg.showModal();
  };
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(form), name = String(f.get('name')).trim(), note = String(f.get('note')).trim(), url = String(f.get('url')).trim();
    if (name.length < 2) return say('Please give it a name.');
    if (url && !/^https:\/\/\S+$/.test(url)) return say('Links must start with https://');
    const send = $('#c-send'); send.disabled = true;
    const pin = f.get('pin') ? window.Meridian?.mapCentre() : null;
    const doc = { placeId: place.id, placeName: place.name, kind: String(f.get('kind')), cat: String(f.get('cat')), name: name.slice(0, 80), note: note.slice(0, 600), url: url.slice(0, 300),
      lat: pin ? +pin.lat.toFixed(5) : null, lng: pin ? +pin.lng.toFixed(5) : null, uid: me.uid, author: (me.displayName || 'A traveller').slice(0, 60), created: fb.firestore.FieldValue.serverTimestamp() };
    try { await fb.firestore().collection('contributions').add(doc); dlg.close(); say('Thank you. Your note is now live for everyone.'); load(); }
    catch (err) { console.warn('contribution', err); say(`It could not be saved (${err.code || 'network problem'}). Please try again.`); }
    send.disabled = false;
  });
  $('#close-contribute')?.addEventListener('click', () => dlg.close());
  box?.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'add') openForm();
    else if (act === 'all') { showAll = true; draw(); }
    else if (act === 'show') window.Meridian?.show(+b.dataset.lat, +b.dataset.lng);
    else if (act === 'del' && confirm('Remove your note for everyone?')) {
      try { await fb.firestore().collection('contributions').doc(b.dataset.id).delete(); load(); } catch { say('It could not be removed.'); }
    }
  });

  window.MeridianAuth = { user: () => me, signIn, ready: start, fb: () => fb };
  drawUser();
  place = window.Meridian?.current?.() || null; if (place) load();   // a place opened before this file loaded
  if (CFG.firebase) start().catch(() => {});   // restores an earlier sign-in
})();
