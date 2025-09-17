<div align="center">

# 🌌 Based - by Sam aka vare

<p align="center">
  <img src="https://img.shields.io/badge/Licenza-MIT-8a2be2.svg?style=for-the-badge&labelColor=2d1b69" alt="Licenza: MIT"/>
  <img src="https://img.shields.io/github/stars/realvare/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="GitHub stelle"/>
  <img src="https://img.shields.io/github/forks/realvare/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="GitHub Forks"/>
</p>

<p align="center">
  <strong>💜 Una libreria WhatsApp Web API moderna, potente e veloce con supporto avanzato per LID/JID</strong>
</p>

<p align="center">
  <a href="#-caratteristiche-principali">Caratteristiche</a> •
  <a href="#-installazione">Installazione</a> •
  <a href="#-guida-rapida">Guida Rapida</a> •
  <a href="#-documentazione-api">Documentazione API</a> •
  <a href="#-messaggi-interattivi-e-bottoni">Messaggi Interattivi</a> •
  <a href="#-fix-lidjid">Fix LID/JID</a> •
  <a href="#-configurazione-avanzata">Configurazione Avanzata</a> •
  <a href="#-supporto-e-community">Supporto</a>
</p>

</div>

---

## ✨ Caratteristiche Principali

Questa libreria, basata su Baileys con miglioramenti specifici, offre un'API intuitiva per interagire con WhatsApp Web. Ecco un riassunto delle funzionalità chiave:

| Categoria | Dettagli |
|-----------|----------|
| **Core Features** | - 🔄 Mappatura intelligente `@lid` e `@s.whatsapp.net` (JID)<br>- 📱 Supporto multi-dispositivo completo<br>- 🔒 Crittografia End-to-End nativa (Protocollo Signal)<br>- ⚡ Codebase TypeScript moderna e ottimizzata |
| **Messaggi e Interazioni** | - 💬 Gestione avanzata di messaggi testo, media e interattivi<br>- 🎛️ Supporto per bottoni, liste, carousel e template<br>- 🖼️ Invio di album, poll e reazioni |
| **Developer Experience** | - 📡 Eventi real-time per connessioni e messaggi<br>- 🛡️ Tipizzazioni TypeScript complete<br>- 📖 Documentazione estesa con esempi<br>- 🔧 API semplici e estendibili |

---

## 🚀 Guida Rapida

Inizia creando un bot semplice. Questa sezione include esempi base per l'autenticazione e la gestione delle connessioni.

### Esempio Base - Avvio Bot

```typescript
import makeWASocket, { DisconnectReason, useMultiFileAuthState, getPerformanceConfig, setPerformanceConfig } from 'realvare/based';

// Configura performance e cache
setPerformanceConfig({
    performance: {
        enableCache: true,
        enableMetrics: true
    },
    debug: {
        enableLidLogging: true,
        logLevel: 'info'
    }
});

async function startBot() {
  // 🔐 Setup autenticazione multi-file per sessioni persistenti
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  
  // 🌐 Creazione del socket con configurazione base
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true, // Stampa QR nel terminale per scansione
    logger: console,
    browser: ['VareBot', 'Chrome', '4.0.0'], // Simula un browser
  });

  // 📡 Gestione aggiornamenti connessione
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('🔴 Connessione chiusa:', lastDisconnect?.error, 'Riconnessione:', shouldReconnect);
      
      if (shouldReconnect) {
        startBot(); // Riconnessione automatica
      }
    } else if (connection === 'open') {
      console.log('🟢 Connesso con successo!');
    }
  });

  // 💾 Salva credenziali automaticamente
  sock.ev.on('creds.update', saveCreds);
}

startBot().catch(console.error);
```

### Gestione Messaggi Base con LID/JID

