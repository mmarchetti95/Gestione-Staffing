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
  if (_aiPanelOpen) aiCheckStatus();
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
  const apiKey = document.getElementById('ai-config-apikey').value;
  if (!model) { aiConfigMsg('Il modello non può essere vuoto.', null); return; }
  btn.disabled = true; btn.textContent = 'Salvataggio…';
  try {
    const body = { enabled, provider, model };
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
    await aiConfigCall('set', { enabled, provider, model, revoke_api_key: true });
    await aiConfigPopulate();
    aiConfigMsg(null, '✓ Chiave revocata.');
  } catch (e) {
    aiConfigMsg('Errore revoca chiave: ' + e.message, null);
  }
}
