/* ===================== ASSISTENTE AI (widget flottante) ===================== */
// Widget di domande e risposte in sola lettura sui dati dell'app (operatori,
// pipeline, pianificazione, ferie, produzione). Nessuna scrittura: la Edge
// Function 'ai-assistant' interroga staffing_state/controllo_produzione con
// il JWT dell'utente (stesse RLS del browser) e usa il provider LLM/modello
// scelti dall'admin nel modal "Gestione Assistente AI" (Edge Function
// 'ai-assistant-config'). Storico conversazione tenuto solo in memoria,
// azzerato al reload — nessun nuovo dominio di sync.

let _aiHistory = [];
let _aiPanelOpen = false;

function aiApplyWidgetVisibility() {
  const btn = document.getElementById('ai-assistant-btn');
  if (!btn) return;
  btn.style.display = (sbRole() === 'guest') ? 'none' : 'flex';
}

function aiToggleWidget() {
  const panel = document.getElementById('ai-assistant-panel');
  if (!panel) return;
  _aiPanelOpen = !_aiPanelOpen;
  panel.style.display = _aiPanelOpen ? 'flex' : 'none';
  if (_aiPanelOpen) {
    if (_aiWidgetMode !== 'chat') aiWidgetBackToChat();
    aiCheckStatus();
  }
}

async function aiCheckStatus() {
  const banner = document.getElementById('ai-assistant-disabled-banner');
  const inputRow = document.getElementById('ai-assistant-input-row');
  try {
    const { data, error } = await _sbClient.functions.invoke('ai-assistant', { body: { action: 'status' } });
    if (error) throw new Error(await _cpEdgeErr(error, 'ai-assistant'));
    const enabled = !!(data && data.enabled);
    if (banner) banner.style.display = enabled ? 'none' : 'block';
    if (inputRow) inputRow.style.display = enabled ? 'flex' : 'none';
  } catch (e) {
    if (banner) { banner.textContent = 'Errore nel contattare l\'assistente: ' + e.message; banner.style.display = 'block'; }
    if (inputRow) inputRow.style.display = 'none';
  }
}

