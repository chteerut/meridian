/* Meridian social: share a trip with your story, browse the community feed, follow travellers, copy a trip into your own plan.
   With a Firebase config (js/config.js) trips are public and need a Google sign-in to publish.
   Without one the site runs in preview mode: everything works but is saved only in this browser. */
(() => {
  'use strict';
  const CFG = window.MERIDIAN_CONFIG || {}, LIVE = !!CFG.firebase;
  const A = () => window.MeridianAuth, M = () => window.Meridian;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const say = m => M()?.toast(m);
  const PREVIEW = { uid: 'preview-you', displayName: 'You (preview)' };
  let previewUser = null, tab = 'latest', list = [], following = [], state = 'idle', detail = null;
  const user = () => LIVE ? A()?.user() : previewUser;

  /* ---------- storage: this browser (preview) or Firestore (live) ---------- */
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('meridian.social.' + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('meridian.social.' + k, JSON.stringify(v)); } catch { /* storage blocked */ } },
  };
  const EXAMPLES = [
    { id: 'example-thailand', example: true, uid: 'example-1', author: 'Meridian example', title: 'Ten easy days in Thailand', status: 'done', days: 10, created: Date.UTC(2026, 9, 2),
      story: 'This is an example trip, shown so you can see how shared trips look. Real travellers will tell their own story here: what they loved, what they would skip, and what they wish they had known before going.',
      stops: [{ id: 'bangkok', name: 'Bangkok', country: 'Thailand', lat: 13.7563, lng: 100.5018, days: 4, places: ['Grand Palace', 'Wat Arun', 'Chatuchak Weekend Market'], notes: 'Go to the temples early, before the heat.' },
        { id: 'chiang-mai', name: 'Chiang Mai', country: 'Thailand', lat: 18.7883, lng: 98.9853, days: 6, places: ['Wat Phra That Doi Suthep', 'Wat Chedi Luang'], notes: 'Slow mornings and night markets.' }] },
    { id: 'example-japan', example: true, uid: 'example-2', author: 'Meridian example', title: 'Tokyo and Kyoto for first timers', status: 'plan', days: 8, created: Date.UTC(2026, 8, 14),
      story: 'Another example. A plan that has not happened yet can be shared too, so friends can follow along and give advice.',
      stops: [{ id: 'tokyo', name: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503, days: 4, places: ['Sensō-ji', 'Shibuya Crossing', 'Meiji Shrine'], notes: '' },
        { id: 'kyoto', name: 'Kyoto', country: 'Japan', lat: 35.0116, lng: 135.7681, days: 4, places: ['Fushimi Inari-taisha', 'Kinkaku-ji'], notes: '' }] },
  ];
  const byNew = (a, b) => b.created - a.created;
  const local = {
    async latest() { return [...LS.get('trips', []), ...EXAMPLES].sort(byNew); },
    async mine(uid) { return LS.get('trips', []).filter(t => t.uid === uid).sort(byNew); },
    async byUids(uids) { return (await this.latest()).filter(t => uids.includes(t.uid)); },
    async get(id) { return (await this.latest()).find(t => t.id === id) || null; },
    async add(doc) { const t = { ...doc, id: 'p' + Date.now(), created: Date.now() }; LS.set('trips', [t, ...LS.get('trips', [])]); return t.id; },
    async del(id) { LS.set('trips', LS.get('trips', []).filter(t => t.id !== id)); },
    async following() { return LS.get('follows', []); },
    async follow(uid, to, toName) { LS.set('follows', [...LS.get('follows', []).filter(f => f.to !== to), { to, toName }]); },
    async unfollow(uid, to) { LS.set('follows', LS.get('follows', []).filter(f => f.to !== to)); },
  };
  const norm = d => { const v = d.data(); return { ...v, id: d.id, created: v.created?.toMillis ? v.created.toMillis() : Date.now() }; };
  const col = n => A().fb().firestore().collection(n);
  // always ask the server first: the default read can answer from an empty local cache right after a write
  const fresh = q => q.get({ source: 'server' }).catch(() => q.get());
  const cloud = {
    async latest() { return (await fresh(col('trips').orderBy('created', 'desc').limit(30))).docs.map(norm); },
    async mine(uid) { return (await fresh(col('trips').where('uid', '==', uid).limit(50))).docs.map(norm).sort(byNew); },
    async byUids(uids) { return uids.length ? (await fresh(col('trips').where('uid', 'in', uids.slice(0, 30)).limit(50))).docs.map(norm).sort(byNew) : []; },
    async get(id) { const d = await fresh(col('trips').doc(id)); return d.exists ? norm(d) : null; },
    async add(doc) { return (await col('trips').add({ ...doc, created: A().fb().firestore.FieldValue.serverTimestamp() })).id; },
    async del(id) { await col('trips').doc(id).delete(); },
    async following(uid) { return (await fresh(col('follows').where('from', '==', uid).limit(100))).docs.map(d => d.data()); },
    async follow(uid, to, toName) { await col('follows').doc(`${uid}_${to}`).set({ from: uid, to, toName, created: A().fb().firestore.FieldValue.serverTimestamp() }); },
    async unfollow(uid, to) { await col('follows').doc(`${uid}_${to}`).delete(); },
  };
  const db = LIVE ? cloud : local;
  const ready = async () => { if (LIVE) await A().ready(); };
  const need = async () => {   // a signed-in traveller, or null
    if (LIVE) return (await A().signIn()) ? A().user() : null;
    if (!previewUser) { previewUser = PREVIEW; say('Preview mode: what you share is saved only in this browser until Google sign-in is connected.'); }
    return previewUser;
  };

  /* ---------- feed ---------- */
  const dlg = $('#feed'), body = $('#feed-body');
  const day = t => new Date(t).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' });
  const routeLine = t => t.stops.map(s => esc(s.name)).join(' <i class="ph ph-arrow-right" aria-hidden="true"></i> ');
  const avatar = t => `<span class="avatar" aria-hidden="true">${esc((t.author || '?').trim()[0].toUpperCase())}</span>`;
  const card = t => `<article class="trip-card" data-id="${esc(t.id)}">
      <div class="tc-top">${avatar(t)}<div><strong>${esc(t.author)}</strong><small>${day(t.created)}${t.example ? ' | Example trip' : ''}</small></div>
        <span class="tc-tag">${t.status === 'done' ? 'Trip done' : 'Planning'}</span></div>
      <h3>${esc(t.title)}</h3>
      <p class="tc-route">${routeLine(t)}</p>
      ${t.story ? `<p class="tc-story">${esc(t.story.slice(0, 170))}${t.story.length > 170 ? '...' : ''}</p>` : ''}
      <div class="spot-actions"><span class="tc-meta">${t.days} ${t.days === 1 ? 'day' : 'days'}, ${t.stops.length} ${t.stops.length === 1 ? 'stop' : 'stops'}</span>
        <button class="pill add" type="button" data-act="open"><i class="ph ph-book-open"></i>Read trip</button></div>
    </article>`;
  const TABS = [['latest', 'Latest'], ['following', 'Following'], ['mine', 'My trips']];
  const empty = (icon, text, extra = '') => `<div class="empty-state"><i class="ph ${icon}"></i><p>${text}</p>${extra}</div>`;

  function draw() {
    if (detail) return drawDetail();
    const u = user();
    const msg = state === 'loading' ? '<p class="note">Loading trips.</p>'
      : state === 'error' ? empty('ph-plugs', 'Trips could not load right now. Please try again in a moment.')
      : !list.length ? (tab === 'following' ? empty('ph-user-plus', u ? 'You are not following anyone yet. Open a trip and press Follow to see that traveller here.' : 'Sign in to follow travellers and see their trips here.')
        : tab === 'mine' ? empty('ph-paper-plane-tilt', 'You have not shared a trip yet. Build one in My trip, then press Share this trip.')
        : empty('ph-globe-hemisphere-east', 'No trips shared yet. Be the first to share yours.')) : '';
    body.innerHTML = `${LIVE ? '' : '<p class="note preview-note"><i class="ph ph-info"></i> Preview mode. Shared trips are saved only in this browser until Google sign-in is connected.</p>'}
      <div class="chips" data-tabs>${TABS.map(([k, l]) => `<button class="chip" type="button" data-tab="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</div>
      ${msg}<div class="trip-grid">${state === 'ready' ? list.map(card).join('') : ''}</div>`;
  }

  async function load() {
    state = 'loading'; list = []; draw();
    const mine = tab;
    try {
      await ready();
      const u = user();
      if (u) following = await db.following(u.uid).catch(() => []);
      const out = tab === 'latest' ? await db.latest() : !u ? [] : tab === 'mine' ? await db.mine(u.uid) : await db.byUids(following.map(f => f.to));
      if (mine !== tab) return;
      list = out; state = 'ready';
    } catch { state = 'error'; }
    draw();
  }

  function drawDetail() {
    const t = detail, u = user(), isMine = u && u.uid === t.uid, isFollowing = following.some(f => f.to === t.uid);
    body.innerHTML = `<button class="pill" type="button" data-act="back"><i class="ph ph-arrow-left"></i>All trips</button>
      <article class="trip-full">
        <div class="tc-top" style="margin-top:14px">${avatar(t)}<div><strong>${esc(t.author)}</strong><small>${day(t.created)}${t.example ? ' | Example trip' : ''}</small></div>
          ${isMine || t.example ? '' : `<button class="pill ${isFollowing ? 'is-on' : 'add'}" type="button" data-act="follow" aria-pressed="${isFollowing}"><i class="ph ${isFollowing ? 'ph-check' : 'ph-user-plus'}"></i>${isFollowing ? 'Following' : 'Follow'}</button>`}</div>
        <h3 class="tf-title">${esc(t.title)}</h3>
        <p class="tc-route">${routeLine(t)}</p>
        <p class="tc-meta">${t.status === 'done' ? 'Trip done' : 'Planning'}, ${t.days} ${t.days === 1 ? 'day' : 'days'}, ${t.stops.length} ${t.stops.length === 1 ? 'stop' : 'stops'}</p>
        ${t.story ? `<p class="tf-story">${esc(t.story)}</p>` : ''}
        <ol class="tf-stops">${t.stops.map((s, i) => `<li><span class="stop-num">${i + 1}</span><div>
          <strong>${esc(s.name)}</strong><small>${esc([s.country, `${s.days} ${s.days === 1 ? 'day' : 'days'}`].filter(Boolean).join(' | '))}</small>
          ${s.places?.length ? `<div class="stop-places">${s.places.map(p => `<span class="tag">${esc(p)}</span>`).join('')}</div>` : ''}
          ${s.notes ? `<p>${esc(s.notes)}</p>` : ''}</div></li>`).join('')}</ol>
        <div class="plan-actions">
          <button class="btn btn-accent" type="button" data-act="use"><i class="ph ph-copy"></i><span>Use this trip as my plan</span></button>
          <button class="btn btn-ghost" type="button" data-act="link"><i class="ph ph-link"></i><span>Copy link</span></button>
          ${isMine ? '<button class="btn btn-ghost" type="button" data-act="del"><i class="ph ph-trash"></i><span>Remove my trip</span></button>' : ''}
        </div>
      </article>`;
    dlg.scrollTop = 0;
  }

  const openFeed = async id => {
    detail = null;
    if (!dlg.open) dlg.showModal();
    if (id) {
      body.innerHTML = '<p class="note">Loading trip.</p>';
      try { await ready(); detail = await db.get(id); const u = user(); if (u) following = await db.following(u.uid).catch(() => []); } catch { detail = null; }
      if (detail) return draw();
      say('That trip could not be found.');
    }
    load();
  };

  body.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]'), b = e.target.closest('[data-act]'), act = b?.dataset.act;
    if (t) { tab = t.dataset.tab; if (tab !== 'latest' && !user() && LIVE) await need(); return load(); }
    if (!act) return;
    if (act === 'open') { detail = list.find(x => x.id === b.closest('.trip-card').dataset.id) || null; return draw(); }
    if (act === 'back') { detail = null; return list.length ? draw() : load(); }
    if (!detail) return;
    if (act === 'use') {
      const mine = M().getTrip();
      if (mine.stops.length && !confirm('Replace the plan you have now with this trip?')) return;
      M().setTrip({ name: detail.title, stops: detail.stops.map(s => ({ ...s, places: [...(s.places || [])], notes: s.notes || '' })) });
      dlg.close(); say('Trip copied to My trip. Change anything you like.');
    } else if (act === 'link') {
      const url = `${location.origin}${location.pathname}?trip=${encodeURIComponent(detail.id)}`;
      try { await navigator.clipboard.writeText(url); say('Link copied'); } catch { prompt('Copy this link', url); }
    } else if (act === 'follow') {
      const u = await need(); if (!u) return;
      const on = following.some(f => f.to === detail.uid);
      try {
        if (on) { await db.unfollow(u.uid, detail.uid); following = following.filter(f => f.to !== detail.uid); }
        else { await db.follow(u.uid, detail.uid, detail.author); following.push({ to: detail.uid, toName: detail.author }); say(`You now follow ${detail.author}`); }
      } catch { say('That did not work. Please try again.'); }
      draw();
    } else if (act === 'del' && confirm('Remove this shared trip for everyone?')) {
      try { await db.del(detail.id); detail = null; say('Shared trip removed'); load(); } catch { say('It could not be removed.'); }
    }
  });
  $('#open-feed')?.addEventListener('click', () => openFeed());
  $('#close-feed')?.addEventListener('click', () => dlg.close());

  /* ---------- share my trip ---------- */
  const sdlg = $('#share-trip'), form = $('#share-form');
  $('#trip-share')?.addEventListener('click', async () => {
    const t = M().getTrip();
    if (!t.stops.length) return say('Your trip is empty. Open a city and press Add to my trip first, then share.');
    const u = await need(); if (!u) return;
    form.reset();
    $('#s-title').value = t.name || (t.stops.length > 1 ? `${t.stops[0].name} to ${t.stops[t.stops.length - 1].name}` : `My trip to ${t.stops[0].name}`);
    $('#share-who').textContent = `Sharing as ${u.displayName || 'you'}. ${LIVE ? 'Everyone can see it.' : 'Preview mode: saved only in this browser.'} Your stops, places and notes are included.`;
    sdlg.showModal();
  });
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const u = user(); if (!u) return;
    const f = new FormData(form), t = M().getTrip(), title = String(f.get('title')).trim();
    if (title.length < 3) return say('Please give your trip a title.');
    const stops = t.stops.slice(0, 40).map(s => ({ id: String(s.id), name: String(s.name).slice(0, 80), country: String(s.country || '').slice(0, 80), lat: +s.lat, lng: +s.lng, days: +s.days || 1,
      places: (s.places || []).slice(0, 30).map(p => String(p).slice(0, 100)), notes: String(s.notes || '').slice(0, 1200), ...(s.meta ? { meta: s.meta } : {}) }));
    const doc = { uid: u.uid, author: (u.displayName || 'A traveller').slice(0, 60), title: title.slice(0, 100), story: String(f.get('story')).trim().slice(0, 4000),
      status: f.get('status') === 'done' ? 'done' : 'plan', days: stops.reduce((a, s) => a + s.days, 0), stops };
    const send = $('#s-send'); send.disabled = true;
    try { await ready(); const id = await db.add(doc); sdlg.close(); say('Your trip is shared.'); tab = 'mine'; openFeed(id); }
    catch (err) { console.warn('share trip', err); say(`It could not be shared (${err.code || 'network problem'}). Please try again.`); }
    send.disabled = false;
  });
  $('#close-share')?.addEventListener('click', () => sdlg.close());

  const linked = new URLSearchParams(location.search).get('trip');
  if (linked) openFeed(linked);
})();
