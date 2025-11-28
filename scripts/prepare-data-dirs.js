const fs = require('fs');
const path = require('path');

const dirs = [
  'data/uploads',
  'data/outputs', 
  'data/jobs'
];

dirs.forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    console.log(`Created directory: ${dir}`);
  } else {
    console.log(`Directory already exists: ${dir}`);
  }
});

// Create .gitkeep files to preserve empty directories
dirs.forEach(dir => {
  const gitkeepPath = path.join(__dirname, '..', dir, '.gitkeep');
  if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '');
    console.log(`Created .gitkeep in: ${dir}`);
  }
});

console.log('\nData directories ready!');
