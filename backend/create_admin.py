from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import User, Base
import bcrypt

engine = create_engine("mysql+pymysql://root:@localhost/iuea_today")
Base.metadata.create_all(bind=engine)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

db = SessionLocal()
email = "admin@iuea.ac.ug"
password = "adminpassword"

user = db.query(User).filter(User.email == email).first()
if user:
    print(f"User {email} already exists.")
else:
    # Hash password correctly
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    
    new_user = User(
        email=email,
        name="Admin IUEA",
        hashed_password=hashed.decode('utf-8'),
        role="super_admin"
    )
    db.add(new_user)
    db.commit()
    print(f"Super admin user created successfully!\nEmail: {email}\nPassword: {password}")
db.close()
