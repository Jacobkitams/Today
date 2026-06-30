from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import User, Base
import bcrypt

engine = create_engine("mysql+pymysql://root:@localhost/iuea_today")
Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

db = SessionLocal()

users_to_create = [
    {"email": "user@iuea.ac.ug", "name": "Test User", "role": "registered_user", "password": "password"},
    {"email": "alumni@iuea.ac.ug", "name": "IUEA Alumni", "role": "alumni", "password": "password"},
    {"email": "donor@iuea.ac.ug", "name": "Partner Donor", "role": "donor_partner", "password": "password"},
    {"email": "editor@iuea.ac.ug", "name": "Content Editor", "role": "content_editor", "password": "password"},
    {"email": "coordinator@iuea.ac.ug", "name": "Form Coordinator", "role": "coordinator", "password": "password"},
    {"email": "superadmin@iuea.ac.ug", "name": "Super Admin", "role": "super_admin", "password": "password"}
]

for u in users_to_create:
    user = db.query(User).filter(User.email == u["email"]).first()
    if user:
        print(f"User {u['email']} already exists.")
    else:
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(u["password"].encode('utf-8'), salt)
        
        new_user = User(
            email=u["email"],
            name=u["name"],
            hashed_password=hashed.decode('utf-8'),
            role=u["role"]
        )
        db.add(new_user)
        print(f"Created {u['role']} ({u['email']})")

db.commit()
print("All test users processed successfully.")
db.close()
