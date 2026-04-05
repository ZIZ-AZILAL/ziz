require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

function startServer(externalDbPath = null) {
    const app = express();
    const PORT = process.env.PORT || 3001;

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Security: Block sensitive files from being served statically
    app.use((req, res, next) => {
        const sensitiveFiles = ['.env', '.git', 'package.json', 'package-lock.json', 'gestion_ziz.db'];
        const urlToMatch = req.url.toLowerCase();
        if (sensitiveFiles.some(file => urlToMatch.includes(file.toLowerCase()))) {
            return res.status(403).json({ error: "Accès interdit" });
        }
        next();
    });

    app.use(express.static(path.join(__dirname)));

    // Database Logic
    let db;
    const isPostgres = !!process.env.DATABASE_URL;

    if (isPostgres) {
        console.log("Using PostgreSQL Database (Cloud)");
        db = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });

        // Wrapper to mimic sqlite3's API loosely for convenience
        db.run = (sql, params, callback) => {
            db.query(sql, params, (err, res) => {
                if (err) return callback ? callback(err) : console.error(err);
                if (callback) callback.call({ lastID: res.rows[0]?.id || null, changes: res.rowCount }, null);
            });
        };
        db.get = (sql, params, callback) => {
            db.query(sql, params, (err, res) => {
                if (err) return callback ? callback(err) : console.error(err);
                if (callback) callback(null, res.rows[0]);
            });
        };
        db.all = (sql, params, callback) => {
            db.query(sql, params, (err, res) => {
                if (err) return callback ? callback(err) : console.error(err);
                if (callback) callback(null, res.rows);
            });
        };
        // serialize is not strictly needed for pg pool but we keep a dummy for compatibility
        db.serialize = (fn) => fn();
    } else {
        console.log("Using SQLite Database (Local)");
        const dbFile = externalDbPath || path.join(__dirname, 'gestion_ziz.db');
        const localDbFile = path.join(__dirname, 'gestion_ziz.db');

        if (externalDbPath && !fs.existsSync(dbFile) && fs.existsSync(localDbFile)) {
            try {
                console.log("Migrating database to:", dbFile);
                fs.copyFileSync(localDbFile, dbFile);
            } catch (migrateErr) {
                console.error("Migration FAILED:", migrateErr);
            }
        }

        db = new sqlite3.Database(dbFile, (err) => {
            if (err) console.error("Database connection error:", err);
            else {
                console.log("Database connected at:", dbFile);
                db.run("PRAGMA foreign_keys = ON");
            }
        });
    }

    // Helper for table creation to handle syntax differences
    const createTable = (sql) => {
        if (isPostgres) {
            // Convert SQLite 'INTEGER PRIMARY KEY AUTOINCREMENT' to Postgres 'SERIAL PRIMARY KEY'
            const pgSql = sql
                .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
                .replace(/REAL/gi, 'NUMERIC')
                .replace(/JSON/gi, 'JSONB')
                .replace(/DATETIME DEFAULT CURRENT_TIMESTAMP/gi, 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
            db.query(pgSql).catch(err => console.error("PG Table Create Error:", err.message));
        } else {
            db.run(sql);
        }
    };

    db.serialize(() => {
        createTable(`CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            pompiste TEXT,
            vacation TEXT,
            grand_total REAL,
            data JSON,
            archivedAt TEXT
        )`);
        createTable(`CREATE TABLE IF NOT EXISTS credits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            client TEXT NOT NULL,
            motif TEXT,
            amount REAL DEFAULT 0,
            avance REAL DEFAULT 0,
            status TEXT DEFAULT 'archived',
            sessionId INTEGER,
            FOREIGN KEY(sessionId) REFERENCES sessions(id)
        )`);
        createTable(`CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            num TEXT NOT NULL,
            date TEXT NOT NULL,
            client TEXT,
            ice TEXT,
            exploitant TEXT,
            total REAL,
            data JSON
        )`);
        createTable(`CREATE TABLE IF NOT EXISTS konnach_clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT,
            total_balance REAL DEFAULT 0,
            createdAt TEXT
        )`);
        createTable(`CREATE TABLE IF NOT EXISTS konnach_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER,
            date TEXT NOT NULL,
            type TEXT NOT NULL,
            amount REAL DEFAULT 0,
            note TEXT,
            FOREIGN KEY(client_id) REFERENCES konnach_clients(id) ON DELETE CASCADE
        )`);
    });

    // --- API ENDPOINTS ---
    app.post('/api/sessions', (req, res) => {
        const { date, pompiste, vacation, grand_total, data, archivedAt } = req.body;
        const sql = `INSERT INTO sessions (date, pompiste, vacation, grand_total, data, archivedAt) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`;
        const params = [date, pompiste, vacation, grand_total, JSON.stringify(data), archivedAt || new Date().toISOString()];

        if (isPostgres) {
            db.query(sql, params, (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: result.rows[0].id });
            });
        } else {
            const sqliteSql = sql.replace(/\$\d/g, '?').replace(' RETURNING id', '');
            db.run(sqliteSql, params, function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
        }
    });

    app.get('/api/sessions', (req, res) => {
        const limit = req.query.limit || 30;
        const sql = `SELECT * FROM sessions ORDER BY "archivedAt" DESC LIMIT $1`;
        db.all(isPostgres ? sql : sql.replace('$1', '?').replace(/"/g, ''), [limit], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows.map(r => ({ ...r, data: typeof r.data === 'string' ? JSON.parse(r.data || '{}') : r.data })));
        });
    });

    app.get('/api/sessions/:id', (req, res) => {
        const sql = `SELECT * FROM sessions WHERE id = $1`;
        db.get(isPostgres ? sql : sql.replace('$1', '?'), [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: "Non trouvé" });
            res.json({ ...row, data: typeof row.data === 'string' ? JSON.parse(row.data || '{}') : row.data });
        });
    });

    app.delete('/api/sessions/:id', (req, res) => {
        const sql = `DELETE FROM sessions WHERE id = $1`;
        if (isPostgres) {
            db.query(sql, [req.params.id], (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ deleted: result.rowCount });
            });
        } else {
            db.run(sql.replace('$1', '?'), [req.params.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ deleted: this.changes });
            });
        }
    });

    app.get('/api/stats', (req, res) => {
        const today = new Date().toISOString().slice(0, 10);
        const last7DaysStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const monthPrefix = today.slice(0, 8);

        const stats = {
            day: 0, week: 0, month: 0,
            credits: { day: 0, week: 0, month: 0 },
            invoices: { day: 0, week: 0, month: 0 },
            today_sessions: [],
            today_breakdown: { gasoil: { qty: 0, total: 0 }, super: { qty: 0, total: 0 }, services: { total: 0 } },
            week_breakdown: { gasoil: { qty: 0, total: 0 }, super: { qty: 0, total: 0 }, services: { total: 0 } },
            month_breakdown: { gasoil: { qty: 0, total: 0 }, super: { qty: 0, total: 0 }, services: { total: 0 } }
        };

        const prefix = isPostgres ? '$1' : '?';
        db.all(`SELECT date, grand_total, pompiste, vacation, data FROM sessions WHERE date >= ${prefix}`, [monthPrefix + '01'], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });

            rows.forEach(r => {
                const amount = parseFloat(r.grand_total) || 0;
                const date = r.date;
                const sessionData = typeof r.data === 'string' ? JSON.parse(r.data || '{}') : (r.data || {});

                const accumulate = (target) => {
                    if (!sessionData.rows) return;
                    Object.entries(sessionData.rows).forEach(([id, row]) => {
                        const qty = Math.max(0, parseFloat(row.fin || 0) - parseFloat(row.debut || 0));
                        const price = parseFloat(row.price || 0);
                        const total = qty * price;

                        if (id.startsWith('g')) {
                            target.gasoil.qty += qty;
                            target.gasoil.total += total;
                        } else if (id.startsWith('s')) {
                            target.super.qty += qty;
                            target.super.total += total;
                        } else {
                            target.services.total += total;
                        }
                    });
                };

                if (date === today) {
                    stats.day += amount;
                    stats.today_sessions.push({ pompiste: r.pompiste, vacation: r.vacation, total: amount });
                    accumulate(stats.today_breakdown);
                }
                if (date >= last7DaysStr) {
                    stats.week += amount;
                    accumulate(stats.week_breakdown);
                }
                if (date.startsWith(monthPrefix)) {
                    stats.month += amount;
                    accumulate(stats.month_breakdown);
                }
            });

            db.all(`SELECT date, amount FROM credits WHERE date >= ${prefix}`, [monthPrefix + '01'], (err, cRows) => {
                cRows?.forEach(r => {
                    const amount = parseFloat(r.amount) || 0;
                    if (r.date === today) stats.credits.day += amount;
                    if (r.date >= last7DaysStr) stats.credits.week += amount;
                    if (r.date.startsWith(monthPrefix)) stats.credits.month += amount;
                });

                db.all(`SELECT date, total FROM invoices WHERE date >= ${prefix}`, [monthPrefix + '01'], (err, iRows) => {
                    iRows?.forEach(r => {
                        const total = parseFloat(r.total) || 0;
                        if (r.date === today) stats.invoices.day += total;
                        if (r.date >= last7DaysStr) stats.invoices.week += total;
                        if (r.date.startsWith(monthPrefix)) stats.invoices.month += total;
                    });
                    res.json(stats);
                });
            });
        });
    });

    // Credits API
    app.get('/api/credits', (req, res) => {
        db.all(`SELECT * FROM credits ORDER BY date DESC, id DESC`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    app.post('/api/credits', (req, res) => {
        const { date, client, motif, amount, avance, status, sessionId } = req.body;
        const sql = `INSERT INTO credits (date, client, motif, amount, avance, status, "sessionId") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
        const params = [date, client, motif, amount || 0, avance || 0, status || 'current', sessionId || null];

        if (isPostgres) {
            db.query(sql, params, (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: result.rows[0].id });
            });
        } else {
            db.run(sql.replace(/\$\d/g, '?').replace(' RETURNING id', '').replace(/"/g, ''), params, function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
        }
    });

    app.put('/api/credits/:id', (req, res) => {
        const { date, client, motif, amount, avance, status, sessionId } = req.body;
        const sql = `UPDATE credits SET date=$1, client=$2, motif=$3, amount=$4, avance=$5, status=$6, "sessionId"=$7 WHERE id=$8`;
        const params = [date, client, motif, amount || 0, avance || 0, status || 'current', sessionId || null, req.params.id];

        if (isPostgres) {
            db.query(sql, params, (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        } else {
            db.run(sql.replace(/\$\d/g, '?').replace(/"/g, ''), params, function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        }
    });

    app.delete('/api/credits/:id', (req, res) => {
        const sql = `DELETE FROM credits WHERE id = $1`;
        const prefix = isPostgres ? '$1' : '?';
        db.run(sql.replace('$1', prefix), [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    // Invoices API
    app.get('/api/invoices', (req, res) => {
        db.all(`SELECT * FROM invoices ORDER BY id DESC`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows.map(r => ({ ...r, data: typeof r.data === 'string' ? JSON.parse(r.data || '{}') : r.data })));
        });
    });

    app.post('/api/invoices', (req, res) => {
        const { num, date, client, ice, exploitant, total, data } = req.body;
        const sql = `INSERT INTO invoices (num, date, client, ice, exploitant, total, data) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`;
        const params = [num, date, client, ice, exploitant, total, JSON.stringify(data)];

        if (isPostgres) {
            db.query(sql, params, (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: result.rows[0].id });
            });
        } else {
            db.run(sql.replace(/\$\d/g, '?').replace(' RETURNING id', ''), params, function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
        }
    });

    app.put('/api/invoices/:id', (req, res) => {
        const { num, date, client, ice, exploitant, total, data } = req.body;
        const sql = `UPDATE invoices SET num=$1, date=$2, client=$3, ice=$4, exploitant=$5, total=$6, data=$7 WHERE id=$8`;
        const params = [num, date, client, ice, exploitant, total, JSON.stringify(data), req.params.id];

        if (isPostgres) {
            db.query(sql, params, (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        } else {
            db.run(sql.replace(/\$\d/g, '?'), params, function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
        }
    });

    app.delete('/api/invoices/:id', (req, res) => {
        const sql = `DELETE FROM invoices WHERE id = $1`;
        const prefix = isPostgres ? '$1' : '?';
        db.run(sql.replace('$1', prefix), [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    // Konnach API
    app.get('/api/konnach/clients', (req, res) => {
        db.all(`SELECT * FROM konnach_clients ORDER BY name ASC`, (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    app.post('/api/konnach/clients', (req, res) => {
        const { name, phone } = req.body;
        const sql = `INSERT INTO konnach_clients (name, phone, "createdAt") VALUES ($1, $2, $3) RETURNING id`;
        const params = [name, phone, new Date().toISOString()];

        if (isPostgres) {
            db.query(sql, params, (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: result.rows[0].id });
            });
        } else {
            db.run(sql.replace(/\$\d/g, '?').replace(' RETURNING id', '').replace(/"/g, ''), params, function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID });
            });
        }
    });

    app.delete('/api/konnach/clients/:id', (req, res) => {
        const sql = `DELETE FROM konnach_clients WHERE id = $1`;
        db.run(isPostgres ? sql : sql.replace('$1', '?'), [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });

    app.get('/api/konnach/transactions/:clientId', (req, res) => {
        const sql = `SELECT * FROM konnach_transactions WHERE client_id = $1 ORDER BY date DESC`;
        db.all(isPostgres ? sql : sql.replace('$1', '?'), [req.params.clientId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    });

    app.post('/api/konnach/transactions', (req, res) => {
        const { client_id, type, amount, note, date } = req.body;
        const tDate = date || new Date().toISOString();
        const insertSql = `INSERT INTO konnach_transactions (client_id, date, type, amount, note) VALUES ($1, $2, $3, $4, $5) RETURNING id`;
        const updateSql = `UPDATE konnach_clients SET total_balance = total_balance + $1 WHERE id = $2`;
        const change = (type === 'took') ? amount : -amount;

        if (isPostgres) {
            db.query('BEGIN', err => {
                if (err) return res.status(500).json({ error: err.message });
                db.query(insertSql, [client_id, tDate, type, amount, note], (err, res1) => {
                    if (err) return db.query('ROLLBACK', () => res.status(500).json({ error: err.message }));
                    db.query(updateSql, [change, client_id], (err2) => {
                        if (err2) return db.query('ROLLBACK', () => res.status(500).json({ error: err2.message }));
                        db.query('COMMIT', () => res.json({ success: true, id: res1.rows[0].id }));
                    });
                });
            });
        } else {
            db.serialize(() => {
                db.run(insertSql.replace(/\$\d/g, '?').replace(' RETURNING id', ''), [client_id, tDate, type, amount, note], function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    const tid = this.lastID;
                    db.run(updateSql.replace(/\$\d/g, '?'), [change, client_id], function (uErr) {
                        res.json({ success: true, id: tid });
                    });
                });
            });
        }
    });

    app.delete('/api/konnach/transactions/:id', (req, res) => {
        const getSql = `SELECT client_id, type, amount FROM konnach_transactions WHERE id = $1`;
        db.get(isPostgres ? getSql : getSql.replace('$1', '?'), [req.params.id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!row) return res.status(404).json({ error: "Transaction non trouvée" });

            const revertChange = (row.type === 'took') ? -row.amount : row.amount;
            const updateSql = `UPDATE konnach_clients SET total_balance = total_balance + $1 WHERE id = $2`;
            const deleteSql = `DELETE FROM konnach_transactions WHERE id = $1`;

            if (isPostgres) {
                db.query('BEGIN', () => {
                    db.query(updateSql, [revertChange, row.client_id], (err1) => {
                        if (err1) return db.query('ROLLBACK', () => res.status(500).json({ error: err1.message }));
                        db.query(deleteSql, [req.params.id], (err2) => {
                            if (err2) return db.query('ROLLBACK', () => res.status(500).json({ error: err2.message }));
                            db.query('COMMIT', () => res.json({ success: true }));
                        });
                    });
                });
            } else {
                db.serialize(() => {
                    db.run(updateSql.replace(/\$\d/g, '?'), [revertChange, row.client_id], () => {
                        db.run(deleteSql.replace('$1', '?'), [req.params.id], () => {
                            res.json({ success: true });
                        });
                    });
                });
            }
        });
    });

    app.get('/api/konnach/summary', (req, res) => {
        const today = new Date().toISOString().slice(0, 10);
        const prefix = isPostgres ? '$1' : '?';
        db.all(`SELECT type, SUM(amount) as total FROM konnach_transactions WHERE date LIKE ${prefix} GROUP BY type`, [today + '%'], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            let total_took = 0, total_gave = 0;
            rows?.forEach(r => {
                if (r.type === 'took') total_took = parseFloat(r.total) || 0;
                if (r.type === 'gave') total_gave = parseFloat(r.total) || 0;
            });
            res.json({ total_took, total_gave });
        });
    });

    app.get('/api/diag', (req, res) => {
        const counts = { sessions: 0, credits: 0, invoices: 0 };
        const dbPath = isPostgres ? 'Cloud (PostgreSQL)' : (externalDbPath || path.join(__dirname, 'gestion_ziz.db'));

        // Handle both SQLite and PG count syntax
        const countQuery = (table) => isPostgres ? `SELECT COUNT(*) as c FROM ${table}` : `SELECT COUNT(*) as c FROM ${table}`;
        
        db.get(countQuery('sessions'), [], (err, row1) => {
            if (!err && row1) counts.sessions = (row1.c != null ? row1.c : row1.count) || 0;
            db.get(countQuery('credits'), [], (err, row2) => {
                if (!err && row2) counts.credits = (row2.c != null ? row2.c : row2.count) || 0;
                db.get(countQuery('invoices'), [], (err, row3) => {
                    if (!err && row3) counts.invoices = (row3.c != null ? row3.c : row3.count) || 0;

                    res.json({
                        database: isPostgres ? 'PostgreSQL' : 'SQLite',
                        dbPath: dbPath,
                        counts,
                        platform: process.platform,
                        nodeVersion: process.version,
                        uptime: process.uptime()
                    });
                });
            });
        });
    });

    // Security Alert API
    app.post('/api/security/alert', async (req, res) => {
        const { type, attempts } = req.body;
        const user = process.env.GMAIL_USER;
        const pass = process.env.GMAIL_APP_PASS;

        if (!user || !pass) {
            console.warn("Configuration Gmail manquante (GMAIL_USER ou GMAIL_APP_PASS).");
            return res.status(400).json({ error: 'Configuration email manquante' });
        }

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user, pass }
        });

        const mailOptions = {
            from: user,
            to: process.env.EMAIL_RECEIVER || 'yahyabenaddi0@gmail.com',
            subject: '⚠️ ALERTE DE SÉCURITÉ - STATION ZIZ',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 2px solid #ef4444; border-radius: 10px;">
                    <h2 style="color: #ef4444;">⚠️ Tentatve Intrusive Détectée</h2>
                    <p>Une alerte de sécurité a été déclenchée sur votre application <strong>Station ZIZ</strong>.</p>
                    <hr>
                    <p><strong>Détails :</strong></p>
                    <ul>
                        <li><strong>Événement :</strong> ${type}</li>
                        <li><strong>Nombre de tentatives :</strong> ${attempts}</li>
                        <li><strong>Date :</strong> ${new Date().toLocaleString()}</li>
                    </ul>
                    <p style="color: #666; font-size: 0.9rem;">Ceci est un message automatique de protection.</p>
                </div>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            res.json({ success: true, message: 'Alerte envoyée par Gmail' });
        } catch (error) {
            console.error("Erreur Nodemailer:", error);
            res.status(500).json({ error: 'Échec de l\'envoi de l\'alerte' });
        }
    });

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT} (${isPostgres ? 'Cloud' : 'Local'})`);
    });
}

if (require.main === module) {
    startServer();
}

module.exports = startServer;
