const UI = {
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    extensionDisplay: document.getElementById('extension-display'),
    loginForm: document.getElementById('loginForm'),
    callSection: document.getElementById('callSection'),
    loginBtn: document.getElementById('loginBtn'),
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

let simpleUser = null;
let currentSession = null;

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

function register() {
    const extension = document.getElementById('extension').value.trim();
    const password = document.getElementById('password').value.trim();
    let server = document.getElementById('server').value.trim() || 'localhost:8088/ws';

    if (!extension || !password) {
        alert('Ingrese extensi\u00f3n y contrase\u00f1a');
        return;
    }

    UI.loginBtn.disabled = true;
    UI.loginBtn.textContent = 'Registrando...';
    setStatus('Conectando...');

    const wsServer = server.includes('://') ? server : `ws://${server}`;
    const host = server.split(':')[0].replace(/^ws:\/\//, '');

    try {
        simpleUser = new SIP.Web.SimpleUser(wsServer, {
            aor: `sip:${extension}@${host}`,
            media: {
                constraints: { audio: true, video: false },
                remote: {
                    audio: UI.remoteAudio,
                },
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
                            setStatus(`Registrado como ${extension}`, 'registered');
                            UI.extensionDisplay.textContent = extension;
                            UI.loginForm.classList.add('hidden');
                            UI.callSection.classList.remove('hidden');
                            UI.loginBtn.disabled = false;
                            addLogEntry('incoming', extension, 'Registrado');
                            loadRecordings();
                        })
                        .catch((e) => {
                            setStatus('Error de registro: ' + (e.message || 'desconocido'));
                            UI.loginBtn.disabled = false;
                            UI.loginBtn.textContent = 'Reintentar';
                            addLogEntry('incoming', extension, 'Fall\u00f3 registro');
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
                    UI.incomingCall.classList.add('hidden');
                    setStatus('En llamada...', 'connected');
                    UI.callBtn.classList.add('hidden');
                    UI.hangupBtn.classList.remove('hidden');
                },
                onCallHangup: () => {
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

        simpleUser.connect()
            .catch((err) => {
                setStatus('Error: ' + err.message);
                UI.loginBtn.disabled = false;
                UI.loginBtn.textContent = 'Registrar';
            });

    } catch (err) {
        setStatus('Error: ' + err.message);
        UI.loginBtn.disabled = false;
        UI.loginBtn.textContent = 'Registrar';
    }
}

function makeCall() {
    const target = UI.targetExtension.value.trim();
    if (!target) { alert('Ingrese extensi\u00f3n destino'); return; }
    if (!simpleUser) { alert('No registrado'); return; }

    setStatus('Llamando a ' + target + '...');
    addLogEntry('outgoing', target, 'Llamando');

    const targetUri = `sip:${target}@${location.hostname}`;

    simpleUser.call(targetUri)
        .then(() => {
            addLogEntry('outgoing', target, 'Conectada');
        })
        .catch((err) => {
            setStatus('Error: ' + err.message);
            addLogEntry('outgoing', target, 'Error');
        });
}

function hangup() {
    if (simpleUser) {
        simpleUser.hangup()
            .then(() => {
                setStatus('Registrado', 'registered');
                UI.callBtn.classList.remove('hidden');
                UI.hangupBtn.classList.add('hidden');
                setTimeout(loadRecordings, 2000);
            })
            .catch(() => {});
    }
}

function logout() {
    if (simpleUser) {
        simpleUser.disconnect()
            .catch(() => {});
        simpleUser = null;
    }
    setStatus('Desconectado');
    UI.extensionDisplay.textContent = '---';
    UI.loginForm.classList.remove('hidden');
    UI.callSection.classList.add('hidden');
    UI.callBtn.classList.remove('hidden');
    UI.hangupBtn.classList.add('hidden');
    UI.loginBtn.disabled = false;
    UI.loginBtn.textContent = 'Registrar';
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
            UI.recordingsList.innerHTML = '<div class="empty-state">No hay grabaciones de audio <p>Las grabaciones aparecen aqu\u00ed despu\u00e9s de cada llamada</p></div>';
            return;
        }

        UI.recordingsList.innerHTML = '';
        items.forEach(item => {
            const parts = item.key.replace('.wav', '').split('-');
            const caller = parts[1] || '';
            const callee = parts[2] || '';

            const url = `/recordings/${item.key}`;
            const sizeStr = item.size > 1024
                ? (item.size / 1024).toFixed(1) + ' KB'
                : item.size + ' B';
            const dateStr = new Date(item.lastModified).toLocaleString();

            const div = document.createElement('div');
            div.className = 'recording-item';
            div.innerHTML = `
                <div class="recording-info">
                    <div class="recording-name">${caller} \u2192 ${callee}</div>
                    <div class="recording-meta">${dateStr} \u00b7 ${sizeStr}</div>
                    <audio controls preload="none">
                        <source src="${url}" type="audio/wav">
                    </audio>
                </div>
            `;
            UI.recordingsList.appendChild(div);
        });

    } catch (err) {
        UI.recordingsList.innerHTML = `<div class="empty-state">Error al cargar: ${err.message}<p>Verifica que MinIO est\u00e9 corriendo</p></div>`;
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

document.querySelectorAll('#loginForm input').forEach(inp => {
    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') register();
    });
});

UI.loginBtn.addEventListener('click', register);
UI.callBtn.addEventListener('click', makeCall);
UI.hangupBtn.addEventListener('click', hangup);
UI.logoutBtn.addEventListener('click', logout);

UI.answerBtn.addEventListener('click', () => {
    UI.incomingCall.classList.add('hidden');
    if (simpleUser) {
        simpleUser.answer()
            .then(() => {
                setStatus('En llamada...', 'connected');
                UI.callBtn.classList.add('hidden');
                UI.hangupBtn.classList.remove('hidden');
            })
            .catch(() => {
                setStatus('Registrado', 'registered');
            });
    }
});

UI.rejectBtn.addEventListener('click', () => {
    UI.incomingCall.classList.add('hidden');
    if (simpleUser) {
        simpleUser.decline()
            .then(() => {
                setStatus('Registrado', 'registered');
            })
            .catch(() => {});
    }
});

document.getElementById('tabPhone')?.addEventListener('click', () => switchTab('phone'));
document.getElementById('tabRecordings')?.addEventListener('click', () => switchTab('recordings'));
UI.refreshRecordings?.addEventListener('click', loadRecordings);

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(register, 500);
});
