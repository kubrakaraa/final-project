const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || '/tmp';
const DATA_FILE = path.join(DATA_DIR, 'notes.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Veri dizinini oluştur (PVC mount noktası)
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

function readNotes() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeNotes(notes) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(notes, null, 2));
}

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Notları listele
app.get('/api/notes', (req, res) => {
  res.json(readNotes());
});

// Not ekle
app.post('/api/notes', (req, res) => {
  const notes = readNotes();
  const newNote = {
    id: Date.now(),
    text: req.body.text,
    createdAt: new Date().toISOString()
  };
  notes.push(newNote);
  writeNotes(notes);
  res.status(201).json(newNote);
});

// Not sil
app.delete('/api/notes/:id', (req, res) => {
  let notes = readNotes();
  notes = notes.filter(n => n.id !== parseInt(req.params.id));
  writeNotes(notes);
  res.json({ success: true });
});

// Sağlık kontrolü (Kubernetes liveness/readiness probe)
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    hostname: require('os').hostname(),
    version: process.env.APP_VERSION || 'v1',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`Uygulama ${PORT} portunda çalışıyor`);
});
