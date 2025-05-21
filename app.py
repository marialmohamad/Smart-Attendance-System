from flask import Flask, render_template, request, redirect, url_for, flash, session, jsonify
import sqlite3
from datetime import datetime
import bcrypt
import random
import secrets
import qrcode
from io import BytesIO
import base64
import time
import json

app = Flask(__name__)
app.secret_key = "your_secret_key_here"  # Change this to a strong secret key

# Configuration
QR_CODE_VALID_SECONDS = 30  # QR code expires after 30 seconds


# Function to generate a unique user ID
def generate_user_id(role):
    if role == "student":
        unique_number = random.randint(1000, 9999)
        return f"2204{unique_number}"
    elif role == "employee":
        unique_number = random.randint(10000, 99999)
        return f"2004{unique_number}"
    else:
        raise ValueError("Invalid role")


# Function to generate a secure token for password reset
def generate_reset_token():
    return secrets.token_urlsafe(32)


# Function to hash passwords
def hash_password(password):
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())


# Function to verify passwords
def verify_password(password, hashed_password):
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password)


# Initialize the database
def initialize_database():
    conn = sqlite3.connect("attendance_system.db")
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS users")
    cursor.execute("DROP TABLE IF EXISTS attendance")
    cursor.execute('''CREATE TABLE IF NOT EXISTS users
                      (
                          id
                          TEXT
                          PRIMARY
                          KEY,
                          username
                          TEXT
                          UNIQUE
                          NOT
                          NULL,
                          email
                          TEXT
                          UNIQUE
                          NOT
                          NULL,
                          password
                          TEXT
                          NOT
                          NULL,
                          role
                          TEXT
                          NOT
                          NULL
                      )
                   ''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS attendance
    (
        id
        INTEGER
        PRIMARY
        KEY
        AUTOINCREMENT,
        user_id
        TEXT
        NOT
        NULL,
        timestamp
        TEXT
        NOT
        NULL,
        FOREIGN
        KEY
                      (
        user_id
                      ) REFERENCES users
                      (
                          id
                      )
        )
                   ''')
    conn.commit()
    conn.close()
    print("Database initialized successfully.")


# Database connection
def get_db_connection():
    conn = sqlite3.connect("attendance_system.db")
    conn.row_factory = sqlite3.Row
    return conn


# Home page
@app.route("/")
def home():
    return render_template("base.html")


# User registration
@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"]
        email = request.form["email"]
        password = request.form["password"]
        role = request.form["role"]

        user_id = generate_user_id(role)

        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            hashed_password = hash_password(password)
            cursor.execute("INSERT INTO users (id, username, email, password, role) VALUES (?, ?, ?, ?, ?)",
                           (user_id, username, email, hashed_password, role))
            conn.commit()
            flash(f"User registered successfully! Your ID is: {user_id}", "success")
            # Redirect to login page after successful registration
            return redirect(url_for("login"))  # Changed from redirect(url_for("register"))
        except sqlite3.IntegrityError:
            flash("Username or email already exists!", "error")
            return redirect(url_for("register"))  # Stay on register page if there's an error
        finally:
            conn.close()
    return render_template("register.html")

# User login
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        user_id = request.form["user_id"]
        username = request.form["username"]
        password = request.form["password"]

        conn = get_db_connection()
        cursor = conn.cursor()
        user = cursor.execute("SELECT * FROM users WHERE id = ? AND username = ?", (user_id, username)).fetchone()
        conn.close()

        if user and verify_password(password, user["password"]):
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            session["role"] = user["role"]
            flash("Login successful!", "success")
            return redirect(url_for("dashboard"))
        else:
            flash("Invalid user ID, username, or password!", "error")
    return render_template("login.html")


# Dashboard after login
@app.route("/dashboard")
def dashboard():
    if "user_id" not in session:
        return redirect(url_for("login"))

    return render_template("dashboard.html",
                           user_id=session["user_id"],
                           username=session["username"],
                           role=session["role"])


# Forgot password
@app.route("/forgot_password", methods=["GET", "POST"])
def forgot_password():
    if request.method == "POST":
        email = request.form["email"]

        conn = get_db_connection()
        cursor = conn.cursor()
        user = cursor.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        conn.close()

        if user:
            reset_token = generate_reset_token()
            print(f"Password reset token for {email}: {reset_token}")
            flash("A password reset link has been sent to your email.", "success")
        else:
            flash("Email not found!", "error")
        return redirect(url_for("forgot_password"))
    return render_template("forgot_password.html")


