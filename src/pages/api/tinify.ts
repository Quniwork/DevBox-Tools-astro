/**
 * Tinify API 代理
 * 用於安全地調用 TinyPNG API，避免在前端暴露 API Key
 */

import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    // 檢查 Content-Type 並解析 FormData
    const contentType = request.headers.get('content-type') || '';
    
    let apiKey: string | null = null;
    let imageFile: File | null = null;
    let action: string = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      apiKey = formData.get('apiKey') as string;
      imageFile = formData.get('image') as File;
      action = formData.get('action') as string;
    } else {
      // Fallback: 嘗試解析 JSON（雖然前端已改用 FormData）
      const body = await request.json().catch(() => ({}));
      apiKey = body.apiKey;
      action = body.action;
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API Key is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ========================================
    // Action: 驗證 API Key
    // ========================================
    if (action === 'validate') {
      const response = await fetch('https://api.tinify.com/shrink', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from('api:' + apiKey).toString('base64')
        },
        body: Buffer.from([]) // 空請求，只為獲取 header
      });

      const compressionCount = response.headers.get('Compression-Count');
      
      if (compressionCount !== null) {
        return new Response(JSON.stringify({
          success: true,
          compressionCount: parseInt(compressionCount),
          limit: 500
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ 
          error: 'Invalid API Key',
          success: false 
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // ========================================
    // Action: 壓縮圖片
    // ========================================
    if (action === 'compress' && imageFile) {
      const imageBuffer = Buffer.from(await imageFile.arrayBuffer());

      // Step 1: 上傳圖片到 Tinify
      const uploadResponse = await fetch('https://api.tinify.com/shrink', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from('api:' + apiKey).toString('base64')
        },
        body: imageBuffer
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        return new Response(JSON.stringify({ 
          error: `Tinify upload failed: ${errorText}`,
          success: false 
        }), {
          status: uploadResponse.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const compressionCount = uploadResponse.headers.get('Compression-Count');
      const result = await uploadResponse.json();

      // Step 2: 下載壓縮後的圖片
      const downloadResponse = await fetch(result.output.url);
      if (!downloadResponse.ok) {
        return new Response(JSON.stringify({ 
          error: 'Tinify download failed',
          success: false 
        }), {
          status: downloadResponse.status,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const compressedImageBuffer = await downloadResponse.arrayBuffer();

      return new Response(compressedImageBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'X-Compression-Count': compressionCount || '0'
        }
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Tinify proxy error:', error);
    return new Response(JSON.stringify({ 
      error: 'Server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
