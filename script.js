/**
 * Secure Messenger - Final Version with IG/Messenger UI
 * Updated: Anime avatars + visible usernames + role badges
 */

let currentUser = null; 
let isAttackActive = false;
let operationCount = 0;
let activeContact = null;
let localHistory = [];
const socket = io();

const authOverlay = document.getElementById('authOverlay');
const appBody = document.getElementById('appBody');
const pubKeyList = document.getElementById('pubKeyList');
const opCountEl = document.getElementById('opCount');
const cryptoLogs = document.getElementById('cryptoLogs');
const cipherTextEl = document.getElementById('cipherText');
const encAesKeyEl = document.getElementById('encAesKey');
const msgHashEl = document.getElementById('msgHash');
const flowDirectionEl = document.getElementById('flowDirection');
const btnAttack = document.getElementById('btnAttack');
const integrityPanel = document.getElementById('integrityResult');

const loginUser = document.getElementById('loginUser');
const loginPass = document.getElementById('loginPass');
const regUser = document.getElementById('regUser');
const regPass = document.getElementById('regPass');
const btnLogin = document.getElementById('btnLogin');
const btnRegister = document.getElementById('btnRegister');
const btnLogout = document.getElementById('btnLogout');
const showRegister = document.getElementById('showRegister');
const showLogin = document.getElementById('showLogin');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const currentUserNameEl = document.getElementById('currentUserName');
const currentUserAvatarEl = document.getElementById('currentUserAvatar');

// ─── Anime Avatar System ───────────────────────────────────────────
// Pool of anime avatars — deterministically assigned by username hash
const ANIME_AVATARS = [
    'avatars/admin.png',
    'avatars/user1.png',
    'avatars/user2.png',
    'avatars/user3.png',
    'avatars/default.png'
];

function getAnimeAvatar(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % ANIME_AVATARS.length;
    return ANIME_AVATARS[idx];
}

function createAvatarImg(name, size) {
    const src = getAnimeAvatar(name);
    const sz = size || 40;
    return `<img src="${src}" alt="${name}" title="${name}" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;border:2px solid var(--border-color);" />`;
}

function getUserColor(name) {
    return 'var(--accent-teal)';
}

function init() {
    setupAuthListeners();
    setupGlobalListeners();
    
    socket.on('login_response', (res) => {
        if (res.success) handleAuthSuccess(res);
        else alert(res.message);
    });

    socket.on('register_response', (res) => {
        if (res.success) {
            alert("Inscription réussie ! Connectez-vous.");
            toggleAuthMode(false);
        } else alert(res.message);
    });

    socket.on('identity_update', (data) => {
        const { username, publicJwk, role } = data;
        if (currentUser && currentUser.directory) {
            currentUser.directory[username] = { publicJwk, role: role || 'user' };
            updatePublicKeyUI();
            if (typeof updateContactsUI === 'function') updateContactsUI();
            addLog(`Annuaire: Clé et rôle reçus`);
        }
    });

    socket.on('user_deleted', (data) => {
        const { username } = data;
        if (currentUser && currentUser.directory) {
            delete currentUser.directory[username];
            updatePublicKeyUI();
            if (typeof updateContactsUI === 'function') updateContactsUI();
            addLog(`Annuaire: Utilisateur supprimé ${username}`);
            
            if (activeContact === username) {
                activeContact = null;
                document.getElementById('activeChatArea').classList.add('hidden');
                document.getElementById('emptyState').classList.remove('hidden');
            }
        }
    });

    socket.on('receive_message', async (data) => {
        if (currentUser) await handleIncomingSocketMessage(data);
    });
}

