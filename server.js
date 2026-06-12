import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT || 8787);

const HAIKU_MODEL = process.env.HAIKU_MODEL || 'claude-haiku-4.5-20251001';
const OPENAI_PARAPHRASE_MODEL = process.env.OPENAI_PARAPHRASE_MODEL || 'gpt-5.1';

app.use(express.json({ limit: '1mb' }));

function extractNumericTokens(text) {
  const matches = text.match(/[$£€¥]?\d[\d,]*(\.\d+)?[$£€¥%]?/g) ?? [];
  return [...new Set(matches)];
}

function numericHint(text) {
  const tokens = extractNumericTokens(text);
  if (!tokens.length) return '';
  return ` CRITICAL: Preserve ALL numbers EXACTLY as-is; never convert to words. Numbers present: ${tokens.slice(0, 15).join(', ')}.`;
}

function parseAnthropicText(payload) {
  const text = payload?.content?.find(part => part.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}

function parseOpenAIOutput(payload) {
  const outputText = payload?.output_text
    ?? payload?.output?.flatMap(item => item.content ?? [])
      ?.find(part => part.type === 'output_text')?.text
    ?? '{}';
  return JSON.parse(outputText);
}

app.post('/api/analyze', async (req, res) => {
  const text = String(req.body?.text ?? '');
  if (text.trim().length < 5) {
    return res.status(400).json({ error: 'Text must be at least 5 characters.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 600,
        system: `You are a fast live writing analyst. Return only JSON with issues, score, tone, formality, and insights. Keep feedback brief and avoid rewriting the whole text.${numericHint(text)}`,
        messages: [{
          role: 'user',
          content: `Analyze this text for basic grammar, tone, clarity, and writing quality. Return JSON:
{
  "issues": [{"orig":"exact text span","fix":"replacement","cat":"spelling|grammar|punctuation|style","msg":"short reason"}],
  "score": 0-100,
  "tone": "short tone label",
  "formality": 0-100,
  "insights": [{"type":"tone|clarity|grammar|style","message":"short observation","suggestion":"short suggestion"}]
}
Text: ${text}`,
        }],
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(response.status).json({ error: 'Haiku analysis failed.', details });
    }

    return res.json(parseAnthropicText(await response.json()));
  } catch (error) {
    console.error('Haiku analysis error:', error);
    return res.status(500).json({ error: 'Haiku analysis failed.' });
  }
});

app.post('/api/paraphrase', async (req, res) => {
  const text = String(req.body?.text ?? '');
  const style = String(req.body?.style ?? 'standard');
  const tone = String(req.body?.tone ?? style);

  if (text.trim().length < 5) {
    return res.status(400).json({ error: 'Text must be at least 5 characters.' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY is not configured.' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_PARAPHRASE_MODEL,
        input: [
          {
            role: 'developer',
            content: `You paraphrase text while preserving meaning, facts, names, numbers, and formatting intent.${numericHint(text)} Return only JSON.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              text,
              style,
              tone,
              output: { paraphrasedText: 'string' },
            }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'paraphrase_result',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                paraphrasedText: { type: 'string' },
              },
              required: ['paraphrasedText'],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(response.status).json({ error: 'OpenAI paraphrase failed.', details });
    }

    return res.json(parseOpenAIOutput(await response.json()));
  } catch (error) {
    console.error('OpenAI paraphrase error:', error);
    return res.status(500).json({ error: 'OpenAI paraphrase failed.' });
  }
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`WriteRight AI server running on http://localhost:${port}`);
});
