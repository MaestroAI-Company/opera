use half::f16;
use ort::{
    session::{Session, SessionInputValue, SessionOutputs},
    value::TensorElementType,
    value::{DynValue, Tensor},
};
use rustfft::{num_complex::Complex, FftPlanner};
use serde_json::Value as Json;
use std::{collections::HashMap, path::Path};

const SAMPLE_RATE: usize = 16000;
const N_FFT: usize = 400;
const HOP: usize = 160;
const N_SAMPLES: usize = 30 * SAMPLE_RATE;
const N_FRAMES: usize = N_SAMPLES / HOP;
//room left for the prompt tokens
const MAX_NEW_TOKENS: usize = 220;

pub type Result<T> = std::result::Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

struct Tokens {
    sot: i64,
    eot: i64,
    transcribe: i64,
    no_timestamps: i64,
    languages: HashMap<String, i64>,
    suppress: Vec<usize>,
    begin_suppress: Vec<usize>,
}

pub struct Whisper {
    encoder: Session,
    decoder: Session,
    tokens: Tokens,
    vocab: Vec<Vec<u8>>,
    filters: Vec<f32>,
    n_mels: usize,
    layers: usize,
    heads: usize,
    head_dim: usize,
}

fn read_json(path: &Path) -> Result<Json> {
    serde_json::from_slice(&std::fs::read(path).map_err(err)?).map_err(err)
}

fn ids(value: &Json) -> Vec<usize> {
    value.as_array().map(|a| a.iter().filter_map(|v| v.as_u64()).map(|v| v as usize).collect()).unwrap_or_default()
}

//gpt2 byte level alphabet back to bytes
fn byte_decoder() -> HashMap<char, u8> {
    let mut bytes: Vec<u32> = (b'!' as u32..=b'~' as u32).chain(0xA1..=0xAC).chain(0xAE..=0xFF).collect();
    let mut chars = bytes.clone();
    let mut n = 0;
    for b in 0..256u32 {
        if !bytes.contains(&b) {
            bytes.push(b);
            chars.push(256 + n);
            n += 1;
        }
    }
    bytes.into_iter().zip(chars).map(|(b, c)| (char::from_u32(c).unwrap(), b as u8)).collect()
}

//slaney mel filterbank like librosa
fn mel_filters(n_mels: usize) -> Vec<f32> {
    let to_mel = |f: f64| if f < 1000.0 { 3.0 * f / 200.0 } else { 15.0 + 27.0 * (f / 1000.0).ln() / 6.4f64.ln() };
    let to_hz = |m: f64| if m < 15.0 { 200.0 * m / 3.0 } else { 1000.0 * (6.4f64.ln() * (m - 15.0) / 27.0).exp() };
    let bins = N_FFT / 2 + 1;
    let top = to_mel(SAMPLE_RATE as f64 / 2.0);
    let hz: Vec<f64> = (0..n_mels + 2).map(|i| to_hz(top * i as f64 / (n_mels + 1) as f64)).collect();
    let mut filters = vec![0f32; n_mels * bins];
    for m in 0..n_mels {
        let norm = 2.0 / (hz[m + 2] - hz[m]);
        for k in 0..bins {
            let f = k as f64 * SAMPLE_RATE as f64 / N_FFT as f64;
            let lower = (f - hz[m]) / (hz[m + 1] - hz[m]);
            let upper = (hz[m + 2] - f) / (hz[m + 2] - hz[m + 1]);
            filters[m * bins + k] = (lower.min(upper).max(0.0) * norm) as f32;
        }
    }
    filters
}

