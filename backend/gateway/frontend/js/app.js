const API_BASE = '/api';
const API_TIMEOUT = 15000;
const CONTACTS_KEY = 'wc_contacts';
const HISTORY_KEY = 'wc_history';

let accessToken = localStorage.getItem('access_token') || null;
let userProfile = null;
let simpleUser = null;
let isInCall = false;
let isReady = false;
let callStartTime = null;
let callTimerInterval = null;
let callTimeout = null;
let isMuted = false;
let isOnHold = false;
let sipDomain = null;
let sipExtension = null;
let webPasswordMemory = null;
let currentSession = null;
let recordingsCache = null;

const $ = id => document.getElementById(id);
const UI = {
    statusDot: $('statusDot'),
    statusText: $('statusText'),
    callTimer: $('callTimer'),
    extensionDisplay: $('extensionDisplay'),
    webLoginForm: $('webLoginForm'),
    sipLoginForm: $('sipLoginForm'),
    webUsername: $('webUsername'),
    webPassword: $('webPassword'),
    webLoginBtn: $('webLoginBtn'),
    webLoginError: $('webLoginError'),
    sipLoginBtn: $('sipLoginBtn'),
    sipSkipBtn: $('sipSkipBtn'),
    sipExtension: $('sipExtension'),
    sipPasswordField: $('sipPasswordField'),
    callSection: $('callSection'),
    callDisplay: $('callDisplay'),
    callParty: $('callParty'),
    callStatusLabel: $('callStatusLabel'),
    callControls: $('callControls'),
    callBtn: $('callBtn'),
    hangupBtn: $('hangupBtn'),
    logoutBtn: $('logoutBtn'),
    muteBtn: $('muteBtn'),
    holdBtn: $('holdBtn'),
    dtmfBtn: $('dtmfBtn'),
    targetExtension: $('targetExtension'),
    clearBtn: $('clearBtn'),
    logEntries: $('logEntries'),
    remoteAudio: $('remoteAudio'),
    recordingsList: $('recordingsList'),
    recordingsSearch: $('recordingsSearch'),
    refreshRecordings: $('refreshRecordings'),
    incomingCall: $('incomingCall'),
    callerName: $('callerName'),
    answerBtn: $('answerBtn'),
    rejectBtn: $('rejectBtn'),
    dtmfOverlay: $('dtmfOverlay'),
    dtmfCloseBtn: $('dtmfCloseBtn'),
    contactsList: $('contactsList'),
    contactsSearch: $('contactsSearch'),
    addContactBtn: $('addContactBtn'),
    historyList: $('historyList'),
    clearHistoryBtn: $('clearHistoryBtn'),
    toastContainer: $('toastContainer'),
    webLoginFormTag: $('webLoginFormTag'),
    sipLoginFormTag: $('sipLoginFormTag'),
};

function toast(message, type) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    UI.toastContainer.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(100px)'; el.style.transition = 'all 0.3s ease'; }, 3000);
    setTimeout(() => el.remove(), 3300);
}

function showError(msg) { UI.webLoginError.textContent = msg; UI.webLoginError.classList.remove('hidden'); }
function hideError() { UI.webLoginError.textContent = ''; UI.webLoginError.classList.add('hidden'); }

function setStatus(text, type) {
    UI.statusText.textContent = text;
    UI.statusDot.className = 'status-dot';
    if (type) UI.statusDot.classList.add(type);
}

function setBtnLoading(btn, loading) {
    const text = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');
    btn.disabled = loading;
    if (text) text.style.display = loading ? 'none' : 'inline';
    if (spinner) spinner.classList.toggle('hidden', !loading);
}

function addLogEntry(direction, target, status) {
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = 'log-entry';
    const icon = direction === 'outgoing' ? '\u21E1' : '\u21E3';
    div.innerHTML = `<span class="direction ${direction}"><span class="dir-icon">${icon}</span> ${target}</span><span class="time">${time}</span><span class="status">${status}</span>`;
    const empty = UI.logEntries.querySelector('.log-empty');
    if (empty) empty.remove();
    UI.logEntries.prepend(div);
    while (UI.logEntries.children.length > 50) UI.logEntries.lastChild?.remove();
}

