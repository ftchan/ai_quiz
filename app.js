(function () {
  const bank = window.QUESTION_BANK || [];
  const validIds = new Set(bank.map((q) => q.id));
  const memorizeProgressKey = 'ai-quiz-memorize-progress';
  const memorizeActiveKey = 'ai-quiz-memorize-active';
  const favoriteKey = 'ai-quiz-favorites';
  const wrongKey = 'ai-quiz-wrong-questions';
  const statsKey = 'ai-quiz-stats';
  const exportVersion = 1;
  const readStored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } };
  const storedStats = readStored(statsKey, {});
  const storedFavorites = readStored(favoriteKey, []);
  const storedWrongs = readStored(wrongKey, null);
  const state = {
    source: 'theory', filter: 'all', studyMode: localStorage.getItem(memorizeActiveKey) === 'true',
    items: [], index: 0, selected: new Set(), submitted: false, random: false, instant: true,
    stats: Object.fromEntries(Object.entries(storedStats).filter(([id]) => validIds.has(id))),
    favorites: new Set(storedFavorites.filter((id) => validIds.has(id))),
    wrongs: new Set((Array.isArray(storedWrongs) ? storedWrongs : Object.entries(storedStats).filter(([, stat]) => !stat.correct).map(([id]) => id)).filter((id) => validIds.has(id))),
  };
  localStorage.setItem(statsKey, JSON.stringify(state.stats));
  localStorage.setItem(favoriteKey, JSON.stringify([...state.favorites]));
  localStorage.setItem(wrongKey, JSON.stringify([...state.wrongs]));

  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const current = () => state.items[state.index];
  const typeName = (type) => ({ single: '单选题', multiple: '多选题' }[type] || type);
  const sourceName = (source) => ({ theory: '理论题库', sample: '样题补充', all: '全部题目' }[source] || source);

  function saveStats() {
    localStorage.setItem(statsKey, JSON.stringify(state.stats));
    updateSummary();
  }

  function saveFavorites() {
    localStorage.setItem(favoriteKey, JSON.stringify([...state.favorites]));
    updateSummary();
  }

  function saveWrongs() {
    localStorage.setItem(wrongKey, JSON.stringify([...state.wrongs]));
    updateSummary();
  }

  function learningData() {
    return {
      version: exportVersion,
      exportedAt: new Date().toISOString(),
      stats: state.stats,
      favorites: [...state.favorites],
      wrongs: [...state.wrongs],
      memorizeProgressId: localStorage.getItem(memorizeProgressKey),
      memorizeActive: localStorage.getItem(memorizeActiveKey) === 'true'
    };
  }

  function normalizeImport(data) {
    if (!data || typeof data !== 'object' || !data.stats || typeof data.stats !== 'object' || Array.isArray(data.stats)) return null;
    const stats = Object.fromEntries(Object.entries(data.stats).filter(([id, stat]) => validIds.has(id) && stat && typeof stat.correct === 'boolean').map(([id, stat]) => [id, { correct: stat.correct, at: Number.isFinite(stat.at) ? stat.at : Date.now() }]));
    const favorites = Array.isArray(data.favorites) ? data.favorites.filter((id) => validIds.has(id)) : [];
    const wrongs = Array.isArray(data.wrongs)
      ? data.wrongs.filter((id) => validIds.has(id))
      : Object.entries(stats).filter(([, stat]) => !stat.correct).map(([id]) => id);
    return {
      stats,
      favorites: [...new Set(favorites)],
      wrongs: [...new Set(wrongs)],
      memorizeProgressId: validIds.has(data.memorizeProgressId) ? data.memorizeProgressId : null,
      memorizeActive: data.memorizeActive === true
    };
  }

  function exportLearningData() {
    const file = new Blob([JSON.stringify(learningData(), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(file);
    link.download = `ai-quiz-learning-data-${date}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  function applyImportedData(data) {
    state.stats = data.stats;
    state.favorites = new Set(data.favorites);
    state.wrongs = new Set(data.wrongs);
    localStorage.setItem(statsKey, JSON.stringify(state.stats));
    localStorage.setItem(favoriteKey, JSON.stringify([...state.favorites]));
    localStorage.setItem(wrongKey, JSON.stringify([...state.wrongs]));
    if (data.memorizeProgressId) localStorage.setItem(memorizeProgressKey, data.memorizeProgressId);
    else localStorage.removeItem(memorizeProgressKey);
    if (data.memorizeActive) localStorage.setItem(memorizeActiveKey, 'true');
    else localStorage.removeItem(memorizeActiveKey);
    state.studyMode = data.memorizeActive;
    state.source = 'theory';
    state.filter = 'all';
    state.index = 0;
    updateSummary();
    makeItems();
  }

  function updateSummary() {
    const results = Object.values(state.stats);
    const completed = results.length;
    const correct = results.filter((item) => item.correct).length;
    $('#doneCount').textContent = completed;
    $('#accuracy').textContent = completed ? `${Math.round(correct / completed * 100)}%` : '--';
    $('#wrongCount').textContent = state.wrongs.size;
    $('#favoriteCount').textContent = state.favorites.size;
  }

  function makeItems() {
    let list;
    if (state.studyMode) {
      list = [...bank].sort((a, b) => (a.type === b.type ? 0 : a.type === 'single' ? -1 : 1));
    } else {
      list = bank.filter((question) => {
        const sourceMatches = state.filter === 'favorite'
          || state.source === 'all'
          || question.source === state.source;
        const filterMatches = state.filter === 'all'
          || question.type === state.filter
          || (state.filter === 'favorite' && state.favorites.has(question.id))
          || (state.filter === 'wrong' && state.wrongs.has(question.id));
        return sourceMatches && filterMatches;
      });
    }
    if (state.random && !state.studyMode) list = [...list].sort(() => Math.random() - 0.5);
    state.items = list;
    const savedId = state.studyMode ? localStorage.getItem(memorizeProgressKey) : null;
    const savedIndex = savedId ? list.findIndex((question) => question.id === savedId) : -1;
    state.index = savedIndex >= 0 ? savedIndex : Math.min(Math.max(state.index, 0), Math.max(list.length - 1, 0));
    state.selected = new Set();
    state.submitted = false;
    render();
  }

  function render() {
    const question = current();
    const total = state.items.length;
    if (state.studyMode && question) {
      localStorage.setItem(memorizeActiveKey, 'true');
      localStorage.setItem(memorizeProgressKey, question.id);
    }
    $('#allCount').textContent = bank.length;
    $('#theoryCount').textContent = bank.filter((item) => item.source === 'theory').length;
    $('#sampleCount').textContent = bank.filter((item) => item.source === 'sample').length;
    $('#singleCount').textContent = bank.filter((item) => item.type === 'single').length;
    $('#multipleCount').textContent = bank.filter((item) => item.type === 'multiple').length;
    $('#favoriteCount').textContent = state.favorites.size;
    $('#modeLabel').textContent = state.studyMode
      ? '背题模式 · 全部题目'
      : state.filter === 'favorite'
        ? '收藏'
        : `${sourceName(state.source)}${state.filter === 'all' ? '' : ` · ${state.filter === 'wrong' ? '错题重练' : typeName(state.filter)}`}`;
    $('#progressText').textContent = total ? `${state.index + 1} / ${total}` : '0 / 0';
    $('#progressBar').style.width = total ? `${(state.index + 1) / total * 100}%` : '0%';
    $('#paletteMeta').textContent = `${state.items.filter((item) => state.stats[item.id]).length} / ${total}`;
    document.querySelectorAll('.nav-btn').forEach((button) => button.classList.toggle('active', button.dataset.mode === 'memorize'
      ? state.studyMode
      : (button.dataset.source
        ? button.dataset.source === state.source && state.filter !== 'favorite' && !state.studyMode
        : button.dataset.filter === state.filter && !state.studyMode)));
    renderCard(question);
    renderPalette();
  }

  function renderCard(question) {
    const card = $('#questionCard');
    if (!question) {
      card.innerHTML = '<div class="empty-state"><div><b>暂无题目</b><span>当前筛选条件下没有可显示的题目</span></div></div>';
      $('#prevBtn').disabled = true;
      $('#nextBtn').disabled = true;
      return;
    }
    $('#prevBtn').disabled = state.index === 0;
    $('#nextBtn').disabled = state.index === state.items.length - 1;
    const stat = state.stats[question.id];
    const answered = state.submitted;
    const reveal = state.studyMode || (answered && state.instant);
    const isSingleChoice = question.type !== 'multiple';
    const isFavorite = state.favorites.has(question.id);
    const canRemoveWrong = !state.studyMode && state.filter === 'wrong' && stat && stat.correct && state.wrongs.has(question.id);
    card.innerHTML = `<div class="question-meta"><span class="q-index">第 ${question.number} 题</span><span class="type-tag">${question.typeLabel || typeName(question.type)}</span><span class="type-tag source-tag">${question.sourceLabel || sourceName(question.source)}</span><button class="favorite-btn ${isFavorite ? 'active' : ''}" type="button" title="${isFavorite ? '取消收藏' : '收藏题目'}" aria-label="${isFavorite ? '取消收藏' : '收藏题目'}">${isFavorite ? '★' : '☆'}</button></div><h2 class="question-title">${esc(question.question)}</h2><div class="options">${question.options.map((option) => { const selected = state.selected.has(option.key); const right = reveal && question.answer.includes(option.key); const wrong = reveal && selected && !right; return `<button class="option ${selected ? 'selected' : ''} ${right ? 'correct' : ''} ${wrong ? 'incorrect' : ''}" type="button" data-key="${option.key}" aria-pressed="${selected}" ${state.studyMode || answered ? 'disabled' : ''}><span class="option-key">${option.key}</span><span class="option-text">${esc(option.text)}</span></button>`; }).join('')}</div>${reveal ? `<div class="result-note ${stat && !stat.correct ? 'error' : ''}"><strong>${state.studyMode ? '正确答案' : (stat && stat.correct ? '回答正确' : '回答错误')}</strong><span> · 正确答案：${question.answer.join('、')}</span></div>` : ''}${canRemoveWrong ? '<div class="wrong-actions"><button class="secondary-btn remove-wrong-btn" type="button">移出错题</button></div>' : ''}`;
    card.querySelector('.favorite-btn').onclick = () => toggleFavorite(question);
    const removeWrongButton = card.querySelector('.remove-wrong-btn');
    if (removeWrongButton) removeWrongButton.onclick = () => removeWrong(question);
    if (!answered && !state.studyMode) card.querySelectorAll('.option').forEach((option) => option.addEventListener('click', () => {
      const key = option.dataset.key;
      if (isSingleChoice) {
        state.selected = new Set([key]);
        finalizeCurrent();
        render();
      } else {
        state.selected.has(key) ? state.selected.delete(key) : state.selected.add(key);
        renderCard(question);
      }
    }));
  }

  function toggleFavorite(question) {
    if (state.favorites.has(question.id)) state.favorites.delete(question.id);
    else state.favorites.add(question.id);
    saveFavorites();
    if (!state.studyMode && state.filter === 'favorite' && !state.favorites.has(question.id)) makeItems();
    else render();
  }

  function removeWrong(question) {
    state.wrongs.delete(question.id);
    saveWrongs();
    makeItems();
  }

  function finalizeCurrent() {
    const question = current();
    if (!question || state.studyMode || state.submitted || !state.selected.size) return false;
    const correct = question.answer.length === state.selected.size && question.answer.every((key) => state.selected.has(key));
    state.stats[question.id] = { correct, at: Date.now() };
    if (!correct) state.wrongs.add(question.id);
    state.submitted = true;
    saveStats();
    if (!correct) saveWrongs();
    return true;
  }

  function renderPalette() {
    const palette = $('#palette');
    let lastType = '';
    palette.innerHTML = state.items.map((question, index) => {
      const stat = state.stats[question.id];
      const statusClass = index === state.index ? 'current' : stat ? (stat.correct ? 'done' : 'wrong') : '';
      const allOptionsCorrect = question.type === 'multiple' && question.answer.length === question.options.length;
      const className = `${statusClass}${allOptionsCorrect ? ' all-options-correct' : ''}`.trim();
      const heading = state.studyMode && question.type !== lastType
        ? `<div class="palette-group-label">${typeName(question.type)}<span>${state.items.filter((item) => item.type === question.type).length} 题</span></div>`
        : '';
      lastType = question.type;
      return `${heading}<button class="${className}" data-i="${index}">${index + 1}</button>`;
    }).join('');
    palette.querySelectorAll('button').forEach((button) => button.onclick = () => {
      finalizeCurrent();
      state.index = +button.dataset.i;
      state.selected = new Set();
      state.submitted = false;
      render();
    });
  }

  $('#prevBtn').onclick = () => {
    if (state.index > 0) {
      finalizeCurrent();
      state.index--;
      state.selected = new Set();
      state.submitted = false;
      render();
    }
  };
  $('#nextBtn').onclick = () => {
    if (state.index < state.items.length - 1) {
      finalizeCurrent();
      state.index++;
      state.selected = new Set();
      state.submitted = false;
      render();
    }
  };
  document.querySelectorAll('.nav-btn').forEach((button) => button.onclick = () => {
    finalizeCurrent();
    if (button.dataset.mode === 'memorize') {
      state.studyMode = true;
      state.index = 0;
      makeItems();
      return;
    }
    state.studyMode = false;
    localStorage.removeItem(memorizeActiveKey);
    if (button.dataset.source) {
      state.source = button.dataset.source;
      state.filter = 'all';
    } else {
      state.filter = button.dataset.filter;
    }
    state.index = 0;
    makeItems();
  });
  $('#randomToggle').onchange = (event) => { state.random = event.target.checked; state.index = 0; makeItems(); };
  $('#instantToggle').onchange = (event) => { state.instant = event.target.checked; if (state.submitted) render(); };
  $('#exportBtn').onclick = exportLearningData;
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    try {
      const imported = normalizeImport(JSON.parse(await file.text()));
      if (!imported) throw new Error('Invalid data');
      if (!confirm('导入会覆盖当前浏览器中的答题记录、错题、收藏和背题进度，是否继续？')) return;
      applyImportedData(imported);
      alert('学习数据导入完成');
    } catch {
      alert('导入失败：请选择本网站导出的学习数据文件');
    }
  };
  $('#resetBtn').onclick = () => {
    if (confirm('确定清空本地答题记录吗？')) {
      state.stats = {};
      state.wrongs.clear();
      saveStats();
      saveWrongs();
      makeItems();
    }
  };
  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') $('#prevBtn').click();
    if (event.key === 'ArrowRight') $('#nextBtn').click();
  });
  updateSummary();
  makeItems();
})();
