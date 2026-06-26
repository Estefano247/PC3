const API_BASE = '/api';
let webPasswordMemory = null;
let sipPasswordMemory = null;

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
    callSection: document.getElementById('callSection'),
    callControls: document.getElementById('callControls'),
    callBtn: document.getElementById('callBtn'),
    hangupBtn: document.getElementById('hangupBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    muteBtn: document.getElementById('muteBtn'),
    holdBtn: document.getElementById('holdBtn'),

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
let callStartTime = null;
let callTimerInterval = null;
let isMuted = false;
let isOnHold = false;
let sipDomain = null;

function setStatus(text, type) {
    UI.statusText.textContent = text;
    UI.statusDot.className = 'status-dot';
    if (type) UI.statusDot.classList.add(type);
}

function addLogEntry(direction, target, status) {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = [
        '<span class="direction ', direction, '">',
        direction === 'outgoing' ? '\u2192' : '\u2190', ' ', target, '</span>',
        '<span class="time">', time, '</span>',
        '<span class="status">', status, '</span>',
    ].join('');
    UI.logEntries.prepend(entry);
}

async function apiRequest(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (accessToken) {
        headers['Authorization'] = 'Bearer ' + accessToken;
    }
    const resp = await fetch(API_BASE + endpoint, { ...options, headers });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: resp.statusText }));
        throw new Error(err.message || 'Error ' + resp.status);
    }
    return resp.json();
}

async function autoRegisterSip(extension, password) {
    try {
        const info = await apiRequest('/asterisk/register-sip', {
            method: 'POST',
            body: JSON.stringify({ password }),
        });
        await sipRegisterWithCreds(extension, password, info.server);
    } catch (err) {
        setStatus('Registro SIP automatico fallo: ' + err.message);
    }
}

async function webLogin() {
    const username = UI.webUsername.value.trim();
    const password = UI.webPassword.value.trim();
    if (!username || !password) {
        showLoginError('Ingrese usuario y contrasena');
        return;
    }
    UI.webLoginBtn.disabled = true;
    UI.webLoginBtn.textContent = 'Iniciando sesion...';
    hideLoginError();
    try {
        const result = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        accessToken = result.access_token;
        localStorage.setItem('access_token', accessToken);
        userProfile = result.user;
        webPasswordMemory = password;
        sipPasswordMemory = result.sip_password;
        setStatus('Sesion iniciada: ' + (userProfile.fullName || userProfile.username));
        UI.webLoginForm.classList.add('hidden');
        addLogEntry('incoming', userProfile.username, 'Sesion iniciada');
        if (userProfile.sipExtension) {
            await autoRegisterSip(userProfile.sipExtension, sipPasswordMemory || password);
        } else {
            showLoginError('El usuario no tiene extension SIP asignada');
        }
    } catch (err) {
        showLoginError(err.message);
    } finally {
        UI.webLoginBtn.disabled = false;
        UI.webLoginBtn.textContent = 'Iniciar sesion';
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
        setStatus('Sesion activa: ' + (userProfile.fullName || userProfile.username));
        UI.webLoginForm.classList.add('hidden');
        if (userProfile.sipExtension) {
            UI.sipLoginForm.classList.remove('hidden');
            UI.extension.value = userProfile.sipExtension;
            if (userProfile.sipPassword) {
                UI.sipPassword.value = userProfile.sipPassword;
            }
        }
    } catch (err) {
        if (err.message && err.message.includes('401')) {
            accessToken = null;
            localStorage.removeItem('access_token');
        }
    }
}