function setupAuthListeners() {
    btnLogin.onclick = () => socket.emit('login', { username: loginUser.value, password: loginPass.value });
    btnRegister.onclick = () => {
        const role = document.getElementById('regRole').value;
        socket.emit('register', { username: regUser.value, password: regPass.value, role: role });
    };
    showRegister.onclick = (e) => { e.preventDefault(); toggleAuthMode(true); };
    showLogin.onclick = (e) => { e.preventDefault(); toggleAuthMode(false); };
    btnLogout.onclick = () => window.location.reload();
}

function toggleAuthMode(isRegister) {
    loginForm.classList.toggle('hidden', isRegister);
    registerForm.classList.toggle('hidden', !isRegister);
}

async function handleAuthSuccess(res) {
    const { username, role, keys: savedKeys, history, directory } = res;
    addLog(`Accès accordé : ${username} (${role || 'user'})`);
    
    let keys;
    if (savedKeys) {
        addLog("Identité RSA récupérée depuis la base.");
        keys = await importRSAKeys(savedKeys);
    } else {
        addLog("Génération identité RSA-2048...");
        keys = await generateRSAKeyPair();
        const exported = await exportRSAKeys(keys);
        socket.emit('save_keys', { username, keys: exported });
    }
    
    currentUser = { name: username, role: role || 'user', keys: keys, directory: directory || {} };

    authOverlay.classList.add('hidden');
    appBody.classList.remove('hidden');
    
    // Show username in header
    currentUserNameEl.textContent = username;
    
    const roleBadge = document.getElementById('currentUserRole');
    roleBadge.textContent = role || 'user';
    roleBadge.className = `role-badge ${role || 'user'}`;
    
    // Set anime avatar in header
    currentUserAvatarEl.innerHTML = createAvatarImg(username, 32);

    setupUserDashboard();
    updatePublicKeyUI();
    
    if (history && history.length > 0) {
        addLog(`Synchronisation : ${history.length} messages.`);
        for (const msg of history) await handleIncomingSocketMessage(msg, true);
    }
}

async function exportRSAKeys(keyPair) {
    const publicJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
    const privateJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
    return { publicJwk, privateJwk };
}

async function importRSAKeys(keys) {
    const pub = await window.crypto.subtle.importKey("jwk", keys.publicJwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]);
    const priv = await window.crypto.subtle.importKey("jwk", keys.privateJwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);
    return { publicKey: pub, privateKey: priv };
}

function setupGlobalListeners() {
    btnAttack.onclick = () => {
        isAttackActive = !isAttackActive;
        btnAttack.classList.toggle('active', isAttackActive);
        addLog(isAttackActive ? "!!! INTERCEPTION ACTIVÉE !!!" : "Canal sécurisé rétabli.", isAttackActive ? "warning" : "");
    };
}

function deleteUser(event, name) {
    event.stopPropagation();
    if (confirm(`Voulez-vous vraiment supprimer l'utilisateur ${name} ? Cette action est irréversible.`)) {
        socket.emit('delete_user', { target_username: name });
    }
}

function updateContactsUI() {
    const contactsList = document.getElementById('contactsList');
    contactsList.innerHTML = '';
    
    const RECIPIENTS = Object.keys(currentUser.directory);
    
    RECIPIENTS.forEach(name => {
        if (name !== currentUser.name) {
            const item = document.createElement('div');
            item.className = 'contact-item';
            if (activeContact === name) item.classList.add('active');
            item.dataset.name = name;
            
            const role = currentUser.directory[name].role || 'user';
            const avatarHtml = createAvatarImg(name, 40);
            const showDelete = (currentUser.role === 'admin') ? '' : 'style="display:none;"';
            
            item.innerHTML = `
                <div class="avatar">${avatarHtml}</div>
                <div class="contact-info">
                    <span class="contact-name">${name}</span>
                    <span class="role-badge ${role}">${role}</span>
                </div>
                <button class="btn-delete-user" ${showDelete} onclick="deleteUser(event, '${name}')" title="Supprimer l'utilisateur">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6V20a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            `;
            item.onclick = () => loadChat(name, item);
            contactsList.appendChild(item);
        }
    });
}