async function apiRequest(endpoint, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
    const headers = { 'Content-Type': 'application/json', ...options?.headers };
    if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
    try {
        const resp = await fetch(API_BASE + endpoint, { ...options, headers, signal: controller.signal });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ message: resp.statusText }));
            throw new Error(err.message || 'Error ' + resp.status);
        }
        return resp.json();
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('Tiempo de espera agotado');
        throw e;
    } finally {
        clearTimeout(timeout);
    }
}

function getContacts() {
    try { return JSON.parse(localStorage.getItem(CONTACTS_KEY)) || []; } catch { return []; }
}

function saveContacts(contacts) {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
}

function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

function saveHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function addHistoryEntry(number, type, duration) {
    const h = getHistory();
    h.unshift({ number, type, duration, time: Date.now() });
    if (h.length > 100) h.length = 100;
    saveHistory(h);
    renderHistory();
}

function renderContacts(filter) {
    const contacts = getContacts();
    const list = UI.contactsList;
    if (!contacts.length) {
        list.innerHTML = '<div class="contacts-empty"><svg viewBox="0 0 24 24" width="32" height="32" fill="#475569"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg><p>No hay contactos</p><p style="font-size:11px;color:#475569;">Añade contactos para marcado rápido</p></div>';
        return;
    }
    const q = (filter || '').toLowerCase();
    const filtered = q ? contacts.filter(c => c.name.toLowerCase().includes(q) || c.extension.includes(q)) : contacts;
    if (!filtered.length) {
        list.innerHTML = '<div class="contacts-empty" style="padding:16px;"><p style="font-size:12px;">Sin resultados</p></div>';
        return;
    }
    list.innerHTML = filtered.map(c => {
        const initial = (c.name || c.extension).charAt(0).toUpperCase();
        return `<div class="contact-item" data-ext="${c.extension}">
            <div class="contact-avatar">${initial}</div>
            <div class="contact-info">
                <div class="contact-name">${escHtml(c.name)}</div>
                <div class="contact-ext">Ext. ${escHtml(c.extension)}</div>
            </div>
            <div class="contact-actions">
                <button class="contact-call-btn" title="Llamar a ${escHtml(c.extension)}">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                </button>
            </div>
        </div>`;
    }).join('');
    list.querySelectorAll('.contact-call-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const ext = btn.closest('.contact-item').dataset.ext;
            callNumber(ext);
        });
    });
}

function renderHistory() {
    const history = getHistory();
    const list = UI.historyList;
    if (!history.length) {
        list.innerHTML = '<div class="history-empty"><svg viewBox="0 0 24 24" width="32" height="32" fill="#475569"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg><p>No hay llamadas registradas</p></div>';
        return;
    }
    const icons = { answered: 'success', missed: 'missed', outgoing: 'outgoing' };
    list.innerHTML = history.slice(0, 50).map(h => {
        const cls = icons[h.type] || 'outgoing';
        const date = new Date(h.time);
        const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dur = h.duration ? ` (${h.duration})` : '';
        const label = { answered: 'Recibida', missed: 'Perdida', outgoing: 'Saliente' }[h.type] || h.type;
        return `<div class="history-item" data-number="${h.number}">
            <div class="history-icon ${cls}">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
            </div>
            <div class="history-info">
                <div class="history-name">${h.number}</div>
                <div class="history-type">${label}${dur}</div>
            </div>
            <div class="history-time">${dateStr}</div>
        </div>`;
    }).join('');
    list.querySelectorAll('.history-item').forEach(el => {
        el.addEventListener('click', () => callNumber(el.dataset.number));
    });
}

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

async function addContact() {
    const name = prompt('Nombre del contacto:');
    if (!name) return;
    const ext = prompt('Extensión:');
    if (!ext) return;
    const contacts = getContacts();
    contacts.push({ name: name.trim(), extension: ext.trim() });
    saveContacts(contacts);
    renderContacts(UI.contactsSearch.value);
    toast('Contacto añadido', 'success');
}