async function sipRegisterWithCreds(extension, password, server) {
    if (!extension || !password) return;
    if (simpleUser) {
        try { simpleUser.disconnect(); } catch (e) {}
        simpleUser = null;
    }
    setStatus('Conectando SIP...');
    const wsServer = server.includes('://') ? server : 'ws://' + server;
    sipDomain = server.split(':')[0].replace(/^ws:\/\//, '');
    const host = sipDomain;
    try {
        simpleUser = new SIP.Web.SimpleUser(wsServer, {
            aor: 'sip:' + extension + '@' + host,
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
                            setStatus('Registrado como ' + extension, 'registered');
                            UI.extensionDisplay.textContent = extension;
                            UI.callSection.classList.remove('hidden');
                            addLogEntry('incoming', extension, 'Registrado SIP');
                            loadRecordings();
                        })
                        .catch((e) => {
                            setStatus('Error SIP: ' + (e.message || 'desconocido'));
                            addLogEntry('incoming', extension, 'Fallo registro SIP');
                        });
                },
                onServerDisconnect: () => {
                    setStatus('Desconectado');
                    UI.statusDot.className = 'status-dot';
                },
                onRegistered: () => {
                    setStatus('Registrado como ' + extension, 'registered');
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
                    isMuted = false;
                    isOnHold = false;
                    callStartTime = Date.now();
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
                    isInCall = false;
                    isMuted = false;
                    isOnHold = false;
                    stopCallTimer();
                    UI.incomingCall.classList.add('hidden');
                    UI.callControls.classList.add('hidden');
                    UI.muteBtn.classList.remove('active', 'active-danger');
                    UI.holdBtn.classList.remove('active');
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
    } catch (err) {
        setStatus('Error: ' + err.message);
    }
}

async function sipRegister() {
    const extension = UI.extension.value.trim();
    const password = sipPasswordMemory || webPasswordMemory || UI.sipPassword.value.trim();
    if (!extension || !password) {
        alert('Ingrese extension y contrasena SIP');
        return;
    }
    let server;
    if (!sipPasswordMemory && !webPasswordMemory) {
        try {
            const info = await apiRequest('/asterisk/register-sip', {
                method: 'POST',
                body: JSON.stringify({ password }),
            });
            server = info.server;
        } catch (err) {
            setStatus('Error creando extension: ' + err.message);
        }
    }
    server = server || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    await sipRegisterWithCreds(extension, password, server);
}

function startCallTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
        if (!callStartTime) return;
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        setStatus('En llamada ' + m + ':' + s, 'connected');
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    callStartTime = null;
}

function sipSkip() {
    UI.sipLoginForm.classList.add('hidden');
    UI.callSection.classList.remove('hidden');
    setStatus('Conectado (sin SIP)', 'registered');
    UI.extensionDisplay.textContent = userProfile?.sipExtension || 'N/A';
    loadRecordings();
}

function makeCall() {
    const target = UI.targetExtension.value.trim();
    if (!target) { alert('Ingrese extension destino'); return; }
    if (!simpleUser) { alert('No registrado SIP'); return; }
    setStatus('Llamando a ' + target + '...');
    addLogEntry('outgoing', target, 'Llamando');
    const targetUri = 'sip:' + target + '@' + (sipDomain || location.hostname);
    simpleUser.call(targetUri)
        .then(() => {
            isInCall = true;
            isMuted = false;
            isOnHold = false;
            callStartTime = Date.now();
            startCallTimer();
            UI.callControls.classList.remove('hidden');
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
                isMuted = false;
                isOnHold = false;
                stopCallTimer();
                UI.callControls.classList.add('hidden');
                UI.muteBtn.classList.remove('active', 'active-danger');
                UI.holdBtn.classList.remove('active');
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
    stopCallTimer();
    currentSession = null;
    accessToken = null;
    userProfile = null;
    webPasswordMemory = null;
    sipPasswordMemory = null;
    sipDomain = null;
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
    UI.webLoginBtn.textContent = 'Iniciar sesion';
}

async function loadRecordings() {
    if (!UI.recordingsList) return;
    UI.recordingsList.innerHTML = '<div class="loading">Cargando grabaciones...</div>';
    try {
        const items = await apiRequest('/recordings');
        if (!items || items.length === 0) {
            UI.recordingsList.innerHTML = '<div class="empty-state">No hay grabaciones <p>Realiza una llamada para generar grabaciones</p></div>';
            return;
        }
        UI.recordingsList.innerHTML = '';
        items.forEach(item => {
            const sizeStr = item.size > 1024 ? (item.size / 1024).toFixed(1) + ' KB' : item.size + ' B';
            const dateStr = new Date(item.lastModified).toLocaleString();
            const div = document.createElement('div');
            div.className = 'recording-item';
            div.innerHTML = [
                '<div class="recording-info">',
                '<div class="recording-name">', item.caller, ' -> ', item.callee, '</div>',
                '<div class="recording-meta">', dateStr, ' | ', sizeStr, '</div>',
                '<audio controls preload="none"><source src="', item.url, '" type="audio/wav"></audio>',
                '</div>',
            ].join('');
            UI.recordingsList.appendChild(div);
        });
    } catch (err) {
        UI.recordingsList.innerHTML = '<div class="empty-state">Error al cargar: ' + err.message + '<p>Verifica que MinIO este corriendo</p></div>';
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    var tab = document.querySelector('[data-tab="' + tabId + '"]');
    if (tab) tab.classList.add('active');
    var content = document.getElementById(tabId + 'Tab');
    if (content) content.classList.add('active');
    if (tabId === 'recordings') loadRecordings();
}

document.querySelectorAll('.dial-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
        UI.targetExtension.value += btn.dataset.value;
        UI.targetExtension.focus();
    });
});

