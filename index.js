const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 3000;
const IG_USERNAME = "thyo.ajah";
const IG_PASSWORD = "sayapunya";

// Dashboard Utama
app.get('/', (req, res) => {
    const hasCookies = fs.existsSync('./cookies.json') ? 
        '<span style="color:green;">Cookies Terdeteksi (Login lebih aman)</span>' : 
        '<span style="color:orange;">Tanpa Cookies (Login manual)</span>';

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>IG Analyser Pro</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #fafafa; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: white; padding: 2.5rem; border-radius: 20px; box-shadow: 0 15px 35px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 90%; }
                h1 { color: #262626; margin-bottom: 5px; }
                p { color: #8e8e8e; font-size: 14px; margin-bottom: 20px; }
                .status { font-size: 12px; margin-bottom: 20px; display: block; }
                .btn { background: #0095f6; color: white; border: none; padding: 14px 28px; border-radius: 10px; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-block; transition: 0.3s; }
                .btn:hover { background: #1877f2; transform: translateY(-2px); }
                .loader { display: none; margin: 20px auto; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 35px; height: 35px; animation: spin 1s linear infinite; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>IG Analyser</h1>
                <p>Menganalisis <strong>@${IG_USERNAME}</strong></p>
                <code class="status">${hasCookies}</code>
                <a href="/check" class="btn" onclick="document.getElementById('l').style.display='block'; this.style.display='none'">Jalankan Bot</a>
                <div id="l" class="loader"></div>
            </div>
        </body>
        </html>
    `);
});

// Proses Utama
app.get('/check', async (req, res) => {
    try {
        const data = await runBot();
        const listHTML = data.nonFollowBack.map(user => `<li><a href="https://instagram.com/${user}" target="_blank">@${user}</a></li>`).join('');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; background: #fafafa; padding: 20px; }
                    .container { max-width: 600px; margin: auto; background: white; padding: 25px; border-radius: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.05); }
                    .stats { display: flex; gap: 15px; margin-bottom: 25px; }
                    .box { flex: 1; background: #f8f9fa; padding: 15px; border-radius: 12px; text-align: center; border: 1px solid #eee; }
                    .box b { font-size: 24px; display: block; color: #262626; }
                    h2 { color: #ed4956; font-size: 1.2rem; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px; }
                    ul { list-style: none; padding: 0; }
                    li { padding: 12px; border-bottom: 1px solid #f9f9f9; }
                    a { text-decoration: none; color: #00376b; font-weight: 600; }
                    .back { display: block; text-align: center; margin-top: 30px; color: #999; text-decoration: none; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Ringkasan</h1>
                    <div class="stats">
                        <div class="box"><b>${data.following.length}</b> Following</div>
                        <div class="box"><b>${data.followers.length}</b> Followers</div>
                    </div>
                    <h2>Tidak Follback (${data.nonFollowBack.length})</h2>
                    <ul>${listHTML || '<li>🎉 Semua sudah follback kamu!</li>'}</ul>
                    <a href="/" class="back">← Kembali</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send(`<h3>Error:</h3><p>${error.message}</p><a href="/">Coba Lagi</a>`);
    }
});

async function runBot() {
    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    try {
        // CEK COOKIES
        if (fs.existsSync('./cookies.json')) {
            console.log("Memuat Cookies...");
            const cookies = JSON.parse(fs.readFileSync('./cookies.json'));
            await page.setCookie(...cookies);
            await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2' });
        } else {
            console.log("Login Manual...");
            await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });
            await page.waitForSelector('input[name="username"]');
            await page.type('input[name="username"]', IG_USERNAME, { delay: 100 });
            await page.type('input[name="password"]', IG_PASSWORD, { delay: 100 });
            await page.click('button[type="submit"]');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
            
            // Simpan cookies untuk sesi berikutnya
            const savedCookies = await page.cookies();
            fs.writeFileSync('./cookies.json', JSON.stringify(savedCookies, null, 2));
        }

        // AMBIL DATA
        await page.goto(`https://www.instagram.com/${IG_USERNAME}/`, { waitUntil: 'networkidle2' });
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
    const selector = `a[href*="/${type}/"]`;
    await page.waitForSelector(selector);
    await page.click(selector);
    
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
        const items = Array.from(document.querySelectorAll('span._ap3a._aaco._aacw._aacx._aad7._aade'));
        return items.map(i => i.textContent.trim());
    });

    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 1000));
    return users;
}

app.listen(PORT, () => console.log(`Server jalan di port ${PORT}`));
