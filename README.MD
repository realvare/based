<div align="center">
  
# 🌌 Based - by Sam aka vare

<p align="center">
  <img src="https://img.shields.io/npm/dm/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="Downloads"/>
  <img src="https://img.shields.io/badge/License-MIT-8a2be2.svg?style=for-the-badge&labelColor=2d1b69" alt="Licenza: MIT"/>
  <img src="https://img.shields.io/github/stars/realvare/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="GitHub stelle"/>
</p>

<p align="center">
  <strong>💜 Una libreria WhatsApp Web API moderna, potente e veloce con supporto LID/JID</strong>
</p>

<p align="center">
  <a href="#-installazione">Installazione</a> •
  <a href="#-guida-rapida">Guida Rapida</a> •
  <a href="#-documentazione">Documentazione</a> •
  <a href="#-supporto">Supporto</a>
</p>

---

</div>

## ✨ Caratteristiche Principali

<table>
<tr>
<td width="50%">

### 🧠 **Core Features**
- 🔄 Mappatura intelligente `@lid` e `@s.whatsapp.net` (jid)
- 📱 Supporto multi-dispositivo completo
- 🔒 Crittografia End-to-End nativa
- ⚡ Codebase TypeScript moderna

</td>
<td width="50%">

### 🛠️ **Developer Experience**
- 💬 Gestione avanzata eventi e messaggi
- 🛡️ Tipizzazioni TypeScript complete
- 📖 Documentazione dettagliata
- 🔧 API intuitive e semplici

</td>
</tr>
</table>

---

## 📦 Installazione

### Quick Start

```bash
# 📥 Installazione da GitHub
npm install https://github.com/realvare/based

# 🧶 oppure con Yarn
yarn add https://github.com/realvare/based
```

### 🔨 Setup per Sviluppatori

```bash
git clone https://github.com/realvare/based.git
cd based
npm install
npm run build
npm test
```

---

## 🚀 Guida Rapida

### Esempio Base - Avvio Bot

```typescript
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from 'realvare/based'

async function startBot() {
  // 🔐 Setup autenticazione
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
  
  // 🌐 Creazione socket
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: console,
    browser: ['VareBot', 'Chrome', '4.0.0']
  })

  // 📡 Gestione connessione
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('🔴 Connessione chiusa:', lastDisconnect?.error, 'Riconnessione:', shouldReconnect)
      
      if (shouldReconnect) {
        startBot()
      }
    } else if (connection === 'open') {
      console.log('🟢 Connesso con successo!')
    }
  })

  // 💾 Salva credenziali
  sock.ev.on('creds.update', saveCreds)
}

startBot().catch(console.error)
```

### Gestione Messaggi con LID/JID Fix

```typescript
import makeWASocket, { getSenderLid, toJid } from 'realvare/based'

sock.ev.on('messages.upsert', ({ messages }) => {
  for (const msg of messages) {
    // 🔍 Estrai informazioni mittente
    const info = getSenderLid(msg)
    const jid = toJid(info.lid)
    
    console.log('💬 Messaggio da:', jid)
    console.log('📝 Contenuto:', msg.message?.conversation)
  }
})
```

---

## 📚 Documentazione API

### 🏗️ Metodi Fondamentali

<details>
<summary><strong>📡 makeWASocket(config)</strong></summary>

Crea un socket WhatsApp con configurazione personalizzata.

**Parametri:**
- `config`: Oggetto configurazione con `auth`, `printQRInTerminal`, `logger`, `browser`

**Esempio:**
```typescript
const sock = makeWASocket({
  auth: state,
  printQRInTerminal: true,
  logger: console,
  browser: ['MyBot', 'Chrome', '1.0.0']
})
```
</details>

<details>
<summary><strong>🔐 useMultiFileAuthState(folder)</strong></summary>

Gestisce l'autenticazione multi-file per persistenza delle sessioni.

**Parametri:**
- `folder`: Nome cartella per file autenticazione

**Restituisce:**
- `{ state, saveCreds }`: Stato e funzione per salvare credenziali
</details>

<details>
<summary><strong>🔄 getSenderLid(message) & toJid(lid)</strong></summary>

Funzioni di utilità per gestire la conversione LID/JID.

```typescript
// Estrai LID dal messaggio
const info = getSenderLid(message)

// Converti LID in JID normalizzato
const jid = toJid(info.lid)
```
</details>

### 🎯 Eventi Principali

| Evento | Descrizione | Callback |
|--------|-------------|-----------|
| `connection.update` | Aggiornamenti stato connessione | `(update) => void` |
| `creds.update` | Aggiornamento credenziali | `(creds) => void` |
| `messages.upsert` | Nuovi messaggi/aggiornamenti | `({ messages }) => void` |

