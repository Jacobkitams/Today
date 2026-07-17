import requests

# Login to get token
response = requests.post("http://localhost:8002/auth/token", data={
    "username": "user@iuea.ac.ug", 
    "password": "password"
})
if response.status_code != 200:
    print("Login failed")
else:
    token = response.json()["access_token"]
    res = requests.get("http://localhost:8002/events-reg/admin/events/participants/all", headers={
        "Authorization": f"Bearer {token}"
    })
    print("Status:", res.status_code)
    print(res.text)