```typescript
import makeWASocket, { getSenderLid, toJid, getCacheStats, validateJid, Logger } from 'realvare/based';

// ... (codice di creazione sock qui)

sock.ev.on('messages.upsert', ({ messages }) => {
  for (const msg of messages) {
    // 🔍 Estrai LID del mittente con validazione
    const info = getSenderLid(msg);
    
    // ✅ Valida JID prima di usarlo
    const validation = validateJid(info.jid);
    if (!validation.isValid) {
      Logger.error('JID non valido:', validation.error);
      continue;
    }
    
    const jid = toJid(info.lid); // Normalizza in JID
    
    Logger.info('💬 Messaggio da:', jid, 'Valid:', info.isValid);
    console.log('📝 Contenuto:', msg.message?.conversation);
    
    // Rispondi automaticamente solo se valido
    if (info.isValid) {
      sock.sendMessage(jid, { text: 'Messaggio ricevuto!' });
    }
  }
  
  // 📊 Monitora performance cache
  const stats = getCacheStats();
  Logger.performance('Cache stats:', stats);
});
```

---

## 📚 Documentazione API

Questa sezione espande i metodi principali, con esempi dettagliati e parametri. Tutti i metodi sono tipizzati in TypeScript per un'esperienza di sviluppo sicura.

### 🏗️ Metodi Fondamentali

<details>
<summary><strong>📡 makeWASocket(config)</strong></summary>

Crea un'istanza del socket WhatsApp. È il punto di ingresso principale.

**Parametri:**
- `config`: Oggetto con opzioni (vedi sezione Configurazione Avanzata per dettagli completi).

**Restituisce:** Istanza del socket con metodi come `sendMessage` e `ev` per eventi.

**Esempio:**
```typescript
const sock = makeWASocket({
  auth: state,
  printQRInTerminal: true,
  logger: console,
  browser: ['Varebot', 'Chrome', '4.0.0'],
});
```
</details>

<details>
<summary><strong>🔐 useMultiFileAuthState(folder)</strong></summary>

Gestisce l'autenticazione persistente salvando credenziali in file multipli per sicurezza.

**Parametri:**
- `folder`: Stringa, path della cartella per i file di auth (es. 'auth_info').

**Restituisce:**
- `{ state, saveCreds }`: Stato autenticazione e funzione per salvare aggiornamenti.

**Esempio:**
```typescript
const { state, saveCreds } = await useMultiFileAuthState('auth_info');
sock.ev.on('creds.update', saveCreds); // Integra nel socket
```
</details>

<details>
<summary><strong>🔄 getSenderLid(message) & toJid(lid)</strong></summary>

Utilità per gestire LID/JID, risolvendo problemi comuni in gruppi e multi-dispositivo.

**getSenderLid(message):**
- Estrae LID dal messaggio.
- Restituisce: Oggetto con `lid` e altre info mittente.

**toJid(lid):**
- Converte LID in JID normalizzato (es. aggiunge `@s.whatsapp.net`).

**Esempio:**
```typescript
const info = getSenderLid(msg);
const jid = toJid(info.lid);
sock.sendMessage(jid, { text: 'Risposta personalizzata' });
```
</details>

<details>
<summary><strong>📤 sendMessage(jid, content, options)</strong></summary>

Invia messaggi di vari tipi. Supporta testo, media, interattivi.

**Parametri:**
- `jid`: Stringa JID del destinatario.
- `content`: Oggetto messaggio (es. { text: 'Ciao' }).
- `options`: Opzionale, include `quoted`, `mentions`, ecc.

**Esempio Testo Semplice:**
```typescript
await sock.sendMessage(jid, { text: 'Ciao Mondo!' });
```
</details>

### 🎯 Eventi Principali

| Evento              | Descrizione                          | Callback Signature          |
|---------------------|--------------------------------------|-----------------------------|
| `connection.update` | Aggiornamenti stato connessione     | `(update: Partial<ConnectionState>) => void` |
| `creds.update`      | Aggiornamento credenziali           | `() => void`                |
| `messages.upsert`   | Nuovi messaggi o aggiornamenti       | `({ messages: WAMessage[], type: MessageUpsertType }) => void` |
| `messages.update`   | Modifiche a messaggi esistenti       | `(update: WAMessageUpdate[]) => void` |
| `group-participants.update` | Cambiamenti partecipanti gruppo | `(update: GroupParticipantEvent) => void` |

**Esempio Registrazione Evento:**
```typescript
sock.ev.on('group-participants.update', (update) => {
  console.log('Partecipante aggiornato:', update);
});
```

---

## 🎪 Messaggi Interattivi e Bottoni