function setupUserDashboard() {
    updateContactsUI();
    document.getElementById('btnSend').onclick = () => sendMessage();
    document.getElementById('chatInput').onkeypress = (e) => { if(e.key === 'Enter') sendMessage(); };
}

function loadChat(name, itemElement) {
    activeContact = name;
    
    // Highlight sidebar
    document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
    if (itemElement) itemElement.classList.add('active');

    // Show Chat Area
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('activeChatArea').classList.remove('hidden');
    
    // Update Header with anime avatar + name + role
    const avatar = document.getElementById('activeChatAvatar');
    avatar.innerHTML = createAvatarImg(name, 40);
    
    const role = (currentUser.directory[name] && currentUser.directory[name].role) || 'user';
    const activeChatRoleEl = document.getElementById('activeChatRole');
    activeChatRoleEl.textContent = role;
    activeChatRoleEl.className = `role-badge ${role}`;
    
    document.getElementById('activeChatName').textContent = name;

    renderHistory();
}

function renderHistory() {
    const chatHistory = document.getElementById('chatHistory');
    chatHistory.innerHTML = '';
    
    localHistory.forEach(msg => {
        if ((msg.sender === currentUser.name && msg.recipient === activeContact) ||
            (msg.sender === activeContact && msg.recipient === currentUser.name)) {
            appendMessageToUI(msg.text, msg.dir);
        }
    });
}

