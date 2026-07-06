import requests
import json
from auth import create_access_token

token = create_access_token({"sub": "admin@iuea.ac.ug", "role": "super_admin"})
res = requests.put(
    "http://127.0.0.1:8001/auth/me",
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    json={"name": "Test Admin", "email": "admin@iuea.ac.ug", "password": ""}
)
print("Status Code:", res.status_code)
print("Response:", res.text)