function callNumber(number) {
    if (!number) return;
    if (isInCall) { toast('Ya hay una llamada activa', 'error'); return; }
    UI.targetExtension.value = number;
    switchTab('phone');
    setTimeout(makeCall, 300);
}

function attachRemoteMedia() {
    const el = UI.remoteAudio;
    if (!el) return;
    const session = simpleUser?.session;
    if (!session) return;
    const handler = session.sessionDescriptionHandler;
    const pc = handler?.peerConnection;
    if (!pc) return;
    const bind = (stream) => {
        if (!stream || el.srcObject === stream) return;
        el.srcObject = stream;
        el.autoplay = true;
        el.playsInline = true;
        el.muted = false;
        el.play().catch(() => {});
    };
    if (!pc._trackAttached) {
        pc._trackAttached = true;
        pc.addEventListener('track', (event) => { if (event.streams?.[0]) bind(event.streams[0]); });
    }
    (pc.getReceivers ? pc.getReceivers() : []).forEach((r) => { if (r.track && r.streams?.[0]) bind(r.streams[0]); });
}

async function webLogin() {
    const username = UI.webUsername.value.trim();
    const password = UI.webPassword.value.trim();
    if (!username || !password) { showError('Ingrese usuario y contraseña'); return; }
    hideError();
    setBtnLoading(UI.webLoginBtn, true);
    try {
        const result = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        accessToken = result.access_token;
        localStorage.setItem('access_token', accessToken);
        userProfile = result.user;
        webPasswordMemory = password;
        setStatus('Sesión iniciada: ' + (userProfile.fullName || userProfile.username));
        UI.webLoginForm.classList.add('hidden');
        if (UI.logoutBtn) UI.logoutBtn.classList.remove('hidden');
        showAdminPanel((userProfile.role || '').toLowerCase() === 'admin' || (userProfile.username || '').toLowerCase().startsWith('admin'));
        addLogEntry('incoming', userProfile.username, 'Sesión iniciada');
        if (userProfile.sipExtension) {
            await autoRegisterSip(userProfile.sipExtension, result.sip_password || password);
        } else {
            showError('El usuario no tiene extensión SIP asignada');
        }
    } catch (err) {
        showError(err.message);
    } finally {
        setBtnLoading(UI.webLoginBtn, false);
    }
}

async function autoRegisterSip(extension, password) {
    try {
        const info = await apiRequest('/asterisk/register-sip', { method: 'POST', body: JSON.stringify({ password }) });
        await sipRegisterWithCreds(extension, password, info.server);
    } catch (err) {
        setStatus('Registro SIP falló: ' + err.message);
        UI.sipExtension.value = extension;
        UI.sipPasswordField.value = password;
        UI.sipLoginForm.classList.remove('hidden');
    }
}

async function checkExistingSession() {
    if (!accessToken) return;
    try {
        userProfile = await apiRequest('/auth/profile');
        setStatus('Sesión activa: ' + (userProfile.fullName || userProfile.username));
        UI.webLoginForm.classList.add('hidden');
        if (UI.logoutBtn) UI.logoutBtn.classList.remove('hidden');
        showAdminPanel((userProfile.role || '').toLowerCase() === 'admin' || (userProfile.username || '').toLowerCase().startsWith('admin'));
        if (userProfile.sipExtension) {
            UI.sipExtension.value = userProfile.sipExtension;
            if (userProfile.sipPassword) UI.sipPasswordField.value = userProfile.sipPassword;
            UI.sipLoginForm.classList.remove('hidden');
        }
    } catch {
        accessToken = null;
        localStorage.removeItem('access_token');
    }
}

