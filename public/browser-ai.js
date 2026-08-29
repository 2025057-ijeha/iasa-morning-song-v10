
(() => {
  let modelPromise = null;

  function getModel() {
    if (!window.tf || !window.toxicity) {
      throw new Error("AI_LIBRARY_NOT_LOADED");
    }
    if (!modelPromise) {
      // 0.82: 학교 방송용으로 다소 보수적인 기준
      modelPromise = window.toxicity.load(0.82);
    }
    return modelPromise;
  }

  function chunkText(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) return [];
    const pieces = clean.split(/(?<=[.!?。！？])\s+|\n+/).filter(Boolean);
    const chunks = [];
    let cur = "";
    for (const p of pieces) {
      if ((cur + " " + p).length <= 360) {
        cur = (cur + " " + p).trim();
      } else {
        if (cur) chunks.push(cur);
        cur = p.slice(0, 360);
      }
      if (chunks.length >= 60) break;
    }
    if (cur && chunks.length < 60) chunks.push(cur);
    return chunks.length ? chunks : [clean.slice(0, 360)];
  }

  async function analyze(text, onProgress) {
    const chunks = chunkText(text);
    if (!chunks.length) {
      return { ok:false, reason:"분석할 자막/가사가 없습니다.", labels:[] };
    }

    onProgress?.("model");
    const model = await getModel();

    const dangerLabels = new Set([
      "toxicity",
      "severe_toxicity",
      "identity_attack",
      "insult",
      "obscene",
      "sexual_explicit",
      "threat"
    ]);

    const hits = [];
    const batchSize = 10;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      onProgress?.("classify", Math.min(1, (i + batch.length) / chunks.length));

      const predictions = await model.classify(batch);
      for (const pred of predictions) {
        if (!dangerLabels.has(pred.label)) continue;
        pred.results.forEach((r, idx) => {
          if (r.match) {
            hits.push({
              label: pred.label,
              score: Number(r.probabilities?.[1] || 0),
              sample: batch[idx]?.slice(0, 90) || ""
            });
          }
        });
      }

      if (hits.length >= 3) break;
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (hits.length) {
      const labels = [...new Set(hits.map(x => x.label))];
      return {
        ok:false,
        labels,
        reason:"무료 AI가 욕설·선정성·모욕·위협 등 학교 방송에 부적절할 가능성이 있는 표현을 감지했습니다."
      };
    }

    return {
      ok:true,
      labels:[],
      reason:"YouTube 자막과 무료 브라우저 AI 안전 검사를 통과했습니다."
    };
  }

  window.IASABrowserAI = { analyze, getModel };
})();