La libreria supporta messaggi interattivi avanzati, inclusi bottoni, liste, carousel e template. Questi sono utili per bot conversazionali.

### Esempio Carousel (Cards)

Crea messaggi con carte multiple, immagini e bottoni URL.

```typescript
await sock.sendMessage(jid, {
  text: '〖 🌸 〗 Benvenuto in VareBot!',
  title: '',
  footer: '',
  cards: [
    {
      image: { url: 'https://i.ibb.co/hJW7Wwx/varebot.jpg' },
      title: 'by sam aka vare',
      body: '〖 💫 〗 Esplora funzionalità\n〖 🚀 〗 Bot aggiornato',
      footer: '˗ˏˋ ☾ 𝚟𝚊𝚛𝚎𝚋𝚘𝚝 ☽ ˎˊ˗',
      buttons: [
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Sito VareBot', url: 'https://varebot.netlify.app' }) },
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '💻 GitHub', url: 'https://github.com/realvare' }) },
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '💬 WhatsApp', url: 'https://wa.me/393476686131' }) },
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📸 Instagram', url: 'https://instagram.com/samakavare' }) },
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: '📧 Email', url: 'mailto:samakavare1@gmail.com' }) },
      ],
    },
  ],
}, { quoted: m });
```

### Tipi di Messaggi Supportati

#### Messaggi di Testo

```typescript
await sock.sendMessage(jid, { text: 'finchevedotuttoviolaviola', mentions: ['393476686131@s.whatsapp.net'] });
```

#### Messaggi Media

- **Immagine con Caption:**
  ```typescript
  await sock.sendMessage(jid, { image: { url: 'https://i.ibb.co/hJW7WwxV/varebot.jpg' }, caption: 'out soon!' });
  - { image: { url: 'media/menu.jpg' } // link o percorso ↑
  ```

- **Video:**
  ```typescript
  await sock.sendMessage(jid, { video: { url: 'https://example.com/video.mp4' }, caption: 'Video fantastico!', mimetype: 'video/mp4' });
  ```

- **Album (Multi-Media):**
  ```typescript
  await sock.sendMessage(jid, {
    album: [
      { image: { url: 'img1.jpg' }, caption: 'Foto 1' },
      { video: { url: 'vid1.mp4' }, caption: 'Video 1' },
    ],
  });
  ```

#### Messaggi con Bottoni

- **Bottoni Semplici:**
  ```typescript
  await sock.sendMessage(jid, {
    text: 'Scegli un\'opzione:',
    footer: 'Footer',
    buttons: [
      { buttonId: 'cmd2', buttonText: { displayText: 'testo1' }, type: 1 },
      { buttonId: 'cmd2', buttonText: { displayText: 'testo2' }, type: 1 },
    ],
    headerType: 1,
  });
  ```

- **Bottoni con Immagine:**
  ```typescript
  await sock.sendMessage(jid, {
    image: { url: 'https://i.ibb.co/hJW7WwxV/varebot.jpg' },
    caption: 'Messaggio con bottoni e immagine',
    footer: 'vare ✧ bot',
    buttons: [
      { buttonId: 'cmd', buttonText: { displayText: 'testo1' }, type: 1 },
    ],
  });
  ```

#### Messaggi Interattivi Avanzati

- **Con Quick Reply e URL:**
  ```typescript
  await sock.sendMessage(jid, {
    text: 'Messaggio interattivo',
    title: 'Titolo',
    footer: 'Footer',
    interactiveButtons: [
      { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'testo1', id: 'cmd1' }) },
      { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Visita Sito', url: 'varebot.netlify.app' }) },
      { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: 'Copia Codice', copy_code: 'ABC123' }) },
    ],
  });
  ```

- **Liste Sezioni:**
  ```typescript
  await sock.sendMessage(jid, {
    // funziona solo in privato
    text: 'Questa è una lista!',
    footer: 'purplepurplepurple!',
    title: 'Titolo Lista',
    buttonText: 'Visualizza Lista',
    sections: [
      { title: 'Sezione 1', rows: [{ title: 'Opzione 1', rowId: 'opt1' }, { title: 'Opzione 2', rowId: 'opt2', description: 'Descrizione' }] },
    ],
  });
  ```

---