function appendMessageToUI(text, dir) {
    const chatHistory = document.getElementById('chatHistory');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${dir === 'out' ? 'msg-out' : 'msg-in'}`;
    msgDiv.textContent = text;
    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function updatePublicKeyUI() {
    pubKeyList.innerHTML = '';
    Object.keys(currentUser.directory).forEach(name => {
        const item = document.createElement('div');
        item.className = 'user-key-item';
        
        const directoryEntry = currentUser.directory[name];
        let publicJwk = null;
        let role = 'user';
        if (directoryEntry) {
            if (directoryEntry.publicJwk) {
                publicJwk = directoryEntry.publicJwk;
                role = directoryEntry.role || 'user';
            } else {
                publicJwk = directoryEntry;
            }
        }
        
        const avatarHtml = createAvatarImg(name, 24);
        const fingerprint = (publicJwk && publicJwk.n) ? (publicJwk.n.substring(0, 15) + "...") : "Clé inconnue";
        item.innerHTML = `
            <div class="avatar-small">${avatarHtml}</div>
            <div class="key-user-info">
                <span class="key-username">${name}</span>
                <span class="role-badge ${role}">${role}</span>
            </div>
            <span class="key-thumb">${fingerprint}</span>`;
        pubKeyList.appendChild(item);
    });
}

// --- Cryptography Engine ---

async function generateRSAKeyPair() {
    return await window.crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
        true, ["encrypt", "decrypt"]
    );
}

async function sendMessage() {
    if (!activeContact) return;
    const inputEl = document.getElementById('chatInput');
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';

    addLog(`Envoi à ${activeContact}...`);
    
    let recipientEntry = currentUser.directory[activeContact];
    if (!recipientEntry) {
        addLog(`Erreur: clé de ${activeContact} introuvable.`, "error");
        return;
    }
    
    let recipientPubJwk = recipientEntry.publicJwk || recipientEntry;

    const aesKey = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const rawAes = await window.crypto.subtle.exportKey("raw", aesKey);

    const recipientPubKey = await window.crypto.subtle.importKey("jwk", recipientPubJwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]);
    const wrapRecipient = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientPubKey, rawAes);
    const wrapSender = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, currentUser.keys.publicKey, rawAes);

    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hash = await window.crypto.subtle.digest("SHA-256", data);
    let ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, aesKey, data);

    if (isAttackActive) {
        addLog("!! ALERTE MITM: ALTÉRATION EN COURS !!", "warning");
        const tmp = new Uint8Array(ciphertext); 
        tmp[0] ^= 0x42; // Corrupt ciphertext
        ciphertext = tmp.buffer;
    }

    const packet = {
        sender: currentUser.name, 
        recipient: activeContact,
        ciphertext: b64encode(ciphertext),
        keyRecipient: b64encode(wrapRecipient),
        keySender: b64encode(wrapSender),
        hash: b64encode(hash),
        iv: Array.from(iv)
    };

    updateNetworkUI(currentUser.name, activeContact, ciphertext, packet.keyRecipient, packet.hash);
    socket.emit('send_message', packet);
}

async function handleIncomingSocketMessage(packet, isSilent = false) {
    const { sender, recipient, ciphertext, keyRecipient, keySender, hash, iv } = packet;
    let relevantKey = null;

    if (recipient === currentUser.name) relevantKey = keyRecipient;
    else if (sender === currentUser.name) relevantKey = keySender;

    if (relevantKey) {
        if (!isSilent) addLog(`Déchiffrement RSA-AES...`);
        try {
            const rawAes = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, currentUser.keys.privateKey, b64decode(relevantKey));
            const aesKey = await window.crypto.subtle.importKey("raw", rawAes, "AES-GCM", false, ["decrypt"]);
            
            const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, aesKey, b64decode(ciphertext));
            const text = new TextDecoder().decode(decrypted);

            const checkHash = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
            const integrity = (b64encode(checkHash) === hash);
            
            if (!isSilent) updateIntegrityUI(integrity, hash, b64encode(checkHash));
            
            const finalTxt = integrity ? text : "[MODIFIÉ EN TRANSIT]";
            const dir = sender === currentUser.name ? "out" : "in";
            
            // Store in local history
            localHistory.push({ sender, recipient, text: finalTxt, dir });
            
            // If the message belongs to the active conversation, append it immediately
            if (!isSilent && activeContact && (
                (sender === currentUser.name && recipient === activeContact) || 
                (sender === activeContact && recipient === currentUser.name)
            )) {
                appendMessageToUI(finalTxt, dir);
            }
           
        } catch (e) {
            if (!isSilent) {
                addLog("Critique : Échec du déchiffrement GCM (Tag Invalide).", "error");
                updateIntegrityUI(false, hash, "Échec GCM");
            }
            const dir = sender === currentUser.name ? "out" : "in";
            localHistory.push({ sender, recipient, text: "[DONNÉES CORROMPUES]", dir });
            
            if (!isSilent && activeContact && (
                (sender === currentUser.name && recipient === activeContact) || 
                (sender === activeContact && recipient === currentUser.name)
            )) {
                appendMessageToUI("[DONNÉES CORROMPUES]", dir);
            }
        }
    }
}

// --- Helpers ---
function addLog(msg, type = "") {
    operationCount++; opCountEl.textContent = `${operationCount} ops`;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    cryptoLogs.appendChild(entry); cryptoLogs.scrollTop = cryptoLogs.scrollHeight;
}

function updateNetworkUI(s, r, c, k, h) {
    flowDirectionEl.textContent = `${s} ➔ ${r}`;
    cipherTextEl.textContent = b64encode(c);
    encAesKeyEl.textContent = k; msgHashEl.textContent = h;
}

function updateIntegrityUI(ok, h1, h2) {
    integrityPanel.classList.remove('hidden');
    integrityPanel.className = `integrity-panel ${ok ? '' : 'attacked'}`;
    document.getElementById('integrityStatus').innerHTML = ok ? "✓ INTÉGRITÉ OK" : "⚠ CORRUPTION DÉTECTÉE";
    document.getElementById('hashOrig').textContent = h1.substring(0, 20) + "...";
    document.getElementById('hashCalc').textContent = h2.substring(0, 20) + "...";
}

function b64encode(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function b64decode(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)).buffer; }

init();
