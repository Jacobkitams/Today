import requests

# Login to get token
response = requests.post("http://localhost:8002/auth/token", data={
    "username": "user@iuea.ac.ug", 
    "password": "password"
})
token = response.json()["access_token"]
print("Token:", token[:10] + "...")

# Get registrations
res = requests.get("http://localhost:8002/events-reg/admin/events/participants/all", headers={
    "Authorization": f"Bearer {token}"
})
print("Status:", res.status_code)
print(res.text)
