const API_BASE = '/api';

const UI = {
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    extensionDisplay: document.getElementById('extension-display'),
    webLoginForm: document.getElementById('webLoginForm'),
    sipLoginForm: document.getElementById('sipLoginForm'),
    webUsername: document.getElementById('webUsername'),
    webPassword: document.getElementById('webPassword'),
    webLoginBtn: document.getElementById('webLoginBtn'),
    webLoginError: document.getElementById('webLoginError'),
    sipLoginBtn: document.getElementById('sipLoginBtn'),
    sipSkipBtn: document.getElementById('sipSkipBtn'),
    extension: document.getElementById('extension'),
    sipPassword: document.getElementById('sipPassword'),
    server: document.getElementById('server'),
    callSection: document.getElementById('callSection'),
    callBtn: document.getElementById('callBtn'),
    hangupBtn: document.getElementById('hangupBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    targetExtension: document.getElementById('targetExtension'),
    logEntries: document.getElementById('logEntries'),
    remoteAudio: document.getElementById('remoteAudio'),
    recordingsList: document.getElementById('recordingsList'),
    refreshRecordings: document.getElementById('refreshRecordings'),
    incomingCall: document.getElementById('incomingCall'),
    callerName: document.getElementById('callerName'),
    answerBtn: document.getElementById('answerBtn'),
    rejectBtn: document.getElementById('rejectBtn'),
};

let accessToken = localStorage.getItem('access_token') || null;
let userProfile = null;
let simpleUser = null;
let currentSession = null;
let isInCall = false;
let isReady = false;

function setStatus(text, type) {
    UI.statusText.textContent = text;
    UI.statusDot.className = 'status-dot';
    if (type) UI.statusDot.classList.add(type);
}

function addLogEntry(direction, target, status) {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `
        <span class="direction ${direction}">${direction === 'outgoing' ? '\u2192' : '\u2190'} ${target}</span>
        <span class="time">${time}</span>
        <span class="status">${status}</span>
    `;
    UI.logEntries.prepend(entry);
}

async function apiRequest(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
    }
    const resp = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: resp.statusText }));
        throw new Error(err.message || `Error ${resp.status}`);
    }
    return resp.json();
}

async function webLogin() {
    const username = UI.webUsername.value.trim();
    const password = UI.webPassword.value.trim();
    if (!username || !password) {
        showLoginError('Ingrese usuario y contraseña');
        return;
    }
    UI.webLoginBtn.disabled = true;
    UI.webLoginBtn.textContent = 'Iniciando sesión...';
    hideLoginError();
    try {
        const result = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        accessToken = result.access_token;
        localStorage.setItem('access_token', accessToken);
        userProfile = result.user;
        setStatus(`Sesión iniciada: ${userProfile.full_name || userProfile.username}`);
        UI.webLoginForm.classList.add('hidden');
        UI.sipLoginForm.classList.remove('hidden');
        if (userProfile.sip_extension) {
            UI.extension.value = userProfile.sip_extension;
        }
        addLogEntry('incoming', userProfile.username, 'Sesión iniciada');
    } catch (err) {
        showLoginError(err.message);
    } finally {
        UI.webLoginBtn.disabled = false;
        UI.webLoginBtn.textContent = 'Iniciar sesión';
    }
}

function showLoginError(msg) {
    UI.webLoginError.textContent = msg;
    UI.webLoginError.classList.remove('hidden');
}

function hideLoginError() {
    UI.webLoginError.textContent = '';
    UI.webLoginError.classList.add('hidden');
}

async function checkExistingSession() {
    if (!accessToken) return;
    try {
        userProfile = await apiRequest('/auth/profile');
        setStatus(`Sesión activa: ${userProfile.full_name || userProfile.username}`);
        UI.webLoginForm.classList.add('hidden');
        UI.sipLoginForm.classList.remove('hidden');
        if (userProfile.sip_extension) {
            UI.extension.value = userProfile.sip_extension;
        }
    } catch {
        accessToken = null;
        localStorage.removeItem('access_token');
    }
}

