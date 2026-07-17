from database import SessionLocal
from models import User
from auth import create_access_token
import requests

db = SessionLocal()
user = db.query(User).filter(User.id == 8).first()
if user:
    token = create_access_token(data={"sub": str(user.email)})
    res = requests.get("http://localhost:8002/events-reg/admin/events/participants/all", headers={
        "Authorization": f"Bearer {token}"
    })
    print("Status:", res.status_code)
    print(res.text)
