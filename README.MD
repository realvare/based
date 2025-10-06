<div align="center">

![Wave](https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=24&height=150&section=header&text=based&fontSize=60&fontColor=ffffff&animation=fadeIn&fontAlignY=35)
<img src="https://i.gifer.com/YdBN.gif" width="200">

![Retro](https://readme-typing-svg.herokuapp.com?font=VT323&size=24&duration=2500&pause=10000&color=8A2BE2&center=true&vCenter=true&width=250&height=25&lines=$+by+Sam+aka+Vare)
<br>
<p align="center">
  <img src="https://img.shields.io/npm/v/@realvare/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="Versione NPM">
  <img src="https://img.shields.io/npm/dm/@realvare/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="Download NPM">
  <img src="https://img.shields.io/badge/Licenza-MIT-8a2be2.svg?style=for-the-badge&labelColor=2d1b69" alt="Licenza MIT">
  <img src="https://img.shields.io/github/stars/realvare/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="GitHub Stelle">
  <img src="https://img.shields.io/github/forks/realvare/based?style=for-the-badge&color=8a2be2&labelColor=2d1b69" alt="GitHub Forks">
</p>
<p align="center">
  <a href="#-caratteristiche-principali"><img src="https://img.shields.io/badge/_Caratteristiche-8a2be2?style=flat-square&logo=github&logoColor=white"/></a>&nbsp;&nbsp;
  <a href="#-installazione"><img src="https://img.shields.io/badge/_Installazione-8a2be2?style=flat-square&logo=npm&logoColor=white"/></a>&nbsp;&nbsp;
  <a href="#-guida-rapida"><img src="https://img.shields.io/badge/_Guida_Rapida-8a2be2?style=flat-square&logo=rocket&logoColor=white"/></a>&nbsp;&nbsp;
  <a href="#-documentazione-api"><img src="https://img.shields.io/badge/_Documentazione_API-8a2be2?style=flat-square&logo=book&logoColor=white"/></a>&nbsp;&nbsp;
  <a href="#-supporto-e-community"><img src="https://img.shields.io/badge/_Supporto-8a2be2?style=flat-square&logo=teamspeak&logoColor=white"/></a>
</p>
  <img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&weight=600&size=20&duration=4000&pause=2500&color=8A2BE2&center=true&vCenter=true&width=800&lines=💜+Una+libreria+WhatsApp+Web+API+moderna%2C+potente+e+veloce;🔄+Con+supporto+per+LID%2FJID+e+multi-dispositivo;">

----

</div>

## ✨ Caratteristiche Principali

<p align="center">
  <img src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&weight=600&size=18&duration=2500&pause=2500&color=8A2BE2&center=true&vCenter=true&width=600&lines=🚀+Potente+e+Intuitiva;🔧+Basata+su+Baileys+con+Miglioramenti" alt="Features">
</div>

<br>

Questa libreria, basata su Baileys con miglioramenti specifici, offre un'API intuitiva per interagire con WhatsApp Web. Ecco un riassunto delle funzionalità chiave:

<table align="center">
  <tr>
    <td align="center" width="25%">
      <h3>🔄 Core Features</h3>
      <p>• Mappatura intelligente LID/JID<br>• Supporto multi-dispositivo<br>• Crittografia E2E Signal<br>• TypeScript moderno</p>
    </td>
    <td align="center" width="25%">
      <h3>💬 Messaggi</h3>
      <p>• Testo, media, interattivi<br>• Bottoni, liste, carousel<br>• Album, poll, reazioni<br>• Template avanzati</p>
    </td>
    <td align="center" width="25%">
      <h3>🛠️ Developer</h3>
      <p>• Eventi real-time<br>• TypeScript completo<br>• Documentazione estesa<br>• API estendibili</p>
    </td>
    <td align="center" width="25%">
      <h3>⚡ Performance</h3>
      <p>• Riconnessione intelligente<br>• Cache avanzata TTL<br>• Monitoraggio prestazioni</p>
    </td>
  </tr>
</table>
<p align="center">
<img src="https://64.media.tumblr.com/13bc9e3c3b332dfc008cb4b9e8571558/2a577b39b15547dc-cc/s400x600/3db051b3117b695a61ad8e0b686f2774b971d210.gifv" width="800">


## 🚀 Guida Rapida

- Questa sezione include esempi base per l'autenticazione e la gestione delle connessioni.

### Esempio Base - Avvio Bot

```typescript
import makeWASocket, { DisconnectReason, useMultiFileAuthState, getPerformanceConfig, setPerformanceConfig } from '@realvare/based';

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
        printQRInTerminal: true,
        logger: console,
        browser: ['VareBot', 'Chrome', '4.0.0'],
    });

    // Sistema di riconnessione migliorato
    let reconnectAttempts = 0;
    const config = getPerformanceConfig();

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                reconnectAttempts++;
                const delay = Math.min(
                    config.performance.retryDelay * Math.pow(
                        config.performance.retryBackoffMultiplier,
                        reconnectAttempts - 1
                    ),
                    config.performance.maxRetryDelay
                );

                console.log(`🔄 Tentativo di riconnessione ${reconnectAttempts}/${config.performance.maxRetries} tra ${delay}ms`);

                if (reconnectAttempts <= config.performance.maxRetries) {
                    setTimeout(startBot, delay);
                } else {
                    console.log('❌ Numero massimo di tentativi di riconnessione raggiunto');
                }
            }
        } else if (connection === 'open') {
            console.log('🟢 Connesso con successo!');
            reconnectAttempts = 0;
        }
    });

    sock.ev.on('creds.update', saveCreds);
}startBot().catch(console.error);
```

### Esempio Anti-Ban - Configurazione consigliata per Evitare Ban

```typescript
import makeWASocket, { DisconnectReason, useMultiFileAuthState, getPerformanceConfig, setPerformanceConfig, getSenderLid, validateJid } from '@realvare/based';

// Configurazione anti-ban per ridurre rischi ban da acks impropri
setPerformanceConfig({
    performance: {
        enableCache: true,          // Abilita cache TTL per ridurre chiamate API
        enableMetrics: true,        // Monitora performance per evitare sovraccarico
        batchSize: 50,              // Elabora messaggi in batch più piccoli per simulare velocità umana
        maxRetries: 5,              // Limita tentativi retry per evitare comportamento aggressivo
        retryDelay: 5000,           // Ritardo base in ms per riconnessioni
        retryBackoffMultiplier: 1.5,// Backoff esponenziale per spaziare retry
        maxRetryDelay: 60000,       // Ritardo massimo per evitare riconnessioni rapide
        maxMsgRetryCount: 3         // Limita tentativi rispedizione messaggi
    }
});

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: console,
        browser: ['YourBotName', 'Chrome', '4.0.0'], // Personalizza fingerprint browser
        markOnlineOnConnect: false, // Cruciale: Previene apparire sempre online, riduce rischio ban
        syncFullHistory: false      // Evita sync dati non necessari che potrebbero segnalare attività
    });

    let reconnectAttempts = 0;
    const config = getPerformanceConfig();

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                reconnectAttempts++;
                const delay = Math.min(
                    config.performance.retryDelay * Math.pow(
                        config.performance.retryBackoffMultiplier,
                        reconnectAttempts - 1
                    ),
                    config.performance.maxRetryDelay
                );

                console.log(`Reconnecting attempt ${reconnectAttempts}/${config.performance.maxRetries} in ${delay}ms`);

                if (reconnectAttempts <= config.performance.maxRetries) {
                    setTimeout(startBot, delay);
                } else {
                    console.log('Max reconnection attempts reached');
                }
            }
        } else if (connection === 'open') {
            console.log('Connected successfully!');
            reconnectAttempts = 0;
        }
    });

    // Monitora acks tramite aggiornamenti messaggi per garantire gestione corretta
    sock.ev.on('messages.update', (updates) => {
        for (const update of updates) {
            if (update.update.status) {
                console.log(`Message ${update.key.id} status: ${update.update.status}`); // Traccia acks (1=sent, 2=delivered, 3=read)
                // Aggiungi logica personalizzata se necessaria, ma evita override predefiniti per prevenire detection
            }
        }
    });

    // Utilità LID/JID avanzate per stabilità acks
    sock.ev.on('messages.upsert', ({ messages }) => {
        for (const msg of messages) {
            const info = getSenderLid(msg);
            const validation = validateJid(info.jid);
            if (validation.isValid) {
                // Elabora e ack in sicurezza
                console.log(`Valid JID: ${info.jid}, LID: ${info.lid}`);
            } else {
                console.warn(`Invalid JID detected: ${info.jid}`);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

startBot().catch(console.error);
```

## 📊 Gestione Avanzata Cache

La libreria ora include un sistema di cache avanzato con gestione automatica della memoria e TTL configurabile:

```typescript
import { CacheManager } from 'based/lib/Utils/cache-manager';

// Esempio di utilizzo della cache
const cache = CacheManager;

// Salva un valore nella cache
cache.set('lidCache', 'chiave', 'valore', 300); // TTL di 300 secondi

// Recupera un valore
const valore = cache.get('lidCache', 'chiave');

// Ottieni statistiche della cache
const stats = cache.getStats('lidCache');
console.log('Statistiche cache:', stats);
```

### Configurazione Cache Avanzata

La cache può essere configurata con varie opzioni per ottimizzare le prestazioni:

```typescript
setPerformanceConfig({
    cache: {
        lidCache: {
            ttl: 5 * 60 * 1000, // Tempo di vita delle entries
            maxSize: 10000,      // Numero massimo di entries
            cleanupInterval: 2 * 60 * 1000 // Intervallo pulizia
        }
    },
    performance: {
        memoryThreshold: 0.85 // Soglia per pulizia automatica
    }
});
```
## 🔍 Risoluzione Problemi

### Problemi di Connessione
- La libreria ora implementa un sistema di retry con backoff esponenziale
- Monitoraggio automatico dello stato della connessione
- Tentativi di riconnessione configurabili

### Gestione Memoria
- Monitoraggio automatico dell'uso della memoria
- Pulizia cache automatica quando necessario
- TTL configurabile per ogni tipo di cache

### Logging Avanzato
```typescript
setPerformanceConfig({
    debug: {
        enableLidLogging: true,
        enablePerformanceLogging: true,
        logLevel: 'debug'
    }
});
```

### Gestione Messaggi Base con LID/JID

```typescript
import makeWASocket, { getSenderLid, toJid, getCacheStats, validateJid, Logger } from '@realvare/based';

// ... (codice di creazione sock qui)

conn.ev.on('messages.upsert', ({ messages }) => {
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
      conn.sendMessage(jid, { text: 'Messaggio ricevuto!' });
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
conn.ev.on('creds.update', saveCreds); // Integra nel socket
```
</details>

<details>
<summary><strong>🔄 getSenderLid(message) & toJid(lid)</strong></summary>

Utilità per gestire LID/JID, risolvendo problemi comuni in gruppi e multi-dispositivo.

**getSenderLid(message):**
- Estrae LID dal messaggio.
- Restituisce: Oggetto con `lid` e altre info mittente.

**toJid(lid):**
- Converte LID in JID normalizzato (es. prende pn e aggiunge `@s.whatsapp.net`).

**Esempio:**
```typescript
const info = getSenderLid(msg);
const jid = toJid(info.lid);
conn.sendMessage(jid, { text: 'we ridin porsches in the rain' });
```
</details>

<details>
<summary><strong>📤 sendMessage(jid, content, options)</strong></summary>

Invia messaggi di vari tipi. Supporta testo, media, interattivi.

**Parametri:**
- `jid`: Stringa JID del destinatario.
- `content`: Oggetto messaggio (es. { text: 'finche vedo tutto violaviola' }).
- `options`: Opzionale, include `quoted`, `mentions`, ecc.

**Esempio Testo Semplice:**
```typescript
await conn.sendMessage(jid, { text: 'bankai!' });
```
</details>

### 🎯 Eventi Principali

| Evento              | Descrizione                          | Callback Signature                  |
|---------------------|--------------------------------------|-------------------------------------|
| `connection.update` | Aggiornamenti stato connessione      | `(update: Partial<ConnectionState>) => void` |
| `creds.update`      | Aggiornamento credenziali            | `() => void`                        |
| `messages.upsert`   | Nuovi messaggi o aggiornamenti       | `({ messages: WAMessage[], type: MessageUpsertType }) => void` |
| `messages.update`   | Modifiche a messaggi esistenti       | `(update: WAMessageUpdate[]) => void` |
| `group-participants.update` | Cambiamenti partecipanti gruppo | `(update: GroupParticipantEvent) => void` |

**Esempio Registrazione Evento:**
```typescript
conn.ev.on('group-participants.update', (update) => {
  console.log('Partecipante aggiornato:', update);
});
```

---

## 🎪 Messaggi e Funzionalità Interattive

### Messaggi Base

#### Testo con Formattazione
```typescript
// Testo con formattazione e menzioni
await conn.sendMessage(jid, { 
    text: `*Bold* _italic_ ~strikethrough~ \`monospace\`\n@menzione`, 
    mentions: ['393476686131@s.whatsapp.net'] 
});
```

#### Media Base
```typescript
// Immagine
await conn.sendMessage(jid, { 
    image: { url: './media/varebot.jpg' }, // Supporta anche Buffer
    caption: 'zwag'
});

