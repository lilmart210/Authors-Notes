// The models offered in Tools → AI models. An EXAMPLE list (open 2024-era models,
// 4-bit Q4_K_M GGUF files from Hugging Face) until the author curates the real one.
// Sizes and SHA-256 hashes are Hugging Face's own; the download is checked against them.

export const AI_TAGS = {
  tools: ['Tool calling', 'Can add World entries, fill data banks and act on the project'],
  long: ['Long context', 'Reads long chapters and big chunks of the bible at once'],
  fast: ['Instant', 'Small enough to suggest text while you type'],
  cpu: ['Runs on CPU', 'Works without a graphics card'],
  gpu: ['Needs a GPU', 'Too slow without a graphics card with enough memory'],
}

export const AI_TASKS = [
  ['complete', 'Autocomplete', 'Finishes the sentence you are typing'],
  ['assist', 'Assistant', 'Chat, generate, and act on the project'],
]

export const AI_MODELS = [
  { id: 'qwen25-05', name: 'Qwen2.5 0.5B Instruct', tags: ['fast', 'cpu'], about: 'Finishes sentences as you type; too small for planning or tools',
    repo: 'bartowski/Qwen2.5-0.5B-Instruct-GGUF', file: 'Qwen2.5-0.5B-Instruct-Q4_K_M.gguf', bytes: 397808192, sha256: '6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653' },
  { id: 'llama32-1', name: 'Llama 3.2 1B Instruct', tags: ['fast', 'long', 'cpu'], about: 'Quick suggestions and short lists',
    repo: 'bartowski/Llama-3.2-1B-Instruct-GGUF', file: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf', bytes: 807694464, sha256: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83' },
  { id: 'qwen25-15', name: 'Qwen2.5 1.5B Instruct', tags: ['fast', 'cpu'], about: 'Autocomplete and name lists',
    repo: 'bartowski/Qwen2.5-1.5B-Instruct-GGUF', file: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf', bytes: 986048768, sha256: '1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370' },
  { id: 'smollm2-17', name: 'SmolLM2 1.7B Instruct', tags: ['fast', 'cpu'], about: 'Lightweight autocomplete',
    repo: 'bartowski/SmolLM2-1.7B-Instruct-GGUF', file: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf', bytes: 1055609824, sha256: '77665ea4815999596525c636fbeb56ba8b080b46ae85efef4f0d986a139834d7' },
  { id: 'gemma2-2', name: 'Gemma 2 2B Instruct', tags: ['cpu'], about: 'Natural prose for short rewrites',
    repo: 'bartowski/gemma-2-2b-it-GGUF', file: 'gemma-2-2b-it-Q4_K_M.gguf', bytes: 1708582752, sha256: 'e0aee85060f168f0f2d8473d7ea41ce2f3230c1bc1374847505ea599288a7787' },
  { id: 'qwen25-3', name: 'Qwen2.5 3B Instruct', tags: ['tools', 'cpu'], about: 'Smallest model that can reliably add World entries',
    repo: 'bartowski/Qwen2.5-3B-Instruct-GGUF', file: 'Qwen2.5-3B-Instruct-Q4_K_M.gguf', bytes: 1929903264, sha256: '9c9f56a391a3abbd5b89d0245bf6106081bcc3173119d4229235dd9d23253f94' },
  { id: 'llama32-3', name: 'Llama 3.2 3B Instruct', tags: ['tools', 'long', 'cpu'], about: 'Good all-rounder for laptops',
    repo: 'bartowski/Llama-3.2-3B-Instruct-GGUF', file: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf', bytes: 2019377696, sha256: '6c1a2b41161032677be168d354123594c0e6e67d2b9227c84f296ad037c728ff' },
  { id: 'phi35-mini', name: 'Phi-3.5 Mini Instruct', tags: ['long', 'cpu'], about: 'Summaries and reading long chapters',
    repo: 'bartowski/Phi-3.5-mini-instruct-GGUF', file: 'Phi-3.5-mini-instruct-Q4_K_M.gguf', bytes: 2393232672, sha256: 'e4165e3a71af97f1b4820da61079826d8752a2088e313af0c7d346796c38eff5' },
  { id: 'mistral-7', name: 'Mistral 7B Instruct v0.3', tags: ['tools'], about: 'Solid rewrites and dialogue',
    repo: 'bartowski/Mistral-7B-Instruct-v0.3-GGUF', file: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf', bytes: 4372812000, sha256: '1270d22c0fbb3d092fb725d4d96c457b7b687a5f5a715abe1e818da303e562b6' },
  { id: 'qwen25-7', name: 'Qwen2.5 7B Instruct', tags: ['tools'], about: 'Strong assistant: generate banks, organise characters',
    repo: 'bartowski/Qwen2.5-7B-Instruct-GGUF', file: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf', bytes: 4683074240, sha256: '65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423' },
  { id: 'llama31-8', name: 'Llama 3.1 8B Instruct', tags: ['tools', 'long'], about: 'Assistant that can read a whole arc of chapters',
    repo: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF', file: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf', bytes: 4920739232, sha256: '7b064f5842bf9532c91456deda288a1b672397a54fa729aa665952863033557c' },
  { id: 'gemma2-9', name: 'Gemma 2 9B Instruct', tags: [], about: 'Best prose quality at this size; no tool calling',
    repo: 'bartowski/gemma-2-9b-it-GGUF', file: 'gemma-2-9b-it-Q4_K_M.gguf', bytes: 5761057728, sha256: '13b2a7b4115bbd0900162edcebe476da1ba1fc24e718e8b40d32f6e300f56dfe' },
  { id: 'nemo-12', name: 'Mistral Nemo 12B Instruct', tags: ['tools', 'long', 'gpu'], about: 'Long-form planning and rewrites',
    repo: 'bartowski/Mistral-Nemo-Instruct-2407-GGUF', file: 'Mistral-Nemo-Instruct-2407-Q4_K_M.gguf', bytes: 7477208192, sha256: '7c1a10d202d8788dbe5628dc962254d10654c853cae6aaeca0618f05490d4a46' },
  { id: 'qwen25-14', name: 'Qwen2.5 14B Instruct', tags: ['tools', 'gpu'], about: 'High-quality assistant for big worldbuilding jobs',
    repo: 'bartowski/Qwen2.5-14B-Instruct-GGUF', file: 'Qwen2.5-14B-Instruct-Q4_K_M.gguf', bytes: 8988110976, sha256: 'e47ad95dad6ff848b431053b375adb5d39321290ea2c638682577dafca87c008' },
  { id: 'gemma2-27', name: 'Gemma 2 27B Instruct', tags: ['gpu'], about: 'Top prose quality; needs a big GPU',
    repo: 'bartowski/gemma-2-27b-it-GGUF', file: 'gemma-2-27b-it-Q4_K_M.gguf', bytes: 16645381632, sha256: '503a87ab47c9e7fb27545ec8592b4dc4493538bd47b397ceb3197e10a0370d23' },
  { id: 'qwen25-32', name: 'Qwen2.5 32B Instruct', tags: ['tools', 'gpu'], about: 'Strongest assistant here; needs a big GPU',
    repo: 'bartowski/Qwen2.5-32B-Instruct-GGUF', file: 'Qwen2.5-32B-Instruct-Q4_K_M.gguf', bytes: 19851336576, sha256: '2e5f6daea180dbc59f65a40641e94d3973b5dbaa32b3c0acf54647fa874e519e' },
].map((model) => ({ ...model, url: `https://huggingface.co/${model.repo}/resolve/main/${model.file}`, gb: Math.round(model.bytes / 1e8) / 10 }))

export const modelForFile = (file) => AI_MODELS.find((model) => model.file === file) || null
export const modelForId = (id) => AI_MODELS.find((model) => model.id === id) || null