## 🔧 Fix LID/JID nel Proprio Main e Handler

Il supporto LID/JID è un punto di forza di questa libreria, risolvendo problemi comuni come l'identificazione mittenti in gruppi. Ecco come integrarlo nel tuo codice principale e handler.

### Best Practices per LID/JID

- **Nel Main (Avvio Bot):** Usa `getSenderLid` e `toJid` per normalizzare ID prima di qualsiasi operazione.
- **In Handler Messaggi:** Integra nei listener per eventi come `messages.upsert` per gestire mittenti correttamente.
- **Problemi Comuni e Fix:**
  - **LID Mancante in Gruppi:** Usa `getSenderLid` per estrarre da messaggi.
  - **Conversione JID:** Sempre converti con `toJid` per evitare errori in `sendMessage`.
  - **Multi-Dispositivo:** Assicura compatibilità impostando `syncFullHistory: true` in config.

### Esempio Integrato in Main

```typescript
// Nel tuo file main
import makeWASocket, { getSenderLid, toJid } from 'realvare/based';
// ... (autenticazione e creazione sock)

sock.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0];
  if (!msg.message) return;

  const info = getSenderLid(msg);
  const senderJid = toJid(info.lid); // Fix LID -> JID

  // Esempio: Rispondi solo se JID valido
  if (senderJid.endsWith('@s.whatsapp.net')) {
    await sock.sendMessage(senderJid, { text: `Ciao da ${senderJid}!` }, { quoted: msg });
  }
});
```

### Esempio Handler Personalizzato

Crea un handler separato per modularità:

```typescript
// handler.js
export async function handleMessage(sock, msg) {
  const info = getSenderLid(msg);
  const jid = toJid(info.lid);
  
  // Log e risposta
  console.log(`Messaggio da ${jid}`);
  await sock.sendMessage(jid, { text: 'Handler attivato!' });
}

// Nel main: sock.ev.on('messages.upsert', ({ messages }) => handleMessage(sock, messages[0]));
```

**Consiglio:** Testa in gruppi per verificare LID, poiché Baileys upstream ha migliorato il supporto nativo nel 2025, ma i fix personalizzati qui garantiscono retrocompatibilità.

---

## ⚡ Nuove Funzionalità Performance (v2.5.0+)

### 🚀 Cache Intelligente LID/JID

La libreria ora include un sistema di cache avanzato per ottimizzare le conversioni LID/JID:

```typescript
import { getCacheStats, clearCache, setPerformanceConfig } from 'realvare/based';

// Configura cache personalizzata
setPerformanceConfig({
    cache: {
        lidCache: {
            ttl: 10 * 60 * 1000, // 10 minuti
            maxSize: 15000
        }
    }
});

// Monitora performance
const stats = getCacheStats();
console.log('Cache LID:', stats.lidCache.size, '/', stats.lidCache.maxSize);

// Pulisci cache se necessario
clearCache();
```

### 🛡️ Validazione JID Avanzata

```typescript
import { validateJid, Logger } from 'realvare/based';

const jid = '1234567890@s.whatsapp.net';
const validation = validateJid(jid);

if (validation.isValid) {
    Logger.info('JID valido:', jid);
} else {
    Logger.error('JID non valido:', validation.error);
}
```

### 📊 Logging Condizionale

```typescript
import { Logger, setPerformanceConfig } from 'realvare/based';

// Configura logging
setPerformanceConfig({
    debug: {
        enableLidLogging: true,
        enablePerformanceLogging: true,
        logLevel: 'debug' // 'error', 'warn', 'info', 'debug'
    }
});

// Usa logger condizionale
Logger.debug('Debug info');
Logger.performance('Performance metrics');
Logger.error('Error occurred');
```

### 🔧 Configurazione Performance

```typescript
import { setPerformanceConfig, getPerformanceConfig } from 'realvare/based';

// Configurazione completa
setPerformanceConfig({
    performance: {
        enableCache: true,
        enableMetrics: true,
        batchSize: 100,
        maxRetries: 3
    },
    cache: {
        lidCache: { ttl: 5 * 60 * 1000, maxSize: 10000 },
        jidCache: { ttl: 5 * 60 * 1000, maxSize: 10000 }
    },
    debug: {
        enableLidLogging: false,
        logLevel: 'warn'
    }
});

// Ottieni configurazione corrente
const config = getPerformanceConfig();
console.log('Cache abilitata:', config.performance.enableCache);
```