// Video
await conn.sendMessage(jid, { 
    video: { url: './media/oppastoppa.mp4' },
    caption: 'brrrr',
    gifPlayback: false // true per riprodurre come GIF
});

// Audio
await conn.sendMessage(jid, { 
    audio: { url: './media/audio.mp3' },
    mimetype: 'audio/mp4',
    ptt: true // true per messaggio vocale, false per audio normale
});

// Documento
await conn.sendMessage(jid, { 
    document: { url: './media/doc.pdf' },
    mimetype: 'application/pdf',
    fileName: 'documento.pdf'
});
```

#### Media Avanzati
```typescript
// Album (Multiple immagini)
await conn.sendMessage(jid, {
    album: imageBuffers.map(buffer => ({ image: buffer })),
    caption: 'ts gettin real'
});

// Sticker
await conn.sendMessage(jid, { 
    sticker: { url: './stickers/sticker.webp' }
});

// Messaggio con posizione
await conn.sendMessage(jid, { 
    location: { 
        degreesLatitude: 45.4642, 
        degreesLongitude: 9.1900,
        name: "Milano",
        address: "Piazza del Duomo, Milano"
    } 
});
```

#### Messaggi Interattivi
Questi messaggi includono elementi interattivi come bottoni, liste e template.

##### Messaggi con Bottoni Semplici
Invia bottoni di risposta rapida.

```typescript
await conn.sendMessage(jid, {
  text: 'Scegli un\'opzione:',
  footer: 'Footer',
  buttons: [
    { buttonId: 'cmd1', buttonText: { displayText: 'testo1' }, type: 1 },
    { buttonId: 'cmd2', buttonText: { displayText: 'testo2' }, type: 1 },
  ],
  headerType: 1,
});
```

##### Messaggi con Bottoni e Immagine
Combina immagine con bottoni.

```typescript
await conn.sendMessage(jid, {
  image: { url: 'https://i.ibb.co/hJW7WwxV/varebot.jpg' },
  caption: 'Messaggio con bottoni e immagine',
  footer: 'vare ✧ bot',
  buttons: [
    { buttonId: 'cmd', buttonText: { displayText: 'testo1' }, type: 1 },
  ],
});
```

##### Messaggi Liste
Invia una lista di opzioni (solo in privato).

```typescript
await conn.sendMessage(jid, {
  text: 'Questa è una lista!',
  footer: 'purplepurplepurple!',
  title: 'Titolo Lista',
  buttonText: 'Visualizza Lista',
  sections: [
    { 
      title: 'Sezione 1', 
      rows: [ 
        { title: 'Opzione 1', rowId: 'opt1',description: 'Descrizionex' }, 
        { title: 'Opzione 2', rowId: 'opt2', description: 'Descrizioney' } 
      ] 
    },
  ],
});
```

##### Carousel e Card Messages
Il carousel è un tipo speciale di messaggio che permette di mostrare una serie di card scorrevoli.
```typescript
await conn.sendMessage(jid, {
  text: '〖 🌸 〗 Benvenuto in VareBot!',
  title: '',
  footer: '',
  cards: [
    {
      image: { url: 'https://i.ibb.co/hJW7WwxV/varebot.jpg' },
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

#### Altri Messaggi
```typescript
// Messaggio con citazione
await conn.sendMessage(jid, { 
    text: 'bang bang',
    quoted: quotedMessage // Il messaggio da quotare/rispondere/citare
});

// Messaggi Contatto
await conn.sendMessage(jid, { 
  contacts: { 
    displayName: 'Sam aka vare', 
    contacts: [{ vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:Sam aka vare\nTEL;waid=393476686131:+39 347 6686131\nEND:VCARD' }] 
  } 
});

// Messaggi Poll (Sondaggio)
await conn.sendMessage(jid, { 
  poll: { 
    name: 'Anime preferito?', 
    values: ['Aot', 'Bleach', 'Death note'], 
    selectableCount: 1 // quante scelte possibili
  } 
});

// Messaggi Ephemeral (Che si Autodistruggono)
await conn.sendMessage(jid, { 
  text: "Questo messaggio si autodistruggerà {speriamo come israele}"
}, {
  ephemeralExpiration: 7 * 24 * 60 * 60
});

// Messaggi con Risposta a Visualizzazione
await conn.sendMessage(
    jid,
    {
        video: { url: './media/hado90.mp4' },
        viewOnce: true,
        caption: 'tuff'
    }
)

// Messaggi di Status (Stato)
await conn.sendMessage('status@broadcast', {
    text: 'god forgive em'
}, {
    statusJidList: contatti
});

// Invia uno stato con media (visibile solo a contatti selezionati)
await conn.sendMessage('status@broadcast', {
    image: { url: './media/menu/menu.jpg' },
    caption: 'all i need in this life of sin is-',
    }, {
    statusJidList: contatti
});

// Messaggi Newsletter
await conn.sendMessage('120363418582531215@newsletter', {
    text: 'ay yo',
    });

// Messaggi di Pagamento
await conn.sendMessage(jid, {
    requestPayment: {
        currency: 'EUR',
        amount1000: 5000,
        requestFrom: '393514357738@s.whatsapp.net',
        note: 'js gimme my money' // https://paypal.me/samakavare
    }
});

// Messaggi di Chiamata
await conn.sendMessage(jid, {
    call: {
        callKey: {
            fromMe: true,
            id: Date.now().toString(),
            remoteJid: jid
        },
        type: 'ACCEPT'  // 'MISSED', 'OFFER', 'ACCEPT', 'REJECT'..
    }
});

// Messaggi con Live Location
await conn.sendMessage(jid, {
    liveLocation: {
        degreesLatitude: 45.4642,
        degreesLongitude: 9.1900,
        accuracyInMeters: 50,
        speedInMps: 5,
        degreesClockwiseFromMagneticNorth: 359,
        caption: "kmt im mean kiss my teeth",
        sequenceNumber: 21,
        timeOffset: 2000,
    }
});

// Messaggi di Ordini/Prodotti
await conn.sendMessage(jid, {
    order: {
        id: 'bysamakavare',
        thumbnail: buffer, // immagine buffer
        itemCount: 67,
        surface: 'CATALOG',
        title: 'heh',
        text: 'gotta make it happen',
        seller: '393514357738@s.whatsapp.net',
        amount: 67000,
        currency: 'EUR'
    }
});

// Prodotto
await conn.sendMessage(jid, {
    product: {
        productImage: { url: './media/menu/menu.jpg' },
        productId: 'prod123',
        title: 'titolo',
        description: 'Desc',
        currency: 'EUR',
        priceAmount1000: 67000,
        retailerId: 'bysamakavare',
        url: 'https://varebot.netlify.app',
    },
    businessOwnerJid: m.sender
});

 // Messaggi con Intestazione Personalizzata
await conn.sendMessage(jid, {
    text: 'dilemma',
            contextInfo: {
                externalAdReply: {
                    title: `titolo`,
                    body: `desc`,
                    thumbnailUrl: 'https://i.ibb.co/hJW7WwxV/sam.jpg', // immagine
                    sourceUrl: '', // sconsiglio di metterla
                    mediaType: 1,
                    renderLargerThumbnail: false
                }
            }
});
>  nota: non usate showAdAttribution o tenetela in false, poiche con essa attiva non viene visualizzato il messaggio
```

### Gestione delle Risposte

Per gestire le risposte ai messaggi interattivi, usa il listener `messages.upsert` e controlla il tipo di risposta:

```typescript
conn.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    
    // Risposta a bottoni
    if (msg.message?.buttonsResponseMessage) {
        const selectedId = msg.message.buttonsResponseMessage.selectedButtonId;
        console.log(`Bottone selezionato: ${selectedId}`);
    }
    
    // Risposta a liste
    if (msg.message?.listResponseMessage) {
        const selectedId = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        console.log(`Opzione selezionata: ${selectedId}`);
    }
    
    // Risposta a sondaggio
    if (msg.message?.pollResponseMessage) {
        const selectedOptions = msg.message.pollResponseMessage.selectedOptions;
        console.log('Opzioni selezionate:', selectedOptions);
    }
});
```

### 🎭 Funzionalità Gruppi

#### Gestione Base Gruppi

```typescript
// Creazione gruppo - il jid sta per l'aggiunta di partecipanti
const group = await conn.groupCreate('Angels 🩸🕊️', ['user@s.whatsapp.net']);

// Ottenere info gruppo
const metadata = await conn.groupMetadata(jid);

// Ottenere codice invito
const code = await conn.groupInviteCode(jid);

// Revocare link invito
await conn.groupRevokeInvite(jid);

// Lasciare gruppo
await conn.groupLeave(jid);
```

#### Gestione Partecipanti

```typescript
// Aggiungere partecipanti
await conn.groupParticipantsUpdate(
    jid, 
    ['user@s.whatsapp.net'],
    'add'
);

// Rimuovere partecipanti
await conn.groupParticipantsUpdate(
    jid,
    ['user@s.whatsapp.net'],
    'remove'
);

// Promuovere ad admin
await conn.groupParticipantsUpdate(
    jid,
    ['user@s.whatsapp.net'],
    'promote'
);

// Degradare da admin
await conn.groupParticipantsUpdate(
    jid,
    ['user@s.whatsapp.net'],
    'demote'
);
```

#### Impostazioni Gruppo

```typescript
// Modificare nome gruppo
await conn.groupUpdateSubject(jid, 'Nuovo Nome');

// Modificare descrizione
await conn.groupUpdateDescription(jid, 'Nuova descrizione');

// Modificare foto gruppo
await conn.updateProfilePicture(jid, { url: './img/group.jpg' });

// Rimuovere foto gruppo
await conn.removeProfilePicture(jid);

// Impostare gruppo come solo admin
await conn.groupSettingUpdate(jid, 'announcement');

// Impostare gruppo come aperto a tutti
await conn.groupSettingUpdate(jid, 'not_announcement');

// Impostare chi può modificare le info - solo admin
await conn.groupSettingUpdate(jid, 'locked');

// Impostare chi può modificare le info - tutti
await conn.groupSettingUpdate(jid, 'unlocked');

// Impostare chi può aggiungere membri - solo admin
await conn.groupMemberAddMode(jid, 'admin_add');

// Impostare chi può aggiungere membri - tutti
await conn.groupMemberAddMode(jid, 'all_member_add');

// Attivare/disattivare messaggi temporanei (24 ore)
await conn.groupToggleEphemeral(jid, 86400); // secondi

// Disattivare messaggi temporanei
await conn.groupToggleEphemeral(jid, 0);

// Attivare/disattivare modalità approvazione adesioni
await conn.groupJoinApprovalMode(jid, 'on'); // richiede approvazione
await conn.groupJoinApprovalMode(jid, 'off'); // aperta

// Ottenere tutti i gruppi
const groups = await conn.groupFetchAllParticipating();

// Ottenere inviti pendenti
const invites = await conn.groupGetInviteInfo(code);

// Accettare invito gruppo
await conn.groupAcceptInvite(code);

// Ottenere info gruppo da link
const groupInfo = await conn.groupGetInviteInfo('https://chat.whatsapp.com/ABC123');

```

#### Messaggi Gruppo Avanzati

```typescript
// Messaggio con menzione multipla
await conn.sendMessage(jid, {
    text: '@user1 @user2 @user3',
    mentions: [user1, user2, user3],
    contextInfo: {
        mentionedJid: [user1, user2, user3]
    }
});

// Messaggio con ricerca google
await conn.sendMessage(jid, {
    text: 'ZWAG',
    contextInfo: {
        forwardingScore: 999,
        isForwarded: true
    }
});

```

// Ascolta modifiche impostazioni
conn.ev.on('group-settings.update', async ({ jid, announce, restrict }) => {
    if(announce !== undefined) {
        await conn.sendMessage(jid, {
            text: `Il gruppo è stato impostato come ${announce ? 'solo admin' : 'tutti'}`
        });
    }
    if(restrict !== undefined) {
        await conn.sendMessage(jid, {
            text: `Le info gruppo possono essere modificate da ${restrict ? 'solo admin' : 'tutti'}`
        });
    }
});
```
```
---

## 🔧 Fix LID/JID nel Proprio Main e Handler

*Il supporto LID/JID è un punto di forza di questa libreria, risolvendo problemi comuni come l'identificazione mittenti in gruppi e chat privata. Ecco come integrarlo nel tuo codice principale e handler.*

### Best Practices per LID/JID

- **decodeJid(jid)**: Funzione principale per normalizzare JID/LID. Gestisce:
  - Formati con `:\d+@` (usa `jidNormalizedUser`).
  - Decodifica user/server in `${user}@${server}`.
  - Converti `@lid` in `@s.whatsapp.net`.
  
  **Esempio di Implementazione (da main.js):**
  ```typescript
  decodeJid: (jid) => {
      if (!jid) return jid;
      let decoded = jid;
      if (/:\d+@/gi.test(jid)) {
          decoded = jidNormalizedUser(jid);
      }
      if (typeof decoded === 'object' && decoded.user && decoded.server) {
          decoded = `${decoded.user}@${decoded.server}`;
      }
      if (decoded.endsWith('@lid')) {
          decoded = decoded.replace('@lid', '@s.whatsapp.net');
      }
      return decoded;
  },
  ```
  Usa `conn.decodeJid(jid)` ovunque per normalizzare IDs (es. sender, participant, quoted).

- **Monkey-Patch per groupParticipantsUpdate**: Corregge aggiornamenti partecipanti gruppo trovando il JID reale dal metadata.
  
  **Esempio (da handler.js):**
  ```typescript
  if (!this.originalGroupParticipantsUpdate) {
      this.originalGroupParticipantsUpdate = this.groupParticipantsUpdate;
      this.groupParticipantsUpdate = async function(chatId, users, action) {
          try {
              let metadata = global.groupCache.get(chatId);
              if (!metadata) {
                  metadata = await fetchGroupMetadataWithRetry(this, chatId);
                  if (metadata) global.groupCache.set(chatId, metadata);
              }
              if (!metadata) {
                  console.error('[ERRORE] Nessun metadato del gruppo disponibile per un aggiornamento sicuro');
                  return this.originalGroupParticipantsUpdate.call(this, chatId, users, action);
              }

              const correctedUsers = users.map(userJid => {
                  const decoded = this.decodeJid(userJid);
                  const phone = decoded.split('@')[0].split(':')[0];
                  const participant = metadata.participants.find(p => {
                      const pId = this.decodeJid(p.id || p.jid || '');
                      const pPhone = pId.split('@')[0].split(':')[0];
                      return pPhone === phone;
                  });
                  return participant ? participant.id : userJid; // Fallback all'originale se non trovato
              });

              return this.originalGroupParticipantsUpdate.call(this, chatId, correctedUsers, action);
          } catch (e) {
              console.error('[ERRORE] Errore in safeGroupParticipantsUpdate:', e);
              throw e;
          }
      };
  }
  ```

- **Cache per Metadata Gruppo**: Usa NodeCache per memorizzare metadata, normalizzando con `decodeJid`.
  
  **Esempio (da handler.js):**
  ```typescript
  global.groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });

  // In participantsUpdate o groups.update:
  metadata.participants.forEach(u => {
      const normId = this.decodeJid(u.id);
      const jid = u.jid || normId;
  });
  global.groupCache.set(update.id, metadata);
  ```

- **Normalizzazione in Print/Log**: Rimuovi `:xx` dai numeri telefono per clean display.
  
  **Esempio (da print.js):**
  ```typescript
  function formatPhoneNumber(jid, name) {
      if (!jid) return 'Sconosciuto';
      let userPart = jid.split('@')[0];
      let cleanNumber = userPart.split(':')[0]; // Rimuovi la parte :xx per ottenere il numero reale
      try {
          const number = PhoneNumber('+' + cleanNumber).getNumber('international');
          return number + (name ? ` ~${name}` : '');
      } catch {
          return (cleanNumber || '') + (name ? ` ~${name}` : '');
      }
  }
  ```

- **Problemi Comuni e Fix:**
  - **LID Mancante in Gruppi:** Usa `decodeJid` e cache metadata per trovare JID reali.
  - **Conversione JID:** Sempre applica `decodeJid` prima di `sendMessage` o query.
  - **Multi-Dispositivo:** Imposta `syncFullHistory: true` in config per sync LID.
  - **Errori in Mention/Quoted:** Normalizza con `decodeJid` in handler per quoted.sender e mentionedJid.

### Esempio Integrato in Main

```typescript
// Nel tuo file main
import makeWASocket, { getSenderLid, toJid } from '@realvare/based';
// ... (autenticazione e creazione sock)

conn.ev.on('messages.upsert', async ({ messages }) => {
  const msg = messages[0];
  if (!msg.message) return;

  const info = getSenderLid(msg);
  const senderJid = toJid(info.lid); // Fix LID -> JID

  // Esempio: Rispondi solo se JID valido
  if (senderJid.endsWith('@s.whatsapp.net')) {
    await conn.sendMessage(senderJid, { text: `Ciao da ${senderJid}!` }, { quoted: msg });
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
  await conn.sendMessage(jid, { text: 'Handler attivato!' });
}

// Nel main: conn.ev.on('messages.upsert', ({ messages }) => handleMessage(sock, messages[0]));
```

**Consiglio:** Testa in gruppi per verificare LID, poiché Baileys upstream ha migliorato il supporto nativo nel 2025, ma i fix personalizzati qui garantiscono retrocompatibilità.

---

### 🚀 Cache Intelligente LID/JID

La libreria ora include un sistema di cache avanzato per ottimizzare le conversioni LID/JID:

```typescript
import { getCacheStats, clearCache, setPerformanceConfig } from '@realvare/based';

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
import { validateJid, Logger } from '@realvare/based';

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
import { Logger, setPerformanceConfig } from '@realvare/based';

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
import { setPerformanceConfig, getPerformanceConfig } from '@realvare/based';

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

## 🧩 Eventi: LID e JID sempre disponibili (nuovo)

Gli eventi emessi includono campi ausiliari sui messaggi per accedere facilmente sia al JID sia al LID del mittente/partecipante.

```typescript
conn.ev.on('messages.upsert', ({ messages, type }) => {
  for (const msg of messages) {
    // Campi aggiuntivi su msg.key
    // - remoteJidNormalized: JID normalizzato (es. @s.whatsapp.net)
    // - remoteLid: LID equivalente del remoteJid
    // - participantLid: LID equivalente del participant (se presente)
    const jid = msg.key.remoteJidNormalized || msg.key.remoteJid;
    const remoteLid = msg.key.remoteLid;
    const participantLid = msg.key.participantLid;

    if (jid?.endsWith('@s.whatsapp.net')) {
      conn.sendMessage(jid, { text: `Ciao! LID: ${remoteLid || 'n/d'}` });
    }
  }
});
```

Questi campi eliminano ambiguità in gruppi e contesti multi-dispositivo dove alcuni eventi riportano LID, altri JID.

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
  syncFullHistory: false, // Attiva per sync completo (consuma dati)
  fireInitQueries: true,
  generateHighQualityLinkPreview: true,
});
```
<div align="center">

### 🛡️ Sicurezza e Crittografia

| Caratteristica            | Descrizione                              |
|---------------------------|------------------------------------------|
| 🔐 End-to-End Encryption | Protocollo Signal per messaggi sicuri    |
| 🔑 Key Management        | Generazione/rotazione automatica chiavi  |
| 🔍 Authentication        | Sicurezza tramite QR code o pairing code |
| 🛡️ Data Protection       | Archiviazione sicura credenziali locali  |

---

## 🌐 Supporto e Community

Unisciti alla community per aiuto e contributi.

### 📞 Contatti e Risorse

| Canale           | Link/Info                                |
|------------------|------------------------------------------|
| **Email**        | [samakavare1@gmail.com](mailto:samakavare1@gmail.com) |
| **GitHub Issues**| [Segnala Bug](https://github.com/realvare/based/issues) |
| **PayPal**       | [Dona](https://www.paypal.me/samakavare) |
| **Canale whatsapp**| [Canale](https://www.whatsapp.com/channel/0029VbB41Sa1Hsq1JhsC1Z1z) |

---

## 🙏 Ringraziamenti

Grazie ai progetti che ispirano Based:

| Progetto                  | Contributo                               |
|---------------------------|------------------------------------------|
| [Baileys](https://github.com/WhiskeySockets/Baileys) | API WhatsApp Web originale               |
| [Yupra](https://www.npmjs.com/package/@yupra/baileys) | Fix LID/JID                     |
| [Signal Protocol](https://signal.org/) | Crittografia end-to-end                  |

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
<table align="center">
  <tr>
    <td align="center">
      <img src="https://i.ibb.co/Cp0SQznC/sam2.png" width="120" height="120" alt="pfp" style="bysamakavare"/>
      <br><br>
      <h2>👨‍💻 Creato da <a href="https://github.com/realvare" style="color: #8a2be2; text-decoration: none;">realvare</a></h2>
      <p><em>sam aka vare</em></p>
    </td>
  </tr>
</table>

<br>
<p align="center">
  <a href="https://github.com/realvare/based">
    <img src="https://img.shields.io/badge/⭐_Stella_il_Progetto-8a2be2?style=for-the-badge&logo=github&logoColor=white&labelColor=2d1b69"/>
  </a>&nbsp;&nbsp;
  <a href="https://github.com/realvare/based/fork">
    <img src="https://img.shields.io/badge/🔄_Fork_Repository-8a2be2?style=for-the-badge&logo=github&logoColor=white&labelColor=2d1b69"/>
  </a>&nbsp;&nbsp;
  <a href="https://paypal.me/samakavare">
    <img src="https://img.shields.io/badge/💰_Dona-8a2be2?style=for-the-badge&logo=paypal&logoColor=white&labelColor=2d1b69"/>
  </a>
</p>
<p align="center">
  <a href="https://github.com/realvare">
    <img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white&color=8a2be2"/>
  </a>&nbsp;
  <a href="https://wa.me/393476686131">
    <img src="https://img.shields.io/badge/WhatsApp-25D366?style=for-the-badge&logo=whatsapp&logoColor=white&color=8a2be2"/>
  </a>&nbsp;
  <a href="https://instagram.com/samakavare">
    <img src="https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white&color=8a2be2"/>
  </a>&nbsp;
  <a href="mailto:samakavare1@gmail.com">
    <img src="https://img.shields.io/badge/Email-D14836?style=for-the-badge&logo=gmail&logoColor=white&color=8a2be2"/>
  </a>
</p>
<div align="center">
  <p><strong>Se ti è stato utile, lascia una stella e/o considera una donazione! ✧</strong></p>

<br>
<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=24&height=120&section=footer&text=&fontSize=30&fontColor=ffffff&animation=fadeIn&fontAlignY=35"/>

</div>