async function sipRegisterWithCreds(extension, password, server) {
    if (!extension || !password) return;
    sipExtension = extension;
    if (simpleUser) {
        try { simpleUser.disconnect(); } catch {}
        simpleUser = null;
    }
    setStatus('Conectando SIP...');
    const wsServer = server.includes('://') ? server : 'ws://' + server;
    sipDomain = server.split(':')[0].replace(/^ws:\/\//, '');
    try {
        simpleUser = new SIP.Web.SimpleUser(wsServer, {
            aor: 'sip:' + extension + '@' + sipDomain,
            media: { constraints: { audio: true, video: false }, remote: { audio: UI.remoteAudio } },
            userAgentOptions: {
                authorizationUsername: extension,
                authorizationPassword: password,
                sessionDescriptionHandlerFactoryOptions: { constraints: { audio: true, video: false } },
            },
            registererOptions: {},
            delegate: {
                onServerConnect: () => {
                    setStatus('Conectado, registrando...');
                    simpleUser.register().then(() => {
                        isReady = true;
                        setStatus('Registrado como ' + extension, 'registered');
                        UI.extensionDisplay.textContent = extension;
                        UI.callSection.classList.remove('hidden');
                        UI.sipLoginForm.classList.add('hidden');
                        addLogEntry('incoming', extension, 'Registrado SIP');
                        toast('Extensión ' + extension + ' registrada', 'success');
                        renderContacts();
                        renderHistory();
                        loadRecordings();
                    }).catch(e => {
                        setStatus('Error SIP: ' + (e.message || 'desconocido'));
                        addLogEntry('incoming', extension, 'Fallo registro SIP');
                        toast('Fallo registro SIP: ' + (e.message || ''), 'error');
                    });
                },
                onServerDisconnect: () => {
                    setStatus('Desconectado');
                    UI.statusDot.className = 'status-dot';
                    toast('Servidor SIP desconectado', 'error');
                },
                onRegistered: () => { setStatus('Registrado como ' + extension, 'registered'); },
                onUnregistered: () => { setStatus('Desregistrado'); },
                onCallReceived: (session) => {
                    if (!isReady || isInCall) return;
                    currentSession = session;
                    const fromDisplay = session?.remoteIdentity?.displayName || '';
                    const fromUser = session?.remoteIdentity?.uri?.user || 'desconocido';
                    const caller = fromDisplay || fromUser;
                    setStatus('Llamada entrante...', 'connected');
                    UI.callerName.textContent = caller;
                    UI.incomingCall.classList.remove('hidden');
                    UI.callBtn.classList.add('hidden');
                    UI.hangupBtn.classList.add('hidden');
                    addLogEntry('incoming', caller, 'Entrante');
                },
                onCallAnswered: () => {
                    isInCall = true;
                    isMuted = false;
                    isOnHold = false;
                    callStartTime = Date.now();
                    setTimeout(attachRemoteMedia, 100);
                    UI.incomingCall.classList.add('hidden');
                    UI.callControls.classList.remove('hidden');
                    UI.muteBtn.classList.remove('active', 'active-danger');
                    UI.holdBtn.classList.remove('active');
                    setStatus('En llamada...', 'connected');
                    UI.callBtn.classList.add('hidden');
                    UI.hangupBtn.classList.remove('hidden');
                    startCallTimer();
                },
                onCallHangup: () => {
                    endCall();
                },
            },
        });
        await simpleUser.connect();
    } catch (err) {
        setStatus('Error: ' + err.message);
        toast('Error de conexión SIP: ' + err.message, 'error');
    }
}

async function sipRegister() {
    const extension = UI.sipExtension.value.trim();
    const password = webPasswordMemory || UI.sipPasswordField.value.trim();
    if (!extension || !password) { toast('Ingrese extensión y contraseña SIP', 'error'); return; }
    setBtnLoading(UI.sipLoginBtn, true);
    try {
        let server;
        if (!webPasswordMemory) {
            try {
                const info = await apiRequest('/asterisk/register-sip', { method: 'POST', body: JSON.stringify({ password }) });
                server = info.server;
            } catch (err) {
                toast('Error creando extensión: ' + err.message, 'error');
            }
        }
        server = server || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
        await sipRegisterWithCreds(extension, password, server);
    } finally {
        setBtnLoading(UI.sipLoginBtn, false);
    }
}

function sipSkip() {
    UI.sipLoginForm.classList.add('hidden');
    UI.callSection.classList.remove('hidden');
    setStatus('Conectado (sin SIP)', 'registered');
    UI.extensionDisplay.textContent = userProfile?.sipExtension || 'N/A';
    renderContacts();
    renderHistory();
    loadRecordings();
}

function startCallTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);
    UI.callTimer.classList.remove('hidden');
    callTimerInterval = setInterval(() => {
        if (!callStartTime) return;
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        UI.callTimer.textContent = m + ':' + s;
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) { clearInterval(callTimerInterval); callTimerInterval = null; }
    callStartTime = null;
    UI.callTimer.textContent = '00:00';
    UI.callTimer.classList.add('hidden');
}

