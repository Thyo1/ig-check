const express = require('express');
const puppeteer = require('puppeteer');
const app = express();

const PORT = process.env.PORT || 3000;
const IG_USERNAME = process.env.IG_USERNAME;
const IG_PASSWORD = process.env.IG_PASSWORD;

// Dashboard Utama
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>IG Follower Analyser</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #fafafa; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background: white; padding: 2rem; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 90%; }
                h1 { color: #262626; font-size: 24px; margin-bottom: 10px; }
                p { color: #8e8e8e; margin-bottom: 20px; }
                .btn { background: #0095f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; cursor: pointer; text-decoration: none; display: inline-block; transition: 0.3s; }
                .btn:hover { background: #1877f2; }
                .loader { display: none; margin-top: 20px; border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 30px; height: 30px; animation: spin 2s linear infinite; margin-left: auto; margin-right: auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>IG Analyser</h1>
                <p>Cek siapa yang tidak follback akun <strong>@${IG_USERNAME}</strong> secara otomatis.</p>
                <a href="/check" class="btn" onclick="document.getElementById('l').style.display='block'">Mulai Scan</a>
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
        
        let listHTML = data.nonFollowBack.map(user => `<li><a href="https://instagram.com/${user}" target="_blank">@${user}</a></li>`).join('');
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Hasil Scan</title>
                <style>
                    body { font-family: sans-serif; background: #fafafa; padding: 20px; color: #262626; }
                    .container { max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
                    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
                    .stat-box { background: #f0f0f0; padding: 15px; border-radius: 8px; text-align: center; }
                    .stat-box span { display: block; font-size: 20px; font-weight: bold; }
                    h2 { border-bottom: 2px solid #efefef; padding-bottom: 10px; color: #ed4956; }
                    ul { list-style: none; padding: 0; }
                    li { padding: 10px; border-bottom: 1px solid #fafafa; transition: 0.2s; }
                    li:hover { background: #fffafb; }
                    a { text-decoration: none; color: #00376b; font-weight: 500; }
                    .back { display: block; margin-top: 20px; text-align: center; color: #8e8e8e; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Ringkasan Akun</h1>
                    <div class="stat-grid">
                        <div class="stat-box">Following <span>${data.following.length}</span></div>
                        <div class="stat-box">Followers <span>${data.followers.length}</span></div>
                    </div>
                    
                    <h2>Gak Follback Kamu (${data.nonFollowBack.length})</h2>
                    <ul>${listHTML || '<li>Semua sudah follback! 🎉</li>'}</ul>
                    
                    <a href="/" class="back">Kembali ke Dashboard</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send(`<h1>Error</h1><p>${error.message}</p><a href="/">Coba Lagi</a>`);
    }
});

// --- FUNGSI runBot() DAN scrapeList() TETAP SAMA SEPERTI SEBELUMNYA ---
async function runBot() {
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    try {
        await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle2' });
        await page.waitForSelector('input[name="username"]');
        await page.type('input[name="username"]', IG_USERNAME, { delay: 100 });
        await page.type('input[name="password"]', IG_PASSWORD, { delay: 100 });
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ waitUntil: 'networkidle2' });

        await page.goto(`https://www.instagram.com/${IG_USERNAME}/`, { waitUntil: 'networkidle2' });

        const following = await scrapeList(page, 'following');
        const followers = await scrapeList(page, 'followers');

        const nonFollowBack = following.filter(u => !followers.includes(u));
        const fans = followers.filter(u => !following.includes(u));

        await browser.close();
        return { following, followers, nonFollowBack, fans };
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

    await page.evaluate(async (selector) => {
        const scrollableDiv = document.querySelector(selector);
        await new Promise((resolve) => {
            let lastHeight = 0;
            const timer = setInterval(() => {
                scrollableDiv.scrollTop += 500;
                if (scrollableDiv.scrollHeight === lastHeight) {
                    clearInterval(timer);
                    resolve();
                }
                lastHeight = scrollableDiv.scrollHeight;
            }, 1500);
        });
    }, modalSelector);

    const users = await page.evaluate(() => {
        // Selector untuk username di dalam modal (bisa berubah sewaktu-waktu oleh Instagram)
        const anchors = Array.from(document.querySelectorAll('span._ap3a._aaco._aacw._aacx._aad7._aade'));
        return anchors.map(a => a.textContent.trim());
    });

    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 1000));
    
    return users;
}

app.listen(PORT, () => {
    console.log(`Server aktif di port ${PORT}`);
});
