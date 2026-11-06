// Scene runtime. Page URL: index.html?scene=<id>&layout=port|land[&t=<seconds>][&poster=1]
// Cues are elements with class "cue". They show between data-from and data-to (or data-dur after data-from).
// Time specs: "<line>s+0.4" (line start plus offset), "<line>e-0.3" (line end), "@5.2" (seconds), "end".
// render.mjs calls window.startScene() once the page is ready; the recording is trimmed to that moment.
;(function () {
  const q = new URLSearchParams(location.search)
  const sceneId = q.get('scene') || 'welcome'
  const layout = q.get('layout') === 'land' ? 'land' : 'port'
  const frozen = q.has('t') ? parseFloat(q.get('t')) : null
  document.body.classList.add(layout)

  const TL = window.TIMELINE[sceneId]
  const def = window.SCENES[sceneId]
  if (!TL || !def) throw new Error('unknown scene ' + sceneId)

  // Build the scene.
  const mid = document.getElementById('mid')
  if (def.card) {
    mid.innerHTML = def.html
  } else {
    mid.innerHTML =
      '<div class="phone"><div class="screenbox"><div class="ui"><div class="island"></div>' +
      '<div class="sbar"><span>9:41</span><span>5G &nbsp;100%</span></div>' +
      def.html +
      '</div></div></div>'
  }
  // Landscape puts the caption in the side panel.
  if (layout === 'land') {
    document.getElementById('capslot').appendChild(document.getElementById('cap'))
    document.getElementById('side-title').textContent = TL.title
  }

  function parse(spec) {
    if (spec === 'end') return TL.duration
    if (spec[0] === '@') return parseFloat(spec.slice(1))
    const m = /^(\d+)([se])([+-]\d*\.?\d+)?$/.exec(spec)
    if (!m) throw new Error('bad time spec ' + spec)
    const i = +m[1]
    if (TL.starts[i] === undefined) throw new Error('no line ' + i + ' in scene ' + sceneId)
    return (m[2] === 's' ? TL.starts[i] : TL.ends[i]) + (m[3] ? parseFloat(m[3]) : 0)
  }

  const cues = [...document.querySelectorAll('.cue')].map((el) => {
    const from = parse(el.dataset.from || '0s')
    let to
    if (el.dataset.to) to = parse(el.dataset.to)
    else if (el.dataset.dur) to = from + parseFloat(el.dataset.dur)
    else to = TL.duration + 10
    if (el.classList.contains('type')) el.style.setProperty('--d', (el.dataset.typing || 1.4) + 's')
    return { el, from, to, on: false }
  })
  const pans = [...document.querySelectorAll('.pan')].map((el) => ({
    el,
    targets: cues.filter((c) => c.el.parentElement === el && c.el.dataset.y !== undefined),
  }))

  const capEl = document.getElementById('cap-text')
  const fade = document.getElementById('fade')
  let capIdx = -2

  function render(t) {
    for (const c of cues) {
      const on = t >= c.from && t < c.to
      if (on !== c.on) {
        c.on = on
        c.el.classList.toggle('on', on)
      }
    }
    for (const p of pans) {
      let y = 0
      let best = -1
      for (const c of p.targets) if (c.on && c.from >= best) { best = c.from; y = parseFloat(c.el.dataset.y) }
      p.el.style.transform = 'translateY(' + y + 'px)'
    }
    // Caption: line i shows from its start to just before the next line's start.
    let idx = -1
    for (let i = 0; i < TL.starts.length; i++) if (t >= TL.starts[i] - 0.05) idx = i
    const lastEnd = TL.ends[TL.ends.length - 1] + (TL.holds[TL.holds.length - 1] || 0)
    const visible = idx >= 0 && (idx < TL.starts.length - 1 || t < lastEnd + 0.5)
    const want = visible ? idx : -1
    if (want !== capIdx) {
      capIdx = want
      if (want >= 0) capEl.textContent = TL.lines[want]
      capEl.classList.toggle('on', want >= 0)
    }
    if (frozen === null) {
      const a = Math.min(1, Math.max(0, 1 - t / 0.45))
      const b = Math.min(1, Math.max(0, (t - (TL.duration - 0.45)) / 0.45))
      fade.style.opacity = String(Math.max(a, b))
    }
  }

  if (q.has('poster')) {
    const p = document.getElementById('poster')
    p.hidden = false
    p.style.cssText =
      'position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:50px;background:linear-gradient(180deg,#1B1346,#0F172A);color:#fff;text-align:center'
    p.innerHTML =
      '<img src="brand/logo-full-dark.svg" style="height:' + (layout === 'port' ? 96 : 72) + 'px" alt="">' +
      '<div style="width:' + (layout === 'port' ? 340 : 240) + 'px;height:' + (layout === 'port' ? 340 : 240) + 'px;border-radius:50%;background:#4B27C9;border:12px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 20px 60px rgba(0,0,0,.5)">' +
      '<svg viewBox="0 0 24 24" width="' + (layout === 'port' ? 170 : 120) + '" height="' + (layout === 'port' ? 170 : 120) + '" fill="#fff" style="margin-left:14px"><path d="M7 4.5v15l13-7.5z"/></svg></div>' +
      '<div style="font-size:' + (layout === 'port' ? 78 : 64) + 'px;font-weight:800;line-height:1.1;padding:0 50px">Watch: getting started</div>'
    // The captions do not belong on a poster.
    document.getElementById('cap').style.display = 'none'
  }

  if (frozen !== null) {
    document.getElementById('fade').style.opacity = '0'
    document.getElementById('pre').remove()
    render(frozen)
    window.__ready = true
    return
  }

  let t0 = null
  window.startScene = function () {
    document.getElementById('fade').style.opacity = '1'
    document.getElementById('pre').remove()
    t0 = performance.now()
    function frame() {
      render((performance.now() - t0) / 1000)
      requestAnimationFrame(frame)
    }
    frame()
  }
  render(-1)
  window.__ready = true
})()