function endCall() {
    isInCall = false;
    isMuted = false;
    isOnHold = false;
    if (callStartTime) {
        const duration = Math.floor((Date.now() - callStartTime) / 1000);
        const m = String(Math.floor(duration / 60)).padStart(2, '0');
        const s = String(duration % 60).padStart(2, '0');
        addHistoryEntry(sipExtension || 'Desconocido', 'answered', m + ':' + s);
    }
    stopCallTimer();
    if (UI.remoteAudio) { UI.remoteAudio.pause(); UI.remoteAudio.srcObject = null; }
    UI.incomingCall.classList.add('hidden');
    UI.callControls.classList.add('hidden');
    UI.muteBtn.classList.remove('active', 'active-danger');
    UI.holdBtn.classList.remove('active');
    setStatus('Registrado', 'registered');
    UI.callBtn.classList.remove('hidden');
    UI.hangupBtn.classList.add('hidden');
    addLogEntry('incoming', 'Llamada', 'Finalizada');
    setTimeout(loadRecordings, 2000);
}

function makeCall() {
    const target = UI.targetExtension.value.trim();
    if (!target) { toast('Ingrese extensión destino', 'error'); return; }
    if (!simpleUser) { toast('No registrado SIP', 'error'); return; }
    setStatus('Llamando a ' + target + '...');
    UI.callParty.textContent = target;
    UI.callStatusLabel.textContent = 'Llamando...';
    addLogEntry('outgoing', target, 'Llamando');
    const targetUri = 'sip:' + target + '@' + (sipDomain || location.hostname);
    callTimeout = setTimeout(() => {
        if (isInCall) return;
        setStatus('Llamada sin respuesta');
        UI.callParty.textContent = '---';
        UI.callStatusLabel.textContent = 'No contestó';
        UI.callBtn.classList.remove('hidden');
        UI.hangupBtn.classList.add('hidden');
        addLogEntry('outgoing', target, 'Sin respuesta');
        toast('La extensión no está disponible', 'error');
        if (simpleUser) simpleUser.hangup().catch(() => {});
    }, 30000);
    simpleUser.call(targetUri).then(() => {
        if (callTimeout) { clearTimeout(callTimeout); callTimeout = null; }
        isInCall = true;
        isMuted = false;
        isOnHold = false;
        callStartTime = Date.now();
        startCallTimer();
        setTimeout(attachRemoteMedia, 100);
        UI.callControls.classList.remove('hidden');
        UI.callBtn.classList.add('hidden');
        UI.hangupBtn.classList.remove('hidden');
        UI.callStatusLabel.textContent = 'En llamada...';
        addLogEntry('outgoing', target, 'Conectada');
    }).catch((err) => {
        if (callTimeout) { clearTimeout(callTimeout); callTimeout = null; }
        setStatus('Error: ' + err.message);
        UI.callParty.textContent = '---';
        UI.callStatusLabel.textContent = 'Error';
        UI.callBtn.classList.remove('hidden');
        UI.hangupBtn.classList.add('hidden');
        addLogEntry('outgoing', target, 'Error');
        toast('Error al llamar: ' + err.message, 'error');
    });
}

function hangup() {
    if (simpleUser) {
        simpleUser.hangup().then(endCall).catch(endCall);
    } else {
        endCall();
    }
}

function sendDtmf(tone) {
    if (!simpleUser || !simpleUser.session) { toast('No hay llamada activa', 'error'); return; }
    try {
        simpleUser.session.info({ contentType: 'application/dtmf-relay', body: tone }).catch(() => {});
    } catch {}
}