# Password reset
@app.route("/reset_password/<token>", methods=["GET", "POST"])
def reset_password(token):
    if request.method == "POST":
        new_password = request.form["new_password"]
        confirm_password = request.form["confirm_password"]

        if new_password != confirm_password:
            flash("Passwords do not match!", "error")
            return redirect(url_for("reset_password", token=token))

        conn = get_db_connection()
        cursor = conn.cursor()
        hashed_password = hash_password(new_password)
        cursor.execute("UPDATE users SET password = ? WHERE email = ?", (hashed_password, "user@example.com"))
        conn.commit()
        conn.close()

        flash("Password reset successfully!", "success")
        return redirect(url_for("login"))
    return render_template("reset_password.html", token=token)


# Generate QR Code
@app.route("/generate_qr", methods=["GET"])
def generate_qr():
    if "user_id" not in session:
        return redirect(url_for("login"))

    payload = {
        "user_id": session["user_id"],
        "timestamp": int(time.time()),
        "expires": int(time.time()) + QR_CODE_VALID_SECONDS
    }

    payload_str = json.dumps(payload)
    encoded_payload = base64.b64encode(payload_str.encode()).decode()

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=4,
    )
    qr.add_data(encoded_payload)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()

    return render_template("qr_generator.html",
                           qr_code=img_str,
                           valid_seconds=QR_CODE_VALID_SECONDS)


@app.route('/generate_test_qr')
def generate_test_qr():
    if 'user_id' not in session:
        return redirect(url_for('login'))

    payload = {
        'user_id': session['user_id'],
        'timestamp': int(time.time()),
        'expires': int(time.time()) + 300  # 5 minutes validity
    }

    # Create QR code image
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(base64.b64encode(json.dumps(payload).encode()).decode())
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    # Save to bytes
    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()

    return render_template('test_qr.html', qr_image=img_str)

# Handle QR Code Scans
@app.route('/scan_qr', methods=['POST'])
def scan_qr():
    try:
        # Get and decode QR data
        data = request.get_json()
        qr_data = data.get('qr_data')
        decoded = json.loads(base64.b64decode(qr_data).decode())

        # Validate payload
        if 'user_id' not in decoded:
            return jsonify({'success': False, 'message': 'Invalid QR format'}), 400

        if time.time() > decoded.get('expires', 0):
            return jsonify({'success': False, 'message': 'QR code expired'}), 400

        # Check user exists
        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE id = ?', (decoded['user_id'],)).fetchone()
        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404

        # Check duplicate attendance
        today = datetime.now().strftime('%Y-%m-%d')
        existing = conn.execute(
            'SELECT * FROM attendance WHERE user_id = ? AND date(timestamp) = ?',
            (decoded['user_id'], today)
        ).fetchone()

        if existing:
            return jsonify({'success': False, 'message': 'Attendance already marked today'}), 400

        # Record attendance
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        conn.execute(
            'INSERT INTO attendance (user_id, timestamp) VALUES (?, ?)',
            (decoded['user_id'], timestamp)
        )
        conn.commit()

        return jsonify({
            'success': True,
            'message': 'Attendance recorded',
            'user': {
                'id': user['id'],
                'username': user['username']
            }
        })

    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# QR Scanner Page
@app.route("/qr_scanner")
def qr_scanner():
    if "user_id" not in session:
        return redirect(url_for("login"))
    return render_template("qr_scanner.html",
                         user_id=session["user_id"],
                         username=session["username"])

# Manual Attendance
@app.route("/attendance", methods=["GET", "POST"])
def attendance():
    if "user_id" not in session:
        return redirect(url_for("login"))

    if request.method == "POST":
        user_id = request.form["user_id"]

        conn = get_db_connection()
        cursor = conn.cursor()
        user = cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if user:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("INSERT INTO attendance (user_id, timestamp) VALUES (?, ?)", (user_id, timestamp))
            conn.commit()
            flash("Attendance marked successfully!", "success")
        else:
            flash("User not found!", "error")
        conn.close()
        return redirect(url_for("attendance"))
    return render_template("attendance.html")


# Admin panel
@app.route("/admin")
def admin():
    if "user_id" not in session or session.get("role") != "admin":
        return redirect(url_for("login"))

    conn = get_db_connection()
    attendance_logs = conn.execute("""SELECT users.id AS user_id, users.username, users.role, attendance.timestamp
                                      FROM attendance
                                               JOIN users ON attendance.user_id = users.id""").fetchall()
    conn.close()
    return render_template("admin.html", attendance_logs=attendance_logs)


# Logout
@app.route("/logout")
def logout():
    session.clear()
    flash("You have been logged out.", "info")
    return redirect(url_for("home"))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)