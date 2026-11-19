// server.js
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// public ফোল্ডার সার্ভ করা, dotfiles বন্ধ
app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  index: 'index.html'
}));

app.listen(PORT, () => {
  console.log(`Ludu server running at http://localhost:${PORT}`);
});
