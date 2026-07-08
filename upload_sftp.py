import paramiko
import os

host = "159.65.195.188"
username = "jacob"
password = "j  "

local_file = "/opt/lampp/htdocs/MyProject/today/frontend/assets/css/style.css"
remote_file = "/home/jacob/Today/frontend/assets/css/style.css"

print("Connecting...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(host, username=username, password=password)

print("Opening SFTP...")
sftp = ssh.open_sftp()
sftp.put(local_file, remote_file)
sftp.close()
ssh.close()
print("Upload complete!")
