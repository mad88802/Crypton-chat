# Secure Messenger – Animated UI Demo

![Demo Animation](https://raw.githubusercontent.com/yourusername/secure-messenger/main/assets/demo.gif)

## Overview
A sleek, cyber‑punk themed secure chat application built with **Flask**, **Socket.IO**, and vanilla **HTML/CSS/JS**. The UI features dynamic animated backgrounds, glowing borders, floating crypto‑themed particles, and anime‑style avatars.

## Features
- Real‑time messaging via WebSockets
- Role badges (admin / user) displayed under usernames
- Animated UI elements for a premium experience
- Simple JSON‑file based user database (`db.json`)
- Anime avatars for each user

## Tech Stack
- **Backend**: Python 3, Flask, Flask‑SocketIO
- **Frontend**: HTML5, CSS3 (custom animations), JavaScript ES6

## Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/secure-messenger.git
cd secure-messenger

# (Optional) create a virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Running the App
```bash
# Initialise the default users (admin: arthur, user: lucas)
python -c "import app; app.init_db()"

# Start the development server
python app.py
```
Open `http://127.0.0.1:5000` in your browser and log in with:
- **Admin** – `username: arthur` / `password: 123456`
- **User** – `username: lucas` / `password: 123456`

## Project Structure
```
Mini_Projet_security/
│   app.py
│   db.json
│   index.html
│   script.js
│   style.css
│   README.md   <-- this file
└── avatars/   # anime avatar images
```

## Customisation
- Edit CSS variables in `style.css` to change colours and animation speeds.
- Replace images in the `avatars/` folder with your own PNGs.
- Add more roles by editing the `users` dictionary in `app.py`.