---

## ⚙️ Configurazione Avanzata

### 🔧 Opzioni Complete per makeWASocket

```typescript
const sock = makeWASocket({
  // 🔐 Autenticazione
  auth: state,
  
  // 🖥️ UI e Debug
  printQRInTerminal: true,
  logger: console,
  browser: ['VareBot', 'Chrome', '4.0.0'],
  
  // ⏱️ Timeout e Connessione
  defaultQueryTimeoutMs: 60000,
  keepAliveIntervalMs: 30000,
  connectTimeoutMs: 60000,
  retryRequestDelayMs: 250,
  maxMsgRetryCount: 5,
  
  // 🎛️ Comportamento
  markOnlineOnConnect: true,
  syncFullHistory: false,
  fireInitQueries: true,
  generateHighQualityLinkPreview: true
})
```

### 🛡️ Sicurezza e Crittografia

<div align="center">

| Caratteristica | Descrizione |
|----------------|-------------|
| 🔐 **End-to-End Encryption** | Protocollo Signal per messaggi sicuri |
| 🔑 **Key Management** | Generazione e rotazione automatica chiavi |
| 🔍 **Authentication** | Sicurezza tramite QR code |
| 🛡️ **Data Protection** | Archiviazione sicura credenziali |

</div>

---

## 🌐 Supporto e Community

<div align="center">

### 📞 Contatti

<table>
<tr>
<td align="center">
<img src="https://img.shields.io/badge/Email-8a2be2?style=for-the-badge&logo=gmail&logoColor=white"/>
<br>
<a href="mailto:samakavare1@gmail.com">samakavare1@gmail.com</a>
</td>
<td align="center">
<img src="https://img.shields.io/badge/GitHub-8a2be2?style=for-the-badge&logo=github&logoColor=white"/>
<br>
<a href="https://github.com/realvare/based/issues">Issues & Bug Reports</a>
</td>
<td align="center">
<img src="https://img.shields.io/badge/PayPal-8a2be2?style=for-the-badge&logo=paypal&logoColor=white"/>
<br>
<a href="https://www.paypal.me/samakavare">Supporta il Progetto</a>
</td>
</tr>
</table>

</div>

---

## 🙏 Ringraziamenti

<div align="center">

Un ringraziamento speciale agli sviluppatori che hanno reso possibile questo progetto:

| Progetto | Contributo |
|----------|------------|
| [**Baileys**](https://github.com/WhiskeySockets/Baileys) | 🚀 API WhatsApp Web originale |
| [**Yupra**](https://www.npmjs.com/package/@yupra/baileys) | 🔧 Fix LID/JID implementati |
| [**Signal Protocol**](https://signal.org/) | 🔒 Protocollo crittografia end-to-end |

</div>

---

## ⚠️ Disclaimer & Licenza

<div align="center">

### 📋 Nota Legale

> **⚠️ Importante**: Questo progetto non è affiliato con WhatsApp Inc. o Meta Platforms. È uno strumento di terze parti per scopi educativi e di sviluppo.
>
> **🛡️ Uso Responsabile**: Utilizza questa libreria in modo responsabile, evitando spam, attività illegali o violazioni dei Termini di Servizio di WhatsApp.

### 📜 Licenza MIT

**MIT License** © 2025 [realvare](https://github.com/realvare)

Vedi il file [LICENSE](LICENSE) per i dettagli completi.

</div>

---

<div align="center">

<img src="https://i.ibb.co/Cp0SQznC/sam2.png" style="border-radius: 50%; border: 4px solid #8a2be2;" width="160" height="160" alt="realvare profile picture"/>
  
### Creato da [realvare](https://github.com/realvare)

<p>
  <a href="https://github.com/realvare/based">
    <img src="https://img.shields.io/badge/⭐_Stella_il_Progetto-8a2be2?style=for-the-badge&logo=github&logoColor=white"/>
  </a>
  <a href="https://github.com/realvare/based/fork">
    <img src="https://img.shields.io/badge/🔄_Fork_Repository-8a2be2?style=for-the-badge&logo=github&logoColor=white"/>
  </a>
</p>

<p>
  <img src="https://img.shields.io/github/contributors/realvare/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="Contributori"/>
  <img src="https://img.shields.io/github/Ultimo-commit/realvare/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="Ultimo Commit"/>
</p>

**Se questo progetto ti è utile, considera di lasciare una stella e/o [donare](https://paypal.me/samakavare) per supportare lo sviluppo!**

</div>