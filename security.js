/**
 * Station ZIZ Security System
 * Handles 4-digit PIN lock for application access.
 */

class StationSecurity {
    constructor() {
        this.PIN_KEY = 'station_ziz_pin';
        this.SESSION_KEY = 'station_ziz_unlocked';
        this.DEFAULT_PIN = '1234';
        this.currentInput = '';
        this.failedAttempts = 0;

        this.init();
    }

    init() {
        // Ensure a PIN exists
        if (!localStorage.getItem(this.PIN_KEY)) {
            localStorage.setItem(this.PIN_KEY, this.DEFAULT_PIN);
        }

        // Check if we should show the lock
        document.addEventListener('DOMContentLoaded', () => {
            if (!this.isUnlocked()) {
                this.showLock();
            }
        });
    }

    isUnlocked() {
        return sessionStorage.getItem(this.SESSION_KEY) === 'true';
    }

    showLock() {
        // Create overlay if it doesn't exist
        if (document.getElementById('pin-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'pin-overlay';
        overlay.innerHTML = `
            <div class="pin-box">
                <div class="pin-header">
                    <div class="pin-logo"><i class="fas fa-gas-pump"></i></div>
                    <h2>STATION <span>ZIZ</span></h2>
                    <p>Accès Sécurisé</p>
                </div>
                <div class="pin-display">
                    <div class="pin-dots">
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                        <span class="dot"></span>
                    </div>
                </div>
                <div class="pin-keypad">
                    <button onclick="security.handleKey('1')">1</button>
                    <button onclick="security.handleKey('2')">2</button>
                    <button onclick="security.handleKey('3')">3</button>
                    <button onclick="security.handleKey('4')">4</button>
                    <button onclick="security.handleKey('5')">5</button>
                    <button onclick="security.handleKey('6')">6</button>
                    <button onclick="security.handleKey('7')">7</button>
                    <button onclick="security.handleKey('8')">8</button>
                    <button onclick="security.handleKey('9')">9</button>
                    <button onclick="security.handleKey('C')" class="btn-clear text-sm">Effacer</button>
                    <button onclick="security.handleKey('0')">0</button>
                    <button onclick="security.handleKey('DEL')" class="btn-del"><i class="fas fa-backspace"></i></button>
                </div>
                <p id="pin-error" class="pin-error">Code Incorrect</p>
            </div>
        `;
        document.body.appendChild(overlay);

        // Block interaction with the rest of the page
        document.body.style.overflow = 'hidden';
    }

    handleKey(key) {
        if (key === 'C') {
            this.currentInput = '';
        } else if (key === 'DEL') {
            this.currentInput = this.currentInput.slice(0, -1);
        } else if (this.currentInput.length < 4) {
            this.currentInput += key;
        }

        this.updateDots();

        if (this.currentInput.length === 4) {
            setTimeout(() => this.verify(), 200);
        }
    }

    updateDots() {
        const dots = document.querySelectorAll('.pin-dots .dot');
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i < this.currentInput.length);
        });
        document.getElementById('pin-error').style.opacity = '0';
    }

    verify() {
        const storedPin = localStorage.getItem(this.PIN_KEY);
        if (this.currentInput === storedPin) {
            this.failedAttempts = 0; // Reset on success
            this.unlock();
        } else {
            this.failedAttempts++;
            if (this.failedAttempts >= 3) {
                this.sendEmailAlert('3 Tentatives Incorrectes', this.failedAttempts);
            }
            this.fail();
        }
    }

    async sendEmailAlert(type, attempts) {
        try {
            await fetch('/api/security/alert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, attempts })
            });
            console.log("Alerte de sécurité envoyée.");
        } catch (err) {
            console.error("Échec de l'envoi de l'alerte email:", err);
        }
    }

    unlock() {
        sessionStorage.setItem(this.SESSION_KEY, 'true');
        const overlay = document.getElementById('pin-overlay');
        if (overlay) {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.remove();
                document.body.style.overflow = '';
            }, 500);
        }
    }

    fail() {
        const pinBox = document.querySelector('.pin-box');
        pinBox.classList.add('shake');
        document.getElementById('pin-error').style.opacity = '1';

        setTimeout(() => {
            pinBox.classList.remove('shake');
            this.currentInput = '';
            this.updateDots();
        }, 500);
    }
}

const security = new StationSecurity();
window.security = security;