function toggleMute() {
    if (!simpleUser || !simpleUser.session) return;
    isMuted = !isMuted;
    if (isMuted) {
        simpleUser.mute();
        UI.muteBtn.classList.add('active-danger');
        UI.muteBtn.querySelector('span').textContent = 'Silenciado';
        addLogEntry('outgoing', '', 'Micrófono silenciado');
        toast('Micrófono silenciado', 'info');
    } else {
        simpleUser.unmute();
        UI.muteBtn.classList.remove('active-danger');
        UI.muteBtn.querySelector('span').textContent = 'Silenciar';
        addLogEntry('outgoing', '', 'Micrófono activado');
    }
}

function toggleHold() {
    if (!simpleUser || !simpleUser.session) return;
    isOnHold = !isOnHold;
    if (isOnHold) {
        simpleUser.hold();
        UI.holdBtn.classList.add('active');
        UI.holdBtn.querySelector('span').textContent = 'Retenida';
        UI.callStatusLabel.textContent = 'Llamada retenida';
        addLogEntry('outgoing', '', 'Llamada retenida');
    } else {
        simpleUser.unhold();
        UI.holdBtn.classList.remove('active');
        UI.holdBtn.querySelector('span').textContent = 'Retener';
        UI.callStatusLabel.textContent = 'En llamada...';
        addLogEntry('outgoing', '', 'Llamada reanudada');
    }
}

function logout() {
    isInCall = false;
    isReady = false;
    sipExtension = null;
    stopCallTimer();
    accessToken = null;
    userProfile = null;
    webPasswordMemory = null;
    sipDomain = null;
    localStorage.removeItem('access_token');
    UI.incomingCall.classList.add('hidden');
    if (simpleUser) { simpleUser.disconnect().catch(() => {}); simpleUser = null; }
    setStatus('Desconectado');
    UI.extensionDisplay.textContent = '---';
    UI.callParty.textContent = '---';
    UI.callStatusLabel.textContent = 'Esperando';
    if (UI.logoutBtn) UI.logoutBtn.classList.add('hidden');
    showAdminPanel(false);
    UI.webLoginForm.classList.remove('hidden');
    UI.sipLoginForm.classList.add('hidden');
    UI.callSection.classList.add('hidden');
    UI.callBtn.classList.remove('hidden');
    UI.hangupBtn.classList.add('hidden');
}

async function loadRecordings() {
    if (!UI.recordingsList) return;
    UI.recordingsList.innerHTML = '<div class="loading"><span class="spinner"></span><p>Cargando grabaciones...</p></div>';
    try {
        recordingsCache = await apiRequest('/recordings');
        renderRecordings(recordingsCache);
    } catch (err) {
        recordingsCache = null;
        UI.recordingsList.innerHTML = '<div class="empty-state">Error al cargar: ' + escHtml(err.message) + '</div>';
    }
}

async function loadAdminUsers() {
    if (!UI.adminUsersList) return;
    UI.adminUsersList.innerHTML = '<div class="loading"><span class="spinner"></span><p>Cargando usuarios...</p></div>';
    try {
        const users = await apiRequest('/admin/users');
        renderAdminUsers(users);
    } catch (err) {
        UI.adminUsersList.innerHTML = '<div class="empty-state">Error al cargar: ' + escHtml(err.message) + '</div>';
    }
}

