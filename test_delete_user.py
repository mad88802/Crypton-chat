import socketio
import time
import json

# Create a Socket.IO client
sio = socketio.Client()

responses = {}

@sio.event
def connect():
    print('Connected to server')

@sio.on('login_response')
def on_login(data):
    responses['login'] = data
    print('Login response:', data)

@sio.on('register_response')
def on_register(data):
    responses['register'] = data
    print('Register response:', data)

@sio.on('user_deleted')
def on_user_deleted(data):
    responses['user_deleted'] = data
    print('User deleted event:', data)

def emit_and_wait(event, payload, wait_key, timeout=5):
    responses.pop(wait_key, None)
    sio.emit(event, payload)
    start = time.time()
    while time.time() - start < timeout:
        if wait_key in responses:
            return responses[wait_key]
        time.sleep(0.1)
    return None

def login(username, password):
    return emit_and_wait('login', {'username': username, 'password': password}, 'login')

def delete_user(target):
    return emit_and_wait('delete_user', {'target_username': target}, 'user_deleted')

if __name__ == '__main__':
    sio.connect('http://127.0.0.1:5020')
    # Ensure admin exists (imad) and a test regular user exists
    test_user = 'testuser'
    test_pass = 'testpass'
    # Try to login as test_user; if fails, register.
    login_resp = login(test_user, test_pass)
    if not login_resp or not login_resp.get('success'):
        print('Registering test user')
        sio.emit('register', {'username': test_user, 'password': test_pass, 'role': 'user'})
        time.sleep(1)
    # Login as admin
    admin_resp = login('imad', '123456')
    if not admin_resp or not admin_resp.get('success'):
        print('Admin login failed')
        exit(1)
    # Admin deletes test_user
    del_resp = delete_user(test_user)
    if del_resp:
        print('Admin successfully deleted user')
    else:
        print('Admin failed to delete user')
    # Logout admin (disconnect and reconnect as regular user)
    sio.disconnect()
    sio.connect('http://127.0.0.1:5020')
    # Register another regular user for non-admin delete test
    regular_user = 'regular1'
    regular_pass = 'regularpass'
    login_resp = login(regular_user, regular_pass)
    if not login_resp or not login_resp.get('success'):
        sio.emit('register', {'username': regular_user, 'password': regular_pass, 'role': 'user'})
        time.sleep(1)
        login_resp = login(regular_user, regular_pass)
    # Attempt to delete another user as regular (should not succeed)
    del_resp = delete_user('imad')
    if del_resp:
        print('ERROR: Regular user was able to delete')
    else:
        print('Regular user could not delete (expected)')
    sio.disconnect()
