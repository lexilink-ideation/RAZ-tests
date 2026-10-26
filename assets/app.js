(() => {
  "use strict";
  const SECTIONS = [
    { n: 1, key: "picture_word", name: "Picture → word", short: "Say the word" },
    { n: 2, key: "word_spell", name: "Read & spell", short: "Read & spell" },
    { n: 3, key: "sentence_read", name: "Read aloud", short: "Read a sentence" },
    { n: 4, key: "picture_describe", name: "Describe", short: "Talk about it" },
  ];
  const SCORE_LABEL = { 2: "Got it", 1: "With help", 0: "Not yet" };
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} },
    del(k) { try { localStorage.removeItem(k) } catch {} },
  };
  const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2600) };
  const svgUrl = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  const PLACEHOLDER = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="240" fill="#F3EBFF"/><rect x="146" y="166" width="220" height="180" rx="28" fill="#fff" stroke="#3D3355" stroke-width="10" stroke-dasharray="26 18"/><circle cx="210" cy="226" r="22" fill="#FFD23F" stroke="#3D3355" stroke-width="8"/><path d="M166 326 L232 262 L276 300 L306 274 L346 326Z" fill="#5BC27A" stroke="#3D3355" stroke-width="8" stroke-linejoin="round"/></svg>');
  const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';

  /* ── speech ─────────────────────────────────────────────── */
  let voice = null;
  const pickVoice = () => {
    try {
      const vs = speechSynthesis.getVoices().filter(v => /^en(-|_)/i.test(v.lang));
      voice = vs.find(v => /Samantha|Google US English|Karen|Moira|Serena|Aria|Jenny/i.test(v.name)) || vs[0] || null;
    } catch {}
  };
  try { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice } catch {}
  const say = (text, rate = 0.82) => {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || "en-US"; u.rate = rate; u.pitch = 1.05;
      speechSynthesis.speak(u);
    } catch { toast("Read-aloud isn't available in this browser.") }
  };
  const speakBtn = (text, label, rate) => {
    const b = h("button", { class: "speak", "aria-label": label, title: label, onclick: () => say(text, rate) });
    b.innerHTML = SPEAKER; return b;
  };

  /* ── state ──────────────────────────────────────────────── */
  const S = { loaded: false, canWrite: true, quizzes: [], images: new Map(), results: [], view: "readers", run: null, detailId: null, downloads: null };

  async function loadImages() { /* pictures ship inside each quiz file */ }

  /* results live in this browser (localStorage); CSV download keeps a copy */
  const RKEY = "lli.results.v1";
  const Results = {
    all() { return store.get(RKEY, []) },
    add(doc) { const list = this.all(); const _id = "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      list.push({ ...doc, _id }); localStorage.setItem(RKEY, JSON.stringify(list)); S.results = list; return _id },
    remove(id) { const list = this.all().filter(r => r._id !== id); localStorage.setItem(RKEY, JSON.stringify(list)); S.results = list },
  };
  const imgSrc = (id) => { const d = id && S.images.get(id); return d && d.svg ? svgUrl(d.svg) : PLACEHOLDER };

  /* ── views ──────────────────────────────────────────────── */
  function show(view) {
    S.view = view;
    for (const v of ["readers", "run", "summary", "results"]) $("#view-" + v).hidden = v !== view;
    for (const b of document.querySelectorAll(".tabs button")) b.setAttribute("aria-selected", String(b.dataset.view === view || (view === "summary" && b.dataset.view === "readers") || (view === "run" && b.dataset.view === "readers")));
    window.scrollTo({ top: 0 });
    if (view === "results") renderResults();
  }
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => {
    if (S.view === "run") saveDraft();
    show(b.dataset.view);
    if (b.dataset.view === "readers") renderReaders();
  }));

  const studentInput = $("#student");
  studentInput.value = store.get("lli.student", "");
  studentInput.addEventListener("input", () => { store.set("lli.student", studentInput.value.trim()); renderReaders() });

  function students() {
    return [...new Set(S.results.map(r => r.student).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function renderReaders() {
    const grid = $("#reader-grid");
    grid.replaceChildren();
    $("#student-list").replaceChildren(...students().map(n => h("option", { value: n })));
    const who = studentInput.value.trim();
    $("#student-hint").textContent = who ? `Ready to check ${who}.` : "Pick a student, then choose a reader.";
    if (!S.loaded) {
      grid.append(h("div", { class: "empty" }, h("h2", { text: "Loading readers…" })));
      return;
    }
    if (!S.quizzes.length) {
      grid.append(h("div", { class: "empty" },
        h("h2", { text: "No readers yet" }),
        h("p", { class: "muted", text: "Quizzes appear here once they are added to data/readers.json." })));
      return;
    }
    const lastBy = new Map();
    for (const r of S.results) if (r.student === who) {
      const prev = lastBy.get(r.reader_id); if (!prev || r.created_at > prev.created_at) lastBy.set(r.reader_id, r);
    }
    const order = { AA: 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 10 };
    const qs = [...S.quizzes].sort((a, b) => (order[(a.level || "").toUpperCase()] ?? 50) - (order[(b.level || "").toUpperCase()] ?? 50) || a.title.localeCompare(b.title));
    for (const q of qs) {
      const counts = SECTIONS.map(s => (q.sections?.[s.key] || []).length);
      const thumbs = (q.sections?.picture_word || []).slice(0, 4).map(it => {
        const img = h("img", { src: PLACEHOLDER, alt: "", loading: "lazy" });
        const id = it.image?.asset_id;
        loadImages(id ? [id] : []).then(() => img.src = imgSrc(id));
        return img;
      });
      const last = lastBy.get(q.id);
      const card = h("article", { class: "reader" },
        h("div", { class: "thumbs" }, thumbs),
        h("h3", { text: q.title }),
        h("div", { class: "meta" },
          h("span", { class: "lvl", text: "Level " + (q.level || "?") }),
          h("span", { text: `${counts[0]} pictures · ${counts[1]} words · ${counts[2]} sentences` }),
          q.review?.needs_review ? h("span", { class: "flag", title: (q.review.items || []).join("\n"), text: "Check items" }) : null),
        last ? h("div", { class: "meta" }, `Last check with ${who}: `, h("b", { text: pctOf(last) + "%" }), ` on ${fmtDate(last.created_at)}`) : null,
        h("button", { class: "go", disabled: !who || !S.canWrite, onclick: () => startRun(q, who), text: !S.canWrite ? "View only" : who ? `Start with ${who}` : "Enter a student first" }));
      grid.append(card);
    }
  }

  /* ── running an assessment ──────────────────────────────── */
  const draftKey = (rid, who) => `lli.draft.${rid}.${who}`;
  function blankRun(q, who) {
    const scores = {};
    for (const s of SECTIONS) for (const it of q.sections?.[s.key] || []) scores[it.id] = s.n === 2 ? { say: null, spell: null } : { v: null };
    return { quiz: q, student: who, sec: 1, idx: 0, scores, notes: {}, ui: {}, started_at: new Date().toISOString() };
  }
  async function startRun(q, who) {
    const draft = store.get(draftKey(q.id, who), null);
    S.run = draft && draft.quiz?.processed_at === q.processed_at ? { ui: {}, ...draft, quiz: q } : blankRun(q, who);
    const ids = [...(q.image_ids || [])];
    $("#run-reader").textContent = `${q.title} · Level ${q.level || "?"}`;
    $("#run-student").textContent = who;
    show("run");
    $("#stage").replaceChildren(h("p", { class: "muted", text: "Loading pictures…" }));
    await loadImages(ids);
    renderRun();
  }
  function saveDraft() { if (S.run) store.set(draftKey(S.run.quiz.id, S.run.student), { ...S.run, quiz: { processed_at: S.run.quiz.processed_at } }) }
  $("#btn-exit").addEventListener("click", () => { saveDraft(); toast("Saved. You can pick up where you left off."); show("readers"); renderReaders() });

  const items = (n) => S.run.quiz.sections?.[SECTIONS[n - 1].key] || [];
  function sectionDone(n) {
    return items(n).filter(it => { const sc = S.run.scores[it.id]; return n === 2 ? sc.say != null && sc.spell != null : sc.v != null }).length;
  }
  function renderProgress() {
    const p = $("#progress");
    p.replaceChildren(...SECTIONS.map(s => {
      const total = items(s.n).length, done = sectionDone(s.n);
      const b = h("button", { "data-s": s.n, class: S.run.sec === s.n ? "on" : "", onclick: () => { S.run.sec = s.n; S.run.idx = 0; renderRun() } },
        h("span", { class: "t" }, h("span", { class: "n", text: s.n + " · " }), s.short),
        h("span", { class: "bar" }, h("i", { style: `width:${total ? (done / total) * 100 : 100}%` })),
        h("span", { text: `${done}/${total}` }));
      return b;
    }));
  }
  function scoreButtons(current, onPick, labels = SCORE_LABEL) {
    return h("div", { class: "score", role: "group" }, [2, 1, 0].map(v =>
      h("button", { "data-v": v, "aria-pressed": String(current === v), onclick: () => onPick(v), text: labels[v] })));
  }
  function nav() {
    const list = items(S.run.sec);
    const last = S.run.idx >= list.length - 1, lastSec = S.run.sec === 4;
    return h("div", { class: "nav" },
      h("button", { class: "ghost", disabled: S.run.sec === 1 && S.run.idx === 0, onclick: () => step(-1), text: "← Back" }),
      h("span", { class: "hint", text: `${SECTIONS[S.run.sec - 1].name} · item ${Math.min(S.run.idx + 1, list.length)} of ${list.length}` }),
      h("button", { class: "primary", onclick: () => step(1), text: last && lastSec ? "Finish" : last ? "Next section →" : "Next →" }));
  }
  function step(d) {
    const list = items(S.run.sec);
    let { sec, idx } = S.run;
    idx += d;
    if (idx >= list.length) { if (sec === 4) return finish(); sec += 1; idx = 0; while (sec < 4 && !items(sec).length) sec++ }
    if (idx < 0) { if (sec === 1) idx = 0; else { sec -= 1; idx = Math.max(items(sec).length - 1, 0) } }
    Object.assign(S.run, { sec, idx });
    saveDraft(); renderRun();
  }
  function autoNext() { setTimeout(() => step(1), 380) }

  function renderRun() {
    renderProgress();
    const stage = $("#stage"), teacher = $("#teacher");
    stage.dataset.s = S.run.sec;
    stage.replaceChildren(); teacher.replaceChildren();
    const list = items(S.run.sec);
    if (!list.length) {
      stage.append(h("p", { class: "prompt", text: "Nothing in this section for this reader." }));
      teacher.append(nav()); return;
    }
    const it = list[Math.min(S.run.idx, list.length - 1)];
    const prompts = S.run.quiz.prompts || {};
    ({ 1: runPicture, 2: runSpell, 3: runSentence, 4: runDescribe })[S.run.sec](it, stage, teacher, prompts);
    teacher.append(noteBox(it.id), nav());
  }
  function noteBox(id) {
    const ta = h("textarea", { id: "note-" + id, placeholder: "Note (optional): what the child said, help given…", "aria-label": "Teacher note" });
    ta.value = S.run.notes[id] || "";
    ta.addEventListener("input", () => { S.run.notes[id] = ta.value; saveDraft() });
    return ta;
  }

  // 1. picture → word
  function runPicture(it, stage, teacher, prompts) {
    const q = prompts.picture_word || "What is this? Say the word.";
    stage.append(
      h("div", { class: "prompt-row" }, h("span", { class: "prompt", text: q }), speakBtn(q.replace("Say the word.", ""), "Read the question aloud")),
      h("img", { class: "pic", src: imgSrc(it.image?.asset_id), alt: "Picture to name" }));
    const sc = S.run.scores[it.id];
    const reveal = h("details", {}, h("summary", { class: "hint", text: "Show answer" }),
      h("div", { class: "row" }, h("span", { class: "answer", text: it.target }), speakBtn(it.target, "Say the answer"),
        it.phrase ? h("span", { class: "muted", text: `Full phrase: “${it.phrase}”` }) : null));
    teacher.append(
      h("div", { class: "row" }, h("span", { class: "label", text: "Accept" }), h("div", { class: "chips" }, (it.accept || [it.target]).map(a => h("span", { class: "chip", text: a })))),
      reveal,
      scoreButtons(sc.v, v => { sc.v = v; saveDraft(); renderRun(); autoNext() }));
  }

  // 2. word → say + spell
  function runSpell(it, stage, teacher, prompts) {
    const sc = S.run.scores[it.id];
    const u = S.run.ui[it.id] || (S.run.ui[it.id] = { built: [], tries: 0 });
    const phase = u.phase || (sc.say == null ? "say" : "spell");
    const word = it.word;
    if (phase === "say") {
      stage.append(
        h("div", { class: "prompt-row" }, h("span", { class: "prompt", text: "Read this word." }), speakBtn("Read this word.", "Read the instruction aloud")),
        h("div", { class: "bigword", text: word }));
      teacher.append(
        h("div", { class: "row" }, h("span", { class: "label", text: "Step 1 · Pronunciation" }), h("span", { class: "answer", text: word }), speakBtn(word, "Hear the word", 0.7)),
        scoreButtons(sc.say, v => { sc.say = v; u.phase = "spell"; saveDraft(); renderRun() }, { 2: "Said it", 1: "With help", 0: "Not yet" }));
      return;
    }
    // spelling with tiles
    const tiles = it.tiles || word.split("");
    const built = u.built;
    const check = () => {
      const guess = built.map(i => tiles[i]).join("");
      return guess.toLowerCase() === word.toLowerCase();
    };
    const full = built.length === word.length;
    const right = full && check();
    stage.append(
      h("div", { class: "prompt-row" }, h("span", { class: "prompt", text: "Now spell it!" }), speakBtn(`Spell the word ${word}.`, "Read the instruction aloud")),
      h("div", { class: "bigword covered", "aria-hidden": "true", text: word }),
      h("div", { class: "slots", "aria-label": "Your spelling" }, word.split("").map((_, i) => {
        const filled = i < built.length;
        return h("button", { class: "slot" + (filled ? " filled" : "") + (full ? (right ? " right" : " wrong") : ""), "aria-label": filled ? `Remove ${tiles[built[i]]}` : "Empty",
          onclick: () => { if (filled) { built.splice(i, 1); renderRun() } }, text: filled ? tiles[built[i]] : "" });
      })),
      h("div", { class: "tiles" }, tiles.map((t, i) => h("button", { class: "tile", disabled: built.includes(i) || full, "aria-label": `Letter ${t}`,
        onclick: () => { built.push(i); if (built.length === word.length) { u.tries += 1; if (check() && sc.spell == null) sc.spell = u.tries === 1 ? 2 : 1; saveDraft() } renderRun() }, text: t }))));
    if (full && !right) stage.append(h("button", { class: "ghost", onclick: () => { u.built.length = 0; renderRun() }, text: "Try again" }));
    teacher.append(
      h("div", { class: "row" }, h("span", { class: "label", text: "Step 2 · Spelling" }), h("span", { class: "answer", text: word }),
        h("span", { class: "hint", text: full ? (right ? "Built correctly" + (u.tries > 1 ? " on try " + u.tries : "") : "Not matching yet") : "Child taps letters; or spell aloud and score below." }),
        h("button", { class: "ghost", onclick: () => { u.phase = "say"; renderRun() }, text: "Back to step 1" })),
      scoreButtons(sc.spell, v => { sc.spell = v; saveDraft(); renderRun(); autoNext() }, { 2: "Spelled it", 1: "With help", 0: "Not yet" }));
  }

  // 3. sentence read aloud
  function runSentence(it, stage, teacher, prompts) {
    const sc = S.run.scores[it.id];
    const missed = sc.missed || (sc.missed = []);
    const words = it.text.split(/\s+/);
    const q = prompts.sentence_read || "Read this sentence to me.";
    stage.append(
      h("div", { class: "prompt-row" }, h("span", { class: "prompt", text: q }), speakBtn(q, "Read the instruction aloud")),
      h("div", { class: "sentence" }, words.map((w, i) => h("button", { class: missed.includes(i) ? "miss" : "", "aria-pressed": String(missed.includes(i)), title: "Tap if this word was missed",
        onclick: () => { const k = missed.indexOf(i); k >= 0 ? missed.splice(k, 1) : missed.push(i); sc.v = autoSentence(words.length, missed.length); saveDraft(); renderRun() }, text: w }))));
    const suggestion = autoSentence(words.length, missed.length);
    teacher.append(
      h("div", { class: "row" }, h("span", { class: "label", text: "Tap any word the child missed" }), speakBtn(it.text, "Hear the sentence", 0.75),
        h("span", { class: "hint", text: `${words.length - missed.length}/${words.length} words read · suggests “${SCORE_LABEL[suggestion]}”` })),
      scoreButtons(sc.v, v => { sc.v = v; saveDraft(); renderRun(); autoNext() }));
  }
  const autoSentence = (n, miss) => miss === 0 ? 2 : miss <= Math.floor(n / 2) ? 1 : 0;

  // 4. describe the picture
  function runDescribe(it, stage, teacher, prompts) {
    const sc = S.run.scores[it.id];
    const got = sc.got || (sc.got = []);
    const q = prompts.picture_describe || "Look at the picture. What do you see?";
    stage.append(
      h("div", { class: "prompt-row" }, h("span", { class: "prompt", text: q }), speakBtn(q, "Read the question aloud")),
      h("img", { class: "pic scene", src: imgSrc(it.image_id), alt: it.title || "Picture to describe" }));
    if (it.frames?.length) stage.append(h("div", { class: "chips" }, it.frames.map(f => h("span", { class: "chip", text: f }))));
    const usedSentence = !!sc.sentence;
    const suggest = () => (got.length >= 3 && sc.sentence) ? 2 : got.length >= 1 ? 1 : 0;
    teacher.append(
      h("div", { class: "row" }, h("span", { class: "label", text: "Tap what the child names" })),
      h("div", { class: "chips lookfor" }, (it.look_for || []).map((l, i) => h("button", { class: "chip", "aria-pressed": String(got.includes(i)),
        onclick: () => { const k = got.indexOf(i); k >= 0 ? got.splice(k, 1) : got.push(i); sc.v = suggest(); saveDraft(); renderRun() }, text: l })),
        h("button", { class: "chip", "aria-pressed": String(usedSentence), onclick: () => { sc.sentence = !sc.sentence; sc.v = suggest(); saveDraft(); renderRun() }, text: "Used a full sentence" })),
      it.model_sentences?.length ? h("details", {}, h("summary", { class: "hint", text: "Model answer" }), h("p", { class: "muted", text: it.model_sentences.join(" ") })) : null,
      h("div", { class: "hint", text: `${got.length} thing(s) named · suggests “${SCORE_LABEL[suggest()]}”` }),
      scoreButtons(sc.v, v => { sc.v = v; saveDraft(); renderRun() }));
  }

  /* ── scoring + summary ──────────────────────────────────── */
  function tally(q, scores) {
    const out = {};
    for (const s of SECTIONS) {
      let got = 0, max = 0, done = 0;
      for (const it of q.sections?.[s.key] || []) {
        const sc = scores[it.id] || {};
        const parts = s.n === 2 ? [sc.say, sc.spell] : [sc.v];
        for (const p of parts) { max += 2; if (p != null) { got += p; done++ } }
      }
      out[s.n] = { got, max, done };
    }
    const got = Object.values(out).reduce((a, b) => a + b.got, 0), max = Object.values(out).reduce((a, b) => a + b.max, 0);
    return { sections: out, got, max, pct: max ? Math.round((got / max) * 100) : 0 };
  }
  const pctOf = (r) => r.totals?.pct ?? 0;
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) } catch { return iso } };
  const pctClass = (p) => p >= 80 ? "hi" : p >= 50 ? "md" : "lo";
  const STAR = (on) => `<svg viewBox="0 0 64 64"><polygon points="32,4 40,24 62,24 44,38 51,60 32,46 13,60 20,38 2,24 24,24" fill="${on ? "#FFD23F" : "none"}" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/></svg>`;

  async function finish() {
    const r = S.run, q = r.quiz;
    const t = tally(q, r.scores);
    const unscored = Object.values(t.sections).reduce((a, b) => a + (b.max / 2 - b.done), 0);
    const stars = t.pct >= 85 ? 3 : t.pct >= 55 ? 2 : 1;
    const view = $("#view-summary");
    const starRow = h("div", { class: "stars", style: "color:var(--ink)" }); starRow.innerHTML = [1, 2, 3].map(i => STAR(i <= stars)).join("");
    const saveBtn = h("button", { class: "primary", id: "btn-save", text: "Save result" });
    view.replaceChildren(h("div", { class: "summary" },
      h("div", { style: "text-align:center;display:grid;gap:8px" }, starRow,
        h("h2", { style: "font-family:var(--font-read);font-size:30px", text: `Well done, ${r.student}!` }),
        h("p", { class: "muted", text: `${q.title} · Level ${q.level || "?"} · ${t.got}/${t.max} points (${t.pct}%)` })),
      h("div", { class: "secgrid" }, SECTIONS.map(s => {
        const x = t.sections[s.n];
        return h("div", { class: "secbox", style: `--c:var(--sec-${s.n})` }, h("span", { class: "label", text: s.name }),
          h("b", { text: x.max ? `${x.got}/${x.max}` : "–" }), h("span", { class: "hint", text: x.done * 2 < x.max ? `${x.max / 2 - x.done} not scored` : "All scored" }));
      })),
      unscored ? h("p", { class: "hint", text: `${unscored} item(s) were skipped; they count as 0 in the total. You can go back and score them first.` }) : null,
      h("div", { class: "nav" }, h("button", { class: "ghost", onclick: () => { show("run"); renderRun() }, text: "← Back to questions" }), saveBtn)));
    show("summary");
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true; saveBtn.textContent = "Saving…";
      const doc = {
        reader_id: q.id, title: q.title, level: q.level || null, student: r.student,
        created_at: new Date().toISOString(), started_at: r.started_at, quiz_version: q.processed_at || null,
        totals: { got: t.got, max: t.max, pct: t.pct, sections: t.sections },
        scores: cleanScores(r.scores), notes: Object.fromEntries(Object.entries(r.notes).filter(([, v]) => v && v.trim())),
      };
      try {
        Results.add(doc);
        store.del(draftKey(q.id, r.student));
        S.run = null;
        toast("Result saved");
        show("results");
      } catch (e) {
        saveBtn.disabled = false; saveBtn.textContent = "Save result";
        toast("Couldn't save in this browser (private mode or storage blocked). Use a normal window and press Save again.");
      }
    });
  }
  function cleanScores(scores) {
    const out = {};
    for (const [k, v] of Object.entries(scores)) {
      const o = {};
      for (const f of ["v", "say", "spell", "missed", "got", "sentence"]) if (v[f] != null && !(Array.isArray(v[f]) && !v[f].length)) o[f] = v[f];
      out[k] = o;
    }
    return out;
  }

  /* ── results ────────────────────────────────────────────── */
  const fs = $("#filter-student"), fr = $("#filter-reader");
  fs.addEventListener("change", renderResults); fr.addEventListener("change", renderResults);
  function filtered() {
    return S.results.filter(r => (!fs.value || r.student === fs.value) && (!fr.value || r.reader_id === fr.value))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  function renderResults() {
    const keepS = fs.value, keepR = fr.value;
    fs.replaceChildren(h("option", { value: "", text: "All students" }), ...students().map(n => h("option", { value: n, text: n })));
    const readers = [...new Map(S.results.map(r => [r.reader_id, r.title])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    fr.replaceChildren(h("option", { value: "", text: "All readers" }), ...readers.map(([id, t]) => h("option", { value: id, text: t })));
    fs.value = keepS; fr.value = keepR;
    const body = $("#results-body");
    const rows = filtered();
    $("#btn-csv").hidden = !rows.length;
    if (!rows.length) {
      body.replaceChildren(h("div", { class: "empty" }, h("h2", { text: S.results.length ? "No results match" : "No results yet" }),
        h("p", { class: "muted", text: S.results.length ? "Change the filters above." : "Finish a check with a student and press Save result. It will be listed here." })));
      $("#result-detail").replaceChildren(); return;
    }
    const table = h("table", {},
      h("thead", {}, h("tr", {}, ["Date", "Student", "Reader", "Lvl", "Picture", "Spell", "Read", "Describe", "Total"].map(t => h("th", { text: t })))),
      h("tbody", {}, rows.map(r => {
        const s = r.totals?.sections || {};
        const cell = (n) => s[n] && s[n].max ? `${s[n].got}/${s[n].max}` : "–";
        return h("tr", { class: "click", tabindex: "0", onclick: () => { S.detailId = r._id; renderDetail() }, onkeydown: (e) => { if (e.key === "Enter") { S.detailId = r._id; renderDetail() } } },
          h("td", { text: fmtDate(r.created_at) }), h("td", { text: r.student }), h("td", { text: r.title }), h("td", { text: r.level || "" }),
          h("td", { text: cell(1) }), h("td", { text: cell(2) }), h("td", { text: cell(3) }), h("td", { text: cell(4) }),
          h("td", {}, h("span", { class: "pct " + pctClass(pctOf(r)), text: pctOf(r) + "%" })));
      })));
    body.replaceChildren(h("div", { class: "table-wrap" }, table));
    renderDetail();
  }
  function renderDetail() {
    const box = $("#result-detail");
    const r = S.results.find(x => x._id === S.detailId);
    if (!r) { box.replaceChildren(); return }
    const q = S.quizzes.find(x => x.id === r.reader_id);
    const lines = [];
    if (q) for (const s of SECTIONS) for (const it of q.sections?.[s.key] || []) {
      const sc = r.scores?.[it.id] || {};
      const label = it.target || it.word || it.text || it.title;
      const val = s.n === 2 ? `say: ${SCORE_LABEL[sc.say] ?? "–"}, spell: ${SCORE_LABEL[sc.spell] ?? "–"}` : (SCORE_LABEL[sc.v] ?? "–");
      lines.push(h("li", {}, h("b", { text: label }), ` — ${val}`, r.notes?.[it.id] ? h("span", { class: "muted", text: ` · “${r.notes[it.id]}”` }) : null));
    }
    const del = h("button", { class: "ghost", text: "Delete result" });
    const actions = h("div", { class: "row", style: "display:flex;gap:8px;flex-wrap:wrap" }, del, h("button", { class: "ghost", onclick: () => { S.detailId = null; renderDetail() }, text: "Close" }));
    del.addEventListener("click", () => {
      actions.replaceChildren(h("div", { class: "confirm" }, `Delete ${r.student}'s result for “${r.title}”? This can't be undone.`,
        h("button", { class: "primary", onclick: () => { try { Results.remove(r._id); S.detailId = null; renderResults(); toast("Result deleted") } catch { toast("Couldn't delete. Try again.") } }, text: "Delete" }),
        h("button", { class: "ghost", onclick: renderDetail, text: "Keep it" })));
    });
    box.replaceChildren(h("div", { class: "detail" },
      h("div", {}, h("span", { class: "label", text: fmtDate(r.created_at) }), h("h3", { text: `${r.student} · ${r.title}` }),
        h("p", { class: "muted", text: `Level ${r.level || "?"} · ${r.totals?.got}/${r.totals?.max} points (${pctOf(r)}%)` })),
      q ? h("ul", {}, lines) : h("p", { class: "muted", text: "This reader's quiz is no longer on the page, so item details can't be shown." }),
      actions));
  }
  $("#btn-csv").addEventListener("click", async () => {
    const rows = filtered();
    const head = ["date", "student", "reader", "level", "picture", "picture_max", "spell", "spell_max", "read", "read_max", "describe", "describe_max", "total", "max", "percent"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [head.join(",")].concat(rows.map(r => {
      const s = r.totals?.sections || {};
      return [r.created_at.slice(0, 10), r.student, r.title, r.level, s[1]?.got, s[1]?.max, s[2]?.got, s[2]?.max, s[3]?.got, s[3]?.max, s[4]?.got, s[4]?.max, r.totals?.got, r.totals?.max, pctOf(r)].map(esc).join(",");
    }));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `lli-word-check-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  /* ── boot ───────────────────────────────────────────────── */
  S.results = Results.all();
  renderReaders();
  (async () => {
    try {
      const list = await (await fetch("data/readers.json", { cache: "no-cache" })).json();
      const payloads = await Promise.all((list.readers || []).map(r =>
        fetch(`data/quizzes/${r.id}.json`, { cache: "no-cache" }).then(x => x.ok ? x.json() : null).catch(() => null)));
      for (const p of payloads) {
        if (!p?.quiz) continue;
        S.quizzes.push(p.quiz);
        for (const img of p.images || []) S.images.set(img.id, img);
      }
    } catch { toast("Couldn't load the reader list. Reload the page.") }
    S.loaded = true;
    renderReaders();
    const want = decodeURIComponent(location.hash.slice(1));
    const q = want && S.quizzes.find(x => x.id === want);
    if (q) { if (studentInput.value.trim()) startRun(q, studentInput.value.trim()); else { studentInput.focus(); toast(`Type the student's name, then start “${q.title}”.`) } }
  })();
})();
