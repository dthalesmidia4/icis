import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VEO_MODEL = "veo-3.1-generate-preview";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

async function imageUrlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const contentType = resp.headers.get("content-type") || "image/png";
  return { base64, mimeType: contentType.split(";")[0].trim() };
}

async function pollOperation(operationName: string, apiKey: string, maxAttempts = 60): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 10000)); // poll every 10s
    const resp = await fetch(`${BASE_URL}/${operationName}?key=${apiKey}`);
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`Poll error (attempt ${i + 1}):`, resp.status, errText);
      continue;
    }
    const result = await resp.json();
    if (result.done) {
      return result;
    }
    console.log(`Poll attempt ${i + 1}: operation not done yet...`);
  }
  throw new Error("Video generation timed out after max polling attempts");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sceneDescription, mascotSpeech, frameUrl, clientId, tenantId, sceneIndex, aspectRatio } = await req.json();

    if (!sceneDescription || !clientId || !tenantId) {
      return new Response(JSON.stringify({ error: "sceneDescription, clientId e tenantId são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch Google AI Studio API key
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "Google AI Studio")
      .single();

    if (apiKeyError || !apiKeyData?.key_value) {
      return new Response(
        JSON.stringify({ error: "Chave 'Google AI Studio' não encontrada na tabela api_keys." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const GOOGLE_API_KEY = apiKeyData.key_value;

    // Build prompt combining scene description + mascot speech
    let prompt = sceneDescription;
    if (mascotSpeech) {
      prompt += `\n\nThe character speaks the following dialogue (in Brazilian Portuguese): "${mascotSpeech}"`;
    }

    // Build request body
    const requestBody: any = {
      instances: [{
        prompt,
      }],
      parameters: {
        aspectRatio: aspectRatio === "16:9" ? "16:9" : "9:16",
        durationSeconds: 8,
        numberOfVideos: 1,
        personGeneration: "allow_all",
      },
    };

    // If frame0 image provided, add as reference image
    if (frameUrl) {
      try {
        const { base64, mimeType } = await imageUrlToBase64(frameUrl);
        requestBody.instances[0].image = {
          bytesBase64Encoded: base64,
          mimeType,
        };
        console.log("Frame 0 image added to request, mimeType:", mimeType);
      } catch (imgErr) {
        console.error("Failed to fetch frame0 image, proceeding without it:", imgErr);
      }
    }

    console.log("Sending video generation request to Veo 3.1...");
    console.log("Prompt:", prompt.substring(0, 200));

    // Start long-running operation
    const generateResp = await fetch(
      `${BASE_URL}/models/${VEO_MODEL}:predictLongRunning?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );

    if (!generateResp.ok) {
      const errText = await generateResp.text();
      console.error("Veo API error:", generateResp.status, errText);
      
      if (generateResp.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: `Erro na API Veo: ${generateResp.status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const operationData = await generateResp.json();
    const operationName = operationData.name;

    if (!operationName) {
      console.error("No operation name returned:", JSON.stringify(operationData));
      return new Response(JSON.stringify({ error: "Resposta inesperada da API Veo" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Operation started:", operationName);

    // Poll for completion
    const result = await pollOperation(operationName, GOOGLE_API_KEY);

    if (result.error) {
      console.error("Operation failed:", JSON.stringify(result.error));
      return new Response(JSON.stringify({ error: `Erro na geração: ${result.error.message || "Falha desconhecida"}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract video from response
    const videos = result.response?.generateVideoResponse?.generatedSamples || 
                   result.response?.videos || 
                   [];

    if (!videos || videos.length === 0) {
      console.error("No videos in result:", JSON.stringify(result));
      return new Response(JSON.stringify({ error: "Nenhum vídeo gerado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const video = videos[0];
    
    // The video can come as a URI to fetch or as base64
    let videoBytes: Uint8Array;

    if (video.video?.uri) {
      // Download video from URI
      const videoResp = await fetch(`${video.video.uri}?key=${GOOGLE_API_KEY}`);
      if (!videoResp.ok) {
        // Try fetching from files API
        const fileResp = await fetch(`${BASE_URL}/files/${video.video.uri.split('/').pop()}?key=${GOOGLE_API_KEY}&alt=media`);
        if (!fileResp.ok) {
          const errText = await fileResp.text();
          console.error("Failed to download video:", errText);
          return new Response(JSON.stringify({ error: "Erro ao baixar o vídeo gerado" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        videoBytes = new Uint8Array(await fileResp.arrayBuffer());
      } else {
        videoBytes = new Uint8Array(await videoResp.arrayBuffer());
      }
    } else if (video.video?.bytesBase64Encoded || video.bytesBase64Encoded) {
      const b64 = video.video?.bytesBase64Encoded || video.bytesBase64Encoded;
      const binaryString = atob(b64);
      videoBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        videoBytes[i] = binaryString.charCodeAt(i);
      }
    } else {
      console.error("Unknown video format:", JSON.stringify(video).substring(0, 500));
      return new Response(JSON.stringify({ error: "Formato de vídeo desconhecido" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload to Supabase Storage
    const videoId = crypto.randomUUID();
    const filePath = `video-scenes/${clientId}/${videoId}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from("card-attachments")
      .upload(filePath, videoBytes, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Erro ao salvar o vídeo" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: publicUrlData } = supabase.storage
      .from("card-attachments")
      .getPublicUrl(filePath);

    console.log("Video uploaded successfully:", publicUrlData.publicUrl);

    return new Response(JSON.stringify({
      success: true,
      videoUrl: publicUrlData.publicUrl,
      sceneIndex: sceneIndex ?? 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("generate-video-scene error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