impl Whisper {
    pub fn load(dir: &Path, encoder: Session, decoder: Session) -> Result<Self> {
        let config = read_json(&dir.join("config.json"))?;
        let generation = read_json(&dir.join("generation_config.json"))?;
        let tokenizer = read_json(&dir.join("tokenizer.json"))?;

        let get = |key: &str| config[key].as_u64().map(|v| v as usize).ok_or(format!("config misses {key}"));
        let n_mels = get("num_mel_bins")?;
        let heads = get("decoder_attention_heads")?;

        let byte_of = byte_decoder();
        let mut vocab = vec![Vec::new(); get("vocab_size")?];
        let mut special = HashMap::new();
        for (token, id) in tokenizer["model"]["vocab"].as_object().ok_or("tokenizer has no vocab")? {
            if let Some(slot) = id.as_u64().and_then(|id| vocab.get_mut(id as usize)) {
                *slot = token.chars().filter_map(|c| byte_of.get(&c).copied()).collect();
            }
        }
        for added in tokenizer["added_tokens"].as_array().ok_or("tokenizer has no added tokens")? {
            if let (Some(content), Some(id)) = (added["content"].as_str(), added["id"].as_i64()) {
                special.insert(content.to_string(), id);
            }
        }
        let find = |name: &str| special.get(name).copied().ok_or(format!("tokenizer misses {name}"));
        //language tokens look like <|fr|>
        let languages = special
            .iter()
            .filter_map(|(k, &id)| {
                let code = k.strip_prefix("<|")?.strip_suffix("|>")?;
                (code.len() <= 3 && code.chars().all(|c| c.is_ascii_lowercase())).then(|| (code.to_string(), id))
            })
            .collect();

        Ok(Self {
            tokens: Tokens {
                sot: find("<|startoftranscript|>")?,
                eot: find("<|endoftext|>")?,
                transcribe: find("<|transcribe|>")?,
                no_timestamps: find("<|notimestamps|>")?,
                languages,
                suppress: ids(&generation["suppress_tokens"]),
                begin_suppress: ids(&generation["begin_suppress_tokens"]),
            },
            vocab,
            filters: mel_filters(n_mels),
            n_mels,
            layers: get("decoder_layers")?,
            heads,
            head_dim: get("d_model")? / heads,
            encoder,
            decoder,
        })
    }

