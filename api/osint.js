import axios from 'axios';
import crypto from 'crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const TIMEOUT = 6000;

function client() {
    return axios.create({
        timeout: TIMEOUT,
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
        validateStatus: () => true, // kita cek status manual, jangan throw di 4xx
        maxRedirects: 3
    });
}

// ── Cek REAL berbasis email (bukan tebak username) ──────────────────────

async function checkGravatar(email) {
    const hash = crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
    const r = await client().get(`https://www.gravatar.com/avatar/${hash}?d=404`);
    if (r.status === 200) return { exists: true, note: 'punya foto Gravatar' };
    if (r.status === 404) return { exists: false };
    return { exists: null, note: `HTTP ${r.status}` };
}

async function checkGithubByEmail(email) {
    // GitHub Search API: cari user yang EMAIL PUBLIKNYA cocok persis. Ini valid cek email, bukan username.
    const r = await client().get(`https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`);
    if (r.status === 200 && r.data?.total_count > 0) {
        const user = r.data.items[0];
        return { exists: true, note: `profil publik: ${user.login}`, url: user.html_url };
    }
    if (r.status === 200) return { exists: false };
    return { exists: null, note: `HTTP ${r.status}` }; // 403 kalau kena rate limit unauthenticated (10 req/menit)
}

/**
 * Setiap checker return: { exists: true|false|null, note }
 * exists = null artinya gak bisa dipastikan (platform blokir/anti-bot),
 * jangan dianggap "active" kalau gak yakin.
 */
