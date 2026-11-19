// server.js (নতুন, সংক্ষিপ্ত)
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  index: 'index.html'
}));

app.listen(PORT, () => {
  console.log(`Ludu running at http://localhost:${PORT}`);
});
