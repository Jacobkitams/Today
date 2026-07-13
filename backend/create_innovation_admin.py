import sys
import os
from database import SessionLocal
from models import User
from auth import get_password_hash

db = SessionLocal()
email = "innovation@iuea.ac.ug"

existing_user = db.query(User).filter(User.email == email).first()
if existing_user:
    existing_user.role = "innovation_admin"
    existing_user.password_hash = get_password_hash("password123")
    print("User existed. Updated role to innovation_admin and reset password to 'password123'.")
else:
    new_user = User(
        email=email,
        password_hash=get_password_hash("password123"),
        first_name="Innovation",
        last_name="Admin",
        role="innovation_admin",
        is_active=True
    )
    db.add(new_user)
    print("Created new Innovation Admin user.")

db.commit()
db.close()
