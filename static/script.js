let currentMode = 'encrypt'; // 'encrypt' or 'decrypt'
let algoEnc = 'AES';
let algoDec = 'AES';

let files = {
    enc: null,
    dec: null,
    key: null
};

// --- TABS & UI TOGGLES ---
function switchTab(mode) {
    currentMode = mode;
    
    // Update tabs
    document.getElementById('tab-encrypt').classList.toggle('active', mode === 'encrypt');
    document.getElementById('tab-decrypt').classList.toggle('active', mode === 'decrypt');
    
    // Update sections
    document.getElementById('encrypt-section').classList.toggle('hidden', mode !== 'encrypt');
    document.getElementById('decrypt-section').classList.toggle('hidden', mode !== 'decrypt');
}

function setAlgorithm(mode, algo) {
    if (mode === 'enc') {
        algoEnc = algo;
        document.getElementById('btn-aes-enc').classList.toggle('active', algo === 'AES');
        document.getElementById('btn-rsa-enc').classList.toggle('active', algo === 'RSA');
        
        // Toggle helper text and password input
        document.getElementById('help-enc-aes').classList.toggle('hidden', algo !== 'AES');
        document.getElementById('help-enc-rsa').classList.toggle('hidden', algo !== 'RSA');
        document.getElementById('pwd-group-enc').classList.toggle('hidden', algo !== 'AES');
        
    } else {
        algoDec = algo;
        document.getElementById('btn-aes-dec').classList.toggle('active', algo === 'AES');
        document.getElementById('btn-rsa-dec').classList.toggle('active', algo === 'RSA');
        
        // Toggle inputs for decryption
        document.getElementById('pwd-group-dec').classList.toggle('hidden', algo !== 'AES');
        document.getElementById('key-group-dec').classList.toggle('hidden', algo !== 'RSA');
    }
}

// --- DRAG & DROP AND FILE SELECTION ---
function setupDragAndDrop(areaId, inputId, mode) {
    const dropArea = document.getElementById(areaId);
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
    });

    dropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        
        if (file) {
            document.getElementById(inputId).files = dt.files;
            handleFileSelect(mode, file);
        }
    }, false);
}

setupDragAndDrop('drop-area-enc', 'file-input-enc', 'enc');
setupDragAndDrop('drop-area-dec', 'file-input-dec', 'dec');

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function handleFileSelect(mode, droppedFile = null) {
    const input = document.getElementById(`file-input-${mode}`);
    const file = droppedFile || input.files[0];
    
    if (file) {
        files[mode] = file;
        
        // Hide drop instructions, show selected file
        const dropArea = document.getElementById(`drop-area-${mode}`);
        Array.from(dropArea.children).forEach(child => {
            if (child.id !== `selected-file-${mode}` && child.tagName !== 'INPUT') {
                child.classList.add('hidden');
            }
        });
        
        const fileUI = document.getElementById(`selected-file-${mode}`);
        fileUI.classList.remove('hidden');
        document.getElementById(`file-name-${mode}`).textContent = file.name;
        document.getElementById(`file-size-${mode}`).textContent = formatSize(file.size);
    }
}

function handleKeySelect() {
    const file = document.getElementById('key-input-dec').files[0];
    if (file) {
        files.key = file;
        document.getElementById('key-name-dec').textContent = file.name;
    }
}

// --- API COMMUNICATION ---
function showLoader(text) {
    document.getElementById('loader-text').textContent = text;
    document.getElementById('loader').classList.remove('hidden');
}

function hideLoader() {
    document.getElementById('loader').classList.add('hidden');
}

function showToast(title, message, isSuccess = false) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-title').textContent = title;
    document.getElementById('toast-message').textContent = message;
    
    if (isSuccess) {
        toast.classList.add('success');
    } else {
        toast.classList.remove('success');
    }
    
    toast.style.animation = 'none';
    toast.offsetHeight; // trigger reflow
    toast.style.animation = 'slideInRight 0.3s forwards';
    toast.classList.remove('hidden');
    
    setTimeout(() => { hideToast(); }, 5000);
}

function hideToast() {
    const toast = document.getElementById('toast');
    toast.style.animation = 'fadeOutRight 0.3s forwards';
    setTimeout(() => { toast.classList.add('hidden'); }, 300);
}

// Ensure download works
function triggerDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

async function processEncrypt() {
    const file = files.enc;
    if (!file) {
        showToast('Error', 'Please select a file to encrypt.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    let url = '';
    
    if (algoEnc === 'AES') {
        const pwd = document.getElementById('password-enc').value;
        if (!pwd) {
            showToast('Error', 'Please enter a password for AES encryption.');
            return;
        }
        formData.append('password', pwd);
        url = '/api/encrypt/aes';
    } else {
        url = '/api/encrypt/rsa';
    }

    showLoader(`Encrypting ${file.name}...`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error ${response.status}`);
        }

        // Get suggested filename from headers or default
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = algoEnc === 'RSA' ? `${file.name}_encrypted.zip` : `${file.name}.enc`;
        if (contentDisposition && contentDisposition.includes('filename=')) {
            filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
        }

        const blob = await response.blob();
        triggerDownload(blob, filename);
        showToast('Success', 'File encrypted successfully!', true);
        
        // Reset AES password to prevent accidental re-submission
        document.getElementById('password-enc').value = '';
        
    } catch (error) {
        showToast('Encryption Failed', error.message);
    } finally {
        hideLoader();
    }
}

async function processDecrypt() {
    const file = files.dec;
    if (!file) {
        showToast('Error', 'Please select an encrypted file.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    let url = '';
    
    if (algoDec === 'AES') {
        const pwd = document.getElementById('password-dec').value;
        if (!pwd) {
            showToast('Error', 'Please enter your decryption password.');
            return;
        }
        formData.append('password', pwd);
        url = '/api/decrypt/aes';
    } else {
        if (!files.key) {
            showToast('Error', 'Please select your private key (.pem) file.');
            return;
        }
        formData.append('private_key', files.key);
        url = '/api/decrypt/rsa';
    }

    showLoader(`Decrypting ${file.name}...`);
    try {
        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error ${response.status}`);
        }

        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = file.name.replace('.enc', ''); // backup if no header
        if (contentDisposition && contentDisposition.includes('filename=')) {
            filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
        }

        const blob = await response.blob();
        triggerDownload(blob, filename);
        showToast('Success', 'File decrypted successfully!', true);
        
        document.getElementById('password-dec').value = '';
        
    } catch (error) {
        showToast('Decryption Failed', error.message);
    } finally {
        hideLoader();
    }
}
