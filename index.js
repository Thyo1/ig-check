const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 3000;
const IG_USERNAME = "thyo.ajah";

// Dashboard Utama
app.get('/', (req, res) => {
    const hasCookies = fs.existsSync('./cookies.json') ?
        '<span style="color:green;">✅ Cookies Aktif</span>' :
        '<span style="color:red;">❌ Cookies Tidak Ada (Gunakan cookies.json agar aman)</span>';
    
    res.send(`
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>IG Analyser Pro</title>
            <style>
                body { font-family: sans-serif; background: #fafafa; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: white; padding: 2rem; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); text-align: center; width: 90%; max-width: 400px; }
                .btn { background: #0095f6; color: white; border: none; padding: 12px 25px; border-radius: 8px; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-block; margin-top: 15px; }
                .loader { display: none; margin: 20px auto; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>IG Analyser @${IG_USERNAME}</h2>
                <p>${hasCookies}</p>
                <a href="/check" class="btn" onclick="document.getElementById('l').style.display='block'; this.style.display='none'">Mulai Analisis</a>
                <div id="l" class="loader"></div>
            </div>
        </body>
        </html>
    `);
});

// Halaman Hasil
app.get('/check', async (req, res) => {
    try {
        const data = await runBot();
        const listHTML = data.nonFollowBack.map(user => `<li><a href="https://instagram.com/${user}" target="_blank">@${user}</a></li>`).join('');
        
        res.send(`
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
                <h1>Hasil Scan</h1>
                <p>Following: ${data.following.length} | Followers: ${data.followers.length}</p>
                <h2 style="color:red;">Tidak Follback (${data.nonFollowBack.length})</h2>
                <ul>${listHTML || 'Semua sudah follback!'}</ul>
                <br><a href="/">Kembali</a>
            </div>
        `);
    } catch (error) {
        res.status(500).send(`<h3>Error:</h3><p>${error.message}</p><a href="/">Coba Lagi</a>`);
    }
});

async function runBot() {
    // Railway Builder: Docker akan menyediakan Chrome di path default
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    
    try {
        if (fs.existsSync('./cookies.json')) {
            const cookies = JSON.parse(fs.readFileSync('./cookies.json'));
            await page.setCookie(...cookies);
            await page.goto(`https://www.instagram.com/${IG_USERNAME}/`, { waitUntil: 'networkidle2' });
        } else {
            throw new Error("File cookies.json tidak ditemukan! Harap upload cookies dari Kiwi Browser ke GitHub.");
        }
        
        const following = await scrapeList(page, 'following');
        const followers = await scrapeList(page, 'followers');
        const nonFollowBack = following.filter(u => !followers.includes(u));
        
        await browser.close();
        return { following, followers, nonFollowBack };
    } catch (err) {
        if (browser) await browser.close();
        throw err;
    }
}

async function scrapeList(page, type) {
    await page.waitForSelector(`a[href*="/${type}/"]`);
    await page.click(`a[href*="/${type}/"]`);
    
    const modalSelector = 'div[role="dialog"] ._aano';
    await page.waitForSelector(modalSelector);
    
    await page.evaluate(async (sel) => {
        const el = document.querySelector(sel);
        await new Promise((resolve) => {
            let lastHeight = 0;
            const timer = setInterval(() => {
                el.scrollTop += 700;
                if (el.scrollHeight === lastHeight) {
                    clearInterval(timer);
                    resolve();
                }
                lastHeight = el.scrollHeight;
            }, 2000);
        });
    }, modalSelector);
    
    const users = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('span._ap3a._aaco._aacw._aacx._aad7._aade')).map(i => i.textContent.trim());
    });
    
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 1000));
    return users;
}

app.listen(PORT, () => console.log(`Server on port ${PORT}`));