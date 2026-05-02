This application supports any type of file for both encryption and decryption, with a single constraint: the file size must be under 100MB.

The application reads the raw binary data of the uploaded file regardless of its extension (e.g., .txt, .pdf, .jpg, .docx, etc.). It does not inspect the contents or restrict the upload based on file types.

How it handles them:

Encryption: It takes your file, encrypts its binary data, and typically appends .enc to the filename (or packages it into a .zip when using RSA).

Decryption: It reverses the process and restores the file to its original format, removing the .enc extension if present, allowing you to open it normally in its respective program.


## Local Setup

1. Clone the repository:

```bash
git clone https://github.com/kaushlendra112/Information_Security.git
cd File_Encryption
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run the server:

```bash
python app.py
```

4. Open the app in your browser:

```text
http://127.0.0.1:5000
```