const checkers = {
    async github(username) {
        const r = await client().get(`https://api.github.com/users/${encodeURIComponent(username)}`);
        if (r.status === 200) return { exists: true, note: `${r.data.public_repos ?? 0} public repos` };
        if (r.status === 404) return { exists: false };
        return { exists: null, note: `HTTP ${r.status}` };
    },

    async reddit(username) {
        const r = await client().get(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`);
        if (r.status === 200 && r.data?.data?.name) return { exists: true, note: `karma: ${r.data.data.total_karma ?? '?'}` };
        if (r.status === 404) return { exists: false };
        return { exists: null, note: `HTTP ${r.status}` };
    },

    async instagram(username) {
        const r = await client().get(`https://www.instagram.com/${encodeURIComponent(username)}/`);
        if (r.status === 404) return { exists: false };
        if (r.status === 200) {
            const body = String(r.data || '');
            if (/Sorry, this page isn't available/i.test(body)) return { exists: false };
            if (/"username":"/i.test(body) || /profilePage_/i.test(body)) return { exists: true };
            return { exists: null, note: 'perlu login untuk verifikasi penuh' };
        }
        return { exists: null, note: `HTTP ${r.status}` };
    },

    async tiktok(username) {
        const r = await client().get(`https://www.tiktok.com/@${encodeURIComponent(username)}`);
        if (r.status === 404) return { exists: false };
        if (r.status === 200) {
            const body = String(r.data || '');
            if (/Couldn't find this account/i.test(body)) return { exists: false };
            if (/"uniqueId":"/i.test(body)) return { exists: true };
            return { exists: null, note: 'anti-bot, hasil gak pasti' };
        }
        return { exists: null, note: `HTTP ${r.status}` };
    },

    async pinterest(username) {
        const r = await client().get(`https://www.pinterest.com/${encodeURIComponent(username)}/`);
        if (r.status === 404) return { exists: false };
        if (r.status === 200) {
            const body = String(r.data || '');
            if (/user not found/i.test(body)) return { exists: false };
            return { exists: true };
        }
        return { exists: null, note: `HTTP ${r.status}` };
    },

    async spotify(username) {
        const r = await client().get(`https://open.spotify.com/user/${encodeURIComponent(username)}`);
        if (r.status === 404) return { exists: false };
        if (r.status === 200) return { exists: true };
        return { exists: null, note: `HTTP ${r.status}` };
    },

    async youtube(username) {
        const r = await client().get(`https://www.youtube.com/@${encodeURIComponent(username)}`);
        if (r.status === 404) return { exists: false };
        if (r.status === 200) {
            const body = String(r.data || '');
            if (/This channel does not exist/i.test(body)) return { exists: false };
            return { exists: true };
        }
        return { exists: null, note: `HTTP ${r.status}` };
    },

    async steam(username) {
        const r = await client().get(`https://steamcommunity.com/id/${encodeURIComponent(username)}/?xml=1`);
        if (r.status === 200) {
            const body = String(r.data || '');
            if (/<error>The specified profile could not be found/i.test(body)) return { exists: false };
            if (/<steamID64>/i.test(body)) return { exists: true };
        }
        return { exists: null, note: `HTTP ${r.status}` };
    },

    async twitch(username) {
        const r = await client().get(`https://www.twitch.tv/${encodeURIComponent(username)}`);
        if (r.status === 404) return { exists: false };
        if (r.status === 200) {
            const body = String(r.data || '');
            if (/Sorry\.? Unless you've got a time machine/i.test(body)) return { exists: false };
            return { exists: true };
        }
        return { exists: null, note: `HTTP ${r.status}` };
    }
};

// Platform yang scraping-nya gak reliable (butuh login/API key/anti-bot ketat) —
// jujur ditandai "unsupported" daripada tebak-tebakan.
const unsupported = ['Twitter/X', 'Discord', 'LinkedIn', 'Facebook', 'Snapchat'];

async function runUsernameChecks(rawUsername) {
    const username = rawUsername.replace('@', '').trim();
    const platformNames = {
        github: 'GitHub', reddit: 'Reddit', instagram: 'Instagram', tiktok: 'TikTok',
        pinterest: 'Pinterest', spotify: 'Spotify', youtube: 'YouTube', steam: 'Steam', twitch: 'Twitch'
    };
    // Link ke halaman profil ASLI (bukan domain root) — biar bisa diklik & dicek manual
    const profileUrl = {
        github: u => `https://github.com/${u}`,
        reddit: u => `https://www.reddit.com/user/${u}`,
        instagram: u => `https://www.instagram.com/${u}/`,
        tiktok: u => `https://www.tiktok.com/@${u}`,
        pinterest: u => `https://www.pinterest.com/${u}/`,
        spotify: u => `https://open.spotify.com/user/${u}`,
        youtube: u => `https://www.youtube.com/@${u}`,
        steam: u => `https://steamcommunity.com/id/${u}/`,
        twitch: u => `https://www.twitch.tv/${u}`
    };

    const entries = Object.entries(checkers);
    const settled = await Promise.allSettled(entries.map(([key, fn]) => fn(username)));

    const results = [];
    let foundCount = 0;
    let checkedCount = 0;

    settled.forEach((res, i) => {
        const [key] = entries[i];
        const name = platformNames[key];
        const link = profileUrl[key](username);
        if (res.status !== 'fulfilled') {
            results.push({ label: 'Platform', value: `${name} (gagal dicek)`, source: link, confidence: 'low' });
            return;
        }
        const { exists, note } = res.value;
        checkedCount++;
        if (exists === true) {
            foundCount++;
            results.push({
                label: 'Platform',
                value: `${name} — akun ditemukan${note ? ` (${note})` : ''} → klik source buat cek manual`,
                source: link,
                confidence: 'high'
            });
        } else if (exists === false) {
            results.push({ label: 'Platform', value: `${name} — tidak ditemukan`, source: link, confidence: 'high' });
        } else {
            results.push({ label: 'Platform', value: `${name} — tidak bisa dipastikan${note ? ` (${note})` : ''} → cek manual di source`, source: link, confidence: 'low' });
        }
    });

    unsupported.forEach(name => {
        results.push({ label: 'Platform', value: `${name} — belum didukung (butuh API/login)`, source: name, confidence: 'low' });
    });

    return { results, total: checkedCount, platforms: foundCount };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { type, query } = req.body;
        if (!query) {
            return res.status(400).json({ success: false, message: 'Query required' });
        }

        let results = [];
        let platforms = 0;
        let total = 0;

        if (type === 'username') {
            const r = await runUsernameChecks(query);
            results = r.results;
            total = r.total;
            platforms = r.platforms;

        } else if (type === 'email') {
            // Cek REAL berbasis email — bukan tebak username dari bagian sebelum '@'
            const [gravatarRes, githubRes, breachRes] = await Promise.allSettled([
                checkGravatar(query),
                checkGithubByEmail(query),
                client().get(`https://api.xposedornot.com/v1/check-email/${encodeURIComponent(query)}`)
            ]);

            // Gravatar
            if (gravatarRes.status === 'fulfilled') {
                const { exists, note } = gravatarRes.value;
                results.push({
                    label: 'Gravatar',
                    value: exists ? `Email terdaftar di Gravatar (${note})` : exists === false ? 'Tidak terdaftar di Gravatar' : `Tidak bisa dipastikan (${note})`,
                    source: `https://www.gravatar.com/${crypto.createHash('md5').update(query.trim().toLowerCase()).digest('hex')}`,
                    confidence: exists === null ? 'low' : 'high'
                });
                if (exists) platforms++;
            } else {
                results.push({ label: 'Gravatar', value: 'Gagal dicek', source: 'gravatar.com', confidence: 'low' });
            }

            // GitHub (by public email)
            if (githubRes.status === 'fulfilled') {
                const { exists, note, url } = githubRes.value;
                results.push({
                    label: 'GitHub',
                    value: exists ? `Email cocok dengan akun publik (${note})` : exists === false ? 'Tidak ada akun GitHub dengan email publik ini' : `Tidak bisa dipastikan (${note})`,
                    source: exists && url ? url : 'https://github.com/search',
                    confidence: exists === null ? 'low' : 'high'
                });
                if (exists) platforms++;
            } else {
                results.push({ label: 'GitHub', value: 'Gagal dicek', source: 'github.com', confidence: 'low' });
            }
            results.push({
                label: 'Catatan',
                value: 'Instagram/TikTok/dll gak bisa dicek langsung by-email tanpa login (dihardening platform). Kalau mau cek platform tsb, pake mode "Username" pake nama akunnya langsung.',
                source: 'Info',
                confidence: 'low'
            });

            // Breach check
            if (breachRes.status === 'fulfilled') {
                const breachResp = breachRes.value;
                if (breachResp.status === 200 && breachResp.data?.breaches) {
                    const siteList = (breachResp.data.breaches[0] || []).join(', ');
                    results.push({
                        label: 'Breach Check',
                        value: `Ditemukan di ${breachResp.data.breaches[0]?.length ?? 0} breach: ${siteList}`,
                        source: 'https://xposedornot.com',
                        confidence: 'high'
                    });
                } else if (breachResp.status === 404) {
                    results.push({
                        label: 'Breach Check',
                        value: 'Tidak ditemukan di breach database manapun',
                        source: 'https://xposedornot.com',
                        confidence: 'high'
                    });
                } else {
                    results.push({
                        label: 'Breach Check',
                        value: `Gagal cek breach (HTTP ${breachResp.status})`,
                        source: 'https://xposedornot.com',
                        confidence: 'low'
                    });
                }
            } else {
                results.push({
                    label: 'Breach Check',
                    value: 'Gagal cek breach (rate limit atau server down)',
                    source: 'https://xposedornot.com',
                    confidence: 'low'
                });
            }

            total = results.length;
        }

        } else if (type === 'phone') {
            // Validasi format doang, bukan data carrier/lokasi asli (itu butuh API berbayar)
            const cleaned = query.replace(/[^\d+]/g, '');
            const isValidFormat = /^\+?[1-9]\d{7,14}$/.test(cleaned);
            results = [
                {
                    label: 'Format',
                    value: isValidFormat ? 'Format nomor valid (E.164)' : 'Format nomor tidak valid',
                    source: 'Validasi lokal',
                    confidence: 'high'
                },
                {
                    label: 'Carrier / Lokasi',
                    value: 'Belum tersedia — butuh integrasi API berbayar (Numverify, dll)',
                    source: 'N/A',
                    confidence: 'low'
                }
            ];
            total = results.length;
            platforms = 0;

        } else if (type === 'ip') {
            try {
                const geoResp = await axios.get(`https://ipapi.co/${query}/json/`);
                const geo = geoResp.data;
                results = [
                    { label: 'ISP', value: geo.org || 'Unknown', source: 'ipapi.co', confidence: 'high' },
                    { label: 'Country', value: geo.country_name || 'Unknown', source: 'ipapi.co', confidence: 'high' },
                    { label: 'City', value: geo.city || 'Unknown', source: 'ipapi.co', confidence: 'medium' },
                    { label: 'Lat/Lon', value: `${geo.latitude || 0}, ${geo.longitude || 0}`, source: 'ipapi.co', confidence: 'medium' }
                ];
                total = results.length;
                platforms = 1;
            } catch (err) {
                results = [{ label: 'IP', value: query, source: 'Local', confidence: 'low' }];
                total = 1;
                platforms = 0;
            }
        }

        return res.status(200).json({
            success: true,
            data: { query, type, timestamp: new Date().toISOString(), total, platforms, results }
        });

    } catch (err) {
        console.error('OSINT Error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error: ' + err.message });
    }
}