UI.targetExtension.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') makeCall();
});

document.querySelectorAll('#webLoginForm input').forEach(function(inp) {
    inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') webLogin();
    });
});

document.querySelectorAll('#sipLoginForm input').forEach(function(inp) {
    inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') sipRegister();
    });
});

UI.webLoginBtn.addEventListener('click', webLogin);
UI.sipLoginBtn.addEventListener('click', sipRegister);
UI.sipSkipBtn.addEventListener('click', sipSkip);
UI.callBtn.addEventListener('click', makeCall);
UI.hangupBtn.addEventListener('click', hangup);
UI.logoutBtn.addEventListener('click', logout);

UI.answerBtn.addEventListener('click', function() {
    UI.incomingCall.classList.add('hidden');
    if (simpleUser) {
        simpleUser.answer()
            .then(function() {
                isInCall = true;
                callStartTime = Date.now();
                startCallTimer();
                setStatus('En llamada...', 'connected');
                UI.callBtn.classList.add('hidden');
                UI.hangupBtn.classList.remove('hidden');
            })
            .catch(function() {
                isInCall = false;
                setStatus('Registrado', 'registered');
                UI.callBtn.classList.remove('hidden');
                UI.hangupBtn.classList.add('hidden');
            });
    }
});

UI.rejectBtn.addEventListener('click', function() {
    UI.incomingCall.classList.add('hidden');
    if (simpleUser) {
        simpleUser.decline()
            .then(function() {
                isInCall = false;
                currentSession = null;
                setStatus('Registrado', 'registered');
                UI.callBtn.classList.remove('hidden');
                UI.hangupBtn.classList.add('hidden');
            })
            .catch(function() {});
    } else {
        isInCall = false;
        currentSession = null;
    }
});

document.getElementById('tabPhone')?.addEventListener('click', function() { switchTab('phone'); });
document.getElementById('tabRecordings')?.addEventListener('click', function() { switchTab('recordings'); });
UI.refreshRecordings?.addEventListener('click', loadRecordings);

function toggleMute() {
    if (!simpleUser || !simpleUser.session) return;
    isMuted = !isMuted;
    if (isMuted) {
        simpleUser.mute();
        UI.muteBtn.classList.add('active-danger');
        UI.muteBtn.querySelector('span').textContent = 'Silenciado';
        addLogEntry('outgoing', '', 'Microfono silenciado');
    } else {
        simpleUser.unmute();
        UI.muteBtn.classList.remove('active-danger');
        UI.muteBtn.querySelector('span').textContent = 'Silenciar';
        addLogEntry('outgoing', '', 'Microfono activado');
    }
}

function toggleHold() {
    if (!simpleUser || !simpleUser.session) return;
    isOnHold = !isOnHold;
    if (isOnHold) {
        simpleUser.hold();
        UI.holdBtn.classList.add('active');
        UI.holdBtn.querySelector('span').textContent = 'Retenida';
        setStatus('Llamada retenida', 'connected');
        addLogEntry('outgoing', '', 'Llamada retenida');
    } else {
        simpleUser.unhold();
        UI.holdBtn.classList.remove('active');
        UI.holdBtn.querySelector('span').textContent = 'Retener';
        setStatus('En llamada...', 'connected');
        addLogEntry('outgoing', '', 'Llamada reanudada');
    }
}

UI.muteBtn?.addEventListener('click', toggleMute);
UI.holdBtn?.addEventListener('click', toggleHold);

document.addEventListener('DOMContentLoaded', function() {
    checkExistingSession();
});
