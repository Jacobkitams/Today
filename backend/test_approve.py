import sys, os
sys.path.insert(0, os.path.abspath('.'))
from database import SessionLocal
from models import User, Message, FormSubmission
import models
from datetime import datetime, timezone

db = SessionLocal()

# Find a pending FormSubmission
item = db.query(FormSubmission).filter(FormSubmission.status == 'pending').first()
if not item:
    print("No pending submissions")
    sys.exit(0)

print(f"Approving item: {item.id}, email: {item.email}")
action = "approve"
content_type = "requests"

# Simulate the endpoint logic exactly:
email = getattr(item, "email", None)
if email:
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        from auth import get_password_hash
        import secrets
        temp_password = secrets.token_urlsafe(12)
        user = models.User(
            email=email,
            first_name=getattr(item, "first_name", "Student"),
            last_name=getattr(item, "last_name", ""),
            hashed_password=get_password_hash(temp_password),
            role="student"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Created user {user.id}")
    else:
        print(f"User {user.id} already exists")
    
    current_user_id = 12 # Innovation admin ID
    # Send welcome message from Admin
    msg_body = f"Hello {user.first_name}! Your request to join has been approved. Welcome to the platform!"
    message = models.Message(
        sender_id=current_user_id,
        recipient_id=user.id,
        body=msg_body
    )
    db.add(message)
    item.status = "approved"
    db.commit()
    print("Message added and item approved!")