    //log mel spectrogram over 30 s
    fn features(&self, pcm: &[f32]) -> Vec<f32> {
        let mut audio = pcm[..pcm.len().min(N_SAMPLES)].to_vec();
        audio.resize(N_SAMPLES, 0.0);
        let half = N_FFT / 2;
        //centered frames use reflect padding
        let at = |i: isize| {
            let n = N_SAMPLES as isize;
            let j = if i < 0 { -i } else if i >= n { 2 * (n - 1) - i } else { i };
            audio[j as usize]
        };
        let window: Vec<f32> = (0..N_FFT).map(|n| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * n as f32 / N_FFT as f32).cos()).collect();
        let fft = FftPlanner::new().plan_fft_forward(N_FFT);
        let bins = half + 1;
        let mut mel = vec![0f32; self.n_mels * N_FRAMES];
        let mut buffer = vec![Complex::new(0f32, 0f32); N_FFT];
        let mut power = vec![0f32; bins];
        for t in 0..N_FRAMES {
            let start = (t * HOP) as isize - half as isize;
            for (n, slot) in buffer.iter_mut().enumerate() {
                *slot = Complex::new(at(start + n as isize) * window[n], 0.0);
            }
            fft.process(&mut buffer);
            for (k, p) in power.iter_mut().enumerate() {
                *p = buffer[k].norm_sqr();
            }
            for m in 0..self.n_mels {
                let row = &self.filters[m * bins..(m + 1) * bins];
                let energy: f32 = row.iter().zip(&power).map(|(w, p)| w * p).sum();
                mel[m * N_FRAMES + t] = energy.max(1e-10).log10();
            }
        }
        let peak = mel.iter().copied().fold(f32::MIN, f32::max);
        for v in mel.iter_mut() {
            *v = (v.max(peak - 8.0) + 4.0) / 4.0;
        }
        mel
    }

    fn float_tensor(ty: Option<TensorElementType>, shape: Vec<usize>, data: Vec<f32>) -> Result<DynValue> {
        Ok(match ty {
            Some(TensorElementType::Float16) => Tensor::from_array((shape, data.into_iter().map(f16::from_f32).collect::<Vec<_>>())).map_err(err)?.into_dyn(),
            _ => Tensor::from_array((shape, data)).map_err(err)?.into_dyn(),
        })
    }

    fn input_type(session: &Session, name: &str) -> Option<TensorElementType> {
        session.inputs().iter().find(|i| i.name() == name).and_then(|i| i.dtype().tensor_type())
    }

    //last position logits as f32
    fn last_logits(outputs: &SessionOutputs) -> Result<Vec<f32>> {
        let logits = &outputs["logits"];
        let (shape, values) = match logits.dtype().tensor_type() {
            Some(TensorElementType::Float16) => {
                let (shape, data) = logits.try_extract_tensor::<f16>().map_err(err)?;
                (shape.to_vec(), data.iter().map(|v| v.to_f32()).collect::<Vec<_>>())
            }
            _ => {
                let (shape, data) = logits.try_extract_tensor::<f32>().map_err(err)?;
                (shape.to_vec(), data.to_vec())
            }
        };
        let vocab = *shape.last().ok_or("logits have no shape")? as usize;
        Ok(values[values.len() - vocab..].to_vec())
    }

    fn step(&mut self, ids: &[i64], hidden: &DynValue, past: Option<(&[DynValue], &[DynValue])>) -> Result<(Vec<f32>, Vec<DynValue>, Vec<DynValue>)> {
        let past_type = Self::input_type(&self.decoder, "past_key_values.0.decoder.key");
        let mut inputs: Vec<(String, SessionInputValue)> = vec![
            ("input_ids".into(), Tensor::from_array(([1usize, ids.len()], ids.to_vec())).map_err(err)?.into_dyn().into()),
            ("use_cache_branch".into(), Tensor::from_array(([1usize], vec![past.is_some()])).map_err(err)?.into_dyn().into()),
            ("encoder_hidden_states".into(), hidden.into()),
        ];
        for layer in 0..self.layers {
            for (i, kind) in ["decoder.key", "decoder.value", "encoder.key", "encoder.value"].iter().enumerate() {
                let value: SessionInputValue = match past {
                    Some((decoder, _)) if i < 2 => (&decoder[layer * 2 + i]).into(),
                    Some((_, encoder)) => (&encoder[layer * 2 + i - 2]).into(),
                    //first step starts from an empty cache
                    None => Self::float_tensor(past_type, vec![1, self.heads, 0, self.head_dim], Vec::new())?.into(),
                };
                inputs.push((format!("past_key_values.{layer}.{kind}"), value));
            }
        }
        let layers = self.layers;
        let mut outputs = self.decoder.run(inputs).map_err(err)?;
        let logits = Self::last_logits(&outputs)?;
        let mut take = |kind: &str| -> Result<Vec<DynValue>> {
            (0..layers)
                .flat_map(|l| ["key", "value"].map(|kv| format!("present.{l}.{kind}.{kv}")))
                .map(|name| outputs.remove(&name).ok_or(format!("decoder misses {name}")))
                .collect()
        };
        let decoder = take("decoder")?;
        let encoder = if past.is_none() { take("encoder")? } else { Vec::new() };
        Ok((logits, decoder, encoder))
    }

    fn pick(&self, logits: &mut [f32], first: bool) -> i64 {
        for &id in self.tokens.suppress.iter().chain(if first { &self.tokens.begin_suppress[..] } else { &[] }) {
            if let Some(v) = logits.get_mut(id) {
                *v = f32::NEG_INFINITY;
            }
        }
        //plain text has no special tokens
        let eot = self.tokens.eot as usize;
        logits.iter_mut().skip(eot + 1).for_each(|v| *v = f32::NEG_INFINITY);
        logits.iter().enumerate().fold((0, f32::NEG_INFINITY), |best, (i, &v)| if v > best.1 { (i, v) } else { best }).0 as i64
    }

    //language none means detect it
    pub fn transcribe(&mut self, pcm: &[f32], language: Option<&str>) -> Result<String> {
        let input_type = Self::input_type(&self.encoder, "input_features");
        let features = Self::float_tensor(input_type, vec![1, self.n_mels, N_FRAMES], self.features(pcm))?;
        let hidden = {
            let mut outputs = self.encoder.run(ort::inputs!["input_features" => features]).map_err(err)?;
            outputs.remove("last_hidden_state").ok_or("encoder misses last_hidden_state")?
        };

        let language = match language.and_then(|l| self.tokens.languages.get(l).copied()) {
            Some(id) => id,
            None => {
                let (logits, _, _) = self.step(&[self.tokens.sot], &hidden, None)?;
                let mut best = (self.tokens.languages.values().next().copied().unwrap_or(0), f32::NEG_INFINITY);
                for &id in self.tokens.languages.values() {
                    if logits[id as usize] > best.1 {
                        best = (id, logits[id as usize]);
                    }
                }
                best.0
            }
        };

        let prompt = [self.tokens.sot, language, self.tokens.transcribe, self.tokens.no_timestamps];
        let (mut logits, mut decoder, encoder) = self.step(&prompt, &hidden, None)?;
        let mut text = Vec::new();
        for i in 0..MAX_NEW_TOKENS {
            let next = self.pick(&mut logits, i == 0);
            if next == self.tokens.eot {
                break;
            }
            text.extend_from_slice(&self.vocab[next as usize]);
            let (l, d, _) = self.step(&[next], &hidden, Some((&decoder, &encoder)))?;
            logits = l;
            decoder = d;
        }
        Ok(String::from_utf8_lossy(&text).trim().to_string())
    }
}
