import http.server
import socketserver
import os
import sys
import json
import sqlite3
import hashlib
import secrets
import urllib.parse
from datetime import datetime

PORT = int(os.environ.get("PORT", 8000))
DB_FILE = "learning.db"
UPLOAD_DIR = "uploads"

# --- DATABASE SETUP ---
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # Users table
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT NOT NULL, /* 'teacher' or 'student' */
        username TEXT UNIQUE,
        password_hash TEXT,
        full_name TEXT NOT NULL,
        telegram_id TEXT,
        created_at TEXT NOT NULL
    )
    """)
    
    # Sessions table
    c.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)
    
    # Invites table (exclusive offers for students)
    c.execute("""
    CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY,
        student_name TEXT,
        max_uses INTEGER DEFAULT 1,
        used_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    )
    """)
    
    # Lessons table
    c.execute("""
    CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        level TEXT DEFAULT 'All Levels',
        description TEXT,
        blocks_json TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    )
    """)
    
    # Homeworks table
    c.execute("""
    CREATE TABLE IF NOT EXISTS homeworks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lesson_id INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        deadline TEXT,
        questions_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
    )
    """)
    
    # Submissions table
    c.execute("""
    CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        homework_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        answers_json TEXT NOT NULL,
        status TEXT DEFAULT 'submitted', /* 'submitted' or 'reviewed' */
        score TEXT,
        feedback TEXT,
        submitted_at TEXT NOT NULL,
        reviewed_at TEXT,
        FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)
    
    # Ensure default teacher exists
    c.execute("SELECT id FROM users WHERE role = 'teacher' LIMIT 1")
    teacher = c.fetchone()
    if not teacher:
        c.execute("""
        INSERT INTO users (role, username, password_hash, full_name, created_at)
        VALUES ('teacher', 'teacher', ?, 'Преподаватель English', ?)
        """, (hash_password("teacher123"), datetime.now().isoformat()))
        print("Default teacher created: login='teacher', password='teacher123'")
    
    # Ensure default starter invite exists for easy onboarding/testing
    c.execute("SELECT code FROM invites WHERE code = 'WELCOME2026' LIMIT 1")
    invite = c.fetchone()
    if not invite:
        c.execute("""
        INSERT INTO invites (code, student_name, max_uses, used_count, created_at)
        VALUES ('WELCOME2026', 'Новый Ученик', 100, 0, ?)
        """, (datetime.now().isoformat(),))
        print("Default invite code created: WELCOME2026")
        
    # Populate initial sample lessons if empty
    c.execute("SELECT COUNT(*) as count FROM lessons")
    if c.fetchone()['count'] == 0:
        sample_blocks_1 = [
            {
                "type": "text",
                "content": "Времена **Present Simple** и **Present Continuous** — это фундамент английской грамматики. Главное отличие заключается в характере действия: регулярность против момента речи."
            },
            {
                "type": "vocab",
                "title": "Ключевые маркеры времени",
                "items": [
                    "Present Simple: always, usually, often, every day, on Mondays",
                    "Present Continuous: right now, at the moment, currently, look!, listen!"
                ]
            },
            {
                "type": "video",
                "url": "https://www.youtube.com/embed/1vRzTzLdGf4",
                "caption": "Интерактивный видео-разбор разницы времен от носителя языка"
            },
            {
                "type": "note",
                "content": "Обратите внимание на глаголы состояния (State Verbs: like, love, know, understand, believe) — они почти никогда не используются в Continuous!"
            }
        ]
        
        c.execute("""
        INSERT INTO lessons (title, level, description, blocks_json, order_index, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            "Present Simple vs Present Continuous: Разница раз и навсегда",
            "A1-A2 (Elementary)",
            "Полный разбор двух главных времен настоящего времени с правилами, примерами и видеоуроком.",
            json.dumps(sample_blocks_1, ensure_ascii=False),
            1,
            datetime.now().isoformat()
        ))
        lesson_id = c.lastrowid
        
        # Sample homework
        sample_questions = [
            {
                "id": 1,
                "type": "text",
                "text": "Раскройте скобки: 'Listen! Somebody (sing) a wonderful song.' Объясните ваш выбор.",
                "sample": "is singing, так как слово 'Listen!' указывает на действие в момент речи."
            },
            {
                "id": 2,
                "type": "translate",
                "text": "Переведите на английский: 'Я обычно пью кофе по утрам, но сегодня я пью зеленый чай.'",
                "sample": "I usually drink coffee in the morning, but today I am drinking green tea."
            },
            {
                "id": 3,
                "type": "choice",
                "text": "Какое предложение грамматически корректно?",
                "options": [
                    "I am knowing this grammar rule very well.",
                    "I know this grammar rule very well.",
                    "I knows this grammar rule very well."
                ],
                "sample": "I know this grammar rule very well."
            }
        ]
        
        c.execute("""
        INSERT INTO homeworks (lesson_id, title, description, deadline, questions_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            lesson_id,
            "ДЗ: Отработка Present Simple и Continuous",
            "Выполните 3 практических упражнения по материалам пройденного урока.",
            "Без жесткого дедлайна",
            json.dumps(sample_questions, ensure_ascii=False),
            datetime.now().isoformat()
        ))
        print("Sample lesson and homework seeded.")

    conn.commit()
    conn.close()