function renderAdminUsers(users) {
    if (!users || users.length === 0) {
        UI.adminUsersList.innerHTML = '<div class="empty-state">No hay usuarios registrados</div>';
        return;
    }
    UI.adminUsersList.innerHTML = users.map(u => {
        const statusClass = u.enabled ? 'admin-user-active' : 'admin-user-inactive';
        const statusText = u.enabled ? 'Activo' : 'Inactivo';
        const roleBadge = u.role === 'admin' ? 'admin-badge' : '';
        return '<div class="admin-user-item">' +
            '<div class="admin-user-avatar">' + u.username.charAt(0).toUpperCase() + '</div>' +
            '<div class="admin-user-info">' +
                '<div class="admin-user-name">' + escHtml(u.fullName || u.username) + ' <span class="admin-user-role ' + roleBadge + '">' + escHtml(u.role) + '</span></div>' +
                '<div class="admin-user-detail">' + escHtml(u.username) + (u.sipExtension ? ' &middot; Ext. ' + escHtml(u.sipExtension) : '') + '</div>' +
                '<div class="admin-user-detail">' + escHtml(u.email || '') + ' &middot; ' + new Date(u.createdAt).toLocaleDateString() + '</div>' +
            '</div>' +
            '<div class="admin-user-status ' + statusClass + '">' + statusText + '</div>' +
        '</div>';
    }).join('');
}

function showAdminPanel(show) {
    const tab = document.getElementById('adminTab');
    const tabBtn = document.querySelector('[data-tab="admin"]');
    if (tab && tabBtn) {
        if (show) {
            tabBtn.classList.remove('hidden');
        } else {
            tabBtn.classList.add('hidden');
            if (document.querySelector('.tab.active[data-tab="admin"]')) {
                switchTab('phone');
            }
        }
    }
}

function renderRecordings(items) {
    if (!items || items.length === 0) {
        UI.recordingsList.innerHTML = '<div class="empty-state">No hay grabaciones<p style="font-size:12px;color:#475569;margin-top:6px;">Realiza una llamada para generar grabaciones</p></div>';
        return;
    }
    const q = (UI.recordingsSearch.value || '').toLowerCase();
    const filtered = q ? items.filter(i => (i.caller + ' ' + i.callee).toLowerCase().includes(q)) : items;
    if (!filtered.length) {
        UI.recordingsList.innerHTML = '<div class="empty-state">Sin resultados</div>';
        return;
    }
    UI.recordingsList.innerHTML = filtered.map(item => {
        const sizeStr = item.size > 1024 ? (item.size / 1024).toFixed(1) + ' KB' : item.size + ' B';
        const dateStr = new Date(item.lastModified).toLocaleString();
        const dur = item.duration ? formatDuration(item.duration) : '';
        return `<div class="recording-item">
            <div class="recording-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.09-.6-.39-1.14-1-1.14z"/></svg>
            </div>
            <div class="recording-info">
                <div class="recording-name">${escHtml(item.caller)} → ${escHtml(item.callee)}</div>
                <div class="recording-meta">
                    <span>${dateStr}</span>
                    ${dur ? '<span class="duration">' + dur + '</span>' : ''}
                    <span class="size">${sizeStr}</span>
                </div>
                <div class="recording-audio">
                    <audio controls preload="metadata">
                        <source src="${item.url}" type="audio/wav">
                    </audio>
                </div>
            </div>
        </div>`;
    }).join('');
    UI.recordingsList.querySelectorAll('audio').forEach(el => {
        el.addEventListener('error', () => {
            el.style.borderColor = 'var(--danger)';
            el.title = 'Error al cargar audio';
        });
    });
}

function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? m + ':' + String(s).padStart(2, '0') + ' min' : s + 's';
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const tab = document.querySelector('[data-tab="' + tabId + '"]');
    if (tab) tab.classList.add('active');
    const content = document.getElementById(tabId + 'Tab');
    if (content) content.classList.add('active');
    if (tabId === 'recordings') loadRecordings();
    if (tabId === 'contacts') renderContacts(UI.contactsSearch.value);
    if (tabId === 'history') renderHistory();
    if (tabId === 'admin') loadAdminUsers();
}

