import sys

with open('/opt/lampp/htdocs/MyProject/today/frontend/assets/css/style.css', 'r') as f:
    content = f.read()

old_css = """.admin-page-wrapper {
    background: #f1f5f9;
    min-height: 100vh;
    margin: 0;
    padding: 0;
    font-family: 'Inter', sans-serif;
}"""

new_css = """.admin-page-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    min-height: 100vh;
    margin: 0;
    padding: 0;
    background: #f1f5f9;
    font-family: 'Inter', sans-serif;
    z-index: 1050;
}"""

if old_css in content:
    content = content.replace(old_css, new_css)
    with open('/opt/lampp/htdocs/MyProject/today/frontend/assets/css/style.css', 'w') as f:
        f.write(content)
    print("Fixed CSS.")
else:
    print("Could not find the old CSS block.")