# --- REQUEST HANDLER ---
class LearningLMSHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def get_auth_user(self):
        auth_header = self.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return None
        token = auth_header.split(' ', 1)[1].strip()
        conn = get_db()
        c = conn.cursor()
        c.execute("""
            SELECT u.id, u.role, u.full_name, u.username, u.telegram_id 
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ?
        """, (token,))
        user = c.fetchone()
        conn.close()
        return dict(user) if user else None

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))

    def send_error_json(self, message, status=400):
        self.send_json({"error": message}, status=status)

    def read_json_body(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                return {}
            post_data = self.rfile.read(content_length).decode('utf-8')
            return json.loads(post_data)
        except Exception as e:
            return None

    # --- ROUTING ---
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. API ROUTES
        if path.startswith('/api/'):
            user = self.get_auth_user()

            # GET /api/auth/me
            if path == '/api/auth/me':
                if not user:
                    self.send_error_json("Не авторизован", 401)
                    return
                self.send_json({"user": user})
                return

            # GET /api/invites (Teacher only)
            if path == '/api/invites':
                if not user or user['role'] != 'teacher':
                    self.send_error_json("Доступ запрещен", 403)
                    return
                conn = get_db()
                invites = conn.execute("SELECT * FROM invites ORDER BY created_at DESC").fetchall()
                conn.close()
                self.send_json({"invites": [dict(i) for i in invites]})
                return

            # GET /api/lessons
            if path == '/api/lessons':
                if not user:
                    self.send_error_json("Требуется авторизация", 401)
                    return
                conn = get_db()
                lessons = conn.execute("""
                    SELECT id, title, level, description, order_index, created_at,
                           (SELECT COUNT(*) FROM homeworks h WHERE h.lesson_id = lessons.id) as homeworks_count
                    FROM lessons ORDER BY order_index ASC, id ASC
                """).fetchall()
                conn.close()
                self.send_json({"lessons": [dict(l) for l in lessons]})
                return

            # GET /api/lessons/<id>
            if path.startswith('/api/lessons/'):
                if not user:
                    self.send_error_json("Требуется авторизация", 401)
                    return
                try:
                    lesson_id = int(path.split('/')[-1])
                except ValueError:
                    self.send_error_json("Неверный ID урока", 400)
                    return
                conn = get_db()
                lesson = conn.execute("SELECT * FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
                if not lesson:
                    conn.close()
                    self.send_error_json("Урок не найден", 404)
                    return
                
                # Fetch homework associated with this lesson
                hw = conn.execute("SELECT * FROM homeworks WHERE lesson_id = ?", (lesson_id,)).fetchone()
                conn.close()
                
                res = dict(lesson)
                res['blocks'] = json.loads(res['blocks_json'])
                res['homework'] = dict(hw) if hw else None
                if res['homework']:
                    res['homework']['questions'] = json.loads(res['homework']['questions_json'])
                self.send_json({"lesson": res})
                return

            # GET /api/homeworks
            if path == '/api/homeworks':
                if not user:
                    self.send_error_json("Требуется авторизация", 401)
                    return
                conn = get_db()
                if user['role'] == 'teacher':
                    homeworks = conn.execute("""
                        SELECT h.*, l.title as lesson_title,
                               (SELECT COUNT(*) FROM submissions s WHERE s.homework_id = h.id) as total_submissions,
                               (SELECT COUNT(*) FROM submissions s WHERE s.homework_id = h.id AND s.status = 'submitted') as pending_reviews
                        FROM homeworks h
                        LEFT JOIN lessons l ON h.lesson_id = l.id
                        ORDER BY h.id DESC
                    """).fetchall()
                else:
                    # Student view: include submission status
                    homeworks = conn.execute("""
                        SELECT h.*, l.title as lesson_title,
                               s.status as my_status, s.score as my_score, s.id as my_submission_id
                        FROM homeworks h
                        LEFT JOIN lessons l ON h.lesson_id = l.id
                        LEFT JOIN submissions s ON s.homework_id = h.id AND s.student_id = ?
                        ORDER BY h.id DESC
                    """, (user['id'],)).fetchall()
                conn.close()
                self.send_json({"homeworks": [dict(h) for h in homeworks]})
                return

            # GET /api/homeworks/<id>
            if path.startswith('/api/homeworks/'):
                if not user:
                    self.send_error_json("Требуется авторизация", 401)
                    return
                try:
                    hw_id = int(path.split('/')[-1])
                except ValueError:
                    self.send_error_json("Неверный ID ДЗ", 400)
                    return
                conn = get_db()
                hw = conn.execute("""
                    SELECT h.*, l.title as lesson_title 
                    FROM homeworks h 
                    LEFT JOIN lessons l ON h.lesson_id = l.id 
                    WHERE h.id = ?
                """, (hw_id,)).fetchone()
                if not hw:
                    conn.close()
                    self.send_error_json("ДЗ не найдено", 404)
                    return
                
                res = dict(hw)
                res['questions'] = json.loads(res['questions_json'])
                
                # Check student's submission if student
                if user['role'] == 'student':
                    sub = conn.execute("SELECT * FROM submissions WHERE homework_id = ? AND student_id = ?", 
                                       (hw_id, user['id'])).fetchone()
                    if sub:
                        sub_dict = dict(sub)
                        sub_dict['answers'] = json.loads(sub_dict['answers_json'])
                        res['my_submission'] = sub_dict
                conn.close()
                self.send_json({"homework": res})
                return

            # GET /api/submissions (Teacher only)
            if path == '/api/submissions':
                if not user or user['role'] != 'teacher':
                    self.send_error_json("Доступ запрещен", 403)
                    return
                conn = get_db()
                subs = conn.execute("""
                    SELECT s.*, u.full_name as student_name, h.title as homework_title
                    FROM submissions s
                    JOIN users u ON s.student_id = u.id
                    JOIN homeworks h ON s.homework_id = h.id
                    ORDER BY CASE WHEN s.status = 'submitted' THEN 0 ELSE 1 END, s.submitted_at DESC
                """).fetchall()
                
                out = []
                for s in subs:
                    d = dict(s)
                    d['answers'] = json.loads(d['answers_json'])
                    out.append(d)
                conn.close()
                self.send_json({"submissions": out})
                return

            # GET /api/students (Teacher only)
            if path == '/api/students':
                if not user or user['role'] != 'teacher':
                    self.send_error_json("Доступ запрещен", 403)
                    return
                conn = get_db()
                students = conn.execute("""
                    SELECT u.id, u.full_name, u.telegram_id, u.created_at,
                           (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id) as total_submitted,
                           (SELECT COUNT(*) FROM submissions s WHERE s.student_id = u.id AND s.status = 'reviewed') as total_graded
                    FROM users u
                    WHERE u.role = 'student'
                    ORDER BY u.id DESC
                """).fetchall()
                conn.close()
                self.send_json({"students": [dict(s) for s in students]})
                return

            self.send_error_json("API эндпоинт не найден", 404)
            return

        # 2. STATIC FILES SERVING
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.read_json_body()

        # POST /api/auth/login (Teacher login)
        if path == '/api/auth/login':
            if not body or 'username' not in body or 'password' not in body:
                self.send_error_json("Укажите логин и пароль", 400)
                return
            username = body['username'].strip()
            password = body['password']
            
            conn = get_db()
            user = conn.execute("SELECT * FROM users WHERE username = ? AND role = 'teacher'", (username,)).fetchone()
            if not user or user['password_hash'] != hash_password(password):
                conn.close()
                self.send_error_json("Неверный логин или пароль преподавателя", 401)
                return
            
            token = secrets.token_hex(24)
            conn.execute("INSERT INTO sessions (token, user_id, role, created_at) VALUES (?, ?, 'teacher', ?)",
                         (token, user['id'], datetime.now().isoformat()))
            conn.commit()
            conn.close()
            
            self.send_json({
                "token": token,
                "user": {
                    "id": user['id'],
                    "role": user['role'],
                    "username": user['username'],
                    "full_name": user['full_name']
                }
            })
            return

        # POST /api/auth/invite-join (Student onboarding via offer link)
        if path == '/api/auth/invite-join':
            if not body or 'code' not in body or 'full_name' not in body:
                self.send_error_json("Укажите код приглашения и ваше имя", 400)
                return
            code = body['code'].strip().upper()
            full_name = body['full_name'].strip()
            telegram_id = body.get('telegram_id', '')

            if not full_name:
                self.send_error_json("Пожалуйста, введите ваше имя", 400)
                return

            conn = get_db()
            invite = conn.execute("SELECT * FROM invites WHERE code = ?", (code,)).fetchone()
            if not invite:
                conn.close()
                self.send_error_json("Приглашение недействительно или код введен с ошибкой", 404)
                return

            if invite['used_count'] >= invite['max_uses']:
                conn.close()
                self.send_error_json("Лимит активаций этого приглашения исчерпан", 403)
                return

            # Register student user
            c = conn.cursor()
            unique_uname = f"student_{secrets.token_hex(4)}"
            c.execute("""
                INSERT INTO users (role, username, full_name, telegram_id, created_at)
                VALUES ('student', ?, ?, ?, ?)
            """, (unique_uname, full_name, telegram_id, datetime.now().isoformat()))
            student_id = c.lastrowid

            # Increment invite counter
            c.execute("UPDATE invites SET used_count = used_count + 1 WHERE code = ?", (code,))

            # Generate session
            token = secrets.token_hex(24)
            c.execute("INSERT INTO sessions (token, user_id, role, created_at) VALUES (?, ?, 'student', ?)",
                      (token, student_id, datetime.now().isoformat()))
            conn.commit()
            conn.close()

            self.send_json({
                "token": token,
                "user": {
                    "id": student_id,
                    "role": "student",
                    "full_name": full_name,
                    "telegram_id": telegram_id
                }
            })
            return

        # All following routes require authentication
        user = self.get_auth_user()
        if not user:
            self.send_error_json("Требуется авторизация", 401)
            return

        # POST /api/auth/change-password (Teacher changes password)
        if path == '/api/auth/change-password':
            if user['role'] != 'teacher':
                self.send_error_json("Доступ запрещен", 403)
                return
            new_password = body.get('new_password', '').strip()
            if not new_password or len(new_password) < 4:
                self.send_error_json("Пароль должен содержать минимум 4 символа", 400)
                return
            conn = get_db()
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                         (hash_password(new_password), user['id']))
            conn.commit()
            conn.close()
            self.send_json({"message": "Пароль успешно обновлен!"})
            return

        # POST /api/invites (Teacher only: Create new offer/invite link)
        if path == '/api/invites':
            if user['role'] != 'teacher':
                self.send_error_json("Доступ запрещен", 403)
                return
            student_name = body.get('student_name', 'Персональное приглашение')
            max_uses = int(body.get('max_uses', 1))
            code = secrets.token_urlsafe(8).upper().replace('-', '').replace('_', '')[:8]
            
            conn = get_db()
            conn.execute("""
                INSERT INTO invites (code, student_name, max_uses, used_count, created_at)
                VALUES (?, ?, ?, 0, ?)
            """, (code, student_name, max_uses, datetime.now().isoformat()))
            conn.commit()
            conn.close()
            
            self.send_json({"code": code, "student_name": student_name, "max_uses": max_uses})
            return

        # POST /api/lessons (Teacher only: Create lesson with rich media blocks)
        if path == '/api/lessons':
            if user['role'] != 'teacher':
                self.send_error_json("Доступ запрещен", 403)
                return
            title = body.get('title', '').strip()
            level = body.get('level', 'All Levels')
            description = body.get('description', '')
            blocks = body.get('blocks', [])

            if not title:
                self.send_error_json("Заголовок урока обязателен", 400)
                return

            conn = get_db()
            c = conn.cursor()
            c.execute("""
                INSERT INTO lessons (title, level, description, blocks_json, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (title, level, description, json.dumps(blocks, ensure_ascii=False), datetime.now().isoformat()))
            lesson_id = c.lastrowid
            conn.commit()
            conn.close()

            self.send_json({"id": lesson_id, "message": "Урок успешно создан"})
            return

        # POST /api/homeworks (Teacher only: Create homework)
        if path == '/api/homeworks':
            if user['role'] != 'teacher':
                self.send_error_json("Доступ запрещен", 403)
                return
            title = body.get('title', '').strip()
            lesson_id = body.get('lesson_id')
            description = body.get('description', '')
            deadline = body.get('deadline', '')
            questions = body.get('questions', [])

            if not title:
                self.send_error_json("Заголовок домашнего задания обязателен", 400)
                return
            if not questions:
                self.send_error_json("Добавьте хотя бы один вопрос в задание", 400)
                return

            conn = get_db()
            c = conn.cursor()
            c.execute("""
                INSERT INTO homeworks (lesson_id, title, description, deadline, questions_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (lesson_id, title, description, deadline, json.dumps(questions, ensure_ascii=False), datetime.now().isoformat()))
            hw_id = c.lastrowid
            conn.commit()
            conn.close()

            self.send_json({"id": hw_id, "message": "Домашнее задание успешно создано"})
            return

        # POST /api/submissions (Student submits homework answers)
        if path == '/api/submissions':
            if user['role'] != 'student':
                self.send_error_json("Только ученики могут сдавать задания", 403)
                return
            hw_id = body.get('homework_id')
            answers = body.get('answers', [])

            if not hw_id:
                self.send_error_json("Не указан ID задания", 400)
                return

            conn = get_db()
            # Check if student already submitted
            existing = conn.execute("SELECT id FROM submissions WHERE homework_id = ? AND student_id = ?",
                                    (hw_id, user['id'])).fetchone()
            
            c = conn.cursor()
            now = datetime.now().isoformat()
            if existing:
                c.execute("""
                    UPDATE submissions 
                    SET answers_json = ?, status = 'submitted', submitted_at = ?
                    WHERE id = ?
                """, (json.dumps(answers, ensure_ascii=False), now, existing['id']))
                sub_id = existing['id']
            else:
                c.execute("""
                    INSERT INTO submissions (homework_id, student_id, answers_json, status, submitted_at)
                    VALUES (?, ?, ?, 'submitted', ?)
                """, (hw_id, user['id'], json.dumps(answers, ensure_ascii=False), now))
                sub_id = c.lastrowid
            conn.commit()
            conn.close()

            self.send_json({"id": sub_id, "message": "Работа успешно отправлена преподавателю на проверку!"})
            return

        # POST /api/submissions/<id>/review (Teacher grades submission & adds feedback)
        if path.startswith('/api/submissions/') and path.endswith('/review'):
            if user['role'] != 'teacher':
                self.send_error_json("Доступ запрещен", 403)
                return
            parts = path.split('/')
            sub_id = int(parts[3])
            score = body.get('score', '')
            feedback = body.get('feedback', '')

            conn = get_db()
            conn.execute("""
                UPDATE submissions 
                SET score = ?, feedback = ?, status = 'reviewed', reviewed_at = ?
                WHERE id = ?
            """, (str(score), feedback, datetime.now().isoformat(), sub_id))
            conn.commit()
            conn.close()

            self.send_json({"message": "Оценка и комментарий сохранены!"})
            return

        self.send_error_json("Неизвестный POST запрос", 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        user = self.get_auth_user()
        if not user or user['role'] != 'teacher':
            self.send_error_json("Доступ запрещен", 403)
            return

        conn = get_db()
        # DELETE /api/lessons/<id>
        if path.startswith('/api/lessons/'):
            lesson_id = int(path.split('/')[-1])
            conn.execute("DELETE FROM lessons WHERE id = ?", (lesson_id,))
            conn.commit()
            conn.close()
            self.send_json({"message": "Урок удален"})
            return

        # DELETE /api/homeworks/<id>
        if path.startswith('/api/homeworks/'):
            hw_id = int(path.split('/')[-1])
            conn.execute("DELETE FROM submissions WHERE homework_id = ?", (hw_id,))
            conn.execute("DELETE FROM homeworks WHERE id = ?", (hw_id,))
            conn.commit()
            conn.close()
            self.send_json({"message": "Задание удалено"})
            return

        conn.close()
        self.send_error_json("Неизвестный DELETE запрос", 404)

class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True

def run():
    init_db()
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    server_address = ('', PORT)
    httpd = ThreadedTCPServer(server_address, LearningLMSHandler)
    print(f"==================================================")
    print(f"English Tutor LMS Platform active on port {PORT}")
    print(f"==================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping LMS server.")
        sys.exit(0)

if __name__ == '__main__':
    run()
