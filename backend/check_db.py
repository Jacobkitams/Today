import os, sys
sys.path.insert(0, os.path.abspath('.'))
from database import SessionLocal
from models import User, Message, FormSubmission

db = SessionLocal()
print("Recent Users:")
for u in db.query(User).order_by(User.id.desc()).limit(5).all():
    print(f" - {u.id}: {u.email} ({u.role})")

print("\nRecent Form Submissions:")
for f in db.query(FormSubmission).order_by(FormSubmission.id.desc()).limit(5).all():
    print(f" - {f.id}: {f.email} (Status: {f.status})")

print("\nRecent Messages:")
for m in db.query(Message).order_by(Message.id.desc()).limit(5).all():
    print(f" - {m.id}: {m.sender_id} -> {m.recipient_id} : {m.body}")

from models import Innovation, Startup

print("\nRecent Innovations:")
for i in db.query(Innovation).order_by(Innovation.id.desc()).limit(3).all():
    print(f" - {i.id}: {i.title} (Status: {i.status})")

print("\nRecent Startups:")
for s in db.query(Startup).order_by(Startup.id.desc()).limit(3).all():
    print(f" - {s.id}: {s.title} (Status: {s.status})")
