// Scene definitions. Every on-screen label is copied from the resident app (see the label checks in the PR notes).
// Everything shown is pretend: Pat Sample, 123 Example Street, example.com, amounts that are plain round numbers.
// Time specs are explained in runtime.js. Lines are numbered per scene as in script.json.
;(function () {
  const ic = (n) => window.ICONS[n]
  const F = (cls, from, to, inner, extra) =>
    `<div class="${cls} cue" data-from="${from}"${to ? ` data-to="${to}"` : ''} ${extra || ''}>${inner}</div>`
  // A full app screen that is visible between two moments.
  const scr = (from, to, inner) => F('scr', from, to, inner)
  const tap = (from, dur) => `<i class="tap cue" data-from="${from}" data-dur="${dur || 1}"></i>`
  const ring = (from, to) => `<i class="ring cue" data-from="${from}" data-to="${to}"></i>`
  const typed = (from, text, secs) => `<span class="type cue" data-from="${from}" data-typing="${secs || 1.4}">${text}</span>`

  // ---------- Resident app chrome ----------
  const top = (helpInner) =>
    `<div class="topbar"><div class="org"><span class="sq">${ic('Home')}</span>Madison Park</div>` +
    `<div class="right"><span class="helpbtn">${ic('CircleHelp')}Hello Pat${helpInner || ''}</span><span class="avatar">PS</span></div></div>`
  const TABS = [
    ['home', 'Home', 'Home'],
    ['dues', 'Dues', 'CreditCard'],
    ['requests', 'Requests', 'LayoutGrid'],
    ['ask', 'Ask', 'Sparkles'],
    ['account', 'Account', 'CircleUser'],
  ]
  const tabs = (active, extras) =>
    `<div class="tabbar">${TABS.map(
      ([k, label, icon]) => `<div class="tab${k === active ? ' active' : ''}">${ic(icon)}<span>${label}</span>${(extras && extras[k]) || ''}</div>`,
    ).join('')}</div>`
  const head = (title, sub, back) =>
    `<div class="sh">${back ? `<div class="back">${ic('ChevronLeft')}${back}</div>` : ''}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`
  const tile = (icon, tone, label, hint, extra, cls) =>
    `<div class="tile ${cls || ''}"><span class="it ${tone || ''}">${ic(icon)}</span><span><b>${label}</b><small>${hint}</small></span>${extra || ''}</div>`
  const row = (icon, title, sub, extra) =>
    `<div class="row"><span class="it">${ic(icon)}</span><span><b>${title}</b><small>${sub}</small></span><span class="chev">${ic('ChevronRight')}</span>${extra || ''}</div>`

  // The resident home screen. `x` adds cues inside named elements; `panCues` scrolls it.
  function home(x) {
    x = x || {}
    return (
      `<div class="body stack pan" style="padding-top:12px">` +
      (x.prompt || '') +
      `<div><div class="eyebrow">Friday, November 6 · Madison Park</div><div style="font-size:28px;font-weight:700;letter-spacing:-.015em;margin-top:2px">Good morning, Pat</div></div>` +
      `<div class="hero"><div class="eyebrow">Balance due</div><div class="v">$150.00</div><div class="f">Next due Nov 15, 2026</div></div>` +
      `<div class="btn">${ic('Send')}Pay $150.00${x.pay || ''}</div>` +
      `<div class="tiles">` +
      tile('MessageSquarePlus', '', 'New request', 'Maintenance, noise, billing') +
      tile('Sparkles', 'ai', 'Ask the Docs', 'Your rules, answered') +
      tile('FileText', '', 'Documents', 'CC&amp;Rs, bylaws, rules', x.documents) +
      tile('ClipboardList', 'em', 'Start an ARC', 'Exterior changes') +
      tile('ShieldAlert', 'am', 'Report a concern', 'Tell the board') +
      tile('CreditCard', '', 'Dues', 'Balance &amp; charges') +
      tile('CalendarDays', '', 'Meetings', 'Dates and agendas') +
      tile('Megaphone', '', 'Announcements', 'News from your board', '<span class="badge">2 new</span>' + (x.announcements || '')) +
      tile('UsersRound', '', 'Community', 'Polls, book a space, talk with neighbors', x.community, 'wide') +
      `</div>` +
      (x.pans || '') +
      `</div>`
    )
  }
  const homeScreen = (x, helpInner, tabExtras) => top(helpInner) + home(x) + tabs('home', tabExtras)
  const pan = (from, to, y) => `<u class="cue" data-from="${from}" data-to="${to}" data-y="${y}"></u>`

  // The sign-in prompt shown after an email-link sign-in (ChoosePasswordPrompt.tsx).
  const prompt = (chooseExtra) =>
    `<div class="prompt"><p class="t">Choose a password for next time (optional).</p><p class="s">Or skip; we can always email you a sign-in link.</p>` +
    `<div class="bs"><div class="btn sm" style="position:relative">Choose a password${chooseExtra || ''}</div><div class="btn sm sec">Skip</div></div></div>`

  // Sign-in page (LoginView / LoginMethods / PasswordForm / MagicLinkForm).
  const signIn = (tab, extras) => {
    extras = extras || {}
    const p = tab === 'password'
    return (
      `<div style="padding:14px 16px">` +
      `<div style="text-align:center;margin:6px 0 14px"><img src="brand/logo-mark-512.png" width="56" height="56" style="border-radius:14px"><div style="font-size:26px;font-weight:700;margin-top:8px;letter-spacing:-.015em">Sign in to HomeownerHub</div>` +
      `<div style="font-size:16px;color:var(--muted);margin-top:4px">New to HomeownerHub? <b style="color:var(--primary)">Create an account</b></div></div>` +
      `<div class="seg"><div class="s ${p ? 'act' : ''}">${ic('KeyRound')}Password${extras.password || ''}</div><div class="s ${p ? '' : 'act now'}">${ic('Mail')}Email me a link${extras.link || ''}</div></div>` +
      `<div class="field"><label>Email address</label><div class="in">${ic('Mail')}<span>${extras.email || '<span class="ph">you@example.com</span>'}</span></div>` +
      (p ? '' : `<div class="hint">We’ll email you a one-time link. No password needed.</div>`) +
      `</div>` +
      (p
        ? `<div class="field"><label style="display:flex;justify-content:space-between">Password<b style="color:var(--primary);font-size:15px">Forgot password?</b></label><div class="in">${ic('Lock')}<span class="ph">••••••••</span></div></div>`
        : '') +
      `<div class="btn" style="margin-top:18px">${p ? 'Sign in' : 'Email me a sign-in link'}${extras.submit || ''}</div></div>`
    )
  }

  const S = {}

  // ---------- 1. Welcome ----------
  S.welcome = {
    card: true,
    html:
      `<div class="card-scene">` +
      F('fadein', '@0.1', '', `<img class="mk" src="brand/logo-mark-512.png" alt="">`) +
      F('fadein', '0s+0', '', `<h1>Madison Park</h1>`) +
      F('fadein', '0s+0.9', '', `<div class="loc">Johns Creek, Georgia</div>`) +
      F('fadein', '0s+1.5', '', `<div class="to">is moving to <em>HomeownerHub</em></div>`) +
      F('fadein', '1s+0', '', `<div class="icons3"><div class="i">${ic('CreditCard')}Dues</div><div class="i">${ic('MessageSquarePlus')}Requests</div><div class="i">${ic('Megaphone')}News</div></div>`) +
      `</div>`,
  }

  // ---------- 2. Sign in ----------
  S.setup = {
    html:
      scr(
        '@0',
        '1s+0.1',
        `<div class="mailhead"><div class="f">From: HomeownerHub</div><div class="f">To: pat.sample@example.com</div><div class="sub">Join Madison Park on HomeownerHub</div></div>` +
          `<div class="mailbody">` +
          `<div class="btn">Accept your invitation${ring('0s+3.4', '0e')}${tap('0e-0.9', 0.9)}</div>` +
          `<p class="small">This link works for 24 hours. If it stops working, ask your board to send a new one.</p></div>`,
      ) +
      scr('1s', '2s+2.4', top() + `<div class="body stack" style="padding-top:12px">${prompt()}<div><div class="eyebrow">Friday, November 6 · Madison Park</div><div style="font-size:28px;font-weight:700;margin-top:2px">Good morning, Pat</div></div><div class="hero"><div class="eyebrow">Balance due</div><div class="v">$150.00</div><div class="f">Next due Nov 15, 2026</div></div></div>`) +
      scr(
        '2s',
        '2s+1.9',
        signIn('password', { link: ring('2s+0.2', '2s+1.8') + tap('2s+1.0', 0.9) }),
      ) +
      scr(
        '2s+1.9',
        '2s+3.3',
        signIn('link', { email: typed('2s+2.0', 'pat.sample@example.com', 1.0), submit: '' }),
      ) +
      scr('2s+3.3', '', top() + `<div class="body stack" style="padding-top:12px">${prompt(ring('2s+3.5', 'end') + tap('2e-0.6', 0.9))}<div><div class="eyebrow">Friday, November 6 · Madison Park</div><div style="font-size:28px;font-weight:700;margin-top:2px">Good morning, Pat</div></div><div class="hero"><div class="eyebrow">Balance due</div><div class="v">$150.00</div><div class="f">Next due Nov 15, 2026</div></div></div>`),
  }

  // ---------- 3. Add to the home screen ----------
  const fake = (bg, icon, label) => `<div class="app"><div class="ico" style="background:${bg}">${ic(icon)}</div>${label}</div>`
  S.install = {
    html:
      // iPhone home screen with the new icon.
      F(
        'scr ios-wall',
        '@0',
        '1s',
        `<div class="ios-grid">` +
          fake('#3B82F6', 'Mail', 'Mail') +
          fake('#EF4444', 'CalendarDays', 'Calendar') +
          fake('#22C55E', 'Smartphone', 'Phone') +
          fake('#64748B', 'Info', 'Settings') +
          fake('#10B981', 'MessageSquarePlus', 'Messages') +
          fake('#0EA5E9', 'Landmark', 'Bank') +
          fake('#F59E0B', 'Lock', 'Wallet') +
          fake('#8B5CF6', 'Wrench', 'Tools') +
          F('app hub', '0s+0.9', '', `<div class="ico"><img src="brand/logo-mark-512.png" alt=""></div>HomeownerHub${ring('0s+1.6', '0s+3.1')}${tap('0s+2.3', 0.9)}`, '') +
          `</div>`,
      ) +
      // The app opens from the new icon.
      scr('0s+3.1', '1s', top() + home() + tabs('home')) +
      // iPhone Safari: Share, Add to Home Screen, Add.
      F(
        'scr',
        '1s',
        '2s-0.1',
        `<div class="page-ghost"><div style="font-size:26px;font-weight:700">Madison Park</div><div class="bar" style="width:80%"></div><div class="bar" style="width:60%"></div><div class="bar" style="width:90%"></div><div class="bar" style="width:50%"></div></div>` +
          `<div class="safari-bar"><div class="url">${ic('Lock')}HomeownerHub</div><div class="tb"><span class="b">${ic('ChevronLeft')}</span><span class="b">${ic('ChevronRight')}</span>` +
          `<span class="b">${ic('Share')}${ring('1s+0.4', '1s+1.8')}${tap('1s+1.1', 0.9)}</span><span class="b">${ic('FileText')}</span><span class="b">${ic('Copy')}</span></div></div>` +
          `<div class="shade cue" data-from="1s+1.9" data-to="1e+1.4"></div>` +
          F(
            'sheet',
            '1s+1.9',
            '1s+4.3',
            `<div class="grab"></div><div class="ttl"><img src="brand/logo-mark-512.png" alt=""><div><b>HomeownerHub</b><small>Madison Park</small></div></div>` +
              `<div class="it">Copy${ic('Copy')}</div><div class="it">Add Bookmark${ic('FileText')}</div>` +
              `<div class="it">Add to Home Screen${ic('SquarePlus')}${ring('1s+2.4', '1s+4.2')}${tap('1s+3.3', 0.9)}</div>`,
          ) +
          F(
            'dialog',
            '1s+4.3',
            '1e+1.4',
            `<h4>Add to Home Screen</h4><div class="pv"><img src="brand/logo-mark-512.png" alt=""><div><b>HomeownerHub</b></div></div>` +
              `<div class="bt"><div class="btn sec">Cancel</div><div class="btn">Add${ring('1e-0.1', '1e+1.4')}${tap('1e+0.5', 0.9)}</div></div>`,
          ),
      ) +
      // Android Chrome: menu, Install app.
      F(
        'scr',
        '2s-0.1',
        '',
        `<div class="chrome-bar"><div class="url">${ic('Lock')}HomeownerHub</div><span class="dots">${ic('EllipsisVertical')}${ring('2s+0.2', '2e')}${tap('2e-0.9', 0.9)}</span></div>` +
          `<div class="page-ghost" style="padding-top:110px"><div style="font-size:26px;font-weight:700">Madison Park</div><div class="bar" style="width:80%"></div><div class="bar" style="width:60%"></div><div class="bar" style="width:90%"></div></div>` +
          `<div class="shade cue" data-from="2e+0.1" data-to="3e+0.3"></div>` +
          F(
            'menu',
            '2e+0.1',
            '3e+0.3',
            `<div class="mi">${ic('SquarePlus')}New tab</div><div class="mi">${ic('FileText')}Bookmarks</div><div class="mi">${ic('Download')}Downloads</div>` +
              `<div class="mi hl">${ic('Download')}Install app${ring('3s+0.6', '3e+0.3')}${tap('3e-0.7', 0.9)}</div><div class="mi">${ic('Info')}Settings</div>`,
          ) +
          `<div class="shade cue" data-from="3e+0.4" data-to="end"></div>` +
          F(
            'dialog',
            '3e+0.4',
            '',
            `<h4>Install app?</h4><div class="pv"><img src="brand/logo-mark-512.png" alt=""><div><b>HomeownerHub</b></div></div>` +
              `<div class="bt"><div class="btn sec">Cancel</div><div class="btn">Install${ring('3e+0.7', 'end')}${tap('3e+1.0', 0.9)}</div></div>`,
          ),
      ),
  }

  // ---------- 4. Dues and statement ----------
  const duesScreen = (extra) =>
    top() +
    head('Dues', 'Your balance and the homes it covers.') +
    `<div class="body stack" style="padding-top:12px">` +
    `<div class="hero"><div class="eyebrow">Current balance</div><div class="v">$150.00</div><div class="f">1 open charge</div></div>` +
    `<div class="btn">${ic('Send')}Pay $150.00${(extra && extra.pay) || ''}</div>` +
    row('CreditCard', 'Quarterly dues', '123 Example Street · due Nov 15') +
    `<div style="font-size:18px;font-weight:700;color:var(--primary);position:relative;display:inline-block;padding:8px 0">View statement${(extra && extra.statement) || ''}</div>` +
    `</div>` +
    tabs('dues')
  S.dues = {
    html:
      scr('@0', '0s+1.3', homeScreen(null, '', { dues: ring('0s+0.1', '0s+1.0') + tap('0s+0.6', 0.8) })) +
      scr('0s+1.3', '0s+3.0', duesScreen({ statement: ring('0s+1.8', '0s+3.0') + tap('0s+2.3', 0.8) })) +
      scr(
        '0s+3.0',
        '1s+0.4',
        top() +
          head('Statement', '', 'Dues') +
          `<div class="body" style="padding-top:8px"><div class="doc"><div style="font-size:19px;font-weight:700">Statement</div><div style="font-size:15px;color:var(--muted);margin:2px 0 8px">123 Example Street · Pat Sample</div>` +
          `<table><tr><th>Date</th><th>Charge or payment</th><th class="r">Amount</th></tr>` +
          `<tr><td>Nov 1</td><td>Quarterly dues</td><td class="r">$150.00</td></tr>` +
          `<tr><td>Oct 3</td><td>Payment received</td><td class="r">-$150.00</td></tr>` +
          `<tr><td>Aug 1</td><td>Quarterly dues</td><td class="r">$150.00</td></tr>` +
          `<tr><td>Jul 8</td><td>Payment received</td><td class="r">-$150.00</td></tr></table></div></div>` +
          tabs('dues') +
          tap('1s+0.2', 0.6).replace('class="tap cue"', 'class="tap cue" style="left:44px;top:92px"'),
      ) +
      scr('1s+0.4', '1s+1.2', duesScreen({ pay: ring('1s+0.3', '1s+1.2') + tap('1s+0.55', 0.7) })) +
      // The real Pay dues screen with Zelle and check both on (PayMethods.tsx, CheckPayCard.tsx).
      scr(
        '1s+1.2',
        '',
        top() +
          `<div class="body stack pan" style="padding-top:0">` +
          head('Pay dues', 'Pay with Zelle or by check.', 'Dues') +
          `<div class="hero" style="margin-top:6px"><div class="eyebrow">Amount due</div><div class="v">$150.00</div><div class="f">1 open charge</div></div>` +
          `<div class="eyebrow" style="padding-top:4px">How to pay</div>` +
          `<div class="card stack">` +
          `<div class="step"><span class="n">1</span><h3>Open Zelle in your bank’s app</h3></div>` +
          `<div class="step"><span class="n">2</span><div style="flex:1"><h3>Send to</h3><div class="copy"><div><small>Zelle recipient</small><span>board@example.com</span></div>${ic('Copy')}</div></div></div>` +
          `<div class="step"><span class="n">3</span><div style="flex:1"><h3>Enter the amount and memo exactly</h3><div class="copy"><div><small>Amount</small><span>$150.00</span></div>${ic('Copy')}</div><div class="copy"><div><small>Memo</small><span>EXAMPLE-0001</span></div>${ic('Copy')}</div></div></div>` +
          `</div>` +
          `<div class="card"><div style="display:flex;align-items:center;gap:8px;font-size:20px;font-weight:700"><span style="width:22px;height:22px;display:inline-flex">${ic('Mail')}</span>Pay by check</div>` +
          `<div style="margin-top:10px;font-size:14px;font-weight:600;color:var(--muted)">Make checks payable to</div><div style="font-size:18px;font-weight:600">Madison Park Homeowners Association</div>` +
          `<div style="margin-top:8px;font-size:14px;font-weight:600;color:var(--muted)">Mail to</div><div style="font-size:18px;font-weight:600">PO Box 0000, Johns Creek, GA 30000</div>` +
          `<div style="margin-top:8px;font-size:14px;font-weight:600;color:var(--muted)">Amount due</div><div style="font-size:18px;font-weight:600">$150.00</div>` +
          `<p style="margin-top:10px;font-size:17px">Write your home address or account number on the check.</p></div>` +
          `<u class="cue" data-from="1s+3.2" data-y="-400"></u>` +
          `</div>` +
          tabs('dues'),
      ),
  }

  // ---------- 5. Requests ----------
  S.requests = {
    html:
      scr('@0', '0s+1.6', homeScreen(null, '', { requests: ring('0s+0.2', '0s+1.5') + tap('0s+0.9', 0.8) })) +
      scr(
        '0s+1.6',
        '0e+0.1',
        top() +
          head('Requests', 'Start something new, or track what you’ve already sent your board.') +
          `<div class="body stack" style="padding-top:12px">` +
          `<div class="row" style="border-color:var(--primary)">${`<span class="it" style="background:var(--primary-subtle);color:var(--primary)">${ic('MessageSquarePlus')}</span>`}<span><b>New support request</b><small>Maintenance, noise, parking, billing and more</small></span>${ring('0s+2.6', '0e+0.1')}${tap('0e-0.8', 0.8)}</div>` +
          row('ClipboardList', 'Architectural request (ARC)', 'Approval for a fence, paint, addition…') +
          row('ShieldAlert', 'Report a concern', 'Flag something in the community to the board') +
          `</div>` +
          tabs('requests'),
      ) +
      scr(
        '0e+0.1',
        '',
        top() +
          head('New support request', 'Tell the board what’s going on. You’ll get replies right here.', 'Requests') +
          `<div class="body" style="padding-top:2px">` +
          `<div class="field" style="margin-top:8px"><label>Home</label><div class="in">123 Example Street</div></div>` +
          `<div class="field" style="margin-top:8px"><label>Category</label><div class="in">Maintenance request</div></div>` +
          `<div class="field" style="margin-top:8px"><label>Subject</label><div class="in">${typed('1s+0.1', 'Light is out by the mailboxes', 1.6)}</div></div>` +
          `<div class="field" style="margin-top:8px"><label>Description</label><div class="in ta">${F('', '1s+1.3', '', 'The light by the mailboxes has been out for a week. It is very dark at night.', 'style="display:block;transition:opacity .6s"')}</div></div>` +
          `<div style="display:flex;gap:10px;margin-top:12px"><div class="btn sec" style="width:110px">Cancel</div><div class="btn" style="flex:1">${ic('Send')}Send request${ring('1s+2.0', '1e+0.6')}${tap('1e-0.6', 0.9)}</div></div>` +
          `</div>`,
      ),
  }

  // ---------- 6. Book a space ----------
  const calDays = () => {
    const names = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
    let h = names.map((n) => `<div class="dn">${n}</div>`).join('')
    // November 2026 starts on a Sunday. Days before the 6th have passed.
    for (let d = 1; d <= 30; d++) {
      const past = d < 7
      const sat14 = d === 14
      h += `<div class="d ${past ? 'off' : 'free'}" ${sat14 ? 'id="d14"' : ''}>${d}${sat14 ? ring('1s+1.3', '1s+2.3') + tap('1s+1.7', 0.8) : ''}</div>`
    }
    return h
  }
  const bookTop = (n, title) => `<div class="body" style="padding-top:12px"><div class="step-of">Step ${n} of 4</div><div class="h2">${title}</div>`
  S.booking = {
    html:
      scr(
        '@0',
        '0s+3.1',
        top() + home({ pans: pan('0s+0.4', 'end', -400), community: ring('0s+1.5', '0s+3.0') + tap('0s+2.4', 0.8) }) + tabs('home'),
      ) +
      scr(
        '0s+3.1',
        '0s+4.6',
        top() +
          head('Community', 'Things to do with your neighbors and your board.') +
          `<div class="body stack" style="padding-top:12px">` +
          row('Vote', 'Polls', 'Answer quick questions from your board') +
          `<div class="row"><span class="it">${ic('CalendarDays')}</span><span><b>Book a space</b><small>Clubhouse, pool, courts</small></span><span class="chev">${ic('ChevronRight')}</span>${ring('0s+3.4', '0s+4.5')}${tap('0s+3.8', 0.8)}</div>` +
          row('UsersRound', 'Talk with neighbors', 'Start a topic or reply') +
          `</div>` +
          tabs('home'),
      ) +
      scr(
        '0s+4.6',
        '1s+0.8',
        top() +
          `<div class="sh"><h1>Book a space</h1></div>` +
          bookTop(1, 'What would you like to book?') +
          `<div class="stack" style="margin-top:12px">` +
          `<div class="row" style="border-width:2px;border-color:var(--border-strong);display:block;padding:14px"><b style="font-size:21px">Clubhouse</b><small style="font-size:16px;color:var(--fg)">Open 8 am to 10 pm. Up to 4 hours.</small><small style="font-size:16px">This booking is confirmed right away.</small>${ring('1s+0.0', '1s+0.8')}${tap('1s+0.3', 0.7)}</div>` +
          `<div class="row" style="border-width:2px;border-color:var(--border-strong);display:block;padding:14px"><b style="font-size:21px">Pool</b><small style="font-size:16px;color:var(--fg)">Open 9 am to 8 pm. Up to 2 hours.</small><small style="font-size:16px">The board will confirm this booking. We’ll let you know.</small></div>` +
          `</div></div>` +
          tabs('home'),
      ) +
      scr(
        '1s+0.8',
        '1s+2.4',
        top() +
          `<div class="sh"><h1>Book a space</h1></div>` +
          bookTop(2, 'Which day for Clubhouse?') +
          `<div class="cal"><div class="mh">${ic('ChevronLeft').replace('<svg', '<svg width="22" height="22"')}<span>November 2026</span>${ic('ChevronRight').replace('<svg', '<svg width="22" height="22"')}</div><div class="g">${calDays()}</div></div></div>` +
          tabs('home'),
      ) +
      scr(
        '1s+2.4',
        '2s-0.3',
        top() +
          `<div class="sh"><h1>Book a space</h1></div>` +
          bookTop(3, 'What time on Saturday, November 14?') +
          `<div class="slots">` +
          ['10:00 am', '11:00 am', '12:00 pm', '1:00 pm'].map((x) => `<div class="slot">${x}</div>`).join('') +
          `<div class="slot sel">2:00 pm${ring('1s+2.7', '1e+0.9')}${tap('1s+3.1', 0.7)}</div>` +
          `<div class="slot taken">3:00 pm<i>Booked</i></div><div class="slot">4:00 pm</div><div class="slot">5:00 pm</div></div>` +
          `<div style="font-size:19px;font-weight:700;margin-top:14px">How long?</div><div style="margin-top:8px"><span class="chip">1 hour</span><span class="chip sel">2 hours</span></div></div>` +
          tabs('home'),
      ) +
      scr(
        '2s-0.3',
        '',
        top() +
          `<div class="sh"><h1>Book a space</h1></div>` +
          bookTop(4, 'Check your booking') +
          `<div class="sumbox">Clubhouse, Saturday, November 14, 2:00 pm to 4:00 pm</div>` +
          `<div class="field" style="margin-top:10px"><label>What is it for? <span style="font-weight:500;color:var(--muted)">(optional)</span></label><div class="in"><span class="ph">Birthday party</span></div></div>` +
          `<div class="opt sel" style="min-height:48px;margin-top:10px"><span class="rd"></span>I read the house rules</div>` +
          `<div class="btn" style="margin-top:12px">Book it${ring('2s+0.7', 'end')}${tap('2e-0.7', 0.9)}</div></div>` +
          tabs('home'),
      ),
  }

  // ---------- 7. Announcements, documents, polls, neighbors ----------
  S.community = {
    html:
      scr(
        '@0',
        '1s-0.4',
        top() +
          home({
            pans: pan('@0.3', 'end', -250),
            announcements: ring('0s+1.1', '0s+2.3'),
            documents: ring('0s+2.4', '0e+0.9'),
          }) +
          tabs('home'),
      ) +
      scr(
        '1s-0.4',
        '1s+1.8',
        top() +
          head('Community', 'Things to do with your neighbors and your board.') +
          `<div class="body stack" style="padding-top:12px">` +
          `<div class="row"><span class="it">${ic('Vote')}</span><span><b>Polls</b><small>Answer quick questions from your board</small></span><span class="chev">${ic('ChevronRight')}</span>${ring('1s+0.1', '1s+1.7')}${tap('1s+0.9', 0.8)}</div>` +
          row('CalendarDays', 'Book a space', 'Clubhouse, pool, courts') +
          row('UsersRound', 'Talk with neighbors', 'Start a topic or reply') +
          `</div>` +
          tabs('home'),
      ) +
      scr(
        '1s+1.8',
        '1s+3.2',
        top() +
          head('Polls', 'Quick questions from your board. Each home answers once.') +
          `<div class="body" style="padding-top:12px"><div style="font-size:21px;font-weight:700;line-height:1.25">Should the pool open an hour earlier this summer?</div>` +
          `<div class="opt sel">${'<span class="rd"></span>'}Yes</div><div class="opt"><span class="rd"></span>No</div>` +
          `<div class="btn" style="margin-top:14px">Send my answer${ring('1s+2.4', '1s+3.2')}</div></div>` +
          tabs('home'),
      ) +
      scr(
        '1s+3.2',
        '',
        top() +
          `<div class="sh"><h1 style="font-size:26px">Community board</h1></div>` +
          `<div class="body stack" style="padding-top:12px">` +
          `<div class="row"><span><b>Lost cat near the pool</b><small>3 replies · today</small></span></div>` +
          `<div class="row"><span><b>Block party planning</b><small>7 replies · yesterday</small></span></div>` +
          `<div class="btn">Post topic${ring('1s+3.8', 'end')}</div></div>` +
          tabs('home'),
      ),
  }

  // ---------- 8. Help ----------
  S.help = {
    html:
      scr(
        '@0',
        '1s+0.9',
        top(ring('0s+0.6', '0s+1.9') + tap('0s+1.3', 0.8)) +
          home() +
          tabs('home', { ask: ring('1s+0.0', '1s+0.9') + tap('1s+0.3', 0.7) }) +
          `<div class="shade cue" data-from="0s+2.2" data-to="1s+0.1"></div>` +
          F(
            'sheet-r',
            '0s+2.2',
            '1s+0.1',
            `<h2>Hello Pat</h2><div class="d">Help for this page, from the HomeownerHub guide.</div>` +
              `<h3>On this page</h3><div class="a">Your resident portal: pay dues, ask for approval, report a problem…${ic('ChevronRight').replace('<svg', '<svg width="20" height="20"')}</div>` +
              `<h3>Ask about this page</h3><div class="a" style="color:var(--muted)">Type your question…</div>` +
              `<div class="btn sec" style="margin-top:18px;font-size:17px">Open the Help centre</div>`,
          ),
      ) +
      scr(
        '1s+0.9',
        '',
        top() +
          head('Ask', 'Your assistant for dues, requests, meetings and your community’s rules. It can only see your own account.') +
          `<div class="body" style="padding-top:2px"><div class="bubble me">How much do I owe?</div>` +
          `<div class="bubble bot cue" data-from="1s+1.5">You owe $150.00. It is due November 15, 2026.</div></div>` +
          `<div style="position:absolute;left:14px;right:14px;bottom:84px;border:1.5px solid var(--border-strong);border-radius:14px;background:#fff;padding:12px;font-size:16px;color:#7B8798">Ask about your dues, requests or community rules…</div>` +
          tabs('ask'),
      ),
  }

  // ---------- 9. Closing ----------
  S.closing = {
    card: true,
    html:
      `<div class="card-scene">` +
      F('fadein', '@0.1', '', `<img class="mk" src="brand/logo-mark-512.png" alt="">`) +
      F('fadein', '0s+0', '', `<h1 style="font-size:96px">Welcome to HomeownerHub</h1>`) +
      F('fadein', '0s+0.8', '', `<div class="loc">Madison Park</div>`) +
      F('fadein', '0s+1.4', '', `<div class="recap"><div class="r"><span>1</span>Open the email</div><div class="r"><span>2</span>Tap the link</div><div class="r"><span>3</span>Add it to your home screen</div></div>`) +
      `</div>`,
  }

  window.SCENES = S
})()
