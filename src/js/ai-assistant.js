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

function aiAppendMessage(role, text) {
  const box = document.getElementById('ai-assistant-messages');
  if (!box) return;
  const isUser = role === 'user';
  const bubble = document.createElement('div');
  bubble.style.cssText = 'max-width:88%;padding:8px 10px;border-radius:10px;line-height:1.4;white-space:pre-wrap;' +
    (isUser ? 'align-self:flex-end;background:var(--accent);color:white;' : 'align-self:flex-start;background:#f1f5f9;color:#334155;');
  bubble.innerHTML = esc(text);
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;
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
    if (error) throw new Error(await _cpEdgeErr(error, 'ai-assistant'));
    if (data && data.answer) {
      aiAppendMessage('assistant', data.answer);
      _aiHistory.push({ role: 'assistant', content: data.answer });
      _aiHistory = _aiHistory.slice(-12);
    } else {
      aiAppendMessage('assistant', (data && data.error) || 'Nessuna risposta.');
    }
  } catch (e) {
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