function init() {
    document.querySelectorAll('.dial-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.value === 'backspace') {
                UI.targetExtension.value = UI.targetExtension.value.slice(0, -1);
            } else {
                UI.targetExtension.value += btn.dataset.value;
            }
            UI.targetExtension.focus();
        });
    });

    UI.targetExtension.addEventListener('keydown', e => { if (e.key === 'Enter') makeCall(); });
    document.querySelectorAll('#webLoginForm input').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') webLogin(); }));
    document.querySelectorAll('#sipLoginForm input').forEach(inp => inp.addEventListener('keydown', e => { if (e.key === 'Enter') sipRegister(); }));

    if (UI.webLoginBtn) UI.webLoginBtn.addEventListener('click', webLogin);
    if (UI.sipLoginBtn) UI.sipLoginBtn.addEventListener('click', sipRegister);
    if (UI.sipSkipBtn) UI.sipSkipBtn.addEventListener('click', sipSkip);
    if (UI.callBtn) UI.callBtn.addEventListener('click', makeCall);
    if (UI.hangupBtn) UI.hangupBtn.addEventListener('click', hangup);
    if (UI.logoutBtn) UI.logoutBtn.addEventListener('click', logout);
    if (UI.clearBtn) UI.clearBtn.addEventListener('click', () => { UI.targetExtension.value = ''; });

    if (UI.answerBtn) UI.answerBtn.addEventListener('click', () => {
        UI.incomingCall.classList.add('hidden');
        if (simpleUser) {
            simpleUser.answer().then(() => {
                isInCall = true;
                callStartTime = Date.now();
                startCallTimer();
                setStatus('En llamada...', 'connected');
                UI.callBtn.classList.add('hidden');
                UI.hangupBtn.classList.remove('hidden');
                UI.callParty.textContent = UI.callerName.textContent;
                UI.callStatusLabel.textContent = 'En llamada...';
            }).catch(() => {
                isInCall = false;
                setStatus('Registrado', 'registered');
                UI.callBtn.classList.remove('hidden');
                UI.hangupBtn.classList.add('hidden');
            });
        }
    });

    if (UI.rejectBtn) UI.rejectBtn.addEventListener('click', () => {
        UI.incomingCall.classList.add('hidden');
        if (simpleUser) simpleUser.decline().catch(() => {});
        isInCall = false;
        setStatus('Registrado', 'registered');
        UI.callBtn.classList.remove('hidden');
        UI.hangupBtn.classList.add('hidden');
    });

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    if (UI.refreshRecordings) UI.refreshRecordings.addEventListener('click', loadRecordings);
    if (document.getElementById('refreshAdminUsers')) document.getElementById('refreshAdminUsers').addEventListener('click', loadAdminUsers);
    if (UI.recordingsSearch) UI.recordingsSearch.addEventListener('input', () => {
        if (recordingsCache) renderRecordings(recordingsCache);
    });
    if (UI.contactsSearch) UI.contactsSearch.addEventListener('input', () => renderContacts(UI.contactsSearch.value));
    if (UI.addContactBtn) UI.addContactBtn.addEventListener('click', addContact);
    if (UI.clearHistoryBtn) UI.clearHistoryBtn.addEventListener('click', () => {
        if (confirm('¿Limpiar todo el historial?')) { saveHistory([]); renderHistory(); toast('Historial limpiado', 'info'); }
    });

    if (UI.muteBtn) UI.muteBtn.addEventListener('click', toggleMute);
    if (UI.holdBtn) UI.holdBtn.addEventListener('click', toggleHold);

    if (UI.dtmfBtn) UI.dtmfBtn.addEventListener('click', () => UI.dtmfOverlay.classList.remove('hidden'));
    if (UI.dtmfCloseBtn) UI.dtmfCloseBtn.addEventListener('click', () => UI.dtmfOverlay.classList.add('hidden'));
    document.querySelectorAll('.dtmf-key').forEach(btn => {
        btn.addEventListener('click', () => {
            sendDtmf(btn.dataset.value);
        });
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            UI.incomingCall.classList.add('hidden');
            UI.dtmfOverlay.classList.add('hidden');
            if (isInCall || !UI.hangupBtn.classList.contains('hidden')) hangup();
        }
        if (e.key >= '0' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.target?.matches('input, textarea')) {
            UI.targetExtension.value += e.key;
            UI.targetExtension.focus();
            if (!document.querySelector('.tab.active[data-tab="phone"]')) switchTab('phone');
        }
    });

    checkExistingSession();
}

document.addEventListener('DOMContentLoaded', init);