async function sipRegister() {
    const extension = UI.extension.value.trim();
    const password = UI.sipPassword.value.trim();
    let server = UI.server.value.trim() || 'localhost:8088/ws';
    if (!extension || !password) {
        alert('Ingrese extensión y contraseña SIP');
        return;
    }
    UI.sipLoginBtn.disabled = true;
    UI.sipLoginBtn.textContent = 'Registrando...';
    setStatus('Conectando SIP...');
    const wsServer = server.includes('://') ? server : `ws://${server}`;
    const host = server.split(':')[0].replace(/^ws:\/\//, '');
    try {
        simpleUser = new SIP.Web.SimpleUser(wsServer, {
            aor: `sip:${extension}@${host}`,
            media: {
                constraints: { audio: true, video: false },
                remote: { audio: UI.remoteAudio },
            },
            userAgentOptions: {
                authorizationUsername: extension,
                authorizationPassword: password,
                sessionDescriptionHandlerFactoryOptions: {
                    constraints: { audio: true, video: false },
                },
            },
            registererOptions: {},
            delegate: {
                onServerConnect: () => {
                    setStatus('Conectado, registrando...');
                    simpleUser.register()
                        .then(() => {
                            isReady = true;
                            setStatus(`Registrado como ${extension}`, 'registered');
                            UI.extensionDisplay.textContent = extension;
                            UI.sipLoginForm.classList.add('hidden');
                            UI.callSection.classList.remove('hidden');
                            addLogEntry('incoming', extension, 'Registrado SIP');
                            loadRecordings();
                        })
                        .catch((e) => {
                            setStatus('Error SIP: ' + (e.message || 'desconocido'));
                            addLogEntry('incoming', extension, 'Falló registro SIP');
                        });
                },
                onServerDisconnect: () => {
                    setStatus('Desconectado');
                    UI.statusDot.className = 'status-dot';
                },
                onRegistered: () => {
                    setStatus(`Registrado como ${extension}`, 'registered');
                },
                onUnregistered: () => {
                    setStatus('Desregistrado');
                },
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
                    UI.incomingCall.classList.add('hidden');
                    setStatus('En llamada...', 'connected');
                    UI.callBtn.classList.add('hidden');
                    UI.hangupBtn.classList.remove('hidden');
                },
                onCallHangup: () => {
                    isInCall = false;
                    UI.incomingCall.classList.add('hidden');
                    currentSession = null;
                    setStatus('Registrado', 'registered');
                    UI.callBtn.classList.remove('hidden');
                    UI.hangupBtn.classList.add('hidden');
                    addLogEntry('incoming', 'Llamada', 'Finalizada');
                    setTimeout(loadRecordings, 2000);
                },
            },
        });
        await simpleUser.connect();
        UI.sipLoginBtn.disabled = false;
        UI.sipLoginBtn.textContent = 'Registrar SIP';
    } catch (err) {
        setStatus('Error: ' + err.message);
        UI.sipLoginBtn.disabled = false;
        UI.sipLoginBtn.textContent = 'Reintentar';
    }
}

function sipSkip() {
    UI.sipLoginForm.classList.add('hidden');
    UI.callSection.classList.remove('hidden');
    setStatus('Conectado (sin SIP)', 'registered');
    UI.extensionDisplay.textContent = userProfile?.sip_extension || 'N/A';
    loadRecordings();
}

