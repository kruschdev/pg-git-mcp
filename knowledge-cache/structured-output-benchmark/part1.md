---
license: mit
language:
  - en
pretty_name: Structured Output Benchmark (SOB)
task_categories:
  - question-answering
  - text-generation
tags:
  - structured-output
  - json-schema
  - benchmark
  - multi-source
  - extraction
  - evaluation
  - llm
  - hotpotqa
  - ocr
  - meeting-transcripts
size_categories:
  - 10K<n<100K
configs:
  - config_name: default
    default: true
    data_files:
      - split: train
        path: data/train-*
      - split: validation
        path: data/validation-*
      - split: test
        path: data/test-*

  - config_name: image
    data_files:
      - split: train
        path: image/train-*

  - config_name: audio
    data_files:
      - split: train
        path: audio/train-*
---

<div align="center">
  <h1>The Structured Output Benchmark (SOB)</h1>
  <h3>A multi-source benchmark for evaluating structured-output quality in LLMs.</h3>
</div>

<p align="center">
  <a href="https://github.com/JigsawStack/sob">💻 Code</a> ·
  <a href="https://interfaze.ai/sob_paper.pdf">📄 Paper</a> ·
  <a href="https://interfaze.ai/blog/introducing-structured-output-benchmark">✍️ Blog</a> ·
  <a href="https://huggingface.co/spaces/interfaze-ai/sob-leaderboard">🏆 Leaderboard</a> ·
  <a href="https://interfaze.ai/leaderboards/structured-output-benchmark">🏆 Interfaze Leaderboard</a> ·
  <a href="https://interfaze.ai"> interfaze-ai</a>
</p>

## Dataset summary

SOB evaluates how accurately LLMs produce **schema-compliant and value-correct JSON** from unstructured or semi-structured context — across **three source modalities**:

| Config    | Source                  | Context delivered as         |   Records |
| --------- | ----------------------- | ---------------------------- | --------: |
| `default` | HotpotQA (multi-hop QA) | Wikipedia paragraphs         |    24,665 |
| `image`   | olmOCR-bench (PDFs)     | OCR-extracted markdown       |       209 |
| `audio`   | AMI Meeting Corpus      | speaker-labelled transcripts |       115 |

All three modalities are **text-normalized** — the model always receives text. This is deliberate: it isolates *structured-output capability* from raw vision / ASR processing quality, so model rankings reflect the thing we're measuring (paper §3, "Input representation").

Most existing benchmarks stop at *schema compliance* ("is the JSON valid?"). Production systems need more: they need the values inside the JSON to be correct. SOB measures exactly that, and exposes how much accuracy shifts when you change the source modality — not the model.

**Headline (paper Tables 2–4).** Best Value Accuracy (exact leaf-value match) drops sharply across modalities:

| Modality | Records | Best Value Accuracy | Best model         |
| -------- | ------: | :-----------------: | ------------------ |
| Text     |   5,000 |       **0.830**     | GLM-4.7            |
| Image    |     209 |       **0.672**     | Gemma-4-31B        |
| Audio    |     115 |       **0.237**     | Gemini-2.5-Flash   |

JSON Pass Rate stays ≥ 0.80 almost everywhere. Schema compliance is **not** the bottleneck; grounded value extraction is.

## Example usage

```python
from datasets import load_dataset

# default = text (HotpotQA-derived)
text_train = load_dataset("interfaze-ai/sob", "default", split="train")        # 17,699
text_val   = load_dataset("interfaze-ai/sob", "default", split="validation")   #  1,966
text_test  = load_dataset("interfaze-ai/sob", "default", split="test")         #  5,000  (paper's text leaderboard)

image_train = load_dataset("interfaze-ai/sob", "image", split="train")          #    209
audio_train = load_dataset("interfaze-ai/sob", "audio", split="train")          #    115
```

The paper's leaderboard is computed on **`default/test` (5,000) + `image/train` (209) + `audio/train` (115)** — 5,324 records total.

## Dataset structure

### A single record

Every record (across all three configs) shares a common shape, with a small per-modality metadata tail:

```jsonc
{
  "record_id":         "<sha256>",
  "context":           "...",      // text / OCR markdown / meeting transcript
  "question":          "...",
  "json_schema":       { ... },    // the target JSON Schema (the model must conform to this)
  "ground_truth":      { ... },    // human-verified, validates against json_schema
  "validated_output":  { ... },    // ground_truth after schema-alignment (auto-fit minItems/maxItems/enum) — the object the scorer compares against
  "candidate_response": null,      // placeholder for model output (null in the published data)
  "schema_complexity": "medium | hard",
  "pipeline_version":  "0.1.1",

  // modality-specific metadata:
  // default (text):  question_type, question_difficulty, source_id, source_dataset, source_answer
  // image:           source_pdf, source_category, test_types, num_test_cases, pdf_path
  // audio:           meeting_id, num_speakers, num_utterances, duration_sec
}
```

### Splits

| Config    | Split        | Records | Hard schemas |
| --------- | ------------ | ------: | -----------: |
| `default` | `train`      |  17,699 |        61.0% |
| `default` | `validation` |   1,966 |        60.4% |
| `default` | `test`       |   5,000 |        61.1% |
| `image`   | `train`      |     209 |        88.0% |
| `audio`   | `train`      |     115 |        98.3% |

Schema complexity is **medium** (nested objects or arrays of scalars, depth 2) or **hard** (arrays of objects, or depth ≥ 3). The skew toward `hard` reflects realistic extraction workloads (paper §3).

### Image source — per-category distribution

The 209 image records cover seven olmOCR-bench document categories (paper Table 6):

| Category         | Records |
| ---------------- | ------: |
| Headers/Footers  |      67 |
| Multi-Column     |      62 |
| Tables           |      33 |
| Old Scans        |      23 |
| Long/Tiny Text   |      11 |
| ArXiv Math       |      10 |
| Old Scans Math   |       3 |
| **Total**        | **209** |

### Context-length profile (paper Table 7)

| Modality | Avg. context (tokens) | Median schema properties |
| -------- | --------------------: | -----------------------: |
| Text     |                   919 |                        4 |
| Image    |                   527 |                        5 |
| Audio    |                 7,373 |                        5 |

## Licensing

- Dataset released under **MIT License** (see `LICENSE` in the code repo).

## Citation

```bibtex
@inproceedings{singh2026sob,
  title     = {The Structured Output Benchmark: A Multi-Source Benchmark for Evaluating Structured Output Quality in Large Language Models},
  author    = {Singh, Abhinav Kumar and Khurdula, Harsha Vardhan and Khemlani, Yoeven D and Agarwal, Vineet},
  booktitle = {NeurIPS 2026 Evaluations and Datasets Track},
  year      = {2026},
  publisher = {JigsawStack, Inc.}
}
```

## Acknowledgments

We thank the HotpotQA team, the AMI Meeting Corpus team, and the Allen AI olmOCR team for the olmOCR-bench document benchmark, for making their datasets publicly available.

## Contact

Open an issue on [GitHub](https://github.com/jigsawstack/sob) or reach the authors at `{abhinav, harsha, yoeven, vineet}@interfaze.ai`.

