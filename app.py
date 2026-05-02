import os
import io
import zipfile
from flask import Flask, request, send_file, render_template, jsonify
from werkzeug.utils import secure_filename
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization

app = Flask(__name__)

# Max upload size 100MB
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/encrypt/aes', methods=['POST'])
def encrypt_aes():
    if 'file' not in request.files or 'password' not in request.form:
        return jsonify({"error": "Missing file or password"}), 400
    
    file = request.files['file']
    password = request.form['password'].encode()
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    data = file.read()
    
    # AES Encryption Configuration
    salt = os.urandom(16)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
    )
    key = kdf.derive(password)
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    
    try:
        ciphertext = aesgcm.encrypt(nonce, data, None)
        # Format: salt(16) + nonce(12) + ciphertext
        final_data = salt + nonce + ciphertext
        
        output = io.BytesIO(final_data)
        original_filename = secure_filename(file.filename)
        return send_file(
            output,
            as_attachment=True,
            download_name=f"{original_filename}.enc",
            mimetype="application/octet-stream"
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/decrypt/aes', methods=['POST'])
def decrypt_aes():
    if 'file' not in request.files or 'password' not in request.form:
        return jsonify({"error": "Missing file or password"}), 400
    
    file = request.files['file']
    password = request.form['password'].encode()
    
    data = file.read()
    if len(data) < 28:
        return jsonify({"error": "Invalid encrypted file"}), 400
        
    salt = data[:16]
    nonce = data[16:28]
    ciphertext = data[28:]
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480000,
    )
    key = kdf.derive(password)
    aesgcm = AESGCM(key)
    
    try:
        plain_data = aesgcm.decrypt(nonce, ciphertext, None)
        output = io.BytesIO(plain_data)
        
        # Determine original name: strip .enc if present
        original_filename = file.filename
        if original_filename.endswith('.enc'):
            original_filename = original_filename[:-4]
            
        return send_file(
            output,
            as_attachment=True,
            download_name=original_filename,
            mimetype="application/octet-stream"
        )
    except Exception:
        return jsonify({"error": "Decryption failed. Incorrect password or corrupt file."}), 400

@app.route('/api/encrypt/rsa', methods=['POST'])
def encrypt_rsa():
    if 'file' not in request.files:
        return jsonify({"error": "Missing file"}), 400
        
    file = request.files['file']
    data = file.read()
    
    try:
        # 1. Generate RSA key pair
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        public_key = private_key.public_key()
        
        pem_priv = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        
        # 2. Generate random AES key for Hybrid Encryption
        aes_key = os.urandom(32)
        nonce = os.urandom(12)
        aesgcm = AESGCM(aes_key)
        ciphertext = aesgcm.encrypt(nonce, data, None)
        
        # 3. Encrypt AES key using RSA public key
        enc_aes_key = public_key.encrypt(
            aes_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        # 4. Construct encrypted file: enc_key_len(4) + enc_key + nonce(12) + ciphertext
        key_len_bytes = len(enc_aes_key).to_bytes(4, byteorder='big')
        final_file_data = key_len_bytes + enc_aes_key + nonce + ciphertext
        
        # Package encrypted file and private key into a zip
        original_filename = secure_filename(file.filename)
        memory_file = io.BytesIO()
        with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"{original_filename}.enc", final_file_data)
            zf.writestr("private_key.pem", pem_priv)
            
        memory_file.seek(0)
        return send_file(
            memory_file,
            as_attachment=True,
            download_name=f"{original_filename}_encrypted.zip",
            mimetype="application/zip"
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/decrypt/rsa', methods=['POST'])
def decrypt_rsa():
    if 'file' not in request.files or 'private_key' not in request.files:
        return jsonify({"error": "Missing encrypted file or private key"}), 400
        
    file = request.files['file']
    priv_key_file = request.files['private_key']
    
    data = file.read()
    priv_key_data = priv_key_file.read()
    
    try:
        # Load private key
        private_key = serialization.load_pem_private_key(priv_key_data, password=None)
        
        # Extract components
        if len(data) < 4:
            return jsonify({"error": "Invalid encrypted file"}), 400
            
        enc_key_len = int.from_bytes(data[:4], byteorder='big')
        if len(data) < 4 + enc_key_len + 12:
            return jsonify({"error": "Invalid encrypted file length"}), 400
            
        enc_aes_key = data[4:4+enc_key_len]
        nonce = data[4+enc_key_len : 16+enc_key_len]
        ciphertext = data[16+enc_key_len:]
        
        # Decrypt AES key
        aes_key = private_key.decrypt(
            enc_aes_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        # Decrypt file data
        aesgcm = AESGCM(aes_key)
        plain_data = aesgcm.decrypt(nonce, ciphertext, None)
        
        output = io.BytesIO(plain_data)
        original_filename = file.filename
        if original_filename.endswith('.enc'):
            original_filename = original_filename[:-4]
            
        return send_file(
            output,
            as_attachment=True,
            download_name=original_filename,
            mimetype="application/octet-stream"
        )
        
    except ValueError:
        return jsonify({"error": "Decryption failed. Invalid private key."}), 400
    except Exception:
        return jsonify({"error": "Decryption failed due to data corruption or invalid key/file."}), 400

if __name__ == '__main__':
    app.run(debug=True, port=5000)