function makeCall() {
    const target = UI.targetExtension.value.trim();
    if (!target) { alert('Ingrese extensión destino'); return; }
    if (!simpleUser) { alert('No registrado SIP'); return; }
    setStatus('Llamando a ' + target + '...');
    addLogEntry('outgoing', target, 'Llamando');
    const host = UI.server.value.trim().split(':')[0].replace(/^ws:\/\//, '') || location.hostname;
    const targetUri = `sip:${target}@${host}`;
    simpleUser.call(targetUri)
        .then(() => {
            isInCall = true;
            UI.callBtn.classList.add('hidden');
            UI.hangupBtn.classList.remove('hidden');
            addLogEntry('outgoing', target, 'Conectada');
        })
        .catch((err) => {
            setStatus('Error: ' + err.message);
            UI.callBtn.classList.remove('hidden');
            UI.hangupBtn.classList.add('hidden');
            addLogEntry('outgoing', target, 'Error');
        });
}

function hangup() {
    if (simpleUser) {
        simpleUser.hangup()
            .then(() => {
                isInCall = false;
                currentSession = null;
                setStatus('Registrado', 'registered');
                UI.callBtn.classList.remove('hidden');
                UI.hangupBtn.classList.add('hidden');
                setTimeout(loadRecordings, 2000);
            })
            .catch(() => {});
    }
}

function logout() {
    isInCall = false;
    isReady = false;
    currentSession = null;
    accessToken = null;
    userProfile = null;
    localStorage.removeItem('access_token');
    UI.incomingCall.classList.add('hidden');
    if (simpleUser) {
        simpleUser.disconnect().catch(() => {});
        simpleUser = null;
    }
    setStatus('Desconectado');
    UI.extensionDisplay.textContent = '---';
    UI.webLoginForm.classList.remove('hidden');
    UI.sipLoginForm.classList.add('hidden');
    UI.callSection.classList.add('hidden');
    UI.callBtn.classList.remove('hidden');
    UI.hangupBtn.classList.add('hidden');
    UI.sipLoginBtn.disabled = false;
    UI.sipLoginBtn.textContent = 'Registrar SIP';
    UI.webLoginBtn.disabled = false;
    UI.webLoginBtn.textContent = 'Iniciar sesión';
}

async function loadRecordings() {
    if (!UI.recordingsList) return;
    UI.recordingsList.innerHTML = '<div class="loading">Cargando grabaciones...</div>';
    try {
        const resp = await fetch('/recordings/');
        const text = await resp.text();
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');
        const contents = xml.querySelectorAll('Contents');
        if (!contents || contents.length === 0) {
            UI.recordingsList.innerHTML = '<div class="empty-state">No hay grabaciones <p>Realiza una llamada para generar grabaciones</p></div>';
            return;
        }
        const items = Array.from(contents)
            .map(el => ({
                key: el.querySelector('Key')?.textContent || '',
                size: parseInt(el.querySelector('Size')?.textContent || '0'),
                lastModified: el.querySelector('LastModified')?.textContent || '',
            }))
            .filter(f => f.key.endsWith('.wav'))
            .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
        if (items.length === 0) {
            UI.recordingsList.innerHTML = '<div class="empty-state">No hay grabaciones de audio <p>Las grabaciones aparecen aquí después de cada llamada</p></div>';
            return;
        }
        UI.recordingsList.innerHTML = '';
        items.forEach(item => {
            const parts = item.key.replace('.wav', '').split('-');
            const caller = parts[1] || '';
            const callee = parts[2] || '';
            const url = `/recordings/${item.key}`;
            const sizeStr = item.size > 1024 ? (item.size / 1024).toFixed(1) + ' KB' : item.size + ' B';
            const dateStr = new Date(item.lastModified).toLocaleString();
            const div = document.createElement('div');
            div.className = 'recording-item';
            div.innerHTML = `
                <div class="recording-info">
                    <div class="recording-name">${caller} → ${callee}</div>
                    <div class="recording-meta">${dateStr} · ${sizeStr}</div>
                    <audio controls preload="none">
                        <source src="${url}" type="audio/wav">
                    </audio>
                </div>
            `;
            UI.recordingsList.appendChild(div);
        });
    } catch (err) {
        UI.recordingsList.innerHTML = `<div class="empty-state">Error al cargar: ${err.message}<p>Verifica que MinIO esté corriendo</p></div>`;
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');
    document.getElementById(`${tabId}Tab`)?.classList.add('active');
    if (tabId === 'recordings') loadRecordings();
}

document.querySelectorAll('.dial-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        UI.targetExtension.value += btn.dataset.value;
        UI.targetExtension.focus();
    });
});

UI.targetExtension.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') makeCall();
});

document.querySelectorAll('#webLoginForm input').forEach(inp => {
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') webLogin();
    });
});

document.querySelectorAll('#sipLoginForm input').forEach(inp => {
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sipRegister();
    });
});

UI.webLoginBtn.addEventListener('click', webLogin);
UI.sipLoginBtn.addEventListener('click', sipRegister);
UI.sipSkipBtn.addEventListener('click', sipSkip);
UI.callBtn.addEventListener('click', makeCall);
UI.hangupBtn.addEventListener('click', hangup);
UI.logoutBtn.addEventListener('click', logout);

UI.answerBtn.addEventListener('click', () => {
    UI.incomingCall.classList.add('hidden');
    isInCall = true;
    if (simpleUser) {
        simpleUser.answer()
            .then(() => {
                setStatus('En llamada...', 'connected');
                UI.callBtn.classList.add('hidden');
                UI.hangupBtn.classList.remove('hidden');
            })
            .catch(() => {
                isInCall = false;
                setStatus('Registrado', 'registered');
                UI.callBtn.classList.remove('hidden');
                UI.hangupBtn.classList.add('hidden');
            });
    } else {
        isInCall = false;
    }
});

UI.rejectBtn.addEventListener('click', () => {
    UI.incomingCall.classList.add('hidden');
    if (simpleUser) {
        simpleUser.decline()
            .then(() => {
                isInCall = false;
                currentSession = null;
                setStatus('Registrado', 'registered');
                UI.callBtn.classList.remove('hidden');
                UI.hangupBtn.classList.add('hidden');
            })
            .catch(() => {});
    } else {
        isInCall = false;
        currentSession = null;
    }
});

document.getElementById('tabPhone')?.addEventListener('click', () => switchTab('phone'));
document.getElementById('tabRecordings')?.addEventListener('click', () => switchTab('recordings'));
UI.refreshRecordings?.addEventListener('click', loadRecordings);

document.addEventListener('DOMContentLoaded', () => {
    checkExistingSession();
});
