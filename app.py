import json
import os
from flask import Flask, send_from_directory, request, session
from flask_socketio import SocketIO, emit
from werkzeug.security import generate_password_hash, check_password_hash

connected_users = {}

app = Flask(__name__, static_folder='.', template_folder='.')
app.config['SECRET_KEY'] = 'secure-messenger-123!'
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

DB_FILE = "db.json"

def init_db():
    return {
        "users": {
            "arthur": {"hash": generate_password_hash("123456"), "keys": None, "role": "admin"},
            "lucas": {"hash": generate_password_hash("123456"), "keys": None, "role": "user"},
            "mohamed": {"hash": generate_password_hash("123456"), "keys": None, "role": "user"}
        },
        "history": []
    }

def load_db():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, 'r') as f:
                data = json.load(f)
                if "users" in data:
                    for name, user_data in data["users"].items():
                        if "role" not in user_data:
                            user_data["role"] = "admin" if name == "arthur" else "user"
                return data
        except Exception as e:
            print(f"[ERREUR DB] Impossible de lire db.json: {e}")
    return init_db()

# Charger base de données persistante
DB_STATE = load_db()

def save_db():
    with open(DB_FILE, 'w') as f:
        json.dump(DB_STATE, f, indent=2)

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

@socketio.on('login')
def handle_login(data):
    username = data.get('username')
    password = data.get('password')
    
    users = DB_STATE["users"]
    history = DB_STATE["history"]
    
    if username in users and check_password_hash(users[username]['hash'], password):
        connected_users[request.sid] = username
        session['username'] = username

        user_history = [m for m in history if m['sender'] == username or m['recipient'] == username]
        
        # Annuaire public
        public_directory = {
            name: {
                'publicJwk': user_data['keys']['publicJwk'],
                'role': user_data.get('role', 'user')
            }
            for name, user_data in users.items() 
            if user_data['keys'] is not None
        }
        
        emit('login_response', {
            'success': True, 
            'username': username,
            'role': users[username].get('role', 'user'),
            'keys': users[username]['keys'],
            'history': user_history,
            'directory': public_directory
        })
        print(f"[AUTH] {username} s'est connecté. Rôle: {users[username].get('role')}. Messages: {len(user_history)}")
    else:
        emit('login_response', {'success': False, 'message': 'Identifiants invalides.'})

@socketio.on('register')
def handle_register(data):
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'user')
    if role not in ['admin', 'user']:
        role = 'user'
    
    users = DB_STATE["users"]
    if username in users:
        emit('register_response', {'success': False, 'message': 'Utilisateur existe déjà.'})
    else:
        users[username] = {"hash": generate_password_hash(password), "keys": None, "role": role}
        save_db()  # Persistance
        emit('register_response', {'success': True, 'username': username})
        print(f"[AUTH] Nouvelle inscription: {username} ({role})")

@socketio.on('save_keys')
def handle_save_keys(data):
    username = data.get('username')
    keys = data.get('keys')
    users = DB_STATE["users"]
    
    if username in users:
        users[username]['keys'] = keys
        save_db()  # Persistance
        # Diffuser pubkey
        emit('identity_update', {
            'username': username, 
            'publicJwk': keys['publicJwk'],
            'role': users[username].get('role', 'user')
        }, broadcast=True)
        print(f"[RESEAU] Identité RSA publiée pour {username}")

@socketio.on('delete_user')
def handle_delete_user(data):
    requestor = connected_users.get(request.sid)
    target_username = data.get('target_username')
    users = DB_STATE["users"]
    
    if not requestor:
        print("[AUTH] Tentative de suppression sans session.")
        return
        
    requestor_role = users.get(requestor, {}).get('role')
    if requestor_role != 'admin':
        print(f"[AUTH] Non autorisé : {requestor} tente de supprimer {target_username}")
        return
        
    if target_username in users:
        print(f"[AUTH] Suppression de l'utilisateur: {target_username} par l'admin {requestor}")
        del users[target_username]
        save_db()
        emit('user_deleted', {'username': target_username}, broadcast=True)

@socketio.on('send_message')
def handle_send_message(data):
    sender = data.get('sender')
    recipient = data.get('recipient')
    
    history_entry = data.copy()
    if 'originalText' in history_entry: 
        del history_entry['originalText']
        
    DB_STATE["history"].append(history_entry)
    save_db()  # Persistance
    
    print(f"[RESEAU] Transit & Archivé: {sender} -> {recipient}")
    emit('receive_message', data, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    disconnected_user = connected_users.pop(sid, None)
    if disconnected_user:
        print(f"[AUTH] Déconnexion: {disconnected_user}")

if __name__ == '__main__':
    socketio.run(app, debug=True, use_reloader=False, port=5020, allow_unsafe_werkzeug=True)
