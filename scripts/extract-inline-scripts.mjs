import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { glob } from 'glob';

const DIST_DIR = 'dist';
const SCRIPTS_DIR = path.join(DIST_DIR, 'scripts');

// 確保 scripts 目錄存在
if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

async function extractInlineScripts() {
  console.log('🔍 Scanning for inline scripts in HTML files...');
  
  // 尋找所有 HTML 檔案
  // Note: glob pattern might need adjustment based on environment, but **/*.html is standard
  const htmlFiles = await glob(`${DIST_DIR}/**/*.html`, { ignore: 'node_modules/**' });
  
  if (htmlFiles.length === 0) {
      console.log('⚠️ No HTML files found in dist/');
      // Fallback search if glob fails or user env issues
      try {
          if(fs.existsSync(path.join(DIST_DIR, 'index.html'))) htmlFiles.push(path.join(DIST_DIR, 'index.html'));
           // add other subfolders manually if needed, but glob should work
      } catch(e) {}
  }

  let totalExtracted = 0;

  for (const file of htmlFiles) {
    let content = fs.readFileSync(file, 'utf-8');
    let hasChanges = false;
    
    // Regex to capture <script> content that doesn't have a src attribute
    // Be careful with attributes order, but usually Astro puts attributes before content
    // We look for <script ...> CONTENT </script> where ... does not contain src=
    
    // A simpler approach: Find all <script> tags, parse them.
    // Since we don't have a DOM parser easily available in node script without deps, we use Regex carefully.
    // Match <script> or <script type="module"> or <script attributes...> but NOT src=
    
    const scriptRegex = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
    
    content = content.replace(scriptRegex, (match, attrs, scriptContent) => {
      if (!scriptContent || scriptContent.trim() === '') return match;
      
      // Compute hash for filename
      const hash = crypto.createHash('sha256').update(scriptContent).digest('hex').slice(0, 16);
      const scriptFilename = `extracted-${hash}.js`;
      const scriptPath = path.join(SCRIPTS_DIR, scriptFilename);
      
      // Write file
      fs.writeFileSync(scriptPath, scriptContent);
      
      console.log(`   ⚡ Extracted inline script from ${path.basename(file)} -> scripts/${scriptFilename}`);
      totalExtracted++;
      hasChanges = true;
      
      // Return replacement tag
      // Keep original attributes (like type="module")
      return `<script src="/scripts/${scriptFilename}"${attrs}></script>`;
    });
    
    if (hasChanges) {
      fs.writeFileSync(file, content);
      console.log(`   ✅ Updated ${file}`);
    }
  }
  
  console.log(`🎉 Extraction complete! Extracted ${totalExtracted} scripts.`);
}

extractInlineScripts().catch(err => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