---

## ⚙️ Configurazione Avanzata

Personalizza il socket per performance e comportamento.

### 🔧 Opzioni Complete per makeWASocket

```typescript
const sock = makeWASocket({
  // 🔐 Autenticazione
  auth: state,
  
  // 🖥️ UI e Debug
  printQRInTerminal: true,
  logger: console, // Usa Pino per logging avanzato
  browser: ['VareBot', 'Chrome', '4.0.0'],
  
  // ⏱️ Timeout e Connessione
  defaultQueryTimeoutMs: 60000,
  keepAliveIntervalMs: 30000,
  connectTimeoutMs: 60000,
  retryRequestDelayMs: 250,
  maxMsgRetryCount: 5,
  
  // 🎛️ Comportamento
  markOnlineOnConnect: true,
  syncFullHistory: false, // Attiva per sync completo (consuma dati)
  fireInitQueries: true,
  generateHighQualityLinkPreview: true, // Anteprime link HD
});
```

### 🛡️ Sicurezza e Crittografia

| Caratteristica            | Descrizione                              |
|---------------------------|------------------------------------------|
| 🔐 End-to-End Encryption | Protocollo Signal per messaggi sicuri   |
| 🔑 Key Management        | Generazione/rotazione automatica chiavi |
| 🔍 Authentication        | Sicurezza tramite QR code o pairing code|
| 🛡️ Data Protection       | Archiviazione sicura credenziali locali |

**Nota:** Evita di condividere file auth per prevenire compromissioni.

---

## 🌐 Supporto e Community

Unisciti alla community per aiuto e contributi.

### 📞 Contatti e Risorse

| Canale          | Link/Info                              |
|-----------------|----------------------------------------|
| **Email**       | [samakavare1@gmail.com](mailto:samakavare1@gmail.com) |
| **GitHub Issues**| [Segnala Bug](https://github.com/realvare/based/issues) |
| **PayPal**      | [Dona](https://www.paypal.me/samakavare) |
| **Canale whatsapp**| [Canale](https://www.whatsapp.com/channel/0029VbB41Sa1Hsq1JhsC1Z1z) |

---

## 🙏 Ringraziamenti

Grazie ai progetti che ispirano Based:

| Progetto                  | Contributo                              |
|---------------------------|-----------------------------------------|
| [Baileys](https://github.com/WhiskeySockets/Baileys) | API WhatsApp Web originale             |
| [Yupra](https://www.npmjs.com/package/@yupra/baileys) | Fix LID/JID avanzati                   |
| [Signal Protocol](https://signal.org/) | Crittografia end-to-end                |

---

## ⚠️ Disclaimer & Licenza

### 📋 Nota Legale

⚠️ **Importante**: Non affiliato a WhatsApp Inc. o Meta. Uso educativo/sviluppo solo.

🛡️ **Uso Responsabile**: Evita spam, violazioni ToS WhatsApp. Rischio ban account.

### 📜 Licenza MIT

MIT License © 2025 [realvare](https://github.com/realvare)

Vedi [LICENSE](LICENSE) per dettagli.

---

<div align="center">

<img src="https://i.ibb.co/Cp0SQznC/sam2.png" width="160" height="160" alt="realvare profile picture"/>

### Creato da [realvare](https://github.com/realvare)

<p>
  <a href="https://github.com/realvare/based"><img src="https://img.shields.io/badge/⭐_Stella_il_Progetto-8a2be2?style=for-the-badge&logo=github&logoColor=white"/></a>
  <a href="https://github.com/realvare/based/fork"><img src="https://img.shields.io/badge/🔄_Fork_Repository-8a2be2?style=for-the-badge&logo=github&logoColor=white"/></a>
</p>

<p>
  <img src="https://img.shields.io/github/contributors/realvare/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="Contributori"/>
  <img src="https://img.shields.io/github/last-commit/realvare/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="Ultimo Commit"/>
</p>

**Se ti è stato utile, valuta di lasciare una stella o di [donare](https://paypal.me/samakavare)!**

</div>