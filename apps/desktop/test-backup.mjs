import fs from 'fs';
import formData from 'form-data';
import fetch from 'node-fetch';

async function upload() {
    const form = new formData();
    form.append('file', fs.createReadStream('./package.json'));
    form.append('branchId', 'default');

    const targetUrl = "http://127.0.0.1:3000/api/backup/upload";

    const response = await fetch(targetUrl, {
        method: 'POST',
        body: form,
        headers: {
            ...form.getHeaders(),
            "x-backup-secret": "R$i1999s$a"
        }
    });

    console.log("Status:", response.status);
    console.log("Response:", await response.text());
}

upload().catch(console.error);