// Markdown minimale usato dalle risposte dell'assistente (grassetto **testo** ed
// elenchi puntati "* "/"- ") -> HTML. Esegue sempre prima esc() sul testo grezzo:
// i tag <strong>/<ul>/<li>/<div> inseriti dopo sono letterali nostri, mai
// interpretati a partire dal testo del modello (nessun rischio di injection).
function aiFormatMarkdown(rawText) {
  const lines = esc(rawText).split('\n');
  const htmlParts = [];
  let listBuffer = [];
  function flushList() {
    if (!listBuffer.length) return;
    htmlParts.push('<ul style="margin:4px 0 4px 18px;padding:0;">' + listBuffer.map(li => '<li>' + li + '</li>').join('') + '</ul>');
    listBuffer = [];
  }
  lines.forEach(line => {
    const bulletMatch = line.match(/^\s*[*-]\s+(.*)$/);
    if (bulletMatch) {
      listBuffer.push(bulletMatch[1]);
      return;
    }
    flushList();
    htmlParts.push(line.trim() === '' ? '<div style="height:6px;"></div>' : '<div>' + line + '</div>');
  });
  flushList();
  return htmlParts.join('').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function aiAppendMessage(role, text) {
  const box = document.getElementById('ai-assistant-messages');
  if (!box) return;
  const isUser = role === 'user';
  const bubble = document.createElement('div');
  bubble.style.cssText = 'max-width:88%;padding:8px 10px;border-radius:10px;line-height:1.45;' +
    (isUser ? 'align-self:flex-end;background:var(--accent);color:white;white-space:pre-wrap;' : 'align-self:flex-start;background:#f1f5f9;color:#334155;');
  bubble.innerHTML = isUser ? esc(text) : aiFormatMarkdown(text);
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;
}

// Bollicina "sta scrivendo…" mostrata mentre si attende la risposta della Edge
// Function (può richiedere qualche secondo per via del tool-use loop) — senza
// questo l'utente non ha alcun segnale che la domanda è stata inviata.
function aiShowTyping() {
  const box = document.getElementById('ai-assistant-messages');
  if (!box || document.getElementById('ai-typing-indicator')) return;
  const bubble = document.createElement('div');
  bubble.id = 'ai-typing-indicator';
  bubble.style.cssText = 'align-self:flex-start;background:#f1f5f9;padding:9px 12px;border-radius:10px;';
  bubble.innerHTML = '<span class="ai-typing-dots"><span></span><span></span><span></span></span>';
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;
}

function aiHideTyping() {
  const el = document.getElementById('ai-typing-indicator');
  if (el) el.remove();
}

async function aiSendQuestion() {
  const input = document.getElementById('ai-assistant-input');
  const btn = document.getElementById('ai-assistant-send-btn');
  if (!input) return;
  const question = input.value.trim();
  if (!question) return;
  input.value = '';
  aiAppendMessage('user', question);
  _aiHistory.push({ role: 'user', content: question });
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  aiShowTyping();
  try {
    const { data, error } = await _sbClient.functions.invoke('ai-assistant', {
      body: {
        action: 'ask',
        question,
        anno: typeof pwAnno !== 'undefined' ? pwAnno : new Date().getFullYear(),
        settimana: typeof pwWeek !== 'undefined' ? pwWeek : 1,
        history: _aiHistory.slice(-12),
      }
    });
    aiHideTyping();
    if (error) throw new Error(await _cpEdgeErr(error, 'ai-assistant'));
    if (data && data.answer) {
      aiAppendMessage('assistant', data.answer);
      _aiHistory.push({ role: 'assistant', content: data.answer });
      _aiHistory = _aiHistory.slice(-12);
      aiLogHistory(question, data.answer);
    } else {
      aiAppendMessage('assistant', (data && data.error) || 'Nessuna risposta.');
    }
  } catch (e) {
    aiHideTyping();
    aiAppendMessage('assistant', 'Errore: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Invia'; }
  }
}

// Storico persistente domanda/risposta (tabella ai_assistant_history, insert-only
// per l'utente stesso, lettura solo admin via RLS) — a differenza di _aiHistory
// (contesto conversazionale in memoria, azzerato al reload) questo non torna mai
// indietro al client: serve solo alla vista admin "Storico Assistente AI".
// Fire-and-forget: un fallimento qui non deve mai rompere la chat.
async function aiLogHistory(question, answer) {
  if (!_sbClient || !_sbUser) return;
  try {
    await _sbClient.from('ai_assistant_history').insert({
      user_email: _sbUser.email,
      question,
      answer
    });
  } catch (e) {
    console.warn('AI history log error:', e);
  }
}

/* ----- Storico personale nel widget (🕘, tutti gli utenti non-guest) -----
   Legge solo le proprie righe (RLS read_ai_history_own: user_email = proprio
   JWT). Riapre una domanda passata come due bubble di sola lettura dentro lo
   stesso contenitore #ai-assistant-messages: la chat live viene salvata in
   _aiWidgetChatSnapshot e ripristinata tornando indietro, così non si perde
   nulla della conversazione in corso. */

let _aiWidgetMode = 'chat'; // 'chat' | 'historyList' | 'historyEntry'
let _aiWidgetChatSnapshot = null;
let _aiMyHistoryRows = [];

function aiWidgetToggleHistory() {
  if (_aiWidgetMode === 'chat') {
    aiWidgetShowHistoryList();
  } else {
    aiWidgetBackToChat();
  }
}

async function aiWidgetShowHistoryList() {
  const box = document.getElementById('ai-assistant-messages');
  const inputRow = document.getElementById('ai-assistant-input-row');
  if (!box || !_sbUser) return;
  if (_aiWidgetMode === 'chat') _aiWidgetChatSnapshot = box.innerHTML;
  _aiWidgetMode = 'historyList';
  if (inputRow) inputRow.style.display = 'none';
  box.innerHTML = '<div style="text-align:center;color:#94a3b8;font-size:11.5px;padding:10px;">Caricamento storico…</div>';
  try {
    const { data, error } = await _sbClient
      .from('ai_assistant_history')
      .select('*')
      .eq('user_email', _sbUser.email)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    _aiMyHistoryRows = data || [];
    aiWidgetRenderHistoryList();
  } catch (e) {
    box.innerHTML = '<div style="text-align:center;color:#ef4444;font-size:11.5px;padding:10px;">Errore: ' + esc(e.message) + '</div>';
  }
}

function aiWidgetRenderHistoryList() {
  const box = document.getElementById('ai-assistant-messages');
  if (!box) return;
  const header = '<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 2px 8px;border-bottom:1px solid #f1f5f9;margin-bottom:6px;">' +
    '<div style="font-weight:600;font-size:11.5px;color:#475569;">🕘 Le tue domande</div>' +
    '<button onclick="aiWidgetBackToChat()" style="background:none;border:none;color:var(--accent);font-size:11px;cursor:pointer;">← Torna alla chat</button>' +
    '</div>';
  if (!_aiMyHistoryRows.length) {
    box.innerHTML = header + '<div style="text-align:center;color:#94a3b8;font-size:11.5px;padding:14px 6px;">Nessuna domanda registrata.</div>';
    return;
  }
  const items = _aiMyHistoryRows.map((row, idx) => {
    const dt = new Date(row.created_at);
    const dateStr = dt.toLocaleDateString('it-IT') + ' ' + dt.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
    return '<div onclick="aiWidgetOpenHistoryEntry(' + idx + ')" style="cursor:pointer;padding:8px 9px;border-radius:8px;background:#f8fafc;border:1px solid #f1f5f9;">' +
      '<div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">' + esc(dateStr) + '</div>' +
      '<div style="font-size:12px;color:#334155;">' + esc(aiHistoryTruncate(row.question || '', 90)) + '</div>' +
      '</div>';
  }).join('');
  box.innerHTML = header + '<div style="display:flex;flex-direction:column;gap:6px;">' + items + '</div>';
}

function aiWidgetOpenHistoryEntry(idx) {
  const box = document.getElementById('ai-assistant-messages');
  const row = _aiMyHistoryRows[idx];
  if (!box || !row) return;
  _aiWidgetMode = 'historyEntry';
  const dt = new Date(row.created_at);
  const dateStr = dt.toLocaleDateString('it-IT') + ' ' + dt.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
  box.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 2px 8px;border-bottom:1px solid #f1f5f9;margin-bottom:8px;">' +
    '<div style="font-size:10.5px;color:#94a3b8;">🕘 ' + esc(dateStr) + ' · sola lettura</div>' +
    '<button onclick="aiWidgetShowHistoryList()" style="background:none;border:none;color:var(--accent);font-size:11px;cursor:pointer;">← Elenco</button>' +
    '</div>';
  const userBubble = document.createElement('div');
  userBubble.style.cssText = 'max-width:88%;padding:8px 10px;border-radius:10px;line-height:1.45;align-self:flex-end;background:var(--accent);color:white;white-space:pre-wrap;';
  userBubble.innerHTML = esc(row.question || '');
  const assistantBubble = document.createElement('div');
  assistantBubble.style.cssText = 'max-width:88%;padding:8px 10px;border-radius:10px;line-height:1.45;align-self:flex-start;background:#f1f5f9;color:#334155;';
  assistantBubble.innerHTML = aiFormatMarkdown(row.answer || '');
  box.appendChild(userBubble);
  box.appendChild(assistantBubble);
}

function aiWidgetBackToChat() {
  const box = document.getElementById('ai-assistant-messages');
  if (box && _aiWidgetChatSnapshot !== null) box.innerHTML = _aiWidgetChatSnapshot;
  _aiWidgetMode = 'chat';
  _aiWidgetChatSnapshot = null;
  aiCheckStatus();
}

/* ----- Modal admin "Gestione Assistente AI" ----- */

const AI_PROVIDER_DEFAULT_MODEL = {
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
  anthropic: 'claude-haiku-4-5-20251001',
};

async function aiConfigCall(action, extra) {
  const { data, error } = await _sbClient.functions.invoke('ai-assistant-config', { body: { action, ...extra } });
  if (error) throw new Error(await _cpEdgeErr(error, 'ai-assistant-config'));
  if (data && data.error) throw new Error(data.error);
  return data;
}

function aiConfigMsg(errText, okText) {
  const errEl = document.getElementById('ai-config-error');
  const okEl = document.getElementById('ai-config-success');
  if (errText) { errEl.textContent = errText; errEl.style.display = 'block'; } else { errEl.style.display = 'none'; }
  if (okText) { okEl.textContent = okText; okEl.style.display = 'block'; } else { okEl.style.display = 'none'; }
}

function aiConfigProviderChanged() {
  const provider = document.getElementById('ai-config-provider').value;
  const modelInput = document.getElementById('ai-config-model');
  if (modelInput && !modelInput.value.trim()) modelInput.value = AI_PROVIDER_DEFAULT_MODEL[provider] || '';
}

async function aiConfigPopulate() {
  const data = await aiConfigCall('get');
  document.getElementById('ai-config-enabled').checked = !!data.enabled;
  document.getElementById('ai-config-provider').value = data.provider || 'gemini';
  document.getElementById('ai-config-model').value = data.model || AI_PROVIDER_DEFAULT_MODEL[data.provider] || '';
  document.getElementById('ai-config-instructions').value = data.custom_instructions || '';
  document.getElementById('ai-config-apikey-status').textContent = data.has_api_key
    ? '✓ Chiave configurata (lascia vuoto per non modificarla)'
    : 'Nessuna chiave configurata';
}

async function aiConfigOpen() {
  document.getElementById('ai-config-modal').style.display = 'flex';
  aiConfigMsg(null, null);
  document.getElementById('ai-config-apikey').value = '';
  try {
    await aiConfigPopulate();
  } catch (e) {
    aiConfigMsg('Errore caricamento configurazione: ' + e.message, null);
  }
}

function aiConfigClose() {
  document.getElementById('ai-config-modal').style.display = 'none';
}

async function aiConfigSave() {
  const btn = document.getElementById('ai-config-save-btn');
  const enabled = document.getElementById('ai-config-enabled').checked;
  const provider = document.getElementById('ai-config-provider').value;
  const model = document.getElementById('ai-config-model').value.trim();
  const customInstructions = document.getElementById('ai-config-instructions').value.trim();
  const apiKey = document.getElementById('ai-config-apikey').value;
  if (!model) { aiConfigMsg('Il modello non può essere vuoto.', null); return; }
  btn.disabled = true; btn.textContent = 'Salvataggio…';
  try {
    const body = { enabled, provider, model, custom_instructions: customInstructions };
    if (apiKey.trim()) body.api_key = apiKey;
    await aiConfigCall('set', body);
    document.getElementById('ai-config-apikey').value = '';
    await aiConfigPopulate();
    aiConfigMsg(null, '✓ Configurazione salvata.');
  } catch (e) {
    aiConfigMsg('Errore salvataggio: ' + e.message, null);
  } finally {
    btn.disabled = false; btn.textContent = 'Salva';
  }
}

async function aiConfigRevokeKey() {
  const conferma = await showConfirmAsync('Revocare la API key configurata? L\'assistente smetterà di funzionare finché non ne verrà impostata una nuova.', 'Revoca chiave');
  if (!conferma) return;
  try {
    const enabled = document.getElementById('ai-config-enabled').checked;
    const provider = document.getElementById('ai-config-provider').value;
    const model = document.getElementById('ai-config-model').value.trim();
    const customInstructions = document.getElementById('ai-config-instructions').value.trim();
    await aiConfigCall('set', { enabled, provider, model, custom_instructions: customInstructions, revoke_api_key: true });
    await aiConfigPopulate();
    aiConfigMsg(null, '✓ Chiave revocata.');
  } catch (e) {
    aiConfigMsg('Errore revoca chiave: ' + e.message, null);
  }
}

/* ----- Modal admin "Storico Assistente AI" ----- */

let _aiHistoryRows = [];

async function aiHistoryShow() {
  document.getElementById('ai-history-modal').style.display = 'flex';
  await aiHistoryLoad();
}

function aiHistoryClose() {
  document.getElementById('ai-history-modal').style.display = 'none';
}

function aiHistoryTruncate(text, max) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function aiHistoryRenderRows(rows) {
  const tbody = document.getElementById('ai-history-tbody');
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;">Nessuna domanda registrata.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(row => {
    const dt = new Date(row.created_at);
    const dateStr = dt.toLocaleDateString('it-IT') + ' ' + dt.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
    const question = row.question || '';
    const answer = row.answer || '';
    return '<tr style="border-bottom:1px solid #f1f5f9;">' +
      '<td style="padding:7px 12px;white-space:nowrap;color:#64748b;vertical-align:top;">' + esc(dateStr) + '</td>' +
      '<td style="padding:7px 12px;color:#374151;vertical-align:top;">' + esc(row.user_email || '') + '</td>' +
      '<td style="padding:7px 12px;color:#0f172a;max-width:220px;vertical-align:top;" title="' + esc(question) + '">' + esc(aiHistoryTruncate(question, 140)) + '</td>' +
      '<td style="padding:7px 12px;color:#64748b;font-size:11px;max-width:280px;vertical-align:top;" title="' + esc(answer) + '">' + esc(aiHistoryTruncate(answer, 180)) + '</td>' +
      '</tr>';
  }).join('');
}

async function aiHistoryLoad() {
  const tbody = document.getElementById('ai-history-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;">Caricamento…</td></tr>';
  const filterInput = document.getElementById('ai-history-filter');
  if (filterInput) filterInput.value = '';
  try {
    const { data, error } = await _sbClient
      .from('ai_assistant_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    _aiHistoryRows = data || [];
    aiHistoryRenderRows(_aiHistoryRows);
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#ef4444;">Errore: ' + esc(e.message) + '</td></tr>';
  }
}

function aiHistoryFilter() {
  const input = document.getElementById('ai-history-filter');
  const term = (input ? input.value : '').trim().toLowerCase();
  if (!term) { aiHistoryRenderRows(_aiHistoryRows); return; }
  const filtered = _aiHistoryRows.filter(row =>
    (row.user_email || '').toLowerCase().includes(term) ||
    (row.question || '').toLowerCase().includes(term) ||
    (row.answer || '').toLowerCase().includes(term)
  );
  aiHistoryRenderRows(filtered);
}
